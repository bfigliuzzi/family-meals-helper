# Extraits de test pour le lot 7 (prix)

Données réelles, prises le 2026-11-20. Elles servent de jeux de test pour lire les deux formats ; leur description complète est dans `docs/research/sources-prix.md` (section « Formats réels des fichiers »).

## Open Prices

Source : https://prices.openfoodfacts.org/data/ (`prices.jsonl.gz`, `locations.jsonl.gz`, `products.jsonl.gz`, fichiers du 2026-11-19). Licence : ODbL (citer Open Food Facts / Open Prices).

- `open-prices-sample.jsonl` : 37 lignes de `prices.jsonl`, non compressées, triées par `id`. Elles couvrent : France récente en relevé `CATEGORY` au kilo (carotte, tomate, pomme, courgette, poireau, pomme de terre, oignon, banane, citron) et à la pièce (citron, laitue, concombre, œuf) ; France récente en relevé `PRODUCT` à code-barres (lait, beurre, riz, pâtes, lentilles, crème, bœuf haché, farine, fromage râpé, œufs, un produit sans poids, un produit en promotion) ; hors France (Allemagne en EUR, États-Unis en USD) ; lieux `FR` en XPF et en CHF ; lieu `ONLINE` sans pays ; la veille (2026-05-19) et le premier jour (2026-05-20) de la fenêtre de 6 mois ; trop anciennes (2024, 2025) ; un doublon (`duplicate_of`) ; une ligne sans date ; une ligne sans lieu.
- `open-prices-locations-sample.jsonl` : les 29 lieux cités par ces lignes, tels quels dans `locations.jsonl` (le pays est dans `osm_address_country_code`, la ligne de prix n'a pas de champ pays).
- `open-prices-products-sample.jsonl` : les 21 produits cités, tels quels dans `products.jsonl` (le poids du paquet est dans `product_quantity` et `product_quantity_unit`, la ligne de prix n'a pas de poids).

Rendu anonyme : `owner` vaut `"anonyme"`, `owner_comment`, `proof_id` et `proof` valent `null` (le justificatif est une photo de ticket ou d'étiquette), le texte entre parenthèses de `source` est retiré (il donnait le modèle de téléphone), `creator` des produits vaut `null`. Les lieux sont des commerces publics d'OpenStreetMap : rien n'y est modifié. Les autres valeurs, dont les prix et les dates, sont d'origine.

## INSEE

Source : https://api.insee.fr/melodi/file/DS_IPC_PM/DS_IPC_PM_CSV_FR (fichiers du 2026-11-09). Licence : Licence Ouverte 2.0 (citer l'INSEE).

- `insee-sample.csv` : 66 lignes de `DS_IPC_PM_data.csv`, mêmes colonnes et même écriture (séparateur `;`, guillemets, pas de retour à la ligne final), triées par série, fréquence et période. Séries : 8948 carottes (kg), 8955 tomates (kg), 3838 chou-fleur (pièce), 1264 porc rôti dans le filet (kg), 1272 jambon supérieur (sans unité dans le libellé), 4037 fioul (deux valeurs manquantes dans l'extrait : 2020-04 et l'année 2020), 3117 hôtel (série arrêtée en 2025-11). Mois : 2026-05 à 2026-10, 2025-10 à 2025-12 (2025-12 n'existe dans aucune série), 2020-03, 2020-04, et les années 2020 et 2024.
- `insee-metadata-sample.csv` : les lignes de `DS_IPC_PM_metadata.csv` qui décrivent ces sept séries (le libellé et l'unité se lisent là) et quatre colonnes (`FREQ`, `OBS_STATUS`, `UNIT_MEASURE`, `IND_TYPE`).

Rien n'est anonymisé dans ces fichiers : ce sont des statistiques publiques.
