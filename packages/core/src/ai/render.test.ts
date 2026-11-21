import { HOUSEHOLD_EQUIPMENT } from "../equipment/household.ts";
import { describe, expect, it } from "vitest";
import type { Menu } from "../domain/menu.ts";
import { buildIngredientIndex } from "../ingredients/index-lookup.ts";
import { REFERENTIAL } from "../ingredients/referential.ts";
import { checkMenu } from "../rules/check-menu.ts";
import type { CheckContext } from "../rules/context.ts";
import { asReply, asReplyValue, balancedMenu, phase } from "../rules/fixtures/menus.ts";
import { SEASON_TABLE } from "../season/season-table.ts";
import { composeMenu } from "./compose.ts";
import type { Model } from "./model.ts";
import type { Attempt, ComposeInput, ComposeResult, StopCause } from "./compose.ts";
import { balancedDetail, balancedDetailLasting, cyclicDetail } from "../rules/fixtures/detail.ts";
import { batchMenu } from "./batch.ts";
import type { BatchResult } from "./batch.ts";
import { euroText } from "../pricing/cost-text.ts";
import { INSEE_TABLE } from "../pricing/insee-table.ts";
import { RULE_LABELS, renderBatchResult, renderComposeResult, renderCostLines } from "./render.ts";

const input: ComposeInput = {
  request: "x",
  exclusions: [],
  month: 11,
  sessionDay: "sun",
  maxAttempts: 3,
  pinned: [],
  history: [],
};

const menu: Menu = {
  dishes: [
    {
      name: "Bœuf bourguignon",
      day: "mon",
      ingredients: [
        {
          name: "bœuf à braiser",
          qty: 800,
          unit: "g",
          form: "fresh",
          category: null,
          sameDay: false,
        },
        { name: "oignon", qty: 2, unit: "piece", form: "fresh", category: null, sameDay: false },
        { name: "pâtes", qty: 400, unit: "g", form: "dry", category: null, sameDay: true },
      ],
      phases: [],
    },
    {
      name: "Ratatouille",
      day: "tue",
      ingredients: [
        {
          name: "courgette",
          qty: 3,
          unit: "piece",
          form: "frozen",
          category: null,
          sameDay: false,
        },
      ],
      phases: [],
    },
  ],
};

function attempt(over: Partial<Attempt> = {}): Attempt {
  return {
    number: 2,
    reply: {
      text: "",
      stopReason: "end_turn",
      usage: { input: 900, output: 1830, cacheRead: 1100, cacheWrite: 1100 },
    },
    menu,
    check: {
      findings: [],
      keeping: [],
      seasonUnchecked: ["champignon de Paris"],
      toConfirm: [{ name: "romanesco", category: "vegetable" }],
      session: null,
    },
    requested: [],
    note: null,
    ...over,
  };
}

function result(over: Partial<ComposeResult> = {}): ComposeResult {
  const a = attempt();
  return {
    attempts: [a],
    best: a,
    stop: "valid",
    technicalError: null,
    calls: 1,
    failedCalls: 0,
    pinned: [],
    pinnedRemoved: [],
    ...over,
  };
}

describe("renderComposeResult", () => {
  it("rend les plats avec lettres, jours, accompagnements et forme non standard", () => {
    const text = renderComposeResult(result(), input);
    expect(text).toContain("Menu pour novembre, session le dimanche (essai 2 sur 3)");
    expect(text).toContain("a. Bœuf bourguignon (lundi)");
    expect(text).toContain("bœuf à braiser 800 g · oignon 2 pièces");
    expect(text).toContain("Le soir même : pâtes 400 g");
    expect(text).not.toContain("pâtes 400 g (sec)");
    expect(text).toContain("b. Ratatouille (mardi)");
    expect(text).toContain("courgette 3 pièces (surgelé)");
  });

  it("rend la durée de session et le planning", () => {
    const planned = attempt({
      check: {
        findings: [],
        keeping: [],
        seasonUnchecked: [],
        toConfirm: [],
        session: {
          minutes: 135,
          extras: [],
          phases: [
            {
              dish: 0,
              start: 0,
              end: 15,
              phase: phase("a1", 15, "oven", false, [], "Préchauffer"),
            },
            { dish: 1, start: 15, end: 135, phase: phase("b1", 120, "none", true, [], "Couper") },
          ],
        },
      },
    });
    const text = renderComposeResult(result({ attempts: [planned], best: planned }), input);
    expect(text).toContain(
      "Session calculée : 2 h 15 (objectif 2 h à 2 h 30, 3 h au plus) · appareil d'appoint : aucun",
    );
    expect(text).toContain("Planning :");
    expect(text).toContain("   0:00–0:15 · a. Préchauffer · four, tourne seul");
    expect(text).toContain("   0:15–2:15 · b. Couper · à la main");
  });

  it("distingue l'attente du travail à la main", () => {
    const planned = attempt({
      check: {
        findings: [],
        keeping: [],
        seasonUnchecked: [],
        toConfirm: [],
        session: {
          minutes: 30,
          extras: [],
          phases: [
            { dish: 0, start: 0, end: 30, phase: phase("a1", 30, "none", false, [], "Mariner") },
            { dish: 0, start: 0, end: 30, phase: phase("a2", 30, "none", true, [], "Couper") },
          ],
        },
      },
    });
    const text = renderComposeResult(result({ attempts: [planned], best: planned }), input);
    expect(text).toContain("   0:00–0:30 · a. Mariner · attente");
    expect(text).toContain("   0:00–0:30 · a. Couper · à la main");
  });

  it("neutralise les caractères de contrôle venus de l'IA", () => {
    const planned = attempt({
      check: {
        findings: [],
        keeping: [],
        seasonUnchecked: [],
        toConfirm: [],
        session: {
          minutes: 5,
          extras: [],
          phases: [
            {
              dish: 0,
              start: 0,
              end: 5,
              phase: phase(
                "a1",
                5,
                "none",
                true,
                [],
                "Couper\u001b[2J\u001b[H\r\nConstats : aucun",
              ),
            },
          ],
        },
      },
    });
    const text = renderComposeResult(result({ attempts: [planned], best: planned }), input);
    expect(text.includes("\u001b")).toBe(false);
    expect(text.includes("\r")).toBe(false);
    const line = text.split("\n").find((entry) => entry.includes("Couper"));
    expect(line).toContain("Constats : aucun");
  });

  it("nomme l'appareil d'appoint utilisé", () => {
    const planned = attempt({
      check: {
        findings: [],
        keeping: [],
        seasonUnchecked: [],
        toConfirm: [],
        session: { minutes: 20, extras: ["cookeo", "airfryer"], phases: [] },
      },
    });
    const text = renderComposeResult(result({ attempts: [planned], best: planned }), input);
    expect(text).toContain("appareil d'appoint : Cookeo, airfryer");
  });

  it("dit que la durée n'est pas calculée sans planning", () => {
    const text = renderComposeResult(result(), input);
    expect(text).toContain("Session : durée non calculée, phases à corriger (voir les constats).");
    expect(text).not.toContain("Planning :");
  });

  it("rend l'absence de constat, le contrôle partiel et les à confirmer", () => {
    const text = renderComposeResult(result(), input);
    expect(text).toContain("Constats : aucun");
    expect(text).toContain("Contrôle de saison partiel, non vérifiés : champignon de Paris");
    expect(text).toContain("À confirmer (absents du référentiel) : romanesco (légume)");
  });

  it("rend les constats", () => {
    const withFinding = attempt({
      check: {
        findings: [
          {
            level: "error",
            rule: "season",
            dish: 1,
            ingredient: "courgette",
            message: "courgette n'est pas de saison en novembre (saison : mai à octobre).",
          },
          {
            level: "error",
            rule: "menu-shape",
            dish: null,
            ingredient: null,
            message: "Menu vide.",
          },
        ],
        keeping: [],
        seasonUnchecked: [],
        toConfirm: [],
        session: null,
      },
    });
    const text = renderComposeResult(result({ attempts: [withFinding], best: withFinding }), input);
    expect(text).toContain(
      "[error] saison · plat b « Ratatouille » : courgette n'est pas de saison en novembre (saison : mai à octobre).",
    );
    expect(text).toContain("[error] forme · Menu vide.");
  });

  it("calcule le total d'entrée comme la somme des trois compteurs", () => {
    const text = renderComposeResult(result(), input);
    expect(text).toContain("Appels à l'IA : 1 · jetons d'entrée : 3100");
    expect(text).toContain("hors cache 900, lus en cache 1100, écrits en cache 1100");
    expect(text).toContain("jetons de sortie : 1830");
  });

  it("dit la cause d'arrêt", () => {
    const messages: [StopCause, string][] = [
      ["refusal", "L'IA a refusé la demande."],
      ["truncated", "Réponse coupée (plafond de jetons atteint)."],
      ["no-progress", "L'IA a renvoyé le même menu : arrêt."],
      ["same-unreadable", "L'IA a renvoyé deux fois la même réponse illisible : arrêt."],
    ];
    for (const [stop, message] of messages) {
      expect(renderComposeResult(result({ stop }), input)).toContain(message);
    }
    expect(
      renderComposeResult(
        result({ stop: "technical-error", technicalError: "Clé refusée" }),
        input,
      ),
    ).toContain("Erreur technique : Clé refusée");
  });

  it("signale les appels en échec dont la consommation est inconnue", () => {
    const text = renderComposeResult(
      {
        attempts: [],
        best: null,
        stop: "technical-error",
        technicalError: "Clé refusée",
        calls: 1,
        failedCalls: 1,
        pinned: [],
        pinnedRemoved: [],
      },
      input,
    );
    expect(text).toContain("Appels à l'IA : 1 (dont 1 en échec : consommation inconnue)");
  });

  it("dit qu'aucun menu n'est lisible, jetons compris", () => {
    const refused = attempt({ menu: null });
    const text = renderComposeResult(
      {
        attempts: [refused],
        best: null,
        stop: "refusal",
        technicalError: null,
        calls: 1,
        failedCalls: 0,
        pinned: [],
        pinnedRemoved: [],
      },
      input,
    );
    expect(text).toContain("Aucun menu lisible.");
    expect(text).toContain("jetons de sortie : 1830");
  });
});

describe("renderComposeResult : texte complet", () => {
  const request = "un poulet tandoori et un poulet basquaise, 5 dîners";
  const ctx: CheckContext = {
    request,
    exclusions: [],
    month: 11,
    sessionDay: "sun",
    dinners: 5,
    index: buildIngredientIndex(REFERENTIAL),
    seasonTable: SEASON_TABLE,
    equipment: HOUSEHOLD_EQUIPMENT,
  };
  const wanted: ComposeInput = { ...input, request };

  function resultFor(menu: Menu, context: CheckContext): ComposeResult {
    const best = attempt({ menu, check: checkMenu(menu, context) });
    return result({ attempts: [best], best, calls: 1 });
  }

  it("rend le menu fautif : session, durées, À congeler, error avant warning, libellés, forme du poisson", () => {
    const menu = balancedMenu();
    // un cabillaud frais (error), pas de légumes secs (warning), deux soirs de poulet (warning)
    menu.dishes[0]!.ingredients[1]!.form = "fresh";
    menu.dishes[3]!.ingredients = menu.dishes[3]!.ingredients.filter(
      (ingredient) => ingredient.name !== "lentilles corail",
    );
    // deux soirs de poulet, tous deux nommés par la demande (tandoori, basquaise)
    menu.dishes[1]!.name = "Poulet tandoori";
    menu.dishes[2] = {
      name: "Poulet basquaise",
      day: "wed",
      ingredients: [
        {
          name: "cuisse de poulet",
          qty: 600,
          unit: "g",
          form: "fresh",
          category: null,
          sameDay: false,
        },
        { name: "carotte", qty: 600, unit: "g", form: "fresh", category: null, sameDay: false },
      ],
      phases: menu.dishes[2]!.phases,
    };
    expect(renderComposeResult(resultFor(menu, ctx), wanted)).toBe(
      [
        "Menu pour novembre, session le dimanche (essai 2 sur 3)",
        "",
        "a. Cabillaud, fondue de poireaux et riz complet (lundi · se garde 4 j au frigo)",
        "   poireau 600 g",
        "   Le soir même : cabillaud 600 g (frais) · riz complet 300 g",
        "b. Poulet tandoori (mardi · se garde 3 j au frigo)",
        "   cuisse de poulet 600 g · carotte 500 g · oignon 100 g",
        "c. Poulet basquaise (mercredi · se garde 3 j au frigo)",
        "   cuisse de poulet 600 g · carotte 600 g",
        "d. Dal de lentilles corail au potiron (jeudi · se garde 4 j au frigo)",
        "   potiron 600 g",
        "e. Soupe de potiron et navet (vendredi · se garde 4 j au frigo)",
        "   potiron 600 g · navet 400 g",
        "   À congeler : Après refroidissement rapide, congeler dès la fin de la session. La veille au soir, passer au frigo pour décongeler (12 à 24 h). Ne pas recongeler.",
        "",
        "Session calculée : 2 h 15 (objectif 2 h à 2 h 30, 3 h au plus) · appareil d'appoint : aucun",
        "Planning :",
        "   0:00–0:15 · c. Préchauffer le four · four, tourne seul",
        "   0:00–0:15 · c. Couper le bœuf et les carottes · à la main",
        "   0:15–0:35 · b. Éplucher et couper carottes et oignon · à la main",
        "   0:15–2:15 · c. Braiser au four · four, tourne seul",
        "   0:35–0:55 · d. Éplucher et couper le potiron (dal et soupe) · à la main",
        "   0:55–1:05 · b. Saisir le poulet · plaque induction",
        "   0:55–1:20 · d. Cuire le dal · Thermomix TM5, tourne seul",
        "   1:05–1:45 · b. Mijoter · plaque induction, tourne seul",
        "   1:05–1:15 · e. Couper le navet · à la main",
        "   1:15–1:30 · a. Laver et émincer les poireaux · à la main",
        "   1:15–1:45 · e. Cuire la soupe · Kenwood Cooking Chef, tourne seul",
        "   1:30–1:55 · a. Fondue de poireaux · plaque induction, tourne seul",
        "   1:45–1:50 · e. Mixer la soupe · à la main",
        "",
        "Constats :",
        "[error] poisson · plat a « Cabillaud, fondue de poireaux et riz complet » : Le poisson doit être surgelé ou en conserve (reçu : frais) : « cabillaud ».",
        "[warning] légumes secs · Aucun plat de légumes secs : mets-en dans au moins 1 plat.",
        "[warning] même protéine · plat c « Poulet basquaise » : deux soirs de suite avec la même protéine principale (volaille) : « Poulet tandoori » (mardi) et « Poulet basquaise » (mercredi) ; change-en un. Si la demande nomme un de ces plats, garde-le et ajuste les autres.",
        "Appels à l'IA : 1 · jetons d'entrée : 3100 (hors cache 900, lus en cache 1100, écrits en cache 1100) · jetons de sortie : 1830",
        "Coût estimé : au moins 4,61 € · 5 prix inconnus · placard non compris.",
        "Prix inconnus : cabillaud, cuisse de poulet, navet, potiron, riz complet.",
        "Sources : INSEE, prix moyens de vente au détail, Licence Ouverte 2.0.",
      ].join("\n"),
    );
  });

  it("montre la forme surgelée du poisson, même quand elle est celle du référentiel", () => {
    const text = renderComposeResult(
      resultFor(balancedMenu(), { ...ctx, request: "un plat" }),
      input,
    );
    expect(text).toContain("cabillaud 600 g (surgelé)");
    expect(text).toContain("Constats : aucun");
  });

  it("classe les error puis les warning", () => {
    const best = attempt({
      check: {
        findings: [
          { level: "warning", rule: "meat", dish: null, ingredient: null, message: "b" },
          { level: "warning", rule: "pulses", dish: null, ingredient: null, message: "c" },
          { level: "error", rule: "fish", dish: null, ingredient: null, message: "a" },
        ],
        keeping: [],
        seasonUnchecked: [],
        toConfirm: [],
        session: null,
      },
    });
    const lines = renderComposeResult(result({ attempts: [best], best }), input).split("\n");
    const start = lines.indexOf("Constats :");
    expect(lines.slice(start + 1, start + 4)).toEqual([
      "[error] poisson · a",
      "[warning] viande · b",
      "[warning] légumes secs · c",
    ]);
  });
});

describe("de la composition au rendu, sans réseau", () => {
  it("rend la soupe à congeler et le warning des pâtes", async () => {
    const menu = balancedMenu();
    menu.dishes[1] = {
      name: "Pâtes à la bolognaise",
      day: "tue",
      ingredients: [
        { name: "pâtes", qty: 400, unit: "g", form: "dry", category: null, sameDay: false },
        {
          name: "tomate concassée",
          qty: 400,
          unit: "g",
          form: "canned",
          category: null,
          sameDay: false,
        },
        { name: "bœuf haché", qty: 400, unit: "g", form: "fresh", category: null, sameDay: false },
      ],
      phases: menu.dishes[1]!.phases,
    };
    const model: Model = {
      complete: () =>
        Promise.resolve({
          text: asReply(menu),
          stopReason: "end_turn",
          usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 },
        }),
    };
    const composeInput: ComposeInput = { ...input, request: "des pâtes, 5 dîners", maxAttempts: 1 };
    const composed = await composeMenu(composeInput, {
      model,
      refs: REFERENTIAL,
      seasonTable: SEASON_TABLE,
      equipment: HOUSEHOLD_EQUIPMENT,
    });
    const text = renderComposeResult(composed, composeInput);
    const lines = text.split("\n");
    // Bloc de la soupe du vendredi (plat e) : son nom, ses ingrédients, puis « À congeler ».
    const soup = lines.findIndex((line) =>
      line.startsWith("e. Soupe de potiron et navet (vendredi"),
    );
    expect(soup).toBeGreaterThan(-1);
    expect(lines[soup + 2]).toMatch(/^ {3}À congeler : Après refroidissement rapide/);
    expect(lines.filter((line) => line.includes("À congeler"))).toHaveLength(1);
    expect(text).toContain(
      "[warning] réchauffage · plat b « Pâtes à la bolognaise » : les pâtes se cuisent le soir même",
    );
  });
});

describe("renderComposeResult : note et épingles", () => {
  it("affiche la note de l'IA et les plats épinglés", () => {
    const a = attempt({ note: "J'ai remplacé le plat c par un gratin." });
    const text = renderComposeResult(
      result({ best: a, attempts: [a], pinned: ["Bœuf bourguignon", "Soupe"] }),
      input,
    );
    expect(text).toContain("Note de l'IA : J'ai remplacé le plat c par un gratin.");
    expect(text).toContain("Plats épinglés : Bœuf bourguignon, Soupe");
  });

  it("n'ajoute aucune ligne sans note ni épingle", () => {
    for (const note of [null, "", "  ", "\u200b"]) {
      const text = renderComposeResult(result({ best: attempt({ note }) }), input);
      expect(text).not.toContain("Note de l'IA");
      expect(text).not.toContain("Plats épinglés");
    }
  });

  it("passe la note par printable", () => {
    const text = renderComposeResult(result({ best: attempt({ note: "a\nb" }) }), input);
    expect(text).toContain("Note de l'IA : a b");
  });

  it("dit que le menu précédent est gardé quand l'IA a retiré un plat épinglé", () => {
    const text = renderComposeResult(
      result({ best: null, stop: "pinned-removed", pinned: ["Soupe"], pinnedRemoved: ["Soupe"] }),
      input,
    );
    expect(text).toContain("L'IA a retiré un plat épinglé : aucun menu retenu.");
  });
});

describe("renderBatchResult", () => {
  const batchInput: ComposeInput = {
    request: "un bœuf bourguignon, 5 dîners",
    exclusions: [],
    month: 11,
    sessionDay: "sun",
    maxAttempts: 3,
    pinned: [],
    history: [],
  };
  const usage = { input: 100, output: 50, cacheRead: 0, cacheWrite: 0 };
  const replying = (value: unknown): Model => ({
    complete: () => Promise.resolve({ text: JSON.stringify(value), stopReason: "end_turn", usage }),
  });

  function batch(detail: unknown[], composed: Menu = balancedMenu()): Promise<BatchResult> {
    let calls = 0;
    const detailModel: Model = {
      complete: () =>
        replying(detail[Math.min(calls++, detail.length - 1)]).complete({ system: "", user: "" }),
    };
    return batchMenu(batchInput, {
      models: { compose: replying(asReplyValue(composed)), detail: detailModel },
      refs: REFERENTIAL,
      seasonTable: SEASON_TABLE,
      equipment: HOUSEHOLD_EQUIPMENT,
      today: "2026-11-20",
    });
  }

  it("a un libellé pour la règle detail", () => {
    expect(RULE_LABELS.detail).toBe("détail");
  });

  it("ajoute la section détail avec la durée, les constats, les jetons et le total", async () => {
    const text = renderBatchResult(await batch([balancedDetail()]), batchInput);
    expect(text).toContain("Menu pour novembre");
    expect(text).toContain("Détail : essai 1 retenu sur 3 · durée calculée 2 h 15 (3 h au plus)");
    expect(text).toContain("Constats du détail : aucun");
    expect(text).toContain("Appels pour le détail : 1 · jetons d'entrée : 100");
    expect(text).toContain(
      "Total des appels : 2 · jetons d'entrée : 200 (hors cache 200, lus en cache 0, écrits en cache 0) · jetons de sortie : 100",
    );
    expect(text).not.toContain("Fiche de repli");
    expect(text).not.toContain("Session de plus de 3 h");
  });

  it("termine par le coût de la liste de courses et le constat de budget", async () => {
    const withBudget: ComposeInput = { ...batchInput, budget: 1 };
    const result = await batch([balancedDetail()]);
    const text = renderBatchResult(result, withBudget);
    const expected = renderCostLines(result.compose.best!.menu!, 1);
    expect(expected.some((line) => line.startsWith("[warning] budget"))).toBe(true);
    expect(text.split("\n").slice(-expected.length)).toEqual(expected);
    expect(text.split("\n").filter((line) => line.startsWith("Coût estimé"))).toHaveLength(1);
  });

  it("montre les avertissements du détail avec le libellé « détail »", async () => {
    const uncited = balancedDetail();
    uncited.steps = uncited.steps.map((step) =>
      step.id === "s12" ? { ...step, text: "Laver et émincer les poireaux" } : step,
    );
    const text = renderBatchResult(await batch([uncited]), batchInput);
    expect(text).toContain(
      "[warning] détail · plat a « Cabillaud, fondue de poireaux et riz complet » : non cité dans les étapes : poireau (a).",
    );
  });

  it("dit que la session dépasse 3 h quand le PDF sort avec un avertissement", async () => {
    const text = renderBatchResult(await batch([balancedDetailLasting(300)]), batchInput);
    expect(text).toContain("[error] durée de session");
    expect(text).toContain("Session de plus de 3 h : le PDF donne les étapes détaillées");
  });

  it("dit que la fiche est un repli quand le détail reste incohérent", async () => {
    const text = renderBatchResult(await batch([cyclicDetail()]), batchInput);
    expect(text).toContain(
      "Fiche de repli : les étapes détaillées restent incohérentes après 2 appels (enchaînement des étapes). Le PDF donne les grandes phases du menu, avec un avertissement.",
    );
    expect(text).toContain("L'IA a renvoyé la même fiche : arrêt.");
  });

  it("dit la même raison de repli que le PDF : erreur technique au premier appel du détail", async () => {
    const failing: Model = { complete: () => Promise.reject(new Error("réseau coupé")) };
    const result = await batchMenu(batchInput, {
      models: { compose: replying(asReplyValue(balancedMenu())), detail: failing },
      refs: REFERENTIAL,
      seasonTable: SEASON_TABLE,
      equipment: HOUSEHOLD_EQUIPMENT,
      today: "2026-11-20",
    });
    const text = renderBatchResult(result, batchInput);
    expect(text).toContain(
      "Fiche de repli : le service d'IA n'a pas répondu (erreur technique). Le PDF donne les grandes phases du menu",
    );
    expect(text).not.toContain("pas rendu de détail lisible");
    expect(result.fallbackReason).toBe("le service d'IA n'a pas répondu (erreur technique)");
  });

  it("dit que le détail n'est pas demandé quand le menu garde une erreur", async () => {
    const bad = balancedMenu();
    bad.dishes[1]!.ingredients.push({
      name: "courgette",
      qty: 100,
      unit: "g",
      form: "fresh",
      category: null,
      sameDay: false,
    });
    const result = await batchMenu(
      { ...batchInput, exclusions: ["courgette"], maxAttempts: 1 },
      {
        models: { compose: replying(asReplyValue(bad)), detail: replying(balancedDetail()) },
        refs: REFERENTIAL,
        seasonTable: SEASON_TABLE,
        equipment: HOUSEHOLD_EQUIPMENT,
        today: "2026-11-20",
      },
    );
    const text = renderBatchResult(result, batchInput);
    expect(text).toContain("Détail : non demandé, le menu garde des erreurs.");
    expect(text).toContain("Total des appels : 1");
  });
});

describe("renderCostLines", () => {
  const ingredient = (
    name: string,
    qty: number,
    unit: "g" | "ml" | "piece",
  ): Menu["dishes"][number]["ingredients"][number] => ({
    name,
    qty,
    unit,
    form: "fresh",
    category: null,
    sameDay: false,
  });
  const costMenu = (extra: Menu["dishes"][number]["ingredients"]): Menu => ({
    dishes: [
      {
        name: "Plat",
        day: "mon",
        ingredients: [
          ingredient("carotte", 600, "g"),
          ingredient("tomate", 400, "g"),
          ingredient("chou-fleur", 1, "piece"),
          ingredient("huile d'olive", 30, "ml"),
          ...extra,
        ],
        phases: [],
      },
    ],
  });
  const known =
    0.6 * INSEE_TABLE["fresh|carotte"]!.euros +
    0.4 * INSEE_TABLE["fresh|tomate"]!.euros +
    INSEE_TABLE["fresh|chou-fleur"]!.euros;
  const sources = "Sources : INSEE, prix moyens de vente au détail, Licence Ouverte 2.0.";

  it("rend quatre lignes dans l'ordre avec un prix inconnu et un budget dépassé", () => {
    const lines = renderCostLines(costMenu([ingredient("lait", 500, "ml")]), 1);
    expect(lines).toEqual([
      `Coût estimé : au moins ${euroText(known)} · 1 prix inconnu · placard non compris.`,
      "Prix inconnus : lait.",
      sources,
      `[warning] budget · Coût estimé au moins ${euroText(known)} pour un budget de 1,00 € : ${euroText(Math.round(known * 100) / 100 - 1)} de trop (1 prix inconnu, non compté).`,
    ]);
  });
  it("rend deux lignes sans inconnu et sans budget, ou sous le budget", () => {
    const expected = [`Coût estimé : ${euroText(known)} · placard non compris.`, sources];
    expect(renderCostLines(costMenu([]), null)).toEqual(expected);
    expect(renderCostLines(costMenu([]), 100)).toEqual(expected);
  });
  it("ne donne pas de ligne de sources quand aucun prix n'est connu", () => {
    const menu: Menu = {
      dishes: [{ ...costMenu([]).dishes[0]!, ingredients: [ingredient("lait", 500, "ml")] }],
    };
    expect(renderCostLines(menu, null)).toEqual([
      "Coût estimé : inconnu (1 prix inconnu) · placard non compris.",
      "Prix inconnus : lait.",
    ]);
  });
  it("écrit la première ligne avec « · placard non compris. », sans double parenthèse", () => {
    const first = (extra: Menu["dishes"][number]["ingredients"], budget: number | null) =>
      renderCostLines(costMenu(extra), budget)[0];
    expect(first([], null)).toBe(`Coût estimé : ${euroText(known)} · placard non compris.`);
    expect(first([ingredient("lait", 500, "ml"), ingredient("riz", 100, "g")], null)).toBe(
      `Coût estimé : au moins ${euroText(known)} · 2 prix inconnus · placard non compris.`,
    );
  });
  it("donne la forme des prix inconnus quand elle se dit : maïs (conserve), maïs (frais)", () => {
    const menu: Menu = {
      dishes: [
        {
          name: "Plat",
          day: "mon",
          ingredients: [
            { ...ingredient("maïs", 200, "g"), form: "canned" },
            { ...ingredient("maïs", 300, "g"), form: "fresh" },
          ],
          phases: [],
        },
      ],
    };
    expect(renderCostLines(menu, null)[1]).toBe("Prix inconnus : maïs (conserve), maïs (frais).");
  });
  it("renderComposeResult se termine par ces lignes", () => {
    const best = attempt({ menu: costMenu([ingredient("lait", 500, "ml")]) });
    const text = renderComposeResult(result({ attempts: [best], best }), { ...input, budget: 1 });
    const expected = renderCostLines(best.menu!, 1);
    expect(text.split("\n").slice(-expected.length)).toEqual(expected);
  });
  it("n'ajoute rien quand il n'y a pas de menu", () => {
    const text = renderComposeResult(result({ attempts: [], best: null }), input);
    expect(text).not.toContain("Coût estimé");
  });
});
