import type { HistoryStore } from "../ports/history-store.ts";

export interface CheckState {
  // Le dernier état voulu : c'est lui qui s'affiche, jamais une réponse du magasin.
  readonly keys: readonly string[];
  readonly saving: boolean;
  readonly error: string | null;
}

// Seulement les entrées touchées depuis le lancement.
export type CheckSnapshot = Readonly<Record<number, CheckState>>;

export interface CheckKeeper {
  // Même objet tant que rien ne change (useSyncExternalStore).
  snapshot(): CheckSnapshot;
  // Remplace les cases cochées de l'entrée (état complet).
  set(id: number, keys: readonly string[]): void;
  // Renvoie l'état voulu ; seulement avec une erreur et rien en cours.
  retry(id: number): void;
  subscribe(listener: () => void): () => void;
}

interface Slot {
  wanted: readonly string[];
  // L'état en cours d'écriture (le tableau envoyé), sinon `null`.
  inFlight: readonly string[] | null;
  error: string | null;
}

function messageOf(reason: unknown): string {
  return reason instanceof Error ? reason.message : "Erreur inconnue de l'historique.";
}

// Propriétaire unique des cases cochées, créé une fois pour toute l'app (comme le propriétaire des réglages). Chaque
// coche envoie l'état complet. Par entrée, une seule écriture à la fois : une coche faite pendant une écriture
// remplace l'état en attente, et part à la réponse. Une réponse ne touche jamais l'état affiché : la base finit dans
// le dernier état voulu si la dernière écriture réussit ; sinon l'échec est gardé et `retry` renvoie cet état.
// L'état vit ici et non dans l'écran : quitter l'écran pendant une écriture, puis revenir, ne réaffiche pas l'ancien
// état lu dans la base.
export function createCheckKeeper(
  store: Pick<HistoryStore, "setChecked">,
  options: { onListenerError?: (error: unknown) => void } = {},
): CheckKeeper {
  const slots = new Map<number, Slot>();
  const listeners = new Set<() => void>();
  let current: CheckSnapshot = Object.freeze({});

  function publish(): void {
    const next: Record<number, CheckState> = {};
    for (const [id, slot] of slots) {
      next[id] = Object.freeze({
        keys: slot.wanted,
        saving: slot.inFlight !== null,
        error: slot.error,
      });
    }
    current = Object.freeze(next);
    for (const listener of [...listeners]) {
      // Un abonné qui lève n'empêche ni les autres ni la suite (comme `createSettingsKeeper`).
      try {
        listener();
      } catch (error) {
        try {
          options.onListenerError?.(error);
        } catch {
          continue;
        }
      }
    }
  }

  function send(id: number, slot: Slot): void {
    const sent = slot.wanted;
    slot.inFlight = sent;
    publish();
    const settle = (error: string | null): void => {
      slot.inFlight = null;
      // Un état plus récent attend : il part et remplace tout, succès comme échec.
      if (slot.wanted !== sent) {
        send(id, slot);
        return;
      }
      slot.error = error;
      publish();
    };
    // Un `setChecked` qui lève de façon synchrone est un rejet.
    Promise.resolve()
      .then(() => store.setChecked(id, sent))
      .then(
        () => {
          settle(null);
        },
        (reason: unknown) => {
          settle(messageOf(reason));
        },
      );
  }

  return {
    snapshot: () => current,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    set(id, keys) {
      const slot = slots.get(id) ?? { wanted: [], inFlight: null, error: null };
      slots.set(id, slot);
      slot.wanted = Object.freeze([...keys]);
      slot.error = null;
      if (slot.inFlight === null) send(id, slot);
      else publish();
    },
    retry(id) {
      const slot = slots.get(id);
      if (slot === undefined || slot.error === null || slot.inFlight !== null) return;
      slot.error = null;
      send(id, slot);
    },
  };
}
