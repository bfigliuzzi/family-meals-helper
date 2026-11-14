import type { Detail } from "../domain/detail.ts";
import type { Finding } from "../domain/finding.ts";
import { FORM_LABELS } from "../domain/ingredient.ts";
import { APPLIANCES, DAY_LABELS, SESSION_DAY_LABELS, dishLetter } from "../domain/menu.ts";
import type { Menu, MenuIngredient, SessionDay } from "../domain/menu.ts";
import { equipmentCapacityLines, phaseUseText } from "../equipment/household.ts";
import type { Equipment } from "../equipment/household.ts";
import { isEveningDish } from "../scheduling/check-session.ts";
import { durationText } from "../scheduling/plan-session.ts";
import { quantityText } from "../shopping/quantity-text.ts";
import { findingLine } from "./prompt.ts";

// Bornes de la fiche : 3 à 6 phases, 20 étapes au plus, 45 mots au plus par étape (fiche de 1 à 2 feuilles).
const MAX_DETAIL_STEPS = 20;
const MAX_STEP_WORDS = 45;

// Prompt système du détail : le menu est déjà validé ; le code calcule les quantités, la durée, la conservation.
export function buildDetailSystemPrompt(equipment: Equipment): string {
  return [
    "Tu rédiges la fiche de session d'un menu déjà validé, à suivre en cuisine sans revenir en arrière. Ne change ni les plats, ni les ingrédients, ni les quantités.",
    'Réponds uniquement par un objet JSON {"steps":[{"id","phase","dishes","text","minutes","appliance","attended","after"}],"evenings":[{"dish","text"}]}, sans texte autour.',
    "Étapes :",
    `- 3 à 6 phases et ${MAX_DETAIL_STEPS} étapes au plus en tout. \`phase\` : titre court de la phase, dans l'ordre du temps (« Lancer les cuissons longues », « Découpes pendant la cuisson », « Plats en sauce », « Finitions et mixages »). Ne nomme pas les phases par type d'action (« Découpes », « Cuissons ») : les étapes d'une phase se suivent dans le temps. La fiche imprime les étapes dans l'ordre du planning calculé par le code : donne des \`after\` exacts.`,
    "- `id` : s1, s2…, uniques. `dishes` : les lettres des plats servis par l'étape ; la première est celle du plat principal. Chaque plat préparé pendant la session est la première lettre d'au moins une étape. Jamais un plat du soir.",
    "- `text` : la consigne, à l'impératif, télégraphique, " +
      `${MAX_STEP_WORDS} mots au plus. Elle dit comment faire : la découpe et sa taille (rondelles de 5 mm, cubes de 2 cm, émincer, ciseler, râper) ; le récipient (cocotte, poêle, plat à four) ; la matière grasse ; le feu (vif, moyen, doux), remuer ou pas, le signe que c'est cuit (jusqu'à tendre, doré) ; la durée et la température du four.`,
    "- Repères : cite chaque ingrédient du menu par son repère entre accolades, au moment où tu le prends : {a.1} pour l'ingrédient a.1. Le code y met la quantité et le nom en gras (« Ciseler {b.3} » devient « Ciseler 100 g d'oignon »). Un ingrédient partagé entre plats se répartit en tas dès la découpe : {d.1/e.1}. Ensuite, renvoie au tas sans repère : « le potiron (d) ». Pour un prélèvement, écris « la moitié de {a.1} ». Jamais le repère d'un ingrédient marqué « le soir ». Chaque ingrédient préparé d'avance est cité au moins une fois.",
    "- Aucune quantité d'un ingrédient du menu en toutes lettres : utilise ses repères. La matière grasse se cite par son repère si elle est au menu, sinon « un peu de matière grasse » qui n'est pas exclue. L'eau, le sel et le poivre restent libres (« 2 fois leur volume d'eau »).",
    "- `**…**` met en gras : seulement ce qu'il faut garder (« **Garder l'eau de cuisson** pour le plat c »), une température ou une durée. Pas d'autre balise, pas d'accolade hors des repères.",
    "- N'écris jamais de numéro ni d'`id` d'étape dans le texte : la fiche numérote elle-même. Pour renvoyer à une autre étape, nomme la préparation (« la sauce (c) »).",
    `- \`minutes\` : entier de 1 à 600. \`appliance\` : none (à la main, ou attente), ${APPLIANCES.filter((appliance) => appliance !== "none").join(", ")}. \`attended\` : true si l'étape t'occupe tout du long, false si l'appareil tourne seul. \`after\` : les \`id\` des étapes à finir avant. Une étape qui reprend une préparation mise de côté (sauce, garniture, légumes cuits réservés) met aussi dans \`after\` l'\`id\` de l'étape qui l'a faite, même si l'ordre semble aller de soi : le code en déduit la consigne de conservation.`,
    "- Une étape est une seule occupation d'un seul appareil. Un seul préchauffage du four. Ni vaisselle, ni conservation, ni refroidissement final, ni consigne de sécurité : le code les ajoute.",
    ...equipmentCapacityLines(equipment),
    "Le code calcule la durée de la session à partir des étapes. Vise 2 h à 2 h 30, 3 h au plus, sans changer les plats : fais tourner les cuissons en même temps.",
    "Le soir : `evenings` a une ligne courte par plat, qui dit comment finir et réchauffer (four 160 °C 15 min, casserole à feu doux…). Le code ajoute lui-même la liste des ingrédients du soir et la décongélation des plats congelés après la session : ne les répète pas. Pour un ingrédient du soir surgelé, dis s'il se cuit sans décongeler ou s'il faut le sortir la veille.",
    'Dans les constats, le mot "phase" désigne une de tes étapes.',
  ].join("\n");
}

function describeIngredient(ingredient: MenuIngredient, letter: string, position: number): string {
  const notes = [
    ...(ingredient.form === "fresh" ? [] : [FORM_LABELS[ingredient.form]]),
    ...(ingredient.sameDay ? ["le soir"] : []),
  ];
  return `${letter}.${position + 1} ${ingredient.name} ${quantityText(ingredient.qty, ingredient.unit)}${notes.length === 0 ? "" : ` (${notes.join(", ")})`}`;
}

// Un plat par ligne : lettre, nom, jour, ingrédients numérotés, puis les grandes phases de la composition
// (ou « plat du soir, aucune étape »), qui servent de base de durée.
function describeDish(menu: Menu, index: number): string {
  const dish = menu.dishes[index]!;
  const letter = dishLetter(index);
  const ingredients = dish.ingredients
    .map((ingredient, position) => describeIngredient(ingredient, letter, position))
    .join(" ; ");
  const phases = isEveningDish(dish)
    ? "plat du soir, aucune étape"
    : `phases : ${dish.phases
        .map(
          (phase) =>
            `${phase.id} ${phase.description}, ${phase.minutes} min, ${phaseUseText(phase)}${phase.after.length === 0 ? "" : `, après ${phase.after.join(" ")}`}`,
        )
        .join(" ; ")}`;
  return `${letter}. ${dish.name} (${DAY_LABELS[dish.day]}) — ${ingredients} — ${phases}`;
}

export function buildDetailUserPrompt(input: {
  menu: Menu;
  sessionDay: SessionDay;
  // Durée du planning des grandes phases ci-dessus, en minutes.
  composedMinutes: number;
  // Exclusions de la demande : le détail ne les cite jamais, pas même en matière grasse ou le soir.
  exclusions: readonly string[];
  previous?: { detail: Detail | null; rawText: string; findings: readonly Finding[] };
}): string {
  const lines = [
    `Session de cuisine : ${SESSION_DAY_LABELS[input.sessionDay]}.`,
    "Menu validé :",
    ...input.menu.dishes.map((_, index) => describeDish(input.menu, index)),
    `Durée calculée du planning de ces phases : ${durationText(input.composedMinutes)}. Tes étapes détaillées doivent rester proches de cette durée.`,
    input.exclusions.length === 0
      ? "Ingrédients exclus : aucun."
      : `Ingrédients exclus : ${input.exclusions.map((term) => term.trim()).join(", ")}. N'en ajoute jamais, ni en matière grasse, ni en garniture, ni le soir, et ne les nomme pas, même pour dire de ne pas en mettre.`,
  ];
  const { previous } = input;
  if (previous !== undefined) {
    lines.push(
      "",
      previous.detail === null
        ? `Ta réponse précédente était illisible : ${previous.rawText.slice(0, 2000)}`
        : `Ta fiche précédente : ${JSON.stringify(previous.detail)}`,
      "Constats à corriger :",
      ...previous.findings.map((finding) => findingLine(finding, input.menu)),
      "Corrige tous les [error] sans changer les plats ; renvoie la fiche complète.",
    );
  }
  return lines.join("\n");
}
