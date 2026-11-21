import { describe, expect, it } from "vitest";
import { isRealDate } from "../history/history.ts";
import { addDays, monthsBefore } from "./dates.ts";

describe("monthsBefore", () => {
  it("recule du même jour du mois", () => {
    expect(monthsBefore("2026-11-20", 6)).toBe("2026-05-20");
    expect(monthsBefore("2026-01-15", 1)).toBe("2025-12-15");
    expect(monthsBefore("2026-03-10", 15)).toBe("2024-12-10");
  });
  it("ramène au dernier jour du mois quand le jour n'existe pas", () => {
    expect(monthsBefore("2026-08-31", 6)).toBe("2026-02-28");
    expect(monthsBefore("2024-08-31", 6)).toBe("2024-02-29");
  });
  it("garde l'écriture à quatre chiffres de l'année", () => {
    expect(monthsBefore("0050-03-31", 1)).toBe("0050-02-28");
  });
  it("refuse une date fausse", () => {
    expect(() => monthsBefore("2026-02-30", 1)).toThrow("Date illisible");
  });
});

describe("addDays", () => {
  it("passe les fins de mois et d'année", () => {
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDays("2024-03-01", -1)).toBe("2024-02-29");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-11-20", -7)).toBe("2026-11-13");
    expect(addDays("2026-11-20", 0)).toBe("2026-11-20");
  });
  it("refuse une date fausse", () => {
    expect(() => addDays("20-11-2026", 1)).toThrow("Date illisible");
  });
});

describe("isRealDate (comportement gardé pour les années 0000 à 0099)", () => {
  it("lit 0050 comme l'an 50, pas 1950", () => {
    expect(isRealDate("0050-02-29")).toBe(false);
    expect(isRealDate("0048-02-29")).toBe(true);
  });
});
