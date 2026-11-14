import { describe, expect, it } from "vitest";
import { buildIngredientIndex } from "../ingredients/index-lookup.ts";
import { REFERENTIAL } from "../ingredients/referential.ts";
import { autumnCyclicDetail, autumnDetail, autumnDetailLasting } from "../rules/fixtures/detail.ts";
import { autumnMenu } from "../rules/fixtures/menus.ts";
import { SEASON_TABLE } from "../season/season-table.ts";
import { buildSheetDocument } from "../pdf/sheet.ts";
import { batchExitCode, batchMenu } from "./batch.ts";
import { renderBatchResult } from "./render.ts";
import type { BatchResult } from "./batch.ts";
import type { ComposeInput } from "./compose.ts";
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

const input: ComposeInput = {
  request: "un bœuf bourguignon, 5 dîners",
  exclusions: ["courgette"],
  month: 11,
  sessionDay: "sun",
  maxAttempts: 3,
};

const menuReply = (): ModelReply => reply(JSON.stringify(autumnMenu()));
const detailReply = (total?: number): ModelReply =>
  reply(JSON.stringify(total === undefined ? autumnDetail() : autumnDetailLasting(total)));

function run(compose: (ModelReply | Error)[], detail: (ModelReply | Error)[]) {
  const composeFake = fakeModel(compose);
  const detailFake = fakeModel(detail);
  const stages: string[] = [];
  const result = batchMenu(input, {
    models: { compose: composeFake.model, detail: detailFake.model },
    refs: REFERENTIAL,
    seasonTable: SEASON_TABLE,
    onAttempt: (stage, number) => stages.push(`${stage}${number}`),
  });
  return { result, composeFake, detailFake, stages };
}

// Toutes les chaînes de la définition de la fiche.
function allText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(allText).join("\n");
  if (value !== null && typeof value === "object")
    return Object.values(value).map(allText).join("\n");
  return "";
}

function textOf(result: BatchResult): string {
  expect(result.sheet).not.toBeNull();
  return allText(result.sheet!.content);
}

describe("batchMenu : de bout en bout", () => {
  it("donne la fiche avec les étapes détaillées et le code 0", async () => {
    const {
      result: pending,
      composeFake,
      detailFake,
      stages,
    } = run([menuReply()], [detailReply()]);
    const result = await pending;
    expect(result.stoppedBecause).toBeNull();
    expect(result.fallback).toBeNull();
    expect(result.sheet).not.toBeNull();
    expect(batchExitCode(result)).toBe(0);
    expect(composeFake.prompts).toHaveLength(1);
    expect(detailFake.prompts).toHaveLength(1);
    expect(stages).toEqual(["compose1", "detail1"]);
    const text = textOf(result);
    expect(text).toContain("1. Lancer les cuissons longues");
    expect(text).toContain("600 g de poireau");
    expect(text).not.toContain("Attention");
  });

  it("garde le menu composé tel quel, quel que soit le détail", async () => {
    const result = await run([menuReply()], [detailReply(300), detailReply(250), detailReply(200)])
      .result;
    expect(result.compose.best?.menu).toEqual(autumnMenu());
    expect(textOf(result)).toContain("Cabillaud, fondue de poireaux et riz complet");
  });

  it("donne la fiche avec un encadré et le code 1 quand le détail reste au-dessus de 3 h", async () => {
    const { result: pending } = run(
      [menuReply()],
      [detailReply(300), detailReply(250), detailReply(200)],
    );
    const result = await pending;
    expect(result.fallback).toBeNull();
    expect(result.detail?.stop).toBe("max-attempts");
    expect(batchExitCode(result)).toBe(1);
    const text = textOf(result);
    expect(text).toContain("Attention : la session calculée dure 3 h 20, au-delà de 3 h.");
    expect(text).toContain("1. Lancer les cuissons longues");
  });

  it("se replie sur les grandes phases quand le détail reste cyclique", async () => {
    const cyclic = reply(JSON.stringify(autumnCyclicDetail()));
    const other = reply(JSON.stringify({ ...autumnCyclicDetail(), evenings: [] }));
    const third = reply(
      JSON.stringify({ ...autumnCyclicDetail(), evenings: [{ dish: "a", text: "x" }] }),
    );
    const result = await run([menuReply()], [cyclic, other, third]).result;
    expect(result.fallback).toBe("detail-errors");
    expect(batchExitCode(result)).toBe(1);
    const text = textOf(result);
    expect(text).toContain("Grandes phases de la session (détail non validé)");
    // La raison est celle du terminal, sans parenthèses autour : pas de parenthèses imbriquées.
    expect(result.fallbackReason).toBe(
      "les étapes détaillées restent incohérentes après 3 appels (enchaînement des étapes)",
    );
    expect(text).toContain(
      `le détail des étapes n'a pas pu être validé : ${result.fallbackReason}. Cette fiche`,
    );
    expect(text).not.toContain("phases, ");
    expect(text).not.toContain("Lancer les cuissons longues");
  });

  it.each([
    [
      "illisible trois fois",
      [reply("a"), reply("b"), reply("c")],
      "n'a pas rendu de détail lisible",
    ],
    ["erreur technique", [new Error("réseau coupé")], "erreur technique"],
    ["refus", [reply("", "refusal")], "a refusé de rédiger le détail"],
    ["réponse coupée", [reply('{"steps":[', "max_tokens")], "la réponse de l'IA a été coupée"],
  ] as const)(
    "se replie sur les grandes phases quand le détail est %s",
    async (_, script, reason) => {
      const result = await run([menuReply()], [...script]).result;
      expect(result.fallback).toBe("no-detail");
      expect(batchExitCode(result)).toBe(1);
      const text = textOf(result);
      expect(text).toContain(reason);
      expect(text).toContain("Grandes phases de la session (détail non validé)");
      expect(text).not.toContain("Casserole à feu doux");
    },
  );

  it("dit « erreur technique » au premier appel du détail, avec le code 1", async () => {
    const result = await run([menuReply()], [new Error("réseau coupé")]).result;
    expect(result.detail?.calls).toBe(1);
    expect(result.fallback).toBe("no-detail");
    expect(textOf(result)).toContain("le service d'IA n'a pas répondu (erreur technique)");
    expect(batchExitCode(result)).toBe(1);
  });

  it("se replie en detail-errors avec « après 2 appels » quand le 2e appel du détail échoue", async () => {
    const result = await run(
      [menuReply()],
      [reply(JSON.stringify(autumnCyclicDetail())), new Error("réseau coupé")],
    ).result;
    expect(result.detail?.stop).toBe("technical-error");
    expect(result.detail?.calls).toBe(2);
    expect(result.fallback).toBe("detail-errors");
    const text = textOf(result);
    expect(text).toContain(
      "les étapes détaillées restent incohérentes après 2 appels (enchaînement des étapes)",
    );
    expect(batchExitCode(result)).toBe(1);
  });
});

describe("batchMenu : pas de PDF", () => {
  it("ne demande pas de détail quand le menu garde une erreur", async () => {
    const bad = autumnMenu();
    bad.dishes[1]!.ingredients.push({
      name: "courgette",
      qty: 200,
      unit: "g",
      form: "fresh",
      category: null,
      sameDay: false,
    });
    const badReply = reply(JSON.stringify(bad));
    const { result: pending, detailFake } = run([badReply, badReply, badReply], [detailReply()]);
    const result = await pending;
    expect(detailFake.prompts).toHaveLength(0);
    expect(result.stoppedBecause).toBe("menu-errors");
    expect(result.detail).toBeNull();
    expect(result.sheet).toBeNull();
    expect(batchExitCode(result)).toBe(2);
  });

  it("s'arrête sans fiche, code 2, quand un nom de plat reste invisible une fois imprimé", async () => {
    const hidden = autumnMenu();
    hidden.dishes[1]!.name = "\u200b";
    const hiddenReply = reply(JSON.stringify(hidden));
    const { result: pending, detailFake } = run(
      [hiddenReply, hiddenReply, hiddenReply],
      [detailReply()],
    );
    const result = await pending;
    expect(result.compose.best?.check.findings).toContainEqual(
      expect.objectContaining({ level: "error", message: "Le plat n'a pas de nom." }),
    );
    expect(detailFake.prompts).toHaveLength(0);
    expect(result.stoppedBecause).toBe("menu-errors");
    expect(result.sheet).toBeNull();
    expect(batchExitCode(result)).toBe(2);
  });

  it("se replie (code 1) quand les détails citent toujours un ingrédient exclu, sans imprimer le texte fautif (sonde du substitut)", async () => {
    const tainted = autumnDetail();
    tainted.steps = tainted.steps.map((step) =>
      step.id === "s13"
        ? { ...step, text: `${step.text} Finir avec une noix de beurre et du parmesan.` }
        : step,
    );
    tainted.evenings = tainted.evenings.map((line) =>
      line.dish === "e"
        ? { ...line, text: "Réchauffer, servir avec des noix de cajou grillées et de la crème." }
        : line,
    );
    const taintedReply = reply(JSON.stringify(tainted));
    const composeFake = fakeModel([menuReply()]);
    const detailFake = fakeModel([taintedReply, taintedReply, taintedReply]);
    const exclusions = ["beurre", "fromage", "noix de cajou", "crème"];
    const result = await batchMenu(
      { ...input, exclusions },
      {
        models: { compose: composeFake.model, detail: detailFake.model },
        refs: REFERENTIAL,
        seasonTable: SEASON_TABLE,
      },
    );
    // Les exclusions sont données au prompt du détail.
    expect(detailFake.prompts[0]?.user).toContain(
      "Ingrédients exclus : beurre, fromage, noix de cajou, crème.",
    );
    const errors = result.detail?.best?.findings.filter((finding) => finding.level === "error");
    expect(
      errors?.map(
        (finding) =>
          /^(L'étape « \w+ »|La ligne du soir du plat « \w »)/.exec(finding.message)?.[0],
      ),
    ).toEqual([
      "L'étape « s13 »",
      "L'étape « s13 »",
      "La ligne du soir du plat « e »",
      "La ligne du soir du plat « e »",
    ]);
    expect(errors?.every((finding) => finding.message.includes("cite un ingrédient exclu"))).toBe(
      true,
    );
    expect(errors?.every((finding) => finding.rule === "exclusion")).toBe(true);
    expect(result.fallback).toBe("detail-errors");
    expect(batchExitCode(result)).toBe(1);
    // La raison du repli dit « ingrédient exclu », la même au terminal et sur la fiche.
    expect(result.fallbackReason).toBe(
      // Deux réponses identiques : arrêt « même fiche » au 2e appel.
      "les étapes détaillées restent incohérentes après 2 appels (ingrédient exclu)",
    );
    expect(renderBatchResult(result, { ...input, exclusions })).toContain(
      `Fiche de repli : ${result.fallbackReason}.`,
    );
    const text = textOf(result);
    expect(text).toContain(`n'a pas pu être validé : ${result.fallbackReason}.`);
    expect(text).not.toContain("noix de beurre");
    expect(text).not.toContain("noix de cajou grillées");
  });

  it("s'arrête sur une erreur technique de la composition", async () => {
    const { result: pending, detailFake } = run([new Error("réseau coupé")], [detailReply()]);
    const result = await pending;
    expect(detailFake.prompts).toHaveLength(0);
    expect(result.stoppedBecause).toBe("no-menu");
    expect(result.sheet).toBeNull();
    expect(result.compose.technicalError).toBe("réseau coupé");
    expect(batchExitCode(result)).toBe(2);
  });
});

describe("batchMenu : le même index", () => {
  it("contrôle le détail et dresse la fiche avec l'index construit depuis les refs injectées", async () => {
    // Un référentiel où « poireau » est un ingrédient de placard : il n'a plus à être cité dans les étapes,
    // et la fiche le range dans la section placard. Avec l'index par défaut, ce n'est pas le cas.
    const refs = REFERENTIAL.map((ref) =>
      ref.name === "poireau" ? { ...ref, pantry: true } : ref,
    );
    const uncited = autumnDetail();
    uncited.steps = uncited.steps.map((step) =>
      step.id === "s8"
        ? { ...step, text: "Fendre les poireaux en deux, laver, émincer finement." }
        : step,
    );
    const composeFake = fakeModel([menuReply()]);
    const detailFake = fakeModel([reply(JSON.stringify(uncited))]);
    const result = await batchMenu(input, {
      models: { compose: composeFake.model, detail: detailFake.model },
      refs,
      seasonTable: SEASON_TABLE,
    });
    expect(result.detail?.best?.findings).toEqual([]);
    expect(result.detail?.stop).toBe("valid");
    const text = textOf(result);
    expect(text).toContain("Placard");
    expect(text).toContain(
      "3 g de cumin (d) · 100 ml d'huile d'olive (a, b, c, d) · 600 g de poireau (a)",
    );
    expect(text).not.toContain("non cité");
    // Même fiche, reconstruite à la main avec le même index : mêmes chaînes.
    const best = result.compose.best!;
    const rebuilt = buildSheetDocument({
      sessionDay: input.sessionDay,
      menu: best.menu!,
      keeping: best.check.keeping,
      steps: {
        kind: "detail",
        detail: result.detail!.best!.detail!,
        plan: result.detail!.best!.plan!,
        findings: result.detail!.best!.findings,
      },
      index: buildIngredientIndex(refs),
    });
    expect(allText(rebuilt.content)).toBe(text);
  });
});
