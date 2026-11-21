// Banc d'essai de `buildOpenPricesSummary` sur les trois fichiers `.jsonl.gz` d'un dossier local : temps, mémoire,
// taille du résumé, diagnostics, clés utilisables et verdict de la garde de format. Jamais appelé par la CI ni par
// l'app. Usage : pnpm --filter core open-prices:report --dir <dossier> [--today AAAA-MM-JJ]
// Seuils de la conception : moins de 30 s, moins de 1 Go, résumé de moins de 512 Kio.
import { createReadStream } from "node:fs";
import { join } from "node:path";
import { Readable } from "node:stream";
import { parseArgs } from "node:util";
import { isRealDate, localDateText } from "../history/history.ts";
import {
  acceptSummary,
  buildOpenPricesSummary,
  MAX_SUMMARY_BYTES,
  serializeOpenPricesSummary,
} from "../pricing/open-prices.ts";
import type { RetainedPrice } from "../pricing/open-prices.ts";
import { describeParseError } from "./compose-args.ts";

const MAX_SECONDS = 30;
const MAX_RSS_BYTES = 1024 * 1024 * 1024;

function openFile(dir: string, name: string): ReadableStream<Uint8Array<ArrayBuffer>> {
  return Readable.toWeb(createReadStream(join(dir, `${name}.jsonl.gz`))) as ReadableStream<
    Uint8Array<ArrayBuffer>
  >;
}

async function main(): Promise<number> {
  let values;
  try {
    ({ values } = parseArgs({
      args: process.argv.slice(2),
      options: { dir: { type: "string" }, today: { type: "string" } },
      strict: true,
      allowPositionals: false,
    }));
  } catch (error) {
    process.stderr.write(`${describeParseError(error)}\n`);
    return 2;
  }
  if (values.dir === undefined) {
    process.stderr.write("Usage : open-prices:report --dir <dossier> [--today AAAA-MM-JJ]\n");
    return 2;
  }
  const today = values.today ?? localDateText(new Date());
  if (!isRealDate(today)) {
    process.stderr.write("--today attend une date AAAA-MM-JJ.\n");
    return 2;
  }
  const retained: RetainedPrice[] = [];
  const started = performance.now();
  let result;
  try {
    result = await buildOpenPricesSummary({
      locations: openFile(values.dir, "locations"),
      prices: openFile(values.dir, "prices"),
      products: openFile(values.dir, "products"),
      today,
      pause: () => Promise.resolve(),
      onRetained: (price) => retained.push(price),
    });
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : "Échec du calcul."}\n`);
    return 1;
  }
  const seconds = (performance.now() - started) / 1000;
  const rssBytes = process.resourceUsage().maxRSS * 1024; // Node rend des Kio
  const { summary, diagnostics } = result;
  const size = Buffer.byteLength(serializeOpenPricesSummary(summary));
  const verdict = acceptSummary(summary, diagnostics, null);
  const out = (line: string): void => {
    process.stdout.write(`${line}\n`);
  };
  out(`Jour : ${today} (fenêtre ${summary.from} au ${summary.to})`);
  out(
    `Temps : ${seconds.toFixed(1)} s (seuil ${MAX_SECONDS} s) ${seconds < MAX_SECONDS ? "OK" : "ÉCHEC"}`,
  );
  out(
    `Mémoire maximale : ${(rssBytes / 1048576).toFixed(0)} Mio (seuil ${MAX_RSS_BYTES / 1048576} Mio) ${rssBytes < MAX_RSS_BYTES ? "OK" : "ÉCHEC"}`,
  );
  out(
    `Résumé : ${size} octets (seuil ${MAX_SUMMARY_BYTES}) ${size < MAX_SUMMARY_BYTES ? "OK" : "ÉCHEC"}`,
  );
  for (const [file, stats] of Object.entries(diagnostics.files)) {
    out(
      `${file} : ${stats.lines} lignes, ${stats.unreadable} illisibles, ${stats.badFields} champs mal typés`,
    );
  }
  out(`Relevés retenus : ${retained.length}`);
  out(
    `Clés utilisables : ${diagnostics.usable.category} de catégorie (fruits et légumes), ${diagnostics.usable.product} produits à code-barres`,
  );
  out(`Garde de format sans résumé précédent : ${verdict ?? "acceptée"}`);
  const ok = seconds < MAX_SECONDS && rssBytes < MAX_RSS_BYTES && size < MAX_SUMMARY_BYTES;
  return ok && verdict === null ? 0 : 1;
}

process.exitCode = await main();
