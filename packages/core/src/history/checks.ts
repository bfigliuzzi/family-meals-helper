import type { Menu } from "../domain/menu.ts";
import { printable } from "../ai/printable.ts";
import type { IngredientIndex } from "../ingredients/index-lookup.ts";
import { lineCostText, sourcesNotice, totalText } from "../pricing/cost-text.ts";
import { menuCost } from "../pricing/cost.ts";
import { unitOf } from "../pricing/price.ts";
import type { PriceLookup, PriceUnit } from "../pricing/price.ts";
import {
  buildShoppingList,
  formSuffix,
  pantryLineDetail,
  shoppingKey,
  shoppingLineDetail,
} from "../shopping/shopping-list.ts";
import type { ShoppingLine } from "../shopping/shopping-list.ts";

// La clé de l'unique case du placard. Une clé d'ingrédient contient toujours « | » : elles ne se rencontrent pas.
export const PANTRY_KEY = "placard";

// La clé d'une case est celle de regroupement de `buildShoppingList` (« forme|nom canonique »), définie avec la liste.
export { shoppingKey };

// Les cases lues dans `history.checked` : un tableau JSON de chaînes, sinon `null`. Ne lève jamais.
export function readChecked(text: string): string[] | null {
  try {
    const value: unknown = JSON.parse(text);
    if (Array.isArray(value) && value.every((key) => typeof key === "string")) {
      return value;
    }
  } catch {
    return null;
  }
  return null;
}

export interface ChecklistLine {
  // Clé de la case.
  readonly key: string;
  // « Cabillaud (surgelé) » : nom avec capitale, puis la forme quand elle se dit.
  readonly name: string;
  // « 1,1 kg (b : 500 g, c : 600 g) ».
  readonly detail: string;
  // L'unité de prix de chaque somme de la ligne, dans l'ordre de ses totaux (g, ml, pièce) : celles où l'on peut
  // saisir un prix.
  readonly units: readonly PriceUnit[];
}

export interface Checklist {
  // Dans l'ordre de `buildShoppingList` (alphabétique).
  readonly lines: readonly ChecklistLine[];
  // « Cumin : 3 g (d) » : une entrée par ingrédient de placard ; `null` sans ingrédient de placard.
  readonly pantry: { readonly key: typeof PANTRY_KEY; readonly items: readonly string[] } | null;
  // Les lignes, puis le placard : l'ordre d'écriture.
  readonly keys: readonly string[];
  // Une ligne au moins porte « soir ».
  readonly evening: boolean;
  // Une ligne au moins porte « à confirmer ».
  readonly toConfirm: boolean;
}

// Première lettre en capitale, sans couper une paire de substitution.
function capital(text: string): string {
  const [first, ...rest] = Array.from(text);
  return first === undefined ? "" : first.toLocaleUpperCase("fr-FR") + rest.join("");
}

function nameWithForm(line: ShoppingLine): string {
  const form = formSuffix(line.form, line.showForm);
  return `${capital(printable(line.name))}${form === "" ? "" : ` (${form})`}`;
}

// Tout ce que l'écran Ingrédients affiche de la liste de courses, déjà passé par `printable` : l'écran ne compose
// aucun texte venu de l'IA.
export function shoppingChecklist(menu: Menu, index: IngredientIndex): Checklist {
  const list = buildShoppingList(menu, index);
  const lines = list.lines.map((line) =>
    Object.freeze({
      key: shoppingKey(line, index),
      name: nameWithForm(line),
      detail: printable(shoppingLineDetail(line)),
      units: Object.freeze(line.totals.map((total) => unitOf(total.unit))),
    }),
  );
  const pantry =
    list.pantry.length === 0
      ? null
      : Object.freeze({
          key: PANTRY_KEY,
          items: Object.freeze(
            list.pantry.map(
              (line) => `${nameWithForm(line)} : ${printable(pantryLineDetail(line))}`,
            ),
          ),
        });
  const all = [...list.lines, ...list.pantry];
  return Object.freeze({
    lines: Object.freeze(lines),
    pantry,
    keys: Object.freeze([
      ...lines.map((line) => line.key),
      ...(pantry === null ? [] : [PANTRY_KEY]),
    ]),
    evening: all.some((line) => line.evening),
    toConfirm: all.some((line) => line.toConfirm),
  });
}

export interface ChecklistCost {
  // Le texte du coût de chaque ligne, par clé de case (`shoppingKey`).
  readonly lines: ReadonlyMap<string, string>;
  // « Coût estimé : au moins 41,20 € · 3 prix inconnus ».
  readonly total: string;
  // « Sources : … », vide si aucune source n'est employée.
  readonly notice: string;
  // Nombre de lignes sans prix.
  readonly unknown: number;
}

// Les textes de coût de l'écran Ingrédients, composés ici : l'écran n'en écrit aucun.
export function checklistCost(
  menu: Menu,
  index: IngredientIndex,
  lookups: readonly PriceLookup[],
): ChecklistCost {
  const cost = menuCost(menu, index, lookups);
  return Object.freeze({
    lines: new Map(cost.lines.map((line) => [line.key, lineCostText(line)])),
    total: totalText(cost),
    notice: sourcesNotice(cost),
    unknown: cost.unknown,
  });
}
