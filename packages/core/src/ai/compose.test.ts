import { describe, expect, it } from "vitest";
import type { Day, Menu, MenuIngredient } from "../domain/menu.ts";
import { DAYS } from "../domain/menu.ts";
import { REFERENTIAL } from "../ingredients/referential.ts";
import { SEASON_TABLE } from "../season/season-table.ts";
import { composeMenu, exitCodeOf } from "./compose.ts";
import type { ComposeInput } from "./compose.ts";
import type { MenuModel, ModelReply, TokenUsage } from "./model.ts";
import { renderComposeResult } from "./render.ts";

const usage: TokenUsage = { input: 100, output: 50, cacheRead: 0, cacheWrite: 0 };

function reply(text: string, stopReason: string | null = "end_turn"): ModelReply {
  return { text, stopReason, usage };
}

function fakeModel(script: (ModelReply | Error)[]) {
  const prompts: { system: string; user: string }[] = [];
  const model: MenuModel = {
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

function menuOf(extra: MenuIngredient[] = [], qty = 400): string {
  const menu: Menu = {
    dishes: DAYS.map((day: Day, i) => ({
      name: `Plat ${i + 1}`,
      day,
      ingredients: i === 0 ? [item("carotte", { qty }), ...extra] : [item("carotte", { qty })],
    })),
  };
  return JSON.stringify(menu);
}

const input: ComposeInput = {
  request: "un bœuf bourguignon, 5 dîners",
  exclusions: ["courgette"],
  month: 11,
  maxAttempts: 3,
};
const deps = (model: MenuModel) => ({ model, refs: REFERENTIAL, seasonTable: SEASON_TABLE });

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
    const exclusion = { ...input, exclusions: ["poulet"] };
    const { model, prompts } = fakeModel([
      reply(menuOf([item("blanc de poulet"), item("tomate")])),
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
    expect(text).toContain("a. Plat 1 (lundi)");
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
