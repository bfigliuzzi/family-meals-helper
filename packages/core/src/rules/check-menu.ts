import { isBlankWhenPrinted } from "../ai/printable.ts";
import type { Category } from "../domain/ingredient.ts";
import type { Finding } from "../domain/finding.ts";
import type { Menu } from "../domain/menu.ts";
import { HOUSEHOLD_EQUIPMENT } from "../equipment/household.ts";
import { checkSession } from "../scheduling/check-session.ts";
import type { SessionPlan } from "../scheduling/plan-session.ts";
import { checkSeason } from "../season/check-season.ts";
import { checkBalance } from "./check-balance.ts";
import { checkConservation } from "./check-conservation.ts";
import type { DishKeeping } from "./check-conservation.ts";
import { checkExclusions } from "./check-exclusions.ts";
import { checkQuantities } from "./check-quantities.ts";
import { checkMenuShape } from "./menu-shape.ts";
import type { CheckContext } from "./context.ts";

export interface MenuCheck {
  findings: Finding[];
  // Conservation de chaque plat, dans l'ordre du menu (vide quand il n'y a pas de menu lisible).
  keeping: DishKeeping[];
  seasonUnchecked: string[];
  toConfirm: { name: string; category: Category }[];
  // Planning de la session ; null quand les phases sont fausses ou qu'il n'y a pas de menu lisible.
  session: SessionPlan | null;
}

export function checkMenu(menu: Menu, ctx: CheckContext): MenuCheck {
  const season = checkSeason(menu, ctx);
  const findings: Finding[] = [
    ...checkMenuShape(menu, ctx),
    ...checkExclusions(menu, ctx),
    ...season.findings,
  ];
  const toConfirm: { name: string; category: Category }[] = [];
  for (const [dishIndex, dish] of menu.dishes.entries()) {
    for (const ingredient of dish.ingredients) {
      if (isBlankWhenPrinted(ingredient.name) || ctx.index.find(ingredient.name) !== undefined)
        continue;
      if (ingredient.category === null) {
        findings.push({
          level: "error",
          rule: "unknown-category",
          dish: dishIndex,
          ingredient: ingredient.name,
          message: `« ${ingredient.name} » n'est pas dans le référentiel : donne sa catégorie.`,
        });
      } else if (!toConfirm.some((entry) => entry.name === ingredient.name)) {
        toConfirm.push({ name: ingredient.name, category: ingredient.category });
      }
    }
  }
  const conservation = checkConservation(menu, ctx);
  findings.push(
    ...conservation.findings,
    ...checkBalance(menu, ctx),
    ...checkQuantities(menu, ctx),
  );
  const session = checkSession(menu, HOUSEHOLD_EQUIPMENT);
  // Pas de spread : un tableau de constats ne doit jamais devenir une liste d'arguments.
  for (const finding of session.findings) findings.push(finding);
  return {
    findings,
    keeping: conservation.keeping,
    seasonUnchecked: season.unchecked,
    toConfirm,
    session: session.plan,
  };
}
