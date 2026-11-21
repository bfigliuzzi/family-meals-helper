import { createReadStream, existsSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { Readable } from "node:stream";
import { createGunzip } from "node:zlib";
import { beforeAll, describe, expect, it } from "vitest";
import { lightNormalize } from "../ingredients/normalize.ts";
import { OPEN_PRICES_FILES } from "../ports/open-prices-store.ts";
import {
  buildOpenPricesSummary,
  MIN_CATEGORY_KEYS,
  MIN_OPEN_PRICES_COUNT,
  MIN_PRODUCT_KEYS,
} from "./open-prices.ts";
import type { Diagnostics, OpenPricesSummary, RetainedPrice } from "./open-prices.ts";

// Contrôle de la carte sur les vrais fichiers du dump Open Prices (plan du lot 7, 6.3). Sauté seulement si
// `FMH_OPEN_PRICES_DIR` est absente ; avec la variable, un dossier ou un fichier manquant ou vide fait échouer le
// test. À lancer avant tout commit qui touche la carte ou `open-prices.ts` :
//   FMH_OPEN_PRICES_DIR=/tmp/fmh-op pnpm --filter core exec vitest run src/pricing/open-prices-real.test.ts
// Les fichiers téléchargés le 2026-11-20 sont lus avec ce jour comme « aujourd'hui » : le résultat ne dépend pas de la
// date du jour.
const dir = process.env["FMH_OPEN_PRICES_DIR"];
const TODAY = "2026-11-20";
const AUDIT_PATH = "/tmp/fmh-open-prices-audit.md";

// Produits connus pour être faux : leur identifiant ne doit jamais être retenu dans l'une de ces clés. `onlyIn` : le
// produit n'a le droit d'être retenu que dans cette clé (ou nulle part).
const KNOWN_WRONG: readonly {
  ids: readonly number[];
  not: readonly string[];
  onlyIn?: string;
  why: string;
}[] = [
  { ids: [526116], not: ["fresh|lait"], why: "lait infantile 800 g" },
  { ids: [1506382], not: ["fresh|lait"], why: "préparation de 8 g" },
  { ids: [2585124], not: ["fresh|lait"], why: "capsules 120 g" },
  {
    ids: [261282, 256410, 266213, 256388, 266214],
    not: ["fresh|lait"],
    why: "laits fermentés et ribot",
  },
  { ids: [2828250], not: ["dry|riz basmati"], why: "riz précuit" },
  { ids: [706264], not: ["dry|pâtes"], why: "pâtes cuites sans gluten" },
  {
    ids: [286247, 3826062, 343347, 343337, 3821490, 2989712, 343348],
    not: ["dry|pâtes"],
    onlyIn: "dry|pâtes complètes",
    why: "pâtes dont le nom dit « complet »",
  },
  { ids: [1636301, 3032279], not: ["fresh|œuf"], why: "œufs de caille" },
  { ids: [353962], not: ["fresh|blanc de poulet"], why: "émincés de poulet rôtis" },
  { ids: [2534924, 394946], not: ["fresh|bœuf haché"], why: "steaks hachés surgelés" },
  { ids: [1667337, 394237], not: ["dry|pâtes"], why: "pâtes cuites, semoule" },
  { ids: [3181500, 3181955], not: ["dry|riz basmati"], why: "doypacks aromatisés" },
  { ids: [389832], not: ["dry|riz complet"], why: "mélange avec quinoa" },
  { ids: [4424285], not: ["fresh|beurre"], why: "beurre aux pépites de chocolat" },
  {
    ids: [352210, 389623, 389526, 352256, 3644899, 369280],
    not: ["fresh|lait"],
    why: "laits de chèvre, de brebis ou de bufflonne",
  },
  {
    ids: [
      3894246, 3894247, 342787, 343335, 362266, 1455, 264265, 1547, 244010, 543400, 3826073, 559618,
    ],
    not: ["dry|pâtes"],
    why: "pâtes au quinoa, protéinées, aromatisées ou complètes en anglais",
  },
  { ids: [342702, 417338, 417367], not: ["dry|riz basmati"], why: "riz basmati demi-complet" },
  {
    ids: [311866, 2787161, 2303558],
    not: ["dry|riz complet"],
    why: "riz basmati demi-complet ou riz noir",
  },
  { ids: [2963764], not: ["fresh|blanc de poulet"], why: "poulet façon haché" },
  { ids: [1782342], not: ["fresh|crème fraîche"], why: "crème fleurette" },
];

// Produits connus pour être justes : identifiant dans la clé.
const KNOWN_RIGHT: readonly { id: number; key: string }[] = [
  { id: 1782342, key: "fresh|crème liquide" },
  { id: 2989712, key: "dry|pâtes complètes" },
  { id: 343348, key: "dry|pâtes complètes" },
  { id: 310109, key: "fresh|lait" },
  { id: 348685, key: "fresh|beurre" },
  { id: 3933918, key: "dry|riz basmati" },
  { id: 334775, key: "fresh|emmental râpé" },
  { id: 559618, key: "dry|pâtes complètes" },
  { id: 297350, key: "fresh|crème liquide" },
  { id: 297352, key: "fresh|crème liquide" },
];

// Mots d'audit : plus larges que ceux de la carte et distincts d'eux. Aucun nom retenu pour une clé ne contient un mot
// de sa liste. Si un mot attrape un produit légitime, on le retire de cette clé avec un commentaire qui cite le
// produit : la liste se corrige, elle ne se contourne pas.
const AUDIT_ALL = [
  "nugget",
  "nuggets",
  "cordon",
  "cordons",
  "plat",
  "cuisine",
  "sauce",
  "pizza",
  "soupe",
  "boisson",
  "dessert",
  "yaourt",
];
const AUDIT_BY_KEY: Record<string, readonly string[]> = {
  "fresh|lait": ["poudre", "infantile", "pods", "capsule", "capsules", "chocolat"],
  "fresh|œuf": ["caille", "chocolat", "paques"],
  "fresh|beurre": ["pepites", "margarine"],
  "fresh|crème fraîche": ["fleurette", "liquide"],
  "dry|pâtes": ["semoule", "micro", "cuit", "cuites", "fraiches"],
  "dry|riz complet": ["quinoa", "rouge", "epices", "citron", "microwave", "saute"],
  "dry|riz basmati": ["quinoa", "rouge", "epices", "citron", "microwave", "saute"],
  "fresh|bœuf haché": ["surgele", "surgeles", "boulettes"],
  "fresh|blanc de poulet": ["roti", "rotis", "pane", "nuggets"],
};

function openStream(file: string): ReadableStream<Uint8Array<ArrayBuffer>> {
  return Readable.toWeb(createReadStream(join(dir ?? "", `${file}.jsonl.gz`))) as ReadableStream<
    Uint8Array<ArrayBuffer>
  >;
}

// Identifiants présents dans `products.jsonl.gz` : un identifiant de la table qui manquerait rendrait le test muet.
async function productIdsIn(wanted: ReadonlySet<number>): Promise<Set<number>> {
  const found = new Set<number>();
  const lines = createInterface({
    input: createReadStream(join(dir ?? "", "products.jsonl.gz")).pipe(createGunzip()),
  });
  for await (const line of lines) {
    const match = /^\{"id": ?(\d+)/.exec(line);
    const id = match === null ? NaN : Number(match[1]);
    if (wanted.has(id)) found.add(id);
  }
  return found;
}

function auditMarkdown(retained: readonly RetainedPrice[], summary: OpenPricesSummary): string {
  const out = ["# Produits et relevés retenus par Open Prices", "", `Jour : ${TODAY}.`, ""];
  const groups = new Map<string, RetainedPrice[]>();
  for (const price of retained) {
    const id = `${price.key} (${price.unit})`;
    groups.set(id, [...(groups.get(id) ?? []), price]);
  }
  for (const [id, prices] of [...groups].sort(([a], [b]) => a.localeCompare(b, "fr"))) {
    const [key, unit] = [prices[0]?.key ?? "", prices[0]?.unit ?? "kg"];
    const stat = summary.prices[key]?.[unit];
    const products = new Map<number, RetainedPrice[]>();
    for (const price of prices) {
      if (price.productId !== null) {
        products.set(price.productId, [...(products.get(price.productId) ?? []), price]);
      }
    }
    const categoryCount = prices.filter((price) => price.kind === "category").length;
    out.push(
      `## ${id}`,
      "",
      `${prices.length} relevés (${categoryCount} de catégorie, ${prices.length - categoryCount} de produits, ${products.size} produits distincts), médiane ${stat?.median.toFixed(2) ?? "?"}, ${stat?.first ?? "?"} au ${stat?.last ?? "?"}`,
      "",
    );
    for (const [productId, list] of [...products].sort(([a], [b]) => a - b)) {
      const first = list[0];
      out.push(
        `- ${productId} · ${first?.productName ?? "(sans nom)"} · ${first?.productQuantity ?? "?"} ${first?.productQuantityUnit ?? ""} · ${list.length} relevé${list.length > 1 ? "s" : ""}`,
      );
    }
    out.push("");
  }
  return `${out.join("\n")}\n`;
}

describe.skipIf(dir === undefined)("Open Prices : carte contrôlée sur les vrais fichiers", () => {
  const retained: RetainedPrice[] = [];
  let summary: OpenPricesSummary;
  let diagnostics: Diagnostics;

  beforeAll(async () => {
    for (const file of OPEN_PRICES_FILES) {
      const path = join(dir ?? "", `${file}.jsonl.gz`);
      if (!existsSync(path) || statSync(path).size === 0) {
        throw new Error(`FMH_OPEN_PRICES_DIR : fichier absent ou vide : ${path}`);
      }
    }
    ({ summary, diagnostics } = await buildOpenPricesSummary({
      locations: openStream("locations"),
      prices: openStream("prices"),
      products: openStream("products"),
      today: TODAY,
      pause: () => Promise.resolve(),
      onRetained: (price) => retained.push(price),
    }));
    writeFileSync(AUDIT_PATH, auditMarkdown(retained, summary));
  }, 120_000);

  it("a lu les trois fichiers sans ligne illisible ni champ mal typé", () => {
    for (const file of OPEN_PRICES_FILES) {
      expect(diagnostics.files[file].lines, file).toBeGreaterThan(0);
      expect(diagnostics.files[file].unreadable, file).toBe(0);
      expect(diagnostics.files[file].badFields, file).toBe(0);
    }
  });

  it("trouve dans le dump tous les produits de la table des faux et des justes", async () => {
    const ids = new Set([
      ...KNOWN_WRONG.flatMap((wrong) => wrong.ids),
      ...KNOWN_RIGHT.map((right) => right.id),
    ]);
    const found = await productIdsIn(ids);
    expect([...ids].filter((id) => !found.has(id))).toEqual([]);
  }, 120_000);

  it("ne retient aucun produit connu pour être faux", () => {
    for (const wrong of KNOWN_WRONG) {
      for (const price of retained) {
        if (price.productId === null || !wrong.ids.includes(price.productId)) continue;
        expect(
          wrong.not,
          `${price.productId} (${wrong.why}) retenu dans ${price.key}`,
        ).not.toContain(price.key);
        if (wrong.onlyIn !== undefined) {
          expect(price.key, `${price.productId} (${wrong.why})`).toBe(wrong.onlyIn);
        }
      }
    }
  });

  it("retient les produits connus pour être justes", () => {
    for (const right of KNOWN_RIGHT) {
      const keys = new Set(
        retained.filter((price) => price.productId === right.id).map((price) => price.key),
      );
      expect([...keys], `produit ${right.id}`).toContain(right.key);
    }
  });

  it("ne retient aucun nom qui contient un mot d'audit de sa clé", () => {
    for (const price of retained) {
      if (price.productName === null) continue;
      const words = ` ${lightNormalize(price.productName)} `;
      for (const word of [...AUDIT_ALL, ...(AUDIT_BY_KEY[price.key] ?? [])]) {
        expect(
          words.includes(` ${word} `),
          `« ${price.productName} » (${price.productId}) retenu dans ${price.key} : mot d'audit « ${word} »`,
        ).toBe(false);
      }
    }
  });

  it("donne assez de clés utilisables, dont lait, beurre, pâtes, carotte et tomate", () => {
    expect(diagnostics.usable.product).toBeGreaterThanOrEqual(MIN_PRODUCT_KEYS);
    expect(diagnostics.usable.category).toBeGreaterThanOrEqual(MIN_CATEGORY_KEYS);
    const wanted: [string, "kg" | "l"][] = [
      ["fresh|lait", "l"],
      ["fresh|beurre", "kg"],
      ["dry|pâtes", "kg"],
      ["fresh|carotte", "kg"],
      ["fresh|tomate", "kg"],
    ];
    for (const [key, unit] of wanted) {
      expect(summary.prices[key]?.[unit]?.count ?? 0, `${key} (${unit})`).toBeGreaterThanOrEqual(
        MIN_OPEN_PRICES_COUNT,
      );
    }
  });

  it("imprime les vraies valeurs de couverture (pour fixer les minimums de la garde)", () => {
    console.log(
      `Clés utilisables : ${diagnostics.usable.product} produits, ${diagnostics.usable.category} de catégorie ; ${retained.length} relevés retenus.`,
    );
    expect(retained.length).toBeGreaterThan(0);
  });
});
