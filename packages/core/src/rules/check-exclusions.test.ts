import { describe, expect, it } from "vitest";
import type { Category, IngredientRef } from "../domain/ingredient.ts";
import type { Menu } from "../domain/menu.ts";
import { buildIngredientIndex } from "../ingredients/index-lookup.ts";
import { REFERENTIAL } from "../ingredients/referential.ts";
import { SEASON_TABLE } from "../season/season-table.ts";
import { checkExclusions, excludedTermsIn, unknownExclusionTerms } from "./check-exclusions.ts";
import type { CheckContext } from "./context.ts";

const index = buildIngredientIndex(REFERENTIAL);

function ctxFor(exclusion: string): CheckContext {
  return {
    request: "un plat",
    exclusions: [exclusion],
    month: 7,
    sessionDay: "sun",
    dinners: 1,
    index,
    seasonTable: SEASON_TABLE,
  };
}

interface Options {
  category?: Category | null;
  sameDay?: boolean;
  dish?: string;
}

function menuWith(ingredient: string, options: Options): Menu {
  const { category = null, sameDay = false, dish = "Plat" } = options;
  return {
    dishes: [
      {
        name: dish,
        day: "mon",
        ingredients: [
          { name: ingredient, qty: 1, unit: "piece", form: "fresh", category, sameDay },
        ],
        phases: [],
      },
    ],
  };
}

function excluded(exclusion: string, ingredient: string, options: Options = {}): boolean {
  const findings = checkExclusions(menuWith(ingredient, options), ctxFor(exclusion));
  for (const finding of findings) {
    expect(finding).toMatchObject({ level: "error", rule: "exclusion" });
  }
  return findings.length > 0;
}

describe("checkExclusions : ingrédients connus", () => {
  it("exclut par nom exact, pluriel et majuscules", () => {
    expect(excluded("courgette", "courgette")).toBe(true);
    expect(excluded("courgette", "Courgettes")).toBe(true);
  });
  it("exclut par synonyme et par variante", () => {
    expect(excluded("paleron", "bœuf à braiser")).toBe(true);
    expect(excluded("courgette", "courgette jaune")).toBe(true);
  });
  it("exclut par groupe", () => {
    for (const name of ["blanc de poulet", "cuisse de poulet", "poulet entier"]) {
      expect(excluded("poulet", name)).toBe(true);
    }
    expect(excluded("poulet", "dinde")).toBe(false);
    for (const name of ["échine de porc", "saucisse", "lardons"]) {
      expect(excluded("porc", name)).toBe(true);
    }
    expect(excluded("bœuf", "bœuf à braiser")).toBe(true);
    expect(excluded("bœuf", "bœuf haché")).toBe(true);
    expect(excluded("tomate", "tomate concassée")).toBe(true);
    expect(excluded("tomate", "concentré de tomate")).toBe(true);
  });
  it("exclut par groupe de catégorie", () => {
    expect(excluded("viande", "dinde")).toBe(true);
    expect(excluded("viande", "lardons")).toBe(true);
    expect(excluded("volaille", "bouillon de volaille")).toBe(true);
    expect(excluded("poisson", "saumon")).toBe(true);
    expect(excluded("fromage", "parmesan")).toBe(true);
  });
  it("n'exclut pas pomme de terre par pomme", () => {
    expect(excluded("pomme", "pomme de terre")).toBe(false);
  });
  it("distingue chou-fleur et chou", () => {
    expect(excluded("chou-fleur", "chou vert")).toBe(false);
    expect(excluded("chou", "chou vert")).toBe(true);
    expect(excluded("chou", "chou-fleur")).toBe(true);
  });
  it("exclut aussi un accompagnement du soir même", () => {
    expect(excluded("courgette", "courgette", { sameDay: true })).toBe(true);
  });
});

describe("checkExclusions : pâtes, sardine et maquereau", () => {
  it("n'exclut pas un pâté chinois ni une pâte à pizza avec --exclude pâtes", () => {
    expect(excluded("pâtes", "carotte", { dish: "Pâté chinois" })).toBe(false);
    expect(excluded("pâtes", "pâte à pizza", { category: "refined-starch" })).toBe(false);
    expect(excluded("pâtes", "spaghetti")).toBe(true);
  });
  it("exclut sardine et maquereau avec --exclude", () => {
    expect(excluded("sardine", "sardine")).toBe(true);
    expect(excluded("maquereau", "maquereau")).toBe(true);
    expect(excluded("sardine", "maquereau")).toBe(false);
  });
});

describe("checkExclusions : ingrédients inconnus", () => {
  it("exclut un nom complet qui n'est la clé d'aucune entrée", () => {
    expect(excluded("courgette spaghetti", "courgette spaghetti")).toBe(true);
    expect(excluded("courgette", "courgette spaghetti")).toBe(true);
    expect(excluded("romanesco", "romanesco")).toBe(true);
  });
  it("n'exclut pas pommes de terre nouvelles par pomme", () => {
    expect(excluded("pomme", "pommes de terre nouvelles")).toBe(false);
  });
  it("exclut un mot-groupe : poulet inconnu par volaille", () => {
    expect(excluded("volaille", "poulet", { category: "poultry" })).toBe(true);
    expect(excluded("viande", "poulet", { category: "poultry" })).toBe(true);
  });
  it("exclut par la catégorie reçue", () => {
    expect(excluded("viande", "bœuf", { category: "red-meat" })).toBe(true);
    expect(excluded("porc", "jambon cru", { category: "cured-meat" })).toBe(true);
    expect(excluded("poisson", "truite", { category: "fish" })).toBe(true);
    expect(excluded("poisson", "truite", { category: "vegetable" })).toBe(false);
  });
});

describe("checkExclusions : caractères invisibles", () => {
  it("repère « poulet » dans un nom de plat coupé par une espace sans chasse", () => {
    const findings = checkExclusions(
      menuWith("carotte", { dish: "Pou\u200blet aux carottes" }),
      ctxFor("poulet"),
    );
    expect(findings).toEqual([
      expect.objectContaining({ level: "error", rule: "exclusion", dish: 0, ingredient: null }),
    ]);
  });
  it("exclut un ingrédient « poulet » coupé par un trait d'union conditionnel", () => {
    expect(excluded("poulet", "pou\u00adlet")).toBe(true);
  });
  it.each([
    ["un graphème combinant invisible (U+034F)", "\u034f"],
    ["une application de fonction (U+2061)", "\u2061"],
    ["un sélecteur de variante (U+FE0F)", "\ufe0f"],
  ])("repère « poulet » coupé par %s, dans le nom du plat et dans l'ingrédient", (_, char) => {
    const findings = checkExclusions(
      menuWith("carotte", { dish: `Pou${char}let aux carottes` }),
      ctxFor("poulet"),
    );
    expect(findings).toEqual([
      expect.objectContaining({ level: "error", rule: "exclusion", dish: 0, ingredient: null }),
    ]);
    expect(excluded("poulet", `pou${char}let`)).toBe(true);
  });
  it("exclut un ingrédient « cuisse de poulet » coupé par un joint sans chasse", () => {
    expect(excluded("poulet", "cuisse de pou\u200dlet")).toBe(true);
  });
});

describe("checkExclusions : nom du plat", () => {
  function dishFindings(exclusion: string, dish: string) {
    return checkExclusions(menuWith("carotte", { dish }), ctxFor(exclusion));
  }
  it("repère un terme exclu dans le nom du plat", () => {
    const findings = dishFindings("courgette", "Gratin de courgettes");
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      level: "error",
      rule: "exclusion",
      dish: 0,
      ingredient: null,
    });
    expect(findings[0]?.message).toContain("Gratin de courgettes");
    expect(dishFindings("volaille", "Poulet basquaise")).toHaveLength(1);
    expect(dishFindings("viande", "Poulet basquaise")).toHaveLength(1);
  });
  it("ne signale rien quand le nom du plat ne cite pas le terme", () => {
    expect(dishFindings("courgette", "Bœuf bourguignon")).toEqual([]);
    expect(dishFindings("pomme", "Gratin de pommes de terre")).toEqual([]);
  });
});

describe("checkExclusions : nom du plat lu en entier (invariant E2)", () => {
  // Aucune analyse de négation : « sans viande » compte comme une mention de viande.
  const nameFindings = (exclusion: string, dish: string, ingredient = "carotte") =>
    checkExclusions(menuWith(ingredient, { dish }), ctxFor(exclusion)).filter(
      (finding) => finding.ingredient === null,
    );
  it.each([
    ["Chili sans viande", "viande", 1],
    ["Lasagnes végétariennes (sans viande)", "viande", 1],
    ["Risotto (sans fromage) aux courgettes", "courgette", 1],
    ["Gratin sans crème (lardons)", "porc", 1],
    ["Quiche sans pâte aux lardons", "porc", 1],
    ["Gratin de courgettes", "courgette", 1],
    ["Bœuf bourguignon", "courgette", 0],
    ["Boulettes de viande à la tomate", "poulet", 0],
    ["Poulet basquaise", "viande", 1],
  ])("« %s » avec --exclude %s : %i constat(s) sur le nom", (dish, exclusion, count) => {
    expect(nameFindings(exclusion, dish)).toHaveLength(count);
  });
  it("ne double pas le constat de l'ingrédient (règle E3)", () => {
    const findings = checkExclusions(
      menuWith("courgette", { dish: "Gratin de courgettes" }),
      ctxFor("courgette"),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.ingredient).toBe("courgette");
  });
});

describe("checkExclusions : mots-groupes par intersection", () => {
  const dishFindings = (exclusion: string, dish: string) =>
    checkExclusions(menuWith("carotte", { dish }), ctxFor(exclusion));
  it("ne confond pas viande avec poulet, bœuf ou porc", () => {
    expect(dishFindings("poulet", "Boulettes de viande à la tomate")).toEqual([]);
    expect(dishFindings("bœuf", "Hachis de viande")).toEqual([]);
    expect(excluded("porc", "boulettes de viande", { category: "red-meat" })).toBe(false);
  });
  it("garde les exclusions voulues", () => {
    expect(dishFindings("viande", "Poulet basquaise")).toHaveLength(1);
    expect(excluded("volaille", "poulet", { category: "poultry" })).toBe(true);
  });
  it("lit les groupes dans l'index reçu, pas dans le vrai référentiel", () => {
    const small = REFERENTIAL.filter((ref) => ref.name === "carotte" || ref.name === "courgette");
    const ctx: CheckContext = { ...ctxFor("volaille"), index: buildIngredientIndex(small) };
    expect(checkExclusions(menuWith("carotte", { dish: "Poulet rôti" }), ctx)).toEqual([]);
  });
  it("calcule les groupes portés sur l'index reçu (index réduit à blanc de poulet)", () => {
    // Dans cet index, seul blanc de poulet porte « viande » : viande porte donc aussi volaille.
    // Dans le vrai référentiel, l'intersection serait {viande} et il n'y aurait aucun constat.
    const small = REFERENTIAL.filter((ref) => ref.name === "blanc de poulet");
    const ctx: CheckContext = { ...ctxFor("volaille"), index: buildIngredientIndex(small) };
    const findings = checkExclusions(menuWith("carotte", { dish: "Boulettes de viande" }), ctx);
    expect(findings).toHaveLength(1);
  });
  it("trouve un groupe absent du vrai référentiel (index de deux agrumes fabriqués)", () => {
    const citrus = (name: string): IngredientRef => ({
      name,
      synonyms: [],
      variants: [],
      groups: ["agrume", "fruit d'hiver"],
      category: "fruit",
      defaultForm: "fresh",
      pantry: false,
      seasonExempt: false,
    });
    const ctx: CheckContext = {
      ...ctxFor("fruit d'hiver"),
      index: buildIngredientIndex([citrus("clémentine"), citrus("pomelo")]),
    };
    const findings = checkExclusions(menuWith("farine", { dish: "Tarte aux agrumes" }), ctx);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.ingredient).toBeNull();
  });
  it("lit aussi les groupes portés dans l'index reçu (index réduit à veau)", () => {
    const small = REFERENTIAL.filter((ref) => ref.name === "veau");
    const ctx: CheckContext = { ...ctxFor("poulet"), index: buildIngredientIndex(small) };
    expect(checkExclusions(menuWith("carotte", { dish: "Veau à la viande" }), ctx)).toEqual([]);
  });
});

describe("checkExclusions : pas de doublon sur le nom du plat", () => {
  it("ne signale que l'ingrédient quand il est déjà exclu", () => {
    const findings = checkExclusions(
      menuWith("courgette", { dish: "Gratin de courgettes" }),
      ctxFor("courgette"),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.ingredient).toBe("courgette");
  });
});

describe("checkExclusions : message", () => {
  it("rédige le message avec le terme d'exclusion", () => {
    const findings = checkExclusions(menuWith("blanc de poulet", {}), ctxFor("poulet"));
    expect(findings[0]?.message).toBe("« blanc de poulet » est exclu (exclusion : poulet).");
  });
});

describe("unknownExclusionTerms", () => {
  it("liste les termes qui ne sont ni clé, ni groupe du référentiel, ni groupe de catégorie", () => {
    expect(
      unknownExclusionTerms(
        ["gluten", "courgette", "poulet", "volaille", "poisson", "Pommes"],
        index,
      ),
    ).toEqual(["gluten"]);
  });
});

describe("excludedTermsIn : texte libre (étapes, soirs, phases)", () => {
  it("trouve le beurre et le fromage (parmesan) dans un texte, tels qu'écrits par l'utilisateur", () => {
    expect(
      excludedTermsIn(
        "Finir avec une noix de beurre et du parmesan.",
        ["beurre", "Fromage"],
        index,
      ),
    ).toEqual(["beurre", "Fromage"]);
  });
  it("ne trouve rien dans un texte qui ne cite pas le terme", () => {
    expect(excludedTermsIn("Poêler à sec, feu vif.", ["beurre"], index)).toEqual([]);
  });
  it("trouve un terme coupé par un caractère invisible ou écrit au pluriel", () => {
    expect(excludedTermsIn("Ajouter du beu\u200brre fondu.", ["beurre"], index)).toEqual([
      "beurre",
    ]);
    expect(excludedTermsIn("Des noix de cajou grillées.", ["noix de cajou"], index)).toEqual([
      "noix de cajou",
    ]);
  });
  it("lit le texte sans analyse de négation : « sans beurre » cite le beurre", () => {
    expect(excludedTermsIn("Cuire sans beurre.", ["beurre"], index)).toEqual(["beurre"]);
  });
});

describe("checkExclusions : descriptions de phases (imprimées sur la fiche de repli)", () => {
  it("refuse une phase qui cite un ingrédient exclu", () => {
    const menu = menuWith("carotte", {});
    menu.dishes[0]!.phases = [
      {
        id: "a1",
        description: "Faire fondre le beurre",
        minutes: 5,
        appliance: "induction",
        attended: true,
        after: [],
      },
    ];
    expect(checkExclusions(menu, ctxFor("beurre"))).toEqual([
      expect.objectContaining({
        level: "error",
        rule: "exclusion",
        dish: 0,
        message:
          "La phase « a1 » cite un ingrédient exclu (exclusion : beurre) : décris-la sans le nommer.",
      }),
    ]);
  });
});
