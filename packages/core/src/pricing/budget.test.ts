import { describe, expect, it } from "vitest";
import { checkBudget, isValidBudget, parseBudget, readEuroInput } from "./budget.ts";
import { totalText } from "./cost-text.ts";
import type { MenuCost } from "./cost.ts";

function cost(total: number, unknown = 0): MenuCost {
  return { lines: [], total, unknown, sources: ["insee"] };
}

describe("checkBudget", () => {
  it("signale un dépassement, au centime près", () => {
    expect(checkBudget(cost(72.4), 60)).toEqual({
      level: "warning",
      rule: "budget",
      dish: null,
      ingredient: null,
      message: "Coût estimé 72,40 € pour un budget de 60,00 € : 12,40 € de trop.",
    });
  });
  it("dit « au moins » et compte les prix inconnus", () => {
    expect(checkBudget(cost(72.4, 3), 60)?.message).toBe(
      "Coût estimé au moins 72,40 € pour un budget de 60,00 € : 12,40 € de trop (3 prix inconnus, non comptés).",
    );
    expect(checkBudget(cost(72.4, 1), 60)?.message).toBe(
      "Coût estimé au moins 72,40 € pour un budget de 60,00 € : 12,40 € de trop (1 prix inconnu, non compté).",
    );
  });
  it("ne dit rien sous le budget, sans budget, ou à égalité en centimes", () => {
    expect(checkBudget(cost(48.1), 60)).toBeNull();
    expect(checkBudget(cost(72.4), null)).toBeNull();
    expect(checkBudget(cost(59.995), 60)).toBeNull();
    expect(checkBudget(cost(60.004), 60)).toBeNull();
    expect(checkBudget(cost(0.1 + 0.2), 0.3)).toBeNull();
  });
  it("dit 0,01 € de trop à 60,005 € et jamais 0,00 € de trop", () => {
    expect(checkBudget(cost(60.005), 60)?.message).toContain("0,01 € de trop");
    for (const total of [60.005, 60.0051, 60.01, 61, 100.004]) {
      expect(checkBudget(cost(total), 60)?.message ?? "").not.toMatch(/(^|[^\d,])0,00 € de trop/);
    }
  });
  it("dit le même montant que l'écran : 0,985 € contre 0,98 € donne 0,99 € et 0,01 € de trop", () => {
    expect(checkBudget(cost(0.985), 0.98)?.message).toBe(
      "Coût estimé 0,99 € pour un budget de 0,98 € : 0,01 € de trop.",
    );
    expect(totalText(cost(0.985))).toBe("Coût estimé : 0,99 €");
  });
  it("ne dit rien à 0,984 € contre 0,98 €, et l'écran dit 0,98 €", () => {
    expect(checkBudget(cost(0.984), 0.98)).toBeNull();
    expect(totalText(cost(0.984))).toBe("Coût estimé : 0,98 €");
  });
  it("traite un budget invalide (NaN, Infinity) comme l'absence de budget", () => {
    expect(checkBudget(cost(100), Number.NaN)).toBeNull();
    expect(checkBudget(cost(100), Infinity)).toBeNull();
    expect(checkBudget(cost(100), 0.001)).toBeNull();
  });
  it("ne rend jamais un constat sans montant à renvoyer à l'IA : dish et ingredient restent null", () => {
    const finding = checkBudget(cost(100), 60);
    expect(finding?.dish).toBeNull();
    expect(finding?.ingredient).toBeNull();
  });
});

describe("isValidBudget", () => {
  it("accepte de 0,01 à 10000, refuse le reste", () => {
    for (const value of [0.01, 1, 60, 10000]) expect(isValidBudget(value)).toBe(true);
    for (const value of [Number.NaN, Infinity, -Infinity, -1, 0, 0.001, 10000.01]) {
      expect(isValidBudget(value)).toBe(false);
    }
  });
});

describe("parseBudget", () => {
  it("lit un montant avec virgule ou point, ou rien", () => {
    expect(parseBudget("")).toBeNull();
    expect(parseBudget("  ")).toBeNull();
    expect(parseBudget("60")).toBe(60);
    expect(parseBudget("45,50")).toBe(45.5);
    expect(parseBudget("45.5")).toBe(45.5);
    expect(parseBudget("10000")).toBe(10000);
    expect(parseBudget(" 0,01 ")).toBe(0.01);
  });
  it("refuse le reste", () => {
    for (const text of ["0", "0,00", "-3", "10000,01", "abc", "1,234", "100000", "1e3", "4 5"]) {
      expect(parseBudget(text)).toBe("invalid");
    }
  });
});

describe("readEuroInput", () => {
  it("lit un nombre dans les bornes", () => {
    expect(readEuroInput(45.5, 1000)).toBe(45.5);
    expect(readEuroInput(0.01, 1000)).toBe(0.01);
    expect(readEuroInput(1000, 1000)).toBe(1000);
  });
  it("lit un texte en cours de frappe : séparateur final, zéros en tête, virgule ou point", () => {
    expect(readEuroInput("45,", 1000)).toBe(45);
    expect(readEuroInput("45.", 1000)).toBe(45);
    expect(readEuroInput("0045,50", 1000)).toBe(45.5);
    expect(readEuroInput(" 2,5 ", 1000)).toBe(2.5);
  });
  it("rend null pour un champ vide", () => {
    expect(readEuroInput("", 1000)).toBeNull();
    expect(readEuroInput("   ", 1000)).toBeNull();
  });
  it("refuse zéro, au-delà du maximum, un nombre non fini et un texte mal formé", () => {
    expect(readEuroInput(0, 1000)).toBe("invalid");
    expect(readEuroInput(1000.01, 1000)).toBe("invalid");
    expect(readEuroInput(Number.NaN, 1000)).toBe("invalid");
    expect(readEuroInput(Number.POSITIVE_INFINITY, 1000)).toBe("invalid");
    expect(readEuroInput(-3, 1000)).toBe("invalid");
    for (const text of ["0", "0,00", "1500", "1,234", "abc", "-3", "1e3", "4 5", "1234567"]) {
      expect(readEuroInput(text, 1000)).toBe("invalid");
    }
  });
});
