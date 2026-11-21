import type { TDocumentDefinitions } from "pdfmake/interfaces.js";
import type { ZodType } from "zod";
import { NO_ANSWER_REASON, detailForSheet } from "../ai/batch.ts";
import { composeMenu, reviseMenu } from "../ai/compose.ts";
import type {
  ComposeInput,
  ComposeResult,
  PastMenu,
  ReviseInput,
  StopCause,
} from "../ai/compose.ts";
import type { Model } from "../ai/model.ts";
import { MenuReplySchema } from "../ai/menu-reply.ts";
import { printable } from "../ai/printable.ts";
import { DetailSchema } from "../domain/detail.ts";
import type { Finding } from "../domain/finding.ts";
import { SESSION_DAYS, dishLetter } from "../domain/menu.ts";
import type { Menu, SessionDay } from "../domain/menu.ts";
import type { Equipment } from "../equipment/household.ts";
import {
  localDateText,
  pastMenus,
  readHistory,
  serializeHistoryEntry,
} from "../history/history.ts";
import { buildIngredientIndex } from "../ingredients/index-lookup.ts";
import { REFERENTIAL } from "../ingredients/referential.ts";
import { buildSheetDocument, sessionTooLong } from "../pdf/sheet.ts";
import type { SheetSteps } from "../pdf/sheet.ts";
import type { Clock } from "../ports/clock.ts";
import type { HistoryStore } from "../ports/history-store.ts";
import { MAX_BUDGET_EUROS, isValidBudget, readEuroInput } from "../pricing/budget.ts";
import { menuCost } from "../pricing/cost.ts";
import type { MenuCost } from "../pricing/cost.ts";
import type { PriceLookup } from "../pricing/price.ts";
import { dishKey } from "../rules/check-pinned.ts";
import { checkMenu } from "../rules/check-menu.ts";
import type { MenuCheck } from "../rules/check-menu.ts";
import { lastDish } from "../scheduling/check-session.ts";
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
  // Appelé au clic, une fois par opération, avec les réglages du moment et le schéma de la réponse attendue
  // (`MenuReplySchema` pour la composition, `DetailSchema` pour le détail).
  createModel: (settings: Settings, schema: ZodType) => Promise<Model>;
  // Rend la fiche en PDF (pdfmake navigateur dans l'app).
  renderPdf: (doc: TDocumentDefinitions, at: Date) => Promise<Uint8Array>;
  // Jeton de validation, tiré une fois par validation et gardé pour toutes ses reprises : le magasin le range avec
  // l'entrée, et un jeton déjà connu rend l'identifiant déjà enregistré. Aléatoire (jamais l'heure ni un compteur).
  newToken: () => string;
  // Les sources de prix du moment, ou `null` tant que la table de prix de l'utilisateur n'est pas lue : la validation
  // attend (`reason: "prices"`), sinon un prix personnel manquerait pour toujours dans la fiche. Lu une seule fois, au
  // clic « Valider ce menu », en même temps que la date : le coût de la fiche vient de cet instant, quoi qu'il
  // arrive ensuite (reprises, minuit, mise à jour des prix).
  priceLookups: () => readonly PriceLookup[] | null;
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

export type ValidationWarning = "too-long" | "fallback";
export type Validation =
  // Rédaction du détail en cours (essai 1 à 3).
  | { readonly step: "detail"; readonly attempt: number }
  | {
      readonly step: "decide";
      readonly warning: "too-long";
      readonly attempts: number;
      readonly minutes: number;
      readonly lastDish: string;
      readonly lastEnd: number;
    }
  | {
      readonly step: "decide";
      readonly warning: "fallback";
      readonly attempts: number;
      readonly reason: string;
      readonly technicalError: string | null;
    }
  // Rendu du PDF puis enregistrement : local.
  | { readonly step: "save" }
  | { readonly step: "save-failed"; readonly message: string }
  | {
      readonly step: "saved";
      readonly id: number;
      readonly warning: ValidationWarning | null;
      readonly openError: string | null;
    };

// Ce que la vue de validation rappelle du menu validé ; non nul quand `validation` l'est.
export interface ValidatedMenu {
  readonly menu: Menu;
  readonly sessionDay: SessionDay;
  readonly month: Month;
  // `AAAA-MM-JJ`, la date du clic.
  readonly date: string;
}

export interface SessionSnapshot {
  readonly month: Month;
  readonly sessionDay: SessionDay;
  // 1 à 5, 5 au départ ; seul `setDinners` le change.
  readonly dinners: number;
  // Plafond de budget en euros, ou `null` (aucun plafond) : la dernière valeur lisible du brouillon.
  readonly budget: number | null;
  // Le texte du champ budget, tel que l'utilisateur l'a tapé (`""` au départ). Il vit ici et non dans l'écran :
  // changer d'écran puis revenir ne change ni le brouillon ni le refus d'envoyer.
  readonly budgetDraft: number | string;
  // Le brouillon n'est pas lisible (`0`, `20000`) : `budget` garde sa dernière valeur lisible, et `send` refuse.
  readonly budgetInvalid: boolean;
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
  readonly validation: Validation | null;
  readonly validated: ValidatedMenu | null;
  // Les constats `error` du dernier contrôle refusé au clic « Valider ». `null` après `send`, une validation qui
  // part, ou `reset`.
  readonly blocked: readonly Finding[] | null;
}

// Vrai pendant une composition, la rédaction du détail, ou la préparation et l'enregistrement de la fiche.
export function isSessionBusy(snapshot: SessionSnapshot): boolean {
  return (
    snapshot.pending !== null ||
    snapshot.validation?.step === "detail" ||
    snapshot.validation?.step === "save"
  );
}

export type SendOutcome =
  | { ok: true }
  | { ok: false; reason: "busy" | "empty" | "too-long" | "settings" | "budget" | "failed" };

export type ValidateOutcome =
  | { ok: true }
  | {
      ok: false;
      reason: "busy" | "no-menu" | "settings" | "prices" | "blocked" | "failed";
    };

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
  // Ignoré pendant un appel. Garde le texte tel quel ; s'il est lisible (`readEuroInput` : vide ou de 0,01 à 10000 €)
  // il devient le budget (vide : aucun plafond), sinon `budget` garde sa dernière valeur et `budgetInvalid` passe à
  // vrai.
  setBudgetDraft(value: number | string): void;
  // Ignoré pendant un appel, ou si aucun plat du menu courant n'a cette clé (`dishKey`).
  togglePin(name: string): void;
  // Ignoré pendant un appel ; garde le jour, le nombre de dîners, le budget (et son brouillon) et `outcomes`.
  reset(): void;
  // Ne rejette jamais.
  // Rend `reason: "budget"` sans rien publier ni appeler tant que le brouillon du budget est illisible.
  send(): Promise<SendOutcome>;
  // Contrôle le menu affiché avec les réglages, le jour et le nombre de dîners du moment, puis fait rédiger le
  // détail, rend la fiche et l'enregistre. Ne rejette jamais.
  // Rend `reason: "prices"` sans rien publier ni geler tant que la table de prix n'est pas lue.
  validate(): Promise<ValidateOutcome>;
  // Seulement en `decide` : garde la fiche telle quelle (avertissement ou grandes phases). Aucun appel à l'IA.
  keepSheet(): Promise<void>;
  // Seulement en `save-failed` : refait le rendu s'il a échoué, puis renvoie les mêmes octets avec le même jeton.
  retrySave(): Promise<void>;
  // Seulement en `saved` : rouvre la fiche dans Aperçu ; ignoré pendant une réouverture. Ne rejette jamais.
  reopen(): Promise<void>;
  // En `decide`, `save-failed` ou `saved` : abandonne la validation, garde la conversation et le menu.
  backToMenu(): void;
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

// Tout ce que la validation lit, figé une fois au clic : un changement fait ensuite (réglages, jour, champ) ne
// l'atteint pas.
interface Frozen {
  readonly menu: Menu;
  readonly check: MenuCheck;
  readonly settings: Settings;
  readonly sessionDay: SessionDay;
  readonly equipment: Equipment;
  readonly exclusions: readonly string[];
  readonly request: string;
  // La date du clic : date de l'entrée et `CreationDate` du PDF.
  readonly at: Date;
  // Le coût de la fiche, calculé au clic avec les prix du moment et réutilisé par toutes les reprises.
  readonly priced: { readonly cost: MenuCost; readonly pricedOn: string };
  readonly token: string;
}

// Ce que la session garde hors du snapshot : `deepFreeze` lève sur un `Uint8Array` non vide, et le détail, la
// définition et les octets ne doivent pas être recalculés (ni repayés) après un échec local.
interface Held {
  steps: SheetSteps;
  sheet: "detail" | "too-long" | "fallback";
  doc: TDocumentDefinitions | null;
  bytes: Uint8Array | null;
}

// Fin d'une opération : ce qu'`operate` publie, et ce que l'appelant reçoit.
interface Done<T> {
  patch: Partial<SessionSnapshot>;
  result: T;
}

// Propriétaire unique de la session de composition, créé une fois pour toute l'app. Il garde la conversation, le
// menu courant, les épingles, l'opération en cours et la validation : l'écran peut être quitté pendant un appel, et
// un seul appel payé part à la fois.
export function createSession(deps: SessionDeps): Session {
  let current: SessionSnapshot = deepFreeze({
    month: monthOf(deps.clock.now()),
    sessionDay: "sun",
    dinners: MAX_DINNERS,
    budget: null,
    budgetDraft: "",
    budgetInvalid: false,
    draft: "",
    exchanges: [],
    current: null,
    pinned: [],
    pending: null,
    failure: null,
    outcomes: 0,
    validation: null,
    validated: null,
    blocked: null,
  });
  const listeners = new Set<() => void>();
  let frozen: Frozen | null = null;
  let held: Held | null = null;
  // La validation (l'objet `saved`) dont une réouverture est en cours : une autre validation n'est pas bloquée.
  let reopeningFor: Validation | null = null;
  let index: ReturnType<typeof buildIngredientIndex> | null = null;

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

  // Une étape ou un essai en cours : ne touche jamais à `pending` ni à `outcomes`.
  const progress = publish;

  // La fin d'une opération : le résultat, `pending` nul et `outcomes + 1` ensemble.
  function publishEnd(patch: Partial<SessionSnapshot>): void {
    publish({ ...patch, pending: null, outcomes: current.outcomes + 1 });
  }

  // Le seul endroit qui publie la fin d'une opération payée ou longue (`send`, `validate`, `keepSheet`,
  // `retrySave`) : dans un `finally`, avec le résultat de `work` ou, si elle lève, le repli de `onError`.
  async function operate<T>(
    onError: (error: unknown) => Done<T>,
    work: () => Promise<Done<T>>,
  ): Promise<T> {
    let done: Done<T> | undefined;
    try {
      done = await work();
    } catch (error) {
      done = onError(error);
    } finally {
      publishEnd((done ?? onError(undefined)).patch);
    }
    return done.result;
  }

  function failTechnically(error: unknown, revision: boolean): SendOutcome {
    publishEnd({ failure: technicalFailure(error, revision) });
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
    const { sessionDay, dinners, budget, exchanges, pinned } = current;
    const common = {
      exclusions,
      month,
      sessionDay,
      maxAttempts: 3,
      history: [],
      dinners,
      ...(budget === null ? {} : { budget }),
    } as const;
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
    publish({ month, pending: { message, attempt: 1 }, failure: null, blocked: null });
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

  async function run(prepared: Prepared): Promise<Done<SendOutcome>> {
    // Lue après la prise du verrou, avant l'appel : l'entrée est gelée une fois, comme le reste.
    const input = deepFreeze({ ...prepared.input, history: await pastHistory() });
    const model = await deps.createModel(prepared.settings, MenuReplySchema);
    let attempts = 0;
    // Un essai n'est annoncé qu'au moment où son appel part, jamais d'avance.
    const counting: Model = {
      complete(prompt) {
        attempts += 1;
        if (attempts > 1) progress({ pending: { message: prepared.message, attempt: attempts } });
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
      return {
        patch: {
          failure: {
            stop: result.stop,
            technicalError: result.technicalError,
            pinnedRemoved: result.pinnedRemoved,
            attempts: result.attempts.length,
            revision: prepared.revision,
          },
        },
        result: { ok: false, reason: "failed" },
      };
    }
    return {
      patch: {
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
      },
      result: { ok: true },
    };
  }

  // Rend la fiche (sauf si elle l'est déjà), l'enregistre avec le jeton de la validation, puis l'ouvre dans Aperçu.
  // Ne publie que l'étape `save` : la fin est publiée par `operate`.
  async function save(): Promise<Partial<SessionSnapshot>> {
    const fixed = frozen;
    const keep = held;
    if (fixed === null || keep === null) {
      return {
        validation: { step: "save-failed", message: "Erreur inattendue : validation perdue." },
      };
    }
    progress({ validation: { step: "save" } });
    try {
      if (keep.bytes === null) {
        keep.doc ??= buildSheetDocument({
          sessionDay: fixed.sessionDay,
          menu: fixed.menu,
          keeping: fixed.check.keeping,
          steps: keep.steps,
          index: (index ??= buildIngredientIndex(REFERENTIAL)),
          equipment: fixed.equipment,
          cost: fixed.priced,
        });
        keep.bytes = await deps.renderPdf(keep.doc, fixed.at);
      }
    } catch (error) {
      return {
        validation: {
          step: "save-failed",
          message: `Préparation de la fiche impossible : ${messageOf(error)}`,
        },
      };
    }
    let id: number;
    try {
      const entry = serializeHistoryEntry({
        version: 1,
        date: localDateText(fixed.at),
        request: fixed.request,
        sessionDay: fixed.sessionDay,
        menu: fixed.menu,
        sheet: keep.sheet,
      });
      id = await deps.history.add(fixed.token, entry, keep.bytes);
    } catch (error) {
      return { validation: { step: "save-failed", message: messageOf(error) } };
    }
    // Enregistré : les octets, le détail et le jeton ne servent plus.
    const warning = keep.sheet === "detail" ? null : keep.sheet;
    held = null;
    frozen = null;
    let openError: string | null = null;
    try {
      await deps.history.openPdf(id);
    } catch (error) {
      openError = messageOf(error);
    }
    return { validation: { step: "saved", id, warning, openError } };
  }

  const saveDone = async (): Promise<Done<void>> => ({ patch: await save(), result: undefined });
  const saveFailed = (error: unknown): Done<void> => ({
    patch: {
      validation: { step: "save-failed", message: `Erreur inattendue : ${messageOf(error)}` },
    },
    result: undefined,
  });

  async function detail(fixed: Frozen, plan: NonNullable<MenuCheck["session"]>) {
    const model = await deps.createModel(fixed.settings, DetailSchema);
    let calls = 0;
    // Un essai n'est annoncé qu'au moment où son appel part, jamais d'avance.
    const counting: Model = {
      complete(prompt) {
        calls += 1;
        if (calls > 1) progress({ validation: { step: "detail", attempt: calls } });
        return model.complete(prompt);
      },
    };
    const sheetPlan = await detailForSheet(
      {
        menu: fixed.menu,
        plan,
        sessionDay: fixed.sessionDay,
        maxAttempts: 3,
        exclusions: fixed.exclusions,
      },
      {
        model: counting,
        equipment: fixed.equipment,
        index: (index ??= buildIngredientIndex(REFERENTIAL)),
      },
    );
    return sheetPlan;
  }

  function validate(): Promise<ValidateOutcome> {
    if (isSessionBusy(current) || current.validation !== null) {
      return Promise.resolve({ ok: false, reason: "busy" });
    }
    const first = current.exchanges[0];
    const menu = current.current?.menu;
    if (menu === undefined || first === undefined) {
      return Promise.resolve({ ok: false, reason: "no-menu" });
    }
    let fixed: Frozen;
    let plan: NonNullable<MenuCheck["session"]>;
    try {
      const snapshot = deps.settings.snapshot();
      if (snapshot.status !== "ready") return Promise.resolve({ ok: false, reason: "settings" });
      const lookups = deps.priceLookups();
      if (lookups === null) return Promise.resolve({ ok: false, reason: "prices" });
      const { equipment, exclusions } = compositionSettings(snapshot.settings);
      const at = deps.clock.now();
      const ingredientIndex = (index ??= buildIngredientIndex(REFERENTIAL));
      const check = checkMenu(menu, {
        request: first.message,
        exclusions,
        month: monthOf(at),
        sessionDay: current.sessionDay,
        dinners: current.dinners,
        index: ingredientIndex,
        seasonTable: SEASON_TABLE,
        equipment,
      });
      const errors = check.findings.filter((finding) => finding.level === "error");
      if (errors.length > 0 || check.session === null) {
        publish({ blocked: errors });
        return Promise.resolve({ ok: false, reason: "blocked" });
      }
      plan = check.session;
      fixed = {
        menu,
        check,
        settings: snapshot.settings,
        sessionDay: current.sessionDay,
        equipment,
        exclusions,
        request: first.message,
        at,
        priced: {
          cost: menuCost(menu, ingredientIndex, lookups),
          pricedOn: localDateText(at),
        },
        token: deps.newToken(),
      };
      frozen = fixed;
      held = null;
      publish({
        validation: { step: "detail", attempt: 1 },
        validated: {
          menu,
          sessionDay: fixed.sessionDay,
          month: monthOf(at),
          date: localDateText(at),
        },
        blocked: null,
      });
    } catch (error) {
      frozen = null;
      publishEnd({ failure: technicalFailure(error, true), blocked: null });
      return Promise.resolve({ ok: false, reason: "failed" });
    }
    const ok: ValidateOutcome = { ok: true };
    return operate<ValidateOutcome>(
      (error) => {
        // Imprévu (import du SDK, erreur interne) : le repli est la question des grandes phases, avec le
        // planning du contrôle figé.
        held = {
          steps: { kind: "phases", plan, reason: NO_ANSWER_REASON },
          sheet: "fallback",
          doc: null,
          bytes: null,
        };
        return {
          patch: {
            validation: {
              step: "decide",
              warning: "fallback",
              attempts: 0,
              reason: NO_ANSWER_REASON,
              technicalError: `Erreur inattendue : ${messageOf(error)}`,
            },
          },
          result: ok,
        };
      },
      async () => {
        const sheetPlan = await detail(fixed, plan);
        const { steps } = sheetPlan;
        if (steps.kind === "phases") {
          held = { steps, sheet: "fallback", doc: null, bytes: null };
          return {
            patch: {
              validation: {
                step: "decide",
                warning: "fallback",
                attempts: sheetPlan.detail.calls,
                reason: sheetPlan.fallbackReason ?? NO_ANSWER_REASON,
                technicalError: sheetPlan.detail.technicalError,
              },
            },
            result: ok,
          };
        }
        if (sessionTooLong(steps)) {
          held = { steps, sheet: "too-long", doc: null, bytes: null };
          const last = lastDish(steps.plan, fixed.menu);
          return {
            patch: {
              validation: {
                step: "decide",
                warning: "too-long",
                attempts: sheetPlan.detail.calls,
                minutes: steps.plan.minutes,
                lastDish: last.name,
                lastEnd: last.end,
              },
            },
            result: ok,
          };
        }
        held = { steps, sheet: "detail", doc: null, bytes: null };
        return { patch: await save(), result: ok };
      },
    );
  }

  function keepSheet(): Promise<void> {
    const shown = current.validation;
    if (shown?.step !== "decide" || held === null || frozen === null || isSessionBusy(current)) {
      return Promise.resolve();
    }
    return operate(saveFailed, saveDone);
  }

  function retrySave(): Promise<void> {
    if (current.validation?.step !== "save-failed" || held === null || frozen === null) {
      return Promise.resolve();
    }
    return operate(saveFailed, saveDone);
  }

  async function reopen(): Promise<void> {
    const shown = current.validation;
    if (shown?.step !== "saved" || reopeningFor === shown) return;
    reopeningFor = shown;
    let openError: string | null = null;
    try {
      await deps.history.openPdf(shown.id);
    } catch (error) {
      openError = messageOf(error);
    } finally {
      if (reopeningFor === shown) reopeningFor = null;
    }
    // Après `reset`, `backToMenu` ou une autre validation, ce résultat est périmé : il n'est pas publié.
    if (current.validation === shown && shown.openError !== openError) {
      publish({ validation: { ...shown, openError } });
    }
  }

  function backToMenu(): void {
    const shown = current.validation;
    if (shown === null || shown.step === "detail" || shown.step === "save") return;
    let draft = current.draft;
    if (shown.step === "decide" && shown.warning === "too-long" && draft === "") {
      const last = held !== null && frozen !== null ? lastDish(held.steps.plan, frozen.menu) : null;
      if (last !== null) {
        draft = `Remplace le plat ${dishLetter(last.index)} (« ${printable(last.name)} ») par un plat plus rapide à préparer.`;
      }
    }
    frozen = null;
    held = null;
    publish({ validation: null, validated: null, draft });
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
      if (isSessionBusy(current) || current.validation !== null || text === current.draft) return;
      publish({ draft: text });
    },
    setSessionDay(day) {
      if (
        isSessionBusy(current) ||
        current.validation !== null ||
        day === current.sessionDay ||
        !SESSION_DAYS.includes(day)
      ) {
        return;
      }
      publish({ sessionDay: day });
    },
    setDinners(dinners) {
      const valid = Number.isInteger(dinners) && dinners >= MIN_DINNERS && dinners <= MAX_DINNERS;
      if (
        isSessionBusy(current) ||
        current.validation !== null ||
        !valid ||
        dinners === current.dinners
      ) {
        return;
      }
      publish({ dinners });
    },
    setBudgetDraft(value) {
      if (isSessionBusy(current)) return;
      const read = readEuroInput(value, MAX_BUDGET_EUROS);
      // `isValidBudget` : dernière garde sur la valeur publiée.
      if (read === "invalid" || (read !== null && !isValidBudget(read))) {
        if (value === current.budgetDraft && current.budgetInvalid) return;
        publish({ budgetDraft: value, budgetInvalid: true });
        return;
      }
      if (value === current.budgetDraft && !current.budgetInvalid && read === current.budget)
        return;
      publish({ budgetDraft: value, budgetInvalid: false, budget: read });
    },
    togglePin(name) {
      if (isSessionBusy(current) || current.validation !== null || current.current === null) return;
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
      if (isSessionBusy(current)) return;
      frozen = null;
      held = null;
      publish({
        exchanges: [],
        current: null,
        pinned: [],
        draft: "",
        failure: null,
        validation: null,
        validated: null,
        blocked: null,
      });
    },
    send() {
      if (isSessionBusy(current) || current.validation !== null) {
        return Promise.resolve({ ok: false, reason: "busy" });
      }
      if (current.budgetInvalid) return Promise.resolve({ ok: false, reason: "budget" });
      let prepared: ReturnType<typeof prepare>;
      try {
        prepared = prepare();
      } catch (error) {
        return Promise.resolve(failTechnically(error, current.current !== null));
      }
      if (!("input" in prepared)) return Promise.resolve(prepared);
      const failed: SendOutcome = { ok: false, reason: "failed" };
      return operate<SendOutcome>(
        (error) => ({
          patch: { failure: technicalFailure(error, prepared.revision) },
          result: failed,
        }),
        () => run(prepared),
      );
    },
    validate,
    keepSheet,
    retrySave,
    reopen,
    backToMenu,
  };
}
