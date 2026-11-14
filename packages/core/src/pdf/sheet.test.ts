import { describe, expect, it } from "vitest";
import type { Detail, DetailStep } from "../domain/detail.ts";
import type { Menu, MenuIngredient } from "../domain/menu.ts";
import { HOUSEHOLD_EQUIPMENT } from "../equipment/household.ts";
import { buildIngredientIndex } from "../ingredients/index-lookup.ts";
import { REFERENTIAL } from "../ingredients/referential.ts";
import { checkMenu } from "../rules/check-menu.ts";
import { SAFETY_RULES_FR } from "../rules/conservation-table.ts";
import type { CheckContext } from "../rules/context.ts";
import { autumnDetail } from "../rules/fixtures/detail.ts";
import { autumnMenu } from "../rules/fixtures/menus.ts";
import { checkDetail } from "../scheduling/check-detail.ts";
import { SEASON_TABLE } from "../season/season-table.ts";
import { buildSheetDocument } from "./sheet.ts";
import type { SheetInput } from "./sheet.ts";

const index = buildIngredientIndex(REFERENTIAL);
const ctx: CheckContext = {
  request: "5 dîners",
  exclusions: [],
  month: 11,
  sessionDay: "sun",
  dinners: 5,
  index,
  seasonTable: SEASON_TABLE,
};

function item(name: string, qty: number, over: Partial<MenuIngredient> = {}): MenuIngredient {
  return { name, qty, unit: "g", form: "fresh", category: null, sameDay: false, ...over };
}

function detailInput(menu: Menu, detail: Detail): SheetInput {
  const check = checkDetail(menu, detail, HOUSEHOLD_EQUIPMENT, index, []);
  if (check.plan === null) throw new Error("planning absent : fixture incohérente");
  return {
    sessionDay: "sun",
    menu,
    keeping: checkMenu(menu, ctx).keeping,
    steps: { kind: "detail", detail, plan: check.plan, findings: check.findings },
    index,
  };
}

function phasesInput(menu: Menu): SheetInput {
  const { session, keeping } = checkMenu(menu, ctx);
  if (session === null) throw new Error("planning absent : fixture incohérente");
  return {
    sessionDay: "sun",
    menu,
    keeping,
    steps: {
      kind: "phases",
      plan: session,
      reason: "les étapes restent incohérentes après 3 appels",
    },
    index,
  };
}

// Les textes imprimés de la définition, dans l'ordre du document (ni styles, ni largeurs de colonnes).
const PRINTED_KEYS = ["text", "stack", "columns", "table", "body"];
function allText(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(allText);
  if (value !== null && typeof value === "object") {
    const node = value as Record<string, unknown>;
    return PRINTED_KEYS.flatMap((key) => allText(node[key]));
  }
  return [];
}
const textOf = (input: SheetInput): string => allText(buildSheetDocument(input).content).join("\n");

// Parcours récursif : tous les objets de la définition.
function allNodes(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.flatMap(allNodes);
  if (value !== null && typeof value === "object") {
    const node = value as Record<string, unknown>;
    return [node, ...Object.values(node).flatMap(allNodes)];
  }
  return [];
}

// Les lignes du déroulé : la cellule de texte de chaque étape, mise bout à bout.
function stepRows(input: SheetInput): string[] {
  const rows: string[] = [];
  for (const node of allNodes(buildSheetDocument(input).content)) {
    const table = node["table"] as { body?: unknown[][]; widths?: unknown[] } | undefined;
    if (table?.widths?.length !== 3) continue;
    for (const row of table.body ?? []) rows.push(allText(row[2]).join(""));
  }
  return rows;
}

const menu = autumnMenu();
const detail = autumnDetail();
const full = textOf(detailInput(menu, detail));
const rows = stepRows(detailInput(menu, detail));

describe("buildSheetDocument : en-tête", () => {
  it("donne le titre et un sous-titre gris unique, avec la durée calculée et sans horaire", () => {
    expect(full).toContain("Batch cooking — fiche cuisine");
    expect(full).toContain(
      "Session du dimanche · 5 plats · 20 portions (4 pers.) · environ 2 h 30 (durée calculée) · quantités indiquées au moment où on s'en sert",
    );
    expect(full).not.toMatch(/\d:\d\d–/);
    expect(full.split("environ 2 h 30")).toHaveLength(2);
  });
  it("est une page A4 portrait en Roboto 9 pt, marges de 10 mm, pied de page numéroté", () => {
    const doc = buildSheetDocument(detailInput(menu, detail));
    expect(doc.pageSize).toBe("A4");
    expect(doc.pageOrientation).toBe("portrait");
    expect(doc.pageMargins).toEqual([28, 28, 28, 28]);
    expect(doc.defaultStyle).toMatchObject({ font: "Roboto", fontSize: 9 });
    expect(typeof doc.footer).toBe("function");
  });
  it("met les titres en couleur, comme les fiches cuisine-addict", () => {
    const { styles } = buildSheetDocument(detailInput(menu, detail));
    expect(styles?.["heading"]).toMatchObject({ fontSize: 11, color: "#b4532a" });
    expect(styles?.["phase"]).toMatchObject({ margin: [0, 4, 0, 1] });
  });
});

describe("buildSheetDocument : menu", () => {
  const doc = buildSheetDocument(detailInput(menu, detail));
  const menuTable = allNodes(doc.content).find(
    (node) => (node["table"] as { widths?: unknown[] } | undefined)?.widths?.length === 6,
  );
  it("a 6 colonnes : lettre, plat, jour, cuisson, frigo, congélation", () => {
    expect(allText(menuTable).slice(0, 6)).toEqual([
      "",
      "Plat",
      "Jour",
      "Cuisson",
      "Frigo",
      "Congél.",
    ]);
  });
  it("donne (V), les appareils des étapes du plat, le frigo et « à congeler »", () => {
    const text = allText(menuTable).join("|");
    expect(text).toContain("Dal de lentilles corail au potiron (V)|jeudi|plaque induction|4 j|mal");
    expect(text).toContain("Bœuf braisé aux carottes|mercredi|four + plaque induction|3 j|oui");
    expect(text).toContain("Soupe de potiron et navet (V)|vendredi|Thermomix TM5|4 j|à congeler");
    expect(allNodes(menuTable)).toContainEqual({ text: "à congeler", bold: true });
  });
  it("dit « soir » et « — » pour un plat du soir", () => {
    const evening = autumnMenu();
    evening.dishes[0]!.ingredients = evening.dishes[0]!.ingredients.map((ing) => ({
      ...ing,
      sameDay: true,
    }));
    evening.dishes[0]!.phases = [];
    const eveningDetail: Detail = {
      ...detail,
      steps: detail.steps
        .filter((step) => !step.dishes.includes("a"))
        .map((step) => ({ ...step, after: step.after.filter((id) => id !== "s8") })),
    };
    expect(textOf(detailInput(evening, eveningDetail))).toContain(
      "Cabillaud, fondue de poireaux et riz complet\nlundi\nsoir\n—\n—",
    );
  });
});

describe("buildSheetDocument : ingrédients", () => {
  it("donne une ligne par ingrédient regroupé, avec sa répartition, sans rayon", () => {
    expect(full).toContain("1 kg de potiron (d : 600 g, e : 400 g)");
    expect(full).toContain("1,1 kg de carotte (b : 500 g, c : 600 g)");
    expect(full).toContain("600 g de cabillaud (a) · surgelé · soir");
    for (const label of [
      "fruits et légumes",
      "épicerie",
      "crèmerie",
      "surgelés",
      "viandes et poissons",
    ]) {
      expect(full).not.toContain(label);
    }
  });
  it("sépare la liste en deux colonnes équilibrées, dans l'ordre alphabétique", () => {
    const columns = allNodes(buildSheetDocument(detailInput(menu, detail)).content).find(
      (node) => node["columns"] !== undefined,
    );
    const [left, right] = (columns?.["columns"] as unknown[]).map((column) => allText(column));
    expect(left).toHaveLength(5);
    expect(right).toHaveLength(5);
    expect(left![0]).toBe("600 g de bœuf à braiser (c)");
    expect(right![4]).toBe("300 g de riz complet (a) · soir");
  });
  it("a une ligne Placard et une ligne Appareils", () => {
    expect(full).toContain(
      "Placard\n (vérifie) : 3 g de cumin (d) · 100 ml d'huile d'olive (a, b, c, d)",
    );
    expect(full).toContain("Appareils\n : four · plaque induction · Thermomix TM5");
  });
  it("note l'appareil d'appoint, et un ingrédient à confirmer", () => {
    const withCookeo = autumnDetail();
    withCookeo.steps = withCookeo.steps.map((step) =>
      step.id === "s10" ? { ...step, appliance: "cookeo" } : step,
    );
    const odd = autumnMenu();
    odd.dishes[1]!.ingredients.push(item("pintade", 100, { category: "poultry" }));
    const text = textOf(detailInput(odd, withCookeo));
    expect(text).toContain("Cookeo (appoint)");
    expect(text).toContain("100 g de pintade (b) · à confirmer");
    expect(text).toContain("à confirmer : absent du référentiel");
  });
});

describe("buildSheetDocument : déroulé", () => {
  it("numérote les phases en continu, dans l'ordre du planning", () => {
    const titles = allText(buildSheetDocument(detailInput(menu, detail)).content).filter((text) =>
      /^\d\. /.test(text),
    );
    expect(titles).toEqual([
      "1. Lancer les cuissons longues",
      "2. Poulet et découpes pendant la cuisson",
      "3. Plats en sauce et soupe",
      "4. Finitions et mixages",
    ]);
  });
  it("numérote les étapes en continu, plus l'étape finale de rangement", () => {
    const numbers = allNodes(buildSheetDocument(detailInput(menu, detail)).content)
      .filter((node) => node["alignment"] === "right")
      .map((node) => node["text"]);
    expect(numbers).toEqual(Array.from({ length: 15 }, (_, i) => String(i + 1)));
    expect(rows).toHaveLength(15);
  });
  it("met les lettres et les quantités en gras, et écrit un tas comme une ligne de la liste", () => {
    const nodes = allNodes(buildSheetDocument(detailInput(menu, detail)).content);
    expect(nodes).toContainEqual({ text: "(b/c) ", bold: true });
    expect(nodes).toContainEqual({ text: "100 g d'oignon", bold: true });
    expect(nodes).toContainEqual({ text: "d : 600 g", bold: true });
    expect(rows[1]).toBe(
      "Pendant ce temps : (b/c) Éplucher 1100 g de carotte (b : 500 g, c : 600 g), couper en rondelles de 1 cm, en 2 tas. (à la main, ≈ 15 min)",
    );
  });
  it("n'imprime aucun « > », qui se lirait « plus grand que »", () => {
    for (const input of [detailInput(menu, detail), phasesInput(menu)]) {
      expect(textOf(input)).not.toContain(">");
    }
  });
  it("imprime l'ordre du planning, même si l'IA donne ses étapes à l'envers", () => {
    const reversed: Detail = { ...detail, steps: [...detail.steps].reverse() };
    expect(stepRows(detailInput(menu, reversed))).toEqual(rows);
  });
  it("imprime d'abord ce qui tourne seul quand deux étapes commencent ensemble", () => {
    // Le préchauffage et l'épluchage des carottes commencent tous deux à 0.
    expect(rows[0]).toMatch(/^\(c\) Préchauffer le four/);
    expect(rows[1]).toMatch(/^Pendant ce temps : \(b\/c\) Éplucher/);
  });
  it("finit chaque étape par l'appareil, et la durée seulement si le texte n'en a pas", () => {
    expect(rows[0]).toContain("(four, tourne seul, ≈ 15 min)");
    expect(rows[3]).toContain("(four, tourne seul)");
    // « émincer » et « cumin » ne sont pas des durées.
    expect(rows[9]).toContain("émincer finement. (à la main, ≈ 15 min)");
  });
  it("met la conservation sur la dernière étape de chaque plat, séparée par un tiret", () => {
    const kept = rows.filter((row) => row.includes("dès que c'est prêt"));
    expect(kept).toHaveLength(5);
    expect(rows[3]).toContain(
      "(four, tourne seul) — dès que c'est prêt : refroidir vite, 2 h max à température ambiante, puis frigo 3 j, congelable",
    );
    expect(rows[13]).toContain("puis congeler dès qu'il est froid");
    expect(rows[8]).toContain("puis frigo 4 j, se congèle mal");
  });
  it("met la mention complète sur l'étape qui finit le plus tard, et « au frais » sur une préparation terminée tôt", () => {
    // Une garniture du plat c, sans successeur, qui finit bien avant la braise.
    const garnish: DetailStep = {
      id: "s15",
      phase: "Lancer les cuissons longues",
      dishes: ["c"],
      text: "Glacer des petits oignons à la poêle.",
      minutes: 10,
      appliance: "induction",
      attended: true,
      after: ["s3"],
    };
    const withGarnish = stepRows(
      detailInput(menu, { ...detail, steps: [...detail.steps, garnish] }),
    );
    const garnishRow = withGarnish.find((row) => row.includes("Glacer"))!;
    expect(garnishRow).toContain("— au frais dès que prêt (2 h max à température ambiante)");
    expect(garnishRow).not.toContain("frigo 3 j");
    expect(withGarnish.find((row) => row.includes("Couvrir et enfourner"))).toContain("frigo 3 j");
  });
  it("dit pour quel plat vaut la conservation d'une étape partagée qui n'en finit qu'un", () => {
    // La fondue sert aussi le plat c, qui finit plus tard (braise) : seule la fondue (a) se range ici.
    const shared: Detail = {
      ...detail,
      steps: detail.steps.map((step) =>
        step.id === "s13" ? { ...step, dishes: ["a", "c"] } : step,
      ),
    };
    const row = stepRows(detailInput(menu, shared)).find((text) => text.includes("Poêle"))!;
    expect(row).toContain(
      "— (a) dès que c'est prêt : refroidir vite, 2 h max à température ambiante, puis frigo 4 j, congelable ; (c) au frais dès que prêt",
    );
  });
  it("ne donne pas de consigne à une préparation reprise moins de 60 min plus tard", () => {
    // Le potiron coupé (fin à 65 min) est repris par le dal à 65 min et par la soupe à 90 min.
    expect(rows[7]).toMatch(/Couper 1000 g de potiron/);
    expect(rows[7]).not.toContain("au frais");
  });
  it("enchaîne sans indication ce qui suit une étape faite à la main (étapes 7, 10, 11 de l'ancienne fiche)", () => {
    // Mijoter suit la saisie, le dal suit la coupe du potiron, la fondue suit les poireaux.
    expect(rows[6]).toMatch(/^\(b\) Ajouter l'oignon/);
    expect(rows[8]).toMatch(/^\(d\) Cocotte/);
    expect(rows[10]).toMatch(/^\(a\) Poêle/);
  });
  it("dit d'attendre la fin d'une cuisson qui tourne seule (étape 14 de l'ancienne fiche)", () => {
    // Le mixage suit la cuisson de la soupe au Thermomix, imprimée juste avant, qui tourne seule.
    expect(rows[13]).toMatch(/^Après l'étape 13 : \(e\) Prélever 1 louche/);
  });
  it("dit « Pendant ce temps » pendant la braise et les cuissons qui tournent seules (étapes 2, 5, 8, 10, 12)", () => {
    // Une personne occupée ne bloque pas : lire dans l'ordre suffit à finir une tâche à la main avant la suivante.
    expect(rows[4]).toMatch(/^Pendant ce temps : \(b\) Ciseler/);
    expect(
      rows.flatMap((row, i) => (row.startsWith("Pendant ce temps : ") ? [i + 1] : [])),
    ).toEqual([2, 5, 8, 10, 12]);
  });
  it("finit par l'étape de rangement, après l'étape qui finit le plus tard (la braise)", () => {
    expect(rows[3]).toMatch(/^\(c\) Couvrir et enfourner/);
    expect(rows[14]).toBe(
      "Quand tout est fini (après l'étape 4) : vérifier que tout est rangé : jamais un plat chaud au frigo (le refroidir sur une grille ou la casserole dans l'eau froide), fermer hermétiquement. Au congélateur : e. Soupe de potiron et navet.",
    );
  });
  it("imprime les avertissements du détail dans « À vérifier »", () => {
    const uncited: Detail = {
      ...detail,
      steps: detail.steps.map((step) =>
        step.id === "s8" ? { ...step, text: "Laver et émincer les poireaux." } : step,
      ),
    };
    expect(textOf(detailInput(menu, uncited))).toContain(
      "À vérifier : non cité dans les étapes : poireau (a).",
    );
    expect(full).not.toContain("À vérifier");
  });
});

describe("buildSheetDocument : sécurité", () => {
  it("garde chaque règle de SAFETY_RULES_FR, toutes parties de la fiche confondues", () => {
    // Les expressions clés de chaque règle, dans l'ordre de SAFETY_RULES_FR ; chacune doit être sur la fiche.
    const keys: readonly (readonly string[])[] = [
      ["chaque préparation", "2 h max à température ambiante"],
      ["chaud au frigo", "sur une grille ou la casserole dans l'eau froide"],
      ["ne congeler que froid"],
      ["ne jamais recongeler"],
      ["la cuisson ne prolonge pas la DLC"],
      [
        "produits frais",
        "chaîne du froid respectée",
        "4 °C au plus",
        "un plat qui n'a pas traîné",
        "odeur ou goût bizarre",
        "jeunes enfants, les personnes âgées ou malades",
      ],
    ];
    expect(keys).toHaveLength(SAFETY_RULES_FR.length);
    for (const key of keys.flat()) expect(full).toContain(key);
    expect(textOf(phasesInput(menu))).toContain("chaîne du froid respectée");
  });
});

describe("buildSheetDocument : dans la semaine", () => {
  it("donne par jour la veille, les ingrédients à ajouter et la ligne de l'IA, dans l'ordre des jours", () => {
    const part = full.slice(full.indexOf("Dans la semaine"));
    expect(part).toContain(
      "Lundi. \nÀ ajouter : \n600 g de cabillaud (surgelé)\n + \n300 g de riz complet\n. \nCuire le riz 20 min",
    );
    expect(part).toContain(
      "Vendredi. \nLa veille : passer du congélateur au frigo. \nRéchauffer à feu doux",
    );
    expect(part.indexOf("Lundi.")).toBeLessThan(part.indexOf("Mardi."));
    expect(part.indexOf("Jeudi.")).toBeLessThan(part.indexOf("Vendredi."));
    expect(part.slice(part.indexOf("Mardi."), part.indexOf("Mercredi."))).not.toContain("ajouter");
  });
});

describe("buildSheetDocument : encadré d'avertissement", () => {
  const tooLong: Detail = {
    ...detail,
    steps: detail.steps.map((step) => (step.id === "s4" ? { ...step, minutes: 200 } : step)),
  };
  it("n'a pas d'encadré sans constat", () => {
    expect(full).not.toContain("Attention");
  });
  it("vient juste après le titre, et parle au cuisinier quand la session dépasse 3 h", () => {
    const content: unknown = buildSheetDocument(detailInput(menu, tooLong)).content;
    if (!Array.isArray(content)) throw new Error("contenu attendu sous forme de liste");
    expect(allText(content[0])).toEqual(["Batch cooking — fiche cuisine"]);
    const box = allText(content[1]).join("");
    expect(box).toContain("Attention : la session calculée dure 3 h 50, au-delà de 3 h.");
    expect(box).toContain("Le plat qui finit le plus tard est « Bœuf braisé aux carottes »");
    expect(box).not.toContain("Ne raccourcis");
  });
});

// Un menu de phases (fiche de repli) : chaque plat est un nom et ses phases.
type PhaseSpec = [
  id: string,
  minutes: number,
  appliance: "none" | "oven" | "induction" | "thermomix",
  attended: boolean,
  after?: string[],
];
function phaseMenu(...dishes: PhaseSpec[][]): Menu {
  return {
    dishes: dishes.map((phases, i) => ({
      name: `Plat ${i}`,
      day: (["mon", "tue", "wed", "thu", "fri"] as const)[i]!,
      ingredients: [item("carotte", 300)],
      phases: phases.map(([id, minutes, appliance, attended, after = []]) => ({
        id,
        description: `phase ${id}`,
        minutes,
        appliance,
        attended,
        after,
      })),
    })),
  };
}
const rowOf = (found: readonly string[], id: string): number =>
  found.findIndex((row) => row.includes(`phase ${id} `) || row.includes(`«${id}»`));

// Un détail fait à la main : `steps` avec leurs dépendances, sur un menu donné.
function step(
  id: string,
  dishes: string[],
  text: string,
  minutes: number,
  appliance: DetailStep["appliance"],
  attended: boolean,
  after: string[] = [],
): DetailStep {
  return {
    id,
    phase: "Session",
    dishes,
    text: `«${id}» ${text}`,
    minutes,
    appliance,
    attended,
    after,
  };
}
function detailOf(on: Menu, steps: DetailStep[]): SheetInput {
  return detailInput(on, {
    steps,
    evenings: on.dishes.map((_, i) => ({ dish: "abcde"[i]!, text: "Réchauffer." })),
  });
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

describe("buildSheetDocument : enchaînement tiré de ce qui bloque l'étape", () => {
  it("dit d'attendre une dépendance qui n'est pas l'étape d'avant", () => {
    const found = stepRows(
      phasesInput(
        phaseMenu(
          [
            ["a1", 120, "oven", false],
            ["a2", 10, "none", true, ["a1", "b1"]],
          ],
          [["b1", 10, "induction", true]],
        ),
      ),
    );
    expect(found[rowOf(found, "a2")]).toMatch(/^Après l'étape 1 : \(a\) phase a2/);
  });
  it("dit d'attendre l'appareil occupé, même sans dépendance (Thermomix pris par le dal)", () => {
    const found = stepRows(
      phasesInput(
        phaseMenu(
          [["a1", 170, "oven", false]],
          [["b1", 10, "none", true]],
          [["d1", 70, "thermomix", false]],
          [["e1", 30, "thermomix", false]],
        ),
      ),
    );
    const dal = rowOf(found, "d1");
    expect(found[rowOf(found, "e1")]).toMatch(
      new RegExp(`^Après l'étape ${dal + 1} : \\(d\\) phase e1`),
    );
  });
  it("dit d'attendre la fin d'une cuisson qui tourne seule, même imprimée juste avant", () => {
    const found = stepRows(
      phasesInput(
        phaseMenu([
          ["a1", 25, "thermomix", false],
          ["a2", 2, "thermomix", true, ["a1"]],
        ]),
      ),
    );
    expect(found[1]).toMatch(/^Après l'étape 1 : \(a\) phase a2/);
  });
  it("dit « Pendant ce temps » pour une découpe faite pendant une cuisson lancée juste avant", () => {
    // Découpe a1 (0-10), cuisson a2 qui en dépend (10-40, tourne seule), seconde découpe b1 (10-25).
    const found = stepRows(
      phasesInput(
        phaseMenu(
          [
            ["a1", 10, "none", true],
            ["a2", 30, "induction", false, ["a1"]],
          ],
          [["b1", 15, "none", true]],
        ),
      ),
    );
    expect(found[1]).toMatch(/^\(a\) phase a2/);
    expect(found[2]).toMatch(/^Pendant ce temps : \(b\) phase b1/);
  });
  it("à fin égale, prend comme bloqueur l'étape qui tourne seule plutôt que la découpe", () => {
    // L'enfournement c1 attend le préchauffage b1 et la découpe a1, qui finissent tous deux à 15 min.
    const found = stepRows(
      phasesInput(
        phaseMenu(
          [["a1", 15, "none", true]],
          [["b1", 15, "oven", false]],
          [["c1", 30, "oven", false, ["a1", "b1"]]],
        ),
      ),
    );
    const preheat = rowOf(found, "b1");
    expect(rowOf(found, "a1")).toBe(rowOf(found, "c1") - 1);
    expect(found[rowOf(found, "c1")]).toMatch(new RegExp(`^Après l'étape ${preheat + 1} : `));
  });
  it("ne dit rien pour une découpe qui suit une autre découpe (la personne était occupée)", () => {
    const found = stepRows(
      phasesInput(phaseMenu([["a1", 10, "none", true]], [["b1", 10, "none", true]])),
    );
    expect(found[1]).toMatch(/^\(b\) phase b1/);
  });
  it("ne dit « Pendant ce temps » qu'une fois pour 3 découpes de suite pendant la même cuisson", () => {
    const found = stepRows(
      phasesInput(
        phaseMenu(
          [["a1", 120, "oven", false]],
          [["b1", 10, "none", true]],
          [["c1", 10, "none", true]],
          [["d1", 10, "none", true]],
        ),
      ),
    );
    expect(found[1]).toMatch(/^Pendant ce temps : \(b\) phase b1/);
    expect(found[2]).toMatch(/^\(c\) phase c1/);
    expect(found[3]).toMatch(/^\(d\) phase d1/);
  });
});

describe("buildSheetDocument : conservation par tas", () => {
  it("range au frais jusqu'à l'étape N une sauce reprise 145 min après sa fin", () => {
    // La sauce a1 finit à 20 min ; a2 la reprend après la braise, à 165 min.
    const found = stepRows(
      phasesInput(
        phaseMenu(
          [
            ["a1", 20, "induction", true],
            ["a2", 10, "none", true, ["a1", "c1"]],
          ],
          [["c1", 165, "oven", false]],
        ),
      ),
    );
    const napper = rowOf(found, "a2");
    expect(found[rowOf(found, "a1")]).toContain(`— au frais jusqu'à l'étape ${napper + 1}`);
    expect(found[napper]).toMatch(/^Après l'étape 1 : /);
  });
  it("garde le tas d'un plat qu'aucune étape ne reprend, même si l'autre tas est repris aussitôt (a/b)", () => {
    const on = menuOf([item("tomate", 100)], [item("tomate", 100), item("bœuf à braiser", 600)]);
    const found = stepRows(
      detailOf(on, [
        step("s1", ["a", "b"], "Préparer {a.1/b.1} en sauce.", 10, "none", true),
        step("s2", ["a"], "Napper avec la sauce (a).", 1, "none", true, ["s1"]),
        step("s3", ["b"], "Braiser {b.2}.", 160, "oven", false),
      ]),
    );
    const shared = found[rowOf(found, "s1")]!;
    expect(shared).toContain("— (b) au frais dès que prêt (2 h max à température ambiante)");
    expect(shared).not.toContain("(a) au frais");
  });
  // Limite cosmétique acceptée : le code ne devine pas si une étape touche un aliment (un repère peut manquer), donc
  // un préchauffage repris longtemps après reçoit une consigne de conservation inutile. C'est le côté prudent : une
  // consigne de trop plutôt qu'une consigne manquante.
  it("limite cosmétique acceptée : un préchauffage repris 75 min plus tard reçoit une consigne de trop", () => {
    const on = menuOf([item("bœuf à braiser", 600)]);
    const found = stepRows(
      detailOf(on, [
        step("s1", ["a"], "Préchauffer le four.", 15, "oven", false),
        step("s2", ["a"], "Préparer {a.1} en cocotte.", 90, "none", true),
        step("s3", ["a"], "Enfourner.", 30, "oven", false, ["s1", "s2"]),
      ]),
    );
    const enfourner = rowOf(found, "s3");
    expect(found[rowOf(found, "s1")]).toContain(`— au frais jusqu'à l'étape ${enfourner + 1}`);
    expect(found[enfourner]).toContain("— dès que c'est prêt");
  });
  it("garde au frais une étape sans repère qui suit une cuisson et attend plus de 60 min (« Mixer »)", () => {
    const on = menuOf([item("potiron", 400)], [item("bœuf à braiser", 600)]);
    const found = stepRows(
      detailOf(on, [
        step("s1", ["a"], "Cuire {a.1}.", 25, "thermomix", false),
        step("s2", ["a"], "Mixer la soupe.", 2, "thermomix", true, ["s1"]),
        step("s3", ["b"], "Braiser {b.1}.", 150, "oven", false),
        step("s4", ["a"], "Verser la soupe sur la viande.", 5, "none", true, ["s2", "s3"]),
      ]),
    );
    const last = rowOf(found, "s4");
    expect(found[rowOf(found, "s2")]).toContain(`— au frais jusqu'à l'étape ${last + 1}`);
    expect(found[rowOf(found, "s2")]).toMatch(/^Après l'étape \d+ : \(a\) «s2» Mixer/);
  });
  it("garde au frais une cuisson autonome du repli que rien ne reprend (sonde Codex c9)", () => {
    // « Cuire » a1 tourne seule de 0 à 10 min sans dépendance ; la dernière phase du plat a2 suit la braise.
    const found = stepRows(
      phasesInput(
        phaseMenu(
          [
            ["a1", 10, "induction", false],
            ["a2", 10, "none", true, ["c1"]],
          ],
          [["c1", 130, "oven", false]],
        ),
      ),
    );
    expect(found[rowOf(found, "a1")]).toContain(
      "— au frais dès que prêt (2 h max à température ambiante)",
    );
  });
  it("garde au frais une découpe dont l'IA a omis le repère (sonde Codex c9)", () => {
    // Les poireaux sont coupés sans {a.1} (simple avertissement), et la fondue attend la fin de la braise.
    const omitted: Detail = {
      ...detail,
      steps: detail.steps.map((one) => {
        if (one.id === "s8")
          return { ...one, text: "Fendre les poireaux en deux, laver, émincer finement." };
        if (one.id === "s13") return { ...one, after: [...one.after, "s4"] };
        return one;
      }),
    };
    const input = detailInput(menu, omitted);
    if (input.steps.kind !== "detail") throw new Error("fiche détaillée attendue");
    expect(input.steps.findings.map((finding) => finding.level)).toEqual(["warning"]);
    const found = stepRows(input);
    const cut = found.findIndex((row) => row.includes("Fendre les poireaux"));
    const fondue = found.findIndex((row) => row.includes("Poêle"));
    expect(found[cut]).toContain(`— au frais jusqu'à l'étape ${fondue + 1}`);
  });
  // Sonde du substitut (cycle 11) : une sauce (c) faite tôt, puis nappée après la braise. Sans la dépendance déclarée,
  // le code ne sait pas que le nappage reprend la sauce ; avec elle (règle du prompt L1), il calcule la consigne.
  function sauceProbe(after: string[]): string[] {
    const probe = autumnDetail();
    probe.steps = probe.steps.map((one) => {
      if (one.id === "s3") {
        return {
          ...one,
          text: "Petite casserole, {c.3} : préparer la sauce au vin 10 min.",
          minutes: 10,
        };
      }
      if (one.id === "s4") {
        return {
          ...one,
          text: "Couper {c.1}, cocotte, les carottes (c), eau à hauteur : **four 160 °C, 2 h**.",
        };
      }
      return one;
    });
    probe.steps.push({
      id: "s15",
      phase: "Finitions et mixages",
      dishes: ["c"],
      text: "Napper le bœuf de la sauce (c).",
      minutes: 5,
      appliance: "none",
      attended: true,
      after,
    });
    return stepRows(detailInput(menu, probe));
  }
  it("garde au frais jusqu'au nappage une sauce mise de côté, quand le nappage la déclare dans `after`", () => {
    const found = sauceProbe(["s4", "s3"]);
    const sauce = found.findIndex((row) => row.includes("préparer la sauce au vin"));
    const napper = found.findIndex((row) => row.includes("Napper le bœuf"));
    expect(found[sauce]).toContain(`— au frais jusqu'à l'étape ${napper + 1}`);
    expect(found[napper]).toContain("— dès que c'est prêt");
  });
  it("sans la dépendance déclarée, la sauce n'a pas de consigne propre (limite écrite)", () => {
    const found = sauceProbe(["s4"]);
    const sauce = found.findIndex((row) => row.includes("préparer la sauce au vin"));
    expect(found[sauce]).not.toContain("au frais");
  });
  it("ne donne pas de consigne au potiron coupé pour d et e, repris aussitôt par les deux", () => {
    expect(rows[7]).toMatch(/Couper 1000 g de potiron/);
    expect(rows[7]).not.toContain("—");
  });
});

describe("buildSheetDocument : repli", () => {
  const input = phasesInput(menu);
  const text = textOf(input);
  const fallbackRows = stepRows(input);
  it("met l'encadré avec la raison, juste après le titre", () => {
    const content = buildSheetDocument(input).content as unknown[];
    expect(allText(content[1]).join("")).toBe(
      "Attention : le détail des étapes n'a pas pu être validé : les étapes restent incohérentes après 3 appels. Cette fiche donne les grandes phases du menu, validées à la composition, sans quantités à chaque étape ni consigne du soir rédigée.",
    );
    expect(text).toContain("quantités dans « Ingrédients »");
  });
  it("donne une seule phase, avec les phases de la composition dans l'ordre du planning, sans horaire ni quantité", () => {
    expect(text).toContain("1. Grandes phases de la session (détail non validé)");
    expect(text).not.toContain("2. ");
    expect(fallbackRows[0]).toBe("(c) Préchauffer le four (four, tourne seul, ≈ 15 min)");
    expect(text).not.toMatch(/\d:\d\d–/);
    for (const row of fallbackRows.slice(0, -1)) expect(row).not.toMatch(/\d+ g de /);
  });
  it("applique les mêmes règles d'enchaînement (étapes 5, 6 et 13 de l'ancienne fiche)", () => {
    // Saisir le poulet et le mijoter suivent l'étape d'avant ; le mixage suit la cuisson de la soupe.
    expect(fallbackRows[4]).toBe("(b) Saisir le poulet (plaque induction, ≈ 10 min)");
    expect(fallbackRows[5]).toMatch(/^\(b\) Mijoter/);
    expect(fallbackRows[12]).toMatch(/^Après l'étape 12 : \(e\) Mixer la soupe/);
    expect(fallbackRows[1]).toMatch(/^Pendant ce temps : \(c\) Couper le bœuf/);
    // La braise attend le préchauffage et la découpe, finis ensemble : on dit d'attendre le four.
    expect(fallbackRows[2]).toMatch(/^Après l'étape 1 : \(c\) Braiser/);
    expect(fallbackRows[3]).toMatch(/^Pendant ce temps : \(b\) Éplucher/);
  });
  it("met la conservation sur la dernière phase de chaque plat, puis l'étape de rangement", () => {
    expect(fallbackRows.filter((row) => row.includes("dès que c'est prêt"))).toHaveLength(5);
    expect(fallbackRows.find((row) => row.includes("Braiser au four"))).toContain("frigo 3 j");
    expect(fallbackRows.at(-1)).toMatch(
      /^Quand tout est fini \(après l'étape 3\) : vérifier que tout est rangé/,
    );
  });
  it("garde le menu et les ingrédients du mode détail, et une phrase fixe le soir", () => {
    expect(text).toContain("1 kg de potiron (d : 600 g, e : 400 g)");
    expect(text).toContain("Réchauffer le plat, puis ajouter les ingrédients du soir.");
    expect(text).not.toContain("Casserole à feu doux");
  });
});

describe("buildSheetDocument : texte venu de l'IA", () => {
  it("neutralise contrôles et invisibles, et remplace « → », absent de la police", () => {
    const dirty = autumnMenu();
    dirty.dishes[1]!.name = "Poulet\u0007 aux carottes";
    const dirtyDetail: Detail = {
      steps: detail.steps.map((step) =>
        step.id === "s12" ? { ...step, text: "Mijoter\u001b[31m → plat b\u2066" } : step,
      ),
      evenings: detail.evenings.map((line) =>
        line.dish === "c" ? { ...line, text: "Réchauffer\u0000" } : line,
      ),
    };
    const text = textOf(detailInput(dirty, dirtyDetail));
    // eslint-disable-next-line no-control-regex
    expect(text).not.toMatch(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u2066→]/);
    expect(text).toContain("Poulet  aux carottes");
    expect(text).toContain("Mijoter [31m — plat b");
  });
});

describe("buildSheetDocument : pagination", () => {
  it("n'utilise jamais `unbreakable`, qui fait perdre ce qui dépasse une page", () => {
    for (const input of [detailInput(menu, detail), phasesInput(menu)]) {
      const keys = allNodes(buildSheetDocument(input).content).flatMap((node) => Object.keys(node));
      expect(keys).not.toContain("unbreakable");
      expect(keys).not.toContain("dontBreakRows");
    }
  });
  // Nœuds minimaux : seul `headlineLevel` compte pour la règle.
  const node = (headlineLevel?: number): never => ({ headlineLevel }) as never;
  const queries = (following: never[]): never =>
    ({ getFollowingNodesOnPage: () => following }) as never;
  const rule = (): ((current: never, q: never) => boolean) => {
    const { pageBreakBefore } = buildSheetDocument(detailInput(menu, detail));
    if (pageBreakBefore === undefined) throw new Error("règle absente");
    return pageBreakBefore;
  };
  it("saute à la page suivante pour un titre seul, ou suivi seulement d'autres titres", () => {
    expect(rule()(node(1), queries([]))).toBe(true);
    expect(rule()(node(1), queries([node(1)]))).toBe(true);
  });
  it("garde un titre suivi de contenu, et ne touche pas au texte ordinaire", () => {
    expect(rule()(node(1), queries([node(1), node()]))).toBe(false);
    expect(rule()(node(), queries([]))).toBe(false);
  });
});
