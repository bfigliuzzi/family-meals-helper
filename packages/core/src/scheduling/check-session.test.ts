import { describe, expect, it } from "vitest";
import type { Dish, Menu, Phase } from "../domain/menu.ts";
import { HOUSEHOLD_EQUIPMENT } from "../equipment/household.ts";
import { balancedMenu, phase } from "../rules/fixtures/menus.ts";
import { checkSession, isEveningDish } from "./check-session.ts";

function dishOf(name: string, phases: Phase[], sameDay = false): Dish {
  return {
    name,
    day: "mon",
    ingredients: [{ name: "carotte", qty: 500, unit: "g", form: "fresh", category: null, sameDay }],
    phases,
  };
}

function menuOf(...dishes: Dish[]): Menu {
  return { dishes };
}

const check = (menu: Menu) => checkSession(menu, HOUSEHOLD_EQUIPMENT);
const messages = (menu: Menu) => check(menu).findings.map((finding) => finding.message);

describe("checkSession : cas qui tient", () => {
  it("balancedMenu() tient en 2 h 15, sans appareil d'appoint", () => {
    const { findings, plan } = check(balancedMenu());
    expect(findings).toEqual([]);
    expect(plan?.minutes).toBe(135);
    expect(plan?.extras).toEqual([]);
    const starts = Object.fromEntries(
      (plan?.phases ?? []).map((entry) => [entry.phase.id, [entry.start, entry.end]]),
    );
    expect(starts).toEqual({
      c1: [0, 15],
      c2: [0, 15],
      c3: [15, 135],
      b1: [15, 35],
      d1: [35, 55],
      b2: [55, 65],
      e1: [65, 75],
      a1: [75, 90],
      b3: [65, 105],
      e2: [75, 105],
      a2: [90, 115],
      d2: [55, 80],
      e3: [105, 110],
    });
  });
});

describe("checkSession : appareils d'appoint", () => {
  it("refuse deux appareils d'appoint, planning présent", () => {
    const { findings, plan } = check(
      menuOf(
        dishOf("A", [phase("a1", 20, "cookeo", false)]),
        dishOf("B", [phase("b1", 20, "airfryer", false)]),
      ),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ level: "error", rule: "extra-appliance", dish: null });
    expect(findings[0]?.message).toContain("Cookeo, airfryer");
    expect(plan).not.toBeNull();
  });
  it("accepte un seul appareil d'appoint", () => {
    const { findings, plan } = check(menuOf(dishOf("A", [phase("a1", 20, "cookeo", false)])));
    expect(findings).toEqual([]);
    expect(plan?.extras).toEqual(["cookeo"]);
  });
  it("refuse deux appareils d'appoint qui ne tournent jamais en même temps", () => {
    const { findings } = check(
      menuOf(
        dishOf("A", [phase("a1", 20, "cookeo", false), phase("a2", 20, "airfryer", false, ["a1"])]),
      ),
    );
    expect(findings.map((finding) => finding.rule)).toEqual(["extra-appliance"]);
  });
});

describe("checkSession : durée", () => {
  it("refuse une phase de four de 190 min et nomme le plat qui finit le plus tard", () => {
    const { findings } = check(
      menuOf(
        dishOf("Court", [phase("a1", 10, "none", true)]),
        dishOf("Bœuf bourguignon", [phase("b1", 190, "oven", false)]),
      ),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ rule: "session-length", level: "error", dish: null });
    expect(findings[0]?.message).toContain("3 h 10");
    expect(findings[0]?.message).toContain("« Bœuf bourguignon » (fin à 3 h 10)");
    expect(findings[0]?.message).not.toContain("Raccourcis des phases");
  });
  it("cite le plat qui finit le plus tard, pas celui qui a le plus de minutes de phases", () => {
    const { findings } = check(
      menuOf(
        dishOf("Marinades", [phase("m1", 100, "none", false), phase("m2", 100, "none", false)]),
        dishOf("Long", [phase("l1", 181, "none", true)]),
      ),
    );
    expect(findings.map((finding) => finding.rule)).toEqual(["session-length"]);
    expect(findings[0]?.message).toContain("« Long » (fin à 3 h 01)");
    expect(findings[0]?.message).not.toContain("Marinades");
  });
  it("refuse un dépassement par accumulation de tâches mobilisées", () => {
    const phases = ["a", "b", "c", "d"].map((id) => phase(id, 50, "none", true));
    const { findings, plan } = check(menuOf(dishOf("A", phases)));
    expect(plan?.minutes).toBe(200);
    expect(findings.map((finding) => finding.rule)).toEqual(["session-length"]);
  });
  it("accepte exactement 180 min", () => {
    expect(check(menuOf(dishOf("A", [phase("a1", 180, "oven", false)]))).findings).toEqual([]);
  });
  it("n'impose pas l'objectif de 2 h à 2 h 30 : 165 min passent", () => {
    expect(check(menuOf(dishOf("A", [phase("a1", 165, "oven", false)]))).findings).toEqual([]);
  });
  it("refuse un préchauffage commun suivi d'une cuisson de 175 min (195 min)", () => {
    const { findings, plan } = check(
      menuOf(
        dishOf("A", [
          phase("p", 20, "oven", false),
          phase("a", 20, "oven", false, ["p"]),
          phase("b", 175, "oven", false, ["p"]),
        ]),
      ),
    );
    expect(plan?.minutes).toBe(195);
    expect(findings.map((finding) => finding.rule)).toEqual(["session-length"]);
  });
});

describe("checkSession : phases", () => {
  it("tolère un doublon dans `after`, sans faux cycle", () => {
    const { findings, plan } = check(
      menuOf(
        dishOf("A", [phase("a1", 10, "none", true), phase("a2", 10, "oven", false, ["a1", "a1"])]),
      ),
    );
    expect(findings).toEqual([]);
    expect(plan?.minutes).toBe(20);
  });
  it("exige des phases pour un plat de session", () => {
    const { findings, plan } = check(menuOf(dishOf("A", [])));
    expect(findings).toEqual([
      {
        level: "error",
        rule: "phases",
        dish: 0,
        ingredient: null,
        message: "Le plat se prépare pendant la session : donne ses grandes phases (`phases`).",
      },
    ]);
    expect(plan).toBeNull();
  });
  it("laisse un plat du soir sans phase hors du planning", () => {
    const { findings, plan } = check(
      menuOf(dishOf("Soir", [], true), dishOf("A", [phase("a1", 10, "none", true)])),
    );
    expect(findings).toEqual([]);
    expect(plan?.phases.map((entry) => entry.dish)).toEqual([1]);
  });
  it("refuse des phases sur un plat du soir", () => {
    const { findings, plan } = check(menuOf(dishOf("Soir", [phase("s1", 10, "none", true)], true)));
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ rule: "phases", dish: 0 });
    expect(findings[0]?.message).toBe(
      "Tous les ingrédients sont `sameDay` : le plat se prépare le soir, laisse `phases` vide.",
    );
    expect(plan).toBeNull();
  });
  it("reconnaît un plat du soir : au moins un ingrédient, tous sameDay", () => {
    expect(isEveningDish(dishOf("Soir", [], true))).toBe(true);
    expect(isEveningDish(dishOf("Session", []))).toBe(false);
    expect(isEveningDish({ ...dishOf("Vide", []), ingredients: [] })).toBe(false);
  });
  it("refuse un id vide", () => {
    expect(messages(menuOf(dishOf("A", [phase(" ", 10, "none", true)])))).toEqual([
      "Une phase n'a pas d'`id`.",
    ]);
  });
  it("refuse un id déjà pris dans un autre plat, sur le second", () => {
    const { findings } = check(
      menuOf(
        dishOf("A", [phase("x1", 10, "none", true)]),
        dishOf("B", [phase("x1", 10, "none", true)]),
      ),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ dish: 1, message: "L'id de phase « x1 » est déjà pris." });
  });
  it("refuse une description vide", () => {
    expect(messages(menuOf(dishOf("A", [phase("a1", 10, "none", true, [], " ")])))).toEqual([
      "La phase « a1 » n'a pas de description.",
    ]);
  });
  it.each([0, -5, 2.5, 601, 1e308])("refuse %s minutes", (minutes) => {
    const { findings, plan } = check(menuOf(dishOf("A", [phase("a1", minutes, "none", true)])));
    expect(findings.map((finding) => finding.rule)).toEqual(["phases"]);
    expect(findings[0]?.message).toContain("nombre entier de minutes, de 1 à 600");
    expect(plan).toBeNull();
  });
  it("écrit la durée reçue dans le message", () => {
    expect(messages(menuOf(dishOf("A", [phase("a1", 2.5, "none", true)])))).toEqual([
      "La phase « a1 » doit durer un nombre entier de minutes, de 1 à 600 (reçu : 2.5).",
    ]);
  });
  it("accepte 600 minutes, qui dépassent alors la session", () => {
    const { findings } = check(menuOf(dishOf("A", [phase("a1", 600, "oven", false)])));
    expect(findings.map((finding) => finding.rule)).toEqual(["session-length"]);
  });
  it("refuse une dépendance inconnue", () => {
    expect(messages(menuOf(dishOf("A", [phase("a1", 10, "none", true, ["z9"])])))).toEqual([
      "La phase « a1 » dépend de « z9 », qui n'existe pas.",
    ]);
  });
  it("traite une phase d'un plat du soir comme une dépendance inconnue", () => {
    const { findings } = check(
      menuOf(dishOf("Soir", [], true), dishOf("A", [phase("a1", 10, "none", true, ["s1"])])),
    );
    expect(findings.map((finding) => finding.message)).toEqual([
      "La phase « a1 » dépend de « s1 », qui n'existe pas.",
    ]);
  });
  it("refuse un cycle et le nomme", () => {
    const { findings, plan } = check(
      menuOf(
        dishOf("A", [
          phase("a1", 10, "none", true, ["a2"]),
          phase("a2", 10, "oven", false, ["a1"]),
        ]),
      ),
    );
    expect(findings).toEqual([
      {
        level: "error",
        rule: "phases",
        dish: null,
        ingredient: null,
        message: "Dépendances circulaires : ces phases ne peuvent jamais commencer : a1, a2.",
      },
    ]);
    expect(plan).toBeNull();
  });
  it("refuse une dépendance à soi-même et liste la phase en aval d'un cycle", () => {
    const { findings } = check(
      menuOf(
        dishOf("A", [
          phase("a1", 10, "none", true, ["a1"]),
          phase("a2", 10, "oven", false, ["a1"]),
          phase("a3", 10, "none", true),
        ]),
      ),
    );
    expect(findings.map((finding) => finding.message)).toEqual([
      "Dépendances circulaires : ces phases ne peuvent jamais commencer : a1, a2.",
    ]);
  });
});

describe("checkSession : nombre de phases", () => {
  const chain = (count: number): Phase[] =>
    Array.from({ length: count }, (_, i) =>
      phase(`x${i}`, 1, "none", false, i === 0 ? [] : [`x${i - 1}`]),
    );
  it("refuse 61 phases d'un seul constat, sans planning", () => {
    const { findings, plan } = check(menuOf(dishOf("A", chain(61))));
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ rule: "phases", dish: null });
    expect(findings[0]?.message).toContain("61 phases ; 60 au plus");
    expect(plan).toBeNull();
  });
  it("accepte 60 phases", () => {
    const { findings, plan } = check(menuOf(dishOf("A", chain(60))));
    expect(findings).toEqual([]);
    expect(plan?.minutes).toBe(60);
  });
});

describe("checkSession : longueur de `after`", () => {
  const withUnknown = (count: number): Menu => {
    const menu = balancedMenu();
    menu.dishes[0]!.phases[0]!.after = Array.from({ length: count }, (_, i) => `z${i}`);
    return menu;
  };
  it("refuse 61 dépendances d'un seul constat, sans planning", () => {
    const { findings, plan } = check(withUnknown(61));
    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toContain("a 61 dépendances distinctes ; 60 au plus");
    expect(plan).toBeNull();
  });
  it("refuse 61 id distincts, même répétés, d'un seul constat, avant les inconnues et les cycles", () => {
    const phases = Array.from({ length: 60 }, (_, i) => phase(`x${i}`, 1, "none", false));
    // 60 id connus (dont la phase elle-même, un cycle) et un inconnu, chacun écrit deux fois.
    const distinct = [...phases.map((entry) => entry.id), "z0"];
    phases[59] = { ...phases[59]!, after: [...distinct, ...distinct] };
    const { findings, plan } = check(menuOf(dishOf("A", phases)));
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ rule: "phases", dish: 0 });
    expect(findings[0]?.message).toContain("« x59 » a 61 dépendances distinctes ; 60 au plus");
    expect(plan).toBeNull();
  });
  it("accepte 61 fois le même id connu : une seule dépendance, sans faux cycle", () => {
    const menu = menuOf(
      dishOf("A", [
        phase("a1", 10, "none", true),
        phase(
          "a2",
          10,
          "oven",
          false,
          Array.from({ length: 61 }, () => "a1"),
        ),
      ]),
    );
    const { findings, plan } = check(menu);
    expect(findings).toEqual([]);
    expect(plan?.minutes).toBe(20);
  });
  it("accepte 150000 copies d'un id connu sans planter", () => {
    const menu = balancedMenu();
    const target = menu.dishes[0]!.phases[1]!;
    target.after = Array.from({ length: 150000 }, () => menu.dishes[0]!.phases[0]!.id);
    const { findings, plan } = check(menu);
    expect(findings).toEqual([]);
    expect(plan?.minutes).toBe(135);
  });
  it("laisse passer 60 dépendances : chacune inconnue donne son constat", () => {
    const { findings } = check(withUnknown(60));
    expect(findings).toHaveLength(60);
    expect(findings.every((finding) => finding.message.includes("qui n'existe pas"))).toBe(true);
  });
});

describe("checkSession : équipement", () => {
  it("refuse un appareil absent de l'équipement, sans planning", () => {
    const reduced = HOUSEHOLD_EQUIPMENT.filter((spec) => spec.id !== "airfryer");
    const { findings, plan } = checkSession(
      menuOf(dishOf("A", [phase("a1", 10, "airfryer", false)])),
      reduced,
    );
    expect(findings).toEqual([
      {
        level: "error",
        rule: "equipment",
        dish: 0,
        ingredient: null,
        message: "La phase « a1 » utilise airfryer, absent de l'équipement.",
      },
    ]);
    expect(plan).toBeNull();
  });
});

describe("checkSession : constats de structure et planning (D12)", () => {
  const broken = (fixed: boolean): Menu =>
    menuOf(
      dishOf("A", [
        phase("a1", 100, "cookeo", false, fixed ? [] : ["z9"]),
        phase("a2", 100, "airfryer", false, ["a1"]),
      ]),
    );
  it("sans planning ni contrôles de session tant que la structure est fausse", () => {
    const { findings, plan } = check(broken(false));
    expect(findings.map((finding) => finding.rule)).toEqual(["phases"]);
    expect(plan).toBeNull();
  });
  it("avec la dépendance corrigée, le planning et les deux erreurs apparaissent", () => {
    const { findings, plan } = check(broken(true));
    expect(plan).not.toBeNull();
    expect(findings.map((finding) => finding.rule)).toEqual(["extra-appliance", "session-length"]);
  });
});
