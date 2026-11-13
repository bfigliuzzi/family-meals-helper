import type { SeasonRow } from "./months.ts";

const CALENDAR =
  "https://www.mangerbouger.fr/manger-mieux/bien-manger-sans-se-ruiner/calendrier-de-saison";
const PRODUCT_PAGE = `${CALENDAR}/fruits-et-legumes`;

// Lignes du calendrier mangerbouger (conception §6.5, décision de l'utilisateur du 2026-11-13) :
// la table de saison est l'union de ces mois et de ceux de l'ADEME. Une ligne ne retire jamais un mois
// donné par l'ADEME. Détail et écarts : `docs/research/saison-fruits-legumes.md`.
export const MANGERBOUGER_ROWS: Readonly<Record<string, SeasonRow>> = {
  endive: { months: [1, 2, 3, 4, 10, 11, 12], source: `${PRODUCT_PAGE}/endive` },
  // Absent de l'ADEME (seulement « courge » et « potiron »).
  potimarron: { months: [10, 11, 12], source: `${PRODUCT_PAGE}/potimarron` },
  carotte: { months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], source: CALENDAR },
  betterave: { months: [1, 2, 3, 4, 10, 11, 12], source: CALENDAR },
  fenouil: { months: [4, 5, 6, 7, 8, 9, 10, 11], source: CALENDAR },
  radis: { months: [3, 4, 5, 6, 7], source: CALENDAR },
  // « Chou rouge » : avril à septembre ; l'union avec le « Chou » de l'ADEME (octobre à mars) donne toute l'année.
  "chou rouge": { months: [4, 5, 6, 7, 8, 9], source: CALENDAR },
  // La « Salade » du calendrier est la salade verte, synonyme de `laitue` dans le référentiel :
  // rapprochement probable, retenu par décision de l'utilisateur.
  laitue: { months: [4, 5, 6, 7, 8, 9, 10], source: CALENDAR },
};
