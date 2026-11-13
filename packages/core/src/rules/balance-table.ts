import { QUANTITY_GROUPS } from "./quantity-table.ts";
import type { Protein } from "./dish-profile.ts";

// Seuils d'équilibre (conception §6.3) et constantes du foyer. Les seuils du site viennent de
// `docs/research/mangerbouger-recommandations.md`, section « Citations vérifiées (2026-11-13) » ; l'URL de la
// citation est en commentaire de chaque valeur.

// Conception §3.1, décision Q3 : un menu de batch cooking vaut 4 portions adultes pleines par plat ; les seuils
// du site, donnés par adulte, se comparent à la quantité du menu divisée par ce nombre.
export const ADULT_PORTIONS = 4;

// « limiter les autres viandes (porc, bœuf, veau, mouton, agneau, abats) à 500g par semaine »
// https://www.mangerbouger.fr/l-essentiel/les-recommandations-sur-l-alimentation-l-activite-physique-et-la-sedentarite/reduire/reduire-la-viande-porc-baeuf-veau-mouton-agneau-abats
export const MEAT_MAX_G_PER_ADULT = 500;
// Conception §6.3.
export const RED_MEAT_DISHES_MAX = 2;
// « Limiter la charcuterie à 150g par semaine. »
// https://www.mangerbouger.fr/l-essentiel/les-recommandations-sur-l-alimentation-l-activite-physique-et-la-sedentarite/reduire/reduire-la-charcuterie
export const CURED_MEAT_MAX_G_PER_ADULT = 150;
// Conception §6.3.
export const CURED_MEAT_DISHES_MAX = 1;
export const PULSE_DISHES_MIN = 1;
export const WHOLE_STARCH_DISHES_MIN = 1;

// Ne comptent pas comme « légumes du dîner ».
export const AROMATICS: readonly string[] = ["ail", "oignon", "échalote"];

export const PROTEIN_LABELS: Readonly<Record<Protein, string>> = {
  fish: "poisson",
  seafood: "fruits de mer",
  "red-meat": "viande rouge",
  pork: "porc",
  poultry: "volaille",
  egg: "œufs",
  pulse: "légumes secs",
};

// Écrit un nombre de grammes avec une espace entre les milliers : 2400 devient « 2 400 ».
export function formatGrams(value: number): string {
  return String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

// Lignes du prompt système, générées à partir des constantes : le prompt et le contrôle ne peuvent pas diverger.
export function balancePromptLines(): string[] {
  const meatTotal = MEAT_MAX_G_PER_ADULT * ADULT_PORTIONS;
  const curedTotal = CURED_MEAT_MAX_G_PER_ADULT * ADULT_PORTIONS;
  const ranges = QUANTITY_GROUPS.map(
    (group) => `${group.label} ${group.minPerAdult} à ${group.maxPerAdult} g`,
  ).join(" ; ");
  return [
    `Équilibre : des légumes à chaque dîner (${AROMATICS.join(", ")} ne comptent pas) ; au moins ${PULSE_DISHES_MIN} plat de légumes secs et au moins ${WHOLE_STARCH_DISHES_MIN} plat avec un féculent complet.`,
    `Viande hors volaille (bœuf, veau, agneau, porc) : au plus ${MEAT_MAX_G_PER_ADULT} g par adulte sur la semaine, soit ${formatGrams(meatTotal)} g sur le menu, et au plus ${RED_MEAT_DISHES_MAX} plats de viande rouge ou de porc.`,
    `Charcuterie (lardons, jambon, saucisses, chorizo) : au plus ${CURED_MEAT_DISHES_MAX} plat et ${CURED_MEAT_MAX_G_PER_ADULT} g par adulte, soit ${formatGrams(curedTotal)} g sur le menu.`,
    "Jamais la même protéine principale deux soirs de suite.",
    "Mets la viande en quantité moindre que l'accompagnement (légumes, féculents) et sale modérément.",
    `Quantités par adulte pour un plat, en poids cru (le total du plat divisé par ${ADULT_PORTIONS}) : ${ranges}.`,
    "Donne en g la viande, la volaille, la charcuterie, le poisson et les fruits de mer ; les œufs en pièces.",
  ];
}
