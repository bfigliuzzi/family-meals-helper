import type { Form } from "../../domain/ingredient.ts";
import type { ApplianceId, Menu, MenuIngredient, Phase } from "../../domain/menu.ts";

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

export function phase(
  id: string,
  minutes: number,
  appliance: ApplianceId,
  attended: boolean,
  after: string[] = [],
  description = `phase ${id}`,
): Phase {
  return { id, description, minutes, appliance, attended, after };
}

// Menu de référence : novembre, session le dimanche, 5 dîners. Il ne donne aucun constat, et son plat e
// (vendredi, 4 j au frigo, servi 5 j après la session) est à congeler. Ses phases tiennent en 2 h 15 (135 min)
// sans appareil d'appoint. Données seulement, utilisées par les tests.
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
        phases: [
          phase("a1", 15, "none", true, [], "Laver et émincer les poireaux"),
          phase("a2", 25, "induction", false, ["a1"], "Fondue de poireaux"),
        ],
      },
      {
        name: "Poulet aux carottes",
        day: "tue",
        ingredients: [item("cuisse de poulet", 600), item("carotte", 500), item("oignon", 100)],
        phases: [
          phase("b1", 20, "none", true, [], "Éplucher et couper carottes et oignon"),
          phase("b2", 10, "induction", true, ["b1"], "Saisir le poulet"),
          phase("b3", 40, "induction", false, ["b2"], "Mijoter"),
        ],
      },
      {
        name: "Bœuf braisé aux carottes",
        day: "wed",
        ingredients: [item("bœuf à braiser", 600), item("carotte", 600)],
        phases: [
          phase("c1", 15, "oven", false, [], "Préchauffer le four"),
          phase("c2", 15, "none", true, [], "Couper le bœuf et les carottes"),
          phase("c3", 120, "oven", false, ["c1", "c2"], "Braiser au four"),
        ],
      },
      {
        name: "Dal de lentilles corail au potiron",
        day: "thu",
        ingredients: [item("lentilles corail", 250, { form: "dry" }), item("potiron", 600)],
        phases: [
          phase("d1", 20, "none", true, [], "Éplucher et couper le potiron (dal et soupe)"),
          phase("d2", 25, "thermomix", false, ["d1"], "Cuire le dal"),
        ],
      },
      {
        name: "Soupe de potiron et navet",
        day: "fri",
        ingredients: [item("potiron", 600), item("navet", 400)],
        phases: [
          phase("e1", 10, "none", true, [], "Couper le navet"),
          phase("e2", 30, "kenwood", false, ["d1", "e1"], "Cuire la soupe"),
          phase("e3", 5, "none", true, ["e2"], "Mixer la soupe"),
        ],
      },
    ],
  };
}
