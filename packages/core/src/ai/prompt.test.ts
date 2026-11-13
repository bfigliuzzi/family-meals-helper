import { describe, expect, it } from "vitest";
import type { Finding } from "../domain/finding.ts";
import type { Menu } from "../domain/menu.ts";
import { REFERENTIAL } from "../ingredients/referential.ts";
import { MONTH_NAMES_FR } from "../season/months.ts";
import { buildSystemPrompt, buildUserPrompt } from "./prompt.ts";

const base = {
  request: "un bœuf bourguignon, 5 dîners",
  exclusions: ["courgette", "poulet"],
  month: 11 as const,
  dinners: 5,
  inSeason: ["potimarron", "poireau"],
};

describe("buildSystemPrompt", () => {
  const system = buildSystemPrompt(REFERENTIAL);
  it("est identique d'un appel à l'autre et sans nom de mois", () => {
    expect(buildSystemPrompt(REFERENTIAL)).toBe(system);
    for (const month of MONTH_NAMES_FR) {
      expect(system.toLowerCase()).not.toMatch(
        new RegExp(`(^|[^\\p{L}])${month}([^\\p{L}]|$)`, "u"),
      );
    }
  });
  it("contient tous les noms du référentiel", () => {
    for (const ref of REFERENTIAL) expect(system).toContain(ref.name);
  });
  it("interdit de citer un ingrédient exclu dans le nom d'un plat", () => {
    expect(system).toContain(
      "Le nom d'un plat ne cite jamais un ingrédient exclu, même précédé de « sans ».",
    );
  });
});

describe("buildUserPrompt", () => {
  it("donne la demande, le mois, les dîners, la saison et les exclusions", () => {
    const user = buildUserPrompt(base);
    expect(user).toContain("un bœuf bourguignon, 5 dîners");
    expect(user).toContain("Nombre de dîners : 5");
    expect(user).toContain("Mois : novembre");
    expect(user).toContain("potimarron, poireau");
    expect(user).toContain("courgette, poulet");
    expect(user).not.toContain("Constats");
  });
  it("écrit « aucun » sans exclusion", () => {
    expect(buildUserPrompt({ ...base, exclusions: [] })).toContain("Ingrédients exclus : aucun");
  });
  it("renvoie le menu précédent et chaque constat dans une correction", () => {
    const menu: Menu = {
      dishes: [{ name: "Gratin", day: "mon", ingredients: [] }],
    };
    const findings: Finding[] = [
      {
        level: "error",
        rule: "season",
        dish: 0,
        ingredient: "tomate",
        message: "tomate n'est pas de saison en novembre (saison : juin à septembre).",
      },
      {
        level: "error",
        rule: "menu-shape",
        dish: null,
        ingredient: null,
        message: "Il manque des plats.",
      },
    ];
    const user = buildUserPrompt({ ...base, previous: { menu, rawText: "", findings } });
    expect(user).toContain(JSON.stringify(menu));
    expect(user).toContain(
      "- [season] plat a « Gratin » : tomate n'est pas de saison en novembre (saison : juin à septembre).",
    );
    expect(user).toContain("- [menu-shape] Il manque des plats.");
  });
  it("cite le texte brut tronqué quand la réponse précédente était illisible", () => {
    const user = buildUserPrompt({
      ...base,
      previous: {
        menu: null,
        rawText: "x".repeat(3000),
        findings: [
          {
            level: "error",
            rule: "invalid-reply",
            dish: null,
            ingredient: null,
            message: "pas du JSON",
          },
        ],
      },
    });
    expect(user).toContain("illisible");
    expect(user).toContain("x".repeat(2000));
    expect(user).not.toContain("x".repeat(2001));
    expect(user).toContain("pas du JSON");
  });
});
