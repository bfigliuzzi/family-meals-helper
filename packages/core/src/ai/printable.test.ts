import { describe, expect, it } from "vitest";
import { isBlankWhenPrinted, printable } from "./printable.ts";

describe("printable", () => {
  it("remplace les caractères de contrôle C0 et C1 par une espace", () => {
    expect(printable("a\u0000b\u0007c\u001bd\u007fe\u0085f\u009fg")).toBe("a b c d e f g");
  });
  it.each([
    ["U+2028 séparateur de ligne", "\u2028"],
    ["U+2029 séparateur de paragraphe", "\u2029"],
  ])("remplace %s par une espace", (_, char) => {
    expect(printable(`avant${char}après`)).toBe("avant après");
  });
  it.each([
    ["U+200E marque gauche-droite", "\u200e"],
    ["U+200F marque droite-gauche", "\u200f"],
    ["U+202A", "\u202a"],
    ["U+202B", "\u202b"],
    ["U+202C", "\u202c"],
    ["U+202D", "\u202d"],
    ["U+202E inversion de direction", "\u202e"],
    ["U+2066", "\u2066"],
    ["U+2067", "\u2067"],
    ["U+2068", "\u2068"],
    ["U+2069", "\u2069"],
  ])("supprime %s, sans espace à sa place", (_, char) => {
    expect(printable(`avant${char}après`)).toBe("avantaprès");
  });
  it("imprime « Pou\\u202Elet » comme « Poulet », le mot que lit le contrôle", () => {
    expect(printable("Pou\u202elet")).toBe("Poulet");
  });
  it("laisse intacts les accents, « œ », les guillemets, les tirets et les espaces insécables", () => {
    const text = "éèêëàâäîïôöûüùçœæ Œ «» – — ’ 4 °C a b c";
    expect(printable(text)).toBe(text);
  });
  it("laisse une espace ordinaire telle quelle", () => {
    expect(printable("a b")).toBe("a b");
  });
  it("garde les caractères voisins des plages (U+00AC, U+00AE, U+200A, U+2010, U+2030, U+205F, U+2070)", () => {
    for (const char of ["¬", "®", " ", "‐", "‰", " ", "⁰"]) {
      expect(printable(`x${char}y`)).toBe(`x${char}y`);
    }
  });
  it("supprime le trait d'union conditionnel sans couper le mot", () => {
    expect(printable("anti\u00adoxydant")).toBe("antioxydant");
  });
  it("supprime les caractères sans glyphe, sans espace à leur place", () => {
    expect(printable("a\u200bb\u2060c\ufeffd")).toBe("abcd");
    expect(printable("x\u200cy\u200dz")).toBe("xyz");
    expect(printable("p\u034fo\u2061u\ufe0fl\u{e0001}e\u3164t")).toBe("poulet");
  });
});

describe("isBlankWhenPrinted", () => {
  it.each([
    ["une chaîne vide", ""],
    ["des espaces", "  "],
    ["un échappement et une inversion de direction", "\u001b\u202e"],
    ["des séparateurs et un isolat de direction", "\u2028\u2029\u2066\t"],
    ["une espace sans chasse", "\u200b"],
    ["un joint sans chasse", "\u200d"],
    ["un trait d'union conditionnel", "\u00ad"],
    ["un gluon de mots", "\u2060"],
    ["une marque d'ordre des octets", "\ufeff"],
    ["une espace sans chasse, une espace et un non-joint", "\u200b \u200c"],
    ["un graphème combinant invisible (U+034F)", "\u034f"],
    ["une application de fonction (U+2061)", "\u2061"],
    ["un sélecteur de variante (U+FE0F)", "\ufe0f"],
    ["une inversion de direction seule (U+202E)", "\u202e"],
    ["un isolat de direction seul (U+2066)", "\u2066"],
    ["une étiquette de langue (U+E0001)", "\u{e0001}"],
    ["un remplissage hangul (U+3164)", "\u3164"],
    ["U+034F, U+2061 et U+FE0F ensemble", "\u034f\u2061\ufe0f"],
  ])("vrai pour %s", (_, text) => {
    expect(isBlankWhenPrinted(text)).toBe(true);
  });
  it("faux dès qu'il reste une lettre à lire", () => {
    expect(isBlankWhenPrinted("\u001b\u202eRéchauffer\u2069")).toBe(false);
  });
});
