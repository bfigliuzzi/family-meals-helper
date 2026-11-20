import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import {
  buildInseeTable,
  inseeLookup,
  inseeUnit,
  parseInseeData,
  parseInseeLabels,
  renderInseeTableModule,
} from "./insee.ts";
import type { InseeMapEntry, InseePrice } from "./insee.ts";

const dataCsv = readFileSync(new URL("./fixtures/insee-sample.csv", import.meta.url), "utf8");
const labelsCsv = readFileSync(
  new URL("./fixtures/insee-metadata-sample.csv", import.meta.url),
  "utf8",
);
const data = parseInseeData(dataCsv);
const labels = parseInseeLabels(labelsCsv);

const hasControl = (text: string): boolean => [...text].some((char) => char.charCodeAt(0) < 32);

const MAP: readonly InseeMapEntry[] = [
  { series: "8948", key: "fresh|carotte", unit: "kg" },
  { series: "8955", key: "fresh|tomate", unit: "kg" },
  { series: "3838", key: "fresh|chou-fleur", unit: "piece" },
  { series: "1264", key: "fresh|filet mignon de porc", unit: "kg" },
];

describe("parseInseeData", () => {
  it("ne garde que les prix mensuels normaux", () => {
    expect(data.every((row) => /^\d{4}-\d{2}$/.test(row.month))).toBe(true);
    expect(data.some((row) => row.month === "2024")).toBe(false);
    // 2025-12 n'existe dans aucune série.
    expect(data.some((row) => row.month === "2025-12")).toBe(false);
  });
  it("ignore la valeur manquante du fioul (OBS_STATUS = O)", () => {
    expect(data.filter((row) => row.series === "4037").some((row) => row.month === "2020-04")).toBe(
      false,
    );
  });
  it("lit un prix avec son point décimal", () => {
    expect(data).toContainEqual({ series: "8948", month: "2026-10", euros: 2.18 });
  });
  it("refuse un en-tête changé", () => {
    const changed = dataCsv.replace('"UNIT_MEASURE"', '"UNITE"');
    expect(() => parseInseeData(changed)).toThrow("CSV INSEE inattendu : en-tête changé.");
    expect(() => parseInseeData("")).toThrow("CSV INSEE inattendu : en-tête changé.");
  });
  it("refuse une ligne de mauvaise forme", () => {
    const header = dataCsv.split("\n")[0]!;
    expect(() => parseInseeData(`${header}\n"1";"M"`)).toThrow("n'a pas 13 colonnes");
    const row = '"1";"M";"EUR";"A";"CPI";"AV_P";"N";"FM";"FRANCE";"F";"2";2026-10;abc';
    expect(() => parseInseeData(`${header}\n${row}`)).toThrow("est illisible");
  });
});

describe("parseInseeData : une seule modification d'une copie de l'extrait", () => {
  const ROW = '"8948";"M";"EUR";"A";"CPI";"AV_P";"N";"FM";"FRANCE";"F";"2";2026-10;2.18';
  const change = (from: string, to: string): string => {
    expect(dataCsv).toContain(ROW);
    return dataCsv.replace(ROW, ROW.replace(from, to));
  };
  it("refuse une autre valeur fixe, en disant ligne, colonne et valeur", () => {
    expect(() => parseInseeData(change('"EUR"', '"USD"'))).toThrow(
      /^CSV INSEE inattendu : la ligne \d+ a UNIT_MEASURE = USD \(attendu EUR\)\.$/,
    );
    expect(() => parseInseeData(change('"FM"', '"US"'))).toThrow(/a GEO = US \(attendu FM\)\.$/);
    expect(() => parseInseeData(change('"AV_P"', '"IDX"'))).toThrow(
      /a IND_TYPE = IDX \(attendu AV_P\)\.$/,
    );
  });
  it("assainit la valeur affichée", () => {
    const message = (() => {
      try {
        parseInseeData(change('"EUR"', '"E\u001b[2JR"'));
      } catch (error) {
        return (error as Error).message;
      }
      return "";
    })();
    expect(message).toContain("UNIT_MEASURE = ");
    expect(hasControl(message)).toBe(false);
  });
  it("refuse un mois ou un prix illisible", () => {
    expect(() => parseInseeData(change("2026-10", "2026-99"))).toThrow(/est illisible\.$/);
    for (const value of ["-1", "1e308", "0", "0.00", "1.234", "1234567"]) {
      expect(() => parseInseeData(change(";2.18", `;${value}`)), value).toThrow(/est illisible\.$/);
    }
  });
  it("refuse un guillemet non fermé, en disant le fichier", () => {
    expect(() => parseInseeData(change(";2.18", ';"2.18'))).toThrow(
      /^CSV INSEE inattendu : guillemet non fermé à la ligne \d+ du fichier de données\.$/,
    );
    expect(() => parseInseeLabels(labelsCsv.replace('"Mensuel"', '"Mensuel'))).toThrow(
      "CSV INSEE inattendu : guillemet non fermé à la ligne 3 du fichier de métadonnées.",
    );
  });
  it("refuse un guillemet mal placé, et accepte un champ vide cité ou un guillemet doublé", () => {
    for (const [from, to] of [
      [";2.18", ';2".1"8'],
      ['"EUR"', 'E"UR"'],
      ['"EUR"', '"EUR"x'],
    ] as const) {
      expect(() => parseInseeData(change(from, to)), to).toThrow(
        /^CSV INSEE inattendu : guillemet mal placé à la ligne \d+ du fichier de données\.$/,
      );
    }
    expect(() => parseInseeLabels(labelsCsv.replace('"Mensuel"', '"Men""suel"'))).not.toThrow();
    expect(parseInseeLabels(labelsCsv.replace('"Mensuel"', '""')).size).toBe(7);
    expect(() => parseInseeLabels(labelsCsv.replace('"Mensuel"', 'Men"suel'))).toThrow(
      "CSV INSEE inattendu : guillemet mal placé à la ligne 3 du fichier de métadonnées.",
    );
  });
  it("refuse un en-tête entier dans un seul champ entre guillemets", () => {
    const [header, ...rest] = dataCsv.split("\n");
    const quoted = [`"${header!.replaceAll('"', '""')}"`, ...rest].join("\n");
    expect(() => parseInseeData(quoted)).toThrow("CSV INSEE inattendu : en-tête changé.");
  });
});

describe("parseInseeLabels : en-tête", () => {
  it("refuse un en-tête de métadonnées changé", () => {
    for (const changed of [
      labelsCsv.replace('"LIB_MOD"', '"LIBELLE"'),
      labelsCsv.split("\n").slice(1).join("\n"),
      "",
    ]) {
      expect(() => parseInseeLabels(changed)).toThrow(
        "CSV INSEE inattendu : en-tête des métadonnées changé.",
      );
    }
  });
});

describe("parseInseeLabels et inseeUnit", () => {
  it("lit les libellés des séries", () => {
    expect(labels.get("8948")).toBe("Légumes : Carottes (kg)");
    expect(labels.size).toBe(7);
  });
  it("lit l'unité écrite à la fin du libellé", () => {
    expect(inseeUnit("Légumes : Carottes (kg)")).toBe("kg");
    expect(inseeUnit("Légumes : Chou-fleur (pièce)")).toBe("piece");
    expect(inseeUnit("Lait demi-écrémé (1 litre)")).toBe("l");
    for (const label of [
      "Viandes : Jambon supérieur",
      "Poissons : Huîtres (une douzaine)",
      "Pot (le pot)",
      "Œufs (kg) frais",
    ]) {
      expect(inseeUnit(label)).toBeNull();
    }
  });
});

describe("buildInseeTable", () => {
  const { table, report } = buildInseeTable({ data, labels, map: MAP });
  it("prend le dernier mois de chaque série", () => {
    expect(table["fresh|carotte"]).toMatchObject({ unit: "kg", euros: 2.18, month: "2026-10" });
    expect(table["fresh|tomate"]).toMatchObject({ unit: "kg", euros: 4.25, month: "2026-10" });
    expect(table["fresh|chou-fleur"]).toMatchObject({ unit: "piece", euros: 3.27 });
    expect(table["fresh|filet mignon de porc"]).toMatchObject({ euros: 14.03 });
    expect(table["fresh|carotte"]?.label).toBe("Légumes : Carottes (kg)");
    expect(table["fresh|carotte"]?.series).toBe("8948");
  });
  it("rend une ligne de rapport par clé", () => {
    expect(report).toHaveLength(4);
    expect(report[0]).toBe(
      "| fresh\\|carotte | 8948 | Légumes : Carottes (kg) | 2026-10 | 2,18 €/kg |",
    );
  });
  it("cherche le dernier mois série par série (hôtel arrêté en 2025-11)", () => {
    const hotel = buildInseeTable({
      data,
      labels: new Map([["3117", "Hôtel (kg)"]]),
      map: [{ series: "3117", key: "fresh|hôtel", unit: "kg" }],
    });
    expect(hotel.table["fresh|hôtel"]?.month).toBe("2025-11");
  });
  it("refuse une série à l'unité illisible (jambon)", () => {
    expect(() =>
      buildInseeTable({
        data,
        labels,
        map: [{ series: "1272", key: "fresh|jambon blanc", unit: "kg" }],
      }),
    ).toThrow("unité illisible");
  });
  it("assainit le libellé du rapport et des erreurs, et échappe | dans la cellule", () => {
    const entry = [{ series: "8948", key: "fresh|carotte", unit: "kg" as const }];
    const dirty = new Map([["8948", "Carottes \u001b]8;;x\u0007 (kg)"]]);
    const { report, table } = buildInseeTable({ data, labels: dirty, map: entry });
    expect(hasControl(report.join(""))).toBe(false);
    expect(table["fresh|carotte"]?.label).toBe("Carottes \u001b]8;;x\u0007 (kg)");
    const piped = new Map([["8948", "Légumes | Carottes (kg)"]]);
    expect(buildInseeTable({ data, labels: piped, map: entry }).report[0]).toContain(
      "| Légumes \\| Carottes (kg) |",
    );
    const bad = new Map([["8948", "Carottes \u001b]8;;x\u0007"]]);
    let message = "";
    try {
      buildInseeTable({ data, labels: bad, map: entry });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain("unité illisible");
    expect(hasControl(message)).toBe(false);
  });
  it("refuse une série absente, sans valeur, ou sans libellé", () => {
    const absent = [{ series: "9999", key: "fresh|x", unit: "kg" as const }];
    expect(() => buildInseeTable({ data, labels, map: absent })).toThrow("aucune valeur");
    expect(() =>
      buildInseeTable({
        data,
        labels: new Map(),
        map: [{ series: "8948", key: "fresh|carotte", unit: "kg" }],
      }),
    ).toThrow("libellé absent");
  });
  it("refuse une unité du libellé qui diffère de la correspondance", () => {
    expect(() =>
      buildInseeTable({
        data,
        labels,
        map: [{ series: "8948", key: "fresh|carotte", unit: "piece" }],
      }),
    ).toThrow("le libellé dit kg, la correspondance attend piece");
  });
});

describe("renderInseeTableModule", () => {
  it("écrit un module que Node relit : même table", async () => {
    const { table } = buildInseeTable({ data, labels, map: MAP });
    const text = renderInseeTableModule(table, {
      url: "https://exemple.test/x",
      latestMonth: "2026-10",
    });
    expect(text.split("\n").slice(0, 2)).toEqual([
      "// Fichier généré par `pnpm --filter core insee:import`, ne pas modifier à la main.",
      "// Source : https://exemple.test/x (INSEE, prix moyens de vente de détail, Licence Ouverte 2.0), données jusqu'à 2026-10.",
    ]);
    const folder = mkdtempSync(join(tmpdir(), "fmh-insee-test-"));
    try {
      const path = join(folder, "table.ts");
      writeFileSync(path, text.replace('import type { InseePrice } from "./insee.ts";\n', ""));
      const loaded = (await import(pathToFileURL(path).href)) as {
        INSEE_TABLE: Record<string, InseePrice>;
      };
      expect(loaded.INSEE_TABLE).toEqual(table);
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });
  it("trie les clés", () => {
    const { table } = buildInseeTable({ data, labels, map: MAP });
    const keys = [
      ...renderInseeTableModule(table, { url: "u", latestMonth: "2026-10" }).matchAll(
        /^ {2}"([^"]+)": \{$/gm,
      ),
    ].map((match) => match[1]);
    expect(keys).toEqual([...keys].sort((a, b) => a!.localeCompare(b!, "fr")));
    expect(keys).toHaveLength(4);
  });
});

describe("inseeLookup", () => {
  const { table } = buildInseeTable({ data, labels, map: MAP });
  const lookup = inseeLookup(table);
  it("rend le prix dans la bonne unité, avec sa source", () => {
    expect(lookup.find("fresh|carotte", "kg")).toEqual({
      unit: "kg",
      euros: 2.18,
      source: { kind: "insee", month: "2026-10" },
    });
  });
  it("rend null pour une autre unité ou une clé inconnue", () => {
    expect(lookup.find("fresh|carotte", "piece")).toBeNull();
    expect(lookup.find("fresh|carotte", "l")).toBeNull();
    expect(lookup.find("fresh|inconnu", "kg")).toBeNull();
    expect(lookup.find("constructor", "kg")).toBeNull();
  });
});
