import { localDateText } from "../history/history.ts";
import type { Clock } from "../ports/clock.ts";
import type { ManualPriceRow, PriceStore } from "../ports/price-store.ts";
import { deepFreeze } from "../settings/settings-keeper.ts";
import { euroCents } from "./cost-text.ts";
import { inseeLookup } from "./insee.ts";
import { INSEE_TABLE } from "./insee-table.ts";
import { isValidManualKey, manualLookup, MAX_PRICE_CENTS, readManualRows } from "./manual.ts";
import type { PriceLookup, PriceUnit } from "./price.ts";

export interface PriceSnapshot {
  readonly manual: {
    readonly status: "loading" | "ready" | "error";
    readonly rows: readonly ManualPriceRow[];
    readonly error: string | null;
  };
  // Toujours au moins l'INSEE ; la table de l'utilisateur seulement si `manual.status === "ready"`.
  readonly lookups: readonly PriceLookup[];
}

export interface PriceKeeper {
  // Même objet tant que rien ne change (useSyncExternalStore).
  snapshot(): PriceSnapshot;
  subscribe(listener: () => void): () => void;
  // Relit la table de l'utilisateur ; ne rejette jamais.
  load(): Promise<void>;
  // Rejette avec une phrase française ; un échec ne change rien.
  set(key: string, unit: PriceUnit, euros: number): Promise<void>;
  remove(key: string): Promise<void>;
}

export const PRICE_REFUSED_MESSAGE = "Prix refusé : entre 0,01 € et 1 000 €.";
export const KEY_REFUSED_MESSAGE =
  "Ce produit ne peut pas recevoir de prix personnel : son nom est trop long ou illisible.";
const NOT_READ_MESSAGE = "Votre table de prix n'est pas encore lue.";
const UNREADABLE_MESSAGE = "Lecture de la table de prix impossible.";

function messageOf(error: unknown, fallback: string): string {
  return error instanceof Error && error.message !== "" ? error.message : fallback;
}

// Propriétaire unique de la table de prix de l'utilisateur, créé une fois pour toute l'app. `load`, `set` et
// `remove` passent par une seule file, dans l'ordre d'appel : une lecture lancée avant une écriture finit avant elle
// et ne peut pas republier des lignes périmées après elle. Une écriture réussie met à jour les lignes sans relire ;
// un échec ne change rien et rejette. Chaque publication part de l'état courant.
export function createPriceKeeper(
  store: PriceStore,
  options: { clock: Clock; onListenerError?: (error: unknown) => void },
): PriceKeeper {
  const insee = inseeLookup(INSEE_TABLE);
  const listeners = new Set<() => void>();
  let queue: Promise<void> = Promise.resolve();

  function build(manual: PriceSnapshot["manual"]): PriceSnapshot {
    return deepFreeze({
      manual,
      lookups: manual.status === "ready" ? [manualLookup(manual.rows), insee] : [insee],
    });
  }

  let current = build({ status: "loading", rows: [], error: null });

  function publish(manual: PriceSnapshot["manual"]): void {
    current = build(manual);
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

  function enqueue<T>(task: () => Promise<T>): Promise<T> {
    const result = queue.then(task);
    queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
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
      return enqueue(async () => {
        try {
          const rows = readManualRows(await store.listManual());
          publish({ status: "ready", rows, error: null });
        } catch (error) {
          publish({ status: "error", rows: [], error: messageOf(error, UNREADABLE_MESSAGE) });
        }
      });
    },
    set(key, unit, euros) {
      if (!isValidManualKey(key)) return Promise.reject(new Error(KEY_REFUSED_MESSAGE));
      const cents = euroCents(euros);
      if (!Number.isFinite(cents) || cents < 1 || cents > MAX_PRICE_CENTS) {
        return Promise.reject(new Error(PRICE_REFUSED_MESSAGE));
      }
      return enqueue(async () => {
        if (current.manual.status !== "ready") throw new Error(NOT_READ_MESSAGE);
        const row: ManualPriceRow = {
          key,
          unit,
          cents,
          date: localDateText(options.clock.now()),
        };
        await store.setManual(row);
        const rows = current.manual.rows;
        const known = rows.some((existing) => existing.key === key);
        publish({
          status: "ready",
          rows: known
            ? rows.map((existing) => (existing.key === key ? row : existing))
            : [...rows, row],
          error: null,
        });
      });
    },
    remove(key) {
      if (!isValidManualKey(key)) return Promise.reject(new Error(KEY_REFUSED_MESSAGE));
      return enqueue(async () => {
        if (current.manual.status !== "ready") throw new Error(NOT_READ_MESSAGE);
        await store.deleteManual(key);
        publish({
          ...current.manual,
          rows: current.manual.rows.filter((row) => row.key !== key),
        });
      });
    },
  };
}
