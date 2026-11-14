import { describe, expect, it } from "vitest";
import { removeInvisible } from "./invisible.ts";

describe("removeInvisible", () => {
  it("retire le trait d'union conditionnel sans couper le mot", () => {
    expect(removeInvisible("anti\u00adoxydant")).toBe("antioxydant");
  });
  it("retire U+200B, U+200C, U+200D, U+2060 et U+FEFF, sans rien mettre à leur place", () => {
    expect(removeInvisible("a\u200bb\u200cc\u200dd\u2060e\ufefff")).toBe("abcdef");
  });
  it.each([
    ["U+034F graphème combinant invisible", "\u034f"],
    ["U+2061 application de fonction", "\u2061"],
    ["U+FE0F sélecteur de variante", "\ufe0f"],
    ["U+202E inversion de direction", "\u202e"],
    ["U+2066 isolat de direction", "\u2066"],
    ["U+E0001 étiquette de langue", "\u{e0001}"],
    ["U+3164 remplissage hangul", "\u3164"],
  ])("retire %s", (_, char) => {
    expect(removeInvisible(`pou${char}let`)).toBe("poulet");
  });
  it("laisse intacts les accents, « œ », les guillemets, les tirets, l'apostrophe et les espaces insécables", () => {
    const text = "éèêëàâäîïôöûüùçœæ Œ «» – — ’ 4 °C a b c";
    expect(removeInvisible(text)).toBe(text);
  });
  it("laisse les séparateurs de ligne et les contrôles à `printable`", () => {
    const text = "a\u2028b\u2029c\u001bd\te";
    expect(removeInvisible(text)).toBe(text);
  });
  it("garde les caractères voisins des plages (U+00AC, U+00AE, U+200A, U+2010, U+205F, U+2070)", () => {
    const text = "¬® ‐ ⁰";
    expect(removeInvisible(text)).toBe(text);
  });
});
