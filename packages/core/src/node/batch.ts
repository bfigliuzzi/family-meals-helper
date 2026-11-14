// Commande : pnpm --filter core batch "<demande>" [--out <fichier.pdf>] [--exclude x] [--month 11] [--session-day dimanche] [--max-attempts 3] [--dry-run]
// Appel réel à l'IA sans --dry-run : la clé est dans ANTHROPIC_API_KEY.
import { createAnthropicModel } from "../ai/anthropic-client.ts";
import { checkOutputTarget, runBatchCommand } from "./batch-command.ts";
import { loadPdfFonts } from "./pdf-fonts.ts";
import { nodeOutputContext, resolveOutputTarget } from "./output-path.ts";
import { guardOutputStreams, nodeClock, nodeHttpClient } from "./ports.ts";
import { writePdf } from "./write-pdf.ts";

guardOutputStreams();

// Une erreur imprévue donne le code 2, jamais le code 1 de Node.
runBatchCommand(process.argv.slice(2), {
  env: process.env,
  stdout: (text) => process.stdout.write(text),
  stderr: (text) => process.stderr.write(text),
  now: () => nodeClock.now(),
  createModel: (schema, config) =>
    createAnthropicModel({ ...config, http: nodeHttpClient, logger: console, schema }),
  loadFonts: loadPdfFonts,
  resolveOutputTarget: (out, now) => resolveOutputTarget(out, now, nodeOutputContext),
  checkTarget: checkOutputTarget,
  writePdf,
}).then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
  },
);
