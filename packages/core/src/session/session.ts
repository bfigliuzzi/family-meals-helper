import { composeMenu, reviseMenu } from "../ai/compose.ts";
import type {
  ComposeInput,
  ComposeResult,
  PastMenu,
  ReviseInput,
  StopCause,
} from "../ai/compose.ts";
import type { Model } from "../ai/model.ts";
import { pastMenus, readHistory } from "../history/history.ts";
import { SESSION_DAYS } from "../domain/menu.ts";
import type { Menu, SessionDay } from "../domain/menu.ts";
import { REFERENTIAL } from "../ingredients/referential.ts";
import type { Clock } from "../ports/clock.ts";
import type { HistoryStore } from "../ports/history-store.ts";
import { dishKey } from "../rules/check-pinned.ts";
import type { MenuCheck } from "../rules/check-menu.ts";
import { monthOf } from "../season/months.ts";
import type { Month } from "../season/months.ts";
import { SEASON_TABLE } from "../season/season-table.ts";
import { compositionSettings } from "../settings/settings.ts";
import type { Settings } from "../settings/settings.ts";
import { deepFreeze } from "../settings/settings-keeper.ts";
import type { SettingsKeeper } from "../settings/settings-keeper.ts";

export const MAX_MESSAGE_LENGTH = 2000;

const MIN_DINNERS = 1;
const MAX_DINNERS = 5;

export interface SessionDeps {
  settings: SettingsKeeper;
  clock: Clock;
  // Lu au clic pour donner à l'IA les plats des derniers menus ; une lecture qui échoue n'arrête rien.
  history: HistoryStore;
  // Appelé au clic, une fois par opération, avec les réglages du moment.
  createModel: (settings: Settings) => Promise<Model>;
  onListenerError?: (error: unknown) => void;
}

// Textes bruts, tels que l'utilisateur et l'IA les ont écrits.
export interface Exchange {
  readonly message: string;
  readonly note: string;
}

export interface CurrentMenu {
  readonly menu: Menu;
  readonly check: MenuCheck;
  // Mois, jour de session et nombre de dîners du calcul.
  readonly month: Month;
  readonly sessionDay: SessionDay;
  // Nombre de dîners demandé pour ce calcul (pas le nombre de plats rendu : un menu peut en avoir 0 ou 6).
  readonly dinners: number;
  // Essais faits dans ce cycle.
  readonly attempts: number;
  readonly stop: StopCause;
  readonly technicalError: string | null;
}

export interface SessionFailure {
  readonly stop: StopCause;
  readonly technicalError: string | null;
  readonly pinnedRemoved: readonly string[];
  readonly attempts: number;
  // Un menu courant existait quand le message est parti.
  readonly revision: boolean;
}

export interface SessionSnapshot {
  readonly month: Month;
  readonly sessionDay: SessionDay;
  // 1 à 5, 5 au départ ; seul `setDinners` le change.
  readonly dinners: number;
  readonly draft: string;
  // Messages appliqués, du plus ancien au plus récent.
  readonly exchanges: readonly Exchange[];
  readonly current: CurrentMenu | null;
  readonly pinned: readonly string[];
  // `attempt` : numéro de l'essai en cours (1 à 3).
  readonly pending: { readonly message: string; readonly attempt: number } | null;
  readonly failure: SessionFailure | null;
  // Opérations terminées (succès ou échec), pour l'indicateur de la navigation.
  readonly outcomes: number;
}

export type SendOutcome =
  { ok: true } | { ok: false; reason: "busy" | "empty" | "too-long" | "settings" | "failed" };

export interface Session {
  // Même objet tant que rien ne change (useSyncExternalStore).
  snapshot(): SessionSnapshot;
  subscribe(listener: () => void): () => void;
  // Ignoré pendant un appel.
  setDraft(text: string): void;
  // Ignoré pendant un appel.
  setSessionDay(day: SessionDay): void;
  // Ignoré pendant un appel, ou hors des entiers 1 à 5.
  setDinners(dinners: number): void;
  // Ignoré pendant un appel, ou si aucun plat du menu courant n'a cette clé (`dishKey`).
  togglePin(name: string): void;
  // Ignoré pendant un appel ; garde le jour, le nombre de dîners et `outcomes`.
  reset(): void;
  // Ne rejette jamais.
  send(): Promise<SendOutcome>;
}

// Tout ce que l'opération lit, calculé une fois au clic puis gelé : un changement fait pendant l'appel (champ,
// réglages) ne l'atteint pas.
interface Prepared {
  readonly message: string;
  readonly settings: Settings;
  readonly equipment: ReturnType<typeof compositionSettings>["equipment"];
  readonly month: Month;
  readonly sessionDay: SessionDay;
  readonly dinners: number;
  readonly revision: boolean;
  readonly input: ComposeInput | ReviseInput;
}

// Ne lève jamais : une erreur reçue peut être n'importe quel objet (`{ toString: null }`, getter qui lève ou qui change
// de type d'une lecture à l'autre). `message` n'est lu qu'une fois.
function messageOf(error: unknown): string {
  try {
    if (typeof error === "string") return error;
    if (error instanceof Error) {
      const { message } = error;
      if (typeof message === "string") return message;
    }
  } catch {
    // repli ci-dessous
  }
  return "erreur inconnue";
}

function technicalFailure(error: unknown, revision: boolean): SessionFailure {
  return {
    stop: "technical-error",
    technicalError: `Erreur inattendue : ${messageOf(error)}`,
    pinnedRemoved: [],
    attempts: 0,
    revision,
  };
}

// Propriétaire unique de la session de composition, créé une fois pour toute l'app. Il garde la conversation, le
// menu courant, les épingles et l'opération en cours : l'écran peut être quitté pendant un appel, et un seul appel
// payé part à la fois.
export function createSession(deps: SessionDeps): Session {
  let current: SessionSnapshot = deepFreeze({
    month: monthOf(deps.clock.now()),
    sessionDay: "sun",
    dinners: MAX_DINNERS,
    draft: "",
    exchanges: [],
    current: null,
    pinned: [],
    pending: null,
    failure: null,
    outcomes: 0,
  });
  const listeners = new Set<() => void>();

  function publish(patch: Partial<SessionSnapshot>): void {
    current = deepFreeze({ ...current, ...patch });
    for (const listener of [...listeners]) {
      // Comme le keeper des réglages : un abonné qui lève n'empêche ni les autres abonnés ni la suite.
      try {
        listener();
      } catch (error) {
        try {
          deps.onListenerError?.(error);
        } catch {
          continue;
        }
      }
    }
  }

  // Publie la fin d'une opération : le résultat, `pending` nul et `outcomes + 1` ensemble.
  function finish(patch: Partial<SessionSnapshot>): void {
    publish({ ...patch, pending: null, outcomes: current.outcomes + 1 });
  }

  function failTechnically(error: unknown, revision: boolean): SendOutcome {
    finish({ failure: technicalFailure(error, revision) });
    return { ok: false, reason: "failed" };
  }

  function prepare(): Prepared | Extract<SendOutcome, { ok: false }> {
    const message = current.draft.trim();
    if (message === "") return { ok: false, reason: "empty" };
    if (message.length > MAX_MESSAGE_LENGTH) return { ok: false, reason: "too-long" };
    const snapshot = deps.settings.snapshot();
    if (snapshot.status !== "ready") return { ok: false, reason: "settings" };
    const { equipment, exclusions } = compositionSettings(snapshot.settings);
    const month = monthOf(deps.clock.now());
    const { sessionDay, dinners, exchanges, pinned } = current;
    const common = { exclusions, month, sessionDay, maxAttempts: 3, history: [], dinners } as const;
    const menu = current.current?.menu;
    const input: ComposeInput | ReviseInput =
      menu === undefined || exchanges[0] === undefined
        ? { ...common, request: message, pinned: [...pinned] }
        : {
            ...common,
            initialRequest: exchanges[0].message,
            message,
            current: menu,
            conversation: exchanges.slice(1).map((exchange) => exchange.message),
            pinned: [...pinned],
          };
    publish({ month, pending: { message, attempt: 1 }, failure: null });
    return {
      message,
      settings: snapshot.settings,
      equipment,
      month,
      sessionDay,
      dinners,
      revision: menu !== undefined,
      input: deepFreeze(input),
    };
  }

  // Les plats des 5 derniers menus, ou rien si la lecture échoue : la composition marche, elle perd seulement la
  // consigne « ne pas reprendre ».
  async function pastHistory(): Promise<PastMenu[]> {
    try {
      return pastMenus(readHistory(await deps.history.list()).items);
    } catch {
      return [];
    }
  }

  async function run(prepared: Prepared): Promise<SendOutcome> {
    // Publié dans le `finally`, quoi qu'il arrive : `pending` repasse toujours à `null`.
    let patch: Partial<SessionSnapshot> = {
      failure: technicalFailure(undefined, prepared.revision),
    };
    let outcome: SendOutcome = { ok: false, reason: "failed" };
    try {
      // Lue après la prise du verrou, avant l'appel : l'entrée est gelée une fois, comme le reste.
      const input = deepFreeze({ ...prepared.input, history: await pastHistory() });
      const model = await deps.createModel(prepared.settings);
      let attempts = 0;
      // Un essai n'est annoncé qu'au moment où son appel part, jamais d'avance.
      const counting: Model = {
        complete(prompt) {
          attempts += 1;
          if (attempts > 1) publish({ pending: { message: prepared.message, attempt: attempts } });
          return model.complete(prompt);
        },
      };
      const modelDeps = {
        model: counting,
        refs: REFERENTIAL,
        seasonTable: SEASON_TABLE,
        equipment: prepared.equipment,
      };
      const result: ComposeResult =
        "initialRequest" in input
          ? await reviseMenu(input, modelDeps)
          : await composeMenu(input, modelDeps);
      const best = result.best;
      const menu = best?.menu ?? null;
      if (best === null || menu === null) {
        patch = {
          failure: {
            stop: result.stop,
            technicalError: result.technicalError,
            pinnedRemoved: result.pinnedRemoved,
            attempts: result.attempts.length,
            revision: prepared.revision,
          },
        };
      } else {
        patch = {
          exchanges: [...current.exchanges, { message: prepared.message, note: best.note ?? "" }],
          current: {
            menu,
            check: best.check,
            month: prepared.month,
            sessionDay: prepared.sessionDay,
            dinners: prepared.dinners,
            attempts: result.attempts.length,
            stop: result.stop,
            technicalError: result.technicalError,
          },
          pinned: result.pinned,
          draft: "",
          failure: null,
        };
        outcome = { ok: true };
      }
    } catch (error) {
      patch = { failure: technicalFailure(error, prepared.revision) };
    } finally {
      finish(patch);
    }
    return outcome;
  }

  return {
    snapshot: () => current,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    setDraft(text) {
      if (current.pending !== null || text === current.draft) return;
      publish({ draft: text });
    },
    setSessionDay(day) {
      if (current.pending !== null || day === current.sessionDay || !SESSION_DAYS.includes(day)) {
        return;
      }
      publish({ sessionDay: day });
    },
    setDinners(dinners) {
      const valid = Number.isInteger(dinners) && dinners >= MIN_DINNERS && dinners <= MAX_DINNERS;
      if (current.pending !== null || !valid || dinners === current.dinners) return;
      publish({ dinners });
    },
    togglePin(name) {
      if (current.pending !== null || current.current === null) return;
      const key = dishKey(name);
      const dish = current.current.menu.dishes.find((candidate) => dishKey(candidate.name) === key);
      if (dish === undefined) return;
      const pinned = current.pinned.some((pin) => dishKey(pin) === key);
      publish({
        pinned: pinned
          ? current.pinned.filter((pin) => dishKey(pin) !== key)
          : [...current.pinned, dish.name],
      });
    },
    reset() {
      if (current.pending !== null) return;
      publish({ exchanges: [], current: null, pinned: [], draft: "", failure: null });
    },
    send() {
      if (current.pending !== null) return Promise.resolve({ ok: false, reason: "busy" });
      let prepared: ReturnType<typeof prepare>;
      try {
        prepared = prepare();
      } catch (error) {
        return Promise.resolve(failTechnically(error, current.current !== null));
      }
      if (!("input" in prepared)) return Promise.resolve(prepared);
      return run(prepared);
    },
  };
}
