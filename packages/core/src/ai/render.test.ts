import { describe, expect, it } from "vitest";
import type { Menu } from "../domain/menu.ts";
import { buildIngredientIndex } from "../ingredients/index-lookup.ts";
import { REFERENTIAL } from "../ingredients/referential.ts";
import { checkMenu } from "../rules/check-menu.ts";
import type { CheckContext } from "../rules/context.ts";
import { balancedMenu, phase } from "../rules/fixtures/menus.ts";
import { SEASON_TABLE } from "../season/season-table.ts";
import { composeMenu } from "./compose.ts";
import type { MenuModel } from "./model.ts";
import type { Attempt, ComposeInput, ComposeResult, StopCause } from "./compose.ts";
import { renderComposeResult } from "./render.ts";

const input: ComposeInput = {
  request: "x",
  exclusions: [],
  month: 11,
  sessionDay: "sun",
  maxAttempts: 3,
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
    const model: MenuModel = {
      complete: () =>
        Promise.resolve({
          text: JSON.stringify(menu),
          stopReason: "end_turn",
          usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 },
        }),
    };
    const composeInput: ComposeInput = { ...input, request: "des pâtes, 5 dîners", maxAttempts: 1 };
    const composed = await composeMenu(composeInput, {
      model,
      refs: REFERENTIAL,
      seasonTable: SEASON_TABLE,
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
