import { describe, expect, it } from "vitest";
import type { TDocumentDefinitions } from "pdfmake/interfaces.js";
import { fixtureSheetInput } from "../pdf/fixture.ts";
import type { SheetInput } from "../pdf/sheet.ts";
import type { Detail, DetailStep } from "../domain/detail.ts";
import type { Dish, Menu, MenuIngredient } from "../domain/menu.ts";
import { HOUSEHOLD_EQUIPMENT } from "../equipment/household.ts";
import { checkMenu } from "../rules/check-menu.ts";
import { checkDetail } from "../scheduling/check-detail.ts";
import { SEASON_TABLE } from "../season/season-table.ts";
import { buildSheetDocument } from "../pdf/sheet.ts";
import { loadPdfFonts } from "./pdf-fonts.ts";
import { renderPdf } from "./render-pdf.ts";

const at = new Date(Date.UTC(2026, 10, 13, 9, 30));
const asText = (bytes: Uint8Array): string => Buffer.from(bytes).toString("latin1");
const pageCount = (bytes: Uint8Array): number =>
  asText(bytes).match(/\/Type \/Page\b(?!s)/g)?.length ?? 0;

describe("renderPdf", () => {
  it("rend la fiche d'exemple : octets %PDF- … %%EOF, 1 ou 2 pages, Roboto embarquée", async () => {
    const fonts = await loadPdfFonts();
    const bytes = await renderPdf(buildSheetDocument(fixtureSheetInput("detail")), fonts, at);
    const text = asText(bytes);
    expect(text.startsWith("%PDF-")).toBe(true);
    expect(text.trimEnd().endsWith("%%EOF")).toBe(true);
    expect(pageCount(bytes)).toBeGreaterThanOrEqual(1);
    expect(pageCount(bytes)).toBeLessThanOrEqual(2);
    expect(text).toMatch(/\/BaseFont \/[A-Z]{6}\+Roboto/);
  });

  it("rend la fiche de repli", async () => {
    const bytes = await renderPdf(
      buildSheetDocument(fixtureSheetInput("phases")),
      await loadPdfFonts(),
      at,
    );
    expect(asText(bytes).startsWith("%PDF-")).toBe(true);
  });

  it("rend les quatre styles de la police avec les accents et « œ »", async () => {
    const doc: TDocumentDefinitions = {
      defaultStyle: { font: "Roboto" },
      content: [
        { text: "œ é à « » – ’" },
        { text: "œ é à « » – ’", bold: true },
        { text: "œ é à « » – ’", italics: true },
        { text: "œ é à « » – ’", bold: true, italics: true },
      ],
    };
    const text = asText(await renderPdf(doc, await loadPdfFonts(), at));
    expect(text).toMatch(/Roboto-Regular/);
    expect(text).toMatch(/Roboto-Medium\b/);
    expect(text).toMatch(/Roboto-Italic/);
    expect(text).toMatch(/Roboto-MediumItalic/);
  });

  it("donne la même CreationDate pour deux rendus avec la même date", async () => {
    const fonts = await loadPdfFonts();
    const doc = buildSheetDocument(fixtureSheetInput("detail"));
    // Le dictionnaire d'informations renvoie à un objet indirect : « /CreationDate 20 0 R ».
    const creation = (bytes: Uint8Array): string | undefined => {
      const text = asText(bytes);
      const id = /\/CreationDate (\d+) 0 R/.exec(text)?.[1];
      return id === undefined
        ? undefined
        : new RegExp(`\\n${id} 0 obj\\n\\(([^)]*)\\)`).exec(text)?.[1];
    };
    const first = creation(await renderPdf(doc, fonts, at));
    const second = creation(await renderPdf(doc, fonts, at));
    expect(first).toBe("D:20261113093000Z");
    expect(second).toBe(first);
    expect(creation(await renderPdf(doc, fonts, new Date(at.getTime() + 60_000)))).not.toBe(first);
  });
});

// Fiche très longue : 150 ingrédients de plus, une étape de 1000 mots et une ligne du soir longue.
function heavyInput(): SheetInput {
  const input = fixtureSheetInput("detail");
  if (input.steps.kind !== "detail") throw new Error("fiche détaillée attendue");
  const { detail } = input.steps;
  const first = input.menu.dishes[0]!;
  const menu = {
    dishes: [
      {
        ...first,
        ingredients: [
          ...first.ingredients,
          ...Array.from({ length: 150 }, (_, i) => ({
            name: `ingrédient ${String(i).padStart(3, "0")}`,
            qty: 10,
            unit: "g" as const,
            form: "fresh" as const,
            category: "vegetable" as const,
            sameDay: false,
          })),
        ],
      },
      ...input.menu.dishes.slice(1),
    ],
  };
  const heavy = {
    steps: detail.steps.map((step, i) =>
      i === 0 ? { ...step, text: `${"MELANGER ".repeat(1000)}FIN-ETAPE` } : step,
    ),
    evenings: detail.evenings.map((line, i) =>
      i === 0 ? { ...line, text: `${"REPOSER ".repeat(400)}FIN-SOIR` } : line,
    ),
  };
  // Le planning vient des étapes : il faut le recalculer avec le texte long.
  const { plan } = checkDetail(menu, heavy, HOUSEHOLD_EQUIPMENT, input.index, []);
  if (plan === null) throw new Error("planning attendu");
  return { ...input, menu, steps: { ...input.steps, detail: heavy, plan } };
}

describe("renderPdf : contenu très long", () => {
  it("fait des pages en plus au lieu de couper le contenu (au moins 3 pages)", async () => {
    const bytes = await renderPdf(buildSheetDocument(heavyInput()), await loadPdfFonts(), at);
    expect(asText(bytes).match(/\/Type \/Page\b(?!s)/g)?.length).toBeGreaterThanOrEqual(3);
  });
});

// Fiche nominale la plus chargée que le prompt permet : 5 plats de 6 ingrédients, 20 étapes d'environ 45 mots une fois
// les 3 repères remplacés, une session de plus de 3 h (encadré), 5 soirs de 30 mots. `phases` donne le titre de
// chaque étape, dans l'ordre du planning.
const NAMES = [
  ["poireau", "carotte", "navet", "céleri-rave", "panais", "persil"],
  ["potiron", "oignon", "échalote", "chou vert", "épinard", "ciboulette"],
  ["cuisse de poulet", "champignon de Paris", "ail", "lentilles corail", "betterave", "cerfeuil"],
  ["bœuf à braiser", "pomme de terre", "chou-fleur", "brocoli", "fenouil", "coriandre"],
  ["butternut", "courge spaghetti", "topinambour", "patate douce", "haricot vert", "aneth"],
];
// Texte ordinaire de cuisine, 11 mots, environ 5 lettres par mot : la longueur réelle d'une consigne de l'IA.
const CLAUSE = "en cubes de 2 cm, feu moyen, remuer souvent jusqu'à tendre";
// 30 mots.
const EVENING =
  "Réchauffer à feu doux 10 min en remuant, avec un peu d'eau si la sauce a réduit, puis servir avec du pain et une salade verte de saison bien assaisonnée.";

function nominalInput(phases: (index: number) => string): SheetInput {
  const index = fixtureSheetInput("detail").index;
  const dishes = NAMES.map((names, i): Dish => ({
    name: `Plat nominal ${i + 1} au nom de longueur ordinaire`,
    day: (["mon", "tue", "wed", "thu", "fri"] as const)[i]!,
    ingredients: names.map((name, j): MenuIngredient => ({
      name,
      qty: 150 + 10 * j,
      unit: "g",
      form: "fresh",
      category: null,
      // Le dernier ingrédient de chaque plat s'ajoute le soir.
      sameDay: j === 5,
    })),
    phases: [],
  }));
  const menu: Menu = { dishes };
  const steps = Array.from({ length: 20 }, (_, i): DetailStep => {
    const letter = "abcde"[i % 5]!;
    const first = (Math.floor(i / 5) % 2) + 1;
    return {
      id: `s${i + 1}`,
      phase: phases(i),
      dishes: [letter],
      // 3 repères (12 mots une fois remplacés) et 36 autres mots : environ 45 mots rendus.
      text: `Couper {${letter}.${first}} ${CLAUSE}, ajouter {${letter}.${first + 2}} ${CLAUSE} puis {${letter}.5} ${CLAUSE}.`,
      minutes: 15,
      appliance: "none",
      attended: true,
      after: i === 0 ? [] : [`s${i}`],
    };
  });
  const detail: Detail = {
    steps,
    evenings: dishes.map((_, i) => ({ dish: "abcde"[i]!, text: EVENING })),
  };
  const check = checkDetail(menu, detail, HOUSEHOLD_EQUIPMENT, index, []);
  if (check.plan === null) throw new Error("planning attendu");
  const keeping = checkMenu(menu, {
    request: "5 dîners",
    exclusions: [],
    month: 11,
    sessionDay: "sun",
    dinners: 5,
    index,
    seasonTable: SEASON_TABLE,
  }).keeping;
  return {
    sessionDay: "sun",
    menu,
    keeping,
    index,
    steps: { kind: "detail", detail, plan: check.plan, findings: check.findings },
  };
}

describe("renderPdf : compacité (1 à 2 feuilles)", () => {
  const PHASES = ["Lancer", "Découpes", "Mijotés", "Finitions"];
  it("tient en 2 pages au plus : 20 étapes de 45 mots, 4 phases, encadré et 5 soirs", async () => {
    const input = nominalInput((i) => PHASES[Math.floor(i / 5)]!);
    const doc = buildSheetDocument(input);
    expect(JSON.stringify(doc.content)).toContain("au-delà de 3 h");
    expect(pageCount(await renderPdf(doc, await loadPdfFonts(), at))).toBeLessThanOrEqual(2);
  });
  // Cas limite signalé : 20 titres de phase (une phase différente à chaque étape) prennent environ une demi-page de
  // plus. La fiche déborde alors sur une 3e page, même à 8,5 pt et 8 mm de marge ; la police reste à 9 pt.
  it("déborde d'une page au plus avec 20 titres de phase réimprimés (3 pages)", async () => {
    const doc = buildSheetDocument(nominalInput((i) => PHASES[i % 4]!));
    expect(pageCount(await renderPdf(doc, await loadPdfFonts(), at))).toBeLessThanOrEqual(3);
  });
});
