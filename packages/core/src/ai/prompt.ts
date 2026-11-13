import { CATEGORIES } from "../domain/ingredient.ts";
import type { IngredientRef } from "../domain/ingredient.ts";
import type { Finding } from "../domain/finding.ts";
import { dishLetter } from "../domain/menu.ts";
import type { Menu } from "../domain/menu.ts";
import { monthName } from "../season/months.ts";
import type { Month } from "../season/months.ts";

// Règles tirées de docs/research/cuisine-addict-regles.md (§1.3 à §1.7, §2) et de la conception (§3.1, §6.1).
export const COMPOSITION_RULES_FR = [
  "Tu composes des menus de batch cooking pour une famille française.",
  "Foyer : 4 portions adultes pleines par plat, dîners du lundi au vendredi, un plat par jour.",
  "Choisis 1 ou 2 fruits ou légumes de saison comme ingrédients phares, partagés entre plusieurs plats.",
  "Utilise les mêmes préparations dans plusieurs plats (sauce, légumes coupés, purée) pour gagner du temps.",
  "Au plus un plat à cuisson longue dans la semaine.",
  "Répartis les modes de cuisson : four, plaque, Thermomix, Kenwood. Évite trois plats au four.",
  "Les plats doivent se réchauffer sans dommage : mijotés, gratins, soupes, plats en sauce.",
  "Ne prépare pas d'avance : pâtes, riz blanc, risotto, œufs cuits seuls, viande grillée, poisson frais.",
  "Si un de ces aliments figure au menu, marque-le comme accompagnement du soir même (`sameDay` à true), ou évite-le.",
  "Fromage râpé et crème s'ajoutent le jour même : ne les compte pas comme préparés d'avance.",
  "Place les plats fragiles (viande, poisson, œufs, crème) en début de semaine.",
  "Place les plats de légumes seuls en fin de semaine : ils se gardent le mieux.",
  "Le poisson frais est rare : préfère thon ou sardine en conserve, ou poisson surgelé ajouté au dernier moment.",
  "Utilise des produits courants de supermarché.",
  "Pas de friture, sauf si la demande en parle.",
  "Respecte les exclusions à la lettre, y compris dans les accompagnements.",
  "Reste dans la liste des fruits et légumes de saison donnée dans la demande, sauf si la demande nomme l'ingrédient.",
].join("\n");

export function buildSystemPrompt(refs: readonly IngredientRef[]): string {
  const names = refs.map((ref) => ref.name).sort();
  const instructions = [
    'Réponds uniquement par un objet JSON {"dishes":[{"name","day","ingredients":[{"name","qty","unit","form","category","sameDay"}]}]}, sans texte autour.',
    "`day` : mon, tue, wed, thu, fri, un jour différent par plat.",
    "`unit` : g, ml, piece.",
    "`form` : fresh, canned, frozen, dry.",
    `Emploie exactement un nom de la liste ci-dessous et mets \`category\` à null ; sinon donne \`category\` parmi : ${CATEGORIES.join(", ")}.`,
    "Les accompagnements préparés le soir même sont des ingrédients du plat avec `sameDay` à true ; tous les autres ont `sameDay` à false.",
    "Quantités pour 4 portions adultes.",
    "Le nom d'un plat ne cite jamais un ingrédient exclu, même précédé de « sans ».",
  ].join("\n");
  return [
    COMPOSITION_RULES_FR,
    "",
    instructions,
    "",
    `Ingrédients connus : ${names.join(", ")}.`,
  ].join("\n");
}

function findingLine(finding: Finding, menu: Menu | null): string {
  const dish = finding.dish === null ? undefined : menu?.dishes[finding.dish];
  if (finding.dish === null || dish === undefined) {
    return `- [${finding.rule}] ${finding.message}`;
  }
  return `- [${finding.rule}] plat ${dishLetter(finding.dish)} « ${dish.name} » : ${finding.message}`;
}

export function buildUserPrompt(input: {
  request: string;
  exclusions: readonly string[];
  month: Month;
  dinners: number;
  inSeason: readonly string[];
  previous?: { menu: Menu | null; rawText: string; findings: readonly Finding[] };
}): string {
  const lines = [
    `Demande : ${input.request}`,
    `Nombre de dîners : ${input.dinners}`,
    `Mois : ${monthName(input.month)}`,
    `De saison ce mois-ci (fruits et légumes frais) : ${input.inSeason.join(", ")}`,
    `Ingrédients exclus : ${input.exclusions.length === 0 ? "aucun" : input.exclusions.join(", ")}`,
  ];
  const { previous } = input;
  if (previous !== undefined) {
    lines.push(
      "",
      previous.menu === null
        ? `Ta réponse précédente était illisible : ${previous.rawText.slice(0, 2000)}`
        : `Ton menu précédent : ${JSON.stringify(previous.menu)}`,
      "Constats à corriger :",
      ...previous.findings.map((finding) => findingLine(finding, previous.menu)),
      "Renvoie le menu complet corrigé ; ne change que ce qu'il faut.",
    );
  }
  return lines.join("\n");
}
