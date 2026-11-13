import { describe, expect, it } from "vitest";
import type { Menu, MenuIngredient } from "../domain/menu.ts";
import { buildIngredientIndex } from "../ingredients/index-lookup.ts";
import { REFERENTIAL } from "../ingredients/referential.ts";
import { SEASON_TABLE } from "../season/season-table.ts";
import { checkQuantities } from "./check-quantities.ts";
import type { CheckContext } from "./context.ts";
import { balancedMenu } from "./fixtures/menus.ts";

const ctx: CheckContext = {
  request: "un plat",
  exclusions: [],
  month: 11,
  sessionDay: "sun",
  dinners: 1,
  index: buildIngredientIndex(REFERENTIAL),
  seasonTable: SEASON_TABLE,
};

function item(name: string, qty: number, over: Partial<MenuIngredient> = {}): MenuIngredient {
  return { name, qty, unit: "g", form: "fresh", category: null, sameDay: false, ...over };
}

function oneDish(...ingredients: MenuIngredient[]): Menu {
  return { dishes: [{ name: "Plat", day: "mon", ingredients }] };
}

describe("checkQuantities", () => {
  it("ne dit rien de balancedMenu", () => {
    expect(checkQuantities(balancedMenu(), ctx)).toEqual([]);
  });
  it("avertit pour 1 200 g de bœuf dans un plat, avec le détail chiffré", () => {
    const findings = checkQuantities(oneDish(item("bœuf à braiser", 1200)), ctx);
    expect(findings).toEqual([
      {
        level: "warning",
        rule: "quantity",
        dish: 0,
        ingredient: null,
        message: "viande : 1 200 g pour 4 portions, soit 300 g par adulte ; attendu 100 à 200 g.",
      },
    ]);
  });
  it("ne dit rien d'un hachis aux pois chiches en conserve (800 g), au thon en conserve (300 g) et aux carottes (300 g)", () => {
    const menu = oneDish(
      item("pois chiche", 800, { form: "canned" }),
      item("thon", 300, { form: "canned" }),
      item("carotte", 300),
    );
    expect(checkQuantities(menu, ctx)).toEqual([]);
  });
  it("avertit toujours pour 1 200 g de bœuf", () => {
    expect(checkQuantities(oneDish(item("bœuf à braiser", 1200)), ctx)).toHaveLength(1);
  });
  it("garde les bornes élargies : légumes secs 250 g, poisson 60 g, légumes 50 g par adulte", () => {
    expect(checkQuantities(oneDish(item("pois chiche", 1000, { form: "canned" })), ctx)).toEqual(
      [],
    );
    expect(
      checkQuantities(oneDish(item("pois chiche", 1200, { form: "canned" })), ctx),
    ).toHaveLength(1);
    expect(checkQuantities(oneDish(item("thon", 240, { form: "canned" })), ctx)).toEqual([]);
    expect(checkQuantities(oneDish(item("thon", 200, { form: "canned" })), ctx)).toHaveLength(1);
    expect(checkQuantities(oneDish(item("carotte", 200)), ctx)).toEqual([]);
    expect(checkQuantities(oneDish(item("carotte", 160)), ctx)).toHaveLength(1);
  });
  it("avertit aussi sous la fourchette", () => {
    expect(checkQuantities(oneDish(item("bœuf à braiser", 200)), ctx)).toHaveLength(1);
  });
  it("accepte 600 g de bœuf et les bornes exactes", () => {
    expect(checkQuantities(oneDish(item("bœuf à braiser", 600)), ctx)).toEqual([]);
    expect(checkQuantities(oneDish(item("bœuf à braiser", 400)), ctx)).toEqual([]);
    expect(checkQuantities(oneDish(item("bœuf à braiser", 800)), ctx)).toEqual([]);
  });
  it("ne contrôle pas les légumes d'un plat dont un légume est en pièces", () => {
    const menu = oneDish(
      item("courgette", 4, { unit: "piece" }),
      item("carotte", 5000),
      item("bœuf à braiser", 600),
    );
    expect(checkQuantities(menu, ctx)).toEqual([]);
  });
  it("additionne les ingrédients d'un groupe, soir même compris", () => {
    const menu = oneDish(item("carotte", 300), item("poireau", 300, { sameDay: true }));
    expect(checkQuantities(menu, ctx)).toEqual([]);
    expect(checkQuantities(oneDish(item("carotte", 80), item("poireau", 80)), ctx)).toHaveLength(1);
  });
  it("exclut les ingrédients de placard", () => {
    // la farine est un placard : elle ne compte pas dans les féculents
    expect(checkQuantities(oneDish(item("farine", 5000), item("carotte", 400)), ctx)).toEqual([]);
  });
  it("contrôle un inconnu d'après la catégorie reçue", () => {
    const findings = checkQuantities(
      oneDish(item("truite", 1000, { category: "fish", form: "frozen" })),
      ctx,
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toContain("poisson");
  });
});
