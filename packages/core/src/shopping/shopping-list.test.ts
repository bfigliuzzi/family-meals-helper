import { describe, expect, it } from "vitest";
import type { Dish, Menu, MenuIngredient } from "../domain/menu.ts";
import { buildIngredientIndex } from "../ingredients/index-lookup.ts";
import { REFERENTIAL } from "../ingredients/referential.ts";
import { autumnMenu } from "../rules/fixtures/menus.ts";
import { cookingQuantityText, quantityPhrase, quantityText } from "./quantity-text.ts";
import {
  buildShoppingList,
  ingredientKey,
  pantryLineText,
  shoppingLineText,
} from "./shopping-list.ts";
import type { ShoppingLine } from "./shopping-list.ts";

const index = buildIngredientIndex(REFERENTIAL);

function item(name: string, qty: number, over: Partial<MenuIngredient> = {}): MenuIngredient {
  return { name, qty, unit: "g", form: "fresh", category: null, sameDay: false, ...over };
}

function menuOf(...dishes: MenuIngredient[][]): Menu {
  return {
    dishes: dishes.map((ingredients, i): Dish => ({
      name: `Plat ${i}`,
      day: (["mon", "tue", "wed", "thu", "fri"] as const)[i]!,
      ingredients,
      phases: [],
    })),
  };
}

function lineOf(menu: Menu, name: string): ShoppingLine {
  const list = buildShoppingList(menu, index);
  const found = [...list.lines, ...list.pantry].find((line) => line.name === name);
  if (found === undefined) throw new Error(`ligne absente : ${name}`);
  return found;
}

describe("buildShoppingList : sommes et répartition", () => {
  it("additionne un ingrédient sur trois plats et donne la répartition", () => {
    const menu = menuOf(
      [item("tomate", 400)],
      [item("tomate", 200)],
      [item("riz complet", 100)],
      [item("tomate", 500)],
    );
    const line = lineOf(menu, "tomate");
    expect(line.totals).toEqual([{ unit: "g", qty: 1100 }]);
    expect(line.split).toEqual([
      { dish: 0, qty: 400, unit: "g" },
      { dish: 1, qty: 200, unit: "g" },
      { dish: 3, qty: 500, unit: "g" },
    ]);
    expect(shoppingLineText(line)).toBe("1,1 kg de tomate (a : 400 g, b : 200 g, d : 500 g)");
  });
  it("donne une seule lettre quand un seul plat s'en sert", () => {
    expect(shoppingLineText(lineOf(menuOf([item("poireau", 600)]), "poireau"))).toBe(
      "600 g de poireau (a)",
    );
  });
  it("garde deux sommes pour deux unités, g avant pièces, sur une seule ligne", () => {
    const menu = menuOf(
      [item("oignon", 2, { unit: "piece" })],
      [item("oignon", 100)],
      [item("carotte", 1)],
    );
    const line = lineOf(menu, "oignon");
    expect(line.totals).toEqual([
      { unit: "g", qty: 100 },
      { unit: "piece", qty: 2 },
    ]);
    expect(line.split).toEqual([
      { dish: 0, qty: 2, unit: "piece" },
      { dish: 1, qty: 100, unit: "g" },
    ]);
    expect(shoppingLineText(line)).toBe("100 g + 2 pièces d'oignon (a : 2 pièces, b : 100 g)");
  });
  it("regroupe un synonyme ou un pluriel sous le nom du référentiel", () => {
    const menu = menuOf([item("carottes", 300)], [item("carotte", 200)]);
    const { lines } = buildShoppingList(menu, index);
    expect(lines).toHaveLength(1);
    expect(lines[0]?.name).toBe("carotte");
    expect(lines[0]?.totals).toEqual([{ unit: "g", qty: 500 }]);
  });
  it("additionne deux lignes du même plat dans une seule part de la répartition", () => {
    const menu = menuOf([item("carotte", 200), item("carotte", 100)]);
    expect(lineOf(menu, "carotte").split).toEqual([{ dish: 0, qty: 300, unit: "g" }]);
  });
  it("dit des pièces avec le nom au pluriel", () => {
    const menu = menuOf([item("cuisse de poulet", 4, { unit: "piece" })]);
    expect(shoppingLineText(lineOf(menu, "cuisse de poulet"))).toBe("4 cuisses de poulet (a)");
  });
});

describe("buildShoppingList : formes, soir, placard, inconnus", () => {
  it("dit « surgelé » et « conserve », même pour un poisson surgelé par défaut", () => {
    const menu = menuOf(
      [item("cabillaud", 600, { form: "frozen" })],
      [item("maïs", 200, { form: "canned" })],
    );
    expect(shoppingLineText(lineOf(menu, "cabillaud"))).toBe("600 g de cabillaud (a) · surgelé");
    expect(shoppingLineText(lineOf(menu, "maïs"))).toBe("200 g de maïs (b) · conserve");
  });
  it("ne dit jamais « frais » ni « sec » quand le nom n'a qu'une forme", () => {
    const menu = menuOf([item("carotte", 300), item("riz complet", 300, { form: "dry" })]);
    for (const name of ["carotte", "riz complet"]) {
      expect(shoppingLineText(lineOf(menu, name))).not.toMatch(/frais|sec/);
    }
  });
  it("dit la forme de chaque ligne quand un même nom est en deux formes, « frais » et « sec » compris", () => {
    const menu = menuOf(
      [item("haricot rouge", 200, { form: "dry" })],
      [item("haricot rouge", 400)],
      [item("carotte", 300)],
    );
    const texts = buildShoppingList(menu, index).lines.map(shoppingLineText);
    expect(texts).toContain("200 g de haricot rouge (a) · sec");
    expect(texts).toContain("400 g de haricot rouge (b) · frais");
    expect(texts).toContain("300 g de carotte (c)");
  });
  it("sépare le même nom en deux formes : on ne les achète pas de la même façon", () => {
    const menu = menuOf([item("maïs", 200, { form: "canned" }), item("maïs", 150)]);
    const { lines } = buildShoppingList(menu, index);
    expect(lines.map((line) => line.form).sort()).toEqual(["canned", "fresh"]);
  });
  it("dit « soir » seulement quand toutes les utilisations sont du soir même", () => {
    const evening = menuOf([item("cabillaud", 600, { form: "frozen", sameDay: true })]);
    expect(lineOf(evening, "cabillaud").totals).toEqual([{ unit: "g", qty: 600 }]);
    expect(shoppingLineText(lineOf(evening, "cabillaud"))).toBe(
      "600 g de cabillaud (a) · surgelé · soir",
    );
    const mixed = menuOf([item("carotte", 100, { sameDay: true })], [item("carotte", 200)]);
    expect(shoppingLineText(lineOf(mixed, "carotte"))).not.toContain("soir");
  });
  it("met un ingrédient du placard à part, avec sa quantité et ses plats", () => {
    const menu = menuOf(
      [item("huile d'olive", 30, { unit: "ml" }), item("carotte", 300)],
      [item("huile d'olive", 30, { unit: "ml" })],
    );
    const list = buildShoppingList(menu, index);
    expect(list.pantry.map(pantryLineText)).toEqual(["60 ml d'huile d'olive (a, b)"]);
    expect(list.lines.map((line) => line.name)).toEqual(["carotte"]);
  });
  it("marque un inconnu à confirmer, jamais au placard, sous le premier nom reçu", () => {
    const menu = menuOf(
      [item("Pintade", 400, { category: "poultry" })],
      [item("pintades", 400, { category: "poultry" })],
    );
    const list = buildShoppingList(menu, index);
    expect(list.pantry).toEqual([]);
    expect(list.lines).toHaveLength(1);
    expect(list.lines[0]?.toConfirm).toBe(true);
    expect(shoppingLineText(list.lines[0]!)).toBe(
      "800 g de Pintade (a : 400 g, b : 400 g) · à confirmer",
    );
  });
  it("trie les lignes dans l'ordre alphabétique français, sans rayon", () => {
    const menu = menuOf([
      item("fenouil", 300),
      item("épinard", 300),
      item("cabillaud", 300, { form: "frozen" }),
      item("cuisse de poulet", 300),
    ]);
    expect(buildShoppingList(menu, index).lines.map((line) => line.name)).toEqual([
      "cabillaud",
      "cuisse de poulet",
      "épinard",
      "fenouil",
    ]);
  });
  it("donne la liste du menu d'automne : potiron regroupé avec sa répartition, huile et cumin au placard", () => {
    const list = buildShoppingList(autumnMenu(), index);
    expect(list.lines.map(shoppingLineText)).toContain("1 kg de potiron (d : 600 g, e : 400 g)");
    expect(list.pantry.map(pantryLineText)).toEqual([
      "3 g de cumin (d)",
      "100 ml d'huile d'olive (a, b, c, d)",
    ]);
  });
});

describe("ingredientKey", () => {
  it("donne le nom du référentiel, ou le nom normalisé d'un inconnu, avec la forme", () => {
    expect(ingredientKey(item("carottes", 1), index)).toEqual({ name: "carotte", form: "fresh" });
    expect(ingredientKey(item("Pintades", 1, { form: "frozen" }), index)).toEqual({
      name: "pintade",
      form: "frozen",
    });
  });
});

describe("quantityPhrase", () => {
  it("élide « de » devant une voyelle ou un h muet, pas devant un h aspiré", () => {
    expect(quantityPhrase([{ unit: "g", qty: 100 }], "oignon", "cooking")).toBe("100 g d'oignon");
    expect(quantityPhrase([{ unit: "ml", qty: 30 }], "huile d'olive", "cooking")).toBe(
      "30 ml d'huile d'olive",
    );
    expect(quantityPhrase([{ unit: "g", qty: 200 }], "haricot rouge", "cooking")).toBe(
      "200 g de haricot rouge",
    );
    expect(quantityPhrase([{ unit: "g", qty: 600 }], "œuf", "cooking")).toBe("600 g d'œuf");
  });
  it("met au pluriel chaque mot avant le premier mot de liaison, pour 2 pièces ou plus : s, x après -eau ou -au, rien après s, x, z", () => {
    const pieces = (qty: number, name: string): string =>
      quantityPhrase([{ unit: "piece", qty }], name, "cooking");
    expect(pieces(2, "cuisse de poulet")).toBe("2 cuisses de poulet");
    expect(pieces(2, "hareng fumé")).toBe("2 harengs fumés");
    expect(pieces(2, "huile d'olive")).toBe("2 huiles d'olive");
    expect(pieces(2, "pomme au four")).toBe("2 pommes au four");
    expect(pieces(3, "poireau")).toBe("3 poireaux");
    expect(pieces(2, "noix")).toBe("2 noix");
    expect(pieces(1, "oignon")).toBe("1 oignon");
    expect(pieces(1.5, "oignon")).toBe("1,5 oignon");
  });
  it("joint deux unités par « + », g avant pièces", () => {
    const totals = [
      { unit: "piece" as const, qty: 2 },
      { unit: "g" as const, qty: 100 },
    ];
    expect(quantityPhrase(totals, "oignon", "display")).toBe("100 g + 2 pièces d'oignon");
  });
  it("arrondit pour l'affichage, garde la valeur pour la cuisine", () => {
    expect(quantityPhrase([{ unit: "g", qty: 1234 }], "potiron", "display")).toBe(
      "1,24 kg de potiron",
    );
    expect(quantityPhrase([{ unit: "g", qty: 1234 }], "potiron", "cooking")).toBe(
      "1234 g de potiron",
    );
  });
});

describe("cookingQuantityText", () => {
  it("garde 4 chiffres significatifs, dans l'unité du menu, jamais 0", () => {
    expect(cookingQuantityText(0.003, "g")).toBe("0,003 g");
    expect(cookingQuantityText(0.3, "g")).toBe("0,3 g");
    expect(cookingQuantityText(250.2, "ml")).toBe("250,2 ml");
    expect(cookingQuantityText(1234, "g")).toBe("1234 g");
    expect(cookingQuantityText(1 / 3, "piece")).toBe("0,3333 pièce");
    expect(cookingQuantityText(2, "piece")).toBe("2 pièces");
  });
});

describe("quantityText", () => {
  it("arrondit g et ml au-dessus, jamais à zéro", () => {
    expect(quantityText(0.3, "g")).toBe("1 g");
    expect(quantityText(950, "g")).toBe("950 g");
    expect(quantityText(250.2, "ml")).toBe("251 ml");
  });
  it("passe en kg et en L à partir de 1000, virgule décimale, sans zéros inutiles", () => {
    expect(quantityText(1000, "g")).toBe("1 kg");
    expect(quantityText(1100, "g")).toBe("1,1 kg");
    expect(quantityText(1250, "g")).toBe("1,25 kg");
    expect(quantityText(1000, "ml")).toBe("1 L");
    expect(quantityText(999.5, "g")).toBe("1 kg");
    expect(quantityText(1234, "g")).toBe("1,24 kg");
  });
  it("ne se trompe pas sur une somme de flottants", () => {
    expect(quantityText(0.1 + 0.2 + 299.7, "g")).toBe("300 g");
    expect(quantityText(1100.0000000001, "g")).toBe("1,1 kg");
  });
  it("garde les pièces à 2 décimales au plus, arrondies au-dessus", () => {
    expect(quantityText(1, "piece")).toBe("1 pièce");
    expect(quantityText(3, "piece")).toBe("3 pièces");
    expect(quantityText(1.5, "piece")).toBe("1,5 pièce");
    expect(quantityText(0.004, "piece")).toBe("0,01 pièce");
    expect(quantityText(0.333333, "piece")).toBe("0,34 pièce");
  });
});
