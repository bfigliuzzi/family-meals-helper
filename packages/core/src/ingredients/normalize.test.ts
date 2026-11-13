import { describe, expect, it } from "vitest";
import { normalizeName } from "./normalize.ts";

describe("normalizeName", () => {
  it("passe en minuscules et remplace œ", () => {
    expect(normalizeName("Bœuf")).toBe("boeuf");
  });
  it("remplace les tirets par des espaces", () => {
    expect(normalizeName("Chou-Fleur")).toBe("chou fleur");
  });
  it("ignore le pluriel", () => {
    expect(normalizeName("courgettes")).toBe(normalizeName("courgette"));
    expect(normalizeName("petits pois")).toBe(normalizeName("petit pois"));
  });
  it("ignore les accents", () => {
    expect(normalizeName("Échalote")).toBe(normalizeName("echalote"));
  });
  it("laisse un mot court inchangé", () => {
    expect(normalizeName("riz")).toBe("riz");
  });
  it("traite les apostrophes comme des espaces", () => {
    expect(normalizeName("huile d'olive")).toBe("huile d olive");
  });
});
