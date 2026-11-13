import { describe, expect, it } from "vitest";
import type { Day, Menu, MenuIngredient } from "../domain/menu.ts";
import { DAYS } from "../domain/menu.ts";
import { buildIngredientIndex } from "../ingredients/index-lookup.ts";
import { REFERENTIAL } from "../ingredients/referential.ts";
import { SEASON_TABLE } from "../season/season-table.ts";
import { checkMenu } from "./check-menu.ts";
import type { CheckContext } from "./context.ts";

const ctx: CheckContext = {
  request: "un plat",
  exclusions: ["poulet"],
  month: 11,
  dinners: 5,
  index: buildIngredientIndex(REFERENTIAL),
  seasonTable: SEASON_TABLE,
};

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
    })),
  };
}

describe("checkMenu", () => {
  it("ne trouve rien à redire à un menu correct", () => {
    expect(checkMenu(menuWith([]), ctx)).toEqual({
      findings: [],
      seasonUnchecked: [],
      toConfirm: [],
    });
  });

  it("concatène forme, exclusion, saison et catégorie manquante", () => {
    const extra: MenuIngredient[] = [
      { ...carrot, name: "blanc de poulet" },
      { ...carrot, name: "courgette" },
      { ...carrot, name: "kumquat", category: null },
    ];
    const rules = checkMenu(menuWith(extra), ctx).findings.map((finding) => finding.rule);
    expect(rules).toEqual(["exclusion", "season", "unknown-category"]);
  });

  it("liste les inconnus catégorisés à confirmer, une fois, et les non vérifiés triés", () => {
    const menu = menuWith([
      { ...carrot, name: "romanesco", category: "vegetable" },
      { ...carrot, name: "romanesco", category: "vegetable" },
      { ...carrot, name: "champignon de Paris" },
      { ...carrot, name: "patate douce" },
    ]);
    const result = checkMenu(menu, ctx);
    expect(result.findings).toEqual([]);
    expect(result.toConfirm).toEqual([{ name: "romanesco", category: "vegetable" }]);
    expect(result.seasonUnchecked).toEqual(["champignon de Paris", "patate douce", "romanesco"]);
  });

  it("ignore la catégorie reçue pour un ingrédient du référentiel", () => {
    const result = checkMenu(menuWith([{ ...carrot, category: "fruit" }]), ctx);
    expect(result.findings).toEqual([]);
    expect(result.toConfirm).toEqual([]);
  });
});
