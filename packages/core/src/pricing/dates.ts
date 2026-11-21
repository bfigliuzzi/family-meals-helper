import { isRealDate, localDateText } from "../history/history.ts";

// Dates `AAAA-MM-JJ` : même méthode que `isRealDate` (`setFullYear`, car `new Date(a, …)` lirait une année de 0 à 99
// comme 1900 à 1999). Aucune lecture de l'heure.
function parts(text: string): { year: number; month: number; day: number } {
  if (!isRealDate(text)) throw new Error(`Date illisible : ${text}.`);
  return {
    year: Number(text.slice(0, 4)),
    month: Number(text.slice(5, 7)),
    day: Number(text.slice(8, 10)),
  };
}

export function addDays(text: string, days: number): string {
  const { year, month, day } = parts(text);
  const date = new Date(2000, 0, 1);
  date.setFullYear(year, month - 1, day + days);
  return localDateText(date);
}

// Le même jour du mois, `months` mois plus tôt ; le dernier jour du mois s'il n'existe pas (31 août − 6 mois : 28 février).
export function monthsBefore(text: string, months: number): string {
  const { year, month, day } = parts(text);
  const total = year * 12 + (month - 1) - months;
  const targetYear = Math.floor(total / 12);
  const targetMonth = total - targetYear * 12;
  const last = new Date(2000, 0, 1);
  last.setFullYear(targetYear, targetMonth + 1, 0);
  const date = new Date(2000, 0, 1);
  date.setFullYear(targetYear, targetMonth, Math.min(day, last.getDate()));
  return localDateText(date);
}
