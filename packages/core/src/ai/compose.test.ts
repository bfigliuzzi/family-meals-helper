import { HOUSEHOLD_EQUIPMENT } from "../equipment/household.ts";
import { describe, expect, it } from "vitest";
import type { Menu, MenuIngredient } from "../domain/menu.ts";
import { REFERENTIAL } from "../ingredients/referential.ts";
import { asReply, balancedMenu, phase } from "../rules/fixtures/menus.ts";
import { SEASON_TABLE } from "../season/season-table.ts";
import { composeMenu, exitCodeOf, reviseMenu } from "./compose.ts";
import type { Attempt, ComposeInput, ReviseInput } from "./compose.ts";
import type { Model, ModelReply, TokenUsage } from "./model.ts";
import { renderComposeResult } from "./render.ts";

const usage: TokenUsage = { input: 100, output: 50, cacheRead: 0, cacheWrite: 0 };

function reply(text: string, stopReason: string | null = "end_turn"): ModelReply {
  return { text, stopReason, usage };
}

function fakeModel(script: (ModelReply | Error)[]) {
  const prompts: { system: string; user: string }[] = [];
  const model: Model = {
    complete(prompt) {
      prompts.push(prompt);
      const next = script[prompts.length - 1];
      if (next === undefined) return Promise.reject(new Error("script épuisé"));
      return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
    },
  };
  return { model, prompts };
}

function item(name: string, over: Partial<MenuIngredient> = {}): MenuIngredient {
  return { name, qty: 400, unit: "g", form: "fresh", category: null, sameDay: false, ...over };
}

// Part de balancedMenu() : `extra` s'ajoute au plat a, `qty` est la quantité de carottes du plat b.
function menuOf(extra: MenuIngredient[] = [], qty = 400): string {
  const menu = balancedMenu();
  menu.dishes[0]!.ingredients.push(...extra);
  menu.dishes[1]!.ingredients[1] = item("carotte", { qty });
  return asReply(menu);
}

// balancedMenu() modifié par `change`, sérialisé.
function variant(change: (menu: Menu) => void): string {
  const menu = balancedMenu();
  change(menu);
  return asReply(menu);
}

const withoutPulses = (menu: Menu): void => {
  menu.dishes[3]!.ingredients = menu.dishes[3]!.ingredients.filter(
    (ingredient) => ingredient.name !== "lentilles corail",
  );
};

const input: ComposeInput = {
  request: "un bœuf bourguignon, 5 dîners",
  exclusions: ["courgette"],
  month: 11,
  sessionDay: "sun",
  maxAttempts: 3,
  pinned: [],
  history: [],
};
const deps = (model: Model) => ({
  model,
  refs: REFERENTIAL,
  seasonTable: SEASON_TABLE,
  equipment: HOUSEHOLD_EQUIPMENT,
});

describe("composeMenu", () => {
  it("corrige un premier menu fautif : courgette exclue et tomate hors saison", async () => {
    const { model, prompts } = fakeModel([
      reply(menuOf([item("courgette"), item("tomate")])),
      reply(menuOf()),
    ]);
    const result = await composeMenu(input, deps(model));
    expect(prompts).toHaveLength(2);
    expect(result.best?.number).toBe(2);
    expect(result.stop).toBe("valid");
    expect(result.best?.check.findings).toEqual([]);
    expect(exitCodeOf(result)).toBe(0);
    expect(prompts[1]?.user).toContain("« courgette » est exclu (exclusion : courgette).");
    expect(prompts[1]?.user).toContain("tomate n'est pas de saison en novembre");
    expect(prompts[1]?.user).toContain("Ton menu précédent : ");
    expect(prompts[1]?.system).toBe(prompts[0]?.system);
  });

  it("s'arrête après 3 essais fautifs et garde le plus récent à égalité", async () => {
    const exclusion = { ...input, exclusions: ["dinde"] };
    const { model, prompts } = fakeModel([
      reply(menuOf([item("dinde"), item("tomate")])),
      reply(menuOf([item("tomate")])),
      reply(menuOf([item("tomate")], 500)),
    ]);
    const result = await composeMenu(exclusion, deps(model));
    expect(prompts).toHaveLength(3);
    expect(result.best?.number).toBe(3);
    expect(result.stop).toBe("max-attempts");
    expect(exitCodeOf(result)).toBe(1);
  });

  it("redemande après une réponse illisible, en citant l'erreur", async () => {
    const { model, prompts } = fakeModel([reply("Voici votre menu !"), reply(menuOf())]);
    const result = await composeMenu(input, deps(model));
    expect(prompts).toHaveLength(2);
    expect(prompts[1]?.user).toContain("La réponse n'est pas du JSON lisible.");
    expect(result.stop).toBe("valid");
  });

  it("renvoie une session de plus de 3 h à l'IA, puis s'arrête sur un menu valide", async () => {
    const tooLong = variant((menu) => {
      menu.dishes[2]!.phases.find((phase) => phase.id === "c3")!.minutes = 200;
    });
    const { model, prompts } = fakeModel([reply(tooLong), reply(menuOf())]);
    const result = await composeMenu(input, deps(model));
    expect(prompts).toHaveLength(2);
    expect(prompts[1]?.user).toContain("- [error] [session-length]");
    expect(result.stop).toBe("valid");
    expect(result.best?.check.session?.minutes).toBe(135);
  });

  it("résout sur un menu de 3000 phases en chaîne, avec un constat `phases` (3000 + les 11 phases des autres plats)", async () => {
    const huge = variant((menu) => {
      menu.dishes[0]!.phases = Array.from({ length: 3000 }, (_, i) => ({
        id: `x${i}`,
        description: "étape",
        minutes: 1,
        appliance: "none" as const,
        attended: false,
        after: i === 0 ? [] : [`x${i - 1}`],
      }));
    });
    const { model } = fakeModel([reply(huge)]);
    const result = await composeMenu({ ...input, maxAttempts: 1 }, deps(model));
    const messages = result.attempts[0]?.check.findings.map((finding) => finding.message);
    expect(messages?.some((message) => message.includes("3011 phases ; 60 au plus"))).toBe(true);
    expect(result.best?.check.session).toBeNull();
  });

  it("résout sur une phase de 150000 dépendances inconnues, avec un seul constat", async () => {
    const huge = variant((menu) => {
      menu.dishes[0]!.phases[0]!.after = Array.from({ length: 150000 }, (_, i) => `z${i}`);
    });
    const { model } = fakeModel([reply(huge)]);
    const result = await composeMenu({ ...input, maxAttempts: 1 }, deps(model));
    const phases = result.attempts[0]?.check.findings.filter(
      (finding) => finding.rule === "phases",
    );
    expect(phases).toHaveLength(1);
    expect(phases?.[0]?.message).toContain("150000 dépendances distinctes ; 60 au plus");
    expect(result.best?.check.session).toBeNull();
  });

  it("n'a pas de planning pour une réponse illisible", async () => {
    const { model } = fakeModel([reply("Voici votre menu !")]);
    const result = await composeMenu({ ...input, maxAttempts: 1 }, deps(model));
    expect(result.attempts[0]?.check.session).toBeNull();
  });

  it("refuse un menu vide", async () => {
    const { model } = fakeModel([reply('{"note":"","dishes":[]}')]);
    const result = await composeMenu({ ...input, maxAttempts: 1 }, deps(model));
    expect(result.best?.check.findings[0]?.rule).toBe("menu-shape");
    expect(exitCodeOf(result)).toBe(1);
  });

  it("ne donne pas le code 0 à un menu dont un ingrédient n'a pas de nom", async () => {
    const { model } = fakeModel([reply(menuOf([item("", { category: "other" })]))]);
    const result = await composeMenu({ ...input, maxAttempts: 1 }, deps(model));
    expect(result.best?.check.findings.map((finding) => finding.rule)).toEqual(["menu-shape"]);
    expect(exitCodeOf(result)).toBe(1);
  });

  it("s'arrête quand le même menu fautif revient", async () => {
    const faulty = menuOf([item("tomate")]);
    const { model, prompts } = fakeModel([reply(faulty), reply(faulty), reply(menuOf())]);
    const result = await composeMenu(input, deps(model));
    expect(prompts).toHaveLength(2);
    expect(result.stop).toBe("no-progress");
  });

  it("s'arrête sur une réponse coupée", async () => {
    const { model, prompts } = fakeModel([reply('{"dishes":[{"na', "max_tokens"), reply(menuOf())]);
    const result = await composeMenu(input, deps(model));
    expect(prompts).toHaveLength(1);
    expect(result.stop).toBe("truncated");
    expect(exitCodeOf(result)).toBe(2);
  });

  it("garde le premier menu quand le réseau tombe au deuxième essai", async () => {
    const { model, prompts } = fakeModel([
      reply(menuOf([item("tomate")])),
      new Error("réseau coupé"),
    ]);
    const result = await composeMenu(input, deps(model));
    expect(prompts).toHaveLength(2);
    expect(result.best?.number).toBe(1);
    expect(result.stop).toBe("technical-error");
    expect(exitCodeOf(result)).toBe(1);
    const text = renderComposeResult(result, input);
    expect(text).toContain(
      "a. Cabillaud, fondue de poireaux et riz complet (lundi · se garde 2 j au frigo)",
    );
    expect(text).toContain("tomate n'est pas de saison");
    expect(text).toContain("jetons de sortie : 50");
    expect(text).toContain("Erreur technique : réseau coupé");
  });

  it("reprend le message d'une exception du modèle tel quel", async () => {
    const { model } = fakeModel([new Error("x")]);
    const result = await composeMenu(input, deps(model));
    expect(result.technicalError).toBe("x");
  });

  it("s'arrête sur deux réponses illisibles identiques", async () => {
    const { model, prompts } = fakeModel([reply("bla"), reply(" bla "), reply(menuOf())]);
    const result = await composeMenu(input, deps(model));
    expect(prompts).toHaveLength(2);
    expect(result.stop).toBe("same-unreadable");
    expect(exitCodeOf(result)).toBe(2);
  });

  it("plafonne les essais à 3 dans le moteur, même avec une valeur forcée", async () => {
    const script = [1, 2, 3, 4, 5, 6].map((n) => reply(menuOf([item("tomate")], 100 * n)));
    const { model, prompts } = fakeModel(script);
    const result = await composeMenu({ ...input, maxAttempts: 6 as never }, deps(model));
    expect(prompts).toHaveLength(3);
    expect(result.calls).toBe(3);
  });

  it("compte les appels et les appels en échec", async () => {
    const { model } = fakeModel([reply(menuOf([item("tomate")])), new Error("réseau coupé")]);
    const result = await composeMenu(input, deps(model));
    expect(result.calls).toBe(2);
    expect(result.failedCalls).toBe(1);
    expect(result.attempts).toHaveLength(1);
  });

  it("ne rejette pas quand onAttempt lève", async () => {
    const { model } = fakeModel([reply(menuOf())]);
    const result = await composeMenu(input, {
      ...deps(model),
      onAttempt: () => {
        throw new Error("journal cassé");
      },
    });
    expect(result.attempts).toHaveLength(1);
    expect(result.stop).toBe("valid");
  });

  it("traite un contexte saturé comme une réponse coupée", async () => {
    const { model, prompts } = fakeModel([
      reply('{"dishes":[{"na', "model_context_window_exceeded"),
      reply(menuOf()),
    ]);
    const result = await composeMenu(input, deps(model));
    expect(prompts).toHaveLength(1);
    expect(result.stop).toBe("truncated");
  });

  it("accepte un menu valide même si la réponse est marquée coupée", async () => {
    const { model, prompts } = fakeModel([reply(menuOf(), "max_tokens"), reply(menuOf())]);
    const result = await composeMenu(input, deps(model));
    expect(prompts).toHaveLength(1);
    expect(result.stop).toBe("valid");
    expect(exitCodeOf(result)).toBe(0);
  });

  it("respecte maxAttempts: 1", async () => {
    const { model, prompts } = fakeModel([reply(menuOf([item("tomate")])), reply(menuOf())]);
    const result = await composeMenu({ ...input, maxAttempts: 1 }, deps(model));
    expect(prompts).toHaveLength(1);
    expect(result.stop).toBe("max-attempts");
  });

  it("enregistre un refus avec ses jetons", async () => {
    const { model, prompts } = fakeModel([reply("", "refusal"), reply(menuOf())]);
    const result = await composeMenu(input, deps(model));
    expect(prompts).toHaveLength(1);
    expect(result.attempts).toHaveLength(1);
    expect(result.attempts[0]?.reply.usage).toEqual(usage);
    expect(result.best).toBeNull();
    expect(result.stop).toBe("refusal");
    expect(exitCodeOf(result)).toBe(2);
    const text = renderComposeResult(result, input);
    expect(text).toContain("jetons de sortie : 50");
    expect(text).toContain("L'IA a refusé la demande.");
  });

  it("contrôle la saison d'un accompagnement du soir même", async () => {
    const { model } = fakeModel([reply(menuOf([item("courgette", { sameDay: true })]))]);
    const result = await composeMenu({ ...input, exclusions: [], maxAttempts: 1 }, deps(model));
    expect(result.best?.check.findings.map((finding) => finding.rule)).toEqual(["season"]);
  });

  it("appelle onAttempt après chaque essai", async () => {
    const { model } = fakeModel([reply(menuOf([item("tomate")])), reply(menuOf())]);
    const seen: number[] = [];
    await composeMenu(input, {
      ...deps(model),
      onAttempt: (attempt) => seen.push(attempt.number),
    });
    expect(seen).toEqual([1, 2]);
  });
});

describe("composeMenu : constats souples", () => {
  const rulesOf = (result: Awaited<ReturnType<typeof composeMenu>>) =>
    result.best?.check.findings.map((finding) => `${finding.level}:${finding.rule}`);

  it("renvoie un warning une seule fois : le même menu deux fois donne 2 appels", async () => {
    const noPulses = variant(withoutPulses);
    const { model, prompts } = fakeModel([reply(noPulses), reply(noPulses)]);
    const result = await composeMenu(input, deps(model));
    expect(prompts).toHaveLength(2);
    expect(prompts[1]?.user).toContain("- [warning] [pulses]");
    expect(prompts[1]?.user).toContain("Corrige tous les [error].");
    expect(result.stop).toBe("valid");
    expect(rulesOf(result)).toEqual(["warning:pulses"]);
    expect(exitCodeOf(result)).toBe(0);
  });

  it("ne relance pas d'essai pour un warning d'une règle déjà renvoyée, même si son texte change", async () => {
    const bigBeef = (qty: number) =>
      variant((menu) => {
        menu.dishes[2]!.ingredients[0]!.qty = qty;
      });
    const { model, prompts } = fakeModel([reply(bigBeef(1200)), reply(bigBeef(1400))]);
    const result = await composeMenu(input, deps(model));
    expect(prompts).toHaveLength(2);
    expect(result.stop).toBe("valid");
    expect(result.best?.check.findings[0]?.message).toContain("350 g par adulte");
    expect(prompts[1]?.user).toContain("300 g par adulte");
  });

  it("envoie le warning avec l'error, puis ne le renvoie plus", async () => {
    const noPulses = (extra: MenuIngredient[], qty = 400) =>
      variant((menu) => {
        withoutPulses(menu);
        menu.dishes[0]!.ingredients.push(...extra);
        menu.dishes[1]!.ingredients[1] = item("carotte", { qty });
      });
    const { model, prompts } = fakeModel([
      reply(noPulses([item("tomate")])),
      reply(noPulses([item("tomate")], 500)),
      reply(noPulses([])),
    ]);
    const result = await composeMenu(input, deps(model));
    expect(prompts).toHaveLength(3);
    expect(prompts[1]?.user).toContain("- [error] [season]");
    expect(prompts[1]?.user).toContain("- [warning] [pulses]");
    expect(prompts[2]?.user).toContain("- [error] [season]");
    expect(prompts[2]?.user).not.toContain("- [warning]");
    expect(result.stop).toBe("valid");
    expect(rulesOf(result)).toEqual(["warning:pulses"]);
  });

  it("le plat demandé ne masque pas le plafond : renvoyé une fois, avec la consigne de la demande", async () => {
    const twoBeef = variant((menu) => {
      menu.dishes[1] = {
        name: "Bœuf bourguignon",
        day: "tue",
        ingredients: [item("bœuf à braiser", { qty: 1200 }), item("carotte", { qty: 500 })],
        phases: menu.dishes[1]!.phases,
      };
      menu.dishes[2]!.ingredients[0]!.qty = 1200;
    });
    const { model, prompts } = fakeModel([reply(twoBeef), reply(twoBeef)]);
    const result = await composeMenu(
      { ...input, request: "un bœuf bourguignon, 5 dîners" },
      deps(model),
    );
    expect(prompts).toHaveLength(2);
    const meatLine = prompts[1]?.user
      .split("\n")
      .find((line) => line.startsWith("- [warning] [meat]"));
    expect(meatLine).toContain("« Bœuf bourguignon »");
    expect(meatLine).toContain("« Bœuf braisé aux carottes »");
    expect(meatLine).toContain("garde-le et ajuste les autres");
    expect(prompts[1]?.user).toContain("sans retirer un plat que la demande nomme");
    expect(result.stop).toBe("valid");
    expect(exitCodeOf(result)).toBe(0);
  });

  it("à erreurs égales, garde l'essai qui a le moins de warning", async () => {
    const faulty = menuOf([item("tomate")]);
    const faultyNoPulses = variant((menu) => {
      withoutPulses(menu);
      menu.dishes[0]!.ingredients.push(item("tomate"));
      menu.dishes[1]!.ingredients[1] = item("carotte", { qty: 500 });
    });
    const { model } = fakeModel([reply(faulty), reply(faultyNoPulses)]);
    const result = await composeMenu({ ...input, maxAttempts: 2 }, deps(model));
    expect(result.attempts).toHaveLength(2);
    expect(result.best?.number).toBe(1);
  });
});

describe("composeMenu : équipement", () => {
  it("l'équipement passe au prompt et aux contrôles", async () => {
    const withAirfryer = variant((menu) => {
      menu.dishes[0]!.phases.push(phase("a3", 10, "airfryer", false, ["a1"]));
    });
    const { model, prompts } = fakeModel([reply(withAirfryer)]);
    const equipment = HOUSEHOLD_EQUIPMENT.filter((spec) => spec.id !== "airfryer");
    const result = await composeMenu(
      { ...input, maxAttempts: 1 },
      { model, refs: REFERENTIAL, seasonTable: SEASON_TABLE, equipment },
    );
    expect(prompts[0]!.system.toLowerCase()).not.toContain("airfryer");
    expect(
      result.attempts[0]?.check.findings.filter((finding) => finding.rule === "equipment"),
    ).toHaveLength(1);
  });
});

// Épinglage : un plat épinglé ne sort jamais dans le menu retenu.
describe("épinglage et révision", () => {
  const nameOf = (index: number): string => balancedMenu().dishes[index]!.name;
  const B = nameOf(1);
  const X = "Pizza maison";
  // Deux erreurs de saison (tomate et poivron, hors saison en novembre).
  const twoFaults = (menu: Menu): void => {
    menu.dishes[0]!.ingredients.push(item("tomate"), item("poivron"));
  };
  const oneFault = (menu: Menu): void => {
    menu.dishes[0]!.ingredients.push(item("tomate"));
  };
  // Le plat b change de nom : il compte comme retiré, et le menu garde ses 5 plats.
  const rename = (menu: Menu, index: number, name: string): void => {
    menu.dishes[index]!.name = name;
  };
  const replyOf = (
    change: (menu: Menu) => void,
    options: { requested?: readonly string[]; note?: string } = {},
  ): ModelReply => {
    const menu = balancedMenu();
    change(menu);
    return reply(asReply(menu, options));
  };
  const errorsOf = (attempt: Attempt | undefined) =>
    (attempt?.check.findings ?? []).filter((finding) => finding.level === "error");
  const pinnedFindings = (attempt: Attempt | undefined) =>
    (attempt?.check.findings ?? []).filter((finding) => finding.rule === "pinned");

  const revise: ReviseInput = {
    initialRequest: "un bœuf bourguignon, 5 dîners",
    message: "remplace le plat c",
    current: balancedMenu(),
    conversation: [],
    exclusions: ["courgette"],
    month: 11,
    sessionDay: "sun",
    maxAttempts: 3,
    pinned: [],
    history: [],
  };

  describe("reviseMenu", () => {
    it("l'IA retire un plat épinglé au premier essai : arrêt, menu courant conservé, un seul appel", async () => {
      const input: ReviseInput = { ...revise, pinned: [B], current: balancedMenu() };
      const before = structuredClone(input);
      const { model, prompts } = fakeModel([
        replyOf((menu) => rename(menu, 1, X), { requested: [X] }),
        replyOf(() => {}),
      ]);
      const result = await reviseMenu(input, deps(model));
      expect(prompts).toHaveLength(1);
      expect(result.calls).toBe(1);
      expect(result.stop).toBe("pinned-removed");
      expect(result.best).toBeNull();
      expect(result.pinnedRemoved).toEqual([B]);
      expect(result.pinned).toEqual([B]);
      expect(input).toEqual(before);
      expect(exitCodeOf(result)).toBe(2);
    });

    it("`best` filtre la perte d'épingle même quand elle a moins d'erreurs", async () => {
      const input: ReviseInput = { ...revise, pinned: [B], maxAttempts: 2 };
      const { model } = fakeModel([replyOf(twoFaults), replyOf((menu) => rename(menu, 1, X))]);
      const result = await reviseMenu(input, deps(model));
      expect(result.attempts).toHaveLength(2);
      expect(errorsOf(result.attempts[0])).toHaveLength(2);
      expect(errorsOf(result.attempts[1])).toHaveLength(1);
      expect(pinnedFindings(result.attempts[1])).toHaveLength(1);
      expect(result.best?.number).toBe(1);
      expect(result.pinned).toEqual([B]);
    });

    it("un plat `requested` acquis à l'essai 1 est protégé à l'essai 2", async () => {
      const { model, prompts } = fakeModel([
        replyOf(
          (menu) => {
            twoFaults(menu);
            rename(menu, 1, X);
          },
          { requested: [X] },
        ),
        replyOf(() => {}),
      ]);
      const result = await reviseMenu({ ...revise, maxAttempts: 2 }, deps(model));
      expect(prompts[1]?.user).toContain(`Plats épinglés, à garder sous ce nom : ${X}.`);
      expect(pinnedFindings(result.attempts[1])).toHaveLength(1);
      expect(result.best?.number).toBe(1);
      expect(result.pinned).toEqual([X]);
    });

    it("acquisition tardive : aucune épingle rendue hors du menu retenu", async () => {
      const { model } = fakeModel([
        replyOf(withoutPulses),
        replyOf(
          (menu) => {
            withoutPulses(menu);
            oneFault(menu);
            rename(menu, 1, X);
          },
          { requested: [X] },
        ),
      ]);
      const result = await reviseMenu({ ...revise, maxAttempts: 2 }, deps(model));
      expect(result.attempts).toHaveLength(2);
      expect(errorsOf(result.attempts[0])).toHaveLength(0);
      expect(errorsOf(result.attempts[1])).toHaveLength(1);
      expect(result.best?.number).toBe(1);
      expect(result.pinned).toEqual([]);
    });

    it("un nouveau plat `requested` est protégé sur trois essais", async () => {
      const { model, prompts } = fakeModel([
        replyOf(
          (menu) => {
            oneFault(menu);
            rename(menu, 1, X);
          },
          { requested: [X] },
        ),
        replyOf(() => {}),
        replyOf((menu) => rename(menu, 1, X)),
      ]);
      const result = await reviseMenu(revise, deps(model));
      expect(prompts).toHaveLength(3);
      expect(prompts[1]?.user).toContain(`Plats épinglés, à garder sous ce nom : ${X}.`);
      expect(prompts[2]?.user).toContain("[pinned]");
      expect(result.stop).toBe("valid");
      expect(result.best?.number).toBe(3);
      expect(result.pinned).toEqual([X]);
    });

    it("un plat déjà au menu marqué `requested` n'est pas réépinglé", async () => {
      const { model } = fakeModel([replyOf(() => {}, { requested: [B] })]);
      const result = await reviseMenu({ ...revise, pinned: [] }, deps(model));
      expect(result.stop).toBe("valid");
      expect(result.attempts[0]?.requested).toEqual([B]);
      expect(result.pinned).toEqual([]);
    });

    it("un `requested` acquis reste épinglé si l'essai retenu le garde sans la marque", async () => {
      const { model } = fakeModel([
        replyOf(
          (menu) => {
            oneFault(menu);
            rename(menu, 1, X);
          },
          { requested: [X] },
        ),
        replyOf((menu) => rename(menu, 1, X)),
      ]);
      const result = await reviseMenu(revise, deps(model));
      expect(result.best?.number).toBe(2);
      expect(result.pinned).toEqual([X]);
    });

    it("perte d'une épingle d'entrée au 2e essai : corrigée au 3e, pas d'arrêt", async () => {
      const { model, prompts } = fakeModel([
        replyOf(oneFault),
        replyOf((menu) => rename(menu, 1, X)),
        replyOf(() => {}),
      ]);
      const result = await reviseMenu({ ...revise, pinned: [B] }, deps(model));
      expect(prompts).toHaveLength(3);
      expect(prompts[2]?.user).toContain("[pinned]");
      expect(result.stop).toBe("valid");
      expect(result.best?.number).toBe(3);
      expect(result.pinnedRemoved).toEqual([]);
      expect(result.pinned).toEqual([B]);
    });

    it("tous les essais lisibles perdent l'épingle : pinned-removed, pas de menu, épingle d'entrée rendue", async () => {
      // Le 1er essai illisible évite l'arrêt immédiat ; les deux suivants perdent b.
      const { model } = fakeModel([
        reply("Voici votre menu !"),
        replyOf((menu) => rename(menu, 1, X)),
        replyOf((menu) => rename(menu, 1, "Gratin de pâtes")),
      ]);
      const result = await reviseMenu({ ...revise, pinned: [B] }, deps(model));
      expect(result.calls).toBe(3);
      expect(result.stop).toBe("pinned-removed");
      expect(result.best).toBeNull();
      expect(result.pinnedRemoved).toEqual([B]);
      expect(result.pinned).toEqual([B]);
    });

    it("sans `dinners`, le nombre de dîners reste celui du menu courant", async () => {
      const fourDishes = (menu: Menu): void => {
        menu.dishes.pop();
      };
      const current = balancedMenu();
      fourDishes(current);
      const shapeOf = (attempt: Attempt | undefined) =>
        attempt?.check.findings.filter((finding) => finding.rule === "menu-shape") ?? [];
      for (const message of [
        "remplace le plat c",
        "mets du poisson deux soirs",
        "ajoute un repas végétarien",
      ]) {
        const four = fakeModel([replyOf(fourDishes)]);
        const kept = await reviseMenu(
          { ...revise, current, message, maxAttempts: 1 },
          deps(four.model),
        );
        expect(shapeOf(kept.attempts[0])).toEqual([]);
        expect(four.prompts[0]?.user).toContain("Nombre de dîners : 4");
        const three = fakeModel([
          replyOf((menu) => {
            menu.dishes.length = 3;
          }),
        ]);
        const fewer = await reviseMenu(
          { ...revise, current, message, maxAttempts: 1 },
          deps(three.model),
        );
        expect(shapeOf(fewer.attempts[0])).toHaveLength(1);
      }
    });

    it("avec `dinners`, le prompt le dit et le contrôle l'attend ; hors de 1 à 5, rejet sans appel", async () => {
      const current = balancedMenu();
      current.dishes.pop();
      const { model, prompts } = fakeModel([replyOf(() => {})]);
      const result = await reviseMenu(
        { ...revise, current, dinners: 5, maxAttempts: 1 },
        deps(model),
      );
      expect(prompts[0]?.user).toContain("Nombre de dîners : 5");
      expect(prompts[0]?.user).toContain("Le menu passe de 4 à 5 dîners");
      expect(
        result.attempts[0]?.check.findings.some((finding) => finding.rule === "menu-shape"),
      ).toBe(false);
      for (const dinners of [0, 2.5]) {
        const fake = fakeModel([replyOf(() => {})]);
        await expect(reviseMenu({ ...revise, current, dinners }, deps(fake.model))).rejects.toThrow(
          "entier de 1 à 5",
        );
        expect(fake.prompts).toHaveLength(0);
      }
    });

    it("la saison se souvient des demandes précédentes, au-delà des 10 messages du prompt", async () => {
      const conversation = [
        "ajoute de la tomate",
        ...Array.from({ length: 11 }, (_, i) => `message ${i}`),
      ];
      const withTomato = (menu: Menu): void => {
        menu.dishes[0]!.ingredients.push(item("tomate"));
      };
      const seasonOf = (attempt: Attempt | undefined) =>
        attempt?.check.findings.filter((finding) => finding.rule === "season") ?? [];
      const asked = fakeModel([replyOf(withTomato)]);
      const remembered = await reviseMenu(
        { ...revise, message: "déplace le plat a au mardi", conversation, maxAttempts: 1 },
        deps(asked.model),
      );
      expect(seasonOf(remembered.attempts[0])).toEqual([]);
      expect(asked.prompts[0]?.user).not.toContain("ajoute de la tomate");
      // Contre-épreuve : sans ce message, la tomate est hors saison.
      const forgotten = await reviseMenu(
        {
          ...revise,
          message: "déplace le plat a au mardi",
          conversation: conversation.slice(1),
          maxAttempts: 1,
        },
        deps(fakeModel([replyOf(withTomato)]).model),
      );
      expect(seasonOf(forgotten.attempts[0])).toHaveLength(1);
    });

    it("un `requested` d'un essai qui perd l'épingle n'est pas acquis : le 3e essai, qui la rend, est retenu", async () => {
      const { model, prompts } = fakeModel([
        reply("Voici votre menu !"),
        replyOf((menu) => rename(menu, 1, X), { requested: [X] }),
        replyOf(() => {}),
      ]);
      const result = await reviseMenu({ ...revise, pinned: [B] }, deps(model));
      expect(prompts[2]?.user).toContain(`Plats épinglés, à garder sous ce nom : ${B}.`);
      expect(prompts[2]?.user).not.toContain(`${B}, ${X}`);
      expect(result.best?.number).toBe(3);
      expect(result.stop).toBe("valid");
      expect(result.pinnedRemoved).toEqual([]);
      expect(result.pinned).toEqual([B]);
    });

    it("rejette sans appel un menu courant de 6 plats quand `dinners` manque", async () => {
      const six = balancedMenu();
      six.dishes.push({ ...structuredClone(six.dishes[0]!), name: "Sixième", day: "fri" });
      const fake = fakeModel([replyOf(() => {})]);
      await expect(reviseMenu({ ...revise, current: six }, deps(fake.model))).rejects.toThrow(
        "entier de 1 à 5",
      );
      expect(fake.prompts).toHaveLength(0);
    });

    it("rejette sans appel un menu courant vide quand `dinners` manque", async () => {
      const fake = fakeModel([replyOf(() => {})]);
      await expect(
        reviseMenu({ ...revise, current: { dishes: [] } }, deps(fake.model)),
      ).rejects.toThrow("entier de 1 à 5");
      expect(fake.prompts).toHaveLength(0);
    });

    it("garde sa copie des épingles quand l'appelant vide son tableau pendant l'appel", async () => {
      const pinned = [B];
      const model: Model = {
        complete() {
          pinned.length = 0;
          return Promise.resolve(reply("", "refusal"));
        },
      };
      const result = await reviseMenu({ ...revise, pinned }, deps(model));
      expect(result.stop).toBe("refusal");
      expect(result.pinned).toEqual([B]);
    });

    it("envoie le menu courant, la demande d'origine et l'historique dans le prompt", async () => {
      const { model, prompts } = fakeModel([replyOf(() => {})]);
      await reviseMenu(
        {
          ...revise,
          maxAttempts: 1,
          pinned: [B],
          history: [{ date: "2026-11-09", dishes: ["Lasagnes"] }],
        },
        deps(model),
      );
      const user = prompts[0]!.user;
      expect(user).toContain("Demande d'origine : un bœuf bourguignon, 5 dîners");
      expect(user).toContain(`Menu courant : ${JSON.stringify(revise.current)}`);
      expect(user).toContain("Nouveau message : remplace le plat c");
      expect(user).toContain(`Plats épinglés, à garder sous ce nom : ${B}.`);
      expect(user).toContain("2026-11-09 : Lasagnes");
    });
  });

  describe("composeMenu", () => {
    const composeInput: ComposeInput = { ...input, pinned: [B], maxAttempts: 2 };

    it("`best` filtre la perte d'épingle même quand elle a moins d'erreurs", async () => {
      const { model } = fakeModel([replyOf(twoFaults), replyOf((menu) => rename(menu, 1, X))]);
      const result = await composeMenu(composeInput, deps(model));
      expect(errorsOf(result.attempts[0])).toHaveLength(2);
      expect(errorsOf(result.attempts[1])).toHaveLength(1);
      expect(result.best?.number).toBe(1);
      expect(result.pinned).toEqual([B]);
    });

    it("un plat `requested` acquis à l'essai 1 est protégé à l'essai 2", async () => {
      const { model, prompts } = fakeModel([
        replyOf(
          (menu) => {
            twoFaults(menu);
            rename(menu, 1, X);
          },
          { requested: [X] },
        ),
        replyOf(() => {}),
      ]);
      const result = await composeMenu({ ...composeInput, pinned: [] }, deps(model));
      expect(prompts[0]?.user).not.toContain("Plats épinglés");
      expect(prompts[1]?.user).toContain(`Plats épinglés, à garder sous ce nom : ${X}.`);
      expect(result.best?.number).toBe(1);
      expect(result.pinned).toEqual([X]);
    });

    it("acquisition tardive : aucune épingle rendue hors du menu retenu", async () => {
      const { model } = fakeModel([
        replyOf(withoutPulses),
        replyOf(
          (menu) => {
            withoutPulses(menu);
            oneFault(menu);
            rename(menu, 1, X);
          },
          { requested: [X] },
        ),
      ]);
      const result = await composeMenu({ ...composeInput, pinned: [] }, deps(model));
      expect(result.best?.number).toBe(1);
      expect(result.pinned).toEqual([]);
    });

    it("un `requested` acquis reste épinglé si l'essai retenu le garde sans la marque", async () => {
      const { model } = fakeModel([
        replyOf(
          (menu) => {
            oneFault(menu);
            rename(menu, 1, X);
          },
          { requested: [X] },
        ),
        replyOf((menu) => rename(menu, 1, X)),
      ]);
      const result = await composeMenu({ ...composeInput, pinned: [] }, deps(model));
      expect(result.best?.number).toBe(2);
      expect(result.pinned).toEqual([X]);
    });

    it("tous les essais perdent l'épingle : pinned-removed, pas de menu, épingles d'entrée rendues", async () => {
      const { model } = fakeModel([
        replyOf((menu) => rename(menu, 1, X)),
        replyOf((menu) => rename(menu, 1, "Gratin de pâtes")),
      ]);
      const result = await composeMenu(composeInput, deps(model));
      expect(result.calls).toBe(2);
      expect(result.stop).toBe("pinned-removed");
      expect(result.best).toBeNull();
      expect(result.pinnedRemoved).toEqual([B]);
      expect(result.pinned).toEqual([B]);
      expect(exitCodeOf(result)).toBe(2);
    });

    it("garde l'épingle à l'essai 1, la perd à l'essai 2, la retrouve à l'essai 3 sans erreur", async () => {
      const { model } = fakeModel([
        replyOf(oneFault),
        replyOf((menu) => rename(menu, 1, X)),
        replyOf(() => {}),
      ]);
      const result = await composeMenu({ ...composeInput, maxAttempts: 3 }, deps(model));
      expect(result.best?.number).toBe(3);
      expect(errorsOf(result.best ?? undefined)).toEqual([]);
      expect(result.stop).toBe("valid");
    });

    it("« Bœuf bourguignon » épinglé : « boeuf bourguignons » le garde", async () => {
      const { model } = fakeModel([replyOf((menu) => rename(menu, 1, "boeuf bourguignons"))]);
      const result = await composeMenu(
        { ...composeInput, pinned: ["Bœuf bourguignon"], maxAttempts: 1 },
        deps(model),
      );
      expect(pinnedFindings(result.attempts[0])).toEqual([]);
      expect(result.pinned).toEqual(["Bœuf bourguignon"]);
    });

    it("clés de plat : « 🥘 » épinglé et plat « 🍲 », ou plat renommé : constat pinned ; nom blanc : pas acquis", async () => {
      const emoji = await composeMenu(
        { ...composeInput, pinned: ["🥘"], maxAttempts: 1 },
        deps(fakeModel([replyOf((menu) => rename(menu, 1, "🍲"))]).model),
      );
      expect(pinnedFindings(emoji.attempts[0])).toHaveLength(1);
      const renamed = await composeMenu(
        { ...composeInput, pinned: ["Bœuf bourguignon"], maxAttempts: 1 },
        deps(fakeModel([replyOf((menu) => rename(menu, 1, "Bourguignon"))]).model),
      );
      expect(pinnedFindings(renamed.attempts[0])).toHaveLength(1);
      const blank = await composeMenu(
        { ...composeInput, pinned: [], maxAttempts: 1 },
        deps(
          fakeModel([replyOf((menu) => rename(menu, 1, "\u200b"), { requested: ["\u200b"] })])
            .model,
        ),
      );
      expect(blank.attempts[0]?.requested).toEqual(["\u200b"]);
      expect(blank.pinned).toEqual([]);
    });

    it("un `requested` d'un essai qui perd l'épingle n'est pas acquis : le 3e essai, qui la rend, est retenu", async () => {
      const { model, prompts } = fakeModel([
        reply("Voici votre menu !"),
        replyOf((menu) => rename(menu, 1, X), { requested: [X] }),
        replyOf(() => {}),
      ]);
      const result = await composeMenu({ ...composeInput, maxAttempts: 3 }, deps(model));
      expect(prompts[2]?.user).toContain(`Plats épinglés, à garder sous ce nom : ${B}.`);
      expect(prompts[2]?.user).not.toContain(`${B}, ${X}`);
      expect(result.best?.number).toBe(3);
      expect(result.stop).toBe("valid");
      expect(result.pinned).toEqual([B]);
    });

    it("`pinnedRemoved` réunit les épingles perdues à des essais différents : B à l'essai 2, C à l'essai 3", async () => {
      const C = nameOf(2);
      const { model } = fakeModel([
        reply("Voici votre menu !"),
        replyOf((menu) => rename(menu, 1, X)),
        replyOf((menu) => rename(menu, 2, "Gratin de pâtes")),
      ]);
      const result = await composeMenu(
        { ...composeInput, pinned: [B, C], maxAttempts: 3 },
        deps(model),
      );
      expect(result.best).toBeNull();
      expect(result.stop).toBe("pinned-removed");
      expect(result.pinnedRemoved).toEqual([B, C]);
      expect(result.pinned).toEqual([B, C]);
    });

    it("ne rend pas une épingle ajoutée par l'appelant à son tableau pendant l'appel", async () => {
      const pinned = [B];
      const model: Model = {
        complete() {
          pinned.push("Absent du menu");
          return Promise.resolve(replyOf(() => {}));
        },
      };
      const result = await composeMenu({ ...composeInput, pinned, maxAttempts: 1 }, deps(model));
      expect(result.stop).toBe("valid");
      expect(result.pinned).toEqual([B]);
    });

    it("garde sa copie des épingles quand l'appelant vide son tableau pendant l'appel, puis refus", async () => {
      const pinned = [B];
      const model: Model = {
        complete() {
          pinned.length = 0;
          return Promise.resolve(reply("", "refusal"));
        },
      };
      const result = await composeMenu({ ...composeInput, pinned }, deps(model));
      expect(result.best).toBeNull();
      expect(result.pinned).toEqual([B]);
    });

    it("un essai qui perd l'épingle puis un refus : `stop` reste « refusal », `pinnedRemoved` dit la perte", async () => {
      const { model } = fakeModel([replyOf((menu) => rename(menu, 1, X)), reply("", "refusal")]);
      const result = await composeMenu(composeInput, deps(model));
      expect(result.best).toBeNull();
      expect(result.stop).toBe("refusal");
      expect(result.pinnedRemoved).toEqual([B]);
      expect(result.pinned).toEqual([B]);
    });

    it("un essai qui perd l'épingle puis une erreur technique : `stop` reste « technical-error »", async () => {
      const { model } = fakeModel([
        replyOf((menu) => rename(menu, 1, X)),
        new Error("réseau coupé"),
      ]);
      const result = await composeMenu(composeInput, deps(model));
      expect(result.best).toBeNull();
      expect(result.stop).toBe("technical-error");
      expect(result.technicalError).toBe("réseau coupé");
      expect(result.pinnedRemoved).toEqual([B]);
    });

    it("un nom blanc marqué `requested` à l'essai 1 n'est pas épinglé à l'essai 2", async () => {
      const { model, prompts } = fakeModel([
        replyOf((menu) => rename(menu, 1, "\u200b"), { requested: ["\u200b"] }),
        replyOf(() => {}),
      ]);
      const result = await composeMenu({ ...composeInput, pinned: [] }, deps(model));
      expect(prompts[1]?.user).not.toContain("Plats épinglés");
      expect(pinnedFindings(result.attempts[1])).toEqual([]);
      expect(result.best?.number).toBe(2);
    });

    it("rend la note de l'IA et ne modifie pas `input.pinned`", async () => {
      const pinned = [B];
      const { model } = fakeModel([
        replyOf((menu) => rename(menu, 1, B), { note: "Voici le menu.", requested: [X] }),
      ]);
      const result = await composeMenu({ ...composeInput, pinned, maxAttempts: 1 }, deps(model));
      expect(result.best?.note).toBe("Voici le menu.");
      expect(pinned).toEqual([B]);
    });
  });
});

describe("nombre de dîners fixé par l'appelant", () => {
  const FIXED_LINE = "fixé par l'utilisateur";
  const fourDinners: ComposeInput = { ...input, request: "compose-moi 4 dîners" };
  const fourDishes = variant((menu) => {
    menu.dishes.pop();
  });

  it("`dinners` l'emporte sur la demande : prompt à 5 avec la ligne « fixé », 4 plats refusés, 5 plats acceptés", async () => {
    const four = fakeModel([reply(fourDishes)]);
    const refused = await composeMenu(
      { ...fourDinners, dinners: 5, maxAttempts: 1 },
      deps(four.model),
    );
    expect(four.prompts[0]?.user).toContain("Nombre de dîners : 5");
    expect(four.prompts[0]?.user).toContain(FIXED_LINE);
    expect(refused.best?.check.findings.some((finding) => finding.rule === "menu-shape")).toBe(
      true,
    );

    const five = fakeModel([reply(asReply(balancedMenu()))]);
    const accepted = await composeMenu(
      { ...fourDinners, dinners: 5, maxAttempts: 1 },
      deps(five.model),
    );
    expect(accepted.best?.check.findings.some((finding) => finding.rule === "menu-shape")).toBe(
      false,
    );
  });

  it("sans `dinners`, rien ne change : le nombre vient de la demande, sans la ligne « fixé »", async () => {
    const { model, prompts } = fakeModel([reply(asReply(balancedMenu()))]);
    await composeMenu({ ...fourDinners, maxAttempts: 1 }, deps(model));
    expect(prompts[0]?.user).toContain("Nombre de dîners : 4");
    expect(prompts[0]?.user).not.toContain(FIXED_LINE);
  });

  it("refuse 0, 6 et 2,5 avant tout appel", async () => {
    for (const dinners of [0, 6, 2.5]) {
      const { model, prompts } = fakeModel([reply(asReply(balancedMenu()))]);
      await expect(composeMenu({ ...input, dinners }, deps(model))).rejects.toThrow(
        "Le nombre de dîners doit être un entier de 1 à 5.",
      );
      expect(prompts).toHaveLength(0);
    }
  });

  it("une révision avec `dinners` porte la ligne « fixé », sans `dinners` elle ne la porte pas", async () => {
    const revision: ReviseInput = {
      initialRequest: "un bœuf bourguignon",
      message: "remplace le plat c",
      current: balancedMenu(),
      conversation: [],
      exclusions: [],
      month: 11,
      sessionDay: "sun",
      maxAttempts: 1,
      pinned: [],
      history: [],
    };
    const fixed = fakeModel([reply(asReply(balancedMenu()))]);
    await reviseMenu({ ...revision, dinners: 5 }, deps(fixed.model));
    expect(fixed.prompts[0]?.user).toContain(FIXED_LINE);
    const free = fakeModel([reply(asReply(balancedMenu()))]);
    await reviseMenu(revision, deps(free.model));
    expect(free.prompts[0]?.user).not.toContain(FIXED_LINE);
  });
});
