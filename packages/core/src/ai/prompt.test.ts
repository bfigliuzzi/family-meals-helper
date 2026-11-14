import { describe, expect, it } from "vitest";
import type { Finding } from "../domain/finding.ts";
import type { Menu } from "../domain/menu.ts";
import { HOUSEHOLD_EQUIPMENT, equipmentPromptLines } from "../equipment/household.ts";
import { REFERENTIAL } from "../ingredients/referential.ts";
import { KEEPING_BY_NAME } from "../rules/conservation-table.ts";
import { MONTH_NAMES_FR } from "../season/months.ts";
import { buildSystemPrompt, buildUserPrompt } from "./prompt.ts";

const base = {
  request: "un bœuf bourguignon, 5 dîners",
  exclusions: ["courgette", "poulet"],
  month: 11 as const,
  sessionDay: "sun" as const,
  dinners: 5,
  inSeason: ["potimarron", "poireau"],
};

describe("buildSystemPrompt", () => {
  const system = buildSystemPrompt(REFERENTIAL);
  it("est identique d'un appel à l'autre et sans nom de mois", () => {
    expect(buildSystemPrompt(REFERENTIAL)).toBe(system);
    for (const month of MONTH_NAMES_FR) {
      expect(system.toLowerCase()).not.toMatch(
        new RegExp(`(^|[^\\p{L}])${month}([^\\p{L}]|$)`, "u"),
      );
    }
  });
  it("contient tous les noms du référentiel", () => {
    for (const ref of REFERENTIAL) expect(system).toContain(ref.name);
  });
  it("interdit de citer un ingrédient exclu dans le nom d'un plat ou la description d'une phase", () => {
    expect(system).toContain(
      "Ni le nom d'un plat ni la description d'une phase ne cite un ingrédient exclu, même précédé de « sans ».",
    );
  });
});

describe("buildSystemPrompt : équipement et phases", () => {
  const system = buildSystemPrompt(REFERENTIAL);
  it("contient les lignes d'équipement générées depuis la constante", () => {
    for (const line of equipmentPromptLines(HOUSEHOLD_EQUIPMENT)) expect(system).toContain(line);
    expect(system).toContain("Vise 2 h à 2 h 30");
    expect(system).toContain("au-delà de 3 h");
    expect(system).toContain("Soupe ou velouté : au Thermomix");
    expect(system).toContain(
      "Cookeo comme appareil d'appoint, s'il fait gagner du temps sur une légumineuse ou une viande.",
    );
  });
  it("demande la matière grasse, le bouillon et les épices de la session, avec leur quantité", () => {
    expect(system).toContain(
      "Liste aussi la matière grasse, le bouillon et les épices qui servent pendant la session, avec leur quantité (par exemple huile d'olive 30 ml)",
    );
  });
  it("demande les phases : ligne JSON, appareils, préchauffage commun", () => {
    expect(system).toContain(
      '"phases":[{"id","description","minutes","appliance","attended","after"}]',
    );
    expect(system).toContain(
      "`appliance` : none (à la main, ou attente comme une marinade), oven, induction, thermomix, kenwood, cookeo, steamer, airfryer.",
    );
    expect(system).toContain("Pas plus de 60 phases pour tout le menu.");
    expect(system).toContain("Au plus 60 id.");
    expect(system).toContain("nombre entier de minutes, de 1 à 600");
    expect(system).toContain("« Préchauffer le four »");
    expect(system).toContain("trois casseroles sur la plaque font trois phases");
  });
  it("ne pousse plus à utiliser tous les appareils", () => {
    expect(system).not.toContain("Répartis les modes de cuisson");
    expect(system).toContain("Tu n'as pas à utiliser tous les appareils.");
  });
});

describe("buildSystemPrompt : conservation, équilibre et poisson", () => {
  const system = buildSystemPrompt(REFERENTIAL);
  it("donne les durées au frigo générées depuis les tables", () => {
    expect(system).toContain("1 j : poisson, poisson gras, fruits de mer");
    expect(system).toContain("4 j : légume, fruit");
    expect(system).toContain("champignon de Paris");
    expect(system).toContain("les ingrédients `sameDay` ne comptent pas");
    expect(system).toContain("Range les plats du plus fragile au moins fragile");
  });
  it("génère la liste des ingrédients qui ne limitent pas la durée depuis KEEPING_BY_NAME", () => {
    const unlimited = Object.entries(KEEPING_BY_NAME)
      .filter(([, keeping]) => keeping.fridgeDays === null)
      .map(([name]) => name);
    expect(unlimited.length).toBeGreaterThan(0);
    expect(system).toContain(`Ne limitent pas la durée : ${unlimited.join(", ")}.`);
    expect(system).toContain("Ne limitent pas la durée : matière grasse, herbe ou épice");
    expect(system).not.toContain("Farine, pain et pâtes brisée et feuilletée");
  });
  it("génère l'exception des pâtes d'un gratin, de lasagnes ou de cannelloni dans la phrase de congélation", () => {
    const sentence = system.split("\n").find((line) => line.startsWith("Un plat servi après"));
    expect(sentence).toContain(
      "sauf les pâtes d'un gratin, de lasagnes ou de cannelloni (nom du plat ou de l'ingrédient) : se congèlent mal",
    );
  });
  it("donne les chiffres d'équilibre et de quantité", () => {
    expect(system).toContain("2 000 g sur le menu");
    expect(system).toContain("600 g sur le menu");
    expect(system).toContain("au plus 2 plats de viande rouge ou de porc");
    expect(system).toContain("viande 100 à 200 g");
    expect(system).toContain("légumes 50 à 500 g");
    expect(system).toContain("Donne en g la viande, la volaille, la charcuterie, le poisson");
  });
  it("demande du poisson surgelé ou en conserve, jamais frais, et ne le met plus parmi les plats du jour même", () => {
    expect(system).toContain("Seulement surgelés ou en conserve, jamais frais.");
    expect(system).toContain("en 15 minutes au plus");
    expect(system).not.toContain("poisson frais");
    expect(system).toContain(
      "Le soir même (`sameDay` à true) : pâtes, riz blanc, risotto, œufs cuits seuls, viande grillée, pommes de terre à l'eau ou vapeur, fruits de mer.",
    );
  });
  it("génère l'exception des pâtes du soir même depuis la table, cannelloni compris", () => {
    const line = system.split("\n").find((text) => text.startsWith("Le soir même"));
    expect(line).toContain(
      "Seule exception : des pâtes se préparent pendant la session quand le nom du plat ou de l'ingrédient contient gratin, lasagne ou cannelloni.",
    );
  });
  it("fait passer la demande explicite avant les règles souples", () => {
    expect(system).toContain(
      "Une demande explicite l'emporte sur les règles souples : un plat que la demande nomme reste au menu, sous son nom, même s'il dépasse un plafond ; ajuste les autres plats. Les règles bloquantes s'appliquent toujours.",
    );
  });
  it("ne dépend pas du jour de session", () => {
    expect(system).not.toContain("Session de cuisine");
  });
});

describe("buildUserPrompt", () => {
  it("donne la demande, le mois, les dîners, la saison et les exclusions", () => {
    const user = buildUserPrompt(base);
    expect(user).toContain("un bœuf bourguignon, 5 dîners");
    expect(user).toContain("Nombre de dîners : 5");
    expect(user).toContain("Mois : novembre");
    expect(user).toContain("potimarron, poireau");
    expect(user).toContain("courgette, poulet");
    expect(user).not.toContain("Constats");
  });
  it("donne le jour de session et les jours écoulés au dîner", () => {
    expect(buildUserPrompt(base)).toContain(
      "Session de cuisine : dimanche. Jours écoulés au dîner : lundi 1, mardi 2, mercredi 3, jeudi 4, vendredi 5.",
    );
    expect(buildUserPrompt({ ...base, sessionDay: "sat" })).toContain(
      "Session de cuisine : samedi. Jours écoulés au dîner : lundi 2, mardi 3, mercredi 4, jeudi 5, vendredi 6.",
    );
  });
  it("écrit « aucun » sans exclusion", () => {
    expect(buildUserPrompt({ ...base, exclusions: [] })).toContain("Ingrédients exclus : aucun");
  });
  it("renvoie le menu précédent et chaque constat dans une correction", () => {
    const menu: Menu = {
      dishes: [{ name: "Gratin", day: "mon", ingredients: [], phases: [] }],
    };
    const findings: Finding[] = [
      {
        level: "error",
        rule: "season",
        dish: 0,
        ingredient: "tomate",
        message: "tomate n'est pas de saison en novembre (saison : juin à septembre).",
      },
      {
        level: "error",
        rule: "menu-shape",
        dish: null,
        ingredient: null,
        message: "Il manque des plats.",
      },
    ];
    const user = buildUserPrompt({ ...base, previous: { menu, rawText: "", findings } });
    expect(user).toContain(JSON.stringify(menu));
    expect(user).toContain(
      "- [error] [season] plat a « Gratin » : tomate n'est pas de saison en novembre (saison : juin à septembre).",
    );
    expect(user).toContain("- [error] [menu-shape] Il manque des plats.");
    expect(user).toContain(
      "Corrige tous les [error]. Pour chaque [warning], corrige si tu le peux sans créer d'[error] et sans retirer un plat que la demande nomme.",
    );
    expect(user).toContain("Renvoie le menu complet corrigé ; ne change que ce qu'il faut.");
  });
  it("cite le texte brut tronqué quand la réponse précédente était illisible", () => {
    const user = buildUserPrompt({
      ...base,
      previous: {
        menu: null,
        rawText: "x".repeat(3000),
        findings: [
          {
            level: "error",
            rule: "invalid-reply",
            dish: null,
            ingredient: null,
            message: "pas du JSON",
          },
        ],
      },
    });
    expect(user).toContain("illisible");
    expect(user).toContain("x".repeat(2000));
    expect(user).not.toContain("x".repeat(2001));
    expect(user).toContain("pas du JSON");
  });
});
