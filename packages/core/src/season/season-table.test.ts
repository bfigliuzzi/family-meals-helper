import { describe, expect, it } from "vitest";
import { REFERENTIAL } from "../ingredients/referential.ts";
import { MANGERBOUGER_ROWS } from "./manual-months.ts";
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

  it("couvre le maïs et le céleri-rave", () => {
    expect([...SEASON_TABLE["maïs"]!.months]).toEqual([7, 8, 9]);
    expect([...SEASON_TABLE["céleri-rave"]!.months]).toEqual([1, 2, 3, 10, 11, 12]);
  });

  it("contient tous les mois des lignes mangerbouger (garde-fou contre une régénération qui les perdrait)", () => {
    for (const [name, row] of Object.entries(MANGERBOUGER_ROWS)) {
      const months = SEASON_TABLE[name]?.months ?? [];
      for (const month of row.months) expect(months, `${name} ${month}`).toContain(month);
      expect(SEASON_TABLE[name]!.source, name).toContain("mangerbouger.fr");
    }
  });

  it("donne l'union ADEME et mangerbouger : carotte toute l'année, endive en mai", () => {
    expect([...SEASON_TABLE["carotte"]!.months]).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(SEASON_TABLE["endive"]!.months).toContain(5);
    expect(SEASON_TABLE["endive"]!.months).toContain(11);
    expect(SEASON_TABLE["endive"]!.source).toMatch(/^ademe \+ https:\/\/www\.mangerbouger\.fr\//);
  });
});
