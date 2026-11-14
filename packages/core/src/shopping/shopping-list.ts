import { FORM_LABELS } from "../domain/ingredient.ts";
import type { Form } from "../domain/ingredient.ts";
import { UNITS, dishLetter } from "../domain/menu.ts";
import type { Menu, MenuIngredient, Unit } from "../domain/menu.ts";
import type { IngredientIndex } from "../ingredients/index-lookup.ts";
import { normalizeName } from "../ingredients/normalize.ts";
import { quantityPhrase, quantityText } from "./quantity-text.ts";

export interface ShoppingLine {
  // Nom du référentiel, sinon le premier nom reçu.
  name: string;
  form: Form;
  // Une somme par unité, dans l'ordre g, ml, piece. Aucune conversion entre unités.
  totals: { unit: Unit; qty: number }[];
  // Dans l'ordre des plats.
  split: { dish: number; qty: number; unit: Unit }[];
  // Absent du référentiel : à confirmer.
  toConfirm: boolean;
  // Le même nom figure en plusieurs formes dans la liste : chaque ligne dit alors sa forme, « frais » et « sec » compris.
  showForm: boolean;
  // Toutes les utilisations sont du soir même : rien à sortir pendant la session.
  evening: boolean;
}

// Pas de rayons (décision de l'utilisateur : courses en drive) : une ligne par ingrédient regroupé, en ordre
// alphabétique français ; le placard à part, à vérifier.
export interface ShoppingList {
  lines: ShoppingLine[];
  pantry: ShoppingLine[];
}

// Clé d'une ligne de courses : le nom du référentiel (« carottes » et « carotte » ne font qu'une ligne), sinon le nom
// normalisé, et la forme (le maïs en conserve n'est pas le maïs frais). Les quantités des étapes réutilisent cette clé.
export function ingredientKey(
  ingredient: MenuIngredient,
  index: IngredientIndex,
): { name: string; form: Form } {
  return {
    name: index.find(ingredient.name)?.name ?? normalizeName(ingredient.name),
    form: ingredient.form,
  };
}

// Les noms (clé de `ingredientKey`) qui figurent en deux formes ou plus dans le menu entier : leurs lignes ne se
// distingueraient pas sans leur forme. Règle partagée par la liste et les quantités de la fiche.
export function ambiguousNames(menu: Menu, index: IngredientIndex): ReadonlySet<string> {
  const forms = new Map<string, Set<Form>>();
  for (const dish of menu.dishes) {
    for (const ingredient of dish.ingredients) {
      const { name, form } = ingredientKey(ingredient, index);
      const seen = forms.get(name) ?? new Set<Form>();
      seen.add(form);
      forms.set(name, seen);
    }
  }
  return new Set([...forms].filter(([, seen]) => seen.size > 1).map(([name]) => name));
}

// Seuls surgelé et conserve se disent d'ordinaire ; « frais » et « sec » seulement pour lever une ambiguïté.
export function formSuffix(form: Form, ambiguous: boolean): string {
  return ambiguous || form === "frozen" || form === "canned" ? FORM_LABELS[form] : "";
}

export function buildShoppingList(menu: Menu, index: IngredientIndex): ShoppingList {
  interface Entry {
    line: ShoppingLine;
    // Nom de la clé : le même pour toutes les formes d'un ingrédient.
    key: string;
    pantry: boolean;
  }
  const entries = new Map<string, Entry>();
  for (const [dish, { ingredients }] of menu.dishes.entries()) {
    for (const ingredient of ingredients) {
      const key = ingredientKey(ingredient, index);
      const id = `${key.form}|${key.name}`;
      let entry = entries.get(id);
      if (entry === undefined) {
        const ref = index.find(ingredient.name);
        entry = {
          line: {
            name: ref?.name ?? ingredient.name,
            form: ingredient.form,
            totals: [],
            split: [],
            toConfirm: ref === undefined,
            showForm: false,
            evening: true,
          },
          key: key.name,
          // Un ingrédient inconnu ne va jamais au placard.
          pantry: ref?.pantry === true,
        };
        entries.set(id, entry);
      }
      if (!ingredient.sameDay) entry.line.evening = false;
      addQuantity(entry.line.totals, ingredient.unit, ingredient.qty);
      const same = entry.line.split.find(
        (part) => part.dish === dish && part.unit === ingredient.unit,
      );
      if (same === undefined)
        entry.line.split.push({ dish, qty: ingredient.qty, unit: ingredient.unit });
      else same.qty += ingredient.qty;
    }
  }

  const sortUnits = (line: ShoppingLine): ShoppingLine => {
    line.totals.sort((a, b) => UNITS.indexOf(a.unit) - UNITS.indexOf(b.unit));
    line.split.sort((a, b) => a.dish - b.dish || UNITS.indexOf(a.unit) - UNITS.indexOf(b.unit));
    return line;
  };
  const byName = (a: ShoppingLine, b: ShoppingLine): number => a.name.localeCompare(b.name, "fr");
  const all = [...entries.values()];
  const ambiguous = ambiguousNames(menu, index);
  for (const { line, key } of all) line.showForm = ambiguous.has(key);
  const of = (pantry: boolean): ShoppingLine[] =>
    all
      .filter((entry) => entry.pantry === pantry)
      .map((entry) => sortUnits(entry.line))
      .sort(byName);
  return { lines: of(false), pantry: of(true) };
}

function addQuantity(totals: { unit: Unit; qty: number }[], unit: Unit, qty: number): void {
  const found = totals.find((total) => total.unit === unit);
  if (found === undefined) totals.push({ unit, qty });
  else found.qty += qty;
}

// Les lettres des plats, dans l'ordre, sans doublon.
function lettersOf(line: ShoppingLine): string[] {
  return [...new Set(line.split.map((part) => dishLetter(part.dish)))];
}

// Forme, soir même, à confirmer : ce que la ligne doit dire en plus de sa quantité.
function notesOf(line: ShoppingLine): string[] {
  const form = formSuffix(line.form, line.showForm);
  return [
    ...(form === "" ? [] : [form]),
    ...(line.evening ? ["soir"] : []),
    ...(line.toConfirm ? ["à confirmer"] : []),
  ];
}

// « 1,2 kg de potiron (d : 600 g, e : 600 g) », « 600 g de poireau (a) », « 600 g de cabillaud (a) · surgelé · soir ».
export function shoppingLineText(line: ShoppingLine): string {
  const letters = lettersOf(line);
  const split =
    letters.length === 1
      ? letters[0]!
      : letters
          .map((letter) => {
            const parts = line.split.filter((part) => dishLetter(part.dish) === letter);
            return `${letter} : ${parts.map((part) => quantityText(part.qty, part.unit)).join(" + ")}`;
          })
          .join(", ");
  const notes = notesOf(line);
  return `${quantityPhrase(line.totals, line.name, "display")} (${split})${notes.map((note) => ` · ${note}`).join("")}`;
}

// Une entrée de la ligne Placard : « 30 ml d'huile d'olive (a, b) ».
export function pantryLineText(line: ShoppingLine): string {
  return `${quantityPhrase(line.totals, line.name, "display")} (${[...lettersOf(line), ...notesOf(line)].join(", ")})`;
}
