import { DetailSchema } from "../domain/detail.ts";
import type { Detail } from "../domain/detail.ts";
import type { Finding } from "../domain/finding.ts";
import type { Menu, SessionDay } from "../domain/menu.ts";
import type { Equipment } from "../equipment/household.ts";
import type { IngredientIndex } from "../ingredients/index-lookup.ts";
import { checkDetail, isAdmissible } from "../scheduling/check-detail.ts";
import type { SessionPlan } from "../scheduling/plan-session.ts";
import type { StopCause } from "./compose.ts";
import { buildDetailSystemPrompt, buildDetailUserPrompt } from "./detail-prompt.ts";
import { parseJsonReply } from "./menu-reply.ts";
import type { Model, ModelReply } from "./model.ts";

export interface DetailAttempt {
  number: number;
  reply: ModelReply;
  // null : réponse refusée ou illisible.
  detail: Detail | null;
  findings: Finding[];
  // null : réponse illisible, ou étapes fausses au point de ne pas pouvoir être planifiées.
  plan: SessionPlan | null;
}

export interface DetailResult {
  attempts: DetailAttempt[];
  // Le meilleur essai lisible ; null quand aucune réponse n'était lisible.
  best: DetailAttempt | null;
  stop: StopCause;
  technicalError: string | null;
  // Appels envoyés au modèle, dont ceux qui ont échoué (consommation de jetons inconnue).
  calls: number;
  failedCalls: number;
}

function countErrors(attempt: DetailAttempt): number {
  return attempt.findings.filter((finding) => finding.level === "error").length;
}

// Un essai admissible passe avant un autre ; entre deux admissibles, la durée la plus courte ; entre deux qui ne le
// sont pas, le moins d'`error`. Les égalités vont à l'essai le plus récent (`candidate` vient toujours après `best`).
function isWorse(candidate: DetailAttempt, best: DetailAttempt): boolean {
  const candidateOk = isAdmissible(candidate);
  const bestOk = isAdmissible(best);
  if (candidateOk !== bestOk) return !candidateOk;
  if (candidateOk) return candidate.plan!.minutes > best.plan!.minutes;
  return countErrors(candidate) > countErrors(best);
}

function bestOf(attempts: readonly DetailAttempt[]): DetailAttempt | null {
  let best: DetailAttempt | null = null;
  for (const attempt of attempts) {
    if (attempt.detail === null) continue;
    if (best === null || !isWorse(attempt, best)) best = attempt;
  }
  return best;
}

// Ne rejette jamais : une erreur du modèle devient stop "technical-error", les essais déjà payés restent.
export async function detailMenu(
  input: {
    menu: Menu;
    sessionDay: SessionDay;
    maxAttempts: 1 | 2 | 3;
    // Durée du planning des grandes phases de la composition, en minutes : la base de durée du détail.
    composedMinutes: number;
    // Exclusions de la demande : données au prompt, et contrôlées dans les textes du détail.
    exclusions: readonly string[];
  },
  deps: {
    model: Model;
    equipment: Equipment;
    index: IngredientIndex;
    onAttempt?: (attempt: DetailAttempt) => void;
  },
): Promise<DetailResult> {
  const system = buildDetailSystemPrompt(deps.equipment);
  const attempts: DetailAttempt[] = [];
  let stop: StopCause = "max-attempts";
  let technicalError: string | null = null;
  let calls = 0;
  let failedCalls = 0;
  // Plafond dans le moteur : jamais plus de 3 essais, quelle que soit la valeur reçue.
  const maxAttempts = Math.min(3, Math.max(1, Math.trunc(input.maxAttempts)));
  // Un journal qui lève ne doit pas faire perdre un détail déjà payé.
  const notify = (attempt: DetailAttempt): void => {
    try {
      deps.onAttempt?.(attempt);
    } catch {
      // ignoré
    }
  };

  for (let number = 1; number <= maxAttempts; number++) {
    const previous = attempts[attempts.length - 1];
    const user = buildDetailUserPrompt({
      menu: input.menu,
      sessionDay: input.sessionDay,
      composedMinutes: input.composedMinutes,
      exclusions: input.exclusions,
      ...(previous === undefined
        ? {}
        : {
            previous: {
              detail: previous.detail,
              rawText: previous.reply.text,
              findings: previous.findings,
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
      const attempt: DetailAttempt = { number, reply, detail: null, findings: [], plan: null };
      attempts.push(attempt);
      notify(attempt);
      stop = "refusal";
      break;
    }

    const parsed = parseJsonReply(reply.text, DetailSchema);
    let attempt: DetailAttempt;
    if (parsed.ok) {
      const check = checkDetail(
        input.menu,
        parsed.value,
        deps.equipment,
        deps.index,
        input.exclusions,
      );
      attempt = { number, reply, detail: parsed.value, findings: check.findings, plan: check.plan };
    } else {
      const finding: Finding = {
        level: "error",
        rule: "invalid-reply",
        dish: null,
        ingredient: null,
        message: parsed.error,
      };
      attempt = { number, reply, detail: null, findings: [finding], plan: null };
    }
    attempts.push(attempt);
    notify(attempt);

    // Un détail lisible sans `error` est accepté, même si la réponse est marquée coupée ; des `warning` peuvent rester.
    if (attempt.detail !== null && countErrors(attempt) === 0) {
      stop = "valid";
      break;
    }
    if (reply.stopReason === "max_tokens" || reply.stopReason === "model_context_window_exceeded") {
      stop = "truncated";
      break;
    }
    if (attempt.detail === null) {
      if (previous?.detail === null && previous.reply.text.trim() === reply.text.trim()) {
        stop = "same-unreadable";
        break;
      }
      continue;
    }
    if (
      previous?.detail != null &&
      JSON.stringify(previous.detail) === JSON.stringify(attempt.detail)
    ) {
      stop = "no-progress";
      break;
    }
  }

  return { attempts, best: bestOf(attempts), stop, technicalError, calls, failedCalls };
}
