import { CATEGORY_LABELS } from "../domain/ingredient.ts";
import type { Finding, RuleId } from "../domain/finding.ts";
import { DAY_LABELS, dishLetter } from "../domain/menu.ts";
import type { Menu, MenuIngredient } from "../domain/menu.ts";
import { FORM_LABELS } from "../domain/ingredient.ts";
import { buildIngredientIndex } from "../ingredients/index-lookup.ts";
import { REFERENTIAL } from "../ingredients/referential.ts";
import { monthName } from "../season/months.ts";
import type { ComposeInput, ComposeResult, StopCause } from "./compose.ts";

const index = buildIngredientIndex(REFERENTIAL);

const RULE_LABELS: Record<RuleId, string> = {
  "menu-shape": "forme",
  exclusion: "exclusion",
  season: "saison",
  "unknown-category": "catégorie",
  "invalid-reply": "réponse",
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
  const form = ingredient.form === defaultForm ? "" : ` (${FORM_LABELS[ingredient.form]})`;
  return `${ingredient.name} ${String(ingredient.qty)} ${unit}${form}`;
}

function describeMenu(menu: Menu): string[] {
  const lines: string[] = [];
  for (const [i, dish] of menu.dishes.entries()) {
    lines.push(`${dishLetter(i)}. ${dish.name} (${DAY_LABELS[dish.day]})`);
    const main = dish.ingredients.filter((ingredient) => !ingredient.sameDay);
    const sameDay = dish.ingredients.filter((ingredient) => ingredient.sameDay);
    if (main.length > 0) lines.push(`   ${main.map(describeIngredient).join(" · ")}`);
    if (sameDay.length > 0) {
      lines.push(`   Le soir même : ${sameDay.map(describeIngredient).join(" · ")}`);
    }
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

function describeTokens(result: ComposeResult): string {
  const { attempts, calls, failedCalls } = result;
  let input = 0;
  let output = 0;
  let cacheRead = 0;
  let cacheWrite = 0;
  for (const { reply } of attempts) {
    input += reply.usage.input;
    output += reply.usage.output;
    cacheRead += reply.usage.cacheRead;
    cacheWrite += reply.usage.cacheWrite;
  }
  const total = input + cacheRead + cacheWrite;
  return (
    `Appels à l'IA : ${calls}${failedCalls > 0 ? ` (dont ${failedCalls} en échec : consommation inconnue)` : ""} · jetons d'entrée : ${total} ` +
    `(hors cache ${input}, lus en cache ${cacheRead}, écrits en cache ${cacheWrite}) · ` +
    `jetons de sortie : ${output}`
  );
}

export function renderComposeResult(result: ComposeResult, input: ComposeInput): string {
  const lines: string[] = [];
  const { best } = result;
  const menu = best?.menu ?? null;
  if (best === null || menu === null) {
    lines.push("Aucun menu lisible.");
  } else {
    lines.push(
      `Menu pour ${monthName(input.month)} (essai ${best.number} sur ${input.maxAttempts})`,
      "",
      ...describeMenu(menu),
      "",
    );
    const { findings, seasonUnchecked, toConfirm } = best.check;
    if (findings.length === 0) {
      lines.push("Constats : aucun");
    } else {
      lines.push("Constats :", ...findings.map((finding) => describeFinding(finding, menu)));
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
  lines.push(describeTokens(result));
  return lines.join("\n");
}
