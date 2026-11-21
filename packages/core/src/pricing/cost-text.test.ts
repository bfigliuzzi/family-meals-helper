import { describe, expect, it } from "vitest";
import type { LineCost, MenuCost } from "./cost.ts";
import {
  budgetPromptLine,
  euroCents,
  euroText,
  lineCostText,
  MENU_COST_HINT,
  sheetCostText,
  sheetPricesNotice,
  sourceText,
  sourcesNotice,
  totalText,
  unitPriceText,
} from "./cost-text.ts";

function costOf(over: Partial<MenuCost>): MenuCost {
  return { lines: [], total: 0, unknown: 0, sources: [], ...over };
}

describe("euroText et unitPriceText", () => {
  it("écrit deux décimales, une virgule et l'espace avant €", () => {
    expect(euroText(1.308)).toBe("1,31 €");
    expect(euroText(41.2)).toBe("41,20 €");
    expect(euroText(0)).toBe("0,00 €");
    expect(euroText(1234.5)).toBe("1234,50 €");
  });
  it("arrondit au centime comme la comparaison au budget (0,985 → 0,99, pas 0,98)", () => {
    expect(euroText(0.985)).toBe("0,99 €");
    expect(euroText(4.095)).toBe("4,10 €");
    // 1.005 vaut 1,00499… en binaire, donc `Math.round(1.005 * 100)` donne 100 : l'écran et le budget arrondissent pareil.
    expect(euroText(1.005)).toBe("1,00 €");
    expect(euroCents(0.985)).toBe(99);
  });
  it("écrit le prix d'une unité", () => {
    expect(unitPriceText("kg", 2.14)).toBe("2,14 €/kg");
    expect(unitPriceText("l", 1.05)).toBe("1,05 €/L");
    expect(unitPriceText("piece", 0.59)).toBe("0,59 €/pièce");
  });
});

describe("sourceText", () => {
  it("écrit chaque source", () => {
    expect(sourceText({ kind: "manual", date: "2026-11-20" })).toBe("votre prix du 20/11/2026");
    expect(
      sourceText({ kind: "open-prices", count: 38, first: "2026-05-22", last: "2026-11-18" }),
    ).toBe("Open Prices, médiane de 38 relevés (22/05/2026 au 18/11/2026)");
  });
  it("élide devant avril, août et octobre, pas devant mai", () => {
    expect(sourceText({ kind: "insee", month: "2026-10" })).toBe(
      "INSEE, moyenne nationale d'octobre 2026",
    );
    expect(sourceText({ kind: "insee", month: "2026-04" })).toContain("d'avril");
    expect(sourceText({ kind: "insee", month: "2026-08" })).toContain("d'août");
    expect(sourceText({ kind: "insee", month: "2026-05" })).toBe(
      "INSEE, moyenne nationale de mai 2026",
    );
  });
});

describe("lineCostText", () => {
  const manual = { kind: "manual", date: "2026-11-20" } as const;
  const known = (parts: LineCost["parts"], euros: number): LineCost => ({
    key: "fresh|x",
    parts,
    euros,
    otherUnits: [],
  });
  it("une unité", () => {
    expect(
      lineCostText(
        known(
          [
            {
              unit: "g",
              qty: 600,
              price: { unit: "kg", euros: 2.14, source: { kind: "insee", month: "2026-10" } },
              euros: 1.284,
            },
          ],
          1.284,
        ),
      ),
    ).toBe("≈ 1,28 € · 2,14 €/kg · INSEE, moyenne nationale d'octobre 2026");
  });
  it("plusieurs unités, jointes par +", () => {
    expect(
      lineCostText(
        known(
          [
            {
              unit: "g",
              qty: 1000,
              price: { unit: "kg", euros: 2.14, source: { kind: "insee", month: "2026-10" } },
              euros: 2.14,
            },
            {
              unit: "piece",
              qty: 1,
              price: { unit: "piece", euros: 0.59, source: manual },
              euros: 0.59,
            },
          ],
          2.73,
        ),
      ),
    ).toBe(
      "≈ 2,73 € · 2,14 €/kg (INSEE, moyenne nationale d'octobre 2026) + 0,59 €/pièce (votre prix du 20/11/2026)",
    );
  });
  it("inconnue, avec ou sans prix dans une autre unité", () => {
    const unknown: LineCost = { key: "fresh|x", parts: [], euros: null, otherUnits: [] };
    expect(lineCostText(unknown)).toBe("prix inconnu");
    expect(lineCostText({ ...unknown, otherUnits: ["kg"] })).toBe(
      "prix inconnu (prix connu seulement en €/kg)",
    );
    expect(lineCostText({ ...unknown, otherUnits: ["kg", "l"] })).toBe(
      "prix inconnu (prix connu seulement en €/kg, €/L)",
    );
  });
});

describe("totalText", () => {
  const lines = (count: number): LineCost[] =>
    Array.from({ length: count }, () => ({ key: "k", parts: [], euros: null, otherUnits: [] }));
  it("sans inconnu", () => {
    expect(totalText(costOf({ lines: lines(2), total: 41.2 }))).toBe("Coût estimé : 41,20 €");
  });
  it("avec des inconnus, au singulier et au pluriel", () => {
    expect(totalText(costOf({ lines: lines(6), total: 41.2, unknown: 3 }))).toBe(
      "Coût estimé : au moins 41,20 € · 3 prix inconnus",
    );
    expect(totalText(costOf({ lines: lines(6), total: 41.2, unknown: 1 }))).toBe(
      "Coût estimé : au moins 41,20 € · 1 prix inconnu",
    );
  });
  it("aucune ligne connue", () => {
    expect(totalText(costOf({ lines: lines(5), unknown: 5 }))).toBe(
      "Coût estimé : inconnu (5 prix inconnus)",
    );
  });
});

describe("sourcesNotice et budgetPromptLine", () => {
  it("cite seulement les sources employées, dans l'ordre", () => {
    expect(sourcesNotice(costOf({ sources: [] }))).toBe("");
    expect(sourcesNotice(costOf({ sources: ["insee"] }))).toBe(
      "Sources : INSEE, prix moyens de vente au détail, Licence Ouverte 2.0.",
    );
    expect(sourcesNotice(costOf({ sources: ["manual", "open-prices", "insee"] }))).toBe(
      "Sources : votre table de prix · Open Prices (Open Food Facts), licence ODbL · INSEE, prix moyens de vente au détail, Licence Ouverte 2.0.",
    );
  });
  it("écrit la ligne du prompt", () => {
    expect(budgetPromptLine(60)).toBe(
      "Budget maximum : 60,00 € pour toute la liste de courses (placard non compris). Reste en dessous en choisissant des produits bon marché.",
    );
    expect(budgetPromptLine(45.5)).toContain("45,50 €");
  });
});

describe("sheetCostText", () => {
  const lines = (count: number): LineCost[] =>
    Array.from({ length: count }, (_, at) => ({
      key: `fresh|x${String(at)}`,
      parts: [],
      euros: null,
      otherUnits: [],
    }));
  it("sans prix inconnu : le total et « placard non compris »", () => {
    expect(sheetCostText(costOf({ lines: lines(4), total: 41.2 }))).toBe(
      " : 41,20 € (placard non compris)",
    );
  });
  it("avec des prix inconnus : « au moins », le compte (singulier ou pluriel)", () => {
    expect(sheetCostText(costOf({ lines: lines(8), total: 41.2, unknown: 3 }))).toBe(
      " : au moins 41,20 € (3 prix inconnus, placard non compris)",
    );
    expect(sheetCostText(costOf({ lines: lines(8), total: 41.2, unknown: 1 }))).toBe(
      " : au moins 41,20 € (1 prix inconnu, placard non compris)",
    );
  });
  it("aucune ligne connue : « inconnu »", () => {
    expect(sheetCostText(costOf({ lines: lines(5), unknown: 5 }))).toBe(
      " : inconnu (placard non compris)",
    );
  });
});

describe("sheetPricesNotice", () => {
  it("donne la date puis les sources employées, dans l'ordre", () => {
    expect(
      sheetPricesNotice(costOf({ sources: ["manual", "open-prices", "insee"] }), "2026-11-20"),
    ).toBe(
      "Prix du 20/11/2026. Sources : votre table de prix · Open Prices (Open Food Facts), licence ODbL · INSEE, prix moyens de vente au détail, Licence Ouverte 2.0.",
    );
    expect(sheetPricesNotice(costOf({ sources: ["insee"] }), "2026-11-20")).toBe(
      "Prix du 20/11/2026. Sources : INSEE, prix moyens de vente au détail, Licence Ouverte 2.0.",
    );
  });
  it("sans source employée : la date seule", () => {
    expect(sheetPricesNotice(costOf({}), "2026-01-05")).toBe("Prix du 05/01/2026.");
  });
});

describe("MENU_COST_HINT", () => {
  it("renvoie au détail de l'écran Ingrédients", () => {
    expect(MENU_COST_HINT).toBe(
      "Placard non compris. Le détail des prix par ligne est dans Ingrédients, après validation.",
    );
  });
});
