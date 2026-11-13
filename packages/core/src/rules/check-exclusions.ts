import { CATEGORY_GROUPS } from "../domain/ingredient.ts";
import type { Category, IngredientRef } from "../domain/ingredient.ts";
import type { Finding } from "../domain/finding.ts";
import type { Menu } from "../domain/menu.ts";
import { groupsOf } from "../ingredients/groups.ts";
import { containsWords } from "../ingredients/index-lookup.ts";
import type { IngredientIndex } from "../ingredients/index-lookup.ts";
import { normalizeName } from "../ingredients/normalize.ts";
import type { CheckContext } from "./context.ts";

// Règle 1 : une entrée est exclue si le terme est l'une de ses clés ou l'un de ses groupes.
function entryExcluded(ref: IngredientRef, term: string, index: IngredientIndex): boolean {
  return index.keysOf(ref).includes(term) || groupsOf(ref).includes(term);
}

// `term` est déjà normalisé. `category` vaut null pour un nom de plat.
// Ingrédient connu : règle 1 seule. Ingrédient inconnu ou nom de plat : règles a à d.
function isExcluded(
  text: string,
  category: Category | null,
  term: string,
  index: IngredientIndex,
): boolean {
  const known = index.find(text);
  if (known !== undefined) return entryExcluded(known, term, index);

  // a. un terme qui n'est la clé d'aucune entrée se cherche en mots entiers dans tout le texte
  if (index.find(term) === undefined && containsWords(text, term)) return true;
  // b. groupe de la catégorie reçue (inconnu « truite », catégorie fish, --exclude poisson)
  if (category !== null && (CATEGORY_GROUPS[category] ?? []).map(normalizeName).includes(term)) {
    return true;
  }
  // c. entrées reconnues dans le texte, puis le reste du texte
  const { refs, rest } = index.scan(text);
  if (refs.some((ref) => entryExcluded(ref, term, index))) return true;
  if (containsWords(rest, term)) return true;
  // d. mots-groupes : « poulet » dans le reste porte aussi volaille et viande. Les groupes portés
  // sont l'intersection de ceux des entrées qui portent le mot (« viande » ne porte que viande).
  return referentialGroups(index).some((group) => {
    if (!containsWords(rest, group)) return false;
    const carried = carriedGroups(group, index);
    return carried.includes(term);
  });
}

function referentialGroups(index: IngredientIndex): string[] {
  return [...new Set(index.refs.flatMap((ref) => groupsOf(ref)))];
}

function carriedGroups(group: string, index: IngredientIndex): string[] {
  const carriers = index.refs.map(groupsOf).filter((groups) => groups.includes(group));
  const [first, ...others] = carriers;
  if (first === undefined) return [];
  return first.filter((candidate) => others.every((groups) => groups.includes(candidate)));
}

export function checkExclusions(menu: Menu, ctx: CheckContext): Finding[] {
  const findings: Finding[] = [];
  for (const raw of ctx.exclusions) {
    const term = normalizeName(raw);
    if (term === "") continue;
    for (const [dishIndex, dish] of menu.dishes.entries()) {
      // Les ingrédients d'abord : le nom du plat ne double pas un constat déjà levé pour ce terme.
      let ingredientExcluded = false;
      for (const ingredient of dish.ingredients) {
        if (isExcluded(ingredient.name, ingredient.category, term, ctx.index)) {
          ingredientExcluded = true;
          findings.push({
            level: "error",
            rule: "exclusion",
            dish: dishIndex,
            ingredient: ingredient.name,
            message: `« ${ingredient.name} » est exclu (exclusion : ${raw.trim()}).`,
          });
        }
      }
      // Nom du plat lu en entier, sans analyse de négation (invariant E2) : rater une exclusion
      // coûte plus cher qu'un faux positif comme « Chili sans viande », que le prompt prévient.
      if (!ingredientExcluded && isExcluded(dish.name, null, term, ctx.index)) {
        findings.push({
          level: "error",
          rule: "exclusion",
          dish: dishIndex,
          ingredient: null,
          message: `Le nom du plat cite « ${dish.name} », qui est exclu (exclusion : ${raw.trim()}).`,
        });
      }
    }
  }
  return findings;
}

// Termes qui ne sont ni une clé, ni un groupe du référentiel, ni un groupe de catégorie :
// seuls les noms inconnus et les noms de plats pourront les attraper.
export function unknownExclusionTerms(terms: readonly string[], index: IngredientIndex): string[] {
  const known = new Set([
    ...index.refs.flatMap((ref) => groupsOf(ref)),
    ...Object.values(CATEGORY_GROUPS).flatMap((groups) => groups.map(normalizeName)),
  ]);
  return terms.filter((raw) => {
    const term = normalizeName(raw);
    return term !== "" && index.find(term) === undefined && !known.has(term);
  });
}
