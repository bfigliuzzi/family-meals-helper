import type { Category } from "../domain/ingredient.ts";
import type { Dish, MenuIngredient } from "../domain/menu.ts";
import type { IngredientIndex } from "../ingredients/index-lookup.ts";

export const PROTEINS = ["fish", "seafood", "red-meat", "pork", "poultry", "egg", "pulse"] as const;
export type Protein = (typeof PROTEINS)[number];

export interface DishProfile {
  // Tous les ingrédients, `sameDay` compris (conception §7).
  categories: ReadonlySet<Category>;
  // Poids connus par catégorie, en grammes.
  grams: ReadonlyMap<Category, number>;
  // Catégories dont au moins un ingrédient a un poids inconnu.
  unknownWeight: ReadonlySet<Category>;
  mainProtein: Protein | null;
}

// Poids d'un œuf en grammes : « 100 g de volaille, poisson ou viande ou 2 œufs » (guide 4-11 ans p. 35 de
// https://www.mangerbouger.fr/content/show/2132/file/DT05-414-24B%20148-5fx210_GUIDE_40P_MANGER_BOUGER_4-11_ANS_bd_v2.pdf).
const EGG_GRAMS = 50;

const PROTEIN_OF: Readonly<Partial<Record<Category, Protein>>> = {
  "red-meat": "red-meat",
  pork: "pork",
  "cured-meat": "pork",
  poultry: "poultry",
  fish: "fish",
  "oily-fish": "fish",
  seafood: "seafood",
  egg: "egg",
  pulse: "pulse",
};

// Catégorie du référentiel s'il y est, sinon celle donnée par l'IA ; null : ignoré par les règles.
export function categoryOf(ingredient: MenuIngredient, index: IngredientIndex): Category | null {
  return index.find(ingredient.name)?.category ?? ingredient.category;
}

// Poids en grammes : `g` tel quel, `piece` d'œuf à 50 g ; toute autre combinaison est inconnue (null).
export function gramsOf(ingredient: MenuIngredient, category: Category): number | null {
  if (ingredient.unit === "g") return ingredient.qty;
  if (ingredient.unit === "piece" && category === "egg") return ingredient.qty * EGG_GRAMS;
  return null;
}

function proteinOf(category: Category): Protein | null {
  return PROTEIN_OF[category] ?? null;
}

export function profileDish(dish: Dish, index: IngredientIndex): DishProfile {
  const categories = new Set<Category>();
  const grams = new Map<Category, number>();
  const unknownWeight = new Set<Category>();
  for (const ingredient of dish.ingredients) {
    const category = categoryOf(ingredient, index);
    if (category === null) continue;
    categories.add(category);
    const weight = gramsOf(ingredient, category);
    if (weight === null) unknownWeight.add(category);
    else grams.set(category, (grams.get(category) ?? 0) + weight);
  }

  // Protéine principale : celle qui pèse le plus, poids inconnu compté pour 0 ; égalité : l'ordre de PROTEINS.
  const byProtein = new Map<Protein, number>();
  for (const category of categories) {
    const protein = proteinOf(category);
    if (protein !== null)
      byProtein.set(protein, (byProtein.get(protein) ?? 0) + (grams.get(category) ?? 0));
  }
  let mainProtein: Protein | null = null;
  for (const protein of PROTEINS) {
    const weight = byProtein.get(protein);
    if (weight === undefined) continue;
    if (mainProtein === null || weight > (byProtein.get(mainProtein) ?? 0)) mainProtein = protein;
  }
  return { categories, grams, unknownWeight, mainProtein };
}
