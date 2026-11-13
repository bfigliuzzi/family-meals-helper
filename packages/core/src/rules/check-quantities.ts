import type { Finding } from "../domain/finding.ts";
import type { Menu } from "../domain/menu.ts";
import { ADULT_PORTIONS, formatGrams } from "./balance-table.ts";
import type { CheckContext } from "./context.ts";
import { categoryOf, gramsOf } from "./dish-profile.ts";
import { QUANTITY_GROUPS } from "./quantity-table.ts";

// Conception §6.6 : par plat et par groupe présent, le poids cru par adulte doit tenir dans la fourchette.
// Les ingrédients de placard du référentiel (sel, huile, farine…) ne comptent pas. Si un ingrédient du groupe a
// un poids inconnu (un légume en pièces), le groupe n'est pas contrôlé pour ce plat. `sameDay` compte.
export function checkQuantities(menu: Menu, ctx: CheckContext): Finding[] {
  const findings: Finding[] = [];
  for (const [dishIndex, dish] of menu.dishes.entries()) {
    for (const group of QUANTITY_GROUPS) {
      let total = 0;
      let present = false;
      let unknown = false;
      for (const ingredient of dish.ingredients) {
        const category = categoryOf(ingredient, ctx.index);
        if (category === null || !group.categories.includes(category)) continue;
        if (ctx.index.find(ingredient.name)?.pantry === true) continue;
        present = true;
        const grams = gramsOf(ingredient, category);
        if (grams === null) unknown = true;
        else total += grams;
      }
      if (!present || unknown) continue;
      const perAdult = total / ADULT_PORTIONS;
      if (perAdult >= group.minPerAdult && perAdult <= group.maxPerAdult) continue;
      findings.push({
        level: "warning",
        rule: "quantity",
        dish: dishIndex,
        ingredient: null,
        message: `${group.label} : ${formatGrams(total)} g pour ${ADULT_PORTIONS} portions, soit ${formatGrams(perAdult)} g par adulte ; attendu ${group.minPerAdult} à ${group.maxPerAdult} g.`,
      });
    }
  }
  return findings;
}
