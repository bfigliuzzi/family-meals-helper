import { isBlankWhenPrinted, printable } from "../ai/printable.ts";
import type { Detail, DetailStep } from "../domain/detail.ts";
import type { Finding } from "../domain/finding.ts";
import { dishLetter } from "../domain/menu.ts";
import type { Menu, Phase } from "../domain/menu.ts";
import { MAX_SESSION_MINUTES, durationText } from "./plan-session.ts";
import type { Equipment } from "../equipment/household.ts";
import { containsWords } from "../ingredients/index-lookup.ts";
import type { IngredientIndex } from "../ingredients/index-lookup.ts";
import { normalizeName } from "../ingredients/normalize.ts";
import { excludedTermsIn } from "../rules/check-exclusions.ts";
import {
  freeTextOf,
  parseStepText,
  plainStepText,
  referencesOf,
  resolveReference,
} from "../pdf/step-text.ts";
import type { ParsedStepText } from "../pdf/step-text.ts";
import { checkSession, isEveningDish, lastDish } from "./check-session.ts";
import type { SessionPlan } from "./plan-session.ts";

export interface DetailCheck {
  findings: Finding[];
  plan: SessionPlan | null;
}

function error(dish: number | null, ingredient: string | null, message: string): Finding {
  return { level: "error", rule: "detail", dish, ingredient, message };
}

function dishOfLetter(menu: Menu, letter: string): number {
  return menu.dishes.findIndex((_, index) => dishLetter(index) === letter);
}

// Une étape va dans le plat de sa première lettre ; une étape sans lettre ou à première lettre inconnue est écartée.
// Les étapes deviennent les phases du menu : `checkSession` les contrôle sans code nouveau. La description est le
// texte sans gras, repères compris : `checkSession` refuse ainsi un texte vide une fois rendu.
export function stepsAsMenu(menu: Menu, detail: Detail): Menu {
  return {
    dishes: menu.dishes.map((dish, index) => ({
      ...dish,
      phases: detail.steps
        .filter((step) => step.dishes[0] === dishLetter(index))
        .map((step): Phase => ({
          id: step.id,
          description: plainStepText(parseStepText(step.text)),
          minutes: step.minutes,
          appliance: step.appliance,
          attended: step.attended,
          after: step.after,
        })),
    })),
  };
}

// Aucune `error` autre que la durée : la fiche peut être imprimée, avec un avertissement si la session dépasse 3 h.
export function isAdmissible(check: DetailCheck): boolean {
  return (
    check.plan !== null &&
    check.findings.every(
      (finding) => finding.level !== "error" || finding.rule === "session-length",
    )
  );
}

function stepFindings(menu: Menu, step: DetailStep, parsed: ParsedStepText): Finding[] {
  const findings: Finding[] = [];
  const letters = [...new Set(step.dishes)];
  // Le titre de phase est imprimé sur la fiche : vide une fois imprimé, il est refusé.
  if (isBlankWhenPrinted(step.phase)) {
    findings.push(
      error(null, null, `L'étape « ${step.id} » n'a pas de titre de phase (\`phase\`).`),
    );
  }
  for (const stray of new Set(parsed.malformed)) {
    findings.push(
      error(
        null,
        null,
        `L'étape « ${step.id} » a un repère mal formé : ${stray}. Un repère s'écrit {a.1}, ou {d.1/e.1} pour un tas partagé, en minuscules et sans espace ; n'écris pas d'autre accolade.`,
      ),
    );
  }
  if (letters.length === 0) {
    findings.push(
      error(
        null,
        null,
        `L'étape « ${step.id} » ne cite aucun plat : donne au moins une lettre dans \`dishes\`.`,
      ),
    );
  }
  for (const letter of letters) {
    const dish = dishOfLetter(menu, letter);
    if (dish === -1) {
      findings.push(
        error(null, null, `L'étape « ${step.id} » cite le plat « ${letter} », qui n'existe pas.`),
      );
    } else if (isEveningDish(menu.dishes[dish]!)) {
      findings.push(
        error(
          dish,
          null,
          `L'étape « ${step.id} » cite le plat « ${letter} », qui se prépare le soir même : aucune étape de session pour ce plat.`,
        ),
      );
    }
  }
  for (const reference of referencesOf(parsed)) {
    const found = resolveReference(menu, reference);
    if (found === null) {
      findings.push(
        error(
          null,
          null,
          `L'étape « ${step.id} » cite le repère {${reference}}, qui ne désigne aucun ingrédient du menu.`,
        ),
      );
    } else if (!letters.includes(dishLetter(found.dish))) {
      findings.push(
        error(
          found.dish,
          found.ingredient.name,
          `L'étape « ${step.id} » cite {${reference}} (${found.ingredient.name}), mais le plat « ${dishLetter(found.dish)} » n'est pas dans ses \`dishes\`.`,
        ),
      );
    } else if (found.ingredient.sameDay) {
      findings.push(
        error(
          found.dish,
          found.ingredient.name,
          `L'étape « ${step.id} » cite {${reference}} (${found.ingredient.name}), un ingrédient du soir même : il ne se prépare pas pendant la session.`,
        ),
      );
    }
  }
  return findings;
}

function eveningFindings(menu: Menu, detail: Detail): Finding[] {
  const findings: Finding[] = [];
  const seen = new Set<number>();
  for (const evening of detail.evenings) {
    const dish = dishOfLetter(menu, evening.dish);
    if (dish === -1) {
      findings.push(
        error(null, null, `La ligne du soir cite le plat « ${evening.dish} », qui n'existe pas.`),
      );
      continue;
    }
    if (seen.has(dish)) {
      findings.push(
        error(
          dish,
          null,
          `Le plat « ${evening.dish} » a plusieurs lignes du soir : une seule par plat.`,
        ),
      );
    }
    seen.add(dish);
    if (isBlankWhenPrinted(evening.text)) {
      findings.push(error(dish, null, `La ligne du soir du plat « ${evening.dish} » est vide.`));
    }
  }
  for (const index of menu.dishes.keys()) {
    if (!seen.has(index)) {
      findings.push(
        error(
          index,
          null,
          `Le plat « ${dishLetter(index)} » n'a pas de ligne du soir : une exactement par plat.`,
        ),
      );
    }
  }
  return findings;
}

// Un ingrédient préparé d'avance, hors placard, qu'aucune étape ne cite par un repère : simple avertissement, qui ne
// coûte pas un essai. Le placard vient de l'index reçu, le même que celui de la composition.
function uncitedFindings(
  menu: Menu,
  steps: readonly { step: DetailStep; parsed: ParsedStepText }[],
  index: IngredientIndex,
): Finding[] {
  const cited = new Set<string>();
  for (const { step, parsed } of steps) {
    const letters = new Set(step.dishes);
    for (const reference of referencesOf(parsed)) {
      if (letters.has(reference.charAt(0))) cited.add(reference);
    }
  }
  const findings: Finding[] = [];
  for (const [dishIndex, dish] of menu.dishes.entries()) {
    for (const [position, ingredient] of dish.ingredients.entries()) {
      if (ingredient.sameDay || index.find(ingredient.name)?.pantry === true) continue;
      if (cited.has(`${dishLetter(dishIndex)}.${position + 1}`)) continue;
      findings.push({
        level: "warning",
        rule: "detail",
        dish: dishIndex,
        ingredient: ingredient.name,
        message: `non cité dans les étapes : ${ingredient.name} (${dishLetter(dishIndex)}).`,
      });
    }
  }
  return findings;
}

// Une quantité en toutes lettres (« 600 g », « 0,5 kg ») : le contrôle cherche ce qui la suit.
const WRITTEN_QUANTITY = /(?<![\d.,])\d+(?:[.,]\d+)?\s?(?:g|kg|ml|cl|l)(?![\p{L}\d])/giu;
// Le nom d'un ingrédient commence au plus tard au 3e mot après la quantité (« 600 g de beaux poireaux »).
const WORDS_BEFORE_NAME = 3;

// Une quantité écrite à la main juste avant le nom d'un ingrédient du menu : avertissement, sans nouvel essai. Les
// quantités d'eau, de sel ou de ce qui n'est pas au menu restent libres. Couverture partielle assumée : nombres en
// lettres et pièces (« 2 oignons ») ne sont pas repérés.
function writtenQuantityFindings(
  menu: Menu,
  step: DetailStep,
  parsed: ParsedStepText,
  index: IngredientIndex,
): Finding[] {
  // Le texte tel qu'il sera imprimé : « 600\u001Bg » s'imprime « 600 g ».
  const free = printable(freeTextOf(parsed));
  const findings: Finding[] = [];
  const seen = new Set<string>();
  for (const match of free.matchAll(WRITTEN_QUANTITY)) {
    const words = free
      .slice(match.index + match[0].length)
      .split(/\s+/)
      .filter((word) => word !== "");
    const candidates = menu.dishes.flatMap((dish, dishIndex) =>
      dish.ingredients.map((ingredient, position) => ({ ingredient, dishIndex, position })),
    );
    // Un ingrédient de l'étape d'abord : son repère est celui à proposer.
    candidates.sort(
      (a, b) =>
        Number(!step.dishes.includes(dishLetter(a.dishIndex))) -
        Number(!step.dishes.includes(dishLetter(b.dishIndex))),
    );
    const found = candidates.find(({ ingredient }) => {
      const ref = index.find(ingredient.name);
      const keys = ref === undefined ? [normalizeName(ingredient.name)] : index.keysOf(ref);
      return keys.some((key) => {
        const window = words.slice(0, WORDS_BEFORE_NAME + key.split(" ").length - 1).join(" ");
        return containsWords(window, key);
      });
    });
    if (found === undefined) continue;
    const name = index.find(found.ingredient.name)?.name ?? found.ingredient.name;
    if (seen.has(name)) continue;
    seen.add(name);
    findings.push({
      level: "warning",
      rule: "detail",
      dish: found.dishIndex,
      ingredient: found.ingredient.name,
      message: `quantité écrite à la main pour ${name} : utilise {${dishLetter(found.dishIndex)}.${found.position + 1}}.`,
    });
  }
  return findings;
}

// Un terme exclu dans le texte imprimé d'une étape, d'un titre de phase ou d'une ligne du soir : `error` de règle
// `exclusion`, donc un nouvel essai, puis le repli (raison « ingrédient exclu »). Les repères ne sont pas lus ici : ils désignent des ingrédients du menu, déjà contrôlés à la composition.
function exclusionFindings(
  detail: Detail,
  parsedSteps: readonly { step: DetailStep; parsed: ParsedStepText }[],
  exclusions: readonly string[],
  index: IngredientIndex,
  menu: Menu,
): Finding[] {
  if (exclusions.length === 0) return [];
  const advice =
    "retire-le, même en garniture, en matière grasse ou pour dire de ne pas en mettre.";
  const excluded = (dish: number | null, message: string): Finding => ({
    level: "error",
    rule: "exclusion",
    dish,
    ingredient: null,
    message,
  });
  const findings: Finding[] = [];
  // Un titre de phase est imprimé une fois par suite d'étapes : un seul constat par titre.
  const titles = new Set<string>();
  for (const { step, parsed } of parsedSteps) {
    for (const raw of excludedTermsIn(printable(freeTextOf(parsed)), exclusions, index)) {
      findings.push(
        excluded(
          null,
          `L'étape « ${step.id} » cite un ingrédient exclu (exclusion : ${raw.trim()}) : ${advice}`,
        ),
      );
    }
    const title = printable(step.phase);
    if (titles.has(title)) continue;
    titles.add(title);
    for (const raw of excludedTermsIn(title, exclusions, index)) {
      findings.push(
        excluded(
          null,
          `Le titre de phase « ${title.trim()} » cite un ingrédient exclu (exclusion : ${raw.trim()}) : ${advice}`,
        ),
      );
    }
  }
  for (const evening of detail.evenings) {
    const dish = dishOfLetter(menu, evening.dish);
    for (const raw of excludedTermsIn(printable(evening.text), exclusions, index)) {
      findings.push(
        excluded(
          dish === -1 ? null : dish,
          `La ligne du soir du plat « ${evening.dish} » cite un ingrédient exclu (exclusion : ${raw.trim()}) : ${advice}`,
        ),
      );
    }
  }
  return findings;
}

// `index` est celui de la composition (construit depuis les `refs` injectées) : jamais d'import implicite du référentiel.
// `exclusions` sont celles de la demande : le texte du détail ne les cite jamais.
export function checkDetail(
  menu: Menu,
  detail: Detail,
  equipment: Equipment,
  index: IngredientIndex,
  exclusions: readonly string[],
): DetailCheck {
  const parsedSteps = detail.steps.map((step) => ({ step, parsed: parseStepText(step.text) }));
  const findings: Finding[] = [
    ...parsedSteps.flatMap(({ step, parsed }) => stepFindings(menu, step, parsed)),
    ...eveningFindings(menu, detail),
    ...exclusionFindings(detail, parsedSteps, exclusions, index, menu),
  ];
  const asMenu = stepsAsMenu(menu, detail);
  const session = checkSession(asMenu, equipment);
  for (const finding of session.findings) {
    findings.push(
      finding.rule === "session-length" && session.plan !== null
        ? { ...finding, message: sessionLengthMessage(session.plan, asMenu) }
        : finding,
    );
  }
  for (const finding of uncitedFindings(menu, parsedSteps, index)) findings.push(finding);
  for (const { step, parsed } of parsedSteps) {
    for (const finding of writtenQuantityFindings(menu, step, parsed, index))
      findings.push(finding);
  }
  return { findings, plan: session.plan };
}

// Le message du lot 3 dit de remplacer le plat le plus long, ce que le détail interdit : les plats sont validés.
function sessionLengthMessage(plan: SessionPlan, menu: Menu): string {
  const last = lastDish(plan, menu);
  return `La session calculée dure ${durationText(plan.minutes)} ; le maximum est ${durationText(MAX_SESSION_MINUTES)} (objectif 2 h à 2 h 30). Ne raccourcis pas une durée réelle. Ne change pas les plats : fais tourner des cuissons en même temps, sépare le travail à la main de ce qui tourne seul, regroupe les préparations communes. Le plat qui finit le plus tard est « ${last.name} » (fin à ${durationText(last.end)}).`;
}
