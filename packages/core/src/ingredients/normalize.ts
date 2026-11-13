// Clé de comparaison d'un nom : minuscules, sans accents ni ponctuation, sans « s » ou « x » final
// sur les mots d'au moins 4 lettres. Sert à comparer, jamais à afficher.
export function normalizeName(text: string): string {
  return lightNormalize(text)
    .split(" ")
    .filter((word) => word !== "")
    .map((word) => (word.length >= 4 && /[sx]$/.test(word) ? word.slice(0, -1) : word))
    .join(" ");
}

// Même chose sans retirer le pluriel : garde les mots tels quels pour repérer « sans », « pas »…
export function lightNormalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
