import { printable } from "../ai/printable.ts";
import { removeInvisible } from "../domain/invisible.ts";
import { dishLetter } from "../domain/menu.ts";
import type { Menu, MenuIngredient, Unit } from "../domain/menu.ts";
import type { IngredientIndex } from "../ingredients/index-lookup.ts";
import { cookingQuantityText, quantityPhrase } from "../shopping/quantity-text.ts";
import { ambiguousNames, formSuffix, ingredientKey } from "../shopping/shopping-list.ts";

// Le texte d'une étape, écrit par l'IA, porte des repères d'ingrédients : `{a.1}` (le premier ingrédient du plat a),
// ou un tas partagé `{d.1/e.1}`. Le code les remplace par la quantité du menu et le nom, en gras. `**…**` met en
// gras ; rien d'autre n'est interprété. Un seul analyseur sert au contrôle (`checkDetail`) et au rendu (`sheet.ts`),
// sur le texte sans caractère invisible : les deux lisent toujours le même texte.

// « a.1 » : le premier ingrédient du plat a ; « a.12 » est le douzième.
const REFERENCE = /^([a-z])\.([1-9]\d*)$/;
// Grammaire stricte d'un repère : lettres minuscules, numéros sans zéro de tête, pas d'espace.
const MARK = /(\*\*|\{[a-z]\.[1-9]\d*(?:\/[a-z]\.[1-9]\d*)*\})/;
const REFERENCE_MARK = /^\{[a-z]\.[1-9]\d*(?:\/[a-z]\.[1-9]\d*)*\}$/;
// Ce qui reste d'une accolade hors d'un repère valide : cité dans le constat.
const STRAY = /\{[^{}]{0,30}\}?|\}/g;

export type StepPiece =
  | { kind: "text"; text: string; bold: boolean }
  | { kind: "ref"; refs: string[]; raw: string; bold: boolean };

export interface ParsedStepText {
  pieces: StepPiece[];
  // Repères mal formés, tels qu'écrits : « {A.1} », « {a.1 / b.2} », « } ».
  malformed: string[];
}

export interface TextRun {
  text: string;
  bold: boolean;
}

// L'ingrédient désigné par une référence (« a.1 »), avec le plat qui le porte ; null si elle ne désigne rien.
export function resolveReference(
  menu: Menu,
  reference: string,
): { dish: number; ingredient: MenuIngredient } | null {
  const match = REFERENCE.exec(reference);
  if (match === null) return null;
  const dish = menu.dishes.findIndex((_, index) => dishLetter(index) === match[1]);
  const ingredient = menu.dishes[dish]?.ingredients[Number(match[2]) - 1];
  return ingredient === undefined ? null : { dish, ingredient };
}

// Le gras ne s'applique que si les `**` vont par paires et qu'aucune paire n'entoure un texte vide ; sinon ils restent
// tels quels, sans erreur ni nouvel essai.
function boldIsValid(text: string): boolean {
  const parts = text.split("**");
  if (parts.length < 3 || parts.length % 2 === 0) return false;
  return parts.every((part, i) => i % 2 === 0 || part.trim() !== "");
}

export function parseStepText(text: string): ParsedStepText {
  const source = removeInvisible(text);
  const bolds = boldIsValid(source);
  const pieces: StepPiece[] = [];
  const malformed: string[] = [];
  let bold = false;
  const pushText = (value: string): void => {
    if (value === "") return;
    for (const stray of value.match(STRAY) ?? []) malformed.push(stray);
    const last = pieces[pieces.length - 1];
    if (last?.kind === "text" && last.bold === bold) last.text += value;
    else pieces.push({ kind: "text", text: value, bold });
  };
  for (const token of source.split(MARK)) {
    if (token === "**") {
      if (bolds) bold = !bold;
      else pushText(token);
    } else if (REFERENCE_MARK.test(token)) {
      const raw = token.slice(1, -1);
      pieces.push({ kind: "ref", refs: [...new Set(raw.split("/"))], raw, bold });
    } else {
      pushText(token);
    }
  }
  return { pieces, malformed };
}

// Toutes les références citées par l'étape, sans doublon, dans l'ordre.
export function referencesOf(parsed: ParsedStepText): string[] {
  return [...new Set(parsed.pieces.flatMap((piece) => (piece.kind === "ref" ? piece.refs : [])))];
}

// Le texte sans gras, les repères gardés tels quels : il est vide exactement quand le texte rendu l'est (un repère
// rendu n'est jamais vide). Sert au contrôle « texte non vide une fois imprimé ».
export function plainStepText(parsed: ParsedStepText): string {
  return parsed.pieces
    .map((piece) => (piece.kind === "text" ? piece.text : `{${piece.raw}}`))
    .join("");
}

// Le texte brut de l'étape, sans les repères : c'est là que l'IA écrirait une quantité à la main.
export function freeTextOf(parsed: ParsedStepText): string {
  return parsed.pieces.map((piece) => (piece.kind === "text" ? piece.text : " ")).join("");
}

function addTo(totals: Map<Unit, number>, unit: Unit, qty: number): void {
  totals.set(unit, (totals.get(unit) ?? 0) + qty);
}

function asList(totals: Map<Unit, number>): { unit: Unit; qty: number }[] {
  return [...totals].map(([unit, qty]) => ({ unit, qty }));
}

// Un repère rendu : « 600 g de poireau » ; un tas de même clé s'écrit comme une ligne de la liste,
// « 1000 g de potiron (d : 600 g, e : 400 g) » ; des clés différentes sont jointes par « + ». Les valeurs viennent du menu ; le partage entre étapes est écrit par l'IA.
function referenceRuns(refs: readonly string[], menu: Menu, index: IngredientIndex): TextRun[] {
  const ambiguous = ambiguousNames(menu, index);
  const groups = new Map<
    string,
    { name: string; suffix: string; byDish: Map<number, Map<Unit, number>> }
  >();
  const unknown: string[] = [];
  for (const reference of refs) {
    const found = resolveReference(menu, reference);
    if (found === null) {
      unknown.push(reference);
      continue;
    }
    const key = ingredientKey(found.ingredient, index);
    const id = `${key.form}|${key.name}`;
    let group = groups.get(id);
    if (group === undefined) {
      group = {
        name: index.find(found.ingredient.name)?.name ?? found.ingredient.name,
        suffix: formSuffix(found.ingredient.form, ambiguous.has(key.name)),
        byDish: new Map(),
      };
      groups.set(id, group);
    }
    const totals = group.byDish.get(found.dish) ?? new Map<Unit, number>();
    addTo(totals, found.ingredient.unit, found.ingredient.qty);
    group.byDish.set(found.dish, totals);
  }
  const runs: TextRun[] = [];
  for (const { name, suffix, byDish } of groups.values()) {
    if (runs.length > 0) runs.push({ text: " + ", bold: false });
    const total = new Map<Unit, number>();
    for (const totals of byDish.values()) for (const [unit, qty] of totals) addTo(total, unit, qty);
    const label = `${quantityPhrase(asList(total), name, "cooking")}${suffix === "" ? "" : ` (${suffix})`}`;
    runs.push({ text: label, bold: true });
    if (byDish.size > 1) {
      runs.push({ text: " (", bold: false });
      [...byDish].forEach(([dish, totals], i) => {
        if (i > 0) runs.push({ text: ", ", bold: false });
        const amounts = asList(totals)
          .map((part) => cookingQuantityText(part.qty, part.unit))
          .join(" + ");
        runs.push({ text: `${dishLetter(dish)} : ${amounts}`, bold: true });
      });
      runs.push({ text: ")", bold: false });
    }
  }
  // Un repère inconnu est refusé par le contrôle ; s'il arrivait ici, il resterait visible tel quel.
  if (unknown.length > 0) runs.push({ text: `{${unknown.join("/")}}`, bold: false });
  return runs;
}

// Le texte de l'étape prêt à imprimer : repères remplacés par les quantités en gras, gras de l'IA, et chaque morceau
// passé par `printable`.
export function renderStepText(text: string, menu: Menu, index: IngredientIndex): TextRun[] {
  const runs: TextRun[] = [];
  for (const piece of parseStepText(text).pieces) {
    if (piece.kind === "text") runs.push({ text: piece.text, bold: piece.bold });
    else runs.push(...referenceRuns(piece.refs, menu, index));
  }
  return runs.map((run) => ({ ...run, text: printable(run.text) }));
}
