import type { Menu, Unit } from "../domain/menu.ts";
import type { IngredientIndex } from "../ingredients/index-lookup.ts";
import { EGG_GRAMS } from "../rules/dish-profile.ts";
import { buildShoppingList, shoppingKey } from "../shopping/shopping-list.ts";
import type { ShoppingLine, ShoppingList } from "../shopping/shopping-list.ts";
import { PRICE_UNITS, unitOf } from "./price.ts";
import type { PriceLookup, PriceSource, PriceUnit, UnitPrice } from "./price.ts";

export interface LineCost {
  // « forme|nom canonique » (`shoppingKey`).
  key: string;
  // Un prix par unité de `line.totals`, dans le même ordre ; null pour une unité sans prix.
  parts: { unit: Unit; qty: number; price: UnitPrice | null; euros: number | null }[];
  // null dès qu'une partie n'a pas de prix.
  euros: number | null;
  // Unités pour lesquelles une source a un prix alors que la ligne n'en a pas l'usage (« prix connu seulement en €/kg »).
  otherUnits: PriceUnit[];
}

export interface MenuCost {
  // Même ordre que `ShoppingList.lines` ; le placard n'est jamais compté.
  lines: LineCost[];
  // Somme non arrondie des lignes connues.
  total: number;
  // Nombre de lignes sans prix.
  unknown: number;
  // Sources effectivement employées par les lignes connues, dans l'ordre manuel, Open Prices, INSEE.
  sources: PriceSource["kind"][];
}

const SOURCE_ORDER: readonly PriceSource["kind"][] = ["manual", "open-prices", "insee"];

// Coût d'une quantité au prix d'une source. Le prix est dans l'unité de la quantité, sauf pour l'œuf : une pièce vaut
// `EGG_GRAMS` grammes, et c'est la seule équivalence admise.
function partCost(unit: Unit, qty: number, price: UnitPrice): number {
  if (unit === "piece" && price.unit === "kg") return ((qty * EGG_GRAMS) / 1000) * price.euros;
  if (unit === "g" && price.unit === "piece") return (qty / EGG_GRAMS) * price.euros;
  return unit === "piece" ? qty * price.euros : (qty / 1000) * price.euros;
}

// La première source qui a un prix gagne. Pour un œuf, une source qui n'a pas le prix dans l'unité de la ligne est
// essayée dans l'autre (grammes ou pièces) avant de passer à la source suivante.
function priceOf(
  key: string,
  unit: Unit,
  line: ShoppingLine,
  lookups: readonly PriceLookup[],
): UnitPrice | null {
  const wanted = unitOf(unit);
  const other = unit === "g" ? "piece" : unit === "piece" ? "kg" : null;
  for (const lookup of lookups) {
    const direct = lookup.find(key, wanted);
    if (direct !== null) return direct;
    if (line.category === "egg" && other !== null) {
      const converted = lookup.find(key, other);
      if (converted !== null) return converted;
    }
  }
  return null;
}

function lineCost(line: ShoppingLine, key: string, lookups: readonly PriceLookup[]): LineCost {
  const parts = line.totals.map(({ unit, qty }) => {
    const price = priceOf(key, unit, line, lookups);
    return { unit, qty, price, euros: price === null ? null : partCost(unit, qty, price) };
  });
  const known = parts.every((part) => part.euros !== null);
  const used = new Set(line.totals.map((total) => unitOf(total.unit)));
  return {
    key,
    parts,
    euros: known ? parts.reduce((sum, part) => sum + (part.euros ?? 0), 0) : null,
    otherUnits: PRICE_UNITS.filter(
      (unit) => !used.has(unit) && lookups.some((lookup) => lookup.find(key, unit) !== null),
    ),
  };
}

// Estime la liste de courses (le placard n'est jamais compté) avec les sources, par ordre de priorité.
export function estimateCost(
  list: ShoppingList,
  index: IngredientIndex,
  lookups: readonly PriceLookup[],
): MenuCost {
  const lines = list.lines.map((line) => lineCost(line, shoppingKey(line, index), lookups));
  const used = new Set<PriceSource["kind"]>();
  let total = 0;
  let unknown = 0;
  for (const line of lines) {
    if (line.euros === null) {
      unknown++;
      continue;
    }
    total += line.euros;
    for (const part of line.parts) if (part.price !== null) used.add(part.price.source.kind);
  }
  return { lines, total, unknown, sources: SOURCE_ORDER.filter((kind) => used.has(kind)) };
}

export function menuCost(
  menu: Menu,
  index: IngredientIndex,
  lookups: readonly PriceLookup[],
): MenuCost {
  return estimateCost(buildShoppingList(menu, index), index, lookups);
}
