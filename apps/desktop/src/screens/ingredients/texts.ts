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
} as const;

// « 0 cochée sur 11 », « 1 cochée sur 11 », « 3 cochées sur 11 » : le singulier jusqu'à 1.
export function checkedCountText(checked: number, total: number): string {
  return `${String(checked)} ${checked < 2 ? "cochée" : "cochées"} sur ${String(total)}`;
}
