import { describe, expect, it } from "vitest";
import type { Day, Menu, MenuIngredient } from "../domain/menu.ts";
import { buildIngredientIndex } from "../ingredients/index-lookup.ts";
import { REFERENTIAL } from "../ingredients/referential.ts";
import { SEASON_TABLE } from "../season/season-table.ts";
import { checkConservation, improvesOrder, THAW_INSTRUCTION_FR } from "./check-conservation.ts";
import { conservationPromptLines } from "./conservation-table.ts";
import type { CheckContext } from "./context.ts";
import { balancedMenu } from "./fixtures/menus.ts";

const ctx: CheckContext = {
  request: "un plat",
  exclusions: [],
  month: 11,
  sessionDay: "sun",
  dinners: 5,
  index: buildIngredientIndex(REFERENTIAL),
  seasonTable: SEASON_TABLE,
};

function item(name: string, over: Partial<MenuIngredient> = {}): MenuIngredient {
  return { name, qty: 300, unit: "g", form: "fresh", category: null, sameDay: false, ...over };
}

// Un menu d'un seul plat, servi le jour donné.
function oneDish(day: Day, ...ingredients: MenuIngredient[]): Menu {
  return { dishes: [{ name: "Plat", day, ingredients, phases: [] }] };
}

function rules(menu: Menu, rule: string, level?: string): string[] {
  return checkConservation(menu, ctx)
    .findings.filter(
      (finding) => finding.rule === rule && (level === undefined || finding.level === level),
    )
    .map((finding) => finding.message);
}

describe("conservation : un aliment non congelable servi trop tard", () => {
  it("refuse le yaourt nature le jeudi (2 j, ne se congèle pas) mais pas le lundi", () => {
    const messages = rules(oneDish("thu", item("yaourt nature")), "conservation", "error");
    expect(messages).toEqual([
      "se garde 2 j au frigo (« yaourt nature ») mais il est servi 4 j après la session, et « yaourt nature » ne se congèle pas : avance-le dans la semaine ou change cet ingrédient.",
    ]);
    expect(rules(oneDish("mon", item("yaourt nature")), "conservation")).toEqual([]);
  });
  it("refuse un « yaourt grec » inconnu de catégorie dairy, par ses mots", () => {
    const yogurt = item("yaourt grec", { category: "dairy" });
    expect(rules(oneDish("thu", yogurt), "conservation", "error")).toHaveLength(1);
    expect(rules(oneDish("thu", { ...yogurt, sameDay: true }), "conservation")).toEqual([]);
  });
  it("refuse une mayonnaise inconnue dans un plat de 3 j le vendredi", () => {
    const menu = oneDish(
      "fri",
      item("cuisse de poulet"),
      item("mayonnaise", { category: "condiment" }),
    );
    expect(rules(menu, "conservation", "error")).toHaveLength(1);
    const sameDay = oneDish(
      "fri",
      item("cuisse de poulet"),
      item("mayonnaise", { category: "condiment", sameDay: true }),
    );
    expect(rules(sameDay, "conservation")).toEqual([]);
  });
  it("refuse le chou vert le vendredi, pas le lundi", () => {
    expect(rules(oneDish("fri", item("chou vert")), "conservation", "error")).toHaveLength(1);
    expect(rules(oneDish("mon", item("chou vert")), "conservation")).toEqual([]);
  });
});

describe("conservation : un aliment qui se congèle mal", () => {
  it("avertit pour une pomme de terre le vendredi", () => {
    const menu = oneDish("fri", item("pomme de terre"));
    expect(rules(menu, "conservation", "warning")).toEqual([
      "sera congelé, mais « pomme de terre » se congèle mal : avance-le dans la semaine.",
    ]);
    expect(checkConservation(menu, ctx).keeping[0]?.toFreeze).toBe(true);
  });
  it("ne dit rien pour une pomme de terre du soir même ou un plat le mardi", () => {
    expect(
      rules(oneDish("fri", item("pomme de terre", { sameDay: true })), "conservation"),
    ).toEqual([]);
    expect(rules(oneDish("tue", item("pomme de terre")), "conservation")).toEqual([]);
  });
  it("congèle sans constat un plat de légumes servi après sa durée", () => {
    const { findings, keeping } = checkConservation(oneDish("fri", item("carotte")), ctx);
    expect(findings).toEqual([]);
    expect(keeping).toEqual([
      {
        dish: 0,
        fridgeDays: 4,
        limitedBy: "carotte",
        daysAfterSession: 5,
        toFreeze: true,
        freeze: "yes",
      },
    ]);
  });
  it("donne la congélation de la partie préparée d'avance, et null pour un plat du soir", () => {
    expect(checkConservation(oneDish("mon", item("pomme de terre")), ctx).keeping[0]?.freeze).toBe(
      "poor",
    );
    expect(checkConservation(oneDish("mon", item("yaourt nature")), ctx).keeping[0]?.freeze).toBe(
      "no",
    );
    const evening = oneDish("mon", item("pâtes", { sameDay: true }));
    expect(checkConservation(evening, ctx).keeping[0]?.freeze).toBeNull();
    expect(checkConservation(balancedMenu(), ctx).keeping[0]?.freeze).toBe("yes");
  });
});

describe("conservation : lasagnes, tomate et salade", () => {
  const dishNamed = (name: string, day: Day, ...ingredients: MenuIngredient[]): Menu => ({
    dishes: [{ name, day, ingredients, phases: [] }],
  });
  it("congèle des lasagnes le jeudi avec un avertissement et sans erreur", () => {
    const menu = dishNamed(
      "Lasagnes au bœuf",
      "thu",
      item("pâtes"),
      item("bœuf haché"),
      item("tomate concassée", { form: "canned" }),
    );
    const { findings, keeping } = checkConservation(menu, ctx);
    expect(keeping[0]?.toFreeze).toBe(true);
    expect(findings.filter((finding) => finding.level === "error")).toEqual([]);
    expect(rules(menu, "conservation", "warning")).toEqual([
      "sera congelé, mais « pâtes » se congèle mal : avance-le dans la semaine.",
    ]);
  });
  it("congèle des lasagnes aux feuilles de lasagne inconnues avec un avertissement, sans erreur", () => {
    const menu = dishNamed(
      "Lasagnes",
      "thu",
      item("feuilles de lasagne", { category: "refined-starch" }),
      item("bœuf haché"),
    );
    expect(rules(menu, "conservation", "error")).toEqual([]);
    expect(rules(menu, "conservation", "warning")).toEqual([
      "sera congelé, mais « feuilles de lasagne » se congèle mal : avance-le dans la semaine.",
    ]);
    expect(checkConservation(menu, ctx).keeping[0]?.toFreeze).toBe(true);
  });
  it("congèle un gratin de macaronis (macaroni inconnu) avec un avertissement, sans erreur", () => {
    const menu = dishNamed(
      "Gratin de macaronis",
      "thu",
      item("macaroni", { category: "refined-starch" }),
      item("bœuf haché"),
    );
    expect(rules(menu, "conservation", "error")).toEqual([]);
    expect(rules(menu, "conservation", "warning")).toHaveLength(1);
    expect(rules(menu, "reheat")).toEqual([]);
  });
  it("garde une erreur pour un gratin de riz : le riz n'est pas une pâte", () => {
    const menu = dishNamed(
      "Gratin de riz au poulet",
      "thu",
      item("riz basmati"),
      item("cuisse de poulet"),
    );
    expect(rules(menu, "conservation", "error")).toHaveLength(1);
  });
  it("laisse l'interdiction explicite l'emporter sur l'exception des pâtes", () => {
    const menu = dishNamed(
      "Gratin de macaronis",
      "thu",
      item("macaroni à la mayonnaise", { category: "refined-starch" }),
      item("bœuf haché"),
    );
    expect(rules(menu, "conservation", "error")).toHaveLength(1);
  });
  it("ne dit rien du réchauffage pour les pâtes d'un gratin, mais avertit pour des pâtes à la bolognaise", () => {
    const gratin = dishNamed("Gratin de pâtes", "mon", item("pâtes"));
    expect(rules(gratin, "reheat")).toEqual([]);
    const bolognese = dishNamed("Pâtes à la bolognaise", "mon", item("pâtes"));
    expect(rules(bolognese, "reheat", "warning")).toHaveLength(1);
  });
  it("garde les pâtes d'un autre plat non congelables", () => {
    const menu = dishNamed(
      "Pâtes au bœuf",
      "thu",
      item("pâtes", { sameDay: false }),
      item("bœuf haché"),
    );
    expect(rules(menu, "conservation", "error")).toHaveLength(1);
  });
  it("congèle une ratatouille à la tomate fraîche le jeudi avec un avertissement, sans erreur", () => {
    const menu = dishNamed(
      "Ratatouille",
      "thu",
      item("aubergine"),
      item("tomate"),
      item("poivron"),
    );
    expect(rules(menu, "conservation", "error")).toEqual([]);
    expect(rules(menu, "conservation", "warning")).toEqual([
      "sera congelé, mais « tomate » se congèle mal : avance-le dans la semaine.",
    ]);
    expect(checkConservation(menu, ctx).keeping[0]).toMatchObject({
      fridgeDays: 2,
      toFreeze: true,
    });
  });
  it("refuse la laitue le mercredi (2 j, ne se congèle pas), pas le mardi", () => {
    expect(rules(dishNamed("Salade", "wed", item("laitue")), "conservation", "error")).toEqual([
      "se garde 2 j au frigo (« laitue ») mais il est servi 3 j après la session, et « laitue » ne se congèle pas : avance-le dans la semaine ou change cet ingrédient.",
    ]);
    expect(rules(dishNamed("Salade", "tue", item("laitue")), "conservation")).toEqual([]);
  });
});

describe("conservation : durée d'un plat", () => {
  it("prend l'ingrédient le plus fragile, le premier à égalité, et ignore le soir même", () => {
    const menu = oneDish(
      "mon",
      item("carotte"),
      item("cuisse de poulet"),
      item("blanc de poulet"),
      item("cabillaud", { form: "frozen", sameDay: true }),
    );
    expect(checkConservation(menu, ctx).keeping[0]).toMatchObject({
      fridgeDays: 3,
      limitedBy: "cuisse de poulet",
      toFreeze: false,
    });
  });
  it("ne limite pas un plat sans ingrédient préparé d'avance", () => {
    const menu = oneDish("fri", item("riz complet", { sameDay: true }), item("sel"));
    expect(checkConservation(menu, ctx).keeping[0]).toMatchObject({
      fridgeDays: null,
      limitedBy: null,
      toFreeze: false,
    });
  });
  it("applique les exceptions par nom avant la catégorie", () => {
    expect(
      checkConservation(oneDish("mon", item("champignon de Paris")), ctx).keeping[0]?.fridgeDays,
    ).toBe(1);
    expect(
      checkConservation(oneDish("mon", item("tomate concassée")), ctx).keeping[0]?.fridgeDays,
    ).toBe(3);
    expect(
      checkConservation(oneDish("mon", item("farine")), ctx).keeping[0]?.fridgeDays,
    ).toBeNull();
  });
  it("donne le plat e de balancedMenu à congeler, durée 4 j pour le plat a", () => {
    const { keeping } = checkConservation(balancedMenu(), ctx);
    expect(keeping[4]?.toFreeze).toBe(true);
    expect(keeping[0]?.fridgeDays).toBe(4);
    expect(keeping.filter((entry) => entry.toFreeze)).toHaveLength(1);
  });
  it("compte les jours selon le jour de la session", () => {
    const menu = oneDish("mon", item("cuisse de poulet"));
    expect(
      checkConservation(menu, { ...ctx, sessionDay: "mon" }).keeping[0]?.daysAfterSession,
    ).toBe(0);
    expect(checkConservation(menu, { ...ctx, sessionDay: "fri" }).keeping[0]).toMatchObject({
      daysAfterSession: 3,
      toFreeze: false,
    });
    expect(
      checkConservation(oneDish("wed", item("cuisse de poulet")), { ...ctx, sessionDay: "fri" })
        .keeping[0],
    ).toMatchObject({
      daysAfterSession: 5,
      toFreeze: true,
    });
  });
});

describe("poisson", () => {
  it("refuse un cabillaud frais, ou sec même du soir même", () => {
    const fresh = oneDish("mon", item("cabillaud", { form: "fresh" }));
    expect(rules(fresh, "fish", "error")).toEqual([
      "Le poisson doit être surgelé ou en conserve (reçu : frais) : « cabillaud ».",
    ]);
    const dry = oneDish("mon", item("cabillaud", { form: "dry", sameDay: true }));
    expect(rules(dry, "fish", "error")).toHaveLength(1);
  });
  it("accepte surgelé (préparé d'avance ou du soir même) et conserve", () => {
    expect(rules(oneDish("mon", item("cabillaud", { form: "frozen" })), "fish")).toEqual([]);
    expect(
      rules(oneDish("mon", item("cabillaud", { form: "frozen", sameDay: true })), "fish"),
    ).toEqual([]);
    expect(rules(oneDish("mon", item("thon", { form: "canned" })), "fish")).toEqual([]);
  });
  it("juge aussi un poisson inconnu d'après sa catégorie", () => {
    expect(rules(oneDish("mon", item("truite", { category: "fish" })), "fish")).toHaveLength(1);
  });
  it("ne dit rien d'un menu sans poisson", () => {
    expect(rules(oneDish("mon", item("carotte")), "fish")).toEqual([]);
  });
  it("garde un poisson préparé d'avance 1 jour au frigo : bon le lundi, congelé le mardi", () => {
    const fish = item("cabillaud", { form: "frozen" });
    expect(checkConservation(oneDish("mon", fish), ctx).keeping[0]).toMatchObject({
      fridgeDays: 1,
      toFreeze: false,
    });
    expect(checkConservation(oneDish("tue", fish), ctx).keeping[0]).toMatchObject({
      fridgeDays: 1,
      toFreeze: true,
    });
    expect(rules(oneDish("tue", fish), "conservation")).toEqual([]);
  });
});

describe("réchauffage", () => {
  const pasta = item("pâtes");
  const dishNamed = (name: string, ...ingredients: MenuIngredient[]): Menu => ({
    dishes: [{ name, day: "mon", ingredients, phases: [] }],
  });
  it("avertit pour des pâtes préparées d'avance dans « Pâtes à la bolognaise »", () => {
    expect(rules(dishNamed("Pâtes à la bolognaise", pasta), "reheat", "warning")).toHaveLength(1);
    expect(rules(dishNamed("Plat", item("spaghetti")), "reheat", "warning")).toHaveLength(1);
  });
  it("avertit pour des macaronis inconnus préparés d'avance, par la même définition des pâtes", () => {
    const macaroni = item("macaroni", { category: "refined-starch" });
    expect(rules(dishNamed("Macaronis au fromage", macaroni), "reheat", "warning")).toEqual([
      "les pâtes se cuisent le soir même : marque « macaroni » en `sameDay` (seule exception : un gratin, des lasagnes ou des cannelloni).",
    ]);
    expect(rules(dishNamed("Gratin de macaronis", macaroni), "reheat")).toEqual([]);
  });
  it("ne dit rien des feuilles de lasagne inconnues d'un plat de lasagnes", () => {
    const sheets = item("feuilles de lasagne", { category: "refined-starch" });
    expect(rules(dishNamed("Lasagnes", sheets), "reheat")).toEqual([]);
  });
  it("ne dit rien de feuilles de lasagne dans « Bolognaise au four » : l'exception vient du nom de l'ingrédient", () => {
    const sheets = item("feuilles de lasagne", { category: "refined-starch" });
    expect(rules(dishNamed("Bolognaise au four", sheets), "reheat")).toEqual([]);
  });
  it("ne prend pas un légume dont le nom cite des pâtes pour des pâtes", () => {
    const squash = item("courge spaghetti", { category: "vegetable" });
    const thursday: Menu = {
      dishes: [{ name: "Courge rôtie", day: "thu", ingredients: [squash], phases: [] }],
    };
    expect(rules(thursday, "reheat")).toEqual([]);
    const zoodles = item("spaghetti de courgette", { category: "vegetable" });
    expect(rules(dishNamed("Spaghetti de courgette au pesto", zoodles), "reheat")).toEqual([]);
    expect(
      rules(dishNamed("Plat", item("spaghetti", { category: "refined-starch" })), "reheat"),
    ).toHaveLength(1);
  });
  it("garde la congélation d'un légume dont le nom cite des pâtes, même dans un gratin", () => {
    const zoodles = item("spaghetti de courgette", { category: "vegetable" });
    const menu: Menu = {
      dishes: [
        {
          name: "Gratin de spaghetti de courgette",
          day: "fri",
          ingredients: [zoodles],
          phases: [],
        },
      ],
    };
    expect(checkConservation(menu, ctx).keeping[0]?.toFreeze).toBe(true);
    expect(rules(menu, "conservation")).toEqual([]);
  });
  it("ne dit rien des cannelloni inconnus d'un plat de cannelloni le jeudi", () => {
    const menu: Menu = {
      dishes: [
        {
          name: "Cannelloni ricotta épinards",
          day: "thu",
          ingredients: [item("cannelloni", { category: "refined-starch" })],
          phases: [],
        },
      ],
    };
    expect(rules(menu, "reheat")).toEqual([]);
  });
  it("laisse les pâtes d'un gratin, de lasagnes ou de cannelloni, ou du soir même", () => {
    expect(rules(dishNamed("Gratin de pâtes", pasta), "reheat")).toEqual([]);
    expect(rules(dishNamed("Lasagnes au bœuf", pasta), "reheat")).toEqual([]);
    expect(
      rules(dishNamed("Pâtes à la bolognaise", { ...pasta, sameDay: true }), "reheat"),
    ).toEqual([]);
  });
  it("refuse des crevettes préparées d'avance, pas du soir même", () => {
    const shrimp = item("crevette", { form: "frozen" });
    expect(rules(dishNamed("Riz aux crevettes", shrimp), "reheat", "error")).toHaveLength(1);
    expect(rules(dishNamed("Riz aux crevettes", { ...shrimp, sameDay: true }), "reheat")).toEqual(
      [],
    );
  });
});

describe("ordre des jours", () => {
  const swapped = (): Menu => {
    const menu = balancedMenu();
    const [c, d] = [menu.dishes[2]!, menu.dishes[3]!];
    [c.day, d.day] = [d.day, c.day];
    return menu;
  };

  it("propose un meilleur ordre quand c et d de balancedMenu sont échangés", () => {
    expect(rules(swapped(), "day-order")).toEqual([
      "Ordre proposé pour moins congeler : lundi « Poulet aux carottes », mardi « Bœuf braisé aux carottes », mercredi « Dal de lentilles corail au potiron », jeudi « Cabillaud, fondue de poireaux et riz complet », vendredi « Soupe de potiron et navet ».",
    ]);
  });
  it("ne propose rien pour balancedMenu", () => {
    expect(rules(balancedMenu(), "day-order")).toEqual([]);
  });
  it("met le plat de 1 j le lundi quand des plats de 3 j et 4 j le précèdent", () => {
    const menu: Menu = {
      dishes: [
        { name: "Poulet", day: "mon", ingredients: [item("cuisse de poulet")], phases: [] },
        { name: "Poireaux", day: "wed", ingredients: [item("poireau")], phases: [] },
        {
          name: "Champignons",
          day: "thu",
          ingredients: [item("champignon de Paris")],
          phases: [],
        },
      ],
    };
    expect(rules(menu, "day-order")).toEqual([
      "Ordre proposé pour moins congeler : lundi « Champignons », mercredi « Poulet », jeudi « Poireaux ».",
    ]);
  });
  it("met le chou non congelable le jeudi et les légumes le vendredi, jamais le chou le vendredi", () => {
    const menu: Menu = {
      dishes: [
        { name: "Légumes", day: "fri", ingredients: [item("carotte")], phases: [] },
        { name: "Chou", day: "mon", ingredients: [item("chou vert")], phases: [] },
        {
          name: "Champignons 1",
          day: "tue",
          ingredients: [item("champignon de Paris")],
          phases: [],
        },
        {
          name: "Champignons 2",
          day: "wed",
          ingredients: [item("champignon de Paris")],
          phases: [],
        },
        {
          name: "Champignons 3",
          day: "thu",
          ingredients: [item("champignon de Paris")],
          phases: [],
        },
      ],
    };
    const [message] = rules(menu, "day-order");
    expect(message).toContain("jeudi « Chou »");
    expect(message).toContain("vendredi « Légumes »");
    expect(message).not.toContain("vendredi « Chou »");
  });
  it("ne propose pas un ordre qui colle deux plats de poulet à la suite", () => {
    const menu: Menu = {
      dishes: [
        {
          name: "Poulet un",
          day: "mon",
          ingredients: [item("cuisse de poulet")],
          phases: [],
        },
        { name: "Légumes", day: "tue", ingredients: [item("carotte")], phases: [] },
        {
          name: "Poulet deux",
          day: "wed",
          ingredients: [item("blanc de poulet")],
          phases: [],
        },
        {
          name: "Champignons",
          day: "thu",
          ingredients: [item("champignon de Paris")],
          phases: [],
        },
      ],
    };
    // sans la garde sur les protéines, le tri par fragilité proposerait champignons, poulet, poulet, légumes
    expect(rules(menu, "day-order")).toEqual([]);
    // la même proposition est émise quand les deux plats ne sont pas du même poulet
    const other: Menu = {
      dishes: menu.dishes.map((dish, i) =>
        i === 2 ? { ...dish, ingredients: [item("bœuf haché")], phases: [] } : dish,
      ),
    };
    expect(rules(other, "day-order")).toHaveLength(1);
  });
  describe("paires de même protéine", () => {
    const dishNamed = (name: string, day: Day, ...ingredients: MenuIngredient[]) => ({
      name,
      day,
      ingredients,
      phases: [],
    });
    const chicken = item("cuisse de poulet");
    const eggs = item("œuf", { qty: 4, unit: "piece" });
    const potatoes = item("pomme de terre");
    // P0 (poulet, 3 j) lundi et P1 (poulet et champignons, 1 j) mardi : la paire 0-1 existe. E2 et E3 (œufs, 2 j)
    // sont séparés par Y (pommes de terre, 2 j). Le tri par fragilité les rapprocherait et séparerait P0 et P1.
    const menuWith = (last: MenuIngredient): Menu => ({
      dishes: [
        dishNamed("P0", "mon", chicken),
        dishNamed("P1", "tue", chicken, item("champignon de Paris")),
        dishNamed("E2", "wed", eggs),
        dishNamed("Y", "thu", potatoes),
        dishNamed("E3", "fri", last),
      ],
    });
    it("ne propose pas un ordre qui remplace la paire 0-1 par une paire 2-4, même s'il fait moins congeler", () => {
      expect(rules(menuWith(eggs), "day-order")).toEqual([]);
    });
    it("propose le même gain quand l'ordre candidat ne crée aucune paire", () => {
      const [message] = rules(menuWith(potatoes), "day-order");
      expect(message).toContain("lundi « P1 »");
    });
    it("propose un ordre qui garde la paire 0-1 à d'autres jours en faisant moins congeler", () => {
      const menu: Menu = {
        dishes: [
          dishNamed("P0", "mon", chicken),
          dishNamed("P1", "tue", chicken),
          dishNamed("F2", "wed", item("champignon de Paris")),
        ],
      };
      expect(rules(menu, "day-order")).toEqual([
        "Ordre proposé pour moins congeler : lundi « F2 », mardi « P0 », mercredi « P1 ».",
      ]);
    });
  });
  it("ne compare pas une erreur de plus à moins de congélations", () => {
    expect(improvesOrder({ errors: 1, frozen: 0 }, { errors: 0, frozen: 3 })).toBe(false);
    expect(improvesOrder({ errors: 0, frozen: 2 }, { errors: 0, frozen: 3 })).toBe(true);
    expect(improvesOrder({ errors: 0, frozen: 3 }, { errors: 0, frozen: 3 })).toBe(false);
    expect(improvesOrder({ errors: 0, frozen: 5 }, { errors: 1, frozen: 0 })).toBe(true);
  });
});

describe("textes générés", () => {
  it("donne la consigne de décongélation", () => {
    expect(THAW_INSTRUCTION_FR).toBe(
      "Après refroidissement rapide, congeler dès la fin de la session. La veille au soir, passer au frigo pour décongeler (12 à 24 h). Ne pas recongeler.",
    );
  });
  it("génère les lignes du prompt avec un référentiel réduit passé en paramètre", () => {
    const reduced = REFERENTIAL.filter((ref) => ref.name === "pâtes" || ref.name === "carotte");
    expect(() => conservationPromptLines(reduced)).not.toThrow();
    expect(conservationPromptLines(reduced).join("\n")).toContain("Range les plats");
  });
  it("génère les lignes du prompt à partir des tables", () => {
    const text = conservationPromptLines(REFERENTIAL).join("\n");
    expect(text).toContain("1 j : poisson, poisson gras, fruits de mer");
    expect(text).toContain("5 j : légumineuse, féculent complet, féculent raffiné");
    expect(text).toContain("champignon de Paris");
    expect(text).toContain("yaourt");
    expect(text).toContain("`sameDay` ne comptent pas");
    expect(text).toContain("pomme de terre");
    expect(text).toContain("2 j : tomate, concombre, laitue, mâche");
    expect(text).toContain(
      "sauf les pâtes d'un gratin, de lasagnes ou de cannelloni (nom du plat ou de l'ingrédient) : se congèlent mal",
    );
  });
});
