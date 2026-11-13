import type { IngredientRef } from "../domain/ingredient.ts";
import type { Finding } from "../domain/finding.ts";
import type { Menu } from "../domain/menu.ts";
import type { CheckContext } from "../rules/context.ts";
import { describeMonths, monthName } from "./months.ts";
import type { Month, SeasonRow } from "./months.ts";

function isProduce(ref: IngredientRef): boolean {
  return ref.category === "vegetable" || ref.category === "fruit";
}

// La liste envoyée à l'IA ne garde que les produits frais par défaut.
function isFreshByDefault(ref: IngredientRef): boolean {
  return isProduce(ref) && ref.defaultForm === "fresh";
}

function byCodeUnit(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

// Contrôle partiel : un fruit ou légume frais sans ligne dans la table, ou absent du référentiel
// et sans entrée reconnue dans son nom, n'est pas contrôlé ; son nom est rendu dans `unchecked`. Aucune exemption (conception §6.5) :
// seul un ingrédient nommé dans la demande échappe au constat.
export function checkSeason(
  menu: Menu,
  ctx: CheckContext,
): { findings: Finding[]; unchecked: string[] } {
  const requested = ctx.index.requestedIn(ctx.request);
  const findings: Finding[] = [];
  const unchecked = new Set<string>();

  // Contrôle d'une entrée du référentiel ; `shown` est le nom reçu de l'IA, cité dans le constat.
  const checkRef = (ref: IngredientRef, shown: string, dishIndex: number): void => {
    const row = ctx.seasonTable[ref.name];
    if (row === undefined) {
      unchecked.add(ref.name);
      return;
    }
    if (row.months.includes(ctx.month) || requested.includes(ref)) return;
    findings.push({
      level: "error",
      rule: "season",
      dish: dishIndex,
      ingredient: shown,
      message: `${shown} n'est pas de saison en ${monthName(ctx.month)} (saison : ${describeMonths(row.months)}).`,
    });
  };

  for (const [dishIndex, dish] of menu.dishes.entries()) {
    for (const ingredient of dish.ingredients) {
      // Le contrôle porte sur la forme reçue, pas sur la forme par défaut de l'entrée.
      if (ingredient.form !== "fresh") continue;
      const known = ctx.index.find(ingredient.name);
      if (known !== undefined) {
        if (isProduce(known)) checkRef(known, ingredient.name, dishIndex);
        continue;
      }
      // Inconnu : on cherche les fruits et légumes du référentiel écrits dans son nom.
      const produce = ctx.index.scan(ingredient.name).refs.filter(isProduce);
      if (produce.length > 0) {
        for (const ref of produce) checkRef(ref, ingredient.name, dishIndex);
      } else if (ingredient.category === "vegetable" || ingredient.category === "fruit") {
        unchecked.add(ingredient.name);
      }
    }
  }
  return { findings, unchecked: [...unchecked].sort(byCodeUnit) };
}

// Fruits et légumes frais de saison ce mois-ci, pour le prompt.
export function inSeasonNames(
  month: Month,
  refs: readonly IngredientRef[],
  table: Readonly<Record<string, SeasonRow>>,
): string[] {
  return refs
    .filter((ref) => isFreshByDefault(ref) && table[ref.name]?.months.includes(month) === true)
    .map((ref) => ref.name)
    .sort(byCodeUnit);
}
