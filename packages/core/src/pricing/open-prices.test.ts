import { readFileSync } from "node:fs";
import { once } from "node:events";
import { constants, createGzip, gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import type { Menu, MenuIngredient } from "../domain/menu.ts";
import { buildIngredientIndex } from "../ingredients/index-lookup.ts";
import { REFERENTIAL } from "../ingredients/referential.ts";
import { menuCost } from "./cost.ts";
import { buildInseeTable, inseeLookup, parseInseeData, parseInseeLabels } from "./insee.ts";
import {
  acceptSummary,
  buildOpenPricesSummary,
  LINE_TOO_LONG_MESSAGE,
  MAX_SUMMARY_BYTES,
  MIN_CATEGORY_KEYS,
  MIN_PACKAGE_QUANTITY,
  MIN_OPEN_PRICES_COUNT,
  MIN_PRODUCT_KEYS,
  openPricesDue,
  openPricesLookup,
  OpenPricesSummarySchema,
  readGzipLines,
  readOpenPricesSummary,
  serializeOpenPricesSummary,
  SUMMARY_TOO_BIG_MESSAGE,
  TOO_BIG_UNCOMPRESSED_MESSAGE,
  TOO_MANY_MESSAGE,
} from "./open-prices.ts";
import type { BuildInput, Diagnostics, OpenPricesSummary, RetainedPrice } from "./open-prices.ts";

const TODAY = "2026-11-20";
const index = buildIngredientIndex(REFERENTIAL);

function fixtureLines(name: string): Record<string, unknown>[] {
  return readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8")
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}
const SAMPLE_PRICES = fixtureLines("open-prices-sample.jsonl");
const SAMPLE_LOCATIONS = fixtureLines("open-prices-locations-sample.jsonl");
const SAMPLE_PRODUCTS = fixtureLines("open-prices-products-sample.jsonl");

type Bytes = Uint8Array<ArrayBuffer>;
type Row = Record<string, unknown>;

function toLines(rows: readonly (Row | string)[]): string {
  return rows.map((row) => (typeof row === "string" ? row : JSON.stringify(row))).join("\n");
}
function gzip(text: string): Bytes {
  return new Uint8Array(gzipSync(Buffer.from(text, "utf8")));
}
// Un flux d'octets découpé en morceaux de `size` octets (tout le fichier d'un coup sans `size`).
function streamOf(bytes: Bytes, size = bytes.length): ReadableStream<Uint8Array<ArrayBuffer>> {
  let offset = 0;
  return new ReadableStream<Uint8Array<ArrayBuffer>>({
    pull(controller) {
      if (offset >= bytes.length) {
        controller.close();
        return;
      }
      controller.enqueue(bytes.slice(offset, offset + size));
      offset += size;
    },
  });
}

interface Files {
  locations: readonly Row[];
  prices: readonly (Row | string)[];
  products: readonly Row[];
}
const SAMPLE: Files = {
  locations: SAMPLE_LOCATIONS,
  prices: SAMPLE_PRICES,
  products: SAMPLE_PRODUCTS,
};

async function build(
  files: Files,
  extra: Partial<BuildInput> = {},
  chunk?: number,
): Promise<{
  summary: OpenPricesSummary;
  diagnostics: Diagnostics;
  retained: RetainedPrice[];
}> {
  const retained: RetainedPrice[] = [];
  const result = await buildOpenPricesSummary({
    locations: streamOf(gzip(toLines(files.locations)), chunk),
    prices: streamOf(gzip(toLines(files.prices)), chunk),
    products: streamOf(gzip(toLines(files.products)), chunk),
    today: TODAY,
    pause: () => Promise.resolve(),
    onRetained: (price) => retained.push(price),
    ...extra,
  });
  return { ...result, retained };
}

function keysOf(retained: readonly RetainedPrice[]): string[] {
  return retained.map((price) => `${price.key}|${price.unit}`);
}
function row(id: number): Row {
  const found = SAMPLE_PRICES.find((candidate) => candidate["id"] === id);
  if (found === undefined) throw new Error(`relevé ${id} absent de l'extrait`);
  return found;
}
function product(id: number): Row {
  const found = SAMPLE_PRODUCTS.find((candidate) => candidate["id"] === id);
  if (found === undefined) throw new Error(`produit ${id} absent de l'extrait`);
  return found;
}

describe("estimation sur l'extrait Open Prices", () => {
  it("retient les relevés attendus, avec les prix au kilo, au litre et à la pièce", async () => {
    const { summary } = await build(SAMPLE);
    const lookup = openPricesLookup(summary, 1);
    const price = (key: string, unit: "kg" | "l" | "piece"): number | undefined =>
      lookup.find(key, unit)?.euros;
    expect(price("fresh|courgette", "kg")).toBeCloseTo(3.2, 10);
    expect(price("fresh|tomate", "kg")).toBeCloseTo(1.99, 10);
    expect(price("fresh|beurre", "kg")).toBeCloseTo(14.4, 10);
    expect(price("fresh|lait", "l")).toBeCloseTo(1.05, 10);
    expect(price("fresh|citron", "kg")).toBeCloseTo(3.99, 10);
    expect(price("fresh|citron", "piece")).toBeCloseTo(0.59, 10);
    expect(price("fresh|emmental râpé", "kg")).toBeCloseTo(10.43, 2);
    expect(price("fresh|crème fraîche", "kg")).toBeCloseTo(6.52, 2);
    expect(price("fresh|oignon", "kg")).toBeCloseTo(3.9, 10);
    expect(price("fresh|pomme de terre", "kg")).toBeCloseTo(3.2, 10);
    expect(price("fresh|poireau", "kg")).toBeCloseTo(3.95, 10);
    expect(price("fresh|carotte", "kg")).toBeCloseTo(2.49, 10);
    expect(price("fresh|pomme", "kg")).toBeCloseTo(2.95, 10);
    expect(price("fresh|œuf", "piece")).toBeCloseTo(0.56, 10);
    expect(price("fresh|laitue", "piece")).toBeCloseTo(1.89, 10);
    expect(price("fresh|concombre", "piece")).toBeCloseTo(1.89, 10);
    expect(price("dry|pâtes", "kg")).toBeCloseTo(4.48, 10);
    expect(price("dry|riz basmati", "kg")).toBeCloseTo(5.1, 10);
  });

  it("n'a rien d'autre : les relevés écartés de l'extrait ne donnent aucune clé", async () => {
    const { retained, summary } = await build(SAMPLE);
    expect(Object.keys(summary.prices).sort((a, b) => a.localeCompare(b, "fr"))).toEqual(
      [
        "dry|pâtes",
        "dry|riz basmati",
        "fresh|beurre",
        "fresh|carotte",
        "fresh|citron",
        "fresh|concombre",
        "fresh|courgette",
        "fresh|crème fraîche",
        "fresh|emmental râpé",
        "fresh|lait",
        "fresh|laitue",
        "fresh|œuf",
        "fresh|oignon",
        "fresh|poireau",
        "fresh|pomme",
        "fresh|pomme de terre",
        "fresh|tomate",
      ].sort((a, b) => a.localeCompare(b, "fr")),
    );
    const ids = retained.map((price) => price.priceId);
    // sans lieu (351826, un lait qui serait retenu), surgelé exclu (362875), lentilles préparées (365338),
    // Allemagne (363829), hors fenêtre (276486).
    for (const excluded of [351826, 362875, 365338, 363829, 276486, 282881, 359198, 365005]) {
      expect(ids, `relevé ${excluded}`).not.toContain(excluded);
    }
  });

  it("le résumé dit sa fenêtre, son jour et ses clés utilisables", async () => {
    const { summary, diagnostics } = await build(SAMPLE);
    expect(summary).toMatchObject({ version: 1, fetchedAt: TODAY, from: "2026-05-20", to: TODAY });
    expect(summary.usable).toEqual(diagnostics.usable);
    expect(diagnostics.files.prices.lines).toBe(SAMPLE_PRICES.length);
    expect(diagnostics.files.prices.unreadable).toBe(0);
    expect(diagnostics.files.prices.badFields).toBe(0);
    expect(diagnostics.files.locations.lines).toBe(SAMPLE_LOCATIONS.length);
    expect(diagnostics.files.products.lines).toBe(SAMPLE_PRODUCTS.length);
    // Aucune clé n'a 3 relevés dans l'extrait.
    expect(diagnostics.usable).toEqual({ category: 0, product: 0 });
  });

  it("estime le menu du test 7.1 : Open Prices d'abord, l'INSEE pour le chou-fleur", async () => {
    const { summary } = await build(SAMPLE);
    const { table } = buildInseeTable({
      data: parseInseeData(
        readFileSync(new URL("./fixtures/insee-sample.csv", import.meta.url), "utf8"),
      ),
      labels: parseInseeLabels(
        readFileSync(new URL("./fixtures/insee-metadata-sample.csv", import.meta.url), "utf8"),
      ),
      map: [
        { series: "8948", key: "fresh|carotte", unit: "kg" },
        { series: "8955", key: "fresh|tomate", unit: "kg" },
        { series: "3838", key: "fresh|chou-fleur", unit: "piece" },
      ],
    });
    const item = (
      name: string,
      qty: number,
      over: Partial<MenuIngredient> = {},
    ): MenuIngredient => ({
      name,
      qty,
      unit: "g",
      form: "fresh",
      category: null,
      sameDay: false,
      ...over,
    });
    const menu: Menu = {
      dishes: [
        [item("carotte", 600), item("tomate", 400)],
        [item("chou-fleur", 1, { unit: "piece" }), item("lait", 500, { unit: "ml" })],
        [item("huile d'olive", 30, { unit: "ml" })],
      ].map((ingredients, i) => ({
        name: `Plat ${i}`,
        day: (["mon", "tue", "wed"] as const)[i]!,
        ingredients,
        phases: [],
      })),
    };
    const lookups = [openPricesLookup(summary, 1), inseeLookup(table)];
    const cost = menuCost(menu, index, lookups);
    const line = (key: string) => cost.lines.find((candidate) => candidate.key === key)!;
    expect(line("fresh|carotte").parts[0]?.price?.source).toMatchObject({ kind: "open-prices" });
    expect(line("fresh|carotte").euros).toBeCloseTo(0.6 * 2.49, 10);
    expect(line("fresh|lait").parts[0]?.price?.source.kind).toBe("open-prices");
    expect(line("fresh|lait").euros).toBeCloseTo(0.5 * 1.05, 10);
    expect(line("fresh|chou-fleur").parts[0]?.price?.source).toEqual({
      kind: "insee",
      month: "2026-10",
    });
    expect(cost.sources).toEqual(["open-prices", "insee"]);
  });
});

describe("un filtre, un test, une seule variation (relevé CATEGORY de la carotte 364979)", () => {
  async function carrotRetained(patch: Row, locations: readonly Row[] = SAMPLE_LOCATIONS) {
    const { retained } = await build({
      locations,
      prices: [{ ...row(364979), ...patch }],
      products: [],
    });
    return keysOf(retained).includes("fresh|carotte|kg");
  }

  it("la base est retenue", async () => {
    expect(await carrotRetained({})).toBe(true);
  });
  it("date : veille de la fenêtre écartée, premier jour, jour même gardés, lendemain écarté, nulle écartée", async () => {
    expect(await carrotRetained({ date: "2026-05-19" })).toBe(false);
    expect(await carrotRetained({ date: "2026-05-20" })).toBe(true);
    expect(await carrotRetained({ date: "2026-11-20" })).toBe(true);
    expect(await carrotRetained({ date: "2026-11-21" })).toBe(false);
    expect(await carrotRetained({ date: null })).toBe(false);
    expect(await carrotRetained({ date: "2026-06-31" })).toBe(false);
  });
  it("devise : CHF, XPF et nulle écartées", async () => {
    for (const currency of ["CHF", "XPF", null]) {
      expect(await carrotRetained({ currency }), String(currency)).toBe(false);
    }
  });
  it("doublon écarté", async () => {
    expect(await carrotRetained({ duplicate_of: 364980 })).toBe(false);
  });
  it("promotion : sans prix d'origine écartée, avec prix d'origine gardée à ce prix", async () => {
    expect(await carrotRetained({ price_is_discounted: true })).toBe(false);
    const { retained } = await build({
      locations: SAMPLE_LOCATIONS,
      prices: [{ ...row(364979), price_is_discounted: true, price_without_discount: "2.990" }],
      products: [],
    });
    expect(retained.map((price) => price.euros)).toEqual([2.99]);
  });
  it("prix : zéro, texte illisible et nombre JSON écartés (le nombre est compté illisible)", async () => {
    expect(await carrotRetained({ price: "0" })).toBe(false);
    expect(await carrotRetained({ price: "abc" })).toBe(false);
    expect(await carrotRetained({ price: "-2.000" })).toBe(false);
    expect(await carrotRetained({ price: 2.49 })).toBe(false);
    const { diagnostics } = await build({
      locations: SAMPLE_LOCATIONS,
      prices: [{ ...row(364979), price: 2.49 }],
      products: [],
    });
    expect(diagnostics.files.prices.badFields).toBe(1);
  });
  it("lieu : outre-mer, sans code postal, étranger, sans pays ou nul écartés", async () => {
    const places: Row[] = [
      { id: 9001, osm_address_country_code: "FR", osm_address_postcode: "97200" },
      { id: 9002, osm_address_country_code: "FR", osm_address_postcode: "98714" },
      { id: 9003, osm_address_country_code: "FR", osm_address_postcode: null },
      { id: 9004, osm_address_country_code: "FR", osm_address_postcode: "  " },
      { id: 9005, osm_address_country_code: "DE", osm_address_postcode: "55126" },
      { id: 9006, osm_address_country_code: null, osm_address_postcode: null },
      { id: 9007, osm_address_country_code: "FR", osm_address_postcode: "75008" },
    ];
    const locations = [...SAMPLE_LOCATIONS, ...places];
    for (const location_id of [9001, 9002, 9003, 9004, 9005, 9006, null, 424242]) {
      expect(await carrotRetained({ location_id }, locations), String(location_id)).toBe(false);
    }
    expect(await carrotRetained({ location_id: 9007 }, locations)).toBe(true);
  });
  it("unité : `UNIT` écartée pour la carotte, gardée en pièce pour le citron", async () => {
    expect(await carrotRetained({ price_per: "UNIT" })).toBe(false);
    const liter = await build({
      locations: SAMPLE_LOCATIONS,
      prices: [{ ...row(364979), price_per: "LITER" }],
      products: [],
    });
    expect(keysOf(liter.retained)).toEqual(["fresh|carotte|l"]);
    const { retained } = await build({
      locations: SAMPLE_LOCATIONS,
      prices: [{ ...row(364979), category_tag: "en:lemons", price_per: "UNIT", price: "0.590" }],
      products: [],
    });
    expect(keysOf(retained)).toEqual(["fresh|citron|piece"]);
  });
  it("étiquette inconnue écartée", async () => {
    expect(await carrotRetained({ category_tag: "en:bananas" })).toBe(false);
  });
});

describe("un filtre, un test, une seule variation (relevé PRODUCT du beurre 361674)", () => {
  async function butterRetained(
    patch: Row = {},
    productPatch: Row = {},
    categories?: readonly string[],
  ) {
    const base = product(348685);
    const { retained } = await build({
      locations: SAMPLE_LOCATIONS,
      prices: [{ ...row(361674), ...patch }],
      products: [
        {
          ...base,
          ...productPatch,
          ...(categories === undefined ? {} : { categories_tags: categories }),
        },
      ],
    });
    return keysOf(retained).includes("fresh|beurre|kg") ? retained : [];
  }

  it("la base est retenue à 14,40 €/kg", async () => {
    const retained = await butterRetained();
    expect(retained.map((price) => price.euros)).toEqual([1.8 / 0.125]);
    expect(retained[0]).toMatchObject({
      kind: "product",
      productId: 348685,
      productQuantity: 125,
      productQuantityUnit: "g",
    });
  });
  it("poids : 0, nul, unité `%`, unité nulle ou décimal écartés", async () => {
    expect(await butterRetained({}, { product_quantity: 0 })).toEqual([]);
    expect(await butterRetained({}, { product_quantity: null })).toEqual([]);
    expect(await butterRetained({}, { product_quantity_unit: "%" })).toEqual([]);
    expect(await butterRetained({}, { product_quantity_unit: null })).toEqual([]);
    expect(await butterRetained({}, { product_quantity: 12.5 })).toEqual([]);
  });
  it("une unité en `ml` ne convient pas au beurre mais donne un prix au litre au lait", async () => {
    expect(await butterRetained({}, { product_quantity_unit: "ml" })).toEqual([]);
    const { retained } = await build({
      locations: SAMPLE_LOCATIONS,
      prices: [row(362634)],
      products: [product(310109)],
    });
    expect(keysOf(retained)).toEqual(["fresh|lait|l"]);
  });
  it("sans `product_id`, le relevé est joint par le code-barres", async () => {
    const retained = await butterRetained({ product_id: null });
    expect(retained).toHaveLength(1);
    expect(retained[0]?.productId).toBe(348685);
  });
  it("sans `product_id` ni code, le relevé est écarté", async () => {
    expect(await butterRetained({ product_id: null, product_code: null })).toEqual([]);
  });
  it("une exclusion globale (`en:meals`) l'écarte", async () => {
    const base = product(348685);
    const categories = [...(base["categories_tags"] as string[]), "en:meals"];
    expect(await butterRetained({}, {}, categories)).toEqual([]);
  });
  it("un produit sans fiche dans `products` ne donne rien", async () => {
    const { retained, summary } = await build({
      locations: SAMPLE_LOCATIONS,
      prices: [row(361674)],
      products: [],
    });
    expect(retained).toEqual([]);
    expect(summary.prices).toEqual({});
  });
  it("une fiche produit en double ne compte le relevé qu'une fois", async () => {
    const { retained } = await build({
      locations: SAMPLE_LOCATIONS,
      prices: [row(361674)],
      products: [product(348685), product(348685)],
    });
    expect(retained).toHaveLength(1);
  });
});

describe("les cinq contrôles de la carte (lait synthétique d'un litre)", () => {
  const milk: Row = {
    id: 777001,
    code: "0000000777001",
    product_name: "Lait demi-écrémé",
    product_quantity: 1000,
    product_quantity_unit: "ml",
    categories_tags: ["en:dairies", "en:milks"],
  };
  const sale: Row = {
    ...row(362634),
    id: 999001,
    product_id: 777001,
    product_code: "0000000777001",
  };
  async function keysFor(patch: Row, creams: Row[] = []) {
    const { retained } = await build({
      locations: SAMPLE_LOCATIONS,
      prices: [sale],
      products: [{ ...milk, ...patch }, ...creams],
    });
    return keysOf(retained);
  }

  it("la base est retenue en lait", async () => {
    expect(await keysFor({})).toEqual(["fresh|lait|l"]);
  });
  it("catégorie absente → écarté", async () => {
    expect(await keysFor({ categories_tags: ["en:dairies"] })).toEqual([]);
    expect(await keysFor({ categories_tags: null })).toEqual([]);
  });
  it("`en:infant-formulas` ajouté → écarté", async () => {
    expect(await keysFor({ categories_tags: ["en:milks", "en:infant-formulas"] })).toEqual([]);
  });
  it("unité `g` → écarté", async () => {
    expect(await keysFor({ product_quantity_unit: "g" })).toEqual([]);
  });
  it("nom sans `lait` → écarté", async () => {
    expect(await keysFor({ product_name: "Boisson lactée" })).toEqual([]);
  });
  it("nom vide ou nul → écarté", async () => {
    expect(await keysFor({ product_name: "" })).toEqual([]);
    expect(await keysFor({ product_name: null })).toEqual([]);
    expect(await keysFor({ product_name: "   " })).toEqual([]);
  });
  it("mot interdit de l'entrée (`coco`) → écarté", async () => {
    expect(await keysFor({ product_name: "Lait de coco" })).toEqual([]);
  });
  it("mot interdit global (`chocolat`) → écarté", async () => {
    expect(await keysFor({ product_name: "Lait au chocolat" })).toEqual([]);
  });
  it("un mot est un mot entier : « laitue » n'est pas « lait »", async () => {
    expect(await keysFor({ product_name: "Laitue du jardin" })).toEqual([]);
  });
  it("normalisation : majuscules et accents", async () => {
    expect(await keysFor({ product_name: "LAIT Demi-Écrémé" })).toEqual(["fresh|lait|l"]);
  });
  it("une entrée qui contient une espace se cherche comme suite de mots (`sans gluten`)", async () => {
    const pasta = {
      id: 777002,
      code: "0000000777002",
      product_name: "Spaghetti sans gluten",
      product_quantity: 500,
      product_quantity_unit: "g",
      categories_tags: ["en:dry-pastas"],
    };
    const sold = { ...sale, id: 999002, product_id: 777002, product_code: "0000000777002" };
    const run = async (name: string) =>
      keysOf(
        (
          await build({
            locations: SAMPLE_LOCATIONS,
            prices: [sold],
            products: [{ ...pasta, product_name: name }],
          })
        ).retained,
      );
    expect(await run("Spaghetti sans gluten")).toEqual([]);
    expect(await run("Spaghetti sans sel et gluten")).toEqual(["dry|pâtes|kg"]);
  });
  it("une crème fleurette étiquetée `en:cremes-fraiches` va à la crème liquide", async () => {
    const cream: Row = {
      id: 777003,
      code: "0000000777003",
      product_name: "Crème Fleurette",
      product_quantity: 250,
      product_quantity_unit: "ml",
      categories_tags: ["en:creams", "en:cremes-fraiches"],
    };
    const sold = {
      ...sale,
      id: 999003,
      product_id: 777003,
      product_code: "0000000777003",
      price: "1.800",
    };
    const { retained } = await build({
      locations: SAMPLE_LOCATIONS,
      prices: [sold],
      products: [cream],
    });
    expect(keysOf(retained)).toEqual(["fresh|crème liquide|l"]);
    expect(retained[0]?.euros).toBeCloseTo(7.2, 10);
  });
});

describe("contre-exemples de la carte", () => {
  async function keysOfProduct(name: string, categories: string[], unit: "g" | "ml" = "g") {
    const { retained } = await build({
      locations: SAMPLE_LOCATIONS,
      prices: [{ ...row(362634), id: 999100, product_id: 888001, product_code: "0000000888001" }],
      products: [
        {
          id: 888001,
          code: "0000000888001",
          product_name: name,
          product_quantity: 500,
          product_quantity_unit: unit,
          categories_tags: categories,
        },
      ],
    });
    return keysOf(retained);
  }

  it("fromage râpé générique ou parmesan : aucune clé ; emmental râpé : sa clé", async () => {
    expect(
      await keysOfProduct("Parmesan râpé", ["en:grated-cheese", "en:parmigiano-reggiano"]),
    ).toEqual([]);
    expect(
      await keysOfProduct("Emmental râpé", ["en:grated-cheese", "en:grated-emmentaler"]),
    ).toEqual(["fresh|emmental râpé|kg"]);
  });
  it("poulet : cordon bleu et tranches cuites écartés, filet gardé", async () => {
    expect(
      await keysOfProduct("Cordon bleu de poulet", ["en:chickens", "en:cordons-bleus"]),
    ).toEqual([]);
    expect(
      await keysOfProduct("Filet de poulet", [
        "en:chicken-breasts",
        "en:cooked-chicken-breast-slices",
      ]),
    ).toEqual([]);
    expect(await keysOfProduct("Filet de poulet", ["en:chicken-breasts"])).toEqual([
      "fresh|blanc de poulet|kg",
    ]);
  });
  it("pâtes : complètes par le nom, ordinaires sinon", async () => {
    expect(
      await keysOfProduct("Spaghetti blé complet", ["en:dry-pastas", "en:whole-durum-wheat-pasta"]),
    ).toEqual(["dry|pâtes complètes|kg"]);
    expect(await keysOfProduct("Spaghetti", ["en:dry-pastas"])).toEqual(["dry|pâtes|kg"]);
  });
  it("crème en liqueur : écartée", async () => {
    expect(
      await keysOfProduct(
        "Crème de whisky liquide",
        ["en:creams", "en:liqueurs", "en:alcoholic-beverages"],
        "ml",
      ),
    ).toEqual([]);
  });
  it("œufs de caille : écartés", async () => {
    expect(await keysOfProduct("12 œufs de caille", ["en:eggs", "en:quail-eggs"])).toEqual([]);
  });
});

describe("flux", () => {
  it("la même entrée découpée en morceaux de 1 et de 7 octets donne le même résumé", async () => {
    const whole = await build(SAMPLE);
    for (const size of [1, 7]) {
      const chopped = await build(SAMPLE, {}, size);
      expect(chopped.summary).toEqual(whole.summary);
      expect(chopped.diagnostics).toEqual(whole.diagnostics);
    }
  });

  it("lit un caractère UTF-8 coupé en deux entre deux morceaux décompressés", async () => {
    // Un gzip vidé (`Z_SYNC_FLUSH`) entre les deux moitiés du « é » : le décompresseur rend deux morceaux, le premier
    // finit par l'octet 0xC3.
    const gz = createGzip();
    const compressed: Uint8Array<ArrayBuffer>[] = [];
    gz.on("data", (chunk: Buffer) => compressed.push(new Uint8Array(chunk)));
    for (const part of [
      Buffer.concat([Buffer.from('{"a":"'), Buffer.from([0xc3])]),
      Buffer.concat([Buffer.from([0xa9]), Buffer.from('"}\n{"b":2}')]),
    ]) {
      gz.write(part);
      await new Promise<void>((done) => gz.flush(constants.Z_SYNC_FLUSH, () => done()));
    }
    gz.end();
    await once(gz, "end");
    const source = (): ReadableStream<Uint8Array<ArrayBuffer>> =>
      new ReadableStream<Uint8Array<ArrayBuffer>>({
        pull(controller) {
          const next = compressed.shift();
          if (next === undefined) controller.close();
          else controller.enqueue(next);
        },
      });
    const queue = [...compressed];
    const pieces: Uint8Array[] = [];
    const reader = source().pipeThrough(new DecompressionStream("gzip")).getReader();
    for (let read = await reader.read(); !read.done; read = await reader.read()) {
      pieces.push(read.value);
    }
    expect(pieces.length).toBeGreaterThan(1);
    expect(pieces[0]?.at(-1)).toBe(0xc3);
    compressed.push(...queue);
    const lines: string[] = [];
    for await (const line of readGzipLines(source(), "prices")) lines.push(line);
    expect(lines).toEqual(['{"a":"é"}', '{"b":2}']);
  });

  it("rend la dernière ligne sans `\\n` et les lignes vides (l'appelant les compte puis les saute)", async () => {
    const lines: string[] = [];
    for await (const line of readGzipLines(streamOf(gzip("a\n\nb\n\n\nc")), "prices")) {
      lines.push(line);
    }
    expect(lines).toEqual(["a", "", "b", "", "", "c"]);
  });

  it("un UTF-8 invalide donne la phrase du fichier", async () => {
    const bytes = new Uint8Array(gzipSync(Buffer.from([0x61, 0xff, 0x0a, 0x62])));
    await expect(async () => {
      for await (const line of readGzipLines(streamOf(bytes), "products")) void line;
    }).rejects.toThrow("Fichier Open Prices illisible : products.");
  });

  const message = "Fichier Open Prices illisible : prices.";
  it("un gzip tronqué donne la phrase du fichier", async () => {
    const bytes = gzip(toLines(SAMPLE_PRICES));
    await expect(
      build({ ...SAMPLE }, { prices: streamOf(bytes.slice(0, bytes.length - 12)) }),
    ).rejects.toThrow(message);
  });
  it("un CRC modifié donne la même phrase", async () => {
    const bytes = gzip(toLines(SAMPLE_PRICES));
    bytes[bytes.length - 8] = (bytes[bytes.length - 8]! + 1) % 256;
    await expect(build({ ...SAMPLE }, { prices: streamOf(bytes) })).rejects.toThrow(message);
  });
  it("une source qui lève au troisième morceau donne la même phrase, tout de suite", async () => {
    const bytes = gzip(toLines(SAMPLE_PRICES));
    let pulls = 0;
    const failing = new ReadableStream<Uint8Array<ArrayBuffer>>({
      pull(controller) {
        pulls += 1;
        if (pulls === 3) controller.error(new Error("disque débranché"));
        else controller.enqueue(bytes.slice((pulls - 1) * 50, pulls * 50));
      },
    });
    await expect(build({ ...SAMPLE }, { prices: failing })).rejects.toThrow(message);
    expect(pulls).toBe(3);
  });

  it("une ligne `null`, `[]`, `42` ou JSON cassé est comptée illisible", async () => {
    const { diagnostics, summary } = await build({
      ...SAMPLE,
      prices: ["null", "[]", "42", '{"type":', ...SAMPLE_PRICES],
    });
    expect(diagnostics.files.prices.unreadable).toBe(4);
    expect(diagnostics.files.prices.lines).toBe(SAMPLE_PRICES.length + 4);
    expect(summary.prices["fresh|carotte"]?.kg?.count).toBe(1);
  });
  it("un champ mal typé est compté, la ligne est ignorée", async () => {
    const bad: Row[] = [
      { ...row(364979), id: "364979" },
      { ...row(364979), type: 3 },
      { ...row(364979), date: 20261116 },
      { ...row(364979), location_id: "7993" },
      { ...row(364979), price_is_discounted: "oui" },
      { ...row(364979), duplicate_of: "1" },
    ];
    const { diagnostics, retained } = await build({ ...SAMPLE, prices: bad });
    expect(diagnostics.files.prices.badFields).toBe(6);
    expect(retained).toEqual([]);
    const places = await build({
      ...SAMPLE,
      locations: [
        { id: "x", osm_address_country_code: "FR", osm_address_postcode: "75008" },
        { id: 1, osm_address_country_code: 3, osm_address_postcode: "75008" },
      ],
      prices: [],
    });
    expect(places.diagnostics.files.locations.badFields).toBe(2);
    const products = await build({
      ...SAMPLE,
      prices: [],
      products: [
        { id: 1, product_name: 3 },
        { id: 2, categories_tags: [1] },
        { id: 3, product_quantity: "500" },
        { id: 4, code: 5 },
        { id: 5, product_quantity_unit: 1 },
        { id: 6 },
      ],
    });
    expect(products.diagnostics.files.products.badFields).toBe(5);
  });

  it("une ligne de plus de 1 Mio donne la phrase exacte", async () => {
    const huge = gzip(`${"a".repeat(1024 * 1024 + 1)}\nb`);
    await expect(async () => {
      for await (const line of readGzipLines(streamOf(huge, 4096), "prices")) void line;
    }).rejects.toThrow(LINE_TOO_LONG_MESSAGE);
    expect(LINE_TOO_LONG_MESSAGE).toBe("Fichier Open Prices illisible : ligne trop longue.");
  });
  it("une ligne de 1 Mio exactement passe", async () => {
    const edge = gzip(`${"a".repeat(1024 * 1024)}\nb`);
    const lines: string[] = [];
    for await (const line of readGzipLines(streamOf(edge, 4096), "prices")) {
      lines.push(line.length === 1 ? line : "longue");
    }
    expect(lines).toEqual(["longue", "b"]);
  });
  it("un fichier trop gros une fois décompressé donne la phrase exacte (limite réduite)", async () => {
    await expect(build({ ...SAMPLE }, { limits: { maxUncompressedBytes: 100 } })).rejects.toThrow(
      TOO_BIG_UNCOMPRESSED_MESSAGE,
    );
    expect(TOO_BIG_UNCOMPRESSED_MESSAGE).toBe(
      "Fichier Open Prices illisible : trop gros une fois décompressé.",
    );
  });
  it("une borne de mémoire dépassée donne la phrase exacte (bornes réduites)", async () => {
    expect(TOO_MANY_MESSAGE).toBe("Fichiers Open Prices trop volumineux : résumé abandonné.");
    for (const limits of [
      { maxLines: 3 },
      { maxLocations: 2 },
      { maxCandidates: 1 },
      { maxValues: 3 },
    ]) {
      await expect(build({ ...SAMPLE }, { limits }), JSON.stringify(limits)).rejects.toThrow(
        TOO_MANY_MESSAGE,
      );
    }
  });
  it("rend la main toutes les 2 000 lignes", async () => {
    const filler = Array.from({ length: 4500 }, (_, i) => ({
      ...row(364979),
      id: 5_000_000 + i,
      date: "2020-01-01",
    }));
    let pauses = 0;
    await build(
      { ...SAMPLE, prices: filler },
      {
        pause: () => {
          pauses += 1;
          return Promise.resolve();
        },
      },
    );
    expect(pauses).toBe(2);
  });
});

// Un jeu synthétique : 3 relevés à chacune de 7 clés produit et de 7 clés de catégorie, plus des lignes de remplissage
// hors fenêtre (contre-exemple de Codex).
function syntheticFiles(fillers: number): Files {
  const places: Row[] = [{ id: 1, osm_address_country_code: "FR", osm_address_postcode: "75008" }];
  const productKeys: [string, string[], string, "g" | "ml"][] = [
    ["Lait demi-écrémé", ["en:milks"], "000001", "ml"],
    ["Beurre doux", ["en:butters"], "000002", "g"],
    ["Spaghetti", ["en:dry-pastas"], "000003", "g"],
    ["Riz basmati", ["en:basmati-rices"], "000004", "g"],
    ["Lentilles vertes", ["en:green-lentils"], "000005", "g"],
    ["Emmental râpé", ["en:grated-emmentaler"], "000006", "g"],
    ["Steak haché", ["en:ground-beef-steaks"], "000007", "g"],
  ];
  const tags = [
    "en:carrots",
    "en:tomatoes",
    "en:zucchini",
    "en:leeks",
    "en:apples",
    "en:yellow-onions",
    "en:garlic",
  ];
  const products: Row[] = productKeys.map(([name, categories, code, unit], i) => ({
    id: 100 + i,
    code,
    product_name: name,
    product_quantity: 1000,
    product_quantity_unit: unit,
    categories_tags: categories,
  }));
  const base = {
    location_id: 1,
    currency: "EUR",
    date: "2026-10-01",
    price_is_discounted: false,
    duplicate_of: null,
  };
  let id = 1;
  const prices: Row[] = [];
  for (let n = 0; n < 3; n += 1) {
    productKeys.forEach(([, , code], i) => {
      prices.push({
        ...base,
        id: id++,
        type: "PRODUCT",
        price: "2.000",
        product_id: 100 + i,
        product_code: code,
      });
    });
    for (const tag of tags) {
      prices.push({
        ...base,
        id: id++,
        type: "CATEGORY",
        price: "3.000",
        category_tag: tag,
        price_per: "KILOGRAM",
      });
    }
  }
  for (let n = 0; n < fillers; n += 1) {
    prices.push({
      ...base,
      id: id++,
      type: "CATEGORY",
      price: "3.000",
      category_tag: "en:carrots",
      price_per: "KILOGRAM",
      date: "2020-01-01",
    });
  }
  return { locations: places, prices, products };
}

function diagnosticsOf(
  overrides: Partial<Diagnostics["files"]> = {},
  usable = { category: 20, product: 20 },
): Diagnostics {
  const clean = { lines: 10_000, unreadable: 0, badFields: 0 };
  return {
    files: { locations: clean, prices: clean, products: clean, ...overrides },
    usable,
  };
}
function summaryOf(usable: { category: number; product: number }): OpenPricesSummary {
  return { version: 1, fetchedAt: TODAY, from: "2026-05-20", to: TODAY, usable, prices: {} };
}

describe("acceptSummary", () => {
  it("refuse plus de 0,1 % de lignes illisibles, accepte moins (0,11 % contre 0,09 %)", () => {
    const next = summaryOf({ category: 20, product: 20 });
    expect(
      acceptSummary(
        next,
        diagnosticsOf({ prices: { lines: 10_000, unreadable: 6, badFields: 5 } }),
        null,
      ),
    ).toBe("Résumé Open Prices refusé : prices a 0,11 % de lignes illisibles (format changé ?).");
    expect(
      acceptSummary(
        next,
        diagnosticsOf({ prices: { lines: 10_000, unreadable: 4, badFields: 5 } }),
        null,
      ),
    ).toBeNull();
  });
  it("refuse selon le fichier, dans l'ordre des fichiers, pour les champs mal typés aussi", () => {
    const next = summaryOf({ category: 20, product: 20 });
    expect(
      acceptSummary(
        next,
        diagnosticsOf({ products: { lines: 1000, unreadable: 0, badFields: 50 } }),
        null,
      ),
    ).toBe("Résumé Open Prices refusé : products a 5,00 % de lignes illisibles (format changé ?).");
  });
  it("refuse trop peu de clés produit ou de catégorie, avec les nombres", () => {
    expect(
      acceptSummary(
        summaryOf({ category: 20, product: MIN_PRODUCT_KEYS - 1 }),
        diagnosticsOf(),
        null,
      ),
    ).toBe(
      `Résumé Open Prices refusé : seulement ${MIN_PRODUCT_KEYS - 1} produits à code-barres ont assez de relevés.`,
    );
    expect(
      acceptSummary(
        summaryOf({ category: MIN_CATEGORY_KEYS - 1, product: 20 }),
        diagnosticsOf(),
        null,
      ),
    ).toBe(
      `Résumé Open Prices refusé : seulement ${MIN_CATEGORY_KEYS - 1} fruits et légumes ont assez de relevés.`,
    );
  });
  it("accepte quand les minimums sont atteints, sans résumé précédent", () => {
    expect(
      acceptSummary(
        summaryOf({ category: MIN_CATEGORY_KEYS, product: MIN_PRODUCT_KEYS }),
        diagnosticsOf(),
        null,
      ),
    ).toBeNull();
  });
  it("refuse une chute de plus de moitié contre la semaine précédente, pour l'un des deux types", () => {
    const previous = summaryOf({ category: 20, product: 20 });
    expect(acceptSummary(summaryOf({ category: 20, product: 8 }), diagnosticsOf(), previous)).toBe(
      "Résumé Open Prices refusé : 8 produits à code-barres avec assez de relevés, contre 20 la semaine précédente.",
    );
    expect(
      acceptSummary(summaryOf({ category: 20, product: 10 }), diagnosticsOf(), previous),
    ).toBeNull();
    expect(acceptSummary(summaryOf({ category: 9, product: 20 }), diagnosticsOf(), previous)).toBe(
      "Résumé Open Prices refusé : 9 fruits et légumes avec assez de relevés, contre 20 la semaine précédente.",
    );
  });
  it("les minimums sont ceux de la conception, écrits dans le code", () => {
    expect(MIN_OPEN_PRICES_COUNT).toBe(3);
    expect(MIN_PRODUCT_KEYS).toBeGreaterThan(0);
    expect(MIN_CATEGORY_KEYS).toBeGreaterThan(0);
  });

  it("contre-exemple de Codex : témoin accepté, puis `price` des relevés PRODUCT devenu un nombre → refus par le taux", async () => {
    const files = syntheticFiles(2000);
    const witness = await build(files);
    expect(witness.diagnostics.usable).toEqual({ category: 7, product: 7 });
    expect(acceptSummary(witness.summary, witness.diagnostics, null)).toBeNull();

    const mutated: Files = {
      ...files,
      prices: files.prices.map((candidate) => {
        const price = candidate as Row;
        return price["type"] === "PRODUCT" ? { ...price, price: 2 } : price;
      }),
    };
    const broken = await build(mutated);
    expect(broken.diagnostics.files.prices.badFields).toBe(21);
    expect(broken.diagnostics.usable.product).toBe(0);
    expect(acceptSummary(broken.summary, broken.diagnostics, null)).toMatch(
      /^Résumé Open Prices refusé : prices a \d,\d{2} % de lignes illisibles \(format changé \?\)\.$/,
    );
  });
});

describe("résumé : schéma, sérialisation, lecture", () => {
  const stat = { median: 2.5, count: 4, first: "2026-06-01", last: "2026-11-10" };
  const summary: OpenPricesSummary = {
    version: 1,
    fetchedAt: TODAY,
    from: "2026-05-20",
    to: TODAY,
    usable: { category: 14, product: 14 },
    prices: { "fresh|carotte": { kg: stat }, "fresh|lait": { l: { ...stat, median: 1.68 } } },
  };

  it("fait l'aller-retour", () => {
    expect(readOpenPricesSummary(serializeOpenPricesSummary(summary))).toEqual(summary);
  });
  it("lit sans jamais lever : rien, JSON cassé, version inconnue, date fausse, médiane nulle → null", () => {
    expect(readOpenPricesSummary(null)).toBeNull();
    expect(readOpenPricesSummary("")).toBeNull();
    expect(readOpenPricesSummary("{")).toBeNull();
    expect(readOpenPricesSummary("[]")).toBeNull();
    expect(readOpenPricesSummary(JSON.stringify({ ...summary, version: 2 }))).toBeNull();
    expect(
      readOpenPricesSummary(JSON.stringify({ ...summary, fetchedAt: "2026-02-30" })),
    ).toBeNull();
    expect(
      readOpenPricesSummary(
        JSON.stringify({ ...summary, prices: { "fresh|lait": { l: { ...stat, median: 0 } } } }),
      ),
    ).toBeNull();
    expect(
      readOpenPricesSummary(
        JSON.stringify({ ...summary, prices: { "fresh|lait": { l: { ...stat, count: 1.5 } } } }),
      ),
    ).toBeNull();
    expect(readOpenPricesSummary(JSON.stringify({ ...summary, usable: undefined }))).toBeNull();
  });
  it("refuse de sérialiser un résumé de plus de 512 Kio, avec la phrase exacte", () => {
    const prices: OpenPricesSummary["prices"] = {};
    for (let i = 0; i < 20_000; i += 1) prices[`fresh|produit numéro ${i}`] = { kg: stat };
    expect(() => serializeOpenPricesSummary({ ...summary, prices })).toThrow(
      SUMMARY_TOO_BIG_MESSAGE,
    );
    expect(SUMMARY_TOO_BIG_MESSAGE).toBe(
      "Résumé Open Prices trop volumineux : enregistrement abandonné.",
    );
  });
  it("MAX_SUMMARY_BYTES est le même qu'en Rust (open_prices.rs)", () => {
    const source = readFileSync(
      new URL("../../../../apps/desktop/src-tauri/src/open_prices.rs", import.meta.url),
      "utf8",
    );
    const rust = /const MAX_SUMMARY_BYTES: usize = ([\d* ]+);/.exec(source);
    expect(rust).not.toBeNull();
    expect(rust![1]!.split("*").reduce((product, part) => product * Number(part.trim()), 1)).toBe(
      MAX_SUMMARY_BYTES,
    );
  });
  it("les messages du schéma sont en français", () => {
    const broken: Record<string, unknown> = {
      "pas un objet": 3,
      version: { ...summary, version: "1" },
      date: { ...summary, to: 3 },
      usable: { ...summary, usable: { category: "x", product: 1 } },
      prices: { ...summary, prices: 3 },
      statistique: { ...summary, prices: { "fresh|lait": { l: 3 } } },
      médiane: { ...summary, prices: { "fresh|lait": { l: { ...stat, median: "x" } } } },
    };
    for (const [name, value] of Object.entries(broken)) {
      const result = OpenPricesSummarySchema.safeParse(value);
      expect(result.success, name).toBe(false);
      if (result.success) continue;
      for (const issue of result.error.issues) {
        expect(issue.message, name).not.toMatch(/Invalid|expected|Required|received/i);
        expect(issue.message.trim(), name).not.toBe("");
      }
    }
  });
});

describe("openPricesLookup", () => {
  const summary: OpenPricesSummary = {
    version: 1,
    fetchedAt: TODAY,
    from: "2026-05-20",
    to: TODAY,
    usable: { category: 14, product: 14 },
    prices: {
      "fresh|lait": { l: { median: 1.68, count: 3, first: "2026-06-01", last: "2026-11-10" } },
      "fresh|carotte": { kg: { median: 2.09, count: 2, first: "2026-06-01", last: "2026-11-10" } },
    },
  };
  it("rend le prix à partir de 3 relevés, avec sa source", () => {
    expect(openPricesLookup(summary).find("fresh|lait", "l")).toEqual({
      unit: "l",
      euros: 1.68,
      source: { kind: "open-prices", count: 3, first: "2026-06-01", last: "2026-11-10" },
    });
  });
  it("rend null sous le minimum, pour une autre unité, une autre clé ou une clé du prototype", () => {
    const lookup = openPricesLookup(summary);
    expect(lookup.find("fresh|carotte", "kg")).toBeNull();
    expect(lookup.find("fresh|lait", "kg")).toBeNull();
    expect(lookup.find("dry|lait", "l")).toBeNull();
    for (const key of ["__proto__", "constructor", "toString"]) {
      expect(lookup.find(key, "kg"), key).toBeNull();
    }
  });
  it("le minimum se règle (1 pour l'extrait de test)", () => {
    expect(openPricesLookup(summary, 1).find("fresh|carotte", "kg")?.euros).toBe(2.09);
  });
});

describe("openPricesDue", () => {
  const at = (fetchedAt: string): OpenPricesSummary => ({
    version: 1,
    fetchedAt,
    from: "2026-05-20",
    to: fetchedAt,
    usable: { category: 14, product: 14 },
    prices: {},
  });
  it("aucun résumé et aucun essai : dû", () => {
    expect(openPricesDue({ attemptedAt: null, summary: null }, TODAY)).toBe(true);
  });
  it("essai aujourd'hui : jamais dû", () => {
    expect(openPricesDue({ attemptedAt: TODAY, summary: null }, TODAY)).toBe(false);
    expect(openPricesDue({ attemptedAt: TODAY, summary: at("2026-01-01") }, TODAY)).toBe(false);
  });
  it("résumé de 6 jours : pas dû ; de 7 jours : dû", () => {
    expect(openPricesDue({ attemptedAt: "2026-11-19", summary: at("2026-11-14") }, TODAY)).toBe(
      false,
    );
    expect(openPricesDue({ attemptedAt: "2026-11-19", summary: at("2026-11-13") }, TODAY)).toBe(
      true,
    );
  });
  it("essai d'hier sans résumé : dû", () => {
    expect(openPricesDue({ attemptedAt: "2026-11-19", summary: null }, TODAY)).toBe(true);
  });
});

describe("corrections du cycle 1", () => {
  const sale = (over: Row): Row => ({ ...row(362634), id: 999500, ...over });
  const milk = (over: Row = {}): Row => ({ ...product(310109), ...over });

  describe("`price_per` est un texte du fichier, jamais une clé d'objet", () => {
    it("`constructor`, `toString` et `__proto__` sont ignorés : aucune clé de catégorie utilisable, la garde refuse", async () => {
      const witness = syntheticFiles(0);
      for (const per of ["constructor", "toString", "__proto__", "hasOwnProperty"]) {
        const mutated: Files = {
          ...witness,
          prices: witness.prices.map((candidate) => {
            const price = candidate as Row;
            return price["type"] === "CATEGORY" ? { ...price, price_per: per } : price;
          }),
        };
        const { diagnostics, summary, retained } = await build(mutated);
        expect(
          retained.filter((price) => price.kind === "category"),
          per,
        ).toEqual([]);
        expect(diagnostics.usable.category, per).toBe(0);
        expect(diagnostics.usable.product, per).toBe(7);
        expect(acceptSummary(summary, diagnostics, null), per).toBe(
          "Résumé Open Prices refusé : seulement 0 fruits et légumes ont assez de relevés.",
        );
      }
    });
    it("`usable` est celui du résumé sérialisé : il survit à l'aller-retour", async () => {
      const { summary, diagnostics } = await build(syntheticFiles(0));
      const reread = readOpenPricesSummary(serializeOpenPricesSummary(summary));
      expect(reread?.usable).toEqual(diagnostics.usable);
      for (const units of Object.values(reread?.prices ?? {})) {
        for (const unit of Object.keys(units)) expect(["kg", "l", "piece"]).toContain(unit);
      }
    });
  });

  describe("lignes vides", () => {
    it("3 000 001 lignes vides dépassent le plafond de lignes", async () => {
      const empties = gzip("\n".repeat(3_000_001));
      await expect(
        buildOpenPricesSummary({
          locations: streamOf(gzip(toLines(SAMPLE_LOCATIONS))),
          prices: streamOf(empties, 1 << 20),
          products: streamOf(gzip("")),
          today: TODAY,
          pause: () => Promise.resolve(),
        }),
      ).rejects.toThrow(TOO_MANY_MESSAGE);
    });
    it("une ligne vide compte pour le plafond (`maxLines: 1`)", async () => {
      await expect(
        build({ ...SAMPLE, prices: ["", "", row(364979)] }, { limits: { maxLines: 1 } }),
      ).rejects.toThrow(TOO_MANY_MESSAGE);
    });
    it("4 001 lignes vides : deux pauses", async () => {
      let pauses = 0;
      await build(
        { ...SAMPLE, prices: Array.from({ length: 4001 }, () => "") },
        {
          pause: () => {
            pauses += 1;
            return Promise.resolve();
          },
        },
      );
      expect(pauses).toBe(2);
    });
    it("les lignes vides ne sont ni illisibles ni comptées comme lignes de données", async () => {
      const { diagnostics } = await build({ ...SAMPLE, prices: ["", row(364979), ""] });
      expect(diagnostics.files.prices).toEqual({ lines: 1, unreadable: 0, badFields: 0 });
    });
  });

  describe("candidats déjà consommés", () => {
    it("300 relevés d'un même produit et 2 000 fiches identiques : chaque relevé est retenu une fois", async () => {
      const prices = Array.from({ length: 300 }, (_, i) => ({
        ...row(361674),
        id: 700_000 + i,
      }));
      const products = Array.from({ length: 2000 }, () => product(348685));
      let calls = 0;
      const { retained } = await build(
        { ...SAMPLE, prices, products },
        {
          onRetained: () => {
            calls += 1;
          },
        },
      );
      expect(calls).toBe(300);
      expect(retained).toEqual([]);
    });
    it("une fiche répétée avec le même code-barres, sans `product_id`, ne rescanne rien", async () => {
      const prices = [{ ...row(361674), product_id: null }];
      let calls = 0;
      await build(
        { ...SAMPLE, prices, products: [product(348685), product(348685)] },
        {
          onRetained: () => {
            calls += 1;
          },
        },
      );
      expect(calls).toBe(1);
    });
  });

  describe("taille du résumé à la lecture", () => {
    it("un texte de plus de 512 Kio est « pas de résumé » avant tout JSON.parse", () => {
      const big = JSON.stringify({ version: 1, filler: "x".repeat(600_000) });
      expect(new TextEncoder().encode(big).length).toBeGreaterThan(MAX_SUMMARY_BYTES);
      expect(readOpenPricesSummary(big)).toBeNull();
    });
    it("la taille compte en octets, pas en caractères", () => {
      const accents = "é".repeat(MAX_SUMMARY_BYTES / 2 + 1);
      expect(accents.length).toBeLessThan(MAX_SUMMARY_BYTES);
      expect(readOpenPricesSummary(accents)).toBeNull();
    });
  });

  describe("paquets invraisemblables et `price_per` sur un produit", () => {
    async function milkKeys(patch: Row, saleOver: Row = {}): Promise<string[]> {
      const { retained } = await build({
        locations: SAMPLE_LOCATIONS,
        prices: [sale(saleOver)],
        products: [milk(patch)],
      });
      return keysOf(retained);
    }
    it("lait de 25 ml écarté, de 49 ml écarté, de 50 ml gardé", async () => {
      expect(await milkKeys({ product_quantity: 25 })).toEqual([]);
      expect(await milkKeys({ product_quantity: 49 })).toEqual([]);
      expect(await milkKeys({ product_quantity: 50 })).toEqual(["fresh|lait|l"]);
      expect(MIN_PACKAGE_QUANTITY).toBe(50);
    });
    it("un relevé PRODUCT avec `price_per` est hors format : écarté ; nul ou absent : gardé", async () => {
      expect(await milkKeys({}, { price_per: "KILOGRAM" })).toEqual([]);
      expect(await milkKeys({}, { price_per: "UNIT" })).toEqual([]);
      expect(await milkKeys({}, { price_per: null })).toEqual(["fresh|lait|l"]);
      const absent = sale({});
      delete absent["price_per"];
      const { retained } = await build({
        locations: SAMPLE_LOCATIONS,
        prices: [absent],
        products: [milk()],
      });
      expect(keysOf(retained)).toEqual(["fresh|lait|l"]);
    });
  });
});
