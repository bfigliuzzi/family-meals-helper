import { describe, expect, it } from "vitest";
import type { Menu } from "../domain/menu.ts";
import type { Attempt, ComposeInput, ComposeResult, StopCause } from "./compose.ts";
import { renderComposeResult } from "./render.ts";

const input: ComposeInput = { request: "x", exclusions: [], month: 11, maxAttempts: 3 };

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
      seasonUnchecked: ["champignon de Paris"],
      toConfirm: [{ name: "romanesco", category: "vegetable" }],
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
    expect(text).toContain("Menu pour novembre (essai 2 sur 3)");
    expect(text).toContain("a. Bœuf bourguignon (lundi)");
    expect(text).toContain("bœuf à braiser 800 g · oignon 2 pièces");
    expect(text).toContain("Le soir même : pâtes 400 g");
    expect(text).not.toContain("pâtes 400 g (sec)");
    expect(text).toContain("b. Ratatouille (mardi)");
    expect(text).toContain("courgette 3 pièces (surgelé)");
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
        seasonUnchecked: [],
        toConfirm: [],
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
