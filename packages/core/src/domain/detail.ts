import { z } from "zod";
import { APPLIANCES } from "./menu.ts";

// Sortie du détail : l'IA ne renvoie ni nom de plat, ni ingrédient, ni quantité. Elle cite les ingrédients par des
// repères dans le texte (`{a.1}`, `{d.1/e.1}`), que le code remplace par la quantité du menu (`pdf/step-text.ts`).
// Les bornes (durées, nombre d'étapes) sont dans le contrôle `checkDetail`, pas dans le schéma.
export const DetailStepSchema = z.object({
  // s1, s2… unique.
  id: z.string(),
  // Titre court de la phase (« Lancer les cuissons longues », « Découpes ») : la fiche regroupe les étapes sous ces
  // titres.
  phase: z.string(),
  // Lettres des plats servis ; la première porte l'étape dans le planning.
  dishes: z.array(z.string()),
  // Consigne rédigée, à l'impératif, avec des repères {a.1} et du **gras** ; aucune quantité du menu en toutes lettres.
  text: z.string(),
  minutes: z.number(),
  appliance: z.enum(APPLIANCES),
  attended: z.boolean(),
  after: z.array(z.string()),
});
export type DetailStep = z.infer<typeof DetailStepSchema>;

export const EveningSchema = z.object({ dish: z.string(), text: z.string() });
export type Evening = z.infer<typeof EveningSchema>;

export const DetailSchema = z.object({
  steps: z.array(DetailStepSchema),
  evenings: z.array(EveningSchema),
});
export type Detail = z.infer<typeof DetailSchema>;
