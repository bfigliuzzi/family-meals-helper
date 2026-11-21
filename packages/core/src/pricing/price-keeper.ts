import { localDateText } from "../history/history.ts";
import type { Clock } from "../ports/clock.ts";
import type { OpenPricesStore } from "../ports/open-prices-store.ts";
import type { ManualPriceRow, PriceStore } from "../ports/price-store.ts";
import { deepFreeze } from "../settings/settings-keeper.ts";
import { euroCents } from "./cost-text.ts";
import { inseeLookup } from "./insee.ts";
import { INSEE_TABLE } from "./insee-table.ts";
import { isValidManualKey, manualLookup, MAX_PRICE_CENTS, readManualRows } from "./manual.ts";
import {
  acceptSummary,
  openPricesDue,
  openPricesLookup,
  readOpenPricesSummary,
  serializeOpenPricesSummary,
} from "./open-prices.ts";
import type { Diagnostics, OpenPricesSummary } from "./open-prices.ts";
import type { PriceLookup, PriceUnit } from "./price.ts";

export interface PriceSnapshot {
  readonly manual: {
    readonly status: "loading" | "ready" | "error";
    readonly rows: readonly ManualPriceRow[];
    readonly error: string | null;
  };
  readonly openPrices: {
    // « none » : aucun résumé lisible en service.
    readonly status: "none" | "ready" | "refreshing";
    // Jour du résumé en service.
    readonly fetchedAt: string | null;
    // Dernier échec, affiché tel quel ; remis à null par une réussite.
    readonly error: string | null;
    // D'où vient l'échec : la lecture du résumé dans la base (aucun téléchargement n'a lieu dans ce lancement), ou la
    // mise à jour (téléchargement, calcul, garde de format, enregistrement). `null` sans erreur.
    readonly errorStage: "read" | "update" | null;
  };
  // Vrai quand la table de l'utilisateur est lue (ou en erreur) et que le résumé Open Prices de la base est lu (ou
  // absent) : seul un calcul fait alors compte tout ce que l'app sait. Le téléchargement hebdomadaire ne le change pas.
  readonly ready: boolean;
  // Toujours au moins l'INSEE ; la table de l'utilisateur seulement si `manual.status === "ready"`, Open Prices seulement
  // avec un résumé lisible. Dans cet ordre : table de l'utilisateur, Open Prices, INSEE.
  readonly lookups: readonly PriceLookup[];
}

export interface PriceKeeper {
  // Même objet tant que rien ne change (useSyncExternalStore).
  snapshot(): PriceSnapshot;
  subscribe(listener: () => void): () => void;
  // Relit la table de l'utilisateur (et, au premier appel, le résumé Open Prices de la base) ; ne rejette jamais.
  load(): Promise<void>;
  // Télécharge et calcule le résumé Open Prices s'il est dû (au plus un essai par jour, résumé de 7 jours ou plus ou
  // absent). Un seul essai par lancement, même appelée deux fois ; ne rejette jamais.
  refreshOpenPricesIfDue(): Promise<void>;
  // Rejette avec une phrase française ; un échec ne change rien.
  set(key: string, unit: PriceUnit, euros: number): Promise<void>;
  remove(key: string): Promise<void>;
}

export const PRICE_REFUSED_MESSAGE = "Prix refusé : entre 0,01 € et 1 000 €.";
export const KEY_REFUSED_MESSAGE =
  "Ce produit ne peut pas recevoir de prix personnel : son nom est trop long ou illisible.";
const NOT_READ_MESSAGE = "Votre table de prix n'est pas encore lue.";
const UNREADABLE_MESSAGE = "Lecture de la table de prix impossible.";
const OPEN_PRICES_UNREADABLE_MESSAGE = "Lecture des prix Open Prices impossible.";
const OPEN_PRICES_FAILED_MESSAGE = "Mise à jour des prix Open Prices impossible.";

export interface OpenPricesOptions {
  store: OpenPricesStore;
  // Lit les fichiers téléchargés et calcule le résumé (`buildFromStore`, côté app).
  build: (today: string) => Promise<{ summary: OpenPricesSummary; diagnostics: Diagnostics }>;
}

function messageOf(error: unknown, fallback: string): string {
  return error instanceof Error && error.message !== "" ? error.message : fallback;
}

interface OpenPricesState {
  status: "none" | "ready" | "refreshing";
  fetchedAt: string | null;
  error: string | null;
  errorStage: "read" | "update" | null;
  // Le résumé en service ; il n'est pas dans l'instantané (seuls `status`, `fetchedAt` et `error` y sont).
  summary: OpenPricesSummary | null;
  // Jour du dernier essai de téléchargement, tel que la base le dit.
  attemptedAt: string | null;
  // La lecture du résumé de la base est finie (réussie ou non).
  read: boolean;
}

// Propriétaire unique des prix de l'app, créé une fois pour toute l'app : la table de l'utilisateur et le résumé
// Open Prices. `load`, `set` et `remove` passent par une seule file, dans l'ordre d'appel : une lecture lancée avant
// une écriture finit avant elle et ne peut pas republier des lignes périmées après elle. Une écriture réussie met à
// jour les lignes sans relire ; un échec ne change rien et rejette. Chaque publication remplace sa seule tranche
// (`manual` ou `openPrices`) à partir de l'état courant : la fin d'une lecture de la table ne peut pas effacer un
// résumé arrivé entre-temps, et inversement. L'app reste utilisable sans Open Prices : un échec va dans
// `openPrices.error` et les prix de l'utilisateur et de l'INSEE restent.
export function createPriceKeeper(
  store: PriceStore,
  options: {
    clock: Clock;
    onListenerError?: (error: unknown) => void;
    // Absent (CLI, version d'essai, tests) : pas de résumé Open Prices, pas de téléchargement.
    openPrices?: OpenPricesOptions;
  },
): PriceKeeper {
  const insee = inseeLookup(INSEE_TABLE);
  const listeners = new Set<() => void>();
  let queue: Promise<void> = Promise.resolve();
  const source = options.openPrices;

  let manual: PriceSnapshot["manual"] = { status: "loading", rows: [], error: null };
  let openPrices: OpenPricesState = {
    status: "none",
    fetchedAt: null,
    error: null,
    errorStage: null,
    summary: null,
    attemptedAt: null,
    read: source === undefined,
  };

  function build(): PriceSnapshot {
    const lookups: PriceLookup[] = [];
    if (manual.status === "ready") lookups.push(manualLookup(manual.rows));
    if (openPrices.summary !== null) lookups.push(openPricesLookup(openPrices.summary));
    lookups.push(insee);
    return deepFreeze({
      manual,
      openPrices: {
        status: openPrices.status,
        fetchedAt: openPrices.fetchedAt,
        error: openPrices.error,
        errorStage: openPrices.errorStage,
      },
      ready: manual.status !== "loading" && openPrices.read,
      lookups,
    });
  }

  let current = build();

  function publish(): void {
    current = build();
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

  function publishManual(next: PriceSnapshot["manual"]): void {
    manual = next;
    publish();
  }

  function publishOpenPrices(next: Partial<OpenPricesState>): void {
    openPrices = { ...openPrices, ...next };
    publish();
  }

  function enqueue<T>(task: () => Promise<T>): Promise<T> {
    const result = queue.then(task);
    queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  // Lit le résumé de la base, une seule fois ; ne rejette jamais. Illisible : pas de résumé, sans message.
  let openPricesLoaded: Promise<void> | null = null;
  function loadOpenPrices(): Promise<void> {
    if (source === undefined) return Promise.resolve();
    openPricesLoaded ??= (async () => {
      try {
        const state = await source.store.load();
        const summary = readOpenPricesSummary(state.summary);
        publishOpenPrices({
          status: summary === null ? "none" : "ready",
          fetchedAt: summary?.fetchedAt ?? null,
          summary,
          attemptedAt: state.attemptedAt,
          read: true,
        });
      } catch (error) {
        publishOpenPrices({
          status: "none",
          error: messageOf(error, OPEN_PRICES_UNREADABLE_MESSAGE),
          errorStage: "read",
          read: true,
        });
      }
    })();
    return openPricesLoaded;
  }

  async function refresh(): Promise<void> {
    if (source === undefined) return;
    // La décision voit toujours le jour de l'essai et le résumé de la base.
    await loadOpenPrices();
    // Une lecture échouée ne dit pas si un essai a déjà eu lieu aujourd'hui : pas de téléchargement dans ce lancement
    // (au plus un essai par jour, jamais deux « à l'aveugle »).
    if (openPrices.errorStage === "read") return;
    const today = localDateText(options.clock.now());
    if (
      !openPricesDue({ attemptedAt: openPrices.attemptedAt, summary: openPrices.summary }, today)
    ) {
      return;
    }
    publishOpenPrices({ status: "refreshing" });
    try {
      await source.store.download(today);
      const built = await source.build(today);
      const refusal = acceptSummary(built.summary, built.diagnostics, openPrices.summary);
      if (refusal !== null) throw new Error(refusal);
      await source.store.save(today, serializeOpenPricesSummary(built.summary));
      publishOpenPrices({
        status: "ready",
        fetchedAt: built.summary.fetchedAt,
        error: null,
        errorStage: null,
        summary: built.summary,
        attemptedAt: today,
      });
    } catch (error) {
      // Le résumé en service reste : la semaine précédente vaut mieux que rien.
      publishOpenPrices({
        status: openPrices.summary === null ? "none" : "ready",
        error: messageOf(error, OPEN_PRICES_FAILED_MESSAGE),
        errorStage: "update",
        attemptedAt: today,
      });
    }
  }

  // Un seul essai par lancement, même appelée deux fois de suite (le double effet de `StrictMode`) : le drapeau est
  // posé de façon synchrone.
  let refreshRequested: Promise<void> | null = null;

  return {
    snapshot: () => current,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    load() {
      const openPricesRead = loadOpenPrices();
      const manualRead = enqueue(async () => {
        // Après une erreur, « Réessayer » rebloque la validation le temps de la relecture. Depuis `ready`, la table
        // reste affichée avec ses anciennes lignes : les coûts ne clignotent pas.
        if (manual.status === "error") publishManual({ status: "loading", rows: [], error: null });
        try {
          publishManual({
            status: "ready",
            rows: readManualRows(await store.listManual()),
            error: null,
          });
        } catch (error) {
          publishManual({ status: "error", rows: [], error: messageOf(error, UNREADABLE_MESSAGE) });
        }
      });
      return Promise.all([manualRead, openPricesRead]).then(() => undefined);
    },
    refreshOpenPricesIfDue() {
      refreshRequested ??= refresh().catch(() => undefined);
      return refreshRequested;
    },
    set(key, unit, euros) {
      if (!isValidManualKey(key)) return Promise.reject(new Error(KEY_REFUSED_MESSAGE));
      const cents = euroCents(euros);
      if (!Number.isFinite(cents) || cents < 1 || cents > MAX_PRICE_CENTS) {
        return Promise.reject(new Error(PRICE_REFUSED_MESSAGE));
      }
      return enqueue(async () => {
        if (manual.status !== "ready") throw new Error(NOT_READ_MESSAGE);
        const row: ManualPriceRow = {
          key,
          unit,
          cents,
          date: localDateText(options.clock.now()),
        };
        await store.setManual(row);
        const known = manual.rows.some((existing) => existing.key === key);
        publishManual({
          status: "ready",
          rows: known
            ? manual.rows.map((existing) => (existing.key === key ? row : existing))
            : [...manual.rows, row],
          error: null,
        });
      });
    },
    remove(key) {
      if (!isValidManualKey(key)) return Promise.reject(new Error(KEY_REFUSED_MESSAGE));
      return enqueue(async () => {
        if (manual.status !== "ready") throw new Error(NOT_READ_MESSAGE);
        await store.deleteManual(key);
        publishManual({ ...manual, rows: manual.rows.filter((row) => row.key !== key) });
      });
    },
  };
}
