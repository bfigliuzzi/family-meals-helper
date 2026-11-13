# Table de saison des fruits et légumes (ADEME, complétée à la main)

> **Rôle** : source de la table de saison de `core` (conception §6.5). Elle dit d'où vient chaque ligne de `packages/core/src/season/season-table.ts` et ce qui n'est pas couvert.
> **Règle de lecture** : la table du code est générée depuis l'API ADEME ; les lignes manuelles sont sourcées une par une ; une lacune n'est pas contrôlée (le contrôle de saison est partiel, et la sortie de `compose` le dit).

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

Conception §6.5 : « à défaut : une table saisie à partir d'un calendrier officiel ». **Une ligne manuelle l'emporte sur l'ADEME** : c'est un complément ou une correction sourcée et voulue.

- `potimarron` : octobre, novembre, décembre. Source : https://www.mangerbouger.fr/manger-mieux/bien-manger-sans-se-ruiner/calendrier-de-saison/fruits-et-legumes/potimarron (lue le 2026-11-13). L'ADEME n'a pas de produit « potimarron » (seulement « courge » et « potiron »).
- `endive` : octobre à avril. Source : https://www.mangerbouger.fr/manger-mieux/bien-manger-sans-se-ruiner/calendrier-de-saison/fruits-et-legumes/endive (lue le 2026-11-13). L'ADEME donne janvier à mai et octobre ; la ligne manuelle retient mangerbouger.

La table couvre tous les fruits et légumes du référentiel, quelle que soit leur forme par défaut (par exemple `maïs`, ADEME juillet à septembre) : le contrôle porte sur la forme reçue de l'IA.

Le citron reste à janvier et février : l'ADEME et mangerbouger.fr concordent. Le citron est de toute façon exempté du contrôle (voir ci-dessous).

## Rapport du script (2026-11-13)

| Entrée | Mois | Source |
|---|---|---|
| ail | juillet à décembre (7, 8, 9, 10, 11, 12) | ademe |
| oignon | septembre à avril (1, 2, 3, 4, 9, 10, 11, 12) | ademe |
| échalote | octobre à décembre (10, 11, 12) | ademe |
| carotte | septembre à mars (1, 2, 3, 9, 10, 11, 12) | ademe |
| poireau | septembre à avril (1, 2, 3, 4, 9, 10, 11, 12) | ademe |
| courgette | mai à octobre (5, 6, 7, 8, 9, 10) | ademe |
| aubergine | juin à septembre (6, 7, 8, 9) | ademe |
| poivron | juin à septembre (6, 7, 8, 9) | ademe |
| tomate | juin à septembre (6, 7, 8, 9) | ademe |
| concombre | mai à octobre (5, 6, 7, 8, 9, 10) | ademe |
| laitue | mai à septembre (5, 6, 7, 8, 9) | ademe |
| mâche | octobre à février (1, 2, 10, 11, 12) | ademe |
| épinard | septembre à mai (1, 2, 3, 4, 5, 9, 10, 11, 12) | ademe |
| chou vert | octobre à mars (1, 2, 3, 10, 11, 12) | ademe |
| chou rouge | octobre à mars (1, 2, 3, 10, 11, 12) | ademe |
| chou-fleur | septembre à mars (1, 2, 3, 9, 10, 11, 12) | ademe |
| brocoli | septembre à novembre (9, 10, 11) | ademe |
| chou de Bruxelles | octobre à mars (1, 2, 3, 10, 11, 12) | ademe |
| haricot vert | juin à octobre (6, 7, 8, 9, 10) | ademe |
| petit pois | mai à juillet (5, 6, 7) | ademe |
| céleri-rave | octobre à mars (1, 2, 3, 10, 11, 12) | ademe |
| betterave | octobre à mars (1, 2, 3, 10, 11, 12) | ademe |
| navet | octobre à mai (1, 2, 3, 4, 5, 10, 11, 12) | ademe |
| panais | octobre à mars (1, 2, 3, 10, 11, 12) | ademe |
| potiron | septembre à janvier (1, 9, 10, 11, 12) | ademe |
| butternut | septembre à janvier (1, 9, 10, 11, 12) | ademe |
| potimarron | octobre à décembre (10, 11, 12) | mangerbouger.fr (potimarron) |
| fenouil | avril, juin à novembre (4, 6, 7, 8, 9, 10, 11) | ademe |
| endive | octobre à avril (1, 2, 3, 4, 10, 11, 12) | mangerbouger.fr (endive) |
| radis | mars à juin (3, 4, 5, 6) | ademe |
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
