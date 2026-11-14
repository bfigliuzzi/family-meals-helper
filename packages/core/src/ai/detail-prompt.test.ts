import { describe, expect, it } from "vitest";
import type { Finding } from "../domain/finding.ts";
import { dishLetter } from "../domain/menu.ts";
import {
  HOUSEHOLD_EQUIPMENT,
  applianceChoiceLines,
  equipmentCapacityLines,
} from "../equipment/household.ts";
import { balancedDetail } from "../rules/fixtures/detail.ts";
import { balancedMenu } from "../rules/fixtures/menus.ts";
import { buildDetailSystemPrompt, buildDetailUserPrompt } from "./detail-prompt.ts";

describe("buildDetailSystemPrompt", () => {
  const system = buildDetailSystemPrompt(HOUSEHOLD_EQUIPMENT);
  it("donne la forme JSON, avec `phase` et sans `uses`, et les lignes de capacité", () => {
    expect(system).toContain(
      '{"steps":[{"id","phase","dishes","text","minutes","appliance","attended","after"}]',
    );
    expect(system).not.toContain('"uses"');
    expect(system).toContain('"evenings":[{"dish","text"}]');
    for (const line of equipmentCapacityLines(HOUSEHOLD_EQUIPMENT)) expect(system).toContain(line);
  });
  it("demande 3 à 6 phases, 20 étapes au plus, et des étapes qui disent comment faire", () => {
    expect(system).toContain("3 à 6 phases et 20 étapes au plus");
    expect(system).toContain("45 mots au plus");
    expect(system).toContain("la découpe et sa taille");
    expect(system).toContain("le feu (vif, moyen, doux)");
    expect(system).toContain("la matière grasse");
    expect(system).not.toContain("sinon « un peu d'huile »");
    expect(system).toContain("sinon « un peu de matière grasse » qui n'est pas exclue");
    expect(system).toContain("donne des `after` exacts");
  });
  it("demande les repères {a.1} et les tas {d.1/e.1}, et aucune quantité en toutes lettres", () => {
    expect(system).toContain("{a.1}");
    expect(system).toContain("{d.1/e.1}");
    expect(system).toContain("Aucune quantité d'un ingrédient du menu en toutes lettres");
    expect(system).toContain("ce qu'il faut garder");
    expect(system).toContain("ni conservation, ni refroidissement final");
  });
  it("ne donne qu'un plafond d'étapes, 20, sans le plafond technique de 60", () => {
    expect(system).toContain("20 étapes au plus");
    expect(system).not.toMatch(/\b60\b/);
  });
  it("demande des titres de phase chronologiques, pas par type d'action", () => {
    for (const title of [
      "« Lancer les cuissons longues »",
      "« Découpes pendant la cuisson »",
      "« Plats en sauce »",
      "« Finitions et mixages »",
    ]) {
      expect(system).toContain(title);
    }
    expect(system).toContain(
      "Ne nomme pas les phases par type d'action (« Découpes », « Cuissons ») : les étapes d'une phase se suivent dans le temps.",
    );
  });
  it("fait déclarer dans `after` la reprise d'une préparation mise de côté, sans numéro d'étape dans le texte", () => {
    expect(system).not.toContain("réserver au frais");
    expect(system).toContain(
      "Une étape qui reprend une préparation mise de côté (sauce, garniture, légumes cuits réservés) met aussi dans `after` l'`id` de l'étape qui l'a faite",
    );
    expect(system).toContain("N'écris jamais de numéro ni d'`id` d'étape dans le texte");
    // La règle « ni conservation… le code les ajoute » reste, et rien ne la contredit plus.
    expect(system).toContain("ni conservation, ni refroidissement final");
  });
  it("reprend les règles de choix des appareils", () => {
    const choices = applianceChoiceLines(HOUSEHOLD_EQUIPMENT);
    expect(choices.length).toBeGreaterThan(0);
    for (const line of choices) expect(system).toContain(line);
  });
  it("dit quoi faire d'un ingrédient du soir surgelé, sans répéter ce que le code ajoute", () => {
    expect(system).toContain(
      "Pour un ingrédient du soir surgelé, dis s'il se cuit sans décongeler",
    );
    expect(system).toContain("la décongélation des plats congelés après la session");
  });
  it("utilise l'équipement reçu, pas une constante", () => {
    const withoutOven = HOUSEHOLD_EQUIPMENT.filter((spec) => spec.id !== "oven");
    expect(buildDetailSystemPrompt(withoutOven)).not.toContain("four 2");
    expect(system).toContain("four 2");
  });
  it("ne reprend ni « le menu est refusé » ni « remplace »", () => {
    expect(system).not.toContain("le menu est refusé");
    expect(system).not.toContain("remplace");
  });
  it("dit de viser 2 h à 2 h 30 sans changer les plats, et de ne pas répéter les ingrédients du soir", () => {
    expect(system).toContain("Vise 2 h à 2 h 30, 3 h au plus, sans changer les plats");
    expect(system).toContain("ne les répète pas");
    expect(system).toContain('Dans les constats, le mot "phase" désigne une de tes étapes.');
    expect(system).not.toContain("ce sont tes étapes");
  });
});

describe("buildDetailUserPrompt", () => {
  const menu = balancedMenu();
  const user = buildDetailUserPrompt({
    menu,
    sessionDay: "sun",
    composedMinutes: 135,
    exclusions: [],
  });
  it("donne chaque plat avec sa lettre, son jour, ses références et ses quantités", () => {
    for (const [i, dish] of menu.dishes.entries()) {
      expect(user).toContain(`${dishLetter(i)}. ${dish.name}`);
    }
    expect(user).toContain(
      "a. Cabillaud, fondue de poireaux et riz complet (lundi) — a.1 poireau 600 g",
    );
    expect(user).toContain("a.2 cabillaud 600 g (surgelé, le soir)");
    expect(user).toContain("a.3 riz complet 300 g (sec, le soir)");
    expect(user).toContain("d.1 lentilles corail 250 g (sec)");
    expect(user).toContain("Session de cuisine : dimanche.");
  });
  it("reprend les grandes phases de la composition comme base de durée", () => {
    expect(user).toContain("a1 Laver et émincer les poireaux, 15 min, à la main");
    expect(user).toContain("c3 Braiser au four, 120 min, four");
  });
  it("marque un plat entièrement du soir sans étape", () => {
    const evening = {
      dishes: menu.dishes.map((dish, i) =>
        i === 4
          ? {
              ...dish,
              phases: [],
              ingredients: dish.ingredients.map((ing) => ({ ...ing, sameDay: true })),
            }
          : dish,
      ),
    };
    const text = buildDetailUserPrompt({
      menu: evening,
      sessionDay: "sun",
      composedMinutes: 135,
      exclusions: [],
    });
    expect(text).toContain("plat du soir, aucune étape");
    expect(text).toContain("e.1 potiron 600 g (le soir)");
  });
  it("décrit chaque phase avec sa présence, ses dépendances, et la durée calculée du planning", () => {
    expect(user).toContain(
      "a2 Fondue de poireaux, 25 min, plaque induction, tourne seul, après a1",
    );
    expect(user).toContain("b2 Saisir le poulet, 10 min, plaque induction, après b1");
    expect(user).toContain(
      "e2 Cuire la soupe, 30 min, Kenwood Cooking Chef, tourne seul, après d1 e1",
    );
    expect(user).toContain(
      "Durée calculée du planning de ces phases : 2 h 15. Tes étapes détaillées doivent rester proches de cette durée.",
    );
  });
  it("donne les exclusions, ou « aucun »", () => {
    expect(user).toContain("Ingrédients exclus : aucun.");
    const excluded = buildDetailUserPrompt({
      menu,
      sessionDay: "sun",
      composedMinutes: 135,
      exclusions: ["beurre", " fromage "],
    });
    expect(excluded).toContain(
      "Ingrédients exclus : beurre, fromage. N'en ajoute jamais, ni en matière grasse, ni en garniture, ni le soir, et ne les nomme pas, même pour dire de ne pas en mettre.",
    );
  });
  it("n'a pas de section de correction sans réponse précédente", () => {
    expect(user).not.toContain("Constats à corriger");
  });
  it("ajoute la fiche précédente et les constats pour une correction", () => {
    const finding: Finding = {
      level: "error",
      rule: "session-length",
      dish: null,
      ingredient: null,
      message: "La session calculée dure 3 h 20.",
    };
    const detail = balancedDetail();
    const text = buildDetailUserPrompt({
      menu,
      sessionDay: "sun",
      composedMinutes: 135,
      exclusions: [],
      previous: { detail, rawText: "ignoré", findings: [finding] },
    });
    expect(text).toContain(`Ta fiche précédente : ${JSON.stringify(detail)}`);
    expect(text).toContain("Constats à corriger :");
    expect(text).toContain("- [error] [session-length] La session calculée dure 3 h 20.");
    expect(text).toContain(
      "Corrige tous les [error] sans changer les plats ; renvoie la fiche complète.",
    );
  });
  it("coupe à 2000 caractères une réponse précédente illisible", () => {
    const text = buildDetailUserPrompt({
      menu,
      sessionDay: "sun",
      composedMinutes: 135,
      exclusions: [],
      previous: { detail: null, rawText: "x".repeat(5000), findings: [] },
    });
    expect(text).toContain(`illisible : ${"x".repeat(2000)}\n`);
    expect(text).not.toContain("x".repeat(2001));
  });
});
