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

// `none` = travail à la main ou attente (découpe, marinade, repos).
export const APPLIANCES = [
  "none",
  "oven",
  "induction",
  "thermomix",
  "kenwood",
  "cookeo",
  "steamer",
  "airfryer",
] as const;
export type ApplianceId = (typeof APPLIANCES)[number];

// Les durées (entier de 1 à 600) sont validées par le contrôle métier (scheduling/check-session.ts),
// pour renvoyer à l'IA un constat `phases` lisible plutôt qu'une réponse illisible.
export const PhaseSchema = z.object({
  id: z.string(),
  description: z.string(),
  minutes: z.number(),
  appliance: z.enum(APPLIANCES),
  attended: z.boolean(),
  after: z.array(z.string()),
});
export type Phase = z.infer<typeof PhaseSchema>;

export const DishSchema = z.object({
  name: z.string(),
  day: z.enum(DAYS),
  ingredients: z.array(MenuIngredientSchema),
  phases: z.array(PhaseSchema),
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

// Jour de la session de cuisine : seulement ces quatre jours, une session du mardi au jeudi
// tomberait après certains dîners.
export const SESSION_DAYS = ["fri", "sat", "sun", "mon"] as const;
export type SessionDay = (typeof SESSION_DAYS)[number];

export const SESSION_DAY_LABELS: Record<SessionDay, string> = {
  fri: "vendredi",
  sat: "samedi",
  sun: "dimanche",
  mon: "lundi",
};

// Décalage en jours entre la session et le lundi : vendredi -3, samedi -2, dimanche -1, lundi 0.
const SESSION_OFFSET: Record<SessionDay, number> = { fri: -3, sat: -2, sun: -1, mon: 0 };

// Jours écoulés entre la session et le dîner : session le dimanche, lundi 1 … vendredi 5.
export function daysAfterSession(session: SessionDay, day: Day): number {
  return DAYS.indexOf(day) - SESSION_OFFSET[session];
}

// Les plats sont désignés par une lettre : a, b, c…
export function dishLetter(index: number): string {
  return String.fromCharCode(97 + index);
}
