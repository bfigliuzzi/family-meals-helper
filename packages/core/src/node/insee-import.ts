// Régénère src/pricing/insee-table.ts depuis le fichier des prix moyens de l'INSEE (DS_IPC_PM). Jamais appelé par
// `compose` ni par la CI. Il a besoin de la commande `unzip` (présente sur macOS).
// Usage : pnpm --filter core insee:import [--zip <fichier.zip>] [--out <chemin>] > rapport.md
import { execFileSync } from "node:child_process";
import { lstatSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import {
  buildInseeTable,
  parseInseeData,
  parseInseeLabels,
  renderInseeTableModule,
} from "../pricing/insee.ts";
import { describeParseError } from "./compose-args.ts";
import { INSEE_MAP } from "../pricing/insee-map.ts";

const URL_INSEE = "https://api.insee.fr/melodi/file/DS_IPC_PM/DS_IPC_PM_CSV_FR";
const MAX_DOWNLOAD_BYTES = 10 * 1024 * 1024;
const MAX_CSV_BYTES = 20 * 1024 * 1024;

const TOO_BIG = "INSEE : fichier trop gros (plus de 10 Mio).";
const DOWNLOAD_FAILED = "INSEE : téléchargement impossible (réseau ou délai).";

async function download(folder: string): Promise<string> {
  let response: Response;
  try {
    response = await fetch(URL_INSEE, {
      headers: { "User-Agent": "outil-personnel-prix/1.0" },
      signal: AbortSignal.timeout(60_000),
    });
  } catch {
    throw new Error(DOWNLOAD_FAILED);
  }
  if (response.status !== 200) throw new Error(`INSEE : statut ${response.status}.`);
  if (Number(response.headers.get("content-length")) > MAX_DOWNLOAD_BYTES) {
    throw new Error(TOO_BIG);
  }
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await response.arrayBuffer());
  } catch {
    throw new Error(DOWNLOAD_FAILED);
  }
  if (bytes.length > MAX_DOWNLOAD_BYTES) throw new Error(TOO_BIG);
  const path = join(folder, "DS_IPC_PM_CSV_FR.zip");
  writeFileSync(path, bytes);
  return path;
}

// Un fichier extrait doit être un fichier ordinaire (pas un lien symbolique) de taille raisonnable.
function readExtracted(folder: string, name: string): string {
  const path = join(folder, name);
  const info = lstatSync(path);
  if (!info.isFile())
    throw new Error(`Archive INSEE inattendue : ${name} n'est pas un fichier ordinaire.`);
  if (info.size > MAX_CSV_BYTES)
    throw new Error(`Archive INSEE inattendue : ${name} est trop gros.`);
  return readFileSync(path, "utf8");
}

function extract(zip: string, folder: string): void {
  // Les CSV sont extraits dans le dossier temporaire : `unzip -p` rendrait le fichier par la sortie du processus,
  // limitée à 1 Mio par `execFileSync`, et le CSV de données en fait plus de 1,5.
  try {
    execFileSync(
      "unzip",
      ["-o", "-q", zip, "DS_IPC_PM_data.csv", "DS_IPC_PM_metadata.csv", "-d", folder],
      { timeout: 30_000, stdio: "ignore" },
    );
  } catch {
    throw new Error(
      "Archive INSEE illisible : les fichiers DS_IPC_PM_data.csv et DS_IPC_PM_metadata.csv sont attendus.",
    );
  }
}

async function main(): Promise<void> {
  let values;
  try {
    ({ values } = parseArgs({
      allowPositionals: false,
      options: { out: { type: "string" }, zip: { type: "string" } },
    }));
  } catch (error) {
    throw new Error(describeParseError(error, "Ce script ne prend aucun argument sans option."), {
      cause: error,
    });
  }
  const out = values.out ?? fileURLToPath(new URL("../pricing/insee-table.ts", import.meta.url));
  const folder = mkdtempSync(join(tmpdir(), "fmh-insee-"));
  try {
    const zip = values.zip ?? (await download(folder));
    extract(zip, folder);
    const data = parseInseeData(readExtracted(folder, "DS_IPC_PM_data.csv"));
    const labels = parseInseeLabels(readExtracted(folder, "DS_IPC_PM_metadata.csv"));
    const { table, report } = buildInseeTable({ data, labels, map: INSEE_MAP });
    const latestMonth = Object.values(table)
      .map((row) => row.month)
      .reduce((latest, month) => (month > latest ? month : latest));
    // Écriture atomique : un échec ne laisse jamais un module à moitié écrit.
    const temporary = `${out}.tmp`;
    try {
      writeFileSync(temporary, renderInseeTableModule(table, { url: URL_INSEE, latestMonth }));
      renameSync(temporary, out);
    } catch (error) {
      rmSync(temporary, { force: true });
      throw error;
    }
    process.stdout.write(
      [
        "# Rapport d'import de la table de prix INSEE",
        "",
        `Lignes mensuelles lues : ${data.length} · séries décrites : ${labels.size} · clés écrites : ${report.length}`,
        "",
        "| Clé | Série | Libellé | Mois | Prix |",
        "|---|---|---|---|---|",
        ...report,
        "",
      ].join("\n"),
    );
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
