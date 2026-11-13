import { z } from "zod";

export const CATEGORIES = [
  "red-meat",
  "poultry",
  "pork",
  "cured-meat",
  "fish",
  "oily-fish",
  "seafood",
  "egg",
  "pulse",
  "vegetable",
  "fruit",
  "potato",
  "whole-starch",
  "refined-starch",
  "dairy",
  "cheese",
  "fat",
  "herb-spice",
  "condiment",
  "sugar",
  "other",
] as const;
export type Category = (typeof CATEGORIES)[number];

export const FORMS = ["fresh", "canned", "frozen", "dry"] as const;
export type Form = (typeof FORMS)[number];

export const AISLES = [
  "produce",
  "meat-fish",
  "dairy",
  "savory-grocery",
  "sweet-grocery",
  "frozen",
] as const;
export type Aisle = (typeof AISLES)[number];

export const CATEGORY_LABELS: Record<Category, string> = {
  "red-meat": "viande rouge",
  poultry: "volaille",
  pork: "porc",
  "cured-meat": "charcuterie",
  fish: "poisson",
  "oily-fish": "poisson gras",
  seafood: "fruits de mer",
  egg: "œuf",
  pulse: "légumineuse",
  vegetable: "légume",
  fruit: "fruit",
  potato: "pomme de terre",
  "whole-starch": "féculent complet",
  "refined-starch": "féculent raffiné",
  dairy: "produit laitier",
  cheese: "fromage",
  fat: "matière grasse",
  "herb-spice": "herbe ou épice",
  condiment: "condiment",
  sugar: "sucre",
  other: "autre",
};

export const FORM_LABELS: Record<Form, string> = {
  fresh: "frais",
  canned: "conserve",
  frozen: "surgelé",
  dry: "sec",
};

export const AISLE_LABELS: Record<Aisle, string> = {
  produce: "fruits et légumes",
  "meat-fish": "viandes et poissons",
  dairy: "crèmerie",
  "savory-grocery": "épicerie salée",
  "sweet-grocery": "épicerie sucrée",
  frozen: "surgelés",
};

// Termes d'exclusion larges portés par toute entrée d'une catégorie (--exclude viande).
// La charcuterie compte comme du porc : choix prudent, la charcuterie de supermarché en est presque toujours.
export const CATEGORY_GROUPS: Readonly<Partial<Record<Category, readonly string[]>>> = {
  poultry: ["volaille", "viande"],
  "red-meat": ["viande"],
  pork: ["porc", "viande"],
  "cured-meat": ["porc", "viande"],
  fish: ["poisson"],
  "oily-fish": ["poisson"],
  seafood: ["fruits de mer"],
  cheese: ["fromage"],
};

export const IngredientRefSchema = z.object({
  name: z.string(),
  synonyms: z.array(z.string()),
  variants: z.array(z.string()),
  groups: z.array(z.string()),
  category: z.enum(CATEGORIES),
  aisle: z.enum(AISLES),
  defaultForm: z.enum(FORMS),
  pantry: z.boolean(),
});
export type IngredientRef = z.infer<typeof IngredientRefSchema>;
