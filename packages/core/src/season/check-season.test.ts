import { describe, expect, it } from "vitest";
import type { Category, Form } from "../domain/ingredient.ts";
import type { Menu } from "../domain/menu.ts";
import { buildIngredientIndex } from "../ingredients/index-lookup.ts";
import { REFERENTIAL } from "../ingredients/referential.ts";
import type { CheckContext } from "../rules/context.ts";
import { checkSeason, inSeasonNames } from "./check-season.ts";
import type { Month } from "./months.ts";
import { SEASON_TABLE } from "./season-table.ts";

const index = buildIngredientIndex(REFERENTIAL);

function ctx(month: Month, request = "un plat"): CheckContext {
  return {
    request,
    exclusions: [],
    month,
    dinners: 1,
    index,
    seasonTable: SEASON_TABLE,
  };
}

function menuOf(name: string, form: Form = "fresh", category: Category | null = null): Menu {
  return {
    dishes: [
      {
        name: "Plat",
        day: "mon",
        ingredients: [{ name, qty: 1, unit: "piece", form, category, sameDay: false }],
      },
    ],
  };
}

describe("checkSeason", () => {
  it("refuse une courgette en novembre", () => {
    const { findings } = checkSeason(menuOf("courgette"), ctx(11));
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ level: "error", rule: "season", dish: 0 });
    expect(findings[0]?.message).toBe(
      "courgette n'est pas de saison en novembre (saison : mai à octobre).",
    );
  });
  it("accepte une courgette en juillet", () => {
    expect(checkSeason(menuOf("courgette"), ctx(7)).findings).toEqual([]);
  });
  it("laisse passer un ingrédient nommé dans la demande", () => {
    expect(checkSeason(menuOf("tomate"), ctx(11, "des pâtes à la tomate")).findings).toEqual([]);
    expect(checkSeason(menuOf("tomate"), ctx(11, "sans tomate")).findings).toHaveLength(1);
  });
  it("ne confond pas pomme et pomme de terre dans la demande", () => {
    expect(checkSeason(menuOf("pomme"), ctx(6, "des pommes de terre")).findings).toHaveLength(1);
  });
  it("ne contrôle pas la tomate concassée ni une tomate en conserve", () => {
    expect(checkSeason(menuOf("tomate concassée"), ctx(11)).findings).toEqual([]);
    expect(checkSeason(menuOf("tomate", "canned"), ctx(11)).findings).toEqual([]);
  });
  it("exempte l'ail, l'oignon, l'échalote et le citron (conception §6.5)", () => {
    expect(checkSeason(menuOf("oignon"), ctx(7)).findings).toEqual([]);
    expect(checkSeason(menuOf("oignon rouge"), ctx(7)).findings).toEqual([]);
    expect(checkSeason(menuOf("citron"), ctx(11)).findings).toEqual([]);
    expect(checkSeason(menuOf("échalote"), ctx(6)).findings).toEqual([]);
    expect(checkSeason(menuOf("ail"), ctx(6)).findings).toEqual([]);
  });
  it("exempte aussi ces produits cités dans un nom inconnu", () => {
    for (const [name, month] of [
      ["gousse d'ail", 6],
      ["jus de citron", 11],
    ] as const) {
      const result = checkSeason(menuOf(name, "fresh", "vegetable"), ctx(month));
      expect(result.findings, name).toEqual([]);
      expect(result.unchecked, name).toEqual([]);
    }
  });
  it("contrôle toujours un autre légume cité à côté d'un produit exempté", () => {
    const result = checkSeason(menuOf("oignons et courgettes", "fresh", "vegetable"), ctx(11));
    expect(result.findings).toHaveLength(1);
  });
  it("ne contrôle pas la pomme de terre", () => {
    expect(checkSeason(menuOf("pomme de terre"), ctx(11)).findings).toEqual([]);
  });
  it("liste en non vérifié un produit du référentiel sans ligne", () => {
    const result = checkSeason(menuOf("champignon de Paris"), ctx(11));
    expect(result.findings).toEqual([]);
    expect(result.unchecked).toEqual(["champignon de Paris"]);
  });
  it("liste en non vérifié un inconnu frais de catégorie légume", () => {
    const result = checkSeason(menuOf("romanesco", "fresh", "vegetable"), ctx(11));
    expect(result.findings).toEqual([]);
    expect(result.unchecked).toEqual(["romanesco"]);
  });
  it("contrôle un inconnu qui contient un fruit ou légume du référentiel", () => {
    for (const name of ["courgettes vertes", "tomate fraîche", "haricots verts frais"]) {
      const result = checkSeason(menuOf(name, "fresh", "vegetable"), ctx(11));
      expect(result.findings, name).toHaveLength(1);
      expect(result.findings[0]?.message, name).toContain(
        `${name} n'est pas de saison en novembre`,
      );
    }
    expect(
      checkSeason(menuOf("courgettes vertes", "fresh", "vegetable"), ctx(11)).findings[0]?.message,
    ).toBe("courgettes vertes n'est pas de saison en novembre (saison : mai à octobre).");
  });
  it("contrôle la courgette dans « courgette spaghetti »", () => {
    const result = checkSeason(menuOf("courgette spaghetti", "fresh", "vegetable"), ctx(11));
    expect(result.findings).toHaveLength(1);
  });
  it("liste en non vérifié un inconnu frais sans fruit ni légume reconnu dans son nom", () => {
    const result = checkSeason(menuOf("romanesco au beurre", "fresh", "vegetable"), ctx(11));
    expect(result.findings).toEqual([]);
    expect(result.unchecked).toEqual(["romanesco au beurre"]);
  });
  it("ne contrôle pas « salade de pommes de terre »", () => {
    const result = checkSeason(menuOf("salade de pommes de terre", "fresh", "vegetable"), ctx(11));
    expect(result.findings).toEqual([]);
  });
  it("laisse passer un inconnu nommé dans la demande", () => {
    const request = "des courgettes vertes";
    expect(
      checkSeason(menuOf("courgettes vertes", "fresh", "vegetable"), ctx(11, request)).findings,
    ).toEqual([]);
  });
  it("contrôle la forme reçue, pas la forme par défaut : maïs frais", () => {
    expect(checkSeason(menuOf("maïs", "fresh"), ctx(11)).findings).toHaveLength(1);
    expect(checkSeason(menuOf("maïs", "canned"), ctx(11)).findings).toEqual([]);
    expect(checkSeason(menuOf("maïs", "fresh"), ctx(8)).findings).toEqual([]);
  });
  it("applique le contrôle à un accompagnement du soir même", () => {
    const menu = menuOf("courgette");
    menu.dishes[0]!.ingredients[0]!.sameDay = true;
    expect(checkSeason(menu, ctx(11)).findings).toHaveLength(1);
  });
  it("ne prend pas pour demandés les légumes cités en parenthèse après une négation", () => {
    const menu = menuOf("tomate");
    menu.dishes[0]!.ingredients.push({ ...menu.dishes[0]!.ingredients[0]!, name: "courgette" });
    const request = "pas de légumes d'été (tomates, courgettes, aubergines)";
    expect(checkSeason(menu, ctx(11, request)).findings).toHaveLength(2);
  });
});

describe("inSeasonNames", () => {
  it("liste les fruits et légumes frais de saison, triés", () => {
    const names = inSeasonNames(11, REFERENTIAL, SEASON_TABLE);
    expect(names).toContain("potimarron");
    expect(names).not.toContain("courgette");
    expect(names).toEqual([...names].sort());
  });
  it("liste toute l'année les produits exemptés du contrôle", () => {
    for (const month of [1, 6, 7, 11] as const) {
      const names = inSeasonNames(month, REFERENTIAL, SEASON_TABLE);
      for (const name of ["ail", "oignon", "échalote", "citron"]) {
        expect(names, `${name} en ${month}`).toContain(name);
      }
    }
  });
});
