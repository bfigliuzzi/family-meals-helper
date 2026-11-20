import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { ManualPriceRow } from "../ports/price-store.ts";
import {
  isValidManualKey,
  manualLookup,
  MAX_MANUAL_KEY_BYTES,
  MAX_MANUAL_PRICES,
  MAX_PRICE_CENTS,
  readManualRows,
} from "./manual.ts";

const carrot: ManualPriceRow = { key: "fresh|carotte", unit: "kg", cents: 250, date: "2026-11-20" };

describe("constantes partagées avec price_table.rs", () => {
  it("sont les mêmes qu'en Rust", () => {
    const source = readFileSync(
      new URL("../../../../apps/desktop/src-tauri/src/price_table.rs", import.meta.url),
      "utf8",
    );
    const rust = (name: string, type: string): number => {
      const match = new RegExp(`const ${name}: ${type} = ([\\d_]+);`).exec(source);
      expect(match, name).not.toBeNull();
      return Number(match![1]!.replaceAll("_", ""));
    };
    expect(rust("MAX_KEY_BYTES", "usize")).toBe(MAX_MANUAL_KEY_BYTES);
    expect(rust("MAX_PRICE_CENTS", "i64")).toBe(MAX_PRICE_CENTS);
    expect(rust("MAX_ROWS", "i64")).toBe(MAX_MANUAL_PRICES);
  });
});

describe("manualLookup", () => {
  it("rend euros = cents / 100 et la source manual", () => {
    expect(manualLookup([carrot]).find("fresh|carotte", "kg")).toEqual({
      unit: "kg",
      euros: 2.5,
      source: { kind: "manual", date: "2026-11-20" },
    });
  });
  it("rend null pour une autre unité ou une autre clé", () => {
    const lookup = manualLookup([carrot]);
    expect(lookup.find("fresh|carotte", "piece")).toBeNull();
    expect(lookup.find("fresh|carotte", "l")).toBeNull();
    expect(lookup.find("dry|carotte", "kg")).toBeNull();
  });
});

describe("readManualRows", () => {
  it("garde les lignes valides, dans l'ordre", () => {
    const other: ManualPriceRow = { key: "fresh|lait", unit: "l", cents: 1, date: "2028-02-29" };
    expect(readManualRows([carrot, other])).toEqual([carrot, other]);
  });
  it("ignore une clé sans |, trop courte ou trop longue, ou avec un caractère de contrôle", () => {
    const bad = [
      { ...carrot, key: "carotte" },
      { ...carrot, key: "a|" },
      { ...carrot, key: `fresh|${"b".repeat(MAX_MANUAL_KEY_BYTES - 5)}` },
      { ...carrot, key: "fresh|caro\ntte" },
      { ...carrot, key: "fresh|caro\u0085tte" },
      { ...carrot, key: 12 },
    ];
    expect(readManualRows(bad)).toEqual([]);
  });
  it("ignore une clé dont la forme est inconnue ou dont le nom est vide", () => {
    const bad = ["xxx|carotte", "|carotte", "Fresh|carotte", "fresh|", "fresh|   ", "ab|"].map(
      (key) => ({ ...carrot, key }),
    );
    expect(readManualRows(bad)).toEqual([]);
  });
  it("compte la clé en octets UTF-8 : « fresh| » et 97 « é » font 200 octets, avec 98 « é » 202", () => {
    const fits = { ...carrot, key: `fresh|${"é".repeat(97)}` };
    const tooLong = { ...carrot, key: `fresh|${"é".repeat(98)}` };
    expect(readManualRows([fits, tooLong])).toEqual([fits]);
  });
  it("ignore une unité g, un prix de 0, de 1,5 ou de 100 001 centimes, une date impossible", () => {
    const bad = [
      { ...carrot, unit: "g" },
      { ...carrot, cents: 0 },
      { ...carrot, cents: 1.5 },
      { ...carrot, cents: MAX_PRICE_CENTS + 1 },
      { ...carrot, cents: "250" },
      { ...carrot, date: "2026-02-30" },
      { ...carrot, date: 20261120 },
      null,
      "texte",
    ];
    expect(readManualRows(bad)).toEqual([]);
  });
  it("rend [] pour autre chose qu'un tableau", () => {
    for (const value of [null, undefined, {}, "x", 3]) expect(readManualRows(value)).toEqual([]);
  });
});

describe("isValidManualKey", () => {
  it("accepte « forme|nom » pour chacune des quatre formes, y compris un nom qui contient |", () => {
    for (const key of [
      "fresh|carotte",
      "canned|maïs",
      "frozen|cabillaud",
      "dry|riz",
      "fresh|a|b",
    ]) {
      expect(isValidManualKey(key), key).toBe(true);
    }
  });
  it("refuse une forme inconnue, un nom vide ou blanc, un séparateur absent", () => {
    for (const key of ["xxx|carotte", "ab|", "|ab", "fresh|", "fresh|  ", "carotte", ""]) {
      expect(isValidManualKey(key), key).toBe(false);
    }
  });
  it("refuse plus de 200 octets et un caractère de contrôle", () => {
    expect(isValidManualKey(`fresh|${"a".repeat(MAX_MANUAL_KEY_BYTES - 6)}`)).toBe(true);
    expect(isValidManualKey(`fresh|${"a".repeat(MAX_MANUAL_KEY_BYTES - 5)}`)).toBe(false);
    expect(isValidManualKey("fresh|ca\u0007rotte")).toBe(false);
  });
});
