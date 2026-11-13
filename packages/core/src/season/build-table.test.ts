import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { REFERENTIAL } from "../ingredients/referential.ts";
import type { Month } from "./months.ts";
import { buildSeasonTable, parseAdemeResponse, renderSeasonTableModule } from "./build-table.ts";

const sample: unknown = JSON.parse(
  readFileSync(new URL("./fixtures/ademe-sample.json", import.meta.url), "utf8"),
);
const products = parseAdemeResponse(sample);
const aliases = {
  "chou rouge": "chou",
  "céleri-rave": "celeri",
  butternut: "courge",
  "haricot vert": "haricotvert",
};
const potimarronUrl = "https://example.org/potimarron";
const manual = { potimarron: { months: [12, 10, 11, 10] as Month[], source: potimarronUrl } };

describe("parseAdemeResponse", () => {
  it("lit la fixture", () => {
    expect(products.map((product) => product.slug)).toContain("courgette");
    expect(products).toHaveLength(9);
  });
  it("refuse une réponse sans data", () => {
    expect(() => parseAdemeResponse({ warning: "x" })).toThrow(/data/);
  });
  it("refuse un produit sans months, et le nomme", () => {
    expect(() => parseAdemeResponse({ data: [{ name: "Courgette", slug: "courgette" }] })).toThrow(
      /Courgette/,
    );
  });
  it("refuse un mois 13", () => {
    expect(() =>
      parseAdemeResponse({ data: [{ name: "Chou", slug: "chou", months: [1, 13] }] }),
    ).toThrow(/Chou/);
  });
});

describe("buildSeasonTable", () => {
  const { table, gaps } = buildSeasonTable({ products, refs: REFERENTIAL, aliases, manual });

  it("donne les mois de l'ADEME par nom", () => {
    expect(table["courgette"]).toEqual({ months: [5, 6, 7, 8, 9, 10], source: "ademe" });
    expect(table["chou de Bruxelles"]?.months).toEqual([1, 2, 3, 10, 11, 12]);
  });
  it("applique les alias", () => {
    expect(table["chou rouge"]?.months).toEqual([1, 2, 3, 10, 11, 12]);
    expect(table["céleri-rave"]?.months).toEqual([1, 2, 3, 10, 11, 12]);
    expect(table["butternut"]?.months).toEqual([1, 9, 10, 11, 12]);
  });
  it("reprend la ligne manuelle avec son URL, mois triés et sans doublon", () => {
    expect(table["potimarron"]).toEqual({ months: [10, 11, 12], source: potimarronUrl });
  });
  it("laisse une ligne manuelle l'emporter sur l'ADEME", () => {
    const override = { courgette: { months: [3, 4] as Month[], source: "https://example.org/c" } };
    const result = buildSeasonTable({ products, refs: REFERENTIAL, aliases, manual: override });
    expect(result.table["courgette"]).toEqual({ months: [3, 4], source: "https://example.org/c" });
  });
  it("couvre aussi les entrées dont la forme par défaut n'est pas fraîche", () => {
    const maize = { name: "Maïs", slug: "mais", months: [7, 8, 9] };
    const result = buildSeasonTable({
      products: [...products, maize],
      refs: REFERENTIAL,
      aliases,
      manual,
    });
    expect(result.table["maïs"]?.months).toEqual([7, 8, 9]);
    expect(result.gaps).toContain("tomate concassée");
  });
  it("liste une lacune", () => {
    expect(gaps).toContain("patate douce");
    expect(gaps).toContain("champignon de Paris");
    expect(table["patate douce"]).toBeUndefined();
  });
  it("refuse un alias vers un slug absent", () => {
    expect(() =>
      buildSeasonTable({ products, refs: REFERENTIAL, aliases: { navet: "absent" }, manual }),
    ).toThrow(/absent/);
  });
  it("refuse un alias ou une ligne manuelle hors référentiel", () => {
    expect(() =>
      buildSeasonTable({ products, refs: REFERENTIAL, aliases: { inconnu: "chou" }, manual }),
    ).toThrow(/référentiel/);
    expect(() =>
      buildSeasonTable({
        products,
        refs: REFERENTIAL,
        aliases,
        manual: { inconnu: { months: [1], source: "x" } },
      }),
    ).toThrow(/référentiel/);
  });
});

describe("renderSeasonTableModule", () => {
  it("rend un module trié, sans date, identique d'une fois sur l'autre", () => {
    const table = {
      tomate: { months: [6, 7] as Month[], source: "ademe" },
      ail: { months: [7] as Month[], source: "ademe" },
    };
    const text = renderSeasonTableModule(table);
    expect(text).toBe(renderSeasonTableModule(table));
    expect(text.indexOf('"ail"')).toBeLessThan(text.indexOf('"tomate"'));
    expect(text).toContain("ne pas modifier à la main");
    expect(text).not.toMatch(/20\d\d/);
  });
});
