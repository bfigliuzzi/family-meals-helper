import { z } from "zod";
import { CATEGORIES, FORMS } from "./ingredient.ts";

export const DAYS = ["mon", "tue", "wed", "thu", "fri"] as const;
export type Day = (typeof DAYS)[number];
export const UNITS = ["g", "ml", "piece"] as const;
export type Unit = (typeof UNITS)[number];

// Pas de .min()/.max()/.regex() ici : la sortie structurée de l'API ne les accepte pas tous.
// Les bornes métier sont dans la règle menu-shape.
export const MenuIngredientSchema = z.object({
  name: z.string(),
  qty: z.number(),
  unit: z.enum(UNITS),
  form: z.enum(FORMS),
  category: z.enum(CATEGORIES).nullable(),
  sameDay: z.boolean(),
});
export type MenuIngredient = z.infer<typeof MenuIngredientSchema>;

export const DishSchema = z.object({
  name: z.string(),
  day: z.enum(DAYS),
  ingredients: z.array(MenuIngredientSchema),
});
export type Dish = z.infer<typeof DishSchema>;

export const MenuSchema = z.object({ dishes: z.array(DishSchema) });
export type Menu = z.infer<typeof MenuSchema>;

export const DAY_LABELS: Record<Day, string> = {
  mon: "lundi",
  tue: "mardi",
  wed: "mercredi",
  thu: "jeudi",
  fri: "vendredi",
};

// Les plats sont désignés par une lettre : a, b, c…
export function dishLetter(index: number): string {
  return String.fromCharCode(97 + index);
}
