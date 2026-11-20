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
