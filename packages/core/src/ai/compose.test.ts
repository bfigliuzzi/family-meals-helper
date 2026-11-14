import { describe, expect, it } from "vitest";
import type { Menu, MenuIngredient } from "../domain/menu.ts";
import { REFERENTIAL } from "../ingredients/referential.ts";
import { balancedMenu } from "../rules/fixtures/menus.ts";
import { SEASON_TABLE } from "../season/season-table.ts";
import { composeMenu, exitCodeOf } from "./compose.ts";
import type { ComposeInput } from "./compose.ts";
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
  return JSON.stringify(menu);
}

// balancedMenu() modifié par `change`, sérialisé.
function variant(change: (menu: Menu) => void): string {
  const menu = balancedMenu();
  change(menu);
  return JSON.stringify(menu);
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
};
const deps = (model: Model) => ({ model, refs: REFERENTIAL, seasonTable: SEASON_TABLE });

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
    const { model } = fakeModel([reply('{"dishes":[]}')]);
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
