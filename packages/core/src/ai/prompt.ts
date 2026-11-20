import { CATEGORIES } from "../domain/ingredient.ts";
import type { IngredientRef } from "../domain/ingredient.ts";
import type { Finding } from "../domain/finding.ts";
import {
  DAYS,
  DAY_LABELS,
  SESSION_DAY_LABELS,
  daysAfterSession,
  dishLetter,
} from "../domain/menu.ts";
import type { Menu, SessionDay } from "../domain/menu.ts";
import type { Equipment } from "../equipment/household.ts";
import { availableApplianceIds, equipmentPromptLines } from "../equipment/household.ts";
import { MAX_PHASE_MINUTES, MAX_SESSION_PHASES } from "../scheduling/plan-session.ts";
import { balancePromptLines } from "../rules/balance-table.ts";
import {
  PASTA_SESSION_EXCEPTION_FR,
  conservationPromptLines,
} from "../rules/conservation-table.ts";
import { monthName } from "../season/months.ts";
import type { Month } from "../season/months.ts";
import type { PastMenu } from "./compose.ts";
import { budgetPromptLine } from "../pricing/cost-text.ts";
import { printable } from "./printable.ts";

// Règles tirées de docs/research/cuisine-addict-regles.md (§1.3 à §1.7, §2) et de la conception (§3.1, §6.1).
export const COMPOSITION_RULES_FR = [
  "Tu composes des menus de batch cooking pour une famille française.",
  "Foyer : 4 portions adultes pleines par plat, dîners du lundi au vendredi, un plat par jour.",
  "Choisis 1 ou 2 fruits ou légumes de saison comme ingrédients phares, partagés entre plusieurs plats.",
  "Utilise les mêmes préparations dans plusieurs plats (sauce, légumes coupés, purée) pour gagner du temps.",
  "Au plus un plat à cuisson longue dans la semaine.",
  "Ne mets pas sur un appareil plus de cuissons qu'il n'en accepte en même temps (par exemple trois plats au four) : elles attendraient leur tour. Tu n'as pas à utiliser tous les appareils.",
  "Les plats doivent se réchauffer sans dommage : mijotés, gratins, soupes, plats en sauce.",
  `Le soir même (\`sameDay\` à true) : pâtes, riz blanc, risotto, œufs cuits seuls, viande grillée, pommes de terre à l'eau ou vapeur, fruits de mer. ${PASTA_SESSION_EXCEPTION_FR}`,
  "Poisson et fruits de mer : facultatifs, peu fréquents. Seulement surgelés ou en conserve, jamais frais. Cuis de préférence le poisson surgelé le soir même (`sameDay` à true), en 15 minutes au plus ; préparé pendant la session, un plat de poisson se garde 1 jour au frigo.",
  "Fromage râpé et crème s'ajoutent le jour même : ne les compte pas comme préparés d'avance.",
  "Place les plats les plus fragiles en début de semaine et les plats de légumes seuls en fin de semaine.",
  "Utilise des produits courants de supermarché.",
  "Évite les produits chers (morceaux de bœuf à griller, veau, agneau, fruits de mer, fromages d'appellation) quand un produit courant fait l'affaire.",
  "Pas de friture, sauf si la demande en parle.",
  "Respecte les exclusions à la lettre, y compris dans les accompagnements.",
  "Reste dans la liste des fruits et légumes de saison donnée dans la demande, sauf si la demande nomme l'ingrédient.",
  "Une demande explicite l'emporte sur les règles souples : un plat que la demande nomme reste au menu, sous son nom, même s'il dépasse un plafond ; ajuste les autres plats. Les règles bloquantes s'appliquent toujours.",
].join("\n");

export function buildSystemPrompt(refs: readonly IngredientRef[], equipment: Equipment): string {
  const names = refs.map((ref) => ref.name).sort();
  const instructions = [
    'Réponds uniquement par un objet JSON {"note","dishes":[{"name","day","requested","ingredients":[{"name","qty","unit","form","category","sameDay"}],"phases":[{"id","description","minutes","appliance","attended","after"}]}]}, sans texte autour.',
    "`requested` : true seulement pour un plat que la demande ou le nouveau message nomme (« un bœuf bourguignon »), false sinon.",
    "`note` : une ou deux phrases pour l'utilisateur, en français : ce que tu proposes ou ce que tu as changé. Si tu as dû changer un autre plat que celui visé, nomme-le et dis pourquoi.",
    "`day` : mon, tue, wed, thu, fri, un jour différent par plat.",
    "`unit` : g, ml, piece.",
    "`form` : fresh, canned, frozen, dry.",
    `Emploie exactement un nom de la liste ci-dessous et mets \`category\` à null ; sinon donne \`category\` parmi : ${CATEGORIES.join(", ")}.`,
    "Les accompagnements préparés le soir même sont des ingrédients du plat avec `sameDay` à true ; tous les autres ont `sameDay` à false.",
    `\`phases\` : les grandes phases du plat pendant la session de cuisine (préparation, cuisson), pas ce qui se fait le soir même. Un plat dont tous les ingrédients sont \`sameDay\` a \`phases\` vide. Pas plus de ${MAX_SESSION_PHASES} phases pour tout le menu.`,
    `\`id\` : lettre du plat et numéro (a1, a2, b1…), unique dans le menu. \`minutes\` : nombre entier de minutes, de 1 à ${MAX_PHASE_MINUTES}.`,
    `\`appliance\` : ${["none (à la main, ou attente comme une marinade)", ...availableApplianceIds(equipment)].join(", ")}.`,
    "`attended` : true si la phase t'occupe tout du long (éplucher, couper, saisir, mixer), false si l'appareil tourne seul (four, mijotage, vapeur).",
    `\`after\` : les \`id\` des phases qui doivent être finies avant, de ce plat ou d'un autre. Une préparation commune à deux plats est une seule phase, dont l'autre plat dépend. Au plus ${MAX_SESSION_PHASES} id.`,
    "Une phase occupe une seule place d'un seul appareil pendant toute sa durée : deux plats au four font deux phases, trois casseroles sur la plaque font trois phases.",
    equipment.some((spec) => spec.id === "oven")
      ? "Si un plat passe au four, ajoute une seule phase « Préchauffer le four » (oven, attended false, 15 minutes) dans le premier plat qui l'utilise, et mets son id dans le after de toutes les cuissons au four, de tous les plats. Ne compte ni le refroidissement, ni la vaisselle."
      : "Ne compte ni le refroidissement, ni la vaisselle.",
    "Quantités pour 4 portions adultes.",
    "Liste aussi la matière grasse, le bouillon et les épices qui servent pendant la session, avec leur quantité (par exemple huile d'olive 30 ml) : les étapes les citeront.",
    "Ni le nom d'un plat ni la description d'une phase ne cite un ingrédient exclu, même précédé de « sans ».",
  ].join("\n");
  return [
    COMPOSITION_RULES_FR,
    "",
    conservationPromptLines(refs).join("\n"),
    "",
    balancePromptLines().join("\n"),
    "",
    equipmentPromptLines(equipment).join("\n"),
    "",
    instructions,
    "",
    `Ingrédients connus : ${names.join(", ")}.`,
  ].join("\n");
}

export function findingLine(finding: Finding, menu: Menu | null): string {
  const dish = finding.dish === null ? undefined : menu?.dishes[finding.dish];
  if (finding.dish === null || dish === undefined) {
    return `- [${finding.level}] [${finding.rule}] ${finding.message}`;
  }
  return `- [${finding.level}] [${finding.rule}] plat ${dishLetter(finding.dish)} « ${dish.name} » : ${finding.message}`;
}

const MAX_CONVERSATION_MESSAGES = 10;
const MAX_MESSAGE_CHARS = 300;
const MAX_HISTORY_MENUS = 5;

// Résumé de la conversation donné à l'IA : les 10 derniers messages de l'utilisateur, chacun coupé à 300 caractères.
export function conversationLines(messages: readonly string[]): string[] {
  return messages.slice(-MAX_CONVERSATION_MESSAGES).map((message) => {
    const chars = Array.from(printable(message));
    const text =
      chars.length > MAX_MESSAGE_CHARS
        ? `${chars.slice(0, MAX_MESSAGE_CHARS).join("")}…`
        : chars.join("");
    return `- ${text}`;
  });
}

export function buildUserPrompt(input: {
  request: string;
  exclusions: readonly string[];
  month: Month;
  sessionDay: SessionDay;
  dinners: number;
  // Le nombre vient d'un champ de l'utilisateur : un autre nombre écrit dans la demande ne compte pas.
  dinnersFixed?: boolean;
  inSeason: readonly string[];
  // Plafond en euros pour toute la liste de courses ; absent : pas de plafond.
  budget?: number;
  previous?: { menu: Menu | null; rawText: string; findings: readonly Finding[] };
  pinned?: readonly string[];
  history?: readonly PastMenu[];
  revision?: { initialRequest: string; current: Menu; conversation: readonly string[] };
}): string {
  const { revision } = input;
  const lines =
    revision === undefined
      ? [`Demande : ${input.request}`]
      : [
          `Demande d'origine : ${revision.initialRequest}`,
          `Menu courant : ${JSON.stringify(revision.current)}`,
          `Plats du menu courant, avec la lettre que voit l'utilisateur : ${revision.current.dishes.map((dish, index) => `${dishLetter(index)}. ${printable(dish.name)} (${DAY_LABELS[dish.day]})`).join(" ; ")}.`,
          "Une lettre dans le nouveau message désigne le plat qui porte cette lettre dans cette liste. Une lettre dans un message plus ancien visait le menu affiché à ce moment-là, qui a pu changer depuis.",
          ...(revision.conversation.length === 0
            ? []
            : [
                "Conversation (messages précédents) :",
                ...conversationLines(revision.conversation),
              ]),
          `Nouveau message : ${input.request}`,
          "Modifie le menu courant selon le nouveau message : ne change que ce qu'il vise, sauf si une règle l'exige (dis-le dans `note`). Renvoie le menu complet.",
        ];
  lines.push(`Nombre de dîners : ${input.dinners}`);
  if (input.dinnersFixed === true) {
    lines.push(
      "Ce nombre est fixé par l'utilisateur : un autre nombre de dîners écrit dans la demande ou dans un message ne compte pas.",
    );
  }
  if (revision !== undefined && revision.current.dishes.length !== input.dinners) {
    lines.push(
      `Le menu passe de ${revision.current.dishes.length} à ${input.dinners} dîners : ajoute ou retire des plats en gardant les épinglés.`,
    );
  }
  if (input.budget !== undefined) lines.push(budgetPromptLine(input.budget));
  lines.push(
    `Mois : ${monthName(input.month)}`,
    `Session de cuisine : ${SESSION_DAY_LABELS[input.sessionDay]}. Jours écoulés au dîner : ${DAYS.map((day) => `${DAY_LABELS[day]} ${daysAfterSession(input.sessionDay, day)}`).join(", ")}.`,
    `De saison ce mois-ci (fruits et légumes frais) : ${input.inSeason.join(", ")}`,
    `Ingrédients exclus : ${input.exclusions.length === 0 ? "aucun" : input.exclusions.join(", ")}`,
  );
  if (input.pinned !== undefined && input.pinned.length > 0) {
    lines.push(`Plats épinglés, à garder sous ce nom : ${input.pinned.map(printable).join(", ")}.`);
  }
  if (input.history !== undefined && input.history.length > 0) {
    lines.push(
      "Plats des semaines passées, à ne pas reprendre sauf si la demande les nomme :",
      ...input.history
        .slice(0, MAX_HISTORY_MENUS)
        .map((menu) => `${printable(menu.date)} : ${menu.dishes.map(printable).join(", ")}`),
    );
  }
  const { previous } = input;
  if (previous !== undefined) {
    lines.push(
      "",
      previous.menu === null
        ? `Ta réponse précédente était illisible : ${previous.rawText.slice(0, 2000)}`
        : `Ton menu précédent : ${JSON.stringify(previous.menu)}`,
      "Constats à corriger :",
      ...previous.findings.map((finding) => findingLine(finding, previous.menu)),
      "Corrige tous les [error]. Pour chaque [warning], corrige si tu le peux sans créer d'[error] et sans retirer un plat que la demande nomme.",
      "Renvoie le menu complet corrigé ; ne change que ce qu'il faut.",
    );
  }
  return lines.join("\n");
}
