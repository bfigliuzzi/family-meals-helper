import { describe, expect, it } from "vitest";
import { buildIngredientIndex, containsWords } from "./index-lookup.ts";
import { REFERENTIAL } from "./referential.ts";

const index = buildIngredientIndex(REFERENTIAL);
const names = (refs: readonly { name: string }[]) => refs.map((ref) => ref.name);

describe("scan", () => {
  it("rattache « pommes de terre » à pomme de terre, pas à pomme", () => {
    const { refs, rest } = index.scan("pommes de terre nouvelles");
    expect(names(refs)).toEqual(["pomme de terre"]);
    expect(rest).toBe("nouvelle");
  });
  it("ne devine pas le sens : courgette spaghetti donne courgette et pâtes", () => {
    const { refs, rest } = index.scan("courgette spaghetti");
    expect(names(refs)).toEqual(["courgette", "pâtes"]);
    expect(rest).toBe("");
  });
  it("laisse un inconnu dans le reste", () => {
    const { refs, rest } = index.scan("romanesco");
    expect(refs).toEqual([]);
    expect(rest).toBe("romanesco");
  });
  it("reconnaît une variante", () => {
    expect(names(index.scan("tomates cerises").refs)).toEqual(["tomate"]);
  });
});

describe("requestedIn", () => {
  const requested = (request: string) => names(index.requestedIn(request));
  // Invariant N : la négation porte jusqu'à la fin de la phrase (. ; ! ? retour à la ligne),
  // parenthèses comprises ; aucune clé n'enjambe deux phrases.
  it.each([
    ["pas de légumes d'été (tomates, courgettes, aubergines)", []],
    ["sans tomate (bio), courgettes et aubergines", []],
    ["des courgettes (pas de tomates)", ["courgette"]],
    ["des tomates (bio) sans courgette", ["tomate"]],
    ["sans tomate ni courgette", []],
    ["sans tomate, courgette et aubergine", []],
    ["sans tomate, avec des courgettes", []],
    ["pas de plat avec des tomates", []],
    ["pas de courgette mais des tomates", []],
    ["évite les tomates", []],
    ["jamais de tomate", []],
    ["sans tomate. Des courgettes", ["courgette"]],
    ["sans tomate\ndes courgettes", ["courgette"]],
    ["des tomates sauf si pas de saison", ["tomate"]],
    ["un plat de chou. Fleur de sel pour finir", ["sel"]],
    ["des pommes. De terre", ["pomme"]],
    ["du céleri; rave", []],
    ["des pommes de terre", ["pomme de terre"]],
    ["un bœuf bourguignon, 5 dîners", ["bœuf à braiser"]],
    ["des courgettes mais pas de tomate", ["courgette"]],
    ["Mais du maïs", ["maïs"]],
    ["pas de courgette mais des tomates", []],
  ])("« %s » donne %j", (request, expected) => {
    expect(requested(request)).toEqual(expected);
  });
  it("traite aussi éviter, évitez et aucun comme des négations", () => {
    expect(requested("il faut éviter les tomates")).toEqual([]);
    expect(requested("évitez les tomates")).toEqual([]);
    expect(requested("aucune tomate")).toEqual([]);
  });
});

describe("find", () => {
  it("trouve par nom, synonyme ou variante", () => {
    expect(index.find("courgette jaune")?.name).toBe("courgette");
    expect(index.find("paleron")?.name).toBe("bœuf à braiser");
    expect(index.find("Courgettes")?.name).toBe("courgette");
  });
  it("distingue des entrées proches", () => {
    expect(index.find("pomme de terre")).not.toBe(index.find("pomme"));
    expect(index.find("chou-fleur")).not.toBe(index.find("chou vert"));
  });
  it("ne trouve rien pour un inconnu", () => {
    expect(index.find("romanesco")).toBeUndefined();
  });
  it("ne prend ni pâté ni pâte à pizza pour des pâtes", () => {
    expect(index.find("pâté")).toBeUndefined();
    expect(index.find("pâte à pizza")).toBeUndefined();
    expect(index.find("pâtes")?.name).toBe("pâtes");
    expect(index.find("spaghetti")?.name).toBe("pâtes");
  });
});

describe("buildIngredientIndex", () => {
  it("refuse deux entrées qui partagent une clé", () => {
    const [first] = REFERENTIAL;
    const clone = { ...first!, name: "ail bis", synonyms: ["ail"] };
    expect(() => buildIngredientIndex([first!, clone])).toThrow(/partagée/);
  });
});

describe("containsWords", () => {
  it("cherche en mots entiers", () => {
    expect(containsWords("courgette spaghetti", "courgette")).toBe(true);
    expect(containsWords("courgettes", "courgette")).toBe(true);
    expect(containsWords("poivron", "poivre")).toBe(false);
  });
});
