import { UNITS } from "../domain/menu.ts";
import type { Unit } from "../domain/menu.ts";

// Deux façons d'écrire une quantité, jamais une conversion :
// - « display » (liste d'ingrédients) : arrondi au-dessus pour l'achat, kg et L à partir de 1000 ;
// - « cooking » (étapes et soirs) : la valeur du menu, à 4 chiffres significatifs, dans son unité, jamais 0.
export type QuantityMode = "display" | "cooking";

// Arrondi au-dessus au pas donné ; la tolérance absorbe l'erreur des sommes de flottants (0,1 + 0,2).
function ceilTo(value: number, step: number): number {
  return Math.ceil(value / step - 1e-6) * step;
}

function decimal(value: number): string {
  return String(Number(value.toFixed(2))).replace(".", ",");
}

function pieceWord(count: number): string {
  return count >= 2 ? "pièces" : "pièce";
}

// Pièces à 0,01 près au-dessus, au moins 0,01.
function displayPieces(qty: number): number {
  return Math.max(0.01, ceilTo(qty, 0.01));
}

// 4 chiffres significatifs, virgule décimale, sans séparateur de milliers ni écriture scientifique : « 0,003 »,
// « 0,3333 », « 1234 », « 250,2 ». Une quantité positive ne devient jamais 0.
function cookingNumber(qty: number): string {
  return qty.toLocaleString("fr-FR", { maximumSignificantDigits: 4, useGrouping: false });
}

// Affichage seulement : g et ml entiers au-dessus (1 au moins) puis kg et L à partir de 1000 ; pièces à 0,01 près
// au-dessus.
export function quantityText(qty: number, unit: Unit): string {
  if (unit === "piece") {
    const pieces = displayPieces(qty);
    return `${decimal(pieces)} ${pieceWord(pieces)}`;
  }
  const small = Math.max(1, ceilTo(qty, 1));
  if (small < 1000) return `${small} ${unit}`;
  return `${decimal(ceilTo(qty / 1000, 0.01))} ${unit === "g" ? "kg" : "L"}`;
}

// Quantité au moment de s'en servir : pas d'arrondi pour l'achat, g et ml restent dans leur unité.
export function cookingQuantityText(qty: number, unit: Unit): string {
  const text = cookingNumber(qty);
  if (unit !== "piece") return `${text} ${unit}`;
  return `${text} ${pieceWord(Number(text.replace(",", ".")))}`;
}

// Mots de liaison : le pluriel s'arrête au premier (« cuisses de poulet », pas « cuisses de poulets »).
const LINKS = new Set(["de", "à", "au", "aux", "en"]);

function pluralWord(word: string): string {
  if (/[sxz]$/i.test(word)) return word;
  return `${word}${/(eau|au)$/i.test(word) ? "x" : "s"}`;
}

// Pluriel de chaque mot avant le premier mot de liaison (de, d', à, au, aux, en) : « hareng fumé » donne « harengs
// fumés », « cuisse de poulet » donne « cuisses de poulet », « poireau » donne « poireaux ».
function pluralName(name: string): string {
  const words = name.split(" ");
  const stop = words.findIndex((word) => LINKS.has(word.toLowerCase()) || /^d['’]/i.test(word));
  const end = stop === -1 ? words.length : stop;
  return [...words.slice(0, end).map(pluralWord), ...words.slice(end)].join(" ");
}

// Élision de « de » devant une voyelle ou un h muet (« d'oignon », « d'huile d'olive »), jamais devant un h aspiré
// (« de haricot »). Le h muet n'est reconnu que pour les mots courants de la cuisine.
const MUTE_H = /^(huile|herbe)/i;
function ofName(name: string): string {
  return /^[aeiouàâäéèêëîïôöùûüœæ]/i.test(name) || MUTE_H.test(name) ? `d'${name}` : `de ${name}`;
}

// « 600 g de poireau », « 100 g d'oignon », « 2 cuisses de poulet », « 100 g + 2 pièces d'oignon » : une somme par
// unité, dans l'ordre g, ml, pièce. Des pièces seules se disent avec le nom : « 2 oignons ».
export function quantityPhrase(
  totals: readonly { unit: Unit; qty: number }[],
  name: string,
  mode: QuantityMode,
): string {
  const sorted = [...totals].sort((a, b) => UNITS.indexOf(a.unit) - UNITS.indexOf(b.unit));
  const only = sorted.length === 1 ? sorted[0] : undefined;
  if (only?.unit === "piece") {
    const count = mode === "display" ? decimal(displayPieces(only.qty)) : cookingNumber(only.qty);
    return `${count} ${Number(count.replace(",", ".")) >= 2 ? pluralName(name) : name}`;
  }
  const amount = mode === "display" ? quantityText : cookingQuantityText;
  return `${sorted.map((total) => amount(total.qty, total.unit)).join(" + ")} ${ofName(name)}`;
}
