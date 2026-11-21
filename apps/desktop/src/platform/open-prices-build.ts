import { buildOpenPricesSummary } from "core";
import type { Diagnostics, OpenPricesFile, OpenPricesStore, OpenPricesSummary } from "core";

// Un fichier téléchargé vu comme un flux d'octets : chaque morceau (512 Kio compressés) est une vraie attente d'un
// `invoke`, donc l'interface peut se redessiner entre deux morceaux. `highWaterMark: 0` : rien n'est lu avant que le
// calcul n'en ait besoin. Une lecture qui échoue fait échouer le flux tout de suite (pas d'attente d'un délai).
function fileStream(
  store: OpenPricesStore,
  file: OpenPricesFile,
): ReadableStream<Uint8Array<ArrayBuffer>> {
  let offset = 0;
  return new ReadableStream<Uint8Array<ArrayBuffer>>(
    {
      async pull(controller) {
        try {
          const chunk = await store.read(file, offset);
          if (chunk.length === 0) {
            controller.close();
            return;
          }
          offset += chunk.length;
          controller.enqueue(chunk);
        } catch (error) {
          controller.error(error);
        }
      },
    },
    { highWaterMark: 0 },
  );
}

// Calcule le résumé Open Prices à partir des trois fichiers que le Rust vient de télécharger. Rend le résumé et les
// diagnostics tels que `core` les donne : la garde de format et la sérialisation sont faites par le propriétaire des
// prix. Pas de délai total : si macOS ralentit la vue cachée, le calcul reprend au retour ; il est borné par la
// taille des données, pas par le temps.
export function buildFromStore(
  store: OpenPricesStore,
  today: string,
  pause: () => Promise<void>,
): Promise<{ summary: OpenPricesSummary; diagnostics: Diagnostics }> {
  return buildOpenPricesSummary({
    locations: fileStream(store, "locations"),
    prices: fileStream(store, "prices"),
    products: fileStream(store, "products"),
    today,
    pause,
  });
}

const secondsText = (milliseconds: number): string =>
  (milliseconds / 1000).toFixed(1).replace(".", ",");

// La ligne de console qui donne le temps du calcul : `Open Prices : résumé calculé en 12,3 s (842 relevés retenus,
// 31 clés utilisables).` Les relevés retenus sont ceux des médianes du résumé.
export function buildReport(milliseconds: number, summary: OpenPricesSummary): string {
  let retained = 0;
  for (const units of Object.values(summary.prices)) {
    for (const stat of Object.values(units)) retained += stat.count;
  }
  const keys = summary.usable.category + summary.usable.product;
  return `Open Prices : résumé calculé en ${secondsText(milliseconds)} s (${String(retained)} relevés retenus, ${String(keys)} clés utilisables).`;
}
