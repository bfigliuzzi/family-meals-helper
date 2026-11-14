import { describe, expect, it } from "vitest";
import type { Detail } from "../domain/detail.ts";
import { HOUSEHOLD_EQUIPMENT } from "../equipment/household.ts";
import { buildIngredientIndex } from "../ingredients/index-lookup.ts";
import { REFERENTIAL } from "../ingredients/referential.ts";
import { balancedDetail, balancedDetailLasting, cyclicDetail } from "../rules/fixtures/detail.ts";
import { balancedMenu } from "../rules/fixtures/menus.ts";
import { detailMenu } from "./detail.ts";
import type { Model, ModelReply, TokenUsage } from "./model.ts";

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

const lasting = (total: number): string => JSON.stringify(balancedDetailLasting(total));
const cyclic = (): string => JSON.stringify(cyclicDetail());

const menu = balancedMenu();
const index = buildIngredientIndex(REFERENTIAL);
const run = (
  model: Model,
  maxAttempts: 1 | 2 | 3 = 3,
  onAttempt?: Parameters<typeof detailMenu>[1]["onAttempt"],
  exclusions: readonly string[] = [],
) =>
  detailMenu(
    { menu, sessionDay: "sun", maxAttempts, composedMinutes: 135, exclusions },
    {
      model,
      equipment: HOUSEHOLD_EQUIPMENT,
      index,
      ...(onAttempt === undefined ? {} : { onAttempt }),
    },
  );

describe("detailMenu", () => {
  it("lit une réponse valide : valid en 1 essai", async () => {
    const { model, prompts } = fakeModel([reply(JSON.stringify(balancedDetail()))]);
    const result = await run(model);
    expect(result.stop).toBe("valid");
    expect(result.attempts).toHaveLength(1);
    expect(result.best?.detail).toEqual(balancedDetail());
    expect(result.best?.plan?.minutes).toBe(135);
    expect(result.calls).toBe(1);
    expect(result.failedCalls).toBe(0);
    expect(prompts[0]?.user).not.toContain("Constats à corriger");
  });

  it("accepte un bloc de code et des warning restants", async () => {
    const detail: Detail = balancedDetail();
    const uncited = {
      ...detail,
      steps: detail.steps.map((s) =>
        s.id === "s12" ? { ...s, text: "Laver et émincer les poireaux" } : s,
      ),
    };
    const { model } = fakeModel([reply(`\`\`\`json\n${JSON.stringify(uncited)}\n\`\`\``)]);
    const result = await run(model);
    expect(result.stop).toBe("valid");
    expect(result.best?.findings.map((finding) => finding.level)).toEqual(["warning"]);
  });

  it("corrige un détail à 200 min : le 2e prompt contient le constat et la fiche précédente", async () => {
    const { model, prompts } = fakeModel([reply(lasting(200)), reply(lasting(150))]);
    const result = await run(model);
    expect(result.stop).toBe("valid");
    expect(result.attempts).toHaveLength(2);
    expect(result.best?.number).toBe(2);
    expect(result.best?.plan?.minutes).toBe(150);
    expect(prompts[1]?.user).toContain("[session-length]");
    expect(prompts[1]?.user).toContain(
      `Ta fiche précédente : ${JSON.stringify(JSON.parse(lasting(200)))}`,
    );
  });

  it("garde le plus court de trois essais trop longs : 300, 181, 240 → 181", async () => {
    const { model } = fakeModel([reply(lasting(300)), reply(lasting(181)), reply(lasting(240))]);
    const result = await run(model);
    expect(result.stop).toBe("max-attempts");
    expect(result.attempts).toHaveLength(3);
    expect(result.best?.plan?.minutes).toBe(181);
    expect(result.best?.number).toBe(2);
  });

  it("préfère un essai long mais admissible à un essai cyclique", async () => {
    const { model } = fakeModel([reply(cyclic()), reply(lasting(200))]);
    const result = await run(model, 2);
    expect(result.attempts[0]?.plan).toBeNull();
    expect(result.best?.number).toBe(2);
    expect(result.best?.plan?.minutes).toBe(200);
  });

  describe("entre deux essais non admissibles", () => {
    // Un cycle : 1 error. Le même cycle plus une ligne du soir pour un plat inconnu : 2 error.
    const oneError = (): string => JSON.stringify(cyclicDetail());
    const twoErrors = (): string => {
      const detail = cyclicDetail();
      return JSON.stringify({
        ...detail,
        evenings: [...detail.evenings, { dish: "z", text: "plat inconnu" }],
      });
    };
    const errorsOf = (attempt: { findings: { level: string }[] } | undefined): number =>
      attempt?.findings.filter((finding) => finding.level === "error").length ?? -1;

    it("garde celui qui a le moins d'erreurs : 2 erreurs puis 1 → le second", async () => {
      const { model } = fakeModel([reply(twoErrors()), reply(oneError())]);
      const result = await run(model, 2);
      expect(errorsOf(result.attempts[0])).toBe(2);
      expect(errorsOf(result.attempts[1])).toBe(1);
      expect(result.best?.number).toBe(2);
    });

    it("garde celui qui a le moins d'erreurs : 1 erreur puis 2 → le premier", async () => {
      const { model } = fakeModel([reply(oneError()), reply(twoErrors())]);
      const result = await run(model, 2);
      expect(errorsOf(result.attempts[0])).toBe(1);
      expect(errorsOf(result.attempts[1])).toBe(2);
      expect(result.best?.number).toBe(1);
    });

    it("prend le plus récent à égalité d'erreurs, avec deux fiches différentes", async () => {
      const other = JSON.stringify({
        ...cyclicDetail(),
        evenings: balancedDetail().evenings.map((line) => ({ ...line, text: `${line.text} !` })),
      });
      const { model } = fakeModel([reply(oneError()), reply(other)]);
      const result = await run(model, 2);
      expect(result.stop).toBe("max-attempts");
      expect(errorsOf(result.attempts[0])).toBe(1);
      expect(errorsOf(result.attempts[1])).toBe(1);
      expect(result.best?.number).toBe(2);
    });
  });

  it("garde le premier essai quand l'erreur technique arrive au deuxième appel", async () => {
    const { model } = fakeModel([reply(lasting(200)), new Error("réseau coupé")]);
    const result = await run(model, 3);
    expect(result.stop).toBe("technical-error");
    expect(result.calls).toBe(2);
    expect(result.failedCalls).toBe(1);
    expect(result.best?.number).toBe(1);
    expect(result.best?.plan?.minutes).toBe(200);
  });

  it("ne dépasse jamais 3 appels, même avec un plafond hors bornes", async () => {
    const script = [
      reply(lasting(300)),
      reply(lasting(290)),
      reply(lasting(280)),
      reply(lasting(270)),
    ];
    const { model, prompts } = fakeModel(script);
    const result = await run(model, 9 as 3);
    expect(prompts).toHaveLength(3);
    expect(result.calls).toBe(3);
    const one = fakeModel(script);
    await run(one.model, 0 as 1);
    expect(one.prompts).toHaveLength(1);
  });

  it("passe d'une réponse illisible à une réponse lisible", async () => {
    const { model, prompts } = fakeModel([reply("voici la fiche !"), reply(lasting(150))]);
    const result = await run(model);
    expect(result.stop).toBe("valid");
    expect(result.attempts[0]?.detail).toBeNull();
    expect(prompts[1]?.user).toContain("Ta réponse précédente était illisible : voici la fiche !");
    expect(result.best?.number).toBe(2);
  });

  it("s'arrête sur deux fois la même réponse illisible", async () => {
    const { model } = fakeModel([reply("illisible"), reply("illisible")]);
    const result = await run(model);
    expect(result.stop).toBe("same-unreadable");
    expect(result.best).toBeNull();
  });

  it("s'arrête quand l'IA renvoie deux fois le même JSON fautif", async () => {
    const { model } = fakeModel([reply(lasting(300)), reply(lasting(300))]);
    const result = await run(model);
    expect(result.stop).toBe("no-progress");
    expect(result.calls).toBe(2);
  });

  it("n'accepte pas au 1er essai une étape vide une fois imprimée", async () => {
    const detail = balancedDetail();
    const hidden: Detail = {
      ...detail,
      steps: detail.steps.map((s) => (s.id === "s1" ? { ...s, text: "\u001b\u202e" } : s)),
    };
    const { model, prompts } = fakeModel([
      reply(JSON.stringify(hidden)),
      reply(JSON.stringify(detail)),
    ]);
    const result = await run(model);
    expect(result.attempts[0]?.findings).toContainEqual(
      expect.objectContaining({
        level: "error",
        rule: "phases",
        message: "La phase « s1 » n'a pas de description.",
      }),
    );
    expect(prompts[1]?.user).toContain("La phase « s1 » n'a pas de description.");
    expect(result.stop).toBe("valid");
    expect(result.best?.number).toBe(2);
  });

  it("ne s'arrête pas en `valid` sur un détail qui cite un ingrédient exclu", async () => {
    const tainted: Detail = {
      ...balancedDetail(),
      steps: balancedDetail().steps.map((s) =>
        s.id === "s13" ? { ...s, text: `${s.text}, avec une noix de beurre` } : s,
      ),
    };
    const { model, prompts } = fakeModel([
      reply(JSON.stringify(tainted)),
      reply(JSON.stringify(balancedDetail())),
    ]);
    const result = await run(model, 3, undefined, ["beurre"]);
    expect(result.attempts[0]?.findings).toContainEqual(
      expect.objectContaining({ level: "error", rule: "exclusion" }),
    );
    expect(prompts[0]?.user).toContain("Ingrédients exclus : beurre.");
    expect(prompts[1]?.user).toContain("cite un ingrédient exclu (exclusion : beurre)");
    expect(result.stop).toBe("valid");
    expect(result.best?.number).toBe(2);
  });

  it("s'arrête sur un refus", async () => {
    const { model } = fakeModel([reply("", "refusal")]);
    const result = await run(model);
    expect(result.stop).toBe("refusal");
    expect(result.best).toBeNull();
    expect(result.attempts).toHaveLength(1);
  });

  it("s'arrête sur une réponse coupée par le plafond de jetons", async () => {
    const { model } = fakeModel([reply('{"steps":[', "max_tokens")]);
    const result = await run(model);
    expect(result.stop).toBe("truncated");
    expect(result.best).toBeNull();
  });

  it("accepte un détail valide même marqué coupé", async () => {
    const { model } = fakeModel([reply(lasting(150), "max_tokens")]);
    expect((await run(model)).stop).toBe("valid");
  });

  it("ne rejette pas sur une erreur du modèle, et garde les essais déjà faits", async () => {
    const { model } = fakeModel([reply(lasting(300)), new Error("réseau coupé")]);
    const result = await run(model);
    expect(result.stop).toBe("technical-error");
    expect(result.technicalError).toBe("réseau coupé");
    expect(result.calls).toBe(2);
    expect(result.failedCalls).toBe(1);
    expect(result.best?.number).toBe(1);
  });

  it("ne touche pas au menu reçu, quel que soit le détail", async () => {
    const before = structuredClone(menu);
    const { model } = fakeModel([reply(lasting(300)), reply(cyclic()), reply(lasting(150))]);
    await run(model);
    expect(menu).toEqual(before);
  });

  it("garde un essai payé si le journal lève", async () => {
    const { model } = fakeModel([reply(lasting(150))]);
    const result = await run(model, 3, () => {
      throw new Error("journal cassé");
    });
    expect(result.stop).toBe("valid");
  });
});
