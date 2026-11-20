import type { PriceLookup, PriceUnit } from "./price.ts";
import { printable } from "../ai/printable.ts";
import { unitPriceText } from "./cost-text.ts";

// Prix moyen national d'un produit à son dernier mois connu, pour une unité.
export interface InseePrice {
  unit: PriceUnit;
  euros: number;
  // AAAA-MM
  month: string;
  // Code de la série INSEE.
  series: string;
  // Libellé de la série dans le fichier de métadonnées.
  label: string;
}

export interface InseeMapEntry {
  series: string;
  // « forme|nom canonique » (`shoppingKey`).
  key: string;
  unit: PriceUnit;
}

// Les 13 colonnes de `DS_IPC_PM_data.csv`, dans l'ordre : un autre en-tête veut dire que le format a changé.
const DATA_HEADER = [
  "PRODUCT_ITEM",
  "FREQ",
  "UNIT_MEASURE",
  "OBS_STATUS",
  "IDX_TYPE",
  "IND_TYPE",
  "SEASONAL_ADJUST",
  "GEO",
  "GEO_OBJECT",
  "CONF_STATUS",
  "DECIMALS",
  "TIME_PERIOD",
  "OBS_VALUE",
];

// Les 5 colonnes de `DS_IPC_PM_metadata.csv`.
const LABELS_HEADER = ["COD_VAR", "LIB_VAR", "COD_MOD", "LIB_MOD", "GEO_OBJECT"];

// Valeurs fixes des colonnes de `DS_IPC_PM_data.csv` (`docs/research/sources-prix.md`, section B) : un prix en euros,
// moyen, en France métropolitaine, non désaisonnalisé. Une autre valeur n'est pas un prix français en euros.
const FIXED_VALUES: readonly (readonly [column: string, expected: string])[] = [
  ["UNIT_MEASURE", "EUR"],
  ["IDX_TYPE", "CPI"],
  ["IND_TYPE", "AV_P"],
  ["SEASONAL_ADJUST", "N"],
  ["GEO", "FM"],
  ["GEO_OBJECT", "FRANCE"],
];

type CsvFile = "données" | "métadonnées";

// Sépare une ligne sur `;`. Une valeur citée commence par un guillemet en tout début de champ, `""` y écrit un
// guillemet, et seul `;` ou la fin de ligne peut suivre le guillemet fermant. Un guillemet ailleurs est une erreur.
function splitLine(line: string, lineNumber: number, file: CsvFile): string[] {
  const where = `à la ligne ${lineNumber} du fichier de ${file}.`;
  const fields: string[] = [];
  let current = "";
  let quoted = false;
  // Le champ a été ouvert par un guillemet et refermé : plus rien ne peut s'y ajouter.
  let closed = false;
  // Aucun caractère lu depuis le dernier `;`.
  let atStart = true;
  for (let position = 0; position < line.length; position++) {
    const char = line[position]!;
    if (quoted) {
      if (char !== '"') current += char;
      else if (line[position + 1] === '"') {
        current += '"';
        position++;
      } else {
        quoted = false;
        closed = true;
      }
      continue;
    }
    if (char === ";") {
      fields.push(current);
      current = "";
      closed = false;
      atStart = true;
    } else if (closed || (char === '"' && !atStart)) {
      throw new Error(`CSV INSEE inattendu : guillemet mal placé ${where}`);
    } else if (char === '"') {
      quoted = true;
      atStart = false;
    } else {
      current += char;
      atStart = false;
    }
  }
  if (quoted) throw new Error(`CSV INSEE inattendu : guillemet non fermé ${where}`);
  fields.push(current);
  return fields;
}

function linesOf(csv: string): string[] {
  return csv
    .split("\n")
    .map((line) => (line.endsWith("\r") ? line.slice(0, -1) : line))
    .filter((line) => line !== "");
}

function sameFields(fields: readonly string[], expected: readonly string[]): boolean {
  return fields.length === expected.length && fields.every((field, i) => field === expected[i]);
}

const HEADER_CHANGED = "CSV INSEE inattendu : en-tête changé.";

// Les prix mensuels normaux (`FREQ` M, `OBS_STATUS` A) ; une valeur vide est ignorée.
export function parseInseeData(csv: string): { series: string; month: string; euros: number }[] {
  const [header, ...rows] = linesOf(csv);
  if (header === undefined || !sameFields(splitLine(header, 1, "données"), DATA_HEADER)) {
    throw new Error(HEADER_CHANGED);
  }
  const prices: { series: string; month: string; euros: number }[] = [];
  for (const [position, row] of rows.entries()) {
    const lineNumber = position + 2;
    const fields = splitLine(row, lineNumber, "données");
    if (fields.length !== DATA_HEADER.length) {
      throw new Error(`CSV INSEE inattendu : la ligne ${lineNumber} n'a pas 13 colonnes.`);
    }
    for (const [column, expected] of FIXED_VALUES) {
      const value = fields[DATA_HEADER.indexOf(column)]!;
      if (value !== expected) {
        throw new Error(
          `CSV INSEE inattendu : la ligne ${lineNumber} a ${column} = ${printable(value)} (attendu ${expected}).`,
        );
      }
    }
    const series = fields[0]!;
    const period = fields[11]!;
    const value = fields[12]!;
    if (fields[1] !== "M" || fields[3] !== "A" || value === "") continue;
    const euros = Number(value);
    if (
      !/^\d{4}-(0[1-9]|1[0-2])$/.test(period) ||
      !/^\d{1,6}(\.\d{1,2})?$/.test(value) ||
      !(euros > 0)
    ) {
      throw new Error(`CSV INSEE inattendu : la ligne ${lineNumber} est illisible.`);
    }
    prices.push({ series, month: period, euros });
  }
  return prices;
}

// Libellé de chaque série : les lignes `COD_VAR = PRODUCT_ITEM` du fichier de métadonnées.
export function parseInseeLabels(csv: string): Map<string, string> {
  const [header, ...rows] = linesOf(csv);
  if (header === undefined || !sameFields(splitLine(header, 1, "métadonnées"), LABELS_HEADER)) {
    throw new Error("CSV INSEE inattendu : en-tête des métadonnées changé.");
  }
  const labels = new Map<string, string>();
  for (const [position, row] of rows.entries()) {
    const [variable, , code, label] = splitLine(row, position + 2, "métadonnées");
    if (variable === "PRODUCT_ITEM" && code !== undefined && label !== undefined) {
      labels.set(code, label);
    }
  }
  return labels;
}

// L'unité n'est écrite que dans le libellé, entre parenthèses à la fin : `(kg)`, `(pièce)`, `(1 litre)`.
export function inseeUnit(label: string): PriceUnit | null {
  if (label.endsWith("(kg)")) return "kg";
  if (label.endsWith("(pièce)")) return "piece";
  if (label.endsWith("(1 litre)")) return "l";
  return null;
}

// Une série absente, sans valeur ou d'unité illisible fait échouer l'import : la correspondance est à corriger.
export function buildInseeTable(input: {
  data: readonly { series: string; month: string; euros: number }[];
  labels: ReadonlyMap<string, string>;
  map: readonly InseeMapEntry[];
}): { table: Record<string, InseePrice>; report: string[] } {
  const latest = new Map<string, { month: string; euros: number }>();
  for (const { series, month, euros } of input.data) {
    const known = latest.get(series);
    if (known === undefined || month > known.month) latest.set(series, { month, euros });
  }
  const table: Record<string, InseePrice> = {};
  const report: string[] = [];
  for (const { series, key, unit } of input.map) {
    const found = latest.get(series);
    const label = input.labels.get(series);
    if (found === undefined) {
      throw new Error(`Série INSEE ${series} (${key}) : aucune valeur dans le fichier.`);
    }
    if (label === undefined) {
      throw new Error(`Série INSEE ${series} (${key}) : libellé absent des métadonnées.`);
    }
    // Le libellé vient d'un fichier téléchargé : il est assaini pour le rapport et les messages, brut dans la table.
    const shown = printable(label);
    const labelUnit = inseeUnit(label);
    if (labelUnit === null) {
      throw new Error(`Série INSEE ${series} (« ${shown} ») : unité illisible dans le libellé.`);
    }
    if (labelUnit !== unit) {
      throw new Error(
        `Série INSEE ${series} (« ${shown} ») : le libellé dit ${labelUnit}, la correspondance attend ${unit}.`,
      );
    }
    table[key] = { unit, euros: found.euros, month: found.month, series, label };
    report.push(
      `| ${key.replaceAll("|", "\\|")} | ${series} | ${shown.replaceAll("|", "\\|")} | ${found.month} | ${unitPriceText(unit, found.euros)} |`,
    );
  }
  return { table, report };
}

// Texte du module généré `insee-table.ts`. Les objets sont écrits développés : Prettier ne les change pas.
export function renderInseeTableModule(
  table: Readonly<Record<string, InseePrice>>,
  meta: { url: string; latestMonth: string },
): string {
  const entries = Object.keys(table)
    .sort((a, b) => a.localeCompare(b, "fr"))
    .flatMap((key) => {
      const row = table[key]!;
      return [
        `  ${JSON.stringify(key)}: {`,
        `    unit: ${JSON.stringify(row.unit)},`,
        `    euros: ${JSON.stringify(row.euros)},`,
        `    month: ${JSON.stringify(row.month)},`,
        `    series: ${JSON.stringify(row.series)},`,
        `    label: ${JSON.stringify(row.label)},`,
        "  },",
      ];
    });
  return [
    "// Fichier généré par `pnpm --filter core insee:import`, ne pas modifier à la main.",
    `// Source : ${meta.url} (INSEE, prix moyens de vente de détail, Licence Ouverte 2.0), données jusqu'à ${meta.latestMonth}.`,
    'import type { InseePrice } from "./insee.ts";',
    "",
    "export const INSEE_TABLE: Readonly<Record<string, InseePrice>> = {",
    ...entries,
    "};",
    "",
  ].join("\n");
}

// Le prix de l'INSEE pour une clé, seulement dans l'unité du produit.
export function inseeLookup(table: Readonly<Record<string, InseePrice>>): PriceLookup {
  return {
    find(key, unit) {
      const row = Object.hasOwn(table, key) ? table[key] : undefined;
      if (row === undefined || row.unit !== unit) return null;
      return { unit, euros: row.euros, source: { kind: "insee", month: row.month } };
    },
  };
}
