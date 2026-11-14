import { describe, expect, it } from "vitest";
import type { Menu, MenuIngredient } from "../domain/menu.ts";
import { buildIngredientIndex } from "../ingredients/index-lookup.ts";
import { REFERENTIAL } from "../ingredients/referential.ts";
import { autumnMenu } from "../rules/fixtures/menus.ts";
import { parseStepText, plainStepText, referencesOf, renderStepText } from "./step-text.ts";
import type { TextRun } from "./step-text.ts";

const index = buildIngredientIndex(REFERENTIAL);
const menu = autumnMenu();

function item(name: string, qty: number, over: Partial<MenuIngredient> = {}): MenuIngredient {
  return { name, qty, unit: "g", form: "fresh", category: null, sameDay: false, ...over };
}

function menuOf(...dishes: MenuIngredient[][]): Menu {
  return {
    dishes: dishes.map((ingredients, i) => ({
      name: `Plat ${i}`,
      day: (["mon", "tue", "wed", "thu", "fri"] as const)[i]!,
      ingredients,
      phases: [],
    })),
  };
}

const render = (text: string, on: Menu = menu): TextRun[] => renderStepText(text, on, index);
const plain = (runs: readonly TextRun[]): string => runs.map((run) => run.text).join("");
const bold = (runs: readonly TextRun[]): string[] =>
  runs.filter((run) => run.bold).map((run) => run.text);

describe("parseStepText", () => {
  it("lit les repères simples et les tas, sans doublon", () => {
    const parsed = parseStepText("Couper {d.1/d.1/e.1}, ajouter {d.2} puis {d.2}");
    expect(referencesOf(parsed)).toEqual(["d.1", "e.1", "d.2"]);
    expect(parsed.malformed).toEqual([]);
  });
  it.each(["{a.x}", "{A.1}", "{a.1 / b.2}", "{a.01}", "une accolade seule }", "{a.1"])(
    "signale un repère mal formé : %s",
    (text) => {
      expect(parseStepText(`Couper ${text}`).malformed).toHaveLength(1);
    },
  );
  it("lit {a.\u200b1} comme {a.1} : caractères invisibles retirés avant tout", () => {
    const parsed = parseStepText("Couper {a.\u200b1}");
    expect(referencesOf(parsed)).toEqual(["a.1"]);
    expect(parsed.malformed).toEqual([]);
    expect(plain(render("Couper {a.\u200b1}"))).toBe("Couper 600 g de poireau");
  });
  it("applique le gras par paires de ** non vides, sinon laisse le texte tel quel", () => {
    expect(bold(render("**Garder l'eau** : elle sert au plat c"))).toEqual(["Garder l'eau"]);
    for (const text of ["****", "un ** seul", "**a** et **"]) {
      const runs = render(text);
      expect(bold(runs)).toEqual([]);
      expect(plain(runs)).toBe(text);
    }
  });
  it("donne un texte simple non vide pour le contrôle, repères compris", () => {
    expect(plainStepText(parseStepText("**{a.1}**"))).toBe("{a.1}");
    expect(plainStepText(parseStepText("****"))).toBe("****");
    expect(plainStepText(parseStepText("\u200b"))).toBe("");
  });
});

describe("renderStepText", () => {
  it("laisse un texte sans repère inchangé", () => {
    expect(render("Préchauffer le four à 160 °C.")).toEqual([
      { text: "Préchauffer le four à 160 °C.", bold: false },
    ]);
  });
  it("donne la quantité et le nom en gras : g, ml, élision", () => {
    expect(bold(render("Ciseler {b.3}"))).toEqual(["100 g d'oignon"]);
    expect(bold(render("Sauteuse, {b.4}"))).toEqual(["30 ml d'huile d'olive"]);
    expect(plain(render("Fendre {a.1} en deux"))).toBe("Fendre 600 g de poireau en deux");
  });
  it("dit des pièces avec le nom au pluriel", () => {
    const pieces = menuOf([
      item("cuisse de poulet", 2, { unit: "piece" }),
      item("poireau", 3, { unit: "piece" }),
    ]);
    expect(bold(render("Dorer {a.1} et {a.2}", pieces))).toEqual([
      "2 cuisses de poulet",
      "3 poireaux",
    ]);
  });
  it("répartit un tas de même ingrédient : total, puis la part de chaque plat", () => {
    const runs = render("Couper {d.1/e.1} en cubes");
    expect(plain(runs)).toBe("Couper 1000 g de potiron (d : 600 g, e : 400 g) en cubes");
    expect(bold(runs)).toEqual(["1000 g de potiron", "d : 600 g", "e : 400 g"]);
    expect(plain(runs)).not.toContain(">");
  });
  it("dédoublonne un tas : {d.1/d.1/e.1} vaut {d.1/e.1}", () => {
    expect(plain(render("{d.1/d.1/e.1}"))).toBe(plain(render("{d.1/e.1}")));
  });
  it("joint par « + » des ingrédients différents dans un même tas", () => {
    expect(plain(render("{a.1/e.2}"))).toBe("600 g de poireau + 400 g de navet");
  });
  it("additionne deux unités dans un tas", () => {
    const mixed = menuOf([item("oignon", 100)], [item("oignon", 2, { unit: "piece" })]);
    expect(plain(render("{a.1/b.1}", mixed))).toBe(
      "100 g + 2 pièces d'oignon (a : 100 g, b : 2 pièces)",
    );
  });
  it("dit la forme d'un surgelé, ou d'un nom présent en deux formes", () => {
    const forms = menuOf(
      [item("cabillaud", 600, { form: "frozen" }), item("haricot rouge", 100, { form: "dry" })],
      [item("haricot rouge", 400)],
    );
    expect(plain(render("{a.1}, {a.2}, {b.1}", forms))).toBe(
      "600 g de cabillaud (surgelé), 100 g de haricot rouge (sec), 400 g de haricot rouge (frais)",
    );
  });
  it("garde la valeur exacte du menu, sans arrondi d'achat", () => {
    const exact = menuOf([item("cumin", 0.3), item("bouillon de légumes", 250.2, { unit: "ml" })]);
    expect(plain(render("{a.1} et {a.2}", exact))).toBe(
      "0,3 g de cumin et 250,2 ml de bouillon de légumes",
    );
  });
  it("laisse visible un repère qui ne désigne rien", () => {
    expect(plain(render("Couper {z.9}"))).toBe("Couper {z.9}");
  });
  it("passe chaque morceau par `printable` : ni contrôle ni invisible", () => {
    expect(plain(render("Mijoter\u001b[31m {a.1}\u2066"))).toBe("Mijoter [31m 600 g de poireau");
  });
});
