// Fiche d'exemple sans réseau ni clé : pnpm --filter core pdf:fixture --out <fichier.pdf> [--fallback]
// --fallback : la fiche de repli, avec les grandes phases du menu à la place des étapes détaillées.
import { parseArgs } from "node:util";
import { buildSheetDocument } from "../pdf/sheet.ts";
import { fixtureSheetInput } from "../pdf/fixture.ts";
import { checkDestination } from "./batch-command.ts";
import { absoluteOutPath } from "./output-path.ts";
import { loadPdfFonts } from "./pdf-fonts.ts";
import { guardOutputStreams, nodeClock } from "./ports.ts";
import { renderPdf } from "./render-pdf.ts";
import { writePdf } from "./write-pdf.ts";

async function main(): Promise<number> {
  let values;
  try {
    ({ values } = parseArgs({
      args: process.argv.slice(2),
      options: { out: { type: "string" }, fallback: { type: "boolean" } },
    }));
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 2;
  }
  if (values.out === undefined || !values.out.toLowerCase().endsWith(".pdf")) {
    process.stderr.write("--out <fichier.pdf> est obligatoire.\n");
    return 2;
  }
  const path = absoluteOutPath(values.out, process.env, process.cwd());
  // Même règle que `batch` : la cible doit pouvoir être remplacée avant de rendre quoi que ce soit.
  const destinationError = await checkDestination(path);
  if (destinationError !== null) {
    process.stderr.write(`${destinationError}\n`);
    return 2;
  }
  try {
    const doc = buildSheetDocument(
      fixtureSheetInput(values.fallback === true ? "phases" : "detail"),
    );
    const bytes = await renderPdf(doc, await loadPdfFonts(), nodeClock.now());
    const written = await writePdf({ kind: "replace", path }, bytes);
    process.stdout.write(`PDF écrit : ${written}\n`);
  } catch (error) {
    process.stderr.write(
      `Écriture du PDF impossible : ${error instanceof Error ? error.message : String(error)}\n`,
    );
    return 2;
  }
  return 0;
}

guardOutputStreams();

// Une erreur imprévue donne le code 2, jamais le code 1 de Node.
main().then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
  },
);
