import { FORMS } from "../domain/ingredient.ts";
import { isRealDate } from "../history/history.ts";
import type { ManualPriceRow } from "../ports/price-store.ts";
import { PRICE_UNITS } from "./price.ts";
import type { PriceLookup } from "./price.ts";

// Les mêmes qu'en Rust (apps/desktop/src-tauri/src/price_table.rs) : un test le vérifie en lisant ce fichier.
export const MAX_MANUAL_KEY_BYTES = 200;
export const MAX_PRICE_CENTS = 100000;
export const MAX_MANUAL_PRICES = 1000;
// Le plus grand prix saisissable, en euros.
export const MAX_MANUAL_EUROS = MAX_PRICE_CENTS / 100;

const MIN_KEY_BYTES = 3;

// Une clé acceptée par la table : « forme|nom », 3 à 200 octets UTF-8, sans caractère de contrôle ; la partie avant le
// premier `|` est une forme connue, la partie après n'est pas vide. Les mêmes règles qu'en Rust (`check_key`).
export function isValidManualKey(key: string): boolean {
  const bar = key.indexOf("|");
  if (bar === -1) return false;
  const form = key.slice(0, bar);
  const name = key.slice(bar + 1);
  if (!FORMS.some((candidate) => candidate === form) || name.trim() === "") return false;
  const bytes = new TextEncoder().encode(key).length;
  // Aucun caractère de contrôle (C0, DEL, C1), comme `char::is_control` en Rust.
  return (
    bytes >= MIN_KEY_BYTES &&
    bytes <= MAX_MANUAL_KEY_BYTES &&
    // eslint-disable-next-line no-control-regex
    !/[\u0000-\u001f\u007f-\u009f]/.test(key)
  );
}

// Les lignes lues dans la base, filtrées : une ligne illisible est ignorée, les autres gardent leur ordre. Ne lève
// jamais.
export function readManualRows(rows: unknown): ManualPriceRow[] {
  if (!Array.isArray(rows)) return [];
  const kept: ManualPriceRow[] = [];
  for (const row of rows as unknown[]) {
    if (typeof row !== "object" || row === null) continue;
    const { key, unit, cents, date } = row as Record<string, unknown>;
    if (
      typeof key === "string" &&
      isValidManualKey(key) &&
      PRICE_UNITS.some((candidate) => candidate === unit) &&
      typeof cents === "number" &&
      Number.isInteger(cents) &&
      cents >= 1 &&
      cents <= MAX_PRICE_CENTS &&
      typeof date === "string" &&
      isRealDate(date)
    ) {
      kept.push({ key, unit: unit as ManualPriceRow["unit"], cents, date });
    }
  }
  return kept;
}

// Le prix de l'utilisateur pour une clé, seulement dans l'unité qu'il a saisie : jamais converti.
export function manualLookup(rows: readonly ManualPriceRow[]): PriceLookup {
  const byKey = new Map(rows.map((row) => [row.key, row]));
  return {
    find(key, unit) {
      const row = byKey.get(key);
      if (row === undefined || row.unit !== unit) return null;
      return { unit, euros: row.cents / 100, source: { kind: "manual", date: row.date } };
    },
  };
}
