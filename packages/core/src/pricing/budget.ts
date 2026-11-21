import type { Finding } from "../domain/finding.ts";
import { euroCents, euroText } from "./cost-text.ts";
import type { MenuCost } from "./cost.ts";

export const MAX_BUDGET_EUROS = 10000;

// Un plafond utilisable : fini, d'au moins 0,01 € (sinon il s'écrirait « 0,00 € ») et d'au plus 10000 €.
export function isValidBudget(value: number): boolean {
  return Number.isFinite(value) && value >= 0.01 && value <= MAX_BUDGET_EUROS;
}

// Le constat `budget` n'est jamais renvoyé à l'IA et ne compte pas pour choisir le meilleur essai : il se calcule à
// part de `checkMenu`, à l'affichage. La comparaison se fait en centimes arrondis, ceux qu'on affiche, pour ne jamais
// écrire « 0,00 € de trop ». Le total ne compte que les prix connus. Fonction d'affichage : un budget qui n'est pas
// `isValidBudget` est traité comme l'absence de budget, il ne doit pas faire planter l'écran.
export function checkBudget(cost: MenuCost, budget: number | null): Finding | null {
  if (budget === null || !isValidBudget(budget)) return null;
  const totalCents = euroCents(cost.total);
  const budgetCents = euroCents(budget);
  if (totalCents <= budgetCents) return null;
  const unknown =
    cost.unknown === 0
      ? ""
      : cost.unknown === 1
        ? " (1 prix inconnu, non compté)"
        : ` (${cost.unknown} prix inconnus, non comptés)`;
  const estimate = `${cost.unknown === 0 ? "" : "au moins "}${euroText(totalCents / 100)}`;
  return {
    level: "warning",
    rule: "budget",
    dish: null,
    ingredient: null,
    message: `Coût estimé ${estimate} pour un budget de ${euroText(budgetCents / 100)} : ${euroText((totalCents - budgetCents) / 100)} de trop${unknown}.`,
  };
}

// Vide : pas de plafond (`null`). Un montant en euros à deux décimales au plus, de plus de 0 à 10000 : le nombre.
// Tout le reste : `"invalid"`.
export function parseBudget(text: string): number | null | "invalid" {
  const trimmed = text.trim();
  if (trimmed === "") return null;
  if (!/^\d{1,5}([.,]\d{1,2})?$/.test(trimmed)) return "invalid";
  const value = Number(trimmed.replace(",", "."));
  return isValidBudget(value) ? value : "invalid";
}

// Un montant saisi dans un champ en euros : un nombre, ou le texte en cours de frappe. Vide : `null`. Un montant de
// 0,01 € à `max`, à deux décimales au plus (`.` ou `,`, séparateur final toléré : « 45, » vaut 45) : le nombre. Tout
// le reste, y compris un nombre non fini : `"invalid"`.
export function readEuroInput(value: number | string, max: number): number | null | "invalid" {
  let euros: number;
  if (typeof value === "number") {
    euros = value;
  } else {
    const trimmed = value.trim();
    if (trimmed === "") return null;
    if (!/^\d{1,6}([.,]\d{0,2})?$/.test(trimmed)) return "invalid";
    euros = Number(trimmed.replace(",", "."));
  }
  return Number.isFinite(euros) && euros >= 0.01 && euros <= max ? euros : "invalid";
}

// Le complément de la ligne de coût quand le plafond est tenu : « · budget de 60,00 € respecté », avec « sur les prix
// connus » quand des prix manquent. Vide sans budget valide, quand `checkBudget` signale un dépassement (même
// comparaison en centimes), ou quand aucune ligne n'a de prix : « respecté sur les prix connus » ne dirait rien.
export function budgetRespectedText(cost: MenuCost, budget: number | null): string {
  if (budget === null || !isValidBudget(budget) || checkBudget(cost, budget) !== null) return "";
  if (cost.unknown === cost.lines.length) return "";
  return ` · budget de ${euroText(budget)} respecté${cost.unknown > 0 ? " sur les prix connus" : ""}`;
}
