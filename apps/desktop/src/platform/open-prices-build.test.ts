import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { buildOpenPricesSummary } from "core";
import type { OpenPricesFile } from "core";
import { describe, expect, it } from "vitest";
import { fakeOpenPricesStore } from "../test/fakes.ts";
import { buildFromStore, buildReport } from "./open-prices-build.ts";

const fixture = (name: string): string =>
  readFileSync(
    resolve(import.meta.dirname, "../../../../packages/core/src/pricing/fixtures", name),
    "utf8",
  ).trimEnd();
const TEXTS: Record<OpenPricesFile, string> = {
  locations: fixture("open-prices-locations-sample.jsonl"),
  prices: fixture("open-prices-sample.jsonl"),
  products: fixture("open-prices-products-sample.jsonl"),
};
const gzip = (text: string): Uint8Array<ArrayBuffer> => new Uint8Array(gzipSync(text));
const FILES: Record<OpenPricesFile, Uint8Array<ArrayBuffer>> = {
  locations: gzip(TEXTS.locations),
  prices: gzip(TEXTS.prices),
  products: gzip(TEXTS.products),
};
const pause = () => Promise.resolve();
const TODAY = "2026-11-20";

function direct(file: OpenPricesFile): ReadableStream<Uint8Array<ArrayBuffer>> {
  return new ReadableStream<Uint8Array<ArrayBuffer>>({
    start(controller) {
      controller.enqueue(FILES[file]);
      controller.close();
    },
  });
}

describe("buildFromStore", () => {
  it("sert les extraits compressés par morceaux de 100 octets et rend le même résumé que `core`", async () => {
    const { store, calls } = fakeOpenPricesStore({}, FILES, 100);
    const built = await buildFromStore(store, TODAY, pause);
    const expected = await buildOpenPricesSummary({
      locations: direct("locations"),
      prices: direct("prices"),
      products: direct("products"),
      today: TODAY,
      pause,
    });
    expect(built.summary).toEqual(expected.summary);
    expect(built.diagnostics).toEqual(expected.diagnostics);
    expect(built.summary.prices["fresh|carotte"]?.kg?.median).toBeCloseTo(2.49, 10);
    expect(built.diagnostics.files.prices.lines).toBe(TEXTS.prices.split("\n").length);
    expect(built.diagnostics.files.prices.unreadable).toBe(0);
    expect(built.diagnostics.files.locations.unreadable).toBe(0);
    expect(built.diagnostics.files.products.unreadable).toBe(0);
    // Les trois fichiers sont lus dans l'ordre, du début jusqu'au morceau vide.
    expect(calls[0]).toBe("read:locations:0");
    const order = calls.map((call) => call.split(":")[1]);
    expect(order.indexOf("prices")).toBeGreaterThan(order.lastIndexOf("locations"));
    expect(order.indexOf("products")).toBeGreaterThan(order.lastIndexOf("prices"));
    expect(calls.at(-1)).toBe(`read:products:${String(FILES.products.length)}`);
  });

  it("ne lit rien d'avance : aucun appel avant le début du calcul", () => {
    const { store, calls } = fakeOpenPricesStore({}, FILES);
    void buildFromStore(store, TODAY, pause).catch(() => undefined);
    expect(calls).toEqual([]);
  });

  it("un `read` qui rejette au deuxième morceau fait échouer le calcul avec le message de `core`", async () => {
    const { store } = fakeOpenPricesStore({}, FILES, 100);
    const read = store.read.bind(store);
    let reads = 0;
    store.read = (file, offset) => {
      reads += 1;
      return reads === 2
        ? Promise.reject(new Error("Fichier de prix absent."))
        : read(file, offset);
    };
    await expect(buildFromStore(store, TODAY, pause)).rejects.toThrow(
      "Fichier Open Prices illisible : locations.",
    );
    expect(reads).toBe(2);
  });

  it("un fichier absent fait échouer le calcul avec le message de `core`", async () => {
    const { store } = fakeOpenPricesStore({}, { locations: FILES.locations, prices: FILES.prices });
    await expect(buildFromStore(store, TODAY, pause)).rejects.toThrow(
      "Fichier Open Prices illisible : products.",
    );
  });
});

describe("buildReport", () => {
  it("écrit le temps avec une virgule, les relevés retenus et les clés utilisables", () => {
    const stat = { median: 2, count: 4, first: "2026-06-01", last: "2026-11-10" };
    expect(
      buildReport(12_340, {
        version: 1,
        fetchedAt: TODAY,
        from: "2026-05-20",
        to: TODAY,
        usable: { category: 14, product: 17 },
        prices: {
          "fresh|carotte": { kg: stat },
          "fresh|citron": { kg: stat, piece: { ...stat, count: 3 } },
        },
      }),
    ).toBe("Open Prices : résumé calculé en 12,3 s (11 relevés retenus, 31 clés utilisables).");
  });
});
