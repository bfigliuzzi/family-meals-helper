import type { Category } from "../domain/ingredient.ts";
import type { Finding } from "../domain/finding.ts";
import type { Menu } from "../domain/menu.ts";
import { checkSeason } from "../season/check-season.ts";
import { checkExclusions } from "./check-exclusions.ts";
import { checkMenuShape } from "./menu-shape.ts";
import type { CheckContext } from "./context.ts";

export interface MenuCheck {
  findings: Finding[];
  seasonUnchecked: string[];
  toConfirm: { name: string; category: Category }[];
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
      if (ingredient.name.trim() === "" || ctx.index.find(ingredient.name) !== undefined) continue;
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
  return { findings, seasonUnchecked: season.unchecked, toConfirm };
}
