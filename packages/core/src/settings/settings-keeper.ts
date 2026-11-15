import type { SettingsStore } from "../ports/settings-store.ts";
import { FUTURE_VERSION_ERROR, loadSettings, validateSettings } from "./settings.ts";
import type { Settings, SettingsIssue } from "./settings.ts";

export type SettingsSnapshot =
  // État initial : aucune lecture commencée.
  | { readonly status: "idle" }
  | { readonly status: "loading" }
  // `error` : la phrase française ; `detail` : le détail technique, à afficher à part. `retryable` : false
  // pour des réglages d'une version plus récente.
  | {
      readonly status: "load-error";
      readonly error: string;
      readonly detail: string | null;
      readonly retryable: boolean;
    }
  | {
      readonly status: "ready";
      readonly settings: Settings;
      readonly save:
        "idle" | "saving" | "saved" | { readonly failed: string; readonly retrying: boolean };
    };

export interface SettingsKeeper {
  // Même objet tant que rien ne change (useSyncExternalStore).
  snapshot(): SettingsSnapshot;
  subscribe(listener: () => void): () => void;
  // Lance la lecture depuis « idle », ou depuis « load-error » si retryable ; ne fait rien sinon.
  load(): void;
  apply(
    change: (settings: Settings) => Settings,
  ): { ok: true } | { ok: false; issues: SettingsIssue[] };
  // Remet en file une écriture du document courant.
  retrySave(): void;
}

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "erreur inconnue";
}

// Propriétaire unique du document de réglages, créé une fois pour toute l'app. Il garde en mémoire le document
// voulu, écrit dans l'ordre (une écriture à la fois, chacune avec le document courant à son démarrage) et ne relit
// jamais après un échec.
export function createSettingsKeeper(store: SettingsStore): SettingsKeeper {
  let current: SettingsSnapshot = deepFreeze({ status: "idle" });
  const listeners = new Set<() => void>();
  let queue: Promise<void> = Promise.resolve();
  let pendingWrites = 0;

  function publish(next: SettingsSnapshot): void {
    current = deepFreeze(next);
    for (const listener of [...listeners]) {
      // Un abonné qui lève une erreur n'empêche ni les autres abonnés ni la suite : la file d'écriture et la
      // lecture ne dépendent jamais d'un abonné. L'erreur est ignorée volontairement : `core` n'a pas de `console`,
      // et la relancer hors de la pile (`queueMicrotask`) ferait échouer Vitest sur les tests qui la provoquent
      // exprès.
      try {
        listener();
      } catch {
        continue;
      }
    }
  }

  function setSave(save: Extract<SettingsSnapshot, { status: "ready" }>["save"]): void {
    if (current.status === "ready") publish({ status: "ready", settings: current.settings, save });
  }

  async function read(): Promise<void> {
    let result: Awaited<ReturnType<typeof loadSettings>>;
    try {
      result = await loadSettings(store);
    } catch (error) {
      publish({
        status: "load-error",
        error: "Impossible d'ouvrir les réglages.",
        detail: messageOf(error),
        retryable: true,
      });
      return;
    }
    if (result.ok) {
      publish({ status: "ready", settings: result.settings, save: "idle" });
    } else {
      publish({
        status: "load-error",
        error: result.error,
        detail: result.detail,
        retryable: result.error !== FUTURE_VERSION_ERROR,
      });
    }
  }

  function enqueueWrite(): void {
    if (current.status !== "ready") return;
    pendingWrites += 1;
    const { save } = current;
    // Pendant une écriture qui fait suite à un échec, l'alerte reste affichée.
    setSave(typeof save === "object" ? { failed: save.failed, retrying: true } : "saving");
    const task = async (): Promise<void> => {
      let failure: string | null = null;
      // Si l'état n'est plus « ready », on n'écrit rien (jamais de document vide).
      if (current.status === "ready") {
        try {
          await store.write(JSON.stringify(current.settings));
        } catch (error) {
          failure = messageOf(error);
        }
      }
      pendingWrites -= 1;
      if (pendingWrites === 0 && current.status === "ready") {
        setSave(failure === null ? "saved" : { failed: failure, retrying: false });
      }
    };
    // La file ne reste jamais rejetée : une tâche qui échouerait malgré tout ne bloque pas les suivantes.
    queue = queue.then(task).catch(() => undefined);
  }

  return {
    snapshot: () => current,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    load() {
      const canStart =
        current.status === "idle" || (current.status === "load-error" && current.retryable);
      if (!canStart) return;
      publish({ status: "loading" });
      void read();
    },
    apply(change) {
      if (current.status !== "ready") return { ok: false, issues: [] };
      const validated = validateSettings(change(current.settings));
      if (!validated.ok) return { ok: false, issues: validated.issues };
      const settings = deepFreeze(validated.settings);
      publish({ status: "ready", settings, save: current.save });
      enqueueWrite();
      return { ok: true };
    },
    retrySave: enqueueWrite,
  };
}
