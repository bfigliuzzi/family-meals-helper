import type { Form } from "../../domain/ingredient.ts";
import type { Menu, MenuIngredient } from "../../domain/menu.ts";

function item(
  name: string,
  qty: number,
  over: { form?: Form; sameDay?: boolean } = {},
): MenuIngredient {
  return {
    name,
    qty,
    unit: "g",
    form: over.form ?? "fresh",
    category: null,
    sameDay: over.sameDay ?? false,
  };
}

// Menu de référence : novembre, session le dimanche, 5 dîners. Il ne donne aucun constat, et son plat e
// (vendredi, 4 j au frigo, servi 5 j après la session) est à congeler. Données seulement, utilisées par les tests.
export function balancedMenu(): Menu {
  return {
    dishes: [
      {
        name: "Cabillaud, fondue de poireaux et riz complet",
        day: "mon",
        ingredients: [
          item("poireau", 600),
          item("cabillaud", 600, { form: "frozen", sameDay: true }),
          item("riz complet", 300, { form: "dry", sameDay: true }),
        ],
      },
      {
        name: "Poulet aux carottes",
        day: "tue",
        ingredients: [item("cuisse de poulet", 600), item("carotte", 500), item("oignon", 100)],
      },
      {
        name: "Bœuf braisé aux carottes",
        day: "wed",
        ingredients: [item("bœuf à braiser", 600), item("carotte", 600)],
      },
      {
        name: "Dal de lentilles corail au potiron",
        day: "thu",
        ingredients: [item("lentilles corail", 250, { form: "dry" }), item("potiron", 600)],
      },
      {
        name: "Soupe de potiron et navet",
        day: "fri",
        ingredients: [item("potiron", 600), item("navet", 400)],
      },
    ],
  };
}
