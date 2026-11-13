import type { Finding, RuleId } from "../domain/finding.ts";
import type { IngredientRef } from "../domain/ingredient.ts";
import type { Menu, SessionDay } from "../domain/menu.ts";
import { buildIngredientIndex } from "../ingredients/index-lookup.ts";
import { checkMenu } from "../rules/check-menu.ts";
import type { MenuCheck } from "../rules/check-menu.ts";
import type { CheckContext } from "../rules/context.ts";
import { expectedDinners } from "../rules/menu-shape.ts";
import { inSeasonNames } from "../season/check-season.ts";
import type { Month, SeasonRow } from "../season/months.ts";
import { parseMenuReply } from "./menu-reply.ts";
import type { MenuModel, ModelReply } from "./model.ts";
import { buildSystemPrompt, buildUserPrompt } from "./prompt.ts";

export interface ComposeInput {
  request: string;
  exclusions: readonly string[];
  month: Month;
  sessionDay: SessionDay;
  maxAttempts: 1 | 2 | 3;
}

export interface Attempt {
  number: number;
  reply: ModelReply;
  menu: Menu | null;
  check: MenuCheck;
}

export type StopCause =
  | "valid"
  | "max-attempts"
  | "refusal"
  | "truncated"
  | "no-progress"
  | "same-unreadable"
  | "technical-error";

export interface ComposeResult {
  attempts: Attempt[];
  best: Attempt | null;
  stop: StopCause;
  technicalError: string | null;
  // Appels envoyés au modèle, dont ceux qui ont échoué (consommation de jetons inconnue).
  calls: number;
  failedCalls: number;
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
  return { findings: [finding], keeping: [], seasonUnchecked: [], toConfirm: [] };
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

// Ne rejette jamais : une erreur du modèle devient stop "technical-error", les essais déjà payés restent.
export async function composeMenu(
  input: ComposeInput,
  deps: {
    model: MenuModel;
    refs: readonly IngredientRef[];
    seasonTable: Readonly<Record<string, SeasonRow>>;
    onAttempt?: (attempt: Attempt) => void;
  },
): Promise<ComposeResult> {
  const ctx: CheckContext = {
    request: input.request,
    exclusions: input.exclusions,
    month: input.month,
    sessionDay: input.sessionDay,
    dinners: expectedDinners(input.request),
    index: buildIngredientIndex(deps.refs),
    seasonTable: deps.seasonTable,
  };
  const system = buildSystemPrompt(deps.refs);
  const inSeason = inSeasonNames(input.month, deps.refs, deps.seasonTable);
  const attempts: Attempt[] = [];
  let stop: StopCause = "max-attempts";
  let technicalError: string | null = null;
  let calls = 0;
  let failedCalls = 0;
  // Constats du dernier essai à renvoyer, et règles `warning` déjà renvoyées.
  let pending: Finding[] = [];
  const sent = new Set<RuleId>();
  // Plafond dans le moteur : jamais plus de 3 essais, quelle que soit la valeur reçue.
  const maxAttempts = Math.min(3, Math.max(1, Math.trunc(input.maxAttempts)));
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
    const user = buildUserPrompt({
      request: input.request,
      exclusions: input.exclusions,
      month: input.month,
      sessionDay: input.sessionDay,
      dinners: ctx.dinners,
      inSeason,
      ...(previous === undefined
        ? {}
        : {
            previous: {
              menu: previous.menu,
              rawText: previous.reply.text,
              findings: pending,
            },
          }),
    });

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
        check: { findings: [], keeping: [], seasonUnchecked: [], toConfirm: [] },
      };
      attempts.push(attempt);
      notify(attempt);
      stop = "refusal";
      break;
    }

    const parsed = parseMenuReply(reply.text);
    const attempt: Attempt = parsed.ok
      ? { number, reply, menu: parsed.menu, check: checkMenu(parsed.menu, ctx) }
      : { number, reply, menu: null, check: unreadable(parsed.error) };
    attempts.push(attempt);
    notify(attempt);

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

  return { attempts, best: bestOf(attempts), stop, technicalError, calls, failedCalls };
}

// 0 : aucun constat error ; 1 : il en reste ; 2 : aucun menu lisible.
export function exitCodeOf(result: ComposeResult): 0 | 1 | 2 {
  if (result.best === null) return 2;
  return countErrors(result.best.check) === 0 ? 0 : 1;
}
