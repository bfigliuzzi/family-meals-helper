// Régénère src/season/season-table.ts depuis l'API ADEME (impactco2). Jamais appelé par `compose`.
// Usage : pnpm --filter core season:import [--out <chemin>] > rapport.md
import { writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { REFERENTIAL } from "../ingredients/referential.ts";
import {
  buildSeasonTable,
  parseAdemeResponse,
  renderSeasonTableModule,
} from "../season/build-table.ts";
import type { AdemeProduct } from "../season/build-table.ts";
import { MANGERBOUGER_ROWS } from "../season/manual-months.ts";
import { describeMonths } from "../season/months.ts";

const API = "https://impactco2.fr/api/v1/fruitsetlegumes";

const ALIASES: Readonly<Record<string, string>> = {
  "chou vert": "chou",
  "chou rouge": "chou",
  "céleri-rave": "celeri",
  butternut: "courge",
  "haricot vert": "haricotvert",
  "petit pois": "petitpois",
};

async function fetchMonth(month: number): Promise<AdemeProduct[]> {
  const response = await fetch(`${API}?month=${month}`, {
    headers: { "User-Agent": "outil-personnel-saison/1.0" },
  });
  if (response.status !== 200) {
    throw new Error(`ADEME : statut ${response.status} pour month=${month}.`);
  }
  return parseAdemeResponse(await response.json());
}

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { out: { type: "string" } } });
  const out = values.out ?? new URL("../season/season-table.ts", import.meta.url).pathname;

  const bySlug = new Map<string, AdemeProduct>();
  for (let month = 1; month <= 12; month++) {
    for (const product of await fetchMonth(month)) bySlug.set(product.slug, product);
  }
  const { table, gaps } = buildSeasonTable({
    products: [...bySlug.values()],
    refs: REFERENTIAL,
    aliases: ALIASES,
    manual: MANGERBOUGER_ROWS,
  });
  writeFileSync(out, renderSeasonTableModule(table));

  const lines = [
    "# Rapport d'import de la table de saison",
    "",
    `Produits ADEME (union des 12 mois) : ${bySlug.size}`,
    "",
    "| Entrée | Mois | Source |",
    "|---|---|---|",
    ...Object.entries(table).map(
      ([name, row]) =>
        `| ${name} | ${describeMonths(row.months)} (${row.months.join(", ")}) | ${row.source} |`,
    ),
    "",
    `Lacunes (non contrôlées) : ${gaps.length === 0 ? "aucune" : gaps.join(", ")}`,
    "",
  ];
  process.stdout.write(lines.join("\n"));
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
