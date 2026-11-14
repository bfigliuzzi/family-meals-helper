import { describe, expect, it } from "vitest";
import { removeInvisible } from "../domain/invisible.ts";
import { SEASON_TABLE } from "../season/season-table.ts";
import { lightNormalize, normalizeName } from "./normalize.ts";
import { REFERENTIAL } from "./referential.ts";

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
  it("garde le s de « pâtes » pour ne pas le confondre avec « pâte » ou « pâté »", () => {
    expect(normalizeName("pâté")).not.toBe(normalizeName("pâtes"));
    expect(normalizeName("pâte")).not.toBe(normalizeName("pâtes"));
    expect(normalizeName("pates")).toBe(normalizeName("pâtes"));
    expect(normalizeName("pâté")).toBe(normalizeName("pâte"));
  });
});

describe("lightNormalize : caractères invisibles", () => {
  it("les retire avant de comparer : le mot lu est celui que la fiche imprime", () => {
    expect(lightNormalize("Pou\u200blet")).toBe("poulet");
    expect(normalizeName("ca\u00adrottes")).toBe("carotte");
    expect(lightNormalize("a\u2060b\ufeffc")).toBe("abc");
  });
  it("retire les marques de direction, mais garde U+2028 comme séparateur, comme à l'impression", () => {
    expect(lightNormalize("Pou\u202elet")).toBe("poulet");
    expect(lightNormalize("Pou\u2028let")).toBe("pou let");
  });
  it("retire aussi U+034F, U+2061 et U+FE0F", () => {
    expect(lightNormalize("Pou\u034fl\u2061e\ufe0ft")).toBe("poulet");
  });
  it("ne change aucun nom du référentiel ni de la table de saison", () => {
    const names = [
      ...REFERENTIAL.flatMap((ref) => [ref.name, ...ref.synonyms, ...ref.variants]),
      ...Object.keys(SEASON_TABLE),
    ];
    expect(names.length).toBeGreaterThan(100);
    expect(names.filter((name) => removeInvisible(name) !== name)).toEqual([]);
  });
});
