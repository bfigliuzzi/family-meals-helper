import { plural } from "../session/texts.ts";

export const HISTORY_TEXTS = {
  title: "Historique",
  intro:
    "Les 5 derniers menus validés, du plus récent au plus ancien. Le sixième efface le plus ancien et sa fiche.",
  loading: "Chargement de l'historique…",
  errorTitle: "Historique indisponible",
  retry: "Réessayer",
  empty:
    "Aucun menu validé pour l'instant. Validez un menu dans Nouvelle session : il apparaîtra ici, avec sa fiche.",
  goToNewSession: "Aller à Nouvelle session",
  latest: "Le plus récent",
  tooLong: "Session de plus de 3 h",
  fallback: "Grandes phases seulement",
  open: "Ouvrir la fiche",
  export: "Exporter dans Téléchargements",
  copied: "Copiée dans Téléchargements : ",
} as const;

export function unreadableText(count: number): string {
  return count === 1
    ? "1 entrée de l'historique est illisible : elle est ignorée."
    : `${String(count)} entrées de l'historique sont illisibles : elles sont ignorées.`;
}

export function dinnersText(count: number): string {
  return `${String(count)} ${plural(count, "dîner", "dîners")}`;
}

// `AAAA-MM-JJ`, lue comme une date locale (l'entrée a été validée par `core`) : « lundi 16 novembre 2026 » pour le
// titre, « 16 novembre 2026 » pour les noms accessibles des boutons.
function localDate(date: string): Date {
  const [year, month, day] = date.split("-").map(Number);
  // `setFullYear` : `new Date(a, …)` lirait une année de 0 à 99 comme 1900 à 1999 (comme `isRealDate` dans core).
  const result = new Date(2000, 0, 1);
  result.setFullYear(year ?? 0, (month ?? 1) - 1, day ?? 1);
  return result;
}

export function fullDate(date: string): string {
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "full" }).format(localDate(date));
}

export function longDate(date: string): string {
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(localDate(date));
}

// Le nom du fichier seul, sans le dossier.
export function fileName(path: string): string {
  return path.split("/").pop() ?? path;
}
