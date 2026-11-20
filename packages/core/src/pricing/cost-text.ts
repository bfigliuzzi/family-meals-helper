import { monthName } from "../season/months.ts";
import type { Month } from "../season/months.ts";
import type { LineCost, MenuCost } from "./cost.ts";
import type { PriceSource, PriceUnit } from "./price.ts";

// Le montant en centimes entiers : le seul arrondi, partagé par l'affichage et la comparaison au budget. (`toFixed`
// arrondit 0,985 à 0,98, `Math.round` à 99 : on n'écrit jamais un montant par `toFixed` sur des euros.)
export function euroCents(euros: number): number {
  return Math.round(euros * 100);
}

// « 1,31 € » : toujours 2 décimales, virgule, pas de séparateur de milliers.
export function euroText(euros: number): string {
  return `${(euroCents(euros) / 100).toFixed(2).replace(".", ",")} €`;
}

const UNIT_SUFFIX: Record<PriceUnit, string> = { kg: "kg", l: "L", piece: "pièce" };

// « 2,14 €/kg », « 1,05 €/L », « 0,59 €/pièce ».
export function unitPriceText(unit: PriceUnit, euros: number): string {
  return `${euroText(euros)}/${UNIT_SUFFIX[unit]}`;
}

// AAAA-MM-JJ → JJ/MM/AAAA.
function dayText(day: string): string {
  const [year, month, date] = day.split("-");
  return `${date}/${month}/${year}`;
}

// « d'octobre », « de mai » : l'élision devant une voyelle (avril, août, octobre).
function ofMonth(month: string): string {
  const name = monthName(Number(month.slice(5, 7)) as Month);
  return /^[aeiou]/.test(name) ? `d'${name}` : `de ${name}`;
}

export function sourceText(source: PriceSource): string {
  switch (source.kind) {
    case "manual":
      return `votre prix du ${dayText(source.date)}`;
    case "open-prices":
      return `Open Prices, médiane de ${source.count} relevés (${dayText(source.first)} au ${dayText(source.last)})`;
    case "insee":
      return `INSEE, moyenne nationale ${ofMonth(source.month)} ${source.month.slice(0, 4)}`;
  }
}

// La ligne de courses : « ≈ 1,29 € · 2,14 €/kg · INSEE, … », ou « prix inconnu ».
export function lineCostText(line: LineCost): string {
  if (line.euros === null) {
    if (line.otherUnits.length === 0) return "prix inconnu";
    const units = line.otherUnits.map((unit) => `€/${UNIT_SUFFIX[unit]}`).join(", ");
    return `prix inconnu (prix connu seulement en ${units})`;
  }
  const [only, ...others] = line.parts;
  if (only !== undefined && others.length === 0 && only.price !== null) {
    return `≈ ${euroText(line.euros)} · ${unitPriceText(only.price.unit, only.price.euros)} · ${sourceText(only.price.source)}`;
  }
  const parts = line.parts.flatMap((part) =>
    part.price === null
      ? []
      : [`${unitPriceText(part.price.unit, part.price.euros)} (${sourceText(part.price.source)})`],
  );
  return `≈ ${euroText(line.euros)} · ${parts.join(" + ")}`;
}

function unknownText(count: number): string {
  return `${count} prix inconnu${count > 1 ? "s" : ""}`;
}

export function totalText(cost: MenuCost): string {
  if (cost.unknown === 0) return `Coût estimé : ${euroText(cost.total)}`;
  if (cost.unknown === cost.lines.length) {
    return `Coût estimé : inconnu (${unknownText(cost.unknown)})`;
  }
  return `Coût estimé : au moins ${euroText(cost.total)} · ${unknownText(cost.unknown)}`;
}

// Mention commune sous un total.
export const COST_DISCLAIMER =
  "Placard non compris. Ordre de grandeur : moyennes de relevés en magasin, pas le prix de votre drive.";

const SOURCE_NOTICES = {
  manual: "votre table de prix",
  "open-prices": "Open Prices (Open Food Facts), licence ODbL",
  insee: "INSEE, prix moyens de vente au détail, Licence Ouverte 2.0",
} as const;

// Les sources employées, dans l'ordre manuel, Open Prices, INSEE ; rien sans source employée.
export function sourcesNotice(cost: MenuCost): string {
  if (cost.sources.length === 0) return "";
  return `Sources : ${cost.sources.map((source) => SOURCE_NOTICES[source]).join(" · ")}.`;
}

// Ligne du prompt utilisateur quand un plafond est donné. Appelée seulement avec un budget valide (`composeMenu` l'a
// vérifié).
export function budgetPromptLine(budget: number): string {
  return `Budget maximum : ${euroText(budget)} pour toute la liste de courses (placard non compris). Reste en dessous en choisissant des produits bon marché.`;
}
