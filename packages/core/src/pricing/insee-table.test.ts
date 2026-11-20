import { describe, expect, it } from "vitest";
import { buildIngredientIndex } from "../ingredients/index-lookup.ts";
import { REFERENTIAL } from "../ingredients/referential.ts";
import { inseeLookup } from "./insee.ts";
import { INSEE_MAP } from "./insee-map.ts";
import { INSEE_TABLE } from "./insee-table.ts";

const index = buildIngredientIndex(REFERENTIAL);

// Exceptions à la forme par défaut : le pain s'achète frais, et l'IA écrit `fresh` comme `dry` (référentiel : `dry`).
const OTHER_FORMS = new Set(["fresh|pain"]);

function checkKey(key: string): void {
  const [form, name] = key.split("|");
  const ref = index.find(name ?? "");
  expect(ref?.name, `« ${key} » nomme une entrée du référentiel`).toBe(name);
  if (!OTHER_FORMS.has(key)) {
    expect(ref?.defaultForm, `« ${key} » est en forme par défaut`).toBe(form);
  }
  expect(ref?.pantry, `« ${key} » n'est pas du placard`).toBe(false);
}

describe("INSEE_MAP", () => {
  it("ne nomme que des entrées du référentiel, en forme par défaut, hors placard", () => {
    for (const { key } of INSEE_MAP) checkKey(key);
  });
  it("n'a ni série ni clé en double, sauf le pain sous ses deux formes", () => {
    const series = INSEE_MAP.map((entry) => entry.series);
    expect(series.filter((code, i) => series.indexOf(code) !== i)).toEqual(["1223"]);
    expect(new Set(INSEE_MAP.map((entry) => entry.key)).size).toBe(INSEE_MAP.length);
  });
  it("ne relie aucune série approximative (veau, filet mignon, jambon blanc, crevette)", () => {
    const keys = INSEE_MAP.map((entry) => entry.key);
    for (const name of ["veau", "filet mignon de porc", "jambon blanc", "crevette"]) {
      expect(keys.some((key) => key.endsWith(`|${name}`))).toBe(false);
    }
  });
});

describe("INSEE_TABLE", () => {
  it("a une entrée par ligne de la carte, avec la bonne série et la bonne unité", () => {
    expect(Object.keys(INSEE_TABLE).sort()).toEqual(INSEE_MAP.map((entry) => entry.key).sort());
    for (const { series, key, unit } of INSEE_MAP) {
      expect(INSEE_TABLE[key]).toMatchObject({ series, unit });
    }
  });
  it("a des prix, des mois et des unités lisibles", () => {
    for (const [key, row] of Object.entries(INSEE_TABLE)) {
      checkKey(key);
      expect(row.euros).toBeGreaterThan(0);
      expect(row.month).toMatch(/^\d{4}-(0[1-9]|1[0-2])$/);
      expect(["kg", "l", "piece"]).toContain(row.unit);
    }
  });
});

describe("le pain sous ses deux formes", () => {
  it("a le même prix en fresh et en dry", () => {
    const lookup = inseeLookup(INSEE_TABLE);
    const fresh = lookup.find("fresh|pain", "kg");
    expect(fresh).not.toBeNull();
    expect(fresh).toEqual(lookup.find("dry|pain", "kg"));
  });
});
