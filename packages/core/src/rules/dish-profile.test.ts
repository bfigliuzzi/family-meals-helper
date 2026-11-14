import { describe, expect, it } from "vitest";
import type { Dish, MenuIngredient } from "../domain/menu.ts";
import { buildIngredientIndex } from "../ingredients/index-lookup.ts";
import { REFERENTIAL } from "../ingredients/referential.ts";
import { categoryOf, gramsOf, isVegetarian, profileDish } from "./dish-profile.ts";

const index = buildIngredientIndex(REFERENTIAL);

function item(name: string, qty: number, over: Partial<MenuIngredient> = {}): MenuIngredient {
  return { name, qty, unit: "g", form: "fresh", category: null, sameDay: false, ...over };
}

function dishOf(...ingredients: MenuIngredient[]): Dish {
  return { name: "Plat", day: "mon", ingredients, phases: [] };
}

describe("categoryOf", () => {
  it("prend la catégorie du référentiel, même si l'IA en donne une autre", () => {
    expect(categoryOf(item("carotte", 1, { category: "fruit" }), index)).toBe("vegetable");
  });
  it("prend celle de l'IA pour un inconnu, et null sans catégorie", () => {
    expect(categoryOf(item("truite", 1, { category: "fish" }), index)).toBe("fish");
    expect(categoryOf(item("truite", 1), index)).toBeNull();
  });
});

describe("gramsOf", () => {
  it("garde les grammes, compte un œuf pour 50 g, ignore le reste", () => {
    expect(gramsOf(item("carotte", 300), "vegetable")).toBe(300);
    expect(gramsOf(item("œuf", 4, { unit: "piece" }), "egg")).toBe(200);
    expect(gramsOf(item("carotte", 3, { unit: "piece" }), "vegetable")).toBeNull();
    expect(gramsOf(item("lait", 250, { unit: "ml" }), "dairy")).toBeNull();
  });
});

describe("profileDish", () => {
  it("compte les œufs en pièces à 50 g chacun", () => {
    const profile = profileDish(dishOf(item("œuf", 4, { unit: "piece" })), index);
    expect(profile.grams.get("egg")).toBe(200);
    expect(profile.mainProtein).toBe("egg");
  });
  it("note un poids inconnu pour une quantité en ml", () => {
    const profile = profileDish(dishOf(item("bœuf à braiser", 500, { unit: "ml" })), index);
    expect([...profile.unknownWeight]).toEqual(["red-meat"]);
    expect(profile.grams.has("red-meat")).toBe(false);
  });
  it("donne la viande rouge pour un bourguignon avec des lardons", () => {
    const profile = profileDish(
      dishOf(item("bœuf à braiser", 600), item("lardons", 150), item("carotte", 400)),
      index,
    );
    expect(profile.mainProtein).toBe("red-meat");
    expect(profile.categories).toEqual(new Set(["red-meat", "cured-meat", "vegetable"]));
    expect(profile.grams.get("cured-meat")).toBe(150);
  });
  it("donne le porc pour des saucisses aux lentilles", () => {
    const profile = profileDish(
      dishOf(item("saucisse", 500), item("lentilles vertes", 250)),
      index,
    );
    expect(profile.mainProtein).toBe("pork");
  });
  it("additionne le porc et la charcuterie dans une même protéine", () => {
    const profile = profileDish(
      dishOf(item("échine de porc", 300), item("lardons", 200), item("blanc de poulet", 450)),
      index,
    );
    expect(profile.mainProtein).toBe("pork");
  });
  it("départage une égalité par l'ordre de PROTEINS", () => {
    const profile = profileDish(dishOf(item("blanc de poulet", 300), item("saucisse", 300)), index);
    expect(profile.mainProtein).toBe("pork");
  });
  it("garde les ingrédients du soir même", () => {
    const profile = profileDish(dishOf(item("cabillaud", 600, { sameDay: true })), index);
    expect(profile.mainProtein).toBe("fish");
  });
  it("ne donne aucune protéine à un plat de légumes", () => {
    const profile = profileDish(dishOf(item("carotte", 500), item("poireau", 300)), index);
    expect(profile.mainProtein).toBeNull();
  });
  it("ignore un ingrédient inconnu sans catégorie", () => {
    const profile = profileDish(dishOf(item("kumquat", 100)), index);
    expect(profile.categories.size).toBe(0);
  });
});

describe("isVegetarian", () => {
  it("est vrai pour un dal de lentilles et de potiron", () => {
    expect(isVegetarian(dishOf(item("lentilles corail", 250), item("potiron", 600)), index)).toBe(
      true,
    );
  });
  it("est faux avec du poulet", () => {
    expect(isVegetarian(dishOf(item("cuisse de poulet", 600), item("carotte", 500)), index)).toBe(
      false,
    );
  });
  it("est faux avec un bouillon de volaille, condiment du référentiel qui porte un groupe animal", () => {
    expect(
      isVegetarian(dishOf(item("lentilles corail", 250), item("bouillon de volaille", 1)), index),
    ).toBe(false);
  });
  it("est faux avec un inconnu sans catégorie, vrai si l'IA le dit légume", () => {
    expect(isVegetarian(dishOf(item("truffe", 20)), index)).toBe(false);
    expect(isVegetarian(dishOf(item("truffe", 20, { category: "vegetable" })), index)).toBe(true);
  });
  it("est vrai avec des œufs et du fromage", () => {
    expect(
      isVegetarian(
        dishOf(item("œuf", 6, { unit: "piece" }), item("gruyère râpé", 100), item("poireau", 400)),
        index,
      ),
    ).toBe(true);
  });
});
