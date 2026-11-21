import { COST_DISCLAIMER, dayText } from "core";
import type { PriceUnit } from "core";

export const INGREDIENTS_TEXTS = {
  title: "Ingrédients",
  intro:
    "La liste de courses du dernier menu validé, par ordre alphabétique. Les cases cochées sont gardées avec le menu dans l'historique.",
  loading: "Chargement de la liste de courses…",
  errorTitle: "Liste de courses indisponible",
  retry: "Réessayer",
  empty:
    "Aucun menu validé pour l'instant. Validez un menu dans Nouvelle session : sa liste de courses apparaîtra ici.",
  goToNewSession: "Aller à Nouvelle session",
  unreadableMenu:
    "Le dernier menu de l'historique est illisible : sa liste de courses ne peut pas s'afficher. Le prochain menu validé la remplacera.",
  unreadableChecks:
    "Les cases cochées enregistrées pour ce menu sont illisibles : elles sont toutes décochées.",
  listTitle: "Liste de courses",
  writeErrorTitle: "Cases non enregistrées",
  writeErrorLoss: "Elles seront perdues si vous quittez l'app sans réessayer.",
  reload: "Relire l'historique",
  pantryTitle: "Placard (à vérifier)",
  pantryHint: "Ingrédients que vous avez sans doute déjà : vérifiez avant de commander.",
  noPantry: "Aucun ingrédient de placard dans ce menu.",
  eveningLegend: "soir : utilisé seulement le soir du repas, pas pendant la session.",
  toConfirmLegend: "à confirmer : ingrédient inconnu de l'app, vérifiez-le avant de commander.",
  costDisclaimer: COST_DISCLAIMER,
  myPrice: "Mon prix",
  myPriceUnavailable: "Prix personnel indisponible pour ce produit (nom trop long ou illisible).",
  manualUnreadable:
    "Votre table de prix ne peut pas être lue : les coûts utilisent seulement les autres sources.",
  priceModalIntro:
    "Le prix que vous payez d'habitude. Il passe avant Open Prices et l'INSEE, pour ce produit seulement.",
  priceUnitLabel: "Prix pour",
  priceFieldLabel: "Prix (€)",
  priceFieldError: "Entrez un prix entre 0,01 € et 1 000 €.",
  priceSave: "Enregistrer",
  priceCancel: "Annuler",
  priceRemove: "Retirer mon prix",
  priceWriteErrorTitle: "Prix non enregistré",
  openPricesNone:
    "Prix Open Prices pas encore téléchargés : les coûts utilisent votre table et l'INSEE.",
  openPricesRefreshing: "Téléchargement des prix Open Prices en cours…",
} as const;

// « Prix Open Prices du 20/11/2026 (Open Food Facts, licence ODbL), mis à jour chaque semaine. »
export const openPricesReadyText = (fetchedAt: string): string =>
  `Prix Open Prices du ${dayText(fetchedAt)} (Open Food Facts, licence ODbL), mis à jour chaque semaine.`;

// Le message du Rust ou de `core` finit déjà par un point : on le retire avant la phrase qui suit.
const withoutFinalPoint = (message: string): string => message.replace(/[.\s]+$/, "");

// Mise à jour échouée (téléchargement, calcul, garde de format, enregistrement) : un essai a eu lieu aujourd'hui.
export const openPricesErrorText = (message: string): string =>
  `Dernière mise à jour Open Prices impossible : ${withoutFinalPoint(message)}. Nouvel essai au prochain lancement, demain au plus tôt.`;

// Lecture du résumé dans la base échouée : aucun téléchargement n'a eu lieu, un nouvel essai viendra au prochain lancement.
export const openPricesReadErrorText = (message: string): string =>
  `${withoutFinalPoint(message)}. Nouvel essai au prochain lancement.`;

export const myPriceLabel = (name: string): string => `Modifier le prix : ${name}`;

export const priceModalTitle = (name: string): string => `Prix de « ${name} »`;

// « le kilo », « le litre », « la pièce » : « Prix pour le kilo ».
export const PRICE_UNIT_LABELS: Record<PriceUnit, string> = {
  kg: "le kilo",
  l: "le litre",
  piece: "la pièce",
};

export const singlePriceUnitText = (unit: PriceUnit): string =>
  `Prix pour ${PRICE_UNIT_LABELS[unit]}`;

const COUNTED_IN: Record<PriceUnit, string> = {
  kg: "en kilos",
  l: "en litres",
  piece: "en pièces",
};

// Le prix déjà saisi est dans une unité que la ligne n'emploie pas : « Cette liste compte en kilos ».
export const otherUnitPriceText = (current: string, lineUnits: readonly PriceUnit[]): string =>
  `Votre prix actuel : ${current}. Cette liste compte ${lineUnits.map((unit) => COUNTED_IN[unit]).join(" et ")} : en enregistrer un ici remplace l'ancien.`;

// « 0 cochée sur 11 », « 1 cochée sur 11 », « 3 cochées sur 11 » : le singulier jusqu'à 1.
export function checkedCountText(checked: number, total: number): string {
  return `${String(checked)} ${checked < 2 ? "cochée" : "cochées"} sur ${String(total)}`;
}
