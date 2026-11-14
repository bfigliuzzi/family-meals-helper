import type { Form } from "../../domain/ingredient.ts";
import type { ApplianceId, Menu, MenuIngredient, Phase, Unit } from "../../domain/menu.ts";

function item(
  name: string,
  qty: number,
  over: { form?: Form; sameDay?: boolean; unit?: Unit } = {},
): MenuIngredient {
  return {
    name,
    qty,
    unit: over.unit ?? "g",
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

// Menu d'automne de la fiche d'exemple : les plats de `balancedMenu()`, avec un choix d'appareils logique (dal en
// cocotte sur la plaque, soupe cuite puis mixée au Thermomix) et l'huile d'olive des étapes au placard. Références
// fixes, citées par `autumnDetail()` : d.1 potiron 600 g, d.2 lentilles corail, d.4 cumin ; e.1 potiron 400 g,
// e.2 navet ; huile d'olive en a.4, b.4, c.3 et d.3. Tout ce que les étapes citent est au menu. Il ne donne aucun
// constat. Données seulement.
export function autumnMenu(): Menu {
  const oil = (ml = 30): MenuIngredient => item("huile d'olive", ml, { unit: "ml" });
  return {
    dishes: [
      {
        name: "Cabillaud, fondue de poireaux et riz complet",
        day: "mon",
        ingredients: [
          item("poireau", 600),
          item("cabillaud", 600, { form: "frozen", sameDay: true }),
          item("riz complet", 300, { form: "dry", sameDay: true }),
          oil(),
        ],
        phases: [
          phase("a1", 15, "none", true, [], "Laver et émincer les poireaux"),
          phase("a2", 25, "induction", false, ["a1"], "Fondue de poireaux"),
        ],
      },
      {
        name: "Poulet aux carottes",
        day: "tue",
        ingredients: [
          item("cuisse de poulet", 600),
          item("carotte", 500),
          item("oignon", 100),
          oil(),
        ],
        phases: [
          phase("b1", 20, "none", true, [], "Éplucher et couper carottes et oignon"),
          phase("b2", 10, "induction", true, ["b1"], "Saisir le poulet"),
          phase("b3", 40, "induction", false, ["b2"], "Mijoter"),
        ],
      },
      {
        name: "Bœuf braisé aux carottes",
        day: "wed",
        ingredients: [item("bœuf à braiser", 600), item("carotte", 600), oil(20)],
        phases: [
          phase("c1", 15, "oven", false, [], "Préchauffer le four"),
          phase("c2", 15, "none", true, [], "Couper le bœuf et les carottes"),
          phase("c3", 120, "oven", false, ["c1", "c2"], "Braiser au four"),
        ],
      },
      {
        name: "Dal de lentilles corail au potiron",
        day: "thu",
        ingredients: [
          item("potiron", 600),
          item("lentilles corail", 250, { form: "dry" }),
          oil(20),
          item("cumin", 3, { form: "dry" }),
        ],
        phases: [
          phase("d1", 20, "none", true, [], "Éplucher et couper le potiron (dal et soupe)"),
          phase("d2", 25, "induction", false, ["d1"], "Cuire le dal en cocotte"),
        ],
      },
      {
        name: "Soupe de potiron et navet",
        day: "fri",
        ingredients: [item("potiron", 400), item("navet", 400)],
        phases: [
          phase("e1", 10, "none", true, [], "Couper le navet"),
          phase("e2", 25, "thermomix", false, ["d1", "e1"], "Cuire la soupe"),
          phase("e3", 2, "thermomix", true, ["e2"], "Mixer la soupe"),
        ],
      },
    ],
  };
}
