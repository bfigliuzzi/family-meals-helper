import type { Unit } from "../domain/menu.ts";

// Unité d'un prix : le kilo (pour des grammes), le litre (pour des millilitres) ou la pièce.
export type PriceUnit = "kg" | "l" | "piece";

export type PriceSource =
  | { kind: "manual"; date: string } // AAAA-MM-JJ, jour de saisie
  | { kind: "open-prices"; count: number; first: string; last: string } // relevés retenus et leurs dates extrêmes
  | { kind: "insee"; month: string }; // AAAA-MM

export interface UnitPrice {
  unit: PriceUnit;
  euros: number; // prix d'un kilo, d'un litre ou d'une pièce
  source: PriceSource;
}

// Une source de prix. `key` : « forme|nom canonique » (`shoppingKey`).
export interface PriceLookup {
  find(key: string, unit: PriceUnit): UnitPrice | null;
}

export const PRICE_UNITS: readonly PriceUnit[] = ["kg", "l", "piece"];

// g se paie au kilo, ml au litre, pièce à la pièce : aucune autre équivalence.
export function unitOf(unit: Unit): PriceUnit {
  return unit === "g" ? "kg" : unit === "ml" ? "l" : "piece";
}
