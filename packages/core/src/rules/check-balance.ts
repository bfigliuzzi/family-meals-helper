import type { Category } from "../domain/ingredient.ts";
import type { Finding, RuleId } from "../domain/finding.ts";
import { DAYS, DAY_LABELS, dishLetter } from "../domain/menu.ts";
import type { Menu } from "../domain/menu.ts";
import { containsWords } from "../ingredients/index-lookup.ts";
import {
  ADULT_PORTIONS,
  AROMATICS,
  CURED_MEAT_DISHES_MAX,
  CURED_MEAT_MAX_G_PER_ADULT,
  MEAT_MAX_G_PER_ADULT,
  PROTEIN_LABELS,
  PULSE_DISHES_MIN,
  RED_MEAT_DISHES_MAX,
  WHOLE_STARCH_DISHES_MIN,
  formatGrams,
} from "./balance-table.ts";
import type { CheckContext } from "./context.ts";
import { categoryOf, profileDish } from "./dish-profile.ts";
import type { DishProfile } from "./dish-profile.ts";

function warning(rule: RuleId, dish: number | null, message: string): Finding {
  return { level: "warning", rule, dish, ingredient: null, message };
}

function gramsIn(profile: DishProfile, categories: readonly Category[]): number {
  return categories.reduce((sum, category) => sum + (profile.grams.get(category) ?? 0), 0);
}

function hasAny(profile: DishProfile, categories: readonly Category[]): boolean {
  return categories.some((category) => profile.categories.has(category));
}

// Conception §5.1 : le code ne repère pas le plat demandé. Les constats qui pourraient pousser à retirer un
// plat (plafonds, même protéine) nomment les plats en cause et rappellent la priorité de la demande ; l'IA
// les reçoit une fois, comme toute règle souple.
export const KEEP_REQUESTED_DISH_FR =
  "Si la demande nomme un de ces plats, garde-le et ajuste les autres.";

function dishNames(menu: Menu, dishes: readonly number[]): string {
  return dishes.map((dish) => `${dishLetter(dish)} « ${menu.dishes[dish]!.name} »`).join(", ");
}

function capFinding(
  menu: Menu,
  rule: RuleId,
  message: string,
  contributors: readonly number[],
): Finding {
  return warning(
    rule,
    null,
    `${message} Plats concernés : ${dishNames(menu, contributors)}. ${KEEP_REQUESTED_DISH_FR}`,
  );
}

function checkVegetables(menu: Menu, ctx: CheckContext): Finding[] {
  const findings: Finding[] = [];
  for (const [i, dish] of menu.dishes.entries()) {
    const hasVegetable = dish.ingredients.some((ingredient) => {
      if (categoryOf(ingredient, ctx.index) !== "vegetable") return false;
      const ref = ctx.index.find(ingredient.name);
      const aromatic =
        ref === undefined
          ? AROMATICS.some((name) => containsWords(ingredient.name, name))
          : AROMATICS.includes(ref.name);
      return !aromatic;
    });
    if (!hasVegetable) {
      findings.push(
        warning(
          "vegetables",
          i,
          `aucun légume (${AROMATICS.join(", ")} ne comptent pas) : ajoute un légume dans le plat ou en accompagnement.`,
        ),
      );
    }
  }
  return findings;
}

function checkMeat(menu: Menu, profiles: readonly DishProfile[]): Finding[] {
  const findings: Finding[] = [];
  const categories: Category[] = ["red-meat", "pork"];
  const total = profiles.reduce((sum, profile) => sum + gramsIn(profile, categories), 0);
  const perAdult = total / ADULT_PORTIONS;
  if (perAdult > MEAT_MAX_G_PER_ADULT) {
    const contributors = profiles.flatMap((profile, i) =>
      gramsIn(profile, categories) > 0 ? [i] : [],
    );
    findings.push(
      capFinding(
        menu,
        "meat",
        `Viande hors volaille : ${formatGrams(total)} g sur le menu, soit ${formatGrams(perAdult)} g par adulte ; au plus ${MEAT_MAX_G_PER_ADULT} g par adulte (${formatGrams(MEAT_MAX_G_PER_ADULT * ADULT_PORTIONS)} g sur le menu).`,
        contributors,
      ),
    );
  }
  const dishes = profiles.flatMap((profile, i) => (hasAny(profile, categories) ? [i] : []));
  if (dishes.length > RED_MEAT_DISHES_MAX) {
    findings.push(
      capFinding(
        menu,
        "meat",
        `Viande rouge ou porc : ${dishes.length} plats ; au plus ${RED_MEAT_DISHES_MAX}.`,
        dishes,
      ),
    );
  }
  return findings;
}

function checkCuredMeat(menu: Menu, profiles: readonly DishProfile[]): Finding[] {
  const findings: Finding[] = [];
  const categories: Category[] = ["cured-meat"];
  const dishes = profiles.flatMap((profile, i) => (hasAny(profile, categories) ? [i] : []));
  if (dishes.length > CURED_MEAT_DISHES_MAX) {
    findings.push(
      capFinding(
        menu,
        "cured-meat",
        `Charcuterie : ${dishes.length} plats ; au plus ${CURED_MEAT_DISHES_MAX}.`,
        dishes,
      ),
    );
  }
  const total = profiles.reduce((sum, profile) => sum + gramsIn(profile, categories), 0);
  const perAdult = total / ADULT_PORTIONS;
  if (perAdult > CURED_MEAT_MAX_G_PER_ADULT) {
    const contributors = profiles.flatMap((profile, i) =>
      gramsIn(profile, categories) > 0 ? [i] : [],
    );
    findings.push(
      capFinding(
        menu,
        "cured-meat",
        `Charcuterie : ${formatGrams(total)} g sur le menu, soit ${formatGrams(perAdult)} g par adulte ; au plus ${CURED_MEAT_MAX_G_PER_ADULT} g par adulte (${formatGrams(CURED_MEAT_MAX_G_PER_ADULT * ADULT_PORTIONS)} g sur le menu).`,
        contributors,
      ),
    );
  }
  return findings;
}

// Jamais la même protéine principale deux jours consécutifs (indices de DAYS). Le constat porte sur le second soir.
function checkSameProtein(menu: Menu, profiles: readonly DishProfile[]): Finding[] {
  const findings: Finding[] = [];
  const byDay = menu.dishes
    .map((dish, i) => ({ i, day: DAYS.indexOf(dish.day) }))
    .sort((a, b) => a.day - b.day);
  for (const [position, second] of byDay.entries()) {
    const first = byDay[position - 1];
    if (first === undefined || second.day - first.day !== 1) continue;
    const protein = profiles[second.i]!.mainProtein;
    if (protein === null || protein !== profiles[first.i]!.mainProtein) continue;
    const firstDish = menu.dishes[first.i]!;
    const secondDish = menu.dishes[second.i]!;
    findings.push(
      warning(
        "same-protein",
        second.i,
        `deux soirs de suite avec la même protéine principale (${PROTEIN_LABELS[protein]}) : « ${firstDish.name} » (${DAY_LABELS[firstDish.day]}) et « ${secondDish.name} » (${DAY_LABELS[secondDish.day]}) ; change-en un. ${KEEP_REQUESTED_DISH_FR}`,
      ),
    );
  }
  return findings;
}

export function checkBalance(menu: Menu, ctx: CheckContext): Finding[] {
  const profiles = menu.dishes.map((dish) => profileDish(dish, ctx.index));
  const findings: Finding[] = [...checkVegetables(menu, ctx)];
  const withPulse = profiles.filter((profile) => profile.categories.has("pulse")).length;
  if (withPulse < PULSE_DISHES_MIN) {
    findings.push(
      warning(
        "pulses",
        null,
        `Aucun plat de légumes secs : mets-en dans au moins ${PULSE_DISHES_MIN} plat.`,
      ),
    );
  }
  findings.push(
    ...checkMeat(menu, profiles),
    ...checkCuredMeat(menu, profiles),
    ...checkSameProtein(menu, profiles),
  );
  const withWholeStarch = profiles.filter((profile) =>
    profile.categories.has("whole-starch"),
  ).length;
  if (withWholeStarch < WHOLE_STARCH_DISHES_MIN) {
    findings.push(
      warning(
        "whole-starch",
        null,
        `Aucun féculent complet : mets-en dans au moins ${WHOLE_STARCH_DISHES_MIN} plat.`,
      ),
    );
  }
  return findings;
}
