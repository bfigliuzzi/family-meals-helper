import { removeInvisible } from "../domain/invisible.ts";

// Les noms, descriptions et constats viennent de l'IA : pas de caractère de contrôle, de séparateur Unicode ni de
// caractère invisible dans le terminal ni dans le PDF. Les caractères invisibles (`domain/invisible.ts`, marques de
// direction comprises) sont retirés ; les contrôles C0 et C1 et les séparateurs de ligne et de paragraphe (U+2028,
// U+2029) deviennent une espace.
export function printable(line: string): string {
  return Array.from(removeInvisible(line), (char) => {
    const code = char.codePointAt(0)!;
    const control = code <= 0x1f || (code >= 0x7f && code <= 0x9f);
    return control || code === 0x2028 || code === 0x2029 ? " " : char;
  }).join("");
}

// Vrai quand il ne reste rien à lire une fois le texte passé par `printable` : le contrôle refuse un tel texte, qui
// serait vide dans le terminal et sur la fiche.
export function isBlankWhenPrinted(text: string): boolean {
  return printable(text).trim() === "";
}
