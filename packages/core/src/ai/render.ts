import { CATEGORY_LABELS } from "../domain/ingredient.ts";
import type { Finding, RuleId } from "../domain/finding.ts";
import { DAY_LABELS, SESSION_DAY_LABELS, dishLetter } from "../domain/menu.ts";
import type { Menu, MenuIngredient } from "../domain/menu.ts";
import { FORM_LABELS } from "../domain/ingredient.ts";
import { APPLIANCE_LABELS, phaseUseText } from "../equipment/household.ts";
import { buildIngredientIndex } from "../ingredients/index-lookup.ts";
import { REFERENTIAL } from "../ingredients/referential.ts";
import { THAW_INSTRUCTION_FR } from "../rules/check-conservation.ts";
import type { DishKeeping } from "../rules/check-conservation.ts";
import { FRESH_FISH_CATEGORIES } from "../rules/conservation-table.ts";
import { categoryOf } from "../rules/dish-profile.ts";
import { MAX_SESSION_MINUTES, clockText, durationText } from "../scheduling/plan-session.ts";
import type { SessionPlan } from "../scheduling/plan-session.ts";
import { monthName } from "../season/months.ts";
import type { ComposeInput, ComposeResult, StopCause } from "./compose.ts";
import type { BatchResult } from "./batch.ts";
import type { ModelReply } from "./model.ts";
import { printable } from "./printable.ts";

const index = buildIngredientIndex(REFERENTIAL);

export const RULE_LABELS: Record<RuleId, string> = {
  "menu-shape": "forme",
  exclusion: "exclusion",
  season: "saison",
  "unknown-category": "catégorie",
  "invalid-reply": "réponse",
  conservation: "conservation",
  "day-order": "ordre des jours",
  reheat: "réchauffage",
  fish: "poisson",
  vegetables: "légumes",
  pulses: "légumes secs",
  meat: "viande",
  "cured-meat": "charcuterie",
  "same-protein": "même protéine",
  "whole-starch": "féculent complet",
  quantity: "quantité",
  phases: "phases",
  equipment: "équipement",
  "extra-appliance": "appareil d'appoint",
  "session-length": "durée de session",
  detail: "détail",
};

const STOP_MESSAGES: Partial<Record<StopCause, string>> = {
  refusal: "L'IA a refusé la demande.",
  truncated: "Réponse coupée (plafond de jetons atteint).",
  "no-progress": "L'IA a renvoyé le même menu : arrêt.",
  "same-unreadable": "L'IA a renvoyé deux fois la même réponse illisible : arrêt.",
};

function describeIngredient(ingredient: MenuIngredient): string {
  const unit =
    ingredient.unit === "piece" ? (ingredient.qty > 1 ? "pièces" : "pièce") : ingredient.unit;
  const defaultForm = index.find(ingredient.name)?.defaultForm ?? "fresh";
  // La forme du poisson est toujours affichée : le foyer n'en achète pas de frais.
  const category = categoryOf(ingredient, index);
  const isFish = category !== null && FRESH_FISH_CATEGORIES.includes(category);
  const form =
    ingredient.form === defaultForm && !isFish ? "" : ` (${FORM_LABELS[ingredient.form]})`;
  return `${ingredient.name} ${String(ingredient.qty)} ${unit}${form}`;
}

function describeMenu(menu: Menu, keeping: readonly DishKeeping[]): string[] {
  const lines: string[] = [];
  for (const [i, dish] of menu.dishes.entries()) {
    const days = keeping[i]?.fridgeDays ?? null;
    const detail = days === null ? "" : ` · se garde ${days} j au frigo`;
    lines.push(`${dishLetter(i)}. ${dish.name} (${DAY_LABELS[dish.day]}${detail})`);
    const main = dish.ingredients.filter((ingredient) => !ingredient.sameDay);
    const sameDay = dish.ingredients.filter((ingredient) => ingredient.sameDay);
    if (main.length > 0) lines.push(`   ${main.map(describeIngredient).join(" · ")}`);
    if (sameDay.length > 0) {
      lines.push(`   Le soir même : ${sameDay.map(describeIngredient).join(" · ")}`);
    }
    if (keeping[i]?.toFreeze === true) lines.push(`   À congeler : ${THAW_INSTRUCTION_FR}`);
  }
  return lines;
}

function describeFinding(finding: Finding, menu: Menu): string {
  const dish = finding.dish === null ? undefined : menu.dishes[finding.dish];
  const where =
    finding.dish === null || dish === undefined
      ? ""
      : ` · plat ${dishLetter(finding.dish)} « ${dish.name} »`;
  const separator = where === "" ? " · " : " : ";
  return `[${finding.level}] ${RULE_LABELS[finding.rule]}${where}${separator}${finding.message}`;
}

// Les error d'abord, puis les warning ; l'ordre d'origine sinon.
function sortFindings(findings: readonly Finding[]): Finding[] {
  const rank = (finding: Finding): number => (finding.level === "error" ? 0 : 1);
  return findings
    .map((finding, position) => ({ finding, position }))
    .sort((a, b) => rank(a.finding) - rank(b.finding) || a.position - b.position)
    .map((entry) => entry.finding);
}

interface Spent {
  attempts: readonly { reply: ModelReply }[];
  calls: number;
  failedCalls: number;
}

function describeTokens(label: string, results: readonly Spent[]): string {
  let calls = 0;
  let failedCalls = 0;
  let input = 0;
  let output = 0;
  let cacheRead = 0;
  let cacheWrite = 0;
  for (const result of results) {
    calls += result.calls;
    failedCalls += result.failedCalls;
    for (const { reply } of result.attempts) {
      input += reply.usage.input;
      output += reply.usage.output;
      cacheRead += reply.usage.cacheRead;
      cacheWrite += reply.usage.cacheWrite;
    }
  }
  const total = input + cacheRead + cacheWrite;
  return (
    `${label} : ${calls}${failedCalls > 0 ? ` (dont ${failedCalls} en échec : consommation inconnue)` : ""} · jetons d'entrée : ${total} ` +
    `(hors cache ${input}, lus en cache ${cacheRead}, écrits en cache ${cacheWrite}) · ` +
    `jetons de sortie : ${output}`
  );
}

function describeSession(session: SessionPlan | null): string[] {
  if (session === null) {
    return ["Session : durée non calculée, phases à corriger (voir les constats)."];
  }
  const extras =
    session.extras.length === 0
      ? "aucun"
      : session.extras.map((id) => APPLIANCE_LABELS[id]).join(", ");
  return [
    `Session calculée : ${durationText(session.minutes)} (objectif 2 h à 2 h 30, ${durationText(MAX_SESSION_MINUTES)} au plus) · appareil d'appoint : ${extras}`,
    "Planning :",
    ...session.phases.map(
      ({ dish, phase, start, end }) =>
        `   ${clockText(start)}–${clockText(end)} · ${dishLetter(dish)}. ${phase.description} · ${phaseUseText(phase)}`,
    ),
  ];
}

export function renderComposeResult(result: ComposeResult, input: ComposeInput): string {
  const lines: string[] = [];
  const { best } = result;
  const menu = best?.menu ?? null;
  if (best === null || menu === null) {
    lines.push("Aucun menu lisible.");
  } else {
    lines.push(
      `Menu pour ${monthName(input.month)}, session le ${SESSION_DAY_LABELS[input.sessionDay]} (essai ${best.number} sur ${input.maxAttempts})`,
      "",
      ...describeMenu(menu, best.check.keeping),
      "",
      ...describeSession(best.check.session),
      "",
    );
    const { findings, seasonUnchecked, toConfirm } = best.check;
    if (findings.length === 0) {
      lines.push("Constats : aucun");
    } else {
      lines.push(
        "Constats :",
        ...sortFindings(findings).map((finding) => describeFinding(finding, menu)),
      );
    }
    if (seasonUnchecked.length > 0) {
      lines.push(`Contrôle de saison partiel, non vérifiés : ${seasonUnchecked.join(", ")}`);
    }
    if (toConfirm.length > 0) {
      lines.push(
        `À confirmer (absents du référentiel) : ${toConfirm
          .map((entry) => `${entry.name} (${CATEGORY_LABELS[entry.category]})`)
          .join(", ")}`,
      );
    }
  }
  const stopMessage = STOP_MESSAGES[result.stop];
  if (stopMessage !== undefined) lines.push(stopMessage);
  if (result.technicalError !== null) lines.push(`Erreur technique : ${result.technicalError}`);
  lines.push(describeTokens("Appels à l'IA", [result]));
  return lines.map(printable).join("\n");
}

const DETAIL_STOP_MESSAGES: Partial<Record<StopCause, string>> = {
  ...STOP_MESSAGES,
  refusal: "L'IA a refusé de rédiger le détail.",
  "no-progress": "L'IA a renvoyé la même fiche : arrêt.",
};

function describeDetail(result: BatchResult, input: ComposeInput): string[] {
  const menu = result.compose.best?.menu ?? null;
  const { detail } = result;
  if (detail === null || menu === null) {
    return [
      result.stoppedBecause === "menu-errors"
        ? "Détail : non demandé, le menu garde des erreurs."
        : "Détail : non demandé, aucun menu lisible.",
    ];
  }
  const { best } = detail;
  const lines = [
    best === null
      ? `Détail : aucun essai lisible sur ${input.maxAttempts}.`
      : `Détail : essai ${best.number} retenu sur ${input.maxAttempts}${best.plan === null ? "" : ` · durée calculée ${durationText(best.plan.minutes)} (${durationText(MAX_SESSION_MINUTES)} au plus)`}`,
  ];
  if (best !== null) {
    lines.push(
      best.findings.length === 0 ? "Constats du détail : aucun" : "Constats du détail :",
      ...sortFindings(best.findings).map((finding) => describeFinding(finding, menu)),
    );
  }
  const stopMessage = DETAIL_STOP_MESSAGES[detail.stop];
  if (stopMessage !== undefined) lines.push(stopMessage);
  if (detail.technicalError !== null) lines.push(`Erreur technique : ${detail.technicalError}`);
  lines.push(describeTokens("Appels pour le détail", [detail]));
  return lines;
}

// Le texte dit lequel des deux cas du code 1 s'applique : repli sur les grandes phases, ou session de plus de 3 h.
function describeOutcome(result: BatchResult): string | null {
  if (result.fallback !== null) {
    return `Fiche de repli : ${result.fallbackReason ?? "détail non utilisable"}. Le PDF donne les grandes phases du menu, avec un avertissement.`;
  }
  const best = result.detail?.best;
  if (
    result.sheet !== null &&
    best != null &&
    best.findings.some((finding) => finding.level === "error")
  ) {
    return "Session de plus de 3 h : le PDF donne les étapes détaillées, avec un avertissement en première page.";
  }
  return null;
}

export function renderBatchResult(result: BatchResult, input: ComposeInput): string {
  const lines = [
    renderComposeResult(result.compose, input),
    "",
    ...describeDetail(result, input).map(printable),
  ];
  const outcome = describeOutcome(result);
  if (outcome !== null) lines.push(outcome);
  const spent: Spent[] =
    result.detail === null ? [result.compose] : [result.compose, result.detail];
  lines.push(describeTokens("Total des appels", spent));
  return lines.join("\n");
}
