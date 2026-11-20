import { describe, expect, it } from "vitest";
import type { IngredientRef } from "../domain/ingredient.ts";
import type { Dish, Menu, MenuIngredient } from "../domain/menu.ts";
import { buildIngredientIndex } from "../ingredients/index-lookup.ts";
import { REFERENTIAL } from "../ingredients/referential.ts";
import { autumnMenu } from "../rules/fixtures/menus.ts";
import { buildShoppingList } from "../shopping/shopping-list.ts";
import { inseeLookup } from "../pricing/insee.ts";
import { INSEE_TABLE } from "../pricing/insee-table.ts";
import { manualLookup } from "../pricing/manual.ts";
import {
  checklistCost,
  PANTRY_KEY,
  readChecked,
  shoppingChecklist,
  shoppingKey,
} from "./checks.ts";

const index = buildIngredientIndex(REFERENTIAL);
const INVISIBLE = /[\u202E\u200B]/;

function item(name: string, qty: number, over: Partial<MenuIngredient> = {}): MenuIngredient {
  return { name, qty, unit: "g", form: "fresh", category: null, sameDay: false, ...over };
}

function menuOf(...dishes: MenuIngredient[][]): Menu {
  return {
    dishes: dishes.map((ingredients, i): Dish => ({
      name: `Plat ${String(i)}`,
      day: (["mon", "tue", "wed", "thu", "fri"] as const)[i]!,
      ingredients,
      phases: [],
    })),
  };
}

describe("shoppingKey et shoppingChecklist : les clés", () => {
  it("la clé est l'identifiant de regroupement de la liste : une clé par ligne, sans doublon, placard en dernier", () => {
    const menu = menuOf(
      [item("Carottes", 500), item("Topinambours Géants", 300, { category: "vegetable" })],
      [item("carotte", 600), item("topinambour geant", 200, { category: "vegetable" })],
      [
        item("maïs", 200, { form: "canned" }),
        item("maïs", 150),
        item("huile d'olive", 30, { unit: "ml" }),
      ],
    );
    const checklist = shoppingChecklist(menu, index);
    expect(checklist.keys).toEqual([
      "fresh|carotte",
      "canned|maïs",
      "fresh|maïs",
      "fresh|topinambour geant",
      PANTRY_KEY,
    ]);
    expect(new Set(checklist.keys).size).toBe(checklist.keys.length);
    // Chaque ligne de la liste a la clé qu'`buildShoppingList` utilise pour la regrouper.
    const list = buildShoppingList(menu, index);
    expect(list.lines.map((line) => shoppingKey(line, index))).toEqual(checklist.keys.slice(0, -1));
  });

  it("menu d'exemple : 10 lignes dans l'ordre, placard à 2 entrées, soir, rien à confirmer", () => {
    const checklist = shoppingChecklist(autumnMenu(), index);
    expect(checklist.lines.map((line) => line.name)).toEqual([
      "Bœuf à braiser",
      "Cabillaud (surgelé)",
      "Carotte",
      "Cuisse de poulet",
      "Lentilles corail",
      "Navet",
      "Oignon",
      "Poireau",
      "Potiron",
      "Riz complet",
    ]);
    expect(checklist.lines.find((line) => line.name === "Cabillaud (surgelé)")?.detail).toBe(
      "600 g (a) · soir",
    );
    expect(checklist.lines.find((line) => line.name === "Carotte")?.detail).toBe(
      "1,1 kg (b : 500 g, c : 600 g)",
    );
    expect(checklist.keys).toContain("frozen|cabillaud");
    expect(checklist.keys.at(-1)).toBe(PANTRY_KEY);
    expect(checklist.pantry?.items).toEqual([
      "Cumin : 3 g (d)",
      "Huile d'olive : 100 ml (a, b, c, d)",
    ]);
    expect(checklist.evening).toBe(true);
    expect(checklist.toConfirm).toBe(false);
  });

  it("sans ingrédient de placard : pas de placard, pas de clé « placard »", () => {
    const checklist = shoppingChecklist(menuOf([item("carotte", 300)]), index);
    expect(checklist.pantry).toBeNull();
    expect(checklist.keys).toEqual(["fresh|carotte"]);
  });

  it("dit la forme dans le nom quand elle se dit : deux lignes du même ingrédient ont deux noms", () => {
    const menu = menuOf([item("maïs", 200, { form: "canned" }), item("maïs", 150)]);
    const names = shoppingChecklist(menu, index).lines.map((line) => line.name);
    expect(names).toEqual(["Maïs (conserve)", "Maïs (frais)"]);
  });

  it("marque « à confirmer » pour un ingrédient inconnu", () => {
    const checklist = shoppingChecklist(
      menuOf([item("Pintade", 400, { category: "poultry" })]),
      index,
    );
    expect(checklist.toConfirm).toBe(true);
    expect(checklist.lines[0]?.detail).toBe("400 g (a) · à confirmer");
  });
});

describe("shoppingChecklist : textes affichables", () => {
  it("retire les caractères invisibles du nom, du détail et du placard", () => {
    const dirty = "sel\u202E\u200Bfin";
    const ref: IngredientRef = {
      name: dirty,
      synonyms: [],
      variants: [],
      groups: [],
      category: "condiment",
      defaultForm: "fresh",
      pantry: true,
      seasonExempt: true,
    };
    const dirtyIndex = buildIngredientIndex([...REFERENTIAL, ref]);
    const menu = menuOf([
      item("Navet\u202E\u200B rare", 300, { category: "vegetable" }),
      item(dirty, 5),
    ]);
    const checklist = shoppingChecklist(menu, dirtyIndex);
    expect(checklist.lines).toHaveLength(1);
    expect(checklist.pantry?.items).toHaveLength(1);
    for (const line of checklist.lines) {
      expect(line.name).not.toMatch(INVISIBLE);
      expect(line.detail).not.toMatch(INVISIBLE);
    }
    for (const text of checklist.pantry?.items ?? []) expect(text).not.toMatch(INVISIBLE);
    expect(checklist.lines[0]?.name).toBe("Navet rare");
    expect(checklist.pantry?.items[0]).toBe("Selfin : 5 g (a)");
  });

  it("le détail passe par printable", () => {
    // Le détail ne contient que des lettres de plats et des quantités, jamais du texte de l'IA : `printable` y est une
    // défense, sans mutation observable.
    const checklist = shoppingChecklist(menuOf([item("carotte", 300)]), index);
    expect(checklist.lines[0]?.detail).toBe("300 g (a)");
  });

  it("met la première lettre en capitale sans couper un caractère hors BMP", () => {
    const menu = menuOf([
      item("œufs", 6, { unit: "piece", category: "egg" }),
      item("𝒳yloïde", 100, { category: "vegetable" }),
    ]);
    const names = shoppingChecklist(menu, index).lines.map((line) => line.name);
    expect(names).toContain("Œuf");
    expect(names).toContain("𝒳yloïde");
  });

  it("le résultat est gelé", () => {
    const checklist = shoppingChecklist(autumnMenu(), index);
    expect(Object.isFrozen(checklist)).toBe(true);
    expect(Object.isFrozen(checklist.lines)).toBe(true);
    expect(Object.isFrozen(checklist.lines[0])).toBe(true);
    expect(Object.isFrozen(checklist.pantry)).toBe(true);
    expect(Object.isFrozen(checklist.pantry?.items)).toBe(true);
    expect(Object.isFrozen(checklist.keys)).toBe(true);
  });
});

describe("readChecked", () => {
  it("lit un tableau JSON de chaînes", () => {
    expect(readChecked('["a","b"]')).toEqual(["a", "b"]);
    expect(readChecked("[]")).toEqual([]);
  });
  it("rend null, sans lever, pour tout le reste", () => {
    for (const text of ["{}", "[1]", "pas du json", "null", '["a",2]', '"a"', ""]) {
      expect(readChecked(text)).toBeNull();
    }
  });
});

describe("shoppingChecklist : units", () => {
  it("donne l'unité de prix de chaque somme, dans l'ordre g, ml, pièce", () => {
    const menu = menuOf([
      item("carotte", 600),
      item("carotte", 2, { unit: "piece" }),
      item("lait", 500, { unit: "ml" }),
      item("lait", 250, { unit: "ml" }),
    ]);
    const lines = shoppingChecklist(menu, index).lines;
    expect(lines.find((line) => line.key === "fresh|carotte")?.units).toEqual(["kg", "piece"]);
    expect(lines.find((line) => line.key === "fresh|lait")?.units).toEqual(["l"]);
  });
});

describe("checklistCost", () => {
  const menu = menuOf([item("carotte", 600), item("lait", 500, { unit: "ml" })]);
  const insee = inseeLookup(INSEE_TABLE);

  it("compose les textes de chaque ligne, le total et la mention des sources", () => {
    const cost = checklistCost(menu, index, [insee]);
    expect(cost.lines.get("fresh|carotte")).toMatch(
      /^≈ \d+,\d{2} € · \d+,\d{2} €\/kg · INSEE, moyenne nationale d/,
    );
    expect(cost.lines.get("fresh|lait")).toBe("prix inconnu");
    expect(cost.unknown).toBe(1);
    expect(cost.total).toMatch(/^Coût estimé : au moins \d+,\d{2} € · 1 prix inconnu$/);
    expect(cost.notice).toBe(
      "Sources : INSEE, prix moyens de vente au détail, Licence Ouverte 2.0.",
    );
    expect([...cost.lines.keys()]).toEqual(["fresh|carotte", "fresh|lait"]);
  });
  it("un prix manuel change le texte de la ligne, le total et les sources", () => {
    const manual = manualLookup([
      { key: "fresh|carotte", unit: "kg", cents: 300, date: "2026-11-16" },
    ]);
    const cost = checklistCost(menu, index, [manual, insee]);
    expect(cost.lines.get("fresh|carotte")).toBe("≈ 1,80 € · 3,00 €/kg · votre prix du 16/11/2026");
    expect(cost.total).toBe("Coût estimé : au moins 1,80 € · 1 prix inconnu");
    expect(cost.notice).toBe("Sources : votre table de prix.");
  });
  it("sans aucune source employée, la mention est vide", () => {
    const cost = checklistCost(menuOf([item("lait", 500, { unit: "ml" })]), index, [insee]);
    expect(cost.notice).toBe("");
    expect(cost.total).toBe("Coût estimé : inconnu (1 prix inconnu)");
  });
});
