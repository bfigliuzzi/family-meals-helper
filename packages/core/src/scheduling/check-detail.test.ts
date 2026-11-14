import { describe, expect, it } from "vitest";
import type { Detail, DetailStep } from "../domain/detail.ts";
import type { IngredientRef } from "../domain/ingredient.ts";
import type { Menu } from "../domain/menu.ts";
import { HOUSEHOLD_EQUIPMENT } from "../equipment/household.ts";
import { buildIngredientIndex } from "../ingredients/index-lookup.ts";
import { REFERENTIAL } from "../ingredients/referential.ts";
import { checkMenu } from "../rules/check-menu.ts";
import { autumnDetail, balancedDetail } from "../rules/fixtures/detail.ts";
import { autumnMenu, balancedMenu } from "../rules/fixtures/menus.ts";
import { SEASON_TABLE } from "../season/season-table.ts";
import { checkDetail, isAdmissible, stepsAsMenu } from "./check-detail.ts";
import type { DetailCheck } from "./check-detail.ts";

const index = buildIngredientIndex(REFERENTIAL);
const menu = balancedMenu();

function run(
  detail: Detail,
  over: { menu?: Menu; refs?: readonly IngredientRef[]; exclusions?: readonly string[] } = {},
): DetailCheck {
  return checkDetail(
    over.menu ?? menu,
    detail,
    HOUSEHOLD_EQUIPMENT,
    over.refs === undefined ? index : buildIngredientIndex(over.refs),
    over.exclusions ?? [],
  );
}

// Détail de référence dont une étape est modifiée.
function withStep(id: string, over: Partial<DetailStep>): Detail {
  const detail = balancedDetail();
  return {
    ...detail,
    steps: detail.steps.map((step) => (step.id === id ? { ...step, ...over } : step)),
  };
}

// Le menu de référence dont le plat e est entièrement du soir.
function eveningLast(): Menu {
  const base = balancedMenu();
  return {
    dishes: base.dishes.map((dish, i) =>
      i === 4
        ? {
            ...dish,
            phases: [],
            ingredients: dish.ingredients.map((ing) => ({ ...ing, sameDay: true })),
          }
        : dish,
    ),
  };
}

function messages(check: DetailCheck, rule: string, level = "error"): string[] {
  return check.findings
    .filter((finding) => finding.rule === rule && finding.level === level)
    .map((finding) => finding.message);
}

describe("checkDetail : le couple d'automne de la fiche d'exemple", () => {
  it("ne donne aucun constat, ni sur le menu ni sur le détail", () => {
    const autumn = autumnMenu();
    const menuCheck = checkMenu(autumn, {
      request: "5 dîners",
      exclusions: [],
      month: 11,
      sessionDay: "sun",
      dinners: 5,
      index,
      seasonTable: SEASON_TABLE,
    });
    expect(menuCheck.findings).toEqual([]);
    const check = run(autumnDetail(), { menu: autumn });
    expect(check.findings).toEqual([]);
    expect(check.plan!.minutes).toBeLessThanOrEqual(150);
  });
});

describe("checkDetail : le détail de référence", () => {
  it("ne donne aucun constat et un planning de moins de 3 h", () => {
    const check = run(balancedDetail());
    expect(check.findings).toEqual([]);
    expect(check.plan).not.toBeNull();
    expect(check.plan!.minutes).toBeLessThan(180);
    expect(isAdmissible(check)).toBe(true);
  });
});

describe("checkDetail : lettres des plats", () => {
  it("refuse une lettre inconnue et une étape sans lettre", () => {
    expect(messages(run(withStep("s2", { dishes: ["c", "z"] })), "detail")).toEqual([
      "L'étape « s2 » cite le plat « z », qui n'existe pas.",
    ]);
    const empty = run(withStep("s2", { dishes: [], text: "Couper" }));
    expect(messages(empty, "detail")).toEqual([
      "L'étape « s2 » ne cite aucun plat : donne au moins une lettre dans `dishes`.",
    ]);
    expect(isAdmissible(empty)).toBe(false);
  });
  it("refuse une étape partagée dont le second plat est un plat du soir", () => {
    // Le planning ne voit que la première lettre : seul `checkDetail` peut voir ce « e ».
    const detail = balancedDetail();
    const shared: Detail = {
      ...detail,
      steps: detail.steps
        .filter((step) => !["s6", "s7", "s8"].includes(step.id))
        .map((step) => (step.id === "s4" ? { ...step, text: "Éplucher et couper {d.2}" } : step)),
    };
    const check = run(shared, { menu: eveningLast() });
    expect(messages(check, "phases")).toEqual([]);
    expect(messages(check, "detail")).toHaveLength(1);
    expect(messages(check, "detail")[0]).toContain("se prépare le soir même");
    expect(isAdmissible(check)).toBe(false);
  });
  it("dédoublonne les lettres et les références sans constat", () => {
    const check = run(
      withStep("s4", { dishes: ["d", "e", "d"], text: "Couper {d.2/e.1/d.2}, puis {d.2}" }),
    );
    expect(check.findings).toEqual([]);
  });
});

describe("checkDetail : repères d'ingrédients", () => {
  it("refuse un repère inconnu", () => {
    const check = run(withStep("s2", { text: "Couper {c.1}, {c.2} et {a.9}" }));
    expect(messages(check, "detail")).toEqual([
      "L'étape « s2 » cite le repère {a.9}, qui ne désigne aucun ingrédient du menu.",
    ]);
  });
  it.each(["{A.1}", "{a.1 / b.2}", "{a.x}", "{ça}", "une accolade seule }", "{c.01}"])(
    "refuse un repère mal formé : %s, ce qui donne un nouvel essai",
    (written) => {
      const check = run(withStep("s2", { text: `Couper {c.1} et {c.2}, puis ${written}` }));
      const found = messages(check, "detail");
      expect(found).toHaveLength(1);
      expect(found[0]).toContain("a un repère mal formé");
      expect(isAdmissible(check)).toBe(false);
    },
  );
  it("lit un repère coupé par un caractère invisible comme le contrôle et le rendu le lisent", () => {
    const check = run(withStep("s2", { text: "Couper {c.\u200b1} et {c\u2060.2}" }));
    expect(check.findings).toEqual([]);
  });
  it("refuse un titre de phase vide une fois imprimé", () => {
    const check = run(withStep("s2", { phase: "\u001b\u200b " }));
    expect(messages(check, "detail")).toEqual([
      "L'étape « s2 » n'a pas de titre de phase (`phase`).",
    ]);
  });
  it("refuse un texte vide une fois rendu, même fait de gras vide", () => {
    expect(messages(run(withStep("s2", { text: "\u200b" })), "phases")).toEqual([
      "La phase « s2 » n'a pas de description.",
    ]);
    // « **** » n'est pas du gras valide : il reste imprimé tel quel, donc non vide.
    expect(messages(run(withStep("s1", { text: "****" })), "phases")).toEqual([]);
  });
  it("refuse le repère d'un plat absent des lettres de l'étape", () => {
    const check = run(withStep("s2", { text: "Couper {c.1}, {c.2} et {d.1}" }));
    expect(messages(check, "detail")).toHaveLength(1);
    expect(messages(check, "detail")[0]).toContain("n'est pas dans ses `dishes`");
  });
  it("refuse le repère d'un ingrédient du soir même", () => {
    const check = run(withStep("s12", { text: "Laver {a.1} et {a.2}" }));
    expect(messages(check, "detail")).toHaveLength(1);
    expect(messages(check, "detail")[0]).toContain("ingrédient du soir même");
  });
});

describe("checkDetail : ingrédients non cités", () => {
  it("avertit seulement pour un ingrédient d'avance jamais cité", () => {
    const check = run(withStep("s12", { text: "Laver et émincer les poireaux" }));
    expect(messages(check, "detail", "warning")).toEqual([
      "non cité dans les étapes : poireau (a).",
    ]);
    expect(messages(check, "detail")).toEqual([]);
    expect(isAdmissible(check)).toBe(true);
  });
  it("ne compte pas comme cité un repère refusé", () => {
    const check = run(withStep("s12", { text: "Laver {a.1}", dishes: ["z"] }));
    expect(messages(check, "detail", "warning")).toEqual([
      "non cité dans les étapes : poireau (a).",
    ]);
  });
  it("ne dit rien d'un ingrédient du placard non cité, d'après l'index reçu", () => {
    const pantryRef = (pantry: boolean): IngredientRef => ({
      name: "poireau",
      synonyms: [],
      variants: [],
      groups: [],
      category: "vegetable",
      defaultForm: "fresh",
      pantry,
      seasonExempt: false,
    });
    const others = REFERENTIAL.filter((ref) => ref.name !== "poireau");
    const detail = withStep("s12", { text: "Laver et émincer les poireaux" });
    expect(
      messages(run(detail, { refs: [...others, pantryRef(true)] }), "detail", "warning"),
    ).toEqual([]);
    expect(
      messages(run(detail, { refs: [...others, pantryRef(false)] }), "detail", "warning"),
    ).toEqual(["non cité dans les étapes : poireau (a)."]);
  });
});

describe("checkDetail : quantité écrite à la main", () => {
  it("avertit, sans nouvel essai, pour une quantité écrite devant un ingrédient du menu", () => {
    const check = run(withStep("s12", { text: "Laver et émincer {a.1}, soit 600 g de poireaux" }));
    expect(messages(check, "detail", "warning")).toEqual([
      "quantité écrite à la main pour poireau : utilise {a.1}.",
    ]);
    expect(messages(check, "detail")).toEqual([]);
    expect(isAdmissible(check)).toBe(true);
  });
  it.each(["600\u001bg de poireau", "600\u0000g de poireau", "600 g de poireau"])(
    "lit le texte tel qu'il sera imprimé : %j avertit comme « 600 g de poireau »",
    (written) => {
      const check = run(withStep("s12", { text: `Laver {a.1}, soit ${written}` }));
      expect(messages(check, "detail", "warning")).toEqual([
        "quantité écrite à la main pour poireau : utilise {a.1}.",
      ]);
    },
  );
  it("laisse libres l'eau, le sel et ce qui n'est pas au menu", () => {
    const check = run(
      withStep("s12", {
        text: "Laver {a.1}, 2 fois leur volume d'eau, 1 l d'eau froide, 5 g de sel",
      }),
    );
    expect(messages(check, "detail", "warning")).toEqual([]);
  });
  it("lit « 0.5 kg » comme une seule quantité, sans faux « 5 kg »", () => {
    const check = run(withStep("s12", { text: "Laver {a.1} ; 0.5 kg de poireau, 5 kgs de rien" }));
    expect(messages(check, "detail", "warning")).toEqual([
      "quantité écrite à la main pour poireau : utilise {a.1}.",
    ]);
  });
  it("reconnaît un synonyme du référentiel", () => {
    const withLettuce: Menu = {
      dishes: menu.dishes.map((dish, i) =>
        i === 0
          ? {
              ...dish,
              ingredients: dish.ingredients.map((ing, j) =>
                j === 0 ? { ...ing, name: "laitue" } : ing,
              ),
            }
          : dish,
      ),
    };
    const check = run(withStep("s12", { text: "Laver {a.1}, garder 200 g de salade verte" }), {
      menu: withLettuce,
    });
    expect(messages(check, "detail", "warning")).toEqual([
      "quantité écrite à la main pour laitue : utilise {a.1}.",
    ]);
  });
  it("ne compte pas « 3 h » ni une quantité loin du nom", () => {
    const check = run(
      withStep("s12", { text: "Laver {a.1} ; 600 g pour quatre belles parts de poireau" }),
    );
    expect(messages(check, "detail", "warning")).toEqual([]);
  });
});

describe("checkDetail : exclusions dans les textes", () => {
  it("refuse un titre de phase qui cite un ingrédient exclu, une seule fois par titre", () => {
    const base = balancedDetail();
    const titled: Detail = {
      ...base,
      steps: base.steps.map((one) =>
        one.phase === "Cuissons" ? { ...one, phase: "Finitions au beurre et au parmesan" } : one,
      ),
    };
    const check = run(titled, { exclusions: ["beurre", "fromage"] });
    expect(messages(check, "exclusion")).toEqual([
      "Le titre de phase « Finitions au beurre et au parmesan » cite un ingrédient exclu (exclusion : beurre) : retire-le, même en garniture, en matière grasse ou pour dire de ne pas en mettre.",
      "Le titre de phase « Finitions au beurre et au parmesan » cite un ingrédient exclu (exclusion : fromage) : retire-le, même en garniture, en matière grasse ou pour dire de ne pas en mettre.",
    ]);
    expect(isAdmissible(check)).toBe(false);
  });
  it("signale une exclusion avec la règle `exclusion`, que `isAdmissible` refuse", () => {
    const check = run(withStep("s12", { text: "Laver {a.1}, puis du beurre" }), {
      exclusions: ["beurre"],
    });
    expect(check.findings.map((finding) => [finding.level, finding.rule])).toEqual([
      ["error", "exclusion"],
    ]);
    expect(messages(check, "detail")).toEqual([]);
    expect(isAdmissible(check)).toBe(false);
  });
  it("refuse une étape qui cite un ingrédient exclu, ce qui donne un nouvel essai", () => {
    const check = run(
      withStep("s12", { text: "Laver et émincer {a.1}, puis une noix de beurre" }),
      {
        exclusions: ["beurre"],
      },
    );
    expect(messages(check, "exclusion")).toEqual([
      "L'étape « s12 » cite un ingrédient exclu (exclusion : beurre) : retire-le, même en garniture, en matière grasse ou pour dire de ne pas en mettre.",
    ]);
    expect(isAdmissible(check)).toBe(false);
  });
  it("refuse une ligne du soir qui cite un ingrédient exclu", () => {
    const base = balancedDetail();
    const check = run(
      {
        ...base,
        evenings: base.evenings.map((line) =>
          line.dish === "b" ? { ...line, text: "Servir avec du parmesan râpé." } : line,
        ),
      },
      { exclusions: ["fromage"] },
    );
    expect(messages(check, "exclusion")).toEqual([
      "La ligne du soir du plat « b » cite un ingrédient exclu (exclusion : fromage) : retire-le, même en garniture, en matière grasse ou pour dire de ne pas en mettre.",
    ]);
  });
  it("ne lit pas les repères : ils désignent des ingrédients du menu, contrôlés à la composition", () => {
    // Le navet n'est cité que par son repère {e.2} : le texte libre ne le nomme pas.
    expect(run(balancedDetail(), { exclusions: ["navet"] }).findings).toEqual([]);
  });
  it("lit le texte imprimé : un caractère de contrôle ne cache pas le terme", () => {
    const check = run(withStep("s12", { text: "Laver {a.1}, puis du beu\u001brre" }), {
      exclusions: ["beurre"],
    });
    // « beu rre » imprimé ne cite pas le beurre : le contrôle lit la même chose que la fiche.
    expect(messages(check, "exclusion")).toEqual([]);
    const hidden = run(withStep("s12", { text: "Laver {a.1}, puis du beu\u200brre" }), {
      exclusions: ["beurre"],
    });
    expect(messages(hidden, "exclusion")).toHaveLength(1);
  });
});

describe("checkDetail : lignes du soir", () => {
  it("refuse une ligne manquante, en double, vide ou à lettre inconnue", () => {
    const base = balancedDetail();
    const missing = run({ ...base, evenings: base.evenings.filter((line) => line.dish !== "c") });
    expect(messages(missing, "detail")).toEqual([
      "Le plat « c » n'a pas de ligne du soir : une exactement par plat.",
    ]);
    const twice = run({ ...base, evenings: [...base.evenings, { dish: "a", text: "Encore" }] });
    expect(messages(twice, "detail")).toEqual([
      "Le plat « a » a plusieurs lignes du soir : une seule par plat.",
    ]);
    const blank = run({
      ...base,
      evenings: base.evenings.map((line) => (line.dish === "b" ? { ...line, text: "  " } : line)),
    });
    expect(messages(blank, "detail")).toEqual(["La ligne du soir du plat « b » est vide."]);
    // Vide une fois imprimée : `printable` change ces caractères en espaces sur la fiche.
    const hidden = run({
      ...base,
      evenings: base.evenings.map((line) =>
        line.dish === "b" ? { ...line, text: "\u001b\u202e" } : line,
      ),
    });
    expect(messages(hidden, "detail")).toEqual(["La ligne du soir du plat « b » est vide."]);
    const unknown = run({ ...base, evenings: [...base.evenings, { dish: "z", text: "x" }] });
    expect(messages(unknown, "detail")).toEqual([
      "La ligne du soir cite le plat « z », qui n'existe pas.",
    ]);
  });
});

describe("checkDetail : le planning des étapes", () => {
  it("signale une étape pour un plat du soir en première lettre", () => {
    const check = run(balancedDetail(), { menu: eveningLast() });
    expect(messages(check, "phases")).toHaveLength(1);
    expect(messages(check, "phases")[0]).toContain("sameDay");
    expect(isAdmissible(check)).toBe(false);
  });
  it("signale un plat de session sans étape", () => {
    const detail = balancedDetail();
    const check = run({
      ...detail,
      steps: detail.steps.filter(
        (step) => step.id !== "s9" && step.id !== "s10" && step.id !== "s11",
      ),
    });
    expect(check.findings.some((finding) => finding.rule === "phases" && finding.dish === 1)).toBe(
      true,
    );
    expect(isAdmissible(check)).toBe(false);
  });
  it("signale une dépendance inconnue ou un cycle, sans planning", () => {
    const unknown = run(withStep("s3", { after: ["s1", "s2", "s77"] }));
    expect(unknown.plan).toBeNull();
    expect(messages(unknown, "phases")).toHaveLength(1);
    expect(isAdmissible(unknown)).toBe(false);
    const cycle = run(withStep("s1", { after: ["s3"] }));
    expect(cycle.plan).toBeNull();
    expect(messages(cycle, "phases")[0]).toContain("circulaires");
    expect(isAdmissible(cycle)).toBe(false);
  });
  it("signale deux appareils d'appoint", () => {
    const base = withStep("s13", { appliance: "cookeo" });
    const check = run({
      ...base,
      steps: base.steps.map((step) =>
        step.id === "s5" ? { ...step, appliance: "airfryer" } : step,
      ),
    });
    expect(messages(check, "extra-appliance")).toHaveLength(1);
    expect(isAdmissible(check)).toBe(false);
  });
  it("réécrit session-length pour le détail, et reste admissible", () => {
    const check = run(withStep("s3", { minutes: 600 }));
    const [message] = messages(check, "session-length");
    expect(message).toContain("Ne raccourcis pas une durée réelle");
    expect(message).toContain("Ne change pas les plats");
    expect(message).not.toContain("remplace");
    expect(message).toContain("« Bœuf braisé aux carottes »");
    expect(isAdmissible(check)).toBe(true);
  });
});

describe("stepsAsMenu", () => {
  it("ne modifie ni les noms, ni les jours, ni les ingrédients", () => {
    const result = stepsAsMenu(menu, balancedDetail());
    for (const [i, dish] of result.dishes.entries()) {
      expect(dish.name).toBe(menu.dishes[i]!.name);
      expect(dish.day).toBe(menu.dishes[i]!.day);
      expect(dish.ingredients).toEqual(menu.dishes[i]!.ingredients);
    }
  });
  it("met chaque étape dans le plat de sa première lettre et écarte les lettres invalides", () => {
    const result = stepsAsMenu(menu, balancedDetail());
    expect(result.dishes[3]!.phases.map((phase) => phase.id)).toEqual(["s4", "s5"]);
    expect(result.dishes[4]!.phases.map((phase) => phase.id)).toEqual(["s6", "s7", "s8"]);
    const stray = stepsAsMenu(menu, withStep("s2", { dishes: ["z", "c"] }));
    expect(stray.dishes.flatMap((dish) => dish.phases).some((phase) => phase.id === "s2")).toBe(
      false,
    );
  });
  it("laisse le menu d'origine intact", () => {
    const before = JSON.stringify(menu);
    stepsAsMenu(menu, balancedDetail());
    expect(JSON.stringify(menu)).toBe(before);
  });
});
