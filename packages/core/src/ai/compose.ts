import type { Finding, RuleId } from "../domain/finding.ts";
import type { IngredientRef } from "../domain/ingredient.ts";
import type { Equipment } from "../equipment/household.ts";
import type { Menu, SessionDay } from "../domain/menu.ts";
import { buildIngredientIndex } from "../ingredients/index-lookup.ts";
import { checkMenu } from "../rules/check-menu.ts";
import type { MenuCheck } from "../rules/check-menu.ts";
import { checkPinned, dishKey } from "../rules/check-pinned.ts";
import type { CheckContext } from "../rules/context.ts";
import { expectedDinners } from "../rules/menu-shape.ts";
import { inSeasonNames } from "../season/check-season.ts";
import type { Month, SeasonRow } from "../season/months.ts";
import { parseMenuReply } from "./menu-reply.ts";
import type { Model, ModelReply } from "./model.ts";
import { buildSystemPrompt, buildUserPrompt } from "./prompt.ts";
import { isBlankWhenPrinted } from "./printable.ts";

// Un menu d'une session passée : sa date et les noms de ses plats (le prompt demande de ne pas les reprendre).
export interface PastMenu {
  date: string;
  dishes: readonly string[];
}

// L'appelant ne modifie pas l'entrée pendant l'appel ; seules les épingles sont copiées, avant le premier `await`.
export interface ComposeInput {
  request: string;
  exclusions: readonly string[];
  month: Month;
  sessionDay: SessionDay;
  maxAttempts: 1 | 2 | 3;
  pinned: readonly string[];
  history: readonly PastMenu[];
  // Nombre de dîners voulu (entier de 1 à 5) ; absent : le nombre écrit dans la demande ; donné, il n'est jamais lu dans la demande.
  dinners?: number;
}

// Même règle que `ComposeInput` : l'entrée n'est pas modifiée pendant l'appel, seules les épingles sont copiées.
export interface ReviseInput {
  // Demande d'origine : sert à la saison, au style et au prompt.
  initialRequest: string;
  // Message courant de l'utilisateur.
  message: string;
  current: Menu;
  // Messages précédents de l'utilisateur ; le prompt n'en garde que les derniers, mais le contrôle de saison les lit tous.
  conversation: readonly string[];
  exclusions: readonly string[];
  month: Month;
  sessionDay: SessionDay;
  maxAttempts: 1 | 2 | 3;
  pinned: readonly string[];
  history: readonly PastMenu[];
  // Nombre de dîners voulu (entier de 1 à 5) ; absent : le nombre de plats du menu courant. Jamais lu dans le message.
  dinners?: number;
}

export interface Attempt {
  number: number;
  reply: ModelReply;
  menu: Menu | null;
  check: MenuCheck;
  // Plats que l'IA dit nommés par la demande ou le message ; vide et `note` null pour un essai illisible ou refusé.
  requested: readonly string[];
  note: string | null;
}

export type StopCause =
  | "valid"
  | "max-attempts"
  | "refusal"
  | "truncated"
  | "no-progress"
  | "same-unreadable"
  | "technical-error"
  | "pinned-removed";

export interface ComposeResult {
  attempts: Attempt[];
  best: Attempt | null;
  stop: StopCause;
  technicalError: string | null;
  // Appels envoyés au modèle, dont ceux qui ont échoué (consommation de jetons inconnue).
  calls: number;
  failedCalls: number;
  // Plats épinglés à garder pour la suite : toujours présents dans `best` (ceux d'entrée seulement si `best` est null).
  pinned: string[];
  // Épingles d'entrée absentes d'au moins un essai lisible, quand aucun essai lisible ne les garde toutes (`best` est
  // null). Peut être rempli avec `stop` à "refusal", "truncated" ou "technical-error". Une perte à un essai tardif
  // peut être corrigée par un essai suivant : seul l'arrêt "pinned-removed" oblige l'appelant à garder son menu courant.
  pinnedRemoved: string[];
}

function countErrors(check: MenuCheck): number {
  return check.findings.filter((finding) => finding.level === "error").length;
}

function countWarnings(check: MenuCheck): number {
  return check.findings.filter((finding) => finding.level === "warning").length;
}

function unreadable(message: string): MenuCheck {
  const finding: Finding = {
    level: "error",
    rule: "invalid-reply",
    dish: null,
    ingredient: null,
    message,
  };
  return { findings: [finding], keeping: [], seasonUnchecked: [], toConfirm: [], session: null };
}

// Moins d'error, puis moins de warning ; à égalité, l'essai le plus récent.
function bestOf(attempts: readonly Attempt[]): Attempt | null {
  let best: Attempt | null = null;
  for (const attempt of attempts) {
    if (attempt.menu === null) continue;
    if (best === null || !isWorse(attempt.check, best.check)) best = attempt;
  }
  return best;
}

function isWorse(candidate: MenuCheck, best: MenuCheck): boolean {
  const left = [countErrors(candidate), countWarnings(candidate)];
  const right = [countErrors(best), countWarnings(best)];
  for (const [i, value] of left.entries()) {
    if (value !== right[i]) return value > right[i]!;
  }
  return false;
}

// Constats à renvoyer à l'IA : tout `error`, et chaque règle `warning` une seule fois (un seul essai de
// correction par règle souple, conception §2).
function findingsToSend(check: MenuCheck, sent: ReadonlySet<RuleId>): Finding[] {
  return check.findings.filter((finding) => finding.level === "error" || !sent.has(finding.rule));
}

interface ComposeDeps {
  model: Model;
  refs: readonly IngredientRef[];
  seasonTable: Readonly<Record<string, SeasonRow>>;
  equipment: Equipment;
  onAttempt?: (attempt: Attempt) => void;
}

interface Cycle {
  ctx: CheckContext;
  maxAttempts: 1 | 2 | 3;
  // Prompt utilisateur d'un essai, avec les épingles du moment et, dès le deuxième essai, le précédent.
  userPrompt: (
    pinned: readonly string[],
    previous: { menu: Menu | null; rawText: string; findings: readonly Finding[] } | undefined,
  ) => string;
  inputPinned: readonly string[];
  // Noms des plats du menu de départ (révision) : un plat déjà là n'est pas épinglé parce que l'IA le marque.
  baseline: readonly string[];
  // Révision : un premier essai qui retire un plat épinglé d'entrée arrête tout, sans nouvel essai.
  stopOnInputPinRemoval: boolean;
}

function hasKey(names: readonly string[], name: string): boolean {
  const key = dishKey(name);
  return names.some((other) => dishKey(other) === key);
}

function namesOf(menu: Menu | null): string[] {
  return menu === null ? [] : menu.dishes.map((dish) => dish.name);
}

function losesPin(attempt: Attempt): boolean {
  return attempt.check.findings.some((finding) => finding.rule === "pinned");
}

// Épingles à rendre : celles d'entrée, puis celles acquises pendant le cycle ou marquées `requested` par l'essai
// retenu, seulement si le menu retenu les contient. Jamais une épingle absente de `best`.
function pinnedOf(
  best: Attempt | null,
  inputPinned: readonly string[],
  pinnedNow: readonly string[],
  baseline: readonly string[],
): string[] {
  const result = [...inputPinned];
  if (best === null || best.menu === null) return result;
  const { menu } = best;
  const candidates = [
    ...pinnedNow.slice(inputPinned.length),
    ...best.requested.filter((name) => !hasKey(baseline, name)),
  ];
  for (const name of candidates) {
    if (isBlankWhenPrinted(name) || hasKey(result, name)) continue;
    if (
      hasKey(
        menu.dishes.map((dish) => dish.name),
        name,
      )
    )
      result.push(name);
  }
  return result;
}

function checkDinners(dinners: number): void {
  if (!Number.isInteger(dinners) || dinners < 1 || dinners > 5) {
    throw new Error("Le nombre de dîners doit être un entier de 1 à 5.");
  }
}

// Ne rejette jamais : une erreur du modèle devient stop "technical-error", les essais déjà payés restent.
async function runCycle(cycle: Cycle, deps: ComposeDeps): Promise<ComposeResult> {
  const { ctx, inputPinned, baseline } = cycle;
  const system = buildSystemPrompt(deps.refs, deps.equipment);
  const attempts: Attempt[] = [];
  let stop: StopCause = "max-attempts";
  let technicalError: string | null = null;
  let calls = 0;
  let failedCalls = 0;
  // Constats du dernier essai à renvoyer, et règles `warning` déjà renvoyées.
  let pending: Finding[] = [];
  const sent = new Set<RuleId>();
  // Épingles du moment : celles d'entrée (copiées, `inputPinned` n'est jamais modifié), plus les plats que l'IA a
  // marqués `requested` dans un essai lisible, protégés pour les essais suivants.
  const pinnedNow = [...inputPinned];
  // Plafond dans le moteur : jamais plus de 3 essais, quelle que soit la valeur reçue.
  const maxAttempts = Math.min(3, Math.max(1, Math.trunc(cycle.maxAttempts)));
  // Un journal qui lève ne doit pas faire perdre une composition déjà payée.
  const notify = (attempt: Attempt): void => {
    try {
      deps.onAttempt?.(attempt);
    } catch {
      // ignoré
    }
  };

  for (let number = 1; number <= maxAttempts; number++) {
    const previous = attempts[attempts.length - 1];
    const user = cycle.userPrompt(
      pinnedNow,
      previous === undefined
        ? undefined
        : { menu: previous.menu, rawText: previous.reply.text, findings: pending },
    );

    let reply: ModelReply;
    calls++;
    try {
      reply = await deps.model.complete({ system, user });
    } catch (error) {
      failedCalls++;
      stop = "technical-error";
      technicalError = error instanceof Error ? error.message : String(error);
      break;
    }

    if (reply.stopReason === "refusal") {
      const attempt: Attempt = {
        number,
        reply,
        menu: null,
        check: { findings: [], keeping: [], seasonUnchecked: [], toConfirm: [], session: null },
        requested: [],
        note: null,
      };
      attempts.push(attempt);
      notify(attempt);
      stop = "refusal";
      break;
    }

    const parsed = parseMenuReply(reply.text);
    let attempt: Attempt;
    if (parsed.ok) {
      const check = checkMenu(parsed.menu, ctx);
      // Le contrôle de cet essai porte sur les épingles d'avant lui.
      const findings = [...check.findings, ...checkPinned(parsed.menu, pinnedNow)];
      attempt = {
        number,
        reply,
        menu: parsed.menu,
        check: { ...check, findings },
        requested: parsed.requested,
        note: parsed.note,
      };
      // Un essai qui perd une épingle n'apprend rien : ses `requested` ne sont pas retenus.
      if (!losesPin(attempt)) {
        for (const name of parsed.requested) {
          if (isBlankWhenPrinted(name) || hasKey(baseline, name) || hasKey(pinnedNow, name)) {
            continue;
          }
          pinnedNow.push(name);
        }
      }
    } else {
      attempt = {
        number,
        reply,
        menu: null,
        check: unreadable(parsed.error),
        requested: [],
        note: null,
      };
    }
    attempts.push(attempt);
    notify(attempt);

    if (cycle.stopOnInputPinRemoval && number === 1 && losesPin(attempt)) {
      stop = "pinned-removed";
      break;
    }

    // Un menu lisible sans constat à renvoyer est accepté, même si la réponse est marquée coupée ;
    // des warning peuvent rester.
    pending = attempt.menu === null ? attempt.check.findings : findingsToSend(attempt.check, sent);
    if (attempt.menu !== null && pending.length === 0) {
      stop = "valid";
      break;
    }
    for (const finding of pending) if (finding.level === "warning") sent.add(finding.rule);
    if (reply.stopReason === "max_tokens" || reply.stopReason === "model_context_window_exceeded") {
      stop = "truncated";
      break;
    }
    if (attempt.menu === null) {
      if (previous?.menu === null && previous.reply.text.trim() === reply.text.trim()) {
        stop = "same-unreadable";
        break;
      }
      continue;
    }
    if (previous?.menu != null && JSON.stringify(previous.menu) === JSON.stringify(attempt.menu)) {
      stop = "no-progress";
      break;
    }
  }

  // Le menu retenu ne perd aucune épingle : un essai qui en perd une n'est jamais `best`, même avec moins d'erreurs.
  const readable = attempts.filter((attempt) => attempt.menu !== null);
  const best = bestOf(readable.filter((attempt) => !losesPin(attempt)));
  let pinnedRemoved: string[] = [];
  if (best === null && readable.length > 0) {
    // Une cause plus précise (refus, coupure, erreur technique) reste ; `pinnedRemoved` signale la perte.
    if (stop !== "refusal" && stop !== "truncated" && stop !== "technical-error") {
      stop = "pinned-removed";
    }
    // Aucun essai lisible ne garde toutes les épingles, donc aucune n'a pu être acquise : ce sont celles d'entrée.
    pinnedRemoved = inputPinned.filter((name) =>
      readable.some((attempt) => !hasKey(namesOf(attempt.menu), name)),
    );
  }
  return {
    attempts,
    best,
    stop,
    technicalError,
    calls,
    failedCalls,
    pinned: pinnedOf(best, inputPinned, pinnedNow, baseline),
    pinnedRemoved,
  };
}

// Rejette (avant tout appel) un `dinners` hors des entiers de 1 à 5 : c'est une erreur de l'appelant, pas de l'IA.
// Pour le reste, ne rejette jamais, comme `runCycle`.
export async function composeMenu(input: ComposeInput, deps: ComposeDeps): Promise<ComposeResult> {
  const dinners = input.dinners ?? expectedDinners(input.request);
  checkDinners(dinners);
  const inSeason = inSeasonNames(input.month, deps.refs, deps.seasonTable);
  return runCycle(
    {
      ctx: {
        request: input.request,
        exclusions: input.exclusions,
        month: input.month,
        sessionDay: input.sessionDay,
        dinners,
        index: buildIngredientIndex(deps.refs),
        seasonTable: deps.seasonTable,
        equipment: deps.equipment,
      },
      maxAttempts: input.maxAttempts,
      userPrompt: (pinned, previous) =>
        buildUserPrompt({
          request: input.request,
          exclusions: input.exclusions,
          month: input.month,
          sessionDay: input.sessionDay,
          dinners,
          dinnersFixed: input.dinners !== undefined,
          inSeason,
          pinned,
          history: input.history,
          ...(previous === undefined ? {} : { previous }),
        }),
      // Copie avant le premier `await` : l'appelant peut modifier son tableau pendant l'appel.
      inputPinned: [...input.pinned],
      baseline: [],
      stopOnInputPinRemoval: false,
    },
    deps,
  );
}

// Modifie le menu courant selon le message. Rejette (avant tout appel) un `dinners` hors des entiers de 1 à 5 :
// c'est une erreur de l'appelant, pas de l'IA. Seul l'arrêt `stop` "pinned-removed" oblige l'appelant à garder le menu
// courant tel quel. Il survient dans deux cas : le premier essai retire un plat épinglé (arrêt immédiat), ou aucun essai
// lisible ne garde toutes les épingles (par exemple un premier essai illisible, puis des essais qui en perdent une).
// `pinnedRemoved` peut aussi être rempli avec "refusal", "truncated" ou "technical-error" (voir `ComposeResult`).
export async function reviseMenu(input: ReviseInput, deps: ComposeDeps): Promise<ComposeResult> {
  const dinners = input.dinners ?? input.current.dishes.length;
  checkDinners(dinners);
  const inSeason = inSeasonNames(input.month, deps.refs, deps.seasonTable);
  return runCycle(
    {
      ctx: {
        // Toute la conversation, pas seulement les derniers messages du prompt : un ingrédient hors saison demandé
        // plus tôt reste permis.
        request: [input.initialRequest, ...input.conversation, input.message].join("\n"),
        exclusions: input.exclusions,
        month: input.month,
        sessionDay: input.sessionDay,
        dinners,
        index: buildIngredientIndex(deps.refs),
        seasonTable: deps.seasonTable,
        equipment: deps.equipment,
      },
      maxAttempts: input.maxAttempts,
      userPrompt: (pinned, previous) =>
        buildUserPrompt({
          request: input.message,
          exclusions: input.exclusions,
          month: input.month,
          sessionDay: input.sessionDay,
          dinners,
          dinnersFixed: input.dinners !== undefined,
          inSeason,
          pinned,
          history: input.history,
          revision: {
            initialRequest: input.initialRequest,
            current: input.current,
            conversation: input.conversation,
          },
          ...(previous === undefined ? {} : { previous }),
        }),
      inputPinned: [...input.pinned],
      baseline: input.current.dishes.map((dish) => dish.name),
      stopOnInputPinRemoval: true,
    },
    deps,
  );
}

// 0 : aucun constat error ; 1 : il en reste ; 2 : aucun menu lisible.
export function exitCodeOf(result: ComposeResult): 0 | 1 | 2 {
  if (result.best === null) return 2;
  return countErrors(result.best.check) === 0 ? 0 : 1;
}
