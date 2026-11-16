import { z } from "zod";
import { DishSchema } from "../domain/menu.ts";
import type { Menu } from "../domain/menu.ts";

// Lit une réponse JSON de l'IA, avec ou sans bloc de code, et la valide avec le schéma donné.
export function parseJsonReply<T>(
  text: string,
  schema: z.ZodType<T>,
): { ok: true; value: T } | { ok: false; error: string } {
  const trimmed = text.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(trimmed);
  const body = fenced?.[1] ?? trimmed;
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return { ok: false, error: "La réponse n'est pas du JSON lisible." };
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return {
      ok: false,
      error: `Le JSON ne respecte pas le format attendu :\n${z.prettifyError(parsed.error)}`,
    };
  }
  return { ok: true, value: parsed.data };
}

// Réponse de l'IA : le menu, plus ce qui n'existe que dans la conversation (`requested`, `note`). Le type `Menu`
// n'a ni l'un ni l'autre : `parseMenuReply` les en sépare.
export const DishReplySchema = DishSchema.extend({
  requested: z.boolean({
    error: "`requested` est absent ou n'est pas un booléen : mets true ou false pour chaque plat.",
  }),
});
export const MenuReplySchema = z.object({
  note: z.string({
    error:
      "`note` est absente ou n'est pas un texte : écris une ou deux phrases pour l'utilisateur.",
  }),
  dishes: z.array(DishReplySchema),
});

export interface MenuReply {
  menu: Menu;
  // Noms des plats que la demande ou le message nomme, dans l'ordre du menu.
  requested: string[];
  note: string;
}

export function parseMenuReply(
  text: string,
): ({ ok: true } & MenuReply) | { ok: false; error: string } {
  const parsed = parseJsonReply(text, MenuReplySchema);
  if (!parsed.ok) return parsed;
  const { note, dishes } = parsed.value;
  return {
    ok: true,
    // Champs recopiés un à un : un champ ajouté à `Dish` fait échouer le typage ici, pas en silence.
    menu: {
      dishes: dishes.map((dish) => ({
        name: dish.name,
        day: dish.day,
        ingredients: dish.ingredients,
        phases: dish.phases,
      })),
    },
    requested: dishes.filter((dish) => dish.requested).map((dish) => dish.name),
    note,
  };
}
