import { describe, expect, it } from "vitest";
import { buildIngredientIndex } from "../ingredients/index-lookup.ts";
import { lightNormalize } from "../ingredients/normalize.ts";
import { REFERENTIAL } from "../ingredients/referential.ts";
import {
  GLOBAL_FORBIDDEN_WORDS,
  GLOBAL_PRODUCT_EXCLUDE,
  OPEN_PRICES_MAP,
} from "./open-prices-map.ts";

const index = buildIngredientIndex(REFERENTIAL);
const TAG = /^[a-z]{2}:[a-z0-9-]+$/;

describe("OPEN_PRICES_MAP", () => {
  it("ne nomme que des entrées du référentiel, en forme par défaut, hors placard", () => {
    for (const { key } of OPEN_PRICES_MAP) {
      const [form, name] = key.split("|");
      const ref = index.find(name ?? "");
      expect(ref?.name, `« ${key} » nomme une entrée du référentiel`).toBe(name);
      expect(ref?.defaultForm, `« ${key} » est en forme par défaut`).toBe(form);
      expect(ref?.pantry, `« ${key} » n'est pas du placard`).toBe(false);
    }
  });
  it("n'a pas de clé en double", () => {
    const keys = OPEN_PRICES_MAP.map((entry) => entry.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
  it("n'a aucune étiquette de catégorie dans deux entrées", () => {
    const tags = OPEN_PRICES_MAP.flatMap((entry) => entry.categoryTags ?? []);
    expect(tags.filter((tag, i) => tags.indexOf(tag) !== i)).toEqual([]);
  });
  it("écrit chaque étiquette au format `langue:nom`", () => {
    const entries = OPEN_PRICES_MAP.flatMap((entry) => [
      ...(entry.categoryTags ?? []),
      ...(entry.productTags ?? []),
      ...(entry.excludeTags ?? []),
    ]);
    for (const tag of [...entries, ...GLOBAL_PRODUCT_EXCLUDE]) expect(tag).toMatch(TAG);
  });
  it("écrit chaque mot sous sa forme normalisée (sans accent, minuscules)", () => {
    const words = OPEN_PRICES_MAP.flatMap((entry) => [
      ...(entry.requireWords ?? []),
      ...(entry.forbidWords ?? []),
    ]);
    for (const word of [...words, ...GLOBAL_FORBIDDEN_WORDS]) {
      expect(word).toBe(lightNormalize(word));
    }
  });
  it("donne les unités de paquet de toute entrée produit", () => {
    for (const entry of OPEN_PRICES_MAP) {
      if (entry.productTags !== undefined) {
        expect(entry.units?.length, entry.key).toBeGreaterThan(0);
      }
    }
  });
  it("ne relie pas le poulet entier", () => {
    expect(OPEN_PRICES_MAP.some((entry) => entry.key.endsWith("|poulet entier"))).toBe(false);
  });
  it("met la crème liquide avant la crème fraîche, et les pâtes complètes avant les pâtes", () => {
    const keys = OPEN_PRICES_MAP.map((entry) => entry.key);
    expect(keys.indexOf("fresh|crème liquide")).toBeLessThan(keys.indexOf("fresh|crème fraîche"));
    expect(keys.indexOf("dry|pâtes complètes")).toBeLessThan(keys.indexOf("dry|pâtes"));
  });
  it("n'accepte la pièce que pour citron, laitue, concombre, chou-fleur, artichaut et œuf", () => {
    expect(
      OPEN_PRICES_MAP.filter((entry) => entry.pieceOk === true).map((entry) => entry.key),
    ).toEqual([
      "fresh|citron",
      "fresh|laitue",
      "fresh|concombre",
      "fresh|chou-fleur",
      "fresh|artichaut",
      "fresh|œuf",
    ]);
  });
  it("lit la tomate par `en:tomatoes` seule", () => {
    expect(OPEN_PRICES_MAP.find((entry) => entry.key === "fresh|tomate")?.categoryTags).toEqual([
      "en:tomatoes",
    ]);
  });
});
