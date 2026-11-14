import { isBlankWhenPrinted } from "../ai/printable.ts";
import type { Finding } from "../domain/finding.ts";
import type { Category } from "../domain/ingredient.ts";
import { DAY_LABELS } from "../domain/menu.ts";
import type { Menu } from "../domain/menu.ts";
import { lightNormalize } from "../ingredients/normalize.ts";
import type { CheckContext } from "./context.ts";
import { categoryOf } from "./dish-profile.ts";

const NUMBER_WORDS: Record<string, number> = { un: 1, deux: 2, trois: 3, quatre: 4, cinq: 5 };

// « 4 dîners », « 5 soirs », « quatre repas » : de 1 à 5, sinon 5 (conception §3.1).
// Plusieurs mentions « dîner(s) » : la plus grande (un sous-total ne dépasse jamais le total) ;
// sinon une seule mention « soir(s) » ou « repas » ; sinon 5.
export function expectedDinners(request: string): number {
  const pattern = /\b(\d+|un|deux|trois|quatre|cinq) (diners?|soirs?|repas)\b/g;
  const matches = [...lightNormalize(request).matchAll(pattern)];
  const valueOf = (match: RegExpMatchArray): number => {
    const word = match[1] ?? "";
    return NUMBER_WORDS[word] ?? Number(word);
  };
  const dinners = matches.filter((match) => (match[2] ?? "").startsWith("diner"));
  let count: number | undefined;
  if (dinners.length > 0) count = Math.max(...dinners.map(valueOf));
  else if (matches.length === 1 && matches[0] !== undefined) count = valueOf(matches[0]);
  return count !== undefined && count >= 1 && count <= 5 ? count : 5;
}

// Catégories dont les plafonds et les quantités se calculent en grammes (conception §6.3, §6.6).
const GRAMS_ONLY_CATEGORIES: readonly Category[] = [
  "red-meat",
  "pork",
  "cured-meat",
  "poultry",
  "fish",
  "oily-fish",
  "seafood",
];

function error(dish: number | null, ingredient: string | null, message: string): Finding {
  return { level: "error", rule: "menu-shape", dish, ingredient, message };
}

export function checkMenuShape(menu: Menu, ctx: CheckContext): Finding[] {
  const findings: Finding[] = [];
  if (menu.dishes.length === 0) {
    findings.push(error(null, null, "Le menu ne contient aucun plat."));
    return findings;
  }
  if (menu.dishes.length !== ctx.dinners) {
    findings.push(
      error(
        null,
        null,
        `Le menu a ${menu.dishes.length} plat(s) ; il en faut ${ctx.dinners} (un par dîner).`,
      ),
    );
  }
  const seenDays = new Set<string>();
  for (const [index, dish] of menu.dishes.entries()) {
    if (seenDays.has(dish.day)) {
      findings.push(
        error(index, null, `Le jour ${DAY_LABELS[dish.day]} est déjà pris par un autre plat.`),
      );
    }
    seenDays.add(dish.day);
    if (isBlankWhenPrinted(dish.name)) findings.push(error(index, null, "Le plat n'a pas de nom."));
    if (dish.ingredients.length === 0) {
      findings.push(error(index, null, "Le plat n'a aucun ingrédient."));
    }
    for (const ingredient of dish.ingredients) {
      if (isBlankWhenPrinted(ingredient.name)) {
        findings.push(error(index, null, "Un ingrédient n'a pas de nom."));
      }
      if (!(ingredient.qty > 0)) {
        findings.push(
          error(
            index,
            ingredient.name,
            `La quantité de « ${ingredient.name} » doit être strictement positive.`,
          ),
        );
      }
      // Sans grammes, les plafonds ne se calculent pas : un poids inconnu ne vaut pas « pas de dépassement ».
      const category = categoryOf(ingredient, ctx.index);
      if (
        !isBlankWhenPrinted(ingredient.name) &&
        ingredient.unit !== "g" &&
        category !== null &&
        GRAMS_ONLY_CATEGORIES.includes(category)
      ) {
        findings.push(
          error(
            index,
            ingredient.name,
            `Donne « ${ingredient.name} » en g : les plafonds de viande et les quantités se calculent en grammes.`,
          ),
        );
      }
    }
  }
  return findings;
}
