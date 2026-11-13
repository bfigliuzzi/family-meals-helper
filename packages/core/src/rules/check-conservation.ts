import { CATEGORY_LABELS, FORM_LABELS } from "../domain/ingredient.ts";
import type { Category } from "../domain/ingredient.ts";
import type { Finding } from "../domain/finding.ts";
import { DAYS, DAY_LABELS, daysAfterSession } from "../domain/menu.ts";
import type { Dish, Menu, MenuIngredient } from "../domain/menu.ts";
import { containsWords } from "../ingredients/index-lookup.ts";
import type { IngredientIndex } from "../ingredients/index-lookup.ts";
import type { CheckContext } from "./context.ts";
import {
  ALLOWED_FISH_FORMS,
  FREEZE_BY_CATEGORY,
  FRESH_FISH_CATEGORIES,
  FRIDGE_DAYS_BY_CATEGORY,
  KEEPING_BY_NAME,
  NOT_FREEZABLE_WORDS,
  PASTA_DISH_FREEZE,
  PASTA_DISH_WORDS,
  PASTA_REF_NAMES,
  PASTA_WORDS,
} from "./conservation-table.ts";
import type { Freeze } from "./conservation-table.ts";
import { categoryOf, profileDish } from "./dish-profile.ts";
import type { Protein } from "./dish-profile.ts";

// CA ligne 278, §3.6 et §5 (`docs/research/cuisine-addict-regles.md`).
export const THAW_INSTRUCTION_FR =
  "Après refroidissement rapide, congeler dès la fin de la session. La veille au soir, passer au frigo pour décongeler (12 à 24 h). Ne pas recongeler.";

export interface DishKeeping {
  dish: number;
  // null : aucun ingrédient préparé d'avance ne limite la durée.
  fridgeDays: number | null;
  // Nom reçu de l'ingrédient le plus fragile.
  limitedBy: string | null;
  daysAfterSession: number;
  toFreeze: boolean;
}

const FREEZE_RANK: Record<Freeze, number> = { yes: 0, poor: 1, no: 2 };

// Ce qui, dans un plat, décide de sa conservation (les ingrédients `sameDay` ne comptent pas, D2).
interface DishTraits {
  fridgeDays: number | null;
  limitedBy: string | null;
  freeze: Freeze;
  freezeBlocker: string | null;
}

// Catégories où un mot de PASTA_WORDS désigne une pâte ; `null` : catégorie inconnue.
const PASTA_WORD_CATEGORIES: readonly (Category | null)[] = [
  "refined-starch",
  "whole-starch",
  null,
];

// Pâte identifiée : l'entrée `pâtes` ou `pâtes complètes` du référentiel, ou un féculent (ou un ingrédient sans
// catégorie) dont le nom contient un mot de PASTA_WORDS : « courge spaghetti » reste un légume. Seule
// définition des pâtes, pour la congélation et le réchauffage.
function isIdentifiedPasta(ingredient: MenuIngredient, index: IngredientIndex): boolean {
  const ref = index.find(ingredient.name);
  if (ref !== undefined && PASTA_REF_NAMES.includes(ref.name)) return true;
  if (!PASTA_WORD_CATEGORIES.includes(categoryOf(ingredient, index))) return false;
  return PASTA_WORDS.some((word) => containsWords(ingredient.name, word));
}

// Exception des pâtes (CA §1.5) : une pâte identifiée d'un gratin, de lasagnes ou de cannelloni, dit par le nom
// du plat ou par le nom de l'ingrédient. Elle se prépare pendant la session et se congèle mal.
export function isPastaDishException(
  ingredient: MenuIngredient,
  dish: Dish,
  index: IngredientIndex,
): boolean {
  return (
    isIdentifiedPasta(ingredient, index) &&
    PASTA_DISH_WORDS.some(
      (word) => containsWords(dish.name, word) || containsWords(ingredient.name, word),
    )
  );
}

function keepingOf(
  ingredient: MenuIngredient,
  dish: Dish,
  ctx: CheckContext,
): { fridgeDays: number | null; freeze: Freeze } {
  const ref = ctx.index.find(ingredient.name);
  const category = categoryOf(ingredient, ctx.index);
  let fridgeDays = category === null ? null : FRIDGE_DAYS_BY_CATEGORY[category];
  let freeze: Freeze = category === null ? "yes" : FREEZE_BY_CATEGORY[category];
  const exception = ref === undefined ? undefined : KEEPING_BY_NAME[ref.name];
  if (exception?.fridgeDays !== undefined) fridgeDays = exception.fridgeDays;
  if (exception?.freeze !== undefined) freeze = exception.freeze;
  // Les interdictions explicites (mot non congelable, exception par nom) l'emportent sur l'exception des pâtes.
  const explicitBan =
    exception?.freeze === "no" ||
    NOT_FREEZABLE_WORDS.some((word) => containsWords(ingredient.name, word));
  if (explicitBan) freeze = "no";
  else if (isPastaDishException(ingredient, dish, ctx.index)) {
    // Pâtes d'un gratin, de lasagnes ou de cannelloni : elles se congèlent mal, sans que ce soit interdit.
    freeze = PASTA_DISH_FREEZE;
  }
  return { fridgeDays, freeze };
}

function traitsOf(dish: Dish, ctx: CheckContext): DishTraits {
  const traits: DishTraits = {
    fridgeDays: null,
    limitedBy: null,
    freeze: "yes",
    freezeBlocker: null,
  };
  for (const ingredient of dish.ingredients) {
    if (ingredient.sameDay) continue;
    const { fridgeDays, freeze } = keepingOf(ingredient, dish, ctx);
    if (fridgeDays !== null && (traits.fridgeDays === null || fridgeDays < traits.fridgeDays)) {
      traits.fridgeDays = fridgeDays;
      traits.limitedBy = ingredient.name;
    }
    if (FREEZE_RANK[freeze] > FREEZE_RANK[traits.freeze]) {
      traits.freeze = freeze;
      traits.freezeBlocker = ingredient.name;
    }
  }
  return traits;
}

// Un plat servi plus de `fridgeDays` jours après la session se congèle ; impossible si `freeze` vaut « no ».
function judge(traits: DishTraits, served: number): { error: boolean; toFreeze: boolean } {
  const late = traits.fridgeDays !== null && served > traits.fridgeDays;
  return { error: late && traits.freeze === "no", toFreeze: late && traits.freeze !== "no" };
}

export interface OrderScore {
  errors: number;
  frozen: number;
}

// L'ordre candidat n'est proposé que s'il n'ajoute jamais d'erreur et fait mieux : moins d'erreurs, ou
// autant d'erreurs et moins de plats à congeler.
export function improvesOrder(candidate: OrderScore, current: OrderScore): boolean {
  if (candidate.errors > current.errors) return false;
  return candidate.errors < current.errors || candidate.frozen < current.frozen;
}

function scoreOf(traits: readonly DishTraits[], served: readonly number[]): OrderScore {
  const score: OrderScore = { errors: 0, frozen: 0 };
  for (const [i, trait] of traits.entries()) {
    const verdict = judge(trait, served[i]!);
    if (verdict.error) score.errors++;
    if (verdict.toFreeze) score.frozen++;
  }
  return score;
}

// Paires de soirs consécutifs avec la même protéine principale (règle `same-protein`), notées par les indices des
// deux plats dans le tableau du menu, le plus petit d'abord (« 1-3 ») : elles ne dépendent pas de l'ordre
// chronologique.
function sameProteinPairs(
  proteins: readonly (Protein | null)[],
  served: readonly number[],
): Set<string> {
  const pairs = new Set<string>();
  for (const [i, protein] of proteins.entries()) {
    if (protein === null) continue;
    for (let j = i + 1; j < proteins.length; j++) {
      if (proteins[j] === protein && Math.abs(served[i]! - served[j]!) === 1)
        pairs.add(`${i}-${j}`);
    }
  }
  return pairs;
}

function conservationFindings(
  menu: Menu,
  ctx: CheckContext,
  traits: readonly DishTraits[],
): { findings: Finding[]; keeping: DishKeeping[] } {
  const findings: Finding[] = [];
  const keeping: DishKeeping[] = [];
  for (const [i, dish] of menu.dishes.entries()) {
    const trait = traits[i]!;
    const served = daysAfterSession(ctx.sessionDay, dish.day);
    const verdict = judge(trait, served);
    keeping.push({
      dish: i,
      fridgeDays: trait.fridgeDays,
      limitedBy: trait.limitedBy,
      daysAfterSession: served,
      toFreeze: verdict.toFreeze,
    });
    if (verdict.error) {
      findings.push({
        level: "error",
        rule: "conservation",
        dish: i,
        ingredient: trait.freezeBlocker,
        message: `se garde ${trait.fridgeDays} j au frigo (« ${trait.limitedBy} ») mais il est servi ${served} j après la session, et « ${trait.freezeBlocker} » ne se congèle pas : avance-le dans la semaine ou change cet ingrédient.`,
      });
    } else if (verdict.toFreeze && trait.freeze === "poor") {
      findings.push({
        level: "warning",
        rule: "conservation",
        dish: i,
        ingredient: trait.freezeBlocker,
        message: `sera congelé, mais « ${trait.freezeBlocker} » se congèle mal : avance-le dans la semaine.`,
      });
    }
  }
  return { findings, keeping };
}

// Ordre candidat : les plats les plus fragiles d'abord (durée croissante, `null` en dernier ; à égalité,
// celui qui ne se congèle pas d'abord), rangés sur les jours du menu dans l'ordre. Le tri ne trouve pas
// toujours le meilleur ordre ; `improvesOrder` empêche qu'il ajoute une erreur, et l'ordre n'est pas proposé
// s'il crée une paire de soirs consécutifs avec la même protéine principale qui n'existait pas.
function orderFinding(
  menu: Menu,
  ctx: CheckContext,
  traits: readonly DishTraits[],
): Finding | null {
  const order = menu.dishes.map((_, i) => i);
  const days = menu.dishes
    .map((dish) => dish.day)
    .sort((a, b) => DAYS.indexOf(a) - DAYS.indexOf(b));
  order.sort((a, b) => {
    const left = traits[a]!;
    const right = traits[b]!;
    const leftDays = left.fridgeDays ?? Number.POSITIVE_INFINITY;
    const rightDays = right.fridgeDays ?? Number.POSITIVE_INFINITY;
    if (leftDays !== rightDays) return leftDays < rightDays ? -1 : 1;
    if (left.freeze !== right.freeze) return FREEZE_RANK[right.freeze] - FREEZE_RANK[left.freeze];
    return a - b;
  });
  const currentServed = menu.dishes.map((dish) => daysAfterSession(ctx.sessionDay, dish.day));
  const current = scoreOf(traits, currentServed);
  const candidateServed = new Array<number>(menu.dishes.length);
  for (const [position, dishIndex] of order.entries()) {
    candidateServed[dishIndex] = daysAfterSession(ctx.sessionDay, days[position]!);
  }
  const candidate = scoreOf(traits, candidateServed);
  if (!improvesOrder(candidate, current)) return null;
  const proteins = menu.dishes.map((dish) => profileDish(dish, ctx.index).mainProtein);
  // Toutes les paires de même protéine de l'ordre candidat existent déjà dans l'ordre actuel.
  const existing = sameProteinPairs(proteins, currentServed);
  for (const pair of sameProteinPairs(proteins, candidateServed)) {
    if (!existing.has(pair)) return null;
  }
  const proposal = order.map(
    (dishIndex, position) => `${DAY_LABELS[days[position]!]} « ${menu.dishes[dishIndex]!.name} »`,
  );
  return {
    level: "warning",
    rule: "day-order",
    dish: null,
    ingredient: null,
    message: `Ordre proposé pour moins congeler : ${proposal.join(", ")}.`,
  };
}

function isFishCategory(ingredient: MenuIngredient, ctx: CheckContext): boolean {
  const category = categoryOf(ingredient, ctx.index);
  return category !== null && FRESH_FISH_CATEGORIES.includes(category);
}

// Poisson et fruits de mer : formes permises, y compris `sameDay` (D9bis).
function fishFindings(menu: Menu, ctx: CheckContext): Finding[] {
  const findings: Finding[] = [];
  for (const [i, dish] of menu.dishes.entries()) {
    for (const ingredient of dish.ingredients) {
      if (!isFishCategory(ingredient, ctx) || ALLOWED_FISH_FORMS.includes(ingredient.form))
        continue;
      findings.push({
        level: "error",
        rule: "fish",
        dish: i,
        ingredient: ingredient.name,
        message: `Le poisson doit être surgelé ou en conserve (reçu : ${FORM_LABELS[ingredient.form]}) : « ${ingredient.name} ».`,
      });
    }
  }
  return findings;
}

// Réchauffage, ingrédients préparés d'avance seulement (CA §1.5, lignes 92 et 359).
function reheatFindings(menu: Menu, ctx: CheckContext): Finding[] {
  const findings: Finding[] = [];
  for (const [i, dish] of menu.dishes.entries()) {
    for (const ingredient of dish.ingredients) {
      if (ingredient.sameDay) continue;
      if (categoryOf(ingredient, ctx.index) === "seafood") {
        findings.push({
          level: "error",
          rule: "reheat",
          dish: i,
          ingredient: ingredient.name,
          message: `les ${CATEGORY_LABELS.seafood} ne se réchauffent pas : ajoute « ${ingredient.name} » le soir même (\`sameDay\`).`,
        });
      }
      if (
        isIdentifiedPasta(ingredient, ctx.index) &&
        !isPastaDishException(ingredient, dish, ctx.index)
      ) {
        findings.push({
          level: "warning",
          rule: "reheat",
          dish: i,
          ingredient: ingredient.name,
          message: `les pâtes se cuisent le soir même : marque « ${ingredient.name} » en \`sameDay\` (seule exception : un gratin, des lasagnes ou des cannelloni).`,
        });
      }
    }
  }
  return findings;
}

export function checkConservation(
  menu: Menu,
  ctx: CheckContext,
): { findings: Finding[]; keeping: DishKeeping[] } {
  const traits = menu.dishes.map((dish) => traitsOf(dish, ctx));
  const { findings, keeping } = conservationFindings(menu, ctx, traits);
  const order = orderFinding(menu, ctx, traits);
  return {
    findings: [
      ...fishFindings(menu, ctx),
      ...reheatFindings(menu, ctx),
      ...findings,
      ...(order === null ? [] : [order]),
    ],
    keeping,
  };
}
