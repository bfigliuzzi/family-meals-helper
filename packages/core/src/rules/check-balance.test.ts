import { describe, expect, it } from "vitest";
import type { Finding, RuleId } from "../domain/finding.ts";
import type { Day, Menu, MenuIngredient } from "../domain/menu.ts";
import { DAYS } from "../domain/menu.ts";
import { buildIngredientIndex } from "../ingredients/index-lookup.ts";
import { REFERENTIAL } from "../ingredients/referential.ts";
import { SEASON_TABLE } from "../season/season-table.ts";
import { formatGrams } from "./balance-table.ts";
import { KEEP_REQUESTED_DISH_FR, checkBalance } from "./check-balance.ts";
import type { CheckContext } from "./context.ts";
import { balancedMenu } from "./fixtures/menus.ts";

const index = buildIngredientIndex(REFERENTIAL);

function ctxFor(request = "un plat"): CheckContext {
  return {
    request,
    exclusions: [],
    month: 11,
    sessionDay: "sun",
    dinners: 5,
    index,
    seasonTable: SEASON_TABLE,
  };
}

function item(name: string, qty: number, over: Partial<MenuIngredient> = {}): MenuIngredient {
  return { name, qty, unit: "g", form: "fresh", category: null, sameDay: false, ...over };
}

interface DishSpec {
  name?: string;
  day?: Day;
  ingredients: MenuIngredient[];
}

// Les plats prennent les jours dans l'ordre (lundi, mardi…) sauf indication.
function menuOf(...dishes: DishSpec[]): Menu {
  return {
    dishes: dishes.map((dish, i) => ({
      name: dish.name ?? `Plat ${i + 1}`,
      day: dish.day ?? DAYS[i]!,
      ingredients: dish.ingredients,
    })),
  };
}

function of(menu: Menu, rule: RuleId, ctx: CheckContext = ctxFor()): Finding[] {
  return checkBalance(menu, ctx).filter((finding) => finding.rule === rule);
}

describe("checkBalance sur balancedMenu", () => {
  it("ne trouve rien", () => {
    expect(checkBalance(balancedMenu(), ctxFor())).toEqual([]);
  });
});

describe("vegetables", () => {
  it("avertit pour un plat qui n'a que de l'oignon et de l'ail, un constat par plat", () => {
    const menu = menuOf(
      { ingredients: [item("bœuf à braiser", 600), item("oignon", 100), item("ail", 20)] },
      { ingredients: [item("carotte", 500)] },
    );
    const findings = of(menu, "vegetables");
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ level: "warning", dish: 0 });
  });
  it("compte un légume du soir même et un légume inconnu de catégorie vegetable", () => {
    const menu = menuOf(
      { ingredients: [item("poulet entier", 600), item("carotte", 300, { sameDay: true })] },
      { ingredients: [item("romanesco", 400, { category: "vegetable" })] },
    );
    expect(of(menu, "vegetables")).toEqual([]);
  });
  it("ne compte pas la gousse d'ail inconnue comme légume", () => {
    const menu = menuOf({ ingredients: [item("gousse d'ail", 20, { category: "vegetable" })] });
    expect(of(menu, "vegetables")).toHaveLength(1);
  });
});

describe("pulses et whole-starch", () => {
  const noPulseNoStarch = menuOf({ ingredients: [item("carotte", 500)] });
  it("avertit quand aucun plat n'a de légumes secs ni de féculent complet", () => {
    expect(of(noPulseNoStarch, "pulses")).toHaveLength(1);
    expect(of(noPulseNoStarch, "whole-starch")).toHaveLength(1);
    expect(of(noPulseNoStarch, "pulses")[0]).toMatchObject({ level: "warning", dish: null });
  });
  it("ne dit rien quand un plat en a", () => {
    const menu = menuOf({ ingredients: [item("lentilles vertes", 250), item("riz complet", 300)] });
    expect(of(menu, "pulses")).toEqual([]);
    expect(of(menu, "whole-starch")).toEqual([]);
  });
});

describe("meat", () => {
  it("avertit à 2 400 g de bœuf sur le menu, pas à 2 000 g pile", () => {
    const over = menuOf(
      { ingredients: [item("bœuf à braiser", 1200)] },
      { ingredients: [item("bœuf haché", 1200)] },
    );
    const findings = of(over, "meat");
    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toContain(
      "Viande hors volaille : 2 400 g sur le menu, soit 600 g par adulte ; au plus 500 g par adulte (2 000 g sur le menu).",
    );
    const exact = menuOf(
      { ingredients: [item("bœuf à braiser", 1000)] },
      { ingredients: [item("bœuf haché", 1000)] },
    );
    expect(of(exact, "meat")).toEqual([]);
  });
  it("avertit pour 3 plats de viande rouge ou de porc, pas pour 2", () => {
    const three = menuOf(
      { ingredients: [item("bœuf haché", 300)] },
      { ingredients: [item("échine de porc", 300)] },
      { ingredients: [item("veau", 300)] },
    );
    expect(of(three, "meat")).toHaveLength(1);
    expect(
      of(
        menuOf(...three.dishes.slice(0, 2).map((dish) => ({ ingredients: dish.ingredients }))),
        "meat",
      ),
    ).toEqual([]);
  });
  it("ne compte ni la volaille ni la charcuterie dans la viande hors volaille", () => {
    const menu = menuOf(
      { ingredients: [item("blanc de poulet", 3000)] },
      { ingredients: [item("lardons", 300)] },
    );
    expect(of(menu, "meat")).toEqual([]);
  });
});

describe("cured-meat", () => {
  it("avertit pour des lardons dans un plat et du jambon blanc dans un autre, pas pour un seul", () => {
    const two = menuOf(
      { ingredients: [item("lardons", 100)] },
      { ingredients: [item("jambon blanc", 100)] },
    );
    expect(of(two, "cured-meat")).toHaveLength(1);
    expect(of(menuOf({ ingredients: [item("lardons", 100)] }), "cured-meat")).toEqual([]);
  });
  it("avertit à 700 g de charcuterie, pas à 600 g pile", () => {
    const over = of(menuOf({ ingredients: [item("saucisse", 700)] }), "cured-meat");
    expect(over).toHaveLength(1);
    expect(over[0]?.message).toContain(
      "Charcuterie : 700 g sur le menu, soit 175 g par adulte ; au plus 150 g par adulte (600 g sur le menu).",
    );
    expect(of(menuOf({ ingredients: [item("saucisse", 600)] }), "cured-meat")).toEqual([]);
  });
});

describe("same-protein", () => {
  it("avertit pour du poulet le lundi et le mardi, sur le second soir", () => {
    const menu = menuOf(
      { ingredients: [item("cuisse de poulet", 600)] },
      { ingredients: [item("blanc de poulet", 600)] },
    );
    const findings = of(menu, "same-protein");
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ dish: 1, level: "warning" });
  });
  it("ne dit rien pour du poulet le lundi et le mercredi", () => {
    const menu = menuOf(
      { ingredients: [item("cuisse de poulet", 600)] },
      { day: "wed", ingredients: [item("blanc de poulet", 600)] },
    );
    expect(of(menu, "same-protein")).toEqual([]);
  });
  it("ne dit rien pour du poulet le mardi et le jeudi dans un menu de 4 dîners", () => {
    const menu = menuOf(
      { day: "mon", ingredients: [item("lentilles vertes", 250)] },
      { day: "tue", ingredients: [item("cuisse de poulet", 600)] },
      { day: "thu", ingredients: [item("blanc de poulet", 600)] },
      { day: "fri", ingredients: [item("bœuf haché", 500)] },
    );
    expect(of(menu, "same-protein")).toEqual([]);
  });
  it("lit les jours, pas l'ordre du tableau", () => {
    const menu = menuOf(
      { day: "tue", ingredients: [item("cuisse de poulet", 600)] },
      { day: "mon", ingredients: [item("blanc de poulet", 600)] },
    );
    expect(of(menu, "same-protein")).toHaveLength(1);
  });
});

describe("plafonds et même protéine : consigne de la demande (§5.1)", () => {
  const sentence = "Si la demande nomme un de ces plats, garde-le et ajuste les autres.";
  it("termine chaque message de meat, cured-meat et same-protein par la consigne", () => {
    expect(KEEP_REQUESTED_DISH_FR).toBe(sentence);
    const menu = menuOf(
      { name: "Bœuf bourguignon", ingredients: [item("bœuf à braiser", 1200)] },
      { name: "Daube de bœuf", ingredients: [item("bœuf à braiser", 1200)] },
      { name: "Rôti de porc", ingredients: [item("échine de porc", 300)] },
      { name: "Quiche lorraine", ingredients: [item("lardons", 400)] },
      { name: "Choucroute", ingredients: [item("saucisse", 400)] },
    );
    const findings = checkBalance(menu, ctxFor("un bœuf bourguignon"));
    const capped = findings.filter((finding) =>
      ["meat", "cured-meat", "same-protein"].includes(finding.rule),
    );
    // meat : poids et nombre de plats ; cured-meat : nombre de plats et poids ;
    // same-protein : a-b (bœuf), c-d et d-e (porc, charcuterie comprise)
    expect(capped.map((finding) => finding.rule)).toEqual([
      "meat",
      "meat",
      "cured-meat",
      "cured-meat",
      "same-protein",
      "same-protein",
      "same-protein",
    ]);
    for (const finding of capped) expect(finding.message.endsWith(sentence)).toBe(true);
  });
  it("nomme les plats qui contribuent au plafond, sans constat sur un plat", () => {
    const menu = menuOf(
      { name: "Bœuf bourguignon", ingredients: [item("bœuf à braiser", 1200)] },
      { name: "Poulet rôti", ingredients: [item("poulet entier", 600)] },
      { name: "Hachis parmentier", ingredients: [item("bœuf haché", 1200)] },
    );
    const [finding] = of(menu, "meat", ctxFor("un bœuf bourguignon"));
    expect(finding).toMatchObject({ level: "warning", dish: null });
    expect(finding?.message).toContain(
      "Plats concernés : a « Bœuf bourguignon », c « Hachis parmentier ».",
    );
    expect(finding?.message).not.toContain("Poulet rôti");
  });
  it("porte same-protein sur le second soir, que la demande le nomme ou non", () => {
    const menu = menuOf(
      { name: "Poulet basquaise", ingredients: [item("cuisse de poulet", 600)] },
      { name: "Poulet tandoori", ingredients: [item("poulet entier", 600)] },
    );
    for (const request of ["un poulet tandoori", "un poulet basquaise", "un plat"]) {
      expect(of(menu, "same-protein", ctxFor(request))).toMatchObject([{ dish: 1 }]);
    }
  });
});

describe("formatGrams", () => {
  it("sépare les milliers", () => {
    expect(formatGrams(2400)).toBe("2 400");
    expect(formatGrams(600)).toBe("600");
    expect(formatGrams(237.5)).toBe("238");
  });
});
