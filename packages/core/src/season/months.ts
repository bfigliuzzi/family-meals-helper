export type Month = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

export const MONTH_NAMES_FR: readonly string[] = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
];

// Une ligne de la table de saison : source vaut "ademe" ou l'URL d'une page officielle.
export interface SeasonRow {
  months: readonly Month[];
  source: string;
}

// `at` vient du port Clock.
export function monthOf(at: Date): Month {
  return (at.getMonth() + 1) as Month;
}

export function monthName(month: Month): string {
  return MONTH_NAMES_FR[month - 1] ?? String(month);
}

// « mai à octobre », « octobre à mars » (la série peut passer par décembre),
// « avril, juin à novembre » quand il y a un trou.
export function describeMonths(months: readonly Month[]): string {
  const present = new Set<number>(months);
  if (present.size === 0) return "aucun mois";
  if (present.size === 12) return "toute l'année";
  const runs: string[] = [];
  for (let m = 1; m <= 12; m++) {
    const previous = m === 1 ? 12 : m - 1;
    if (!present.has(m) || present.has(previous)) continue;
    let end = m;
    while (present.has(end === 12 ? 1 : end + 1)) end = end === 12 ? 1 : end + 1;
    const first = MONTH_NAMES_FR[m - 1] ?? "";
    const last = MONTH_NAMES_FR[end - 1] ?? "";
    runs.push(end === m ? first : `${first} à ${last}`);
  }
  return runs.join(", ");
}
