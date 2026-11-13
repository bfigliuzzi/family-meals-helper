import { CATEGORY_GROUPS } from "../domain/ingredient.ts";
import type { IngredientRef } from "../domain/ingredient.ts";
import { normalizeName } from "./normalize.ts";

// Groupes d'exclusion d'une entrée : les siens, plus ceux de sa catégorie. Normalisés.
export function groupsOf(ref: IngredientRef): string[] {
  const all = [...ref.groups, ...(CATEGORY_GROUPS[ref.category] ?? [])];
  return [...new Set(all.map(normalizeName))];
}
