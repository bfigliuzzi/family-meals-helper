import { describe, expect, it } from "vitest";
import { REFERENTIAL } from "../ingredients/referential.ts";
import { SEASON_TABLE } from "./season-table.ts";

const names = new Set(REFERENTIAL.map((ref) => ref.name));

describe("SEASON_TABLE", () => {
  it("a des lignes valides sur des entrées du référentiel", () => {
    for (const [name, row] of Object.entries(SEASON_TABLE)) {
      expect(names.has(name), name).toBe(true);
      expect(row.months.length, name).toBeGreaterThan(0);
      const sorted = [...new Set(row.months)].sort((a, b) => a - b);
      expect([...row.months], name).toEqual(sorted);
      for (const month of row.months) {
        expect(month).toBeGreaterThanOrEqual(1);
        expect(month).toBeLessThanOrEqual(12);
      }
    }
  });

  it("ne laisse sans ligne que les lacunes connues", () => {
    const missing = REFERENTIAL.filter(
      (ref) =>
        (ref.category === "vegetable" || ref.category === "fruit") &&
        SEASON_TABLE[ref.name] === undefined,
    ).map((ref) => ref.name);
    expect(missing.sort()).toEqual([
      "champignon de Paris",
      "céleri branche",
      "patate douce",
      "tomate concassée",
    ]);
  });

  it("donne les valeurs constatées le 2026-11-13", () => {
    expect([...SEASON_TABLE["courgette"]!.months]).toEqual([5, 6, 7, 8, 9, 10]);
    expect([...SEASON_TABLE["tomate"]!.months]).toEqual([6, 7, 8, 9]);
    expect([...SEASON_TABLE["chou de Bruxelles"]!.months]).toEqual([1, 2, 3, 10, 11, 12]);
    expect([...SEASON_TABLE["potimarron"]!.months]).toEqual([10, 11, 12]);
    expect(SEASON_TABLE["potimarron"]!.source).toContain("mangerbouger.fr");
  });

  it("garde la correction manuelle de l'endive et couvre le maïs", () => {
    expect([...SEASON_TABLE["endive"]!.months]).toEqual([1, 2, 3, 4, 10, 11, 12]);
    expect(SEASON_TABLE["endive"]!.source).toContain("mangerbouger.fr");
    expect([...SEASON_TABLE["maïs"]!.months]).toEqual([7, 8, 9]);
    expect([...SEASON_TABLE["céleri-rave"]!.months]).toEqual([1, 2, 3, 10, 11, 12]);
  });
});
