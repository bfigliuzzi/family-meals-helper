# Table de saison des fruits et légumes (ADEME, union avec le calendrier mangerbouger)

> **Rôle** : source de la table de saison de `core` (conception §6.5). Elle dit d'où vient chaque ligne de `packages/core/src/season/season-table.ts` et ce qui n'est pas couvert.
> **Règle de lecture** : la table du code est générée depuis l'API ADEME, puis **réunie** (union des mois) avec les lignes du calendrier mangerbouger (lot 2, 2026-11-13) ; chaque ligne manuelle est sourcée ; une lacune n'est pas contrôlée (le contrôle de saison est partiel, et la sortie de `compose` le dit).

Import fait le 2026-11-13.

## Source : API ADEME (Impact CO2)

- URL : `https://impactco2.fr/api/v1/fruitsetlegumes`.
- Constat du 2026-11-13 : sans paramètre, l'API **filtre sur le mois courant** (41 produits en novembre). Avec `?month=1` à `?month=12`, chaque produit porte la liste complète de ses mois (`months`). Le script fait donc 12 appels et fait l'union par `slug` : **76 produits**.
- L'API répond aussi un champ `warning` : elle se réserve le droit de couper l'accès aux utilisateurs anonymes. Sans effet ici : la table est copiée dans le dépôt, jamais appelée à l'exécution (ni par `compose`, ni par l'app).
- Le script `season:import` lève une erreur si le format de la réponse change (champ `data` absent, produit sans mois valides) au lieu de créer des lacunes.

## Rattachements (alias) au référentiel

Par défaut, une entrée du référentiel (fruit ou légume de forme `fresh`) est rattachée au produit ADEME de même nom normalisé. Alias écrits dans `packages/core/src/node/season-import.ts` :

| Entrée du référentiel | Slug ADEME |
|---|---|
| chou vert, chou rouge | `chou` |
| céleri-rave | `celeri` |
| butternut | `courge` |
| haricot vert | `haricotvert` |
| petit pois | `petitpois` |

`céleri branche` n'est plus rattaché à `celeri` : le « Céleri » de l'ADEME suit le calendrier du céleri-rave (mangerbouger.fr, page `celeri`, octobre à mars), et la page `celeri-branche` n'existe pas. Le céleri branche est donc une lacune.

`champignon de Paris` n'est volontairement pas rattaché à « Champignon (morille crue) » (autre produit, présent toute l'année).

## Lignes manuelles

Conception §6.5 : la table est l'**union** des mois de l'ADEME et des mois du calendrier mangerbouger (décision de l'utilisateur, 2026-11-13, lot 2). Une ligne manuelle ajoute des mois, elle n'en retire jamais. Les lignes sont dans `packages/core/src/season/manual-months.ts` (`MANGERBOUGER_ROWS`) ; la source d'un produit qui a les deux est « ademe + » suivi de l'URL mangerbouger. Un produit absent de l'ADEME (potimarron) prend la ligne mangerbouger seule.

> **Ne vaut plus depuis le 2026-11-13** : « Une ligne manuelle l'emporte sur l'ADEME » (lot 1). Ce remplacement retirait mai à l'endive, sans qu'aucune source dise que l'ADEME se trompe.

- `potimarron` : octobre, novembre, décembre. Source : https://www.mangerbouger.fr/manger-mieux/bien-manger-sans-se-ruiner/calendrier-de-saison/fruits-et-legumes/potimarron (lue le 2026-11-13). L'ADEME n'a pas de produit « potimarron » (seulement « courge » et « potiron »).
- `endive` : octobre à avril. Source : https://www.mangerbouger.fr/manger-mieux/bien-manger-sans-se-ruiner/calendrier-de-saison/fruits-et-legumes/endive (lue le 2026-11-13). L'ADEME donne janvier à mai et octobre ; l'union donne janvier à mai et octobre à décembre.
- Les six autres lignes viennent de la page du calendrier (section « Calendrier mangerbouger » ci-dessous), URL https://www.mangerbouger.fr/manger-mieux/bien-manger-sans-se-ruiner/calendrier-de-saison : `carotte` (toute l'année), `betterave` (janvier à avril, octobre à décembre), `fenouil` (avril à novembre), `radis` (mars à juillet), `chou rouge` (avril à septembre ; avec le « Chou » de l'ADEME, octobre à mars, l'union donne toute l'année) et `laitue` (avril à octobre, d'après la « Salade » du calendrier : rapprochement probable, retenu par décision de l'utilisateur).

La table couvre les fruits et légumes du référentiel, sauf les lacunes listées plus bas, quelle que soit leur forme par défaut (par exemple `maïs`, ADEME juillet à septembre) : le contrôle porte sur la forme reçue de l'IA.

Le citron reste à janvier et février : l'ADEME et mangerbouger.fr concordent. Le citron est de toute façon exempté du contrôle (voir ci-dessous).

## Rapport du script (2026-11-13)

Mis à jour le 2026-11-13 après le lot 2 : les sept lignes qui ont une source mangerbouger (carotte, chou rouge, endive, betterave, fenouil, laitue, radis) donnent l'union des deux sources. Le potimarron a une ligne mangerbouger seule (absent de l'ADEME). Les autres lignes sont celles de l'ADEME, inchangées.

| Entrée | Mois | Source |
|---|---|---|
| ail | juillet à décembre (7, 8, 9, 10, 11, 12) | ademe |
| oignon | septembre à avril (1, 2, 3, 4, 9, 10, 11, 12) | ademe |
| échalote | octobre à décembre (10, 11, 12) | ademe |
| carotte | toute l'année (1 à 12) | ademe + mangerbouger.fr (calendrier) |
| poireau | septembre à avril (1, 2, 3, 4, 9, 10, 11, 12) | ademe |
| courgette | mai à octobre (5, 6, 7, 8, 9, 10) | ademe |
| aubergine | juin à septembre (6, 7, 8, 9) | ademe |
| poivron | juin à septembre (6, 7, 8, 9) | ademe |
| tomate | juin à septembre (6, 7, 8, 9) | ademe |
| concombre | mai à octobre (5, 6, 7, 8, 9, 10) | ademe |
| laitue | avril à octobre (4, 5, 6, 7, 8, 9, 10) | ademe + mangerbouger.fr (calendrier) |
| mâche | octobre à février (1, 2, 10, 11, 12) | ademe |
| épinard | septembre à mai (1, 2, 3, 4, 5, 9, 10, 11, 12) | ademe |
| chou vert | octobre à mars (1, 2, 3, 10, 11, 12) | ademe |
| chou rouge | toute l'année (1 à 12) | ademe + mangerbouger.fr (calendrier) |
| chou-fleur | septembre à mars (1, 2, 3, 9, 10, 11, 12) | ademe |
| brocoli | septembre à novembre (9, 10, 11) | ademe |
| chou de Bruxelles | octobre à mars (1, 2, 3, 10, 11, 12) | ademe |
| haricot vert | juin à octobre (6, 7, 8, 9, 10) | ademe |
| petit pois | mai à juillet (5, 6, 7) | ademe |
| céleri-rave | octobre à mars (1, 2, 3, 10, 11, 12) | ademe |
| betterave | octobre à avril (1, 2, 3, 4, 10, 11, 12) | ademe + mangerbouger.fr (calendrier) |
| navet | octobre à mai (1, 2, 3, 4, 5, 10, 11, 12) | ademe |
| panais | octobre à mars (1, 2, 3, 10, 11, 12) | ademe |
| potiron | septembre à janvier (1, 9, 10, 11, 12) | ademe |
| butternut | septembre à janvier (1, 9, 10, 11, 12) | ademe |
| potimarron | octobre à décembre (10, 11, 12) | mangerbouger.fr (potimarron) |
| fenouil | avril à novembre (4, 5, 6, 7, 8, 9, 10, 11) | ademe + mangerbouger.fr (calendrier) |
| endive | janvier à mai, octobre à décembre (1, 2, 3, 4, 5, 10, 11, 12) | ademe + mangerbouger.fr (endive) |
| radis | mars à juillet (3, 4, 5, 6, 7) | ademe + mangerbouger.fr (calendrier) |
| artichaut | mai à septembre (5, 6, 7, 8, 9) | ademe |
| asperge | avril à juin (4, 5, 6) | ademe |
| blette | juin à novembre (6, 7, 8, 9, 10, 11) | ademe |
| topinambour | novembre à février (1, 2, 11, 12) | ademe |
| maïs | juillet à septembre (7, 8, 9) | ademe |
| citron | janvier à février (1, 2) | ademe |
| pomme | août à avril (1, 2, 3, 4, 8, 9, 10, 11, 12) | ademe |
| poire | août à mars (1, 2, 3, 8, 9, 10, 11, 12) | ademe |
| orange | janvier à mars (1, 2, 3) | ademe |
| clémentine | novembre à février (1, 2, 11, 12) | ademe |
| figue | juillet à octobre (7, 8, 9, 10) | ademe |
| raisin | septembre à octobre (9, 10) | ademe |

## Calendrier mangerbouger (2026-11-13)

Source : https://www.mangerbouger.fr/manger-mieux/bien-manger-sans-se-ruiner/calendrier-de-saison (page rendue en JavaScript, lue avec Chrome sans fenêtre). Pour les autres mois, la page demande elle-même `?month=N` (N de 0 pour janvier à 11 pour décembre) avec l'en-tête `X-Requested-With: XMLHttpRequest` et reçoit du JSON ; les douze mois ont été lus ainsi. Au moment de cette lecture, le code n'avait pas été modifié et cette section ne faisait que noter les écarts. Le lot 2 les a ensuite repris : le tableau ci-dessous décrit la table **avant** l'union (état du lot 1) ; la table actuelle est celle du rapport plus haut.

Titre de la liste de novembre : « Quels sont les fruits et légumes de novembre ? ». Éléments listés (40) : Ail, Betterave, Blette, Brocoli, Carotte, Chou, Chou chinois, Chou de Bruxelles, Chou-fleur, Clémentine, Coprin chevelu, Courge, Cresson, Cèpe, Céleri, Endive, Fenouil, Grenade, Kaki, Kiwi, Litchi, Mandarine, Mâche, Navet, Oignon, Oseille, Panais, Pied de mouton, Pleurote, Poire, Poireau, Pomme, Potimarron, Potiron, Pêche de vigne, Rosé des prés, Salsifis, Topinambour, Trompette de la mort, Épinard.

Écarts entre le calendrier mangerbouger et la table du code (`packages/core/src/season/season-table.ts`) **avant l'union du lot 2**, sur les produits qui existent des deux côtés :

| Entrée du code | Table du code | Calendrier mangerbouger |
|---|---|---|
| chou rouge | octobre à mars (rattaché au « Chou » de l'ADEME) | « Chou rouge » : avril à septembre ; « Chou » : octobre à mars. Le chou rouge n'est donc pas de saison en novembre selon mangerbouger |
| carotte | septembre à mars | toute l'année |
| betterave | octobre à mars | octobre à avril |
| fenouil | avril, juin à novembre | avril à novembre |
| radis | mars à juin | mars à juillet |
| laitue | mai à septembre | « Salade » (rapprochement probable, non certain) : avril à octobre |

Tous les autres produits comparés ont les mêmes mois : ail, artichaut, asperge, aubergine, blette, brocoli, butternut (« Courge »), chou de Bruxelles, chou vert (« Chou »), chou-fleur, citron, clémentine, concombre, courgette, céleri-rave (« Céleri »), endive, figue, haricot vert, maïs, mâche, navet, oignon, orange, panais, petit pois, poire, poireau, poivron, pomme, potimarron, potiron, raisin, tomate, topinambour, épinard. Absents du calendrier mangerbouger : l'échalote (exemptée du contrôle de toute façon), le champignon de Paris et la pomme de terre. En novembre, le seul désaccord est donc le chou rouge.

## Lacunes (non contrôlées)

`céleri branche`, `champignon de Paris`, `patate douce`, `tomate concassée` : ni l'ADEME ni une ligne manuelle ne les couvrent. Un ingrédient absent du référentiel (par exemple `romanesco`) n'est pas contrôlé non plus. La sortie de `compose` les liste sous « Contrôle de saison partiel, non vérifiés ».

Pas d'ingrédients exotiques dans le référentiel (avocat, mangue, ananas, banane) : l'ADEME les donne « de saison » toute l'année parce qu'importés.

## Exemptions

Décision de l'utilisateur (2026-11-13, conception §6.5) : l'ail, l'oignon, l'échalote et le citron sont exemptés du contrôle de saison, sans plafond de quantité. Ce sont presque des produits du quotidien, qu'on trouve tout le temps en magasin. Ces entrées portent `seasonExempt: true` dans le référentiel ; l'exemption vaut aussi pour leurs variantes (« oignon rouge ») et quand un nom inconnu les cite (« gousse d'ail », « jus de citron »). La liste « de saison » envoyée à l'IA les donne tous les mois. Leurs lignes restent dans la table, telles que l'ADEME les donne, mais le contrôle ne les lit pas.

L'autre exemption est un ingrédient nommé dans la demande.

## Régénérer

```sh
pnpm --filter core season:import > /tmp/season-report.md && pnpm exec prettier --write packages/core/src/season/season-table.ts
```

Pour vérifier sans écraser : `pnpm --filter core season:import --out /tmp/season-table.ts > /dev/null && pnpm exec prettier --stdin-filepath packages/core/src/season/season-table.ts < /tmp/season-table.ts | diff - packages/core/src/season/season-table.ts` (aucune différence attendue).
