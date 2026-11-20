import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Menu, MenuIngredient } from "../domain/menu.ts";
import { buildIngredientIndex } from "../ingredients/index-lookup.ts";
import { normalizeName } from "../ingredients/normalize.ts";
import { REFERENTIAL } from "../ingredients/referential.ts";
import { estimateCost, menuCost } from "./cost.ts";
import { lineCostText } from "./cost-text.ts";
import { buildInseeTable, inseeLookup, parseInseeData, parseInseeLabels } from "./insee.ts";
import type { PriceLookup, PriceSource, PriceUnit, UnitPrice } from "./price.ts";
import { buildShoppingList } from "../shopping/shopping-list.ts";

const index = buildIngredientIndex(REFERENTIAL);

const { table } = buildInseeTable({
  data: parseInseeData(
    readFileSync(new URL("./fixtures/insee-sample.csv", import.meta.url), "utf8"),
  ),
  labels: parseInseeLabels(
    readFileSync(new URL("./fixtures/insee-metadata-sample.csv", import.meta.url), "utf8"),
  ),
  map: [
    { series: "8948", key: "fresh|carotte", unit: "kg" },
    { series: "8955", key: "fresh|tomate", unit: "kg" },
    { series: "3838", key: "fresh|chou-fleur", unit: "piece" },
  ],
});
const insee = inseeLookup(table);

function item(name: string, qty: number, over: Partial<MenuIngredient> = {}): MenuIngredient {
  return { name, qty, unit: "g", form: "fresh", category: null, sameDay: false, ...over };
}

function menuOf(...dishes: MenuIngredient[][]): Menu {
  return {
    dishes: dishes.map((ingredients, i) => ({
      name: `Plat ${i}`,
      day: (["mon", "tue", "wed", "thu", "fri"] as const)[i]!,
      ingredients,
      phases: [],
    })),
  };
}

// Une source de test : clé et unité → prix.
function lookupOf(
  rows: Record<string, Partial<Record<PriceUnit, number>>>,
  source: PriceSource = { kind: "manual", date: "2026-11-20" },
): PriceLookup {
  return {
    find(key, unit): UnitPrice | null {
      const euros = rows[key]?.[unit];
      return euros === undefined ? null : { unit, euros, source };
    },
  };
}

describe("estimateCost sur l'extrait INSEE", () => {
  const menu = menuOf(
    [item("carotte", 600), item("tomate", 400)],
    [item("chou-fleur", 1, { unit: "piece" }), item("lait", 500, { unit: "ml" })],
    [item("huile d'olive", 30, { unit: "ml" })],
  );
  const cost = menuCost(menu, index, [insee]);
  const byKey = (key: string) => cost.lines.find((line) => line.key === key)!;

  it("chiffre carotte, tomate et chou-fleur avec la source INSEE du mois 2026-10", () => {
    expect(byKey("fresh|carotte").euros).toBeCloseTo(1.308, 10);
    expect(byKey("fresh|tomate").euros).toBeCloseTo(1.7, 10);
    expect(byKey("fresh|chou-fleur").euros).toBeCloseTo(3.27, 10);
    expect(byKey("fresh|carotte").parts[0]?.price?.source).toEqual({
      kind: "insee",
      month: "2026-10",
    });
  });
  it("écrit le texte exact de la ligne carotte et du chou-fleur", () => {
    expect(lineCostText(byKey("fresh|carotte"))).toBe(
      "≈ 1,31 € · 2,18 €/kg · INSEE, moyenne nationale d'octobre 2026",
    );
    expect(lineCostText(byKey("fresh|chou-fleur"))).toBe(
      "≈ 3,27 € · 3,27 €/pièce · INSEE, moyenne nationale d'octobre 2026",
    );
  });
  it("laisse le lait sans prix et ne compte pas le placard", () => {
    expect(lineCostText(byKey("fresh|lait"))).toBe("prix inconnu");
    expect(cost.lines.map((line) => line.key)).not.toContain("fresh|huile d'olive");
    expect(cost.lines).toHaveLength(4);
  });
  it("additionne les lignes connues et compte l'inconnue", () => {
    expect(cost.total).toBeCloseTo(0.6 * 2.18 + 0.4 * 4.25 + 3.27, 10);
    expect(cost.unknown).toBe(1);
    expect(cost.sources).toEqual(["insee"]);
  });
  it("suit l'ordre de la liste de courses", () => {
    expect(cost.lines.map((line) => line.key)).toEqual(
      buildShoppingList(menu, index).lines.map((line) => `fresh|${line.name}`),
    );
  });
  it("estimateCost et menuCost donnent la même chose", () => {
    expect(estimateCost(buildShoppingList(menu, index), index, [insee])).toEqual(cost);
  });
});

describe("estimateCost : unités", () => {
  it("n'applique un prix que dans la bonne unité", () => {
    const cost = menuCost(menuOf([item("carotte", 2, { unit: "piece" })]), index, [insee]);
    expect(cost.lines[0]?.euros).toBeNull();
    expect(cost.lines[0]?.otherUnits).toEqual(["kg"]);
    expect(lineCostText(cost.lines[0]!)).toBe("prix inconnu (prix connu seulement en €/kg)");
    expect(cost.total).toBe(0);
    expect(cost.unknown).toBe(1);
    expect(cost.sources).toEqual([]);
  });
  it("une ligne en g et en pièces dont une seule unité a un prix est inconnue, hors du total", () => {
    const menu = menuOf([item("carotte", 300)], [item("carotte", 2, { unit: "piece" })]);
    const cost = menuCost(menu, index, [insee]);
    expect(cost.lines[0]?.parts.map((part) => part.euros === null)).toEqual([false, true]);
    expect(cost.lines[0]?.euros).toBeNull();
    expect(cost.total).toBe(0);
    expect(cost.unknown).toBe(1);
  });
  it("une ligne en g et en pièces avec les deux prix s'écrit avec ses deux parties", () => {
    const both = lookupOf({ "fresh|carotte": { kg: 2, piece: 0.5 } });
    const menu = menuOf([item("carotte", 500)], [item("carotte", 2, { unit: "piece" })]);
    const line = menuCost(menu, index, [both]).lines[0]!;
    expect(line.euros).toBeCloseTo(1 + 1, 10);
    expect(lineCostText(line)).toBe(
      "≈ 2,00 € · 2,00 €/kg (votre prix du 20/11/2026) + 0,50 €/pièce (votre prix du 20/11/2026)",
    );
  });
  it("un litre se paie au litre", () => {
    const cost = menuCost(menuOf([item("lait", 500, { unit: "ml" })]), index, [
      lookupOf({ "fresh|lait": { l: 1.05 } }),
    ]);
    expect(cost.lines[0]?.euros).toBeCloseTo(0.525, 10);
  });
  it("ne convertit pas les millilitres en grammes", () => {
    const cost = menuCost(menuOf([item("lait", 500, { unit: "ml" })]), index, [
      lookupOf({ "fresh|lait": { kg: 1 } }),
    ]);
    expect(cost.lines[0]?.euros).toBeNull();
  });
});

describe("estimateCost : ordre des sources", () => {
  const first = lookupOf({ "fresh|carotte": { kg: 1 } });
  const second = lookupOf(
    { "fresh|carotte": { kg: 9 }, "fresh|tomate": { kg: 3 } },
    { kind: "insee", month: "2026-10" },
  );
  it("la première source qui a un prix gagne ; la suivante sert sinon", () => {
    const cost = menuCost(menuOf([item("carotte", 1000), item("tomate", 1000)]), index, [
      first,
      second,
    ]);
    const euros = Object.fromEntries(cost.lines.map((line) => [line.key, line.euros]));
    expect(euros).toEqual({ "fresh|carotte": 1, "fresh|tomate": 3 });
    expect(cost.sources).toEqual(["manual", "insee"]);
  });
  it("sans source, tout est inconnu", () => {
    const cost = menuCost(menuOf([item("carotte", 1000)]), index, []);
    expect(cost.unknown).toBe(1);
    expect(cost.sources).toEqual([]);
  });
});

describe("estimateCost : œuf", () => {
  it("convertit des pièces avec un prix au kilo (50 g par pièce)", () => {
    const cost = menuCost(menuOf([item("œuf", 4, { unit: "piece" })]), index, [
      lookupOf({ "fresh|œuf": { kg: 10 } }),
    ]);
    expect(cost.lines[0]?.euros).toBeCloseTo(2, 10);
  });
  it("convertit des grammes avec un prix à la pièce", () => {
    const cost = menuCost(menuOf([item("œuf", 200)]), index, [
      lookupOf({ "fresh|œuf": { piece: 0.5 } }),
    ]);
    expect(cost.lines[0]?.euros).toBeCloseTo(2, 10);
  });
  it("convertit l'œuf dans la première source avant d'essayer la source suivante", () => {
    const cost = menuCost(menuOf([item("œuf", 4, { unit: "piece" })]), index, [
      lookupOf({ "fresh|œuf": { kg: 10 } }),
      lookupOf({ "fresh|œuf": { piece: 0.3 } }),
    ]);
    // Même source d'abord : la conversion de la première source l'emporte sur la seconde source.
    expect(cost.lines[0]?.euros).toBeCloseTo(2, 10);
  });
  it("une autre catégorie en pièces avec un prix au kilo reste inconnue", () => {
    const cost = menuCost(menuOf([item("citron", 4, { unit: "piece" })]), index, [
      lookupOf({ "fresh|citron": { kg: 10 } }),
    ]);
    expect(cost.lines[0]?.euros).toBeNull();
  });
});

describe("estimateCost : ingrédient absent du référentiel", () => {
  it("la clé est le nom normalisé, et seule une source qui la connaît donne un prix", () => {
    const menu = menuOf([item("Pastèque Jaune", 1000)]);
    expect(index.find("Pastèque Jaune")).toBeUndefined();
    const cost = menuCost(menu, index, [lookupOf({ "fresh|pasteque jaune": { kg: 2 } })]);
    expect(cost.lines[0]?.key).toBe("fresh|pasteque jaune");
    expect(cost.lines[0]?.euros).toBe(2);
    expect(menuCost(menu, index, [insee]).unknown).toBe(1);
  });
  it("un œuf inconnu déclaré egg partout est converti ; une catégorie contradictoire ne l'est pas", () => {
    const egg = lookupOf({ [`fresh|${normalizeName("œufs de ferme")}`]: { kg: 10 } });
    const eggs = (category: MenuIngredient["category"]): MenuIngredient =>
      item("œufs de ferme", 2, { unit: "piece", category });
    expect(index.find("œufs de ferme")).toBeUndefined();
    const sure = menuCost(menuOf([eggs("egg")], [eggs("egg")]), index, [egg]);
    expect(sure.lines[0]?.euros).toBeCloseTo(2, 10);
    const mixed = menuCost(menuOf([eggs("egg")], [eggs("dairy")]), index, [egg]);
    expect(mixed.lines[0]?.euros).toBeNull();
  });
});
