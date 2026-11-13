import { describe, expect, it } from "vitest";
import type { Day, Menu, MenuIngredient } from "../domain/menu.ts";
import { DAYS } from "../domain/menu.ts";
import { buildIngredientIndex } from "../ingredients/index-lookup.ts";
import { REFERENTIAL } from "../ingredients/referential.ts";
import { SEASON_TABLE } from "../season/season-table.ts";
import { checkMenu } from "./check-menu.ts";
import type { CheckContext } from "./context.ts";
import { balancedMenu } from "./fixtures/menus.ts";

const ctx: CheckContext = {
  request: "un plat",
  exclusions: ["poulet"],
  month: 11,
  sessionDay: "sun",
  dinners: 5,
  index: buildIngredientIndex(REFERENTIAL),
  seasonTable: SEASON_TABLE,
};

// Sans exclusion : pour les menus qui partent de `balancedMenu()`.
const cleanCtx: CheckContext = { ...ctx, exclusions: [] };

const carrot: MenuIngredient = {
  name: "carotte",
  qty: 400,
  unit: "g",
  form: "fresh",
  category: null,
  sameDay: false,
};

function menuWith(extra: MenuIngredient[]): Menu {
  return {
    dishes: DAYS.map((day: Day, i) => ({
      name: `Plat ${i}`,
      day,
      ingredients: i === 0 ? [carrot, ...extra] : [carrot],
      phases: [],
    })),
  };
}

// Les contrôles du lot 1 seulement : le menu « carottes seules » déclenche aussi les règles d'équilibre.
const LOT1_RULES = ["menu-shape", "exclusion", "season", "unknown-category"];

// Petites quantités : les ajouts ne doivent pas déclencher le contrôle de quantité.
function balancedWith(extra: MenuIngredient[]): Menu {
  const menu = balancedMenu();
  menu.dishes[0]!.ingredients.push(...extra.map((ingredient) => ({ ...ingredient, qty: 40 })));
  return menu;
}

describe("checkMenu", () => {
  it("ne trouve rien à redire à balancedMenu, dont le plat e est à congeler", () => {
    const result = checkMenu(balancedMenu(), cleanCtx);
    expect(result.findings).toEqual([]);
    expect(result.seasonUnchecked).toEqual([]);
    expect(result.toConfirm).toEqual([]);
    expect(result.keeping).toHaveLength(5);
    expect(result.keeping[4]?.toFreeze).toBe(true);
    expect(result.keeping[0]?.fridgeDays).toBe(4);
    expect(result.session?.minutes).toBe(135);
  });

  it("place le constat d'un plat sans phase après les constats de quantité", () => {
    const menu = balancedMenu();
    menu.dishes[2]!.ingredients[0]!.qty = 1200;
    menu.dishes[4]!.phases = [];
    const result = checkMenu(menu, cleanCtx);
    expect(result.findings.map((finding) => finding.rule)).toEqual(["quantity", "phases"]);
    expect(result.session).toBeNull();
  });

  it("concatène forme, exclusion, saison et catégorie manquante", () => {
    const extra: MenuIngredient[] = [
      { ...carrot, name: "blanc de poulet" },
      { ...carrot, name: "courgette" },
      { ...carrot, name: "kumquat", category: null },
    ];
    const rules = checkMenu(menuWith(extra), ctx)
      .findings.map((finding) => finding.rule)
      .filter((rule) => LOT1_RULES.includes(rule));
    expect(rules).toEqual(["exclusion", "season", "unknown-category"]);
  });

  it("ajoute conservation, équilibre et quantité après les contrôles du lot 1, dans cet ordre", () => {
    const menu = balancedMenu();
    menu.dishes[4]!.ingredients.push({ ...carrot, name: "pomme de terre", qty: 600 });
    menu.dishes[3]!.ingredients = menu.dishes[3]!.ingredients.filter(
      (ingredient) => ingredient.name !== "lentilles corail",
    );
    menu.dishes[2]!.ingredients[0]!.qty = 1200;
    const rules = checkMenu(menu, cleanCtx).findings.map((finding) => finding.rule);
    expect(rules).toEqual(["conservation", "pulses", "quantity"]);
  });

  it("liste les inconnus catégorisés à confirmer, une fois, et les non vérifiés triés", () => {
    const menu = balancedWith([
      { ...carrot, name: "romanesco", category: "vegetable" },
      { ...carrot, name: "romanesco", category: "vegetable" },
      { ...carrot, name: "champignon de Paris" },
      { ...carrot, name: "patate douce" },
    ]);
    const result = checkMenu(menu, cleanCtx);
    expect(result.findings).toEqual([]);
    expect(result.toConfirm).toEqual([{ name: "romanesco", category: "vegetable" }]);
    expect(result.seasonUnchecked).toEqual(["champignon de Paris", "patate douce", "romanesco"]);
  });

  it("ignore la catégorie reçue pour un ingrédient du référentiel", () => {
    const result = checkMenu(balancedWith([{ ...carrot, category: "fruit" }]), cleanCtx);
    expect(result.findings).toEqual([]);
    expect(result.toConfirm).toEqual([]);
  });
});
