import { describe, expect, it } from "vitest";
import { CATEGORY_GROUPS, IngredientRefSchema } from "../domain/ingredient.ts";
import { groupsOf } from "./groups.ts";
import { buildIngredientIndex } from "./index-lookup.ts";
import { normalizeName } from "./normalize.ts";
import { REFERENTIAL } from "./referential.ts";

const EXPECTED_PANTRY = [
  "poivre",
  "thym",
  "laurier",
  "cumin",
  "curry",
  "paprika",
  "muscade",
  "piment d'Espelette",
  "herbes de Provence",
  "cannelle",
  "sel",
  "huile d'olive",
  "huile de tournesol",
  "vinaigre de vin",
  "vinaigre balsamique",
  "moutarde",
  "sauce soja",
  "bouillon de volaille",
  "bouillon de légumes",
  "concentré de tomate",
  "farine",
  "sucre",
  "miel",
];

describe("référentiel", () => {
  it("a au moins 100 entrées valides", () => {
    expect(REFERENTIAL.length).toBeGreaterThanOrEqual(100);
    for (const ref of REFERENTIAL) expect(IngredientRefSchema.safeParse(ref).success).toBe(true);
  });

  it("n'a aucune clé partagée entre deux entrées", () => {
    expect(() => buildIngredientIndex(REFERENTIAL)).not.toThrow();
  });

  it("n'a aucun groupe qui désigne une clé d'une entrée qui ne le porte pas", () => {
    const index = buildIngredientIndex(REFERENTIAL);
    const groups = new Set([
      ...REFERENTIAL.flatMap((ref) => ref.groups),
      ...Object.values(CATEGORY_GROUPS).flat(),
    ]);
    for (const group of groups) {
      const owner = index.find(group);
      // exception admise : l'entrée désignée porte elle-même le groupe (tomate, pâtes)
      if (owner !== undefined) expect(groupsOf(owner), group).toContain(normalizeName(group));
    }
  });

  it("exempte du contrôle de saison exactement l'ail, l'oignon, l'échalote et le citron", () => {
    const exempt = REFERENTIAL.filter((ref) => ref.seasonExempt).map((ref) => ref.name);
    expect(exempt.sort()).toEqual(["ail", "citron", "oignon", "échalote"]);
  });

  it("marque placard exactement la liste attendue", () => {
    const pantry = REFERENTIAL.filter((ref) => ref.pantry).map((ref) => ref.name);
    expect(pantry.sort()).toEqual([...EXPECTED_PANTRY].sort());
  });

  it("range la saucisse dans la charcuterie, avec ses groupes porc et viande", () => {
    const sausage = REFERENTIAL.find((ref) => ref.name === "saucisse")!;
    expect(sausage.category).toBe("cured-meat");
    expect(groupsOf(sausage)).toEqual(expect.arrayContaining(["porc", "viande"]));
  });

  it("n'achète le poisson que surgelé (rayon surgelés) ou en conserve", () => {
    const byName = (name: string) => REFERENTIAL.find((ref) => ref.name === name)!;
    for (const name of ["saumon", "maquereau", "cabillaud", "colin"]) {
      expect(byName(name), name).toMatchObject({ defaultForm: "frozen", aisle: "frozen" });
    }
    expect(byName("saumon").category).toBe("oily-fish");
    expect(byName("cabillaud").category).toBe("fish");
    for (const name of ["thon", "sardine"]) expect(byName(name).defaultForm).toBe("canned");
  });

  it("retrouve des entrées précises", () => {
    const index = buildIngredientIndex(REFERENTIAL);
    expect(index.find("courgette jaune")?.name).toBe("courgette");
    expect(index.find("paleron")?.name).toBe("bœuf à braiser");
    expect(index.find("pomme de terre")).not.toBe(index.find("pomme"));
    expect(index.find("chou-fleur")).not.toBe(index.find("chou vert"));
  });
});
