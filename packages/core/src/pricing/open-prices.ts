import { z } from "zod";
import { isRealDate } from "../history/history.ts";
import { lightNormalize } from "../ingredients/normalize.ts";
import { OPEN_PRICES_FILES, type OpenPricesFile } from "../ports/open-prices-store.ts";
import { addDays, monthsBefore } from "./dates.ts";
import {
  GLOBAL_FORBIDDEN_WORDS,
  GLOBAL_PRODUCT_EXCLUDE,
  OPEN_PRICES_MAP,
  type OpenPricesEntry,
} from "./open-prices-map.ts";
import type { PriceLookup, PriceUnit } from "./price.ts";

// Un relevé ne donne un prix qu'à partir de ce nombre de relevés pour la clé et l'unité (lecture, pas calcul).
export const MIN_OPEN_PRICES_COUNT = 3;
// Garde de format : seuils absolus de clés utilisables, fixés à la moitié (arrondie au-dessous) de ce que donnent les
// vrais fichiers (`docs/research/sources-prix.md`).
export const MIN_PRODUCT_KEYS = 7;
export const MIN_CATEGORY_KEYS = 7;
// Même valeur que `MAX_SUMMARY_BYTES` de `open_prices.rs` : un test lit le fichier Rust.
export const MAX_SUMMARY_BYTES = 512 * 1024;
// Fenêtre des relevés gardés.
export const WINDOW_MONTHS = 6;
// La vue web rend la main toutes les `PAUSE_EVERY_LINES` lignes.
export const PAUSE_EVERY_LINES = 2000;

export const LINE_TOO_LONG_MESSAGE = "Fichier Open Prices illisible : ligne trop longue.";
export const TOO_BIG_UNCOMPRESSED_MESSAGE =
  "Fichier Open Prices illisible : trop gros une fois décompressé.";
export const TOO_MANY_MESSAGE = "Fichiers Open Prices trop volumineux : résumé abandonné.";
export const SUMMARY_TOO_BIG_MESSAGE =
  "Résumé Open Prices trop volumineux : enregistrement abandonné.";

export interface Limits {
  // Une ligne : en caractères (borne de mémoire ; un caractère fait au moins un octet).
  maxLineChars: number;
  // Taille d'un fichier une fois décompressé, en octets.
  maxUncompressedBytes: number;
  maxLines: number; // par fichier
  maxLocations: number; // lieux gardés
  maxCandidates: number; // relevés PRODUCT gardés en attente de leur fiche produit
  maxValues: number; // prix gardés en tout pour les médianes
}

export const DEFAULT_LIMITS: Limits = {
  maxLineChars: 1024 * 1024,
  maxUncompressedBytes: 512 * 1024 * 1024,
  maxLines: 3_000_000,
  maxLocations: 50_000,
  maxCandidates: 300_000,
  maxValues: 100_000,
};

const unreadableFile = (file: OpenPricesFile): Error =>
  new Error(`Fichier Open Prices illisible : ${file}.`);

// Les lignes d'un fichier `.jsonl.gz`, lues en flux : décompression par `DecompressionStream`, UTF-8 strict, découpage
// sur `\n` (la dernière ligne peut manquer de `\n`). Les lignes vides sont rendues aussi : l'appelant les compte (plafond
// de lignes, pauses) puis les saute. Un gzip tronqué ou au CRC faux, un UTF-8 invalide ou une erreur de la source
// donnent la même phrase, qui nomme le fichier ; le message d'origine n'est pas affiché. La longueur d'une ligne est
// comptée en caractères (UTF-16) : 1 048 576 caractères, soit au plus 3 Mio en UTF-8 ; la vraie protection est la borne
// de taille décompressée.
export async function* readGzipLines(
  source: ReadableStream<Uint8Array<ArrayBuffer>>,
  file: OpenPricesFile,
  limits: Pick<Limits, "maxLineChars" | "maxUncompressedBytes"> = DEFAULT_LIMITS,
): AsyncGenerator<string> {
  const reader = source.pipeThrough(new DecompressionStream("gzip")).getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let pending = "";
  let total = 0;
  try {
    for (;;) {
      let chunk: Awaited<ReturnType<typeof reader.read>>;
      let text: string;
      try {
        chunk = await reader.read();
        text = chunk.done ? decoder.decode() : decoder.decode(chunk.value, { stream: true });
      } catch {
        throw unreadableFile(file);
      }
      if (!chunk.done) {
        total += chunk.value.length;
        if (total > limits.maxUncompressedBytes) throw new Error(TOO_BIG_UNCOMPRESSED_MESSAGE);
      }
      const pieces = (pending + text).split("\n");
      pending = pieces.pop() ?? "";
      for (const piece of pieces) {
        if (piece.length > limits.maxLineChars) throw new Error(LINE_TOO_LONG_MESSAGE);
        yield piece;
      }
      if (pending.length > limits.maxLineChars) throw new Error(LINE_TOO_LONG_MESSAGE);
      if (chunk.done) break;
    }
    if (pending !== "") yield pending;
  } finally {
    // La source n'est plus lue (arrêt anticipé, erreur) : on la libère sans attendre.
    reader.cancel().catch(() => undefined);
  }
}

export interface FileDiagnostics {
  lines: number;
  // Lignes qui ne sont pas un objet JSON.
  unreadable: number;
  // Lignes objet dont un champ lu par l'algorithme a un type inattendu.
  badFields: number;
}

export interface Diagnostics {
  files: Record<OpenPricesFile, FileDiagnostics>;
  // Clés ayant au moins `MIN_OPEN_PRICES_COUNT` relevés de ce type, dans une unité.
  usable: { category: number; product: number };
}

export interface RetainedPrice {
  key: string;
  unit: PriceUnit;
  kind: "category" | "product";
  priceId: number;
  productId: number | null;
  productName: string | null;
  productQuantity: number | null;
  productQuantityUnit: "g" | "ml" | null;
  euros: number;
  date: string;
}

const DATE_ERROR = "Une date du résumé des prix est illisible.";
const StatSchema = z.object(
  {
    median: z.number({ error: "Une médiane du résumé des prix est illisible." }).positive({
      error: "Une médiane du résumé des prix est illisible.",
    }),
    count: z
      .number({ error: "Un nombre de relevés du résumé des prix est illisible." })
      .int({ error: "Un nombre de relevés du résumé des prix est illisible." })
      .positive({ error: "Un nombre de relevés du résumé des prix est illisible." }),
    first: z.string({ error: DATE_ERROR }).refine(isRealDate, { error: DATE_ERROR }),
    last: z.string({ error: DATE_ERROR }).refine(isRealDate, { error: DATE_ERROR }),
  },
  { error: "Une statistique du résumé des prix est illisible." },
);
const UsableCount = z
  .number({ error: "Un nombre de clés du résumé des prix est illisible." })
  .int({ error: "Un nombre de clés du résumé des prix est illisible." })
  .nonnegative({ error: "Un nombre de clés du résumé des prix est illisible." });

// Document de `open_prices.summary`, validé à la lecture. `version` change à toute modification de forme.
export const OpenPricesSummarySchema = z.object(
  {
    version: z.literal(1, { error: "La version du résumé des prix est inconnue." }),
    fetchedAt: z.string({ error: DATE_ERROR }).refine(isRealDate, { error: DATE_ERROR }),
    from: z.string({ error: DATE_ERROR }).refine(isRealDate, { error: DATE_ERROR }),
    to: z.string({ error: DATE_ERROR }).refine(isRealDate, { error: DATE_ERROR }),
    // Recopié des diagnostics : sert de « semaine précédente » à la garde de format.
    usable: z.object(
      { category: UsableCount, product: UsableCount },
      { error: "Les clés utilisables du résumé des prix sont illisibles." },
    ),
    prices: z.record(
      z.string({ error: "Une clé du résumé des prix est illisible." }),
      z.object(
        { kg: StatSchema.optional(), l: StatSchema.optional(), piece: StatSchema.optional() },
        { error: "Une entrée du résumé des prix est illisible." },
      ),
      { error: "Les prix du résumé sont illisibles." },
    ),
  },
  { error: "Le résumé des prix est illisible." },
);
export type OpenPricesSummary = z.infer<typeof OpenPricesSummarySchema>;

type Row = Record<string, unknown>;

function parseRow(line: string): Row | null {
  try {
    const value: unknown = JSON.parse(line);
    return typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as Row)
      : null;
  } catch {
    return null;
  }
}

const isInt = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value);
const isText = (value: unknown): value is string => typeof value === "string";
const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
const orNull =
  (check: (value: unknown) => boolean) =>
  (value: unknown): boolean =>
    value === undefined || value === null || check(value);
const nullableText = orNull(isText);
const nullableInt = orNull(isInt);
const nullableBoolean = orNull((value) => typeof value === "boolean");
const nullableNumber = orNull(isFiniteNumber);
const nullableTexts = orNull(
  (value) => Array.isArray(value) && value.every((item) => isText(item)),
);

const text = (value: unknown): string | null => (typeof value === "string" ? value : null);
const int = (value: unknown): number | null => (isInt(value) ? value : null);

// « 1.250 » : texte décimal strictement positif.
function readPrice(value: string | null): number | null {
  if (value === null || !/^\d+(\.\d+)?$/.test(value)) return null;
  const price = Number(value);
  return Number.isFinite(price) && price > 0 ? price : null;
}

interface CompiledEntry {
  entry: OpenPricesEntry;
  productTags: ReadonlySet<string>;
  excludeTags: ReadonlySet<string>;
  units: ReadonlySet<string>;
  requireWords: readonly string[];
  forbidWords: readonly string[];
}

const hasWord = (normalized: string, term: string): boolean =>
  ` ${normalized} `.includes(` ${term} `);

function compile(map: readonly OpenPricesEntry[]): CompiledEntry[] {
  return map
    .filter((entry) => entry.productTags !== undefined)
    .map((entry) => ({
      entry,
      productTags: new Set(entry.productTags),
      excludeTags: new Set([...(entry.excludeTags ?? []), ...GLOBAL_PRODUCT_EXCLUDE]),
      units: new Set(entry.units),
      requireWords: entry.requireWords ?? [],
      forbidWords: [...(entry.forbidWords ?? []), ...GLOBAL_FORBIDDEN_WORDS],
    }));
}

// Les cinq contrôles d'un produit (`open-prices-map.ts`), pour chaque entrée dans l'ordre de la carte ; la première
// qui les passe gagne.
function selectEntry(
  compiled: readonly CompiledEntry[],
  name: string | null,
  unit: "g" | "ml",
  categories: readonly string[],
): OpenPricesEntry | null {
  // Un produit sans nom n'est jamais retenu.
  const normalized = name === null ? "" : lightNormalize(name);
  if (normalized === "") return null;
  for (const candidate of compiled) {
    if (!categories.some((tag) => candidate.productTags.has(tag))) continue;
    if (categories.some((tag) => candidate.excludeTags.has(tag))) continue;
    if (!candidate.units.has(unit)) continue;
    if (
      candidate.requireWords.length > 0 &&
      !candidate.requireWords.some((word) => hasWord(normalized, word))
    ) {
      continue;
    }
    if (candidate.forbidWords.some((word) => hasWord(normalized, word))) continue;
    return candidate.entry;
  }
  return null;
}

interface Bucket {
  values: number[];
  first: string;
  last: string;
  byKind: { category: number; product: number };
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = sorted.length >> 1;
  const low = sorted[middle - 1] ?? 0;
  const high = sorted[middle] ?? 0;
  return sorted.length % 2 === 1 ? high : (low + high) / 2;
}

interface Candidate {
  priceId: number;
  productId: number | null;
  euros: number;
  date: string;
}

export interface BuildInput {
  locations: ReadableStream<Uint8Array<ArrayBuffer>>;
  prices: ReadableStream<Uint8Array<ArrayBuffer>>;
  products: ReadableStream<Uint8Array<ArrayBuffer>>;
  today: string;
  // Rend la main à l'interface (le code pur n'a pas de minuterie) ; appelée toutes les `PAUSE_EVERY_LINES` lignes.
  pause: () => Promise<void>;
  map?: readonly OpenPricesEntry[];
  // Audit : rapport et test sur les vrais fichiers. L'app ne le passe pas.
  onRetained?: (retained: RetainedPrice) => void;
  // Les tests réduisent les bornes.
  limits?: Partial<Limits>;
}

// L'unité d'un relevé `CATEGORY` : `price_per` vient du fichier, donc jamais lu comme une clé d'objet.
function categoryUnit(per: string | null, pieceOk: boolean): PriceUnit | null {
  if (per === "KILOGRAM") return "kg";
  if (per === "LITER") return "l";
  return per === "UNIT" && pieceOk ? "piece" : null;
}

// Un paquet de moins de 50 g ou 50 ml n'est pas un paquet d'ingrédient (dosette, échantillon, poids mal saisi).
export const MIN_PACKAGE_QUANTITY = 50;

// Lit les trois fichiers, dans cet ordre : lieux (France métropolitaine), relevés (fenêtre, EUR, lieux gardés, hors
// doublons), produits (poids du paquet et contrôles). Puis une médiane par clé et par unité. Le flux borne la taille
// d'une ligne, pas celle des collections gardées : elles ont leurs propres bornes (`Limits`).
export async function buildOpenPricesSummary(
  input: BuildInput,
): Promise<{ summary: OpenPricesSummary; diagnostics: Diagnostics }> {
  const limits: Limits = { ...DEFAULT_LIMITS, ...input.limits };
  const map = input.map ?? OPEN_PRICES_MAP;
  const from = monthsBefore(input.today, WINDOW_MONTHS);
  const to = input.today;
  const diagnostics: Diagnostics = {
    files: {
      locations: { lines: 0, unreadable: 0, badFields: 0 },
      prices: { lines: 0, unreadable: 0, badFields: 0 },
      products: { lines: 0, unreadable: 0, badFields: 0 },
    },
    usable: { category: 0, product: 0 },
  };
  const tooMany = (): Error => new Error(TOO_MANY_MESSAGE);

  // Un fichier ligne par ligne : compte les lignes, rend la main, compte les illisibles. `read` rend `false` pour un
  // champ mal typé.
  async function eachRow(
    file: OpenPricesFile,
    source: ReadableStream<Uint8Array<ArrayBuffer>>,
    read: (row: Row) => boolean,
  ): Promise<void> {
    const stats = diagnostics.files[file];
    // Toutes les lignes physiques comptent pour le plafond et les pauses, les lignes vides comprises ; seules les lignes
    // non vides sont des lignes de données (`stats.lines`).
    let physical = 0;
    for await (const line of readGzipLines(source, file, limits)) {
      physical += 1;
      if (physical > limits.maxLines) throw tooMany();
      if (physical % PAUSE_EVERY_LINES === 0) await input.pause();
      if (line === "") continue;
      stats.lines += 1;
      const row = parseRow(line);
      if (row === null) stats.unreadable += 1;
      else if (!read(row)) stats.badFields += 1;
    }
  }

  // 1. Lieux gardés : France, avec un code postal hors outre-mer (97, 98) ; un lieu sans code postal ne se classe pas.
  const places = new Set<number>();
  await eachRow("locations", input.locations, (row) => {
    if (!isInt(row["id"])) return false;
    if (
      !nullableText(row["osm_address_country_code"]) ||
      !nullableText(row["osm_address_postcode"])
    ) {
      return false;
    }
    const postcode = text(row["osm_address_postcode"])?.trim() ?? "";
    if (
      row["osm_address_country_code"] === "FR" &&
      postcode !== "" &&
      !postcode.startsWith("97") &&
      !postcode.startsWith("98")
    ) {
      places.add(row["id"]);
      if (places.size > limits.maxLocations) throw tooMany();
    }
    return true;
  });

  // 2. Relevés.
  const categoryEntries = new Map<string, OpenPricesEntry>();
  for (const entry of map) {
    for (const tag of entry.categoryTags ?? []) {
      if (!categoryEntries.has(tag)) categoryEntries.set(tag, entry);
    }
  }
  const buckets = new Map<string, Map<PriceUnit, Bucket>>();
  let valueCount = 0;
  function keep(
    retained: Pick<RetainedPrice, "key" | "unit" | "kind" | "priceId" | "euros" | "date"> &
      Partial<RetainedPrice>,
  ): void {
    valueCount += 1;
    if (valueCount > limits.maxValues) throw tooMany();
    let units = buckets.get(retained.key);
    if (units === undefined) {
      units = new Map();
      buckets.set(retained.key, units);
    }
    let bucket = units.get(retained.unit);
    if (bucket === undefined) {
      bucket = {
        values: [],
        first: retained.date,
        last: retained.date,
        byKind: { category: 0, product: 0 },
      };
      units.set(retained.unit, bucket);
    }
    bucket.values.push(retained.euros);
    bucket.byKind[retained.kind] += 1;
    if (retained.date < bucket.first) bucket.first = retained.date;
    if (retained.date > bucket.last) bucket.last = retained.date;
    input.onRetained?.({
      productId: null,
      productName: null,
      productQuantity: null,
      productQuantityUnit: null,
      ...retained,
    });
  }

  const byProductId = new Map<number, Candidate[]>();
  const byProductCode = new Map<string, Candidate[]>();
  let candidateCount = 0;
  await eachRow("prices", input.prices, (row) => {
    if (!isInt(row["id"]) || !isText(row["type"]) || !isText(row["price"])) return false;
    if (
      !nullableText(row["date"]) ||
      !nullableText(row["currency"]) ||
      !nullableText(row["category_tag"]) ||
      !nullableText(row["price_per"]) ||
      !nullableText(row["price_without_discount"]) ||
      !nullableText(row["product_code"]) ||
      !nullableInt(row["location_id"]) ||
      !nullableInt(row["product_id"]) ||
      !nullableInt(row["duplicate_of"]) ||
      !nullableBoolean(row["price_is_discounted"])
    ) {
      return false;
    }
    const date = text(row["date"]);
    if (row["duplicate_of"] !== undefined && row["duplicate_of"] !== null) {
      return true;
    }
    if (date === null || date < from || date > to || !isRealDate(date)) return true;
    if (row["currency"] !== "EUR") return true;
    const placeId = int(row["location_id"]);
    if (placeId === null || !places.has(placeId)) return true;
    // Promotion : on estime un prix normal, donc le prix d'avant ; sans lui, le relevé est ignoré.
    const euros = readPrice(
      row["price_is_discounted"] === true ? text(row["price_without_discount"]) : row["price"],
    );
    if (euros === null) return true;
    if (row["type"] === "CATEGORY") {
      const tag = text(row["category_tag"]);
      const entry = tag === null ? undefined : categoryEntries.get(tag);
      if (entry === undefined) return true;
      const unit = categoryUnit(text(row["price_per"]), entry.pieceOk === true);
      if (unit === null) return true;
      keep({ key: entry.key, unit, kind: "category", priceId: row["id"], euros, date });
    } else if (row["type"] === "PRODUCT") {
      // `price_per` est nul pour tout relevé `PRODUCT` (mesuré au lot 7.0) : un relevé qui en porte un est hors format.
      if (row["price_per"] !== undefined && row["price_per"] !== null) return true;
      const productId = int(row["product_id"]);
      const code = text(row["product_code"]);
      if (productId === null && code === null) return true;
      candidateCount += 1;
      if (candidateCount > limits.maxCandidates) throw tooMany();
      const candidate: Candidate = { priceId: row["id"], productId, euros, date };
      if (productId !== null) {
        const list = byProductId.get(productId);
        if (list === undefined) byProductId.set(productId, [candidate]);
        else list.push(candidate);
      } else if (code !== null) {
        const list = byProductCode.get(code);
        if (list === undefined) byProductCode.set(code, [candidate]);
        else list.push(candidate);
      }
    }
    return true;
  });

  // 3. Produits : seuls ceux qui portent un relevé en attente sont lus en détail.
  const compiled = compile(map);
  await eachRow("products", input.products, (row) => {
    if (!isInt(row["id"])) return false;
    if (
      !nullableText(row["code"]) ||
      !nullableNumber(row["product_quantity"]) ||
      !nullableText(row["product_quantity_unit"]) ||
      !nullableText(row["product_name"]) ||
      !nullableTexts(row["categories_tags"])
    ) {
      return false;
    }
    const code = text(row["code"]);
    const waiting = [
      ...(byProductId.get(row["id"]) ?? []),
      ...(code === null ? [] : (byProductCode.get(code) ?? [])),
    ];
    if (waiting.length === 0) return true;
    // Les candidats sont pris une fois : une fiche répétée ne rescanne plus rien.
    byProductId.delete(row["id"]);
    if (code !== null) byProductCode.delete(code);
    const quantity = row["product_quantity"];
    const unit = text(row["product_quantity_unit"]);
    if (!isInt(quantity) || quantity < MIN_PACKAGE_QUANTITY || (unit !== "g" && unit !== "ml")) {
      return true;
    }
    const categories = Array.isArray(row["categories_tags"])
      ? (row["categories_tags"] as string[])
      : [];
    const name = text(row["product_name"]);
    const entry = selectEntry(compiled, name, unit, categories);
    if (entry === null) return true;
    for (const candidate of waiting) {
      keep({
        key: entry.key,
        unit: unit === "g" ? "kg" : "l",
        kind: "product",
        priceId: candidate.priceId,
        productId: candidate.productId ?? row["id"],
        productName: name,
        productQuantity: quantity,
        productQuantityUnit: unit,
        euros: candidate.euros / (quantity / 1000),
        date: candidate.date,
      });
    }
    return true;
  });

  // `usable` se compte sur le résumé tel qu'il sera sérialisé : seules les unités présentes dans `prices` comptent.
  const prices: OpenPricesSummary["prices"] = {};
  const usableKeys = { category: new Set<string>(), product: new Set<string>() };
  for (const key of [...buckets.keys()].sort((a, b) => a.localeCompare(b, "fr"))) {
    const entry: OpenPricesSummary["prices"][string] = {};
    const units = buckets.get(key) ?? new Map<PriceUnit, Bucket>();
    for (const [unit, bucket] of units) {
      entry[unit] = {
        median: median(bucket.values),
        count: bucket.values.length,
        first: bucket.first,
        last: bucket.last,
      };
    }
    prices[key] = entry;
    for (const [unit, bucket] of units) {
      if (!Object.hasOwn(entry, unit)) continue;
      for (const kind of ["category", "product"] as const) {
        if (bucket.byKind[kind] >= MIN_OPEN_PRICES_COUNT) usableKeys[kind].add(key);
      }
    }
  }
  diagnostics.usable = { category: usableKeys.category.size, product: usableKeys.product.size };
  return {
    summary: {
      version: 1,
      fetchedAt: input.today,
      from,
      to,
      usable: { ...diagnostics.usable },
      prices,
    },
    diagnostics,
  };
}

const percentText = (rate: number): string => (rate * 100).toFixed(2).replace(".", ",");

// Garde de format : un nouveau résumé ne remplace l'ancien que s'il a l'air d'une lecture réussie. `null` : accepté ;
// sinon le message du refus, affiché tel quel. Un format qui change (un champ qui devient un nombre, une étiquette qui
// disparaît) ne doit pas remplacer un bon résumé par un résumé presque vide.
export function acceptSummary(
  next: OpenPricesSummary,
  diagnostics: Diagnostics,
  previous: OpenPricesSummary | null,
): string | null {
  for (const file of OPEN_PRICES_FILES) {
    const { lines, unreadable, badFields } = diagnostics.files[file];
    const rate = lines === 0 ? 0 : (unreadable + badFields) / lines;
    if (rate > 0.001) {
      return `Résumé Open Prices refusé : ${file} a ${percentText(rate)} % de lignes illisibles (format changé ?).`;
    }
  }
  const { product, category } = next.usable;
  if (product < MIN_PRODUCT_KEYS) {
    return `Résumé Open Prices refusé : seulement ${product} produits à code-barres ont assez de relevés.`;
  }
  if (category < MIN_CATEGORY_KEYS) {
    return `Résumé Open Prices refusé : seulement ${category} fruits et légumes ont assez de relevés.`;
  }
  if (previous !== null) {
    if (product < previous.usable.product / 2) {
      return `Résumé Open Prices refusé : ${product} produits à code-barres avec assez de relevés, contre ${previous.usable.product} la semaine précédente.`;
    }
    if (category < previous.usable.category / 2) {
      return `Résumé Open Prices refusé : ${category} fruits et légumes avec assez de relevés, contre ${previous.usable.category} la semaine précédente.`;
    }
  }
  return null;
}

// Au plus `MAX_SUMMARY_BYTES` ; trop grand : échec.
export function serializeOpenPricesSummary(summary: OpenPricesSummary): string {
  const serialized = JSON.stringify(OpenPricesSummarySchema.parse(summary));
  if (new TextEncoder().encode(serialized).length > MAX_SUMMARY_BYTES) {
    throw new Error(SUMMARY_TOO_BIG_MESSAGE);
  }
  return serialized;
}

// Ne lève jamais : un texte illisible (JSON cassé, version inconnue, date fausse) est « pas de résumé ».
export function readOpenPricesSummary(content: string | null): OpenPricesSummary | null {
  if (content === null || new TextEncoder().encode(content).length > MAX_SUMMARY_BYTES) {
    return null;
  }
  try {
    const parsed = OpenPricesSummarySchema.safeParse(JSON.parse(content));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function openPricesLookup(
  summary: OpenPricesSummary,
  min: number = MIN_OPEN_PRICES_COUNT,
): PriceLookup {
  return {
    find(key, unit) {
      if (!Object.hasOwn(summary.prices, key)) return null;
      const stat = summary.prices[key]?.[unit];
      if (stat === undefined || stat.count < min) return null;
      return {
        unit,
        euros: stat.median,
        source: { kind: "open-prices", count: stat.count, first: stat.first, last: stat.last },
      };
    },
  };
}

// Un téléchargement est dû s'il n'y a pas de résumé lisible, ou s'il a 7 jours ou plus, et si aucun essai n'a eu lieu
// aujourd'hui (au plus un essai par jour : un réseau coupé ou un format changé ne coûte pas 45 Mo à chaque lancement).
export function openPricesDue(
  state: { attemptedAt: string | null; summary: OpenPricesSummary | null },
  today: string,
): boolean {
  if (state.attemptedAt === today) return false;
  return state.summary === null || state.summary.fetchedAt <= addDays(today, -7);
}
