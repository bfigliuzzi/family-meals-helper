import { describe, expect, it } from "vitest";
import type { Day, Menu, MenuIngredient } from "../domain/menu.ts";
import { DAYS } from "../domain/menu.ts";
import { buildIngredientIndex } from "../ingredients/index-lookup.ts";
import { REFERENTIAL } from "../ingredients/referential.ts";
import { SEASON_TABLE } from "../season/season-table.ts";
import type { CheckContext } from "./context.ts";
import { checkMenuShape, expectedDinners } from "./menu-shape.ts";

const ctx: CheckContext = {
  request: "un plat",
  exclusions: [],
  month: 11,
  sessionDay: "sun",
  dinners: 5,
  index: buildIngredientIndex(REFERENTIAL),
  seasonTable: SEASON_TABLE,
};

const ingredient: MenuIngredient = {
  name: "carotte",
  qty: 400,
  unit: "g",
  form: "fresh",
  category: null,
  sameDay: false,
};

function dish(day: Day, ingredients: MenuIngredient[] = [ingredient], name = "Plat") {
  return { name, day, ingredients, phases: [] };
}

const goodMenu: Menu = { dishes: DAYS.map((day) => dish(day)) };

describe("expectedDinners", () => {
  it("lit le nombre de dîners dans la demande", () => {
    expect(expectedDinners("un bœuf bourguignon, 5 dîners")).toBe(5);
    expect(expectedDinners("4 soirs")).toBe(4);
    expect(expectedDinners("quatre repas")).toBe(4);
  });
  it("ne prend pas un « deux soirs » ou « un soir » pour le nombre de dîners", () => {
    expect(expectedDinners("du poisson deux soirs, 5 dîners")).toBe(5);
    expect(expectedDinners("des lasagnes un soir, 5 dîners")).toBe(5);
    expect(expectedDinners("un repas végétarien et 4 dîners")).toBe(4);
    expect(expectedDinners("un soir poisson, un soir pâtes")).toBe(5);
  });
  it("prend le plus grand nombre de dîners cité", () => {
    expect(expectedDinners("5 dîners dont 2 dîners végétariens")).toBe(5);
  });
  it("garde 5 par défaut ou hors de 1 à 5", () => {
    expect(expectedDinners("du potimarron")).toBe(5);
    expect(expectedDinners("7 dîners")).toBe(5);
  });
});

describe("checkMenuShape", () => {
  it("ne dit rien d'un menu correct", () => {
    expect(checkMenuShape(goodMenu, ctx)).toEqual([]);
  });
  it("refuse un menu vide", () => {
    const findings = checkMenuShape({ dishes: [] }, ctx);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ level: "error", rule: "menu-shape" });
  });
  it("refuse cinq plats le même jour", () => {
    const menu = { dishes: DAYS.map(() => dish("mon")) };
    expect(checkMenuShape(menu, ctx)).toHaveLength(4);
  });
  it("refuse un ingrédient sans nom", () => {
    const menu: Menu = {
      dishes: DAYS.map((day, i) =>
        dish(day, i === 0 ? [{ ...ingredient, name: " ", category: "other" }] : [ingredient]),
      ),
    };
    const findings = checkMenuShape(menu, ctx);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      rule: "menu-shape",
      dish: 0,
      message: "Un ingrédient n'a pas de nom.",
    });
  });
  it("refuse un mauvais nombre de plats", () => {
    expect(checkMenuShape({ dishes: goodMenu.dishes.slice(0, 3) }, ctx)).toHaveLength(1);
  });
  it("exige les grammes pour la viande, le poisson et la charcuterie", () => {
    const beef = { ...ingredient, name: "bœuf à braiser", form: "fresh" as const };
    const withBeef = (over: Partial<MenuIngredient>): Menu => ({
      dishes: DAYS.map((day, i) => dish(day, i === 0 ? [{ ...beef, ...over }] : [ingredient])),
    });
    const inPieces = checkMenuShape(withBeef({ qty: 2, unit: "piece" }), ctx);
    expect(inPieces).toHaveLength(1);
    expect(inPieces[0]).toMatchObject({
      level: "error",
      rule: "menu-shape",
      dish: 0,
      message:
        "Donne « bœuf à braiser » en g : les plafonds de viande et les quantités se calculent en grammes.",
    });
    expect(checkMenuShape(withBeef({ qty: 10000, unit: "ml" }), ctx)).toHaveLength(1);
    expect(checkMenuShape(withBeef({ qty: 600, unit: "g" }), ctx)).toEqual([]);
    // inconnu : la catégorie donnée par l'IA compte
    const unknownFish = withBeef({ name: "truite", category: "fish", qty: 2, unit: "piece" });
    expect(checkMenuShape(unknownFish, ctx)).toHaveLength(1);
  });
  it("accepte les œufs en pièces", () => {
    const egg = { ...ingredient, name: "œuf", qty: 4, unit: "piece" as const };
    const menu: Menu = { dishes: DAYS.map((day, i) => dish(day, i === 0 ? [egg] : [ingredient])) };
    expect(checkMenuShape(menu, ctx)).toEqual([]);
  });
  it("refuse un plat sans ingrédient, sans nom ou à quantité nulle", () => {
    const menu: Menu = {
      dishes: [
        dish("mon", []),
        dish("tue", [ingredient], "  "),
        dish("wed", [{ ...ingredient, qty: 0 }]),
        dish("thu"),
        dish("fri"),
      ],
    };
    const findings = checkMenuShape(menu, ctx);
    expect(findings.map((finding) => finding.dish)).toEqual([0, 1, 2]);
  });
});
