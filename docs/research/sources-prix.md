# Sources de prix alimentaires en magasin (France) pour un outil local personnel

> **Rôle** : origine des choix de prix (§8 de la conception), qui fixe l'ordre des sources. Ce fichier donne les URL, les formats et les limites constatées de chaque source.
> **Règle de lecture** : les marqueurs [TESTÉ], [LU] et [NON VÉRIFIÉ] indiquent le niveau de confiance ; revérifier un point [NON VÉRIFIÉ] avant de s'appuyer dessus.

Date de la recherche : 12 novembre 2026. Mise à jour du 20 novembre 2026 (lot 7.0) : lecture complète du dump Open Prices et du CSV INSEE, section « Formats réels des fichiers » ; là où elle contredit le reste du fichier, elle l'emporte. Mise à jour du 21 novembre 2026 (lot 7 livré) : import INSEE du 21 novembre, mesures du banc Open Prices (section C) et note sur ce que l'app a retenu (section « Recommandation »). Usage visé : un seul utilisateur, quelques requêtes par semaine, estimer le coût d'une liste de courses (fruits, légumes, viande, crèmerie, épicerie).

## Légende de vérification

- **[TESTÉ]** : j'ai appelé l'URL ou téléchargé le fichier, et lu la réponse.
- **[LU]** : lu sur une page officielle (README, CGU, robots.txt), sans appel de l'API.
- **[NON VÉRIFIÉ]** : trouvé via une recherche web ou déduit, pas confirmé sur la source primaire.

## Résumé en une phrase

Pour un MVP, prendre **Open Prices** (prix réels par produit et par magasin, gratuit, sans clé) comme source principale, **l'INSEE « prix moyens de vente de détail »** comme filet de sécurité pour fruits, légumes et viande, et un **prix de référence saisi à la main** quand rien ne répond. Ne pas scraper les sites des enseignes.

## Tableau comparatif

| Source | Ce qu'elle donne | Granularité | Accès | Coût / auth | Fraîcheur observée | Licence / CGU | Verdict |
|---|---|---|---|---|---|---|---|
| **Open Prices** (Open Food Facts) | Prix relevés en magasin par des contributeurs (photo d'étiquette, ticket) | Produit avec code-barres, ou catégorie (ex. `en:carrots`) pour les produits frais ; par magasin ; prix détail | API REST JSON, dump JSONL quotidien, dataset Parquet sur Hugging Face | Gratuit, lecture sans clé | Prix du 10 nov. 2026 présents ; voir détails plus bas | Données ODbL (citer la source), code AGPL-3.0 | **Source principale du MVP** |
| **INSEE prix moyens de vente de détail** (data.gouv.fr) | Moyenne nationale mensuelle issue des relevés de l'IPC | 63 séries, dont 44 produits alimentaires (14 légumes, 8 fruits, 12 viandes, 9 poissons, le pain baguette) ; moyenne France | CSV zippé téléchargeable | Gratuit, sans clé | Dernier mois dans le fichier : 2026-10 (fichier téléchargé le 20 nov. ; le 12 nov. : 2026-09) | Licence Ouverte 2.0 (`lov2`) | **Filet de sécurité** fruits/légumes/viande |
| **RNM FranceAgriMer** | Cotations de marché par stade (producteur, expédition, import, grossiste, détail) | Produit par marché ; surtout gros/expédition, HT | Pages HTML seulement (pas d'API ni CSV trouvés) ; abonnement e-mail | Gratuit | Cotations du jour (12 nov.) et de la semaine 45 | Réutilisation permise, citer la source (licence ouverte FranceAgriMer) | Utile plus tard pour la saisonnalité ; peu adapté au prix en rayon |
| **data.gouv.fr RNM (archive)** | Cotations RNM historiques | Produits frais | Lien vers un portail de statistiques | Gratuit | Données jusqu'en 2019/2020 seulement | `lov2` / `fr-lo` | Inutile pour des prix actuels |
| **APIs officielles des enseignes** | Rien de public trouvé | n/a | n/a | n/a | n/a | n/a | Pas d'option |
| **Scraping / wrappers de drives** (Leclerc, Carrefour, Intermarché, Auchan...) | Prix par magasin, très précis | Produit précis, magasin précis | Navigateur piloté, ou services payants | Payant (Apify, Piloterr) ou fragile (navigateur) | Temps réel | CGU Carrefour interdisent l'extraction ; voir risques | À éviter |
| **Comparateur quiestlemoinscher (Leclerc)** | Comparaisons de prix entre enseignes, fichier « Détails des prix » | Panier de produits, par magasin | Pas d'API trouvée | n/a | Collecte hebdomadaire (selon leur méthodologie) | Réutilisation non précisée ; outil d'une enseigne | Non exploitable |
| **Prix de référence saisis à la main** | Une table que l'utilisateur tient (produit, prix, date) | Ce que l'utilisateur décide | Fichier local | Gratuit | Quand il la met à jour | Aucune contrainte | Indispensable en complément |

## Détail par source

### 1. Open Prices (Open Food Facts)

**Ce qui est vérifié [TESTÉ]**

- L'API répond sans clé : `curl "https://prices.openfoodfacts.org/api/v1/prices?size=3&order_by=-date"` renvoie du JSON (HTTP 200).
- `GET /api/v1/stats` : 343 437 prix au total, 128 pays, 148 698 produits avec au moins un prix, dont 10 646 prix de type « catégorie » (produits frais sans code-barres).
- La France est bien couverte. Les 375 premiers lieux français (classés par nombre de prix) pèsent au moins 202 000 prix. Les plus gros contributeurs : E.Leclerc Clichy (21 515 prix), Auchan Grenoble (8 719), E.Leclerc Gennevilliers (9 085). Les enseignes présentes : Leclerc, Auchan, Carrefour, Intermarché, Super U, Franprix, Biocoop, Aldi.
- Fraîcheur : sur les 100 premiers lieux français, 14 790 prix datent des 3 derniers mois et 88 831 de 2026.
- Produits frais sans code-barres, via `category_tag` (prix par kg ou à l'unité) :
  - `en:carrots` : 86 prix sur les 100 premiers lieux FR, le plus récent 2,29 EUR/kg (Franprix, 8 oct. 2026).
  - `en:tomatoes` : 106 prix, dernier 6,95 EUR/kg (Biocoop, 28 sept.).
  - `en:bananas` : 148 prix, dernier 1,99 EUR/kg (Auchan Supermarché, 13 oct.).
  - `en:apples` : 86 prix.
- Viande et crèmerie passent par les produits à code-barres : 169 prix de viandes fraîches (steak haché du 5 nov. 2026, 4,77 EUR les 250 g), 1 869 prix de lait (lait demi-écrémé 1,08 EUR le 10 nov. 2026).
- Dump quotidien : `https://prices.openfoodfacts.org/data/prices.jsonl.gz`, 22 Mo, en-tête `last-modified` du 11 nov. 2026 (le 20 nov. : 23 075 339 octets, `last-modified` du 19 nov. ; format réel plus bas, section « Formats réels »). Dataset Parquet sur Hugging Face (page répond 200).
- Dépôt GitHub actif : dernier push le 10 nov. 2026, 1 212 commits, licence AGPL-3.0.

**Limites constatées [TESTÉ]**

- **Pas de filtre par pays sur `/prices`.** Les paramètres `location_osm_address_country_code` ou `location__osm_address_country_code` sont ignorés sans erreur (le total reste 343 678). Contournement : lister les lieux français via `/api/v1/locations?osm_address_country_code=FR`, puis filtrer avec `location_id__in=...`. C'est ce que j'ai fait. Autre option : charger le dump JSONL et filtrer en local.
- **Couverture inégale selon le produit.** Les catégories de viande brute et de crèmerie en `category_tag` sont presque vides : `en:chicken-breasts` 1 prix, `en:eggs` 1, `en:milks` 0, `en:butters` 0, `en:pasta` 0. Il faut donc chercher ces produits par `product__categories_tags__contains` (marche pour `en:milks`, `en:fresh-meats`) ou par nom.
- **Les prix sont des relevés ponctuels de bénévoles**, pas une grille complète d'un magasin. Un produit peut avoir 0 prix récent. La recherche par `product_name=poulet` n'a renvoyé que 4 résultats (dont aucun poulet frais).
- **Mélange d'unités** : le champ `price_per` vaut `KILOGRAM` ou `UNIT` ; il faut normaliser.
- Le code `X` (hors France) se mélange parfois : j'ai vu des prix de Walmart, d'Inde, du Kazakhstan quand on ne filtre pas par lieu.

**Licence [LU]** : le guide `docs/guides/data.md` du dépôt dit de respecter l'ODbL, de citer la source, et de ne pas mélanger avec des données non libres que l'on ne pourrait pas republier. Pour un outil personnel non redistribué, la contrainte est faible. Si le projet publie un jour ses données, il faudra les publier sous ODbL.

**Rate limit** : je n'ai pas vu d'en-tête de limite de débit. Quelques requêtes par semaine ne posent aucun souci. Pour le volume, préférer le dump quotidien.

### 2. INSEE, prix moyens de vente de détail

**Vérifié [TESTÉ]**

- Jeu de données data.gouv.fr id `6983dff71f90da358ccf74d7`, producteur INSEE, fréquence mensuelle, licence Licence Ouverte 2.0.
- Téléchargement direct sans clé : `curl -L -o pm.zip https://api.insee.fr/melodi/file/DS_IPC_PM/DS_IPC_PM_CSV_FR` (HTTP 200, 140 Ko). Contient `DS_IPC_PM_data.csv` et `DS_IPC_PM_metadata.csv` (libellés des produits). **Correction du 20 nov. (voir « Formats réels »)** : le CSV compte 20 782 lignes de données et 63 séries, dont 44 produits alimentaires seulement ; le chiffre « 62 produits » du 12 nov. comptait les séries qui ont une valeur au dernier mois, services, carburants et fleurs compris. Exemples du mois 2026-09 (fichier du 12 nov.), en EUR :

| Produit | Prix moyen |
|---|---|
| Carottes (kg) | 2,21 |
| Tomates (kg) | 5,23 |
| Pommes (kg) | 3,15 |
| Bananes (kg) | 2,05 |
| Oranges (kg) | 2,81 |
| Pommes de terre de conservation (kg) | 1,94 |
| Porc, rôti dans le filet (kg) | 13,98 |
| Bœuf, bifteck dans la bavette (kg) | 32,35 |
| Jambon supérieur | 19,56 |

- Séries longues (certaines depuis 1996), mensuelles et annuelles.

**Limites**

- **Aucun produit de crèmerie ni d'épicerie** (seulement « Produits alimentaires divers » : 1 ligne), pas de volaille hors lapin, pas de poulet, pas d'œufs, pas de lait, pas de pâtes, pas de riz.
- Moyenne nationale pondérée, pas par magasin ni par enseigne.
- Décalage d'un à deux mois (septembre dans un fichier de novembre).
- Le fichier se télécharge via une URL `api.insee.fr/melodi/file/...` : l'URL est stable aujourd'hui mais je ne sais pas si l'INSEE la maintiendra. L'API Melodi complète n'a pas été testée.

### 3. RNM FranceAgriMer

**Vérifié [TESTÉ / LU]**

- Le site `https://rnm.franceagrimer.fr/` répond (200). La page produit `https://rnm.franceagrimer.fr/prix?CAROTTE` affiche des cotations datées du 12/11/2026 et de la semaine 45, avec des stades « Marché de producteurs, Expédition, Import, Grossistes, Détail ».
- Les cotations sont en EUR **HT** le kg, par marché (Lyon-Corbas, Perpignan...) ou par bassin de production, avec un commentaire hebdomadaire de conjoncture. Utile pour savoir si les prix montent ou baissent.
- `https://rnm.franceagrimer.fr/api` renvoie 404. Je n'ai trouvé **aucun lien CSV, JSON ou RSS** sur la page produit. Seul un abonnement par e-mail existe.
- Mentions légales [LU] : FranceAgriMer est propriétaire des données, la réutilisation est autorisée, y compris commerciale, à condition de garder l'intégrité des données et de citer la source (licence ouverte FranceAgriMer).
- Sur data.gouv.fr, les deux jeux « Cotations du RNM » ne couvrent que 2004 à 2019/2020 : inutiles pour du courant.

**Limites** : pas d'API, il faudrait analyser du HTML (fragile). Les prix « gros » HT ne sont pas des prix en rayon. Le stade « Détail » existe mais je ne l'ai pas inspecté en détail ; son format et sa couverture sont **[NON VÉRIFIÉ]**.

### 4. APIs officielles des enseignes

- Je n'ai trouvé aucune API publique de prix chez Carrefour, Leclerc, Intermarché, Auchan, Lidl, Monoprix ou Franprix. `developer.carrefour.fr` ne répond pas (connexion impossible depuis ma machine) **[TESTÉ]**.
- Une source de blog (Octoparse, qui vend un outil de scraping, donc partiale) dit que Carrefour a une plateforme « Carrefour Links » réservée aux fournisseurs référencés **[NON VÉRIFIÉ]**.

### 5. Scraping et wrappers de drives

**Ce qui existe** (recherche web, **[NON VÉRIFIÉ]** sauf mention) :

- `ncleton-petitmaker/leclerc-drive-mcp` : serveur MCP et CLI non officiel pour Leclerc Drive, qui pilote un navigateur persistant (Camoufox). Licence MIT, 2 étoiles, dernier push le 8 sept. 2026 **[TESTÉ via l'API GitHub]**. Le README indique que le site bloque les requêtes HTTP simples **[NON VÉRIFIÉ]**.
- Scrapers payants sur Apify (Leclerc Drive, Carrefour, Intermarché, Auchan) et wrappers Piloterr (`piloterr/carrefour-scraper`, `piloterr/intermarche-scraper`, mis à jour le 11 nov. 2026) : ce sont des clients d'API payantes. Tarifs non vérifiés.
- Ancien projet `drive-store/drive-store_scraper-selenium` (2018) : probablement obsolète.

**Ce que j'ai testé** : une requête simple vers `carrefour.fr/s?q=lait` renvoie **403** ; Leclerc et Auchan renvoient 200 (probablement une coquille JavaScript, contenu non analysé).

**Risques juridiques** [LU via recherche web, pas lu directement sur la page] :

- Les CGU de carrefour.fr interdisent « toute extraction ou réutilisation, totale ou partielle » de leurs bases sans autorisation écrite, en s'appuyant sur le droit des producteurs de bases de données. Les CGV (article 11.2) interdisent l'extraction répétée et systématique. Cette citation vient d'un résumé de recherche, et la page CGU indexée est ancienne : à relire avant de s'y fier.
- `robots.txt` [TESTÉ] : Intermarché interdit `/api/*`, `/recherche/*`, `/rechercheproduits/*` ; Leclerc interdit `/recherche`, `/catalogue` et certaines API ; Carrefour bloque plusieurs chemins ; Auchan et Monoprix en bloquent aussi.
- Un usage personnel à quelques requêtes par semaine a un risque pratique faible, mais il reste contraire aux CGU, et les sites bloquent les robots (403, anti-bot). Le prix est de la maintenance continue.

### 6. Comparateur quiestlemoinscher (Leclerc)

- Le site vit maintenant sur `quiestlemoinscher.leclerc` ; l'ancien domaine `quiestlemoinscher.com` ne répond pas depuis ma machine **[TESTÉ]**.
- Leur méthodologie publiée (PDF) dit que les prix des concurrents sont extraits des sites drive, magasin par magasin, chaque semaine, et que les prix Leclerc viennent des fichiers de caisse. Un fichier « Détails des prix » est mis à disposition. Je n'ai trouvé ni API ni licence de réutilisation **[NON VÉRIFIÉ]**. C'est un outil marketing d'une enseigne ; les panier-types peuvent être biaisés.

### 7. Autres pistes

- **Open Food Facts « normal »** : donne produits, étiquettes et Nutri-Score, pas de prix (non testé, sans objet ici).
- **Prix de référence saisis à la main** : une petite table `ingrédient -> prix/kg ou prix/unité, date, source` que l'utilisateur met à jour. Couvre les trous d'Open Prices et de l'INSEE.
- **Estimation par ratios** (ex. « poulet = 1,3 x prix du porc ») : je n'ai pas de source pour ces ratios, donc à éviter sans données.

## Formats réels des fichiers (lot 7.0, téléchargés le 2026-11-20)

> Tout ce qui suit est **[TESTÉ]** le 2026-11-20 : les deux fichiers ont été téléchargés et lus en entier, et chaque nombre vient d'une mesure. Les extraits de test sont dans `packages/core/src/pricing/fixtures/` (voir son `README.md`). « Fenêtre » = du 2026-05-20 (inclus) au 2026-11-19, soit les 6 derniers mois avant le 2026-11-20. La conception retient 6 mois (décision de l'utilisateur du 2026-11-20), à la place des 90 jours de la première recherche.

### A. Open Prices : le dump JSONL

**Fichiers.** Le dossier `https://prices.openfoodfacts.org/data/` répond 403 (pas de liste), mais ces URL répondent 200 :

| Fichier | Taille téléchargée | Décompressé | Lignes | `last-modified` |
|---|---|---|---|---|
| `prices.jsonl.gz` | 23 075 339 octets | 261 059 711 octets | 346 610 | 2026-11-19 23:08 GMT |
| `locations.jsonl.gz` | 1 264 491 octets | 7 409 261 octets | 7 959 lieux | 2026-11-19 23:11 GMT |
| `products.jsonl.gz` | 20 582 823 octets | 137 391 012 octets | 150 725 produits | 2026-11-19 23:14 GMT |

`proofs.jsonl.gz` existe aussi (9 857 457 octets, non téléchargé : sans intérêt pour le calcul). `users.jsonl.gz`, `prices.parquet`, `locations.parquet` et `products.parquet` répondent 404 sous `/data/`.

**Une ligne de `prices.jsonl`** = un objet JSON, UTF-8, une ligne par relevé. Les champs, avec le nombre de lignes où ils sont non nuls (sur 346 610) :

| Champ | Type | Non nul | Sens constaté |
|---|---|---|---|
| `id` | entier | 346 610 | identifiant du relevé |
| `type` | texte | 346 610 | `PRODUCT` (335 868 lignes) ou `CATEGORY` (10 742) |
| `price` | **texte** à 3 décimales (`"1.250"`) | 346 610 | `PRODUCT` : prix du paquet entier, pas par kg. `CATEGORY` : prix par `price_per` |
| `currency` | texte | 346 440 | `EUR` 252 515 lignes, puis `USD` 48 046, `NOK`, `SEK`, `PLN`, `GBP`, `DKK`, `CHF` ; 170 lignes sans devise |
| `date` | texte `AAAA-MM-JJ` | 346 425 | date du relevé (de 2009-04-09 à 2026-11-19) ; 185 lignes sans date, toutes créées en 2024-09 sauf une |
| `price_per` | texte | 10 742 | nul pour tout `PRODUCT` ; pour `CATEGORY` : `KILOGRAM` 7 870, `UNIT` 2 871, `LITER` 1 |
| `category_tag` | texte | 10 742 | nul pour tout `PRODUCT` ; étiquette libre, exemples ci-dessous |
| `product_code` | texte | 335 868 | code-barres (ou équivalent) ; nul pour tout `CATEGORY` |
| `product_id`, `product` | entier | 335 507 | jointure vers `products.jsonl` (`product` répète `product_id`) ; 361 `PRODUCT` ont un `product_code` mais pas de `product_id` |
| `product_name` | texte | 230 257 | nom saisi sur le relevé, souvent absent |
| `location_id`, `location` | entier | 346 608 | jointure vers `locations.jsonl` (`location` répète `location_id`) ; 2 lignes sans lieu |
| `location_osm_id`, `location_osm_type` | entier, texte | 345 158 | identifiant OpenStreetMap du lieu |
| `price_is_discounted` | booléen | 346 610 | `true` : prix promotionnel |
| `price_without_discount`, `discount_type` | texte | 31 439 ; 27 423 | prix avant promotion ; `SALE`, `LOYALTY_PROGRAM`, `EXPIRES_SOON`, `QUANTITY`, `OTHER`, `SEASONAL`, `SECOND_HAND` |
| `receipt_quantity` | texte | 71 431 | quantité achetée sur le ticket (kg ou nombre de pièces), **pas la taille du paquet** |
| `labels_tags`, `origins_tags`, `tags` | liste ou `null` | | `labels_tags` vaut `null` ou `[]` selon la ligne |
| `duplicate_of` | entier | 9 640 | le relevé est un doublon de l'`id` indiqué (toujours présent dans le fichier) |
| `owner`, `owner_comment`, `source`, `proof_id`, `proof` | | | pseudonyme du contributeur, commentaire libre, logiciel utilisé, justificatif (photo de ticket ou d'étiquette) : données à ne pas copier dans des tests |
| `created`, `updated` | texte ISO 8601 | 346 610 | |

**Comment savoir qu'un relevé vient de France.** Ni la ligne ni un objet imbriqué ne donnent le pays : il n'y a aucun champ pays sur la ligne, et aucun objet imbriqué (`location`, `product` et `proof` sont de simples entiers). Il faut télécharger `locations.jsonl.gz` et joindre `price.location_id = location.id`, puis lire `osm_address_country_code`. Mesures :
- 7 959 lieux ; `FR` pour 2 693, `DE` 1 144, `US` 401, `GB` 316 ; 197 lieux sans code pays (146 de type `ONLINE`, 51 de type `OSM`) ;
- 221 873 relevés sont dans un lieu `FR`.

**Du fichier brut à la fenêtre.** 346 610 relevés → 221 873 en lieu `FR` → 37 132 dans la fenêtre → 37 103 en `EUR` (28 en `XPF` et 1 en `CHF`, tous dans des lieux dont le code pays est `FR`) → **36 198 hors doublons** (905 ont `duplicate_of`). Parmi ces 36 198 : 34 787 `PRODUCT`, 1 411 `CATEGORY`, 660 lieux différents. Par mois : 2026-05 2 052 ; 06 3 576 ; 07 5 307 ; 08 10 520 ; 09 5 127 ; 10 5 155 ; 11 (jusqu'au 19) 4 461. Sur les 90 derniers jours (depuis 2026-08-22), les mêmes filtres donnent 20 449 relevés avant retrait des doublons, contre 37 103 sur 6 mois.

**Lieux d'outre-mer.** 250 relevés de la fenêtre (hors doublons, tous `PRODUCT`) sont dans des lieux au code postal commençant par 97 ou 98, en `EUR` et avec le code pays `FR`. Aucun relevé `CATEGORY` n'est concerné.

**`category_tag`.** Étiquette libre en anglais ou en français, sans liste fermée : `en:carrots`, `en:tomatoes`, `en:zucchini`, `en:yellow-onions`, `fr:batavia`, mais aussi `en:heirloom-tomatoe` (faute de frappe), `en:garlic` et `en:garlics`, `en:chicken-breasts`. Dans la fenêtre : 223 étiquettes différentes pour 1 472 relevés `CATEGORY` (en `EUR`, lieux `FR`, doublons compris). Les plus fréquentes : `en:tomatoes` 72, `en:apples` 55, `en:bananas` 55, `en:carrots` 43, `en:zucchini` 40, `en:lemons` 40. Presque toutes sont des fruits et légumes, avec quelques viandes, noix et pains. `price_per` d'un relevé `CATEGORY` n'est pas toujours cohérent avec l'usage : des bananes, des pommes de terre et des tomates ont des relevés en `UNIT` dont la médiane est de 1,99, 3,45 et 1,96 EUR « la pièce » : ces prix ressemblent à des prix au kilo ou d'un sachet, mal étiquetés (déduction, non vérifiée relevé par relevé). Sans poids moyen d'une pièce, un relevé `UNIT` ne se convertit pas en kg.

**Code-barres et poids du paquet.** Un relevé `PRODUCT` porte toujours un `product_code`, mais **jamais le poids ni la quantité du paquet** : ni sur la ligne, ni dans un objet imbriqué. Ils sont dans `products.jsonl` (jointure `price.product_id = product.id`, ou `price.product_code = product.code` quand `product_id` est nul) :
- `product_quantity` : entier, en grammes ou en millilitres (le kilo est déjà converti : « 1 kg » donne 1000) ;
- `product_quantity_unit` : `g`, `ml` (aussi `%` 4 fois et `mmol/l` 2 fois, à ignorer) ;
- `quantity` : texte libre (`"2x130g"`, `"250 g (2 x 125 g)"`, `"1,6 kg"`, `"6 pcs"`), souvent absent ;
- `categories_tags` : liste d'étiquettes de catégorie du produit, en anglais (`en:milks`, `en:butters`…) ; vide pour 2 692 des 35 631 relevés `PRODUCT` de la fenêtre ;
- aussi `product_name`, `brands`, `nutriscore_grade`, `image_url`, `creator` (pseudonyme, à ne pas copier).

Sur les 35 631 relevés `PRODUCT` de la fenêtre (en `EUR`, lieux `FR`, doublons compris ; 21 853 codes-barres différents) : **31 814 ont un poids exploitable** (`product_quantity` > 0 avec l'unité `g` ou `ml`), soit 18 507 codes-barres. Les autres : 3 436 sans `product_quantity`, 264 avec la valeur 0 (surtout les œufs), 90 avec une valeur mais sans unité, 21 sans fiche produit. Le prix par kg d'un produit se calcule donc par `price / (product_quantity / 1000)`, à condition de télécharger aussi `products.jsonl.gz` (20,6 Mo).

**Correspondance avec le référentiel (fenêtre, `FR`, `EUR`, hors doublons).** Les règles ont été écrites à la main pour ce test ; elles ne sont pas encore du code. « Étiquette » : pour un fruit ou légume, les `category_tag` de relevés `CATEGORY` ; pour le reste, les `categories_tags` du produit, en excluant les plats cuisinés, panés, en poudre, végétaux, etc. (exemple : `en:prepared-lentils`, `en:rice-dishes`, `en:cooked-chicken`).

| Ingrédient | Étiquettes retenues | Relevés | Prix médian | Poids du paquet |
|---|---|---|---|---|
| carotte | `en:carrots` | 40 `CATEGORY` (38 kg, 2 pièce) | 2,14 EUR/kg | sans objet |
| tomate | `en:tomatoes`, `en:cherry-tomatoes`, `en:heirloom-tomatoe` | 98 (92 kg, 6 pièce) | 5,18 EUR/kg (quartiles 3,82 et 6,43) | sans objet |
| pomme de terre | `en:potatoes`, `en:charlotte-potatoes`, `en:grenaille-potatoes` | 36 (33, 3) | 2,29 EUR/kg | sans objet |
| oignon | `en:yellow-onions`, `en:onions`, `en:red-onions`, `en:fresh-red-onions` | 56 (52, 4) | 2,99 EUR/kg | sans objet |
| courgette | `en:zucchini`, `en:fresh-zucchini` | 41 (37, 4) | 2,89 EUR/kg | sans objet |
| poireau | `en:leeks` | 21 (21, 0) | 2,99 EUR/kg | sans objet |
| pomme | `en:apples` et 9 variétés (`en:gala-apples`, `en:pink-lady`…) | 98 (88, 10) | 2,99 EUR/kg | sans objet |
| banane (**absente du référentiel**) | `en:bananas`, `en:cavendish-bananas` | 59 (47, 12) | 1,99 EUR/kg | sans objet |
| citron | `en:lemons`, `en:eureka-lemons` | 40 (32, 8) | 3,99 EUR/kg | sans objet |
| poulet (blanc, cuisse, entier) | produits `en:chickens`, `en:chicken-breasts` ; `CATEGORY` `en:chicken-breasts`, `en:chickens`, `en:chicken-thighs` | 34 `PRODUCT` (31 codes-barres) + 3 `CATEGORY` | 13,5 EUR/kg (produits), 14,9 (`CATEGORY`) | 30 sur 34 |
| bœuf haché | produits `en:ground-beef-steaks`, `en:ground-steaks`, `en:fresh-ground-steaks`, `en:ground-beef-preparations` | 80 (51 codes-barres) | 16,51 EUR/kg | 76 sur 80 ; le lot contient des boulettes et des hamburgers |
| lait | produits `en:milks` sans lait en poudre, concentré, aromatisé ni végétal | 676 (325) | 1,76 EUR/L | 657 sur 676 |
| beurre | produits `en:butters` | 184 (87) | 10,60 EUR/kg | 181 sur 184 |
| œuf | `CATEGORY` `en:eggs`, `en:chicken-eggs` ; produits `en:chicken-eggs`, `en:eggs` | 4 `CATEGORY` (pièce, médiane 0,51 EUR) + 120 `PRODUCT` (95) | non calculé en kg | seulement 20 sur 120 ont un poids ; le nombre d'œufs se lit dans `quantity` (`"6 pcs"`, `"12"`, `"10 oeufs"`) pour 90 sur 120 |
| riz | produits `en:rices` sans plats ni riz précuit | 256 (176) + 1 `CATEGORY` | 4,93 EUR/kg | 252 sur 256 |
| pâtes | produits `en:dry-pastas` | 522 (285) + 1 `CATEGORY` | 2,76 EUR/kg | 512 sur 522 |
| lentilles | produits `en:lentils` sans plats préparés | 82 (59) + 1 `CATEGORY` | 4,46 EUR/kg | 78 sur 82 |
| crème | produits `en:creams` sans crème végétale ni lait concentré | 129 (87) | 6,89 EUR/kg ou L (g et ml mélangés) | 122 sur 129 |
| fromage râpé | produits `en:grated-cheese` | 88 (42) | 9,00 EUR/kg | 88 sur 88 |
| farine | produits `en:flours`, `en:wheat-flours` | 120 (95) | 2,99 EUR/kg | 117 sur 120 ; l'étiquette `en:flours` ramène aussi des farines de noix et de la poudre d'amande |

Comparaison avec l'INSEE (2026-10, EUR/kg) pour les neuf fruits et légumes : carotte 2,18, tomate 4,25, pomme de terre 1,97 (conservation) ou 3,15 (nouvelles), oignon 2,82, courgette 2,88, poireau 3,21, pomme 3,01, banane 2,07, citron 3,98. Les médianes d'Open Prices sont proches, sauf la tomate : 5,18 pour les trois étiquettes ensemble, mais 4,97 pour `en:tomatoes` seule (64 relevés), 8,99 pour `en:cherry-tomatoes` (14) et 6,25 pour `en:heirloom-tomatoe` (14). Mélanger les étiquettes d'un même ingrédient tire donc la médiane vers le haut.

**Couverture du référentiel par les relevés `CATEGORY` (fruits, légumes, herbes).** Une correspondance faite à la main associe 96 des 223 étiquettes de la fenêtre à 44 noms d'ingrédients (certains noms regroupent plusieurs entrées du référentiel : chou, potiron et butternut), pour 976 des 1 472 relevés (doublons compris). 33 de ces 44 noms ont au moins 5 relevés dans la fenêtre. Le référentiel contient des légumes sans aucun relevé `CATEGORY` dans la fenêtre : mâche, panais, topinambour, chou de Bruxelles. Presque sans relevé : coriandre 1, blette 1, persil 2, ciboulette 2, basilic 2, asperge 2. Les 127 étiquettes non associées (496 relevés) sont surtout des fruits d'été (pêche, avocat, nectarine, abricot, kiwi, melon…), des noix, des pains et des morceaux de viande hors référentiel. Pour les produits non frais du référentiel (viandes, crèmerie, féculents, conserves) : seuls les 11 ingrédients du tableau ont été essayés ; yaourt, comté, mozzarella, feta, ricotta, semoule, boulgour, quinoa, pain, conserves et surgelés sont **[NON VÉRIFIÉ]**.

**Cinq pièges mesurés pour le calcul.**
1. Les relevés ne sont pas répartis également : le mois d'août 2026 pèse 10 520 relevés, le double d'un mois ordinaire. Sur 90 jours au lieu de 6 mois, le lait tombe de 676 à 63 relevés (produits) et la tomate de 92 à 24 (relevés `CATEGORY` au kg).
2. `price_per` est nul pour tous les `PRODUCT` : un relevé de lait ne dit rien de son volume ; il faut `products.jsonl`.
3. Les relevés en promotion (1 073 dans la fenêtre, doublons compris, `price_is_discounted`) ont leur `price` promotionnel ; `price_without_discount` n'est rempli que pour 580.
4. Le code pays `FR` couvre l'outre-mer : des relevés en `XPF` (28) et 250 relevés en `EUR` dans des lieux 97 ou 98 (prix souvent plus élevés).
5. Une ligne peut manquer de lieu (2), de date (185) ou de devise (170) : il faut les écarter.

**Licence** : ODbL, citer la source (voir la section 1 ; non relue le 2026-11-20).

### B. INSEE : `DS_IPC_PM_CSV_FR.zip`

**Archive.** `curl` rend 200 ; 141 196 octets ; en-têtes `cache-control: max-age=600`, `content-disposition: inline; filename="DS_IPC_PM_CSV_FR.zip"`, `content-type: application/octet-stream`. Elle contient deux fichiers datés du 9 novembre 2026, 09:54 : `DS_IPC_PM_data.csv` (1 520 786 octets) et `DS_IPC_PM_metadata.csv` (30 827 octets).

**`DS_IPC_PM_data.csv`.** ASCII pur (aucun octet au-dessus de 127), sauts de ligne `\n`, **pas de ligne vide ni de retour à la ligne final**, séparateur `;`, pas de BOM. Une ligne d'en-tête puis 20 782 lignes. Toutes les valeurs sont entre guillemets sauf `TIME_PERIOD` et `OBS_VALUE`. Colonnes, dans l'ordre :

| Colonne | Valeurs vues |
|---|---|
| `PRODUCT_ITEM` | code de série entre guillemets (`"8948"`) : 63 codes différents |
| `FREQ` | `M` (19 333 lignes, mensuel, période `AAAA-MM`) ou `A` (1 449 lignes, annuel, période `AAAA`) |
| `UNIT_MEASURE` | `EUR` sur toutes les lignes (**ce n'est pas l'unité du produit**) |
| `OBS_STATUS` | `A` normale (20 776) ou `O` valeur manquante (6 lignes, toutes la série 4037 « Fioul » en 2020, `OBS_VALUE` vide) |
| `IDX_TYPE`, `IND_TYPE`, `SEASONAL_ADJUST`, `GEO`, `GEO_OBJECT`, `CONF_STATUS`, `DECIMALS` | une seule valeur chacune : `CPI`, `AV_P` (prix moyen), `N`, `FM`, `FRANCE`, `F`, `"2"` |
| `TIME_PERIOD` | `1992-01` à `2026-10` en mensuel ; `1992` à `2024` en annuel |
| `OBS_VALUE` | prix en euros, décimale avec un **point** (`17.74`), 2 décimales ; l'unité n'y est pas |

Le fichier mélange mensuel et annuel : filtrer `FREQ = M`. Aucun doublon de la clé (`PRODUCT_ITEM`, `FREQ`, `TIME_PERIOD`).

**`DS_IPC_PM_metadata.csv`.** UTF-8, `\n`, séparateur `;`, valeurs entre guillemets, pas de retour à la ligne final, 525 lignes de données. En-tête : `COD_VAR;LIB_VAR;COD_MOD;LIB_MOD;GEO_OBJECT` (la dernière colonne n'est remplie que sur une ligne, celle de `GEO`). Chaque ligne décrit une modalité d'une colonne du CSV de données : `COD_VAR` nomme la colonne (`PRODUCT_ITEM` 63 lignes, `TIME_PERIOD` 450, `FREQ` 2, `OBS_STATUS` 2, et une ligne pour chacune des 8 autres), `COD_MOD` la valeur, `LIB_MOD` son libellé. **Le libellé d'un produit** : la ligne dont `COD_VAR = PRODUCT_ITEM` et `COD_MOD` = le code de la série (`"8948";…` donne `Légumes : Carottes (kg)`). **L'unité n'est écrite que dans ce libellé**, entre parenthèses à la fin : `(kg)`, `(pièce)`, `(1 litre)`, `(une douzaine)`, `(13 kg), sans consigne`, `(le pot)`. Elle manque pour `Viandes : Jambon supérieur`, `Poissons : Crevettes roses Tropicales`, `Fioul` et `Supercarburant…` : le libellé ne dit pas si le prix est par kg. Il n'existe aucune colonne d'unité dans les données.

**Dernier mois.** `2026-10` : 62 séries sur 63 ont une valeur à ce mois ; la 63e (`3117`, « Nuitée et petit-déjeuner dans un hôtel 2 étoiles ») s'arrête à `2025-11`. Dans les 6 derniers mois (2026-05 à 2026-10), aucune des 62 séries n'a de mois manquant. Mais `2025-12` manque pour les 63 séries, et plusieurs ont des trous de plusieurs mois en 2025 (par exemple la série 8922 « Moules de bouchots » manque de 2025-01 à 2025-05 et en 2025-12). Il faut donc chercher le dernier mois disponible série par série.

**Ce que « 62 produits » recouvre.** Le fichier a **63 séries** : **44 produits alimentaires** et 19 autres (carburants, gaz, fioul, eau, hôtel, services de plomberie, d'électricité et d'automobile, coiffure, cola et bière servis en salle, 4 fleurs). Parmi les 44 alimentaires : 14 légumes, 8 fruits, 12 viandes, 9 poissons et fruits de mer, le pain baguette. La conception (§8) et le tableau du 12 novembre parlaient de « 62 produits (fruits, légumes, viandes) » : c'est 44 produits alimentaires, avec des poissons frais, dont aucun n'est surgelé.

**Les 44 produits alimentaires** (valeur du mois 2026-10 ; la correspondance avec le référentiel est « probable », pas testée) :

| Code | Libellé | Unité (dans le libellé) | 2026-10 | Ingrédient du référentiel |
|---|---|---|---|---|
| 1139 | Viandes : Foie de veau frais (kg) | kg | 35,05 | aucun |
| 1185 | Viandes : Boeuf : filet (kg) | kg | 49,9 | aucun |
| 1186 | Viandes : Boeuf : faux-filet (kg) | kg | 31,89 | aucun |
| 1187 | Viandes : Boeuf : rumsteck (kg) | kg | 31,04 | aucun |
| 1188 | Viandes : Boeuf : entrecôte (kg) | kg | 32,52 | aucun |
| 1192 | Viandes : Boeuf : côte avec os (kg) | kg | 30,76 | aucun |
| 1223 | Produits alimentaires divers : Pain baguette (kg) | kg | 4,12 | pain |
| 1244 | Viandes : Veau : escalope (kg) | kg | 29,61 | veau (approximatif : le référentiel dit « sauté de veau ») |
| 1264 | Viandes : Porc : rôti dans le filet (kg) | kg | 14,03 | filet mignon de porc (approximatif : autre morceau) |
| 1266 | Viandes : Porc : échine avec os (kg) | kg | 12,15 | échine de porc |
| 1272 | Viandes : Jambon supérieur | aucune | 19,7 | jambon blanc (approximatif, unité non écrite) |
| 1339 | Viandes : Lapin entier (kg) | kg | 14,17 | aucun |
| 3792 | Viandes : Boeuf : bifteck dans la bavette (kg) | kg | 32,26 | aucun |
| 3814 | Légumes : Artichauts (pièce) | pièce | 2,46 | artichaut |
| 3838 | Légumes : Chou-fleur (pièce) | pièce | 3,27 | chou-fleur |
| 3840 | Fruits : Kiwi (pièce) | pièce | 0,9 | aucun |
| 3841 | Légumes : Avocat (pièce) | pièce | 1,57 | aucun |
| 3903 | Fruits : Pamplemousses (pièce) | pièce | 0,99 | aucun |
| 3965 | Légumes : Poivrons (kg) | kg | 4,89 | poivron |
| 8901 | Poissons : Baudroie (lotte) en tranche (kg) | kg | 29,77 | aucun |
| 8904 | Poissons : Filet de merlan (kg) | kg | 24,44 | aucun |
| 8909 | Poissons : Soles (kg) | kg | 36,92 | aucun |
| 8920 | Poissons : Coquilles Saint-Jacques entières (kg) | kg | 7,72 | aucun |
| 8921 | Poissons : Crevettes grises (kg) | kg | 34,25 | aucun |
| 8922 | Poissons : Moules de bouchots (kg) | kg | 6,66 | aucun |
| 8923 | Poissons : Tourteaux (kg) | kg | 18,26 | aucun |
| 8928 | Poissons : Crevettes roses Tropicales | aucune | 17,03 | crevette (approximatif : fraîche ou cuite, le référentiel est surgelé ; unité non écrite) |
| 8929 | Poissons : Huîtres creuses calibre moyen (une douzaine) | une douzaine | 10,15 | aucun |
| 8932 | Fruits : Bananes (kg) | kg | 2,07 | banane (absente du référentiel) |
| 8934 | Fruits : Citrons (kg) | kg | 3,98 | citron |
| 8935 | Fruits : Clémentines (kg) | kg | 4,55 | clémentine |
| 8942 | Fruits : Oranges (kg) | kg | 2,83 | orange |
| 8943 | Fruits : Poires, sans les autres poires (kg) | kg | 3,81 | poire |
| 8944 | Fruits : Pommes (kg) | kg | 3,01 | pomme |
| 8948 | Légumes : Carottes (kg) | kg | 2,18 | carotte |
| 8949 | Légumes : Champignons de paris (kg) | kg | 6,55 | champignon de Paris |
| 8951 | Légumes : Courgettes (kg) | kg | 2,88 | courgette |
| 8952 | Légumes : Endives (kg) | kg | 4,26 | endive |
| 8953 | Légumes : Oignons (kg) | kg | 2,82 | oignon |
| 8954 | Légumes : Poireaux (kg) | kg | 3,21 | poireau |
| 8955 | Légumes : Tomates (kg) | kg | 4,25 | tomate |
| 8956 | Légumes : Pommes de terre nouvelles (kg) | kg | 3,15 | pomme de terre (variété « nouvelles ») |
| 8958 | Légumes : Haricots verts (kg) | kg | 7,37 | haricot vert |
| 8959 | Légumes : Pomme de terre de conservation (kg) | kg | 1,97 | pomme de terre (par défaut) |
Ingrédients du référentiel sans aucune série INSEE : tous les produits laitiers, les œufs, les féculents et légumes secs, les conserves, les épices et le placard, le bœuf haché, le bœuf à braiser, l'agneau, le poulet et la dinde, la saucisse, les lardons, le chorizo, le saumon, le maquereau, le cabillaud, le colin, et dans les légumes l'ail, l'échalote, l'aubergine, le concombre, la laitue, la mâche, l'épinard, le brocoli, le céleri, la betterave, le navet, le panais, le potiron, le fenouil, le radis, l'asperge, la blette, le topinambour, la patate douce. Aucune herbe, et pas de figue ni de raisin. Bilan : 23 ingrédients du référentiel ont une série probable, dont 4 approximatifs (veau, filet mignon de porc, jambon blanc, crevette) ; pour la pomme de terre, deux séries se présentent (nouvelles ou conservation) ; pour le pain, la série est la baguette.

**Licence** : Licence Ouverte 2.0 (voir la section 2 ; non relue le 2026-11-20).

### C. Open Prices dans l'app : mesures du lot 7.4 (2026-11-21)

> **[TESTÉ]** le 2026-11-21 sur les trois fichiers téléchargés le 2026-11-20 (dernière modification le 2026-11-19 ; `pnpm --filter core open-prices:report --dir <dossier> --today 2026-11-20`, Node 24, macOS). La carte retenue est `packages/core/src/pricing/open-prices-map.ts` (fruits et légumes par `CATEGORY`, 14 ingrédients par produit à code-barres) ; la règle de sélection des produits (cinq contrôles) est écrite en tête de ce fichier. Le test `open-prices-real.test.ts` la vérifie sur les vrais fichiers.

**Banc d'essai sous Node** : 1,5 s (seuil 30 s), mémoire maximale 144 Mio (seuil 1 Go), résumé de 3 284 octets (seuil 512 Kio). Lignes lues : 7 959 lieux, 346 610 relevés, 150 725 produits, avec 0 ligne illisible et 0 champ mal typé. 1 862 relevés retenus. **Clés utilisables (au moins 3 relevés) : 14 de catégorie, 14 produits à code-barres.** Minimums de la garde de format : la moitié arrondie au-dessous, soit `MIN_CATEGORY_KEYS = 7` et `MIN_PRODUCT_KEYS = 7`.

**Mesure dans WebKit** : non faite au lot 7.4 (écran verrouillé pendant l'essai `tauri dev`) ; à faire à la démonstration, dans le `.app` signé (seuils : moins de 2 minutes, moins de 1,5 Go, interface utilisable).

**Couverture retenue** (relevés, produits distincts, médiane) :

| Clé | Unité | Relevés | Produits | Médiane |
|---|---|---|---|---|
| `fresh\|lait` | €/L | 487 | 241 | 1,65 |
| `fresh\|beurre` | €/kg | 165 | 73 | 10,40 |
| `dry\|pâtes` | €/kg | 399 | 216 | 2,58 |
| `dry\|pâtes complètes` | €/kg | 76 | 41 | 2,88 |
| `dry\|riz basmati` | €/kg | 33 | 24 | 4,22 |
| `dry\|riz complet` | €/kg | 21 | 17 | 5,75 |
| `dry\|lentilles vertes` | €/kg | 38 | 27 | 3,81 |
| `dry\|lentilles corail` | €/kg | 13 | 12 | 5,30 |
| `fresh\|emmental râpé` | €/kg | 71 | 27 | 8,25 |
| `fresh\|crème fraîche` | €/kg · €/L | 18 · 41 | 13 · 22 | 4,76 · 5,77 |
| `fresh\|crème liquide` | €/L | 19 | 17 | 6,87 |
| `fresh\|bœuf haché` | €/kg | 20 | 14 | 23,08 |
| `fresh\|œuf` | €/kg · pièce | 18 · 4 | 11 · (catégorie) | 4,59 · 0,51 |
| `fresh\|blanc de poulet` | €/kg | 7 | 6 | 12,80 |
| `fresh\|carotte` | €/kg | 37 | (catégorie) | 2,09 |
| `fresh\|tomate` | €/kg | 61 | (catégorie) | 4,99 |
| `fresh\|pomme` | €/kg | 86 | (catégorie) | 2,99 |
| `fresh\|oignon`, `pomme de terre`, `courgette`, `poireau`, `citron`, `ail` | €/kg | 47, 30, 32, 20, 29, 14 | (catégorie) | 2,95, 2,30, 2,61, 2,99, 3,99, 15,09 |

Peu de relevés (moins de 3, donc sans prix) : artichaut, chou-fleur et cuisse de poulet (kg), laitue au kilo. À la pièce : concombre 24 relevés (1,89), laitue 30 (1,29), citron 8 (0,79), chou-fleur 4 (4,14), artichaut 3 (1,79), œuf 4 (0,51). La liste complète des produits retenus (identifiant, nom, poids, nombre de relevés), relue le 2026-11-21, vient de `open-prices-real.test.ts` (fichier `/tmp/fmh-open-prices-audit.md`). Après la relecture du cycle 1, la carte écarte : les laits de chèvre, de brebis et de bufflonne ; les pâtes au quinoa, protéinées, aux épinards, tricolores ou aux chanterelles ; les riz basmati demi-complets (« demi », « 1/2 » ou « complet » dans le nom) et le riz noir ; le poulet « façon haché ». La crème fluide va en crème liquide. Les paquets de moins de 50 g ou 50 ml sont écartés, comme les relevés `PRODUCT` qui portent un `price_per`.

## Recommandation

### MVP : trois niveaux, dans cet ordre

> **Note du 21/11/2026 (lot 7 livré) : ce que l'app a retenu.** Les trois niveaux sont livrés, avec ces écarts par rapport au texte ci-dessous.
> - **Niveau 1** : la table locale n'est pas un fichier YAML ou CSV mais la table `price_table` de la base de l'app, une ligne par clé `forme|nom canonique`, modifiée depuis l'écran Ingrédients (« Mon prix »). Elle ne contient que ce que l'utilisateur saisit : pas de prix de départ.
> - **Niveau 2** : pas de requête par ingrédient. L'app télécharge chaque semaine les trois fichiers exportés (`locations`, `prices`, `products`, environ 45 Mo) et en tire un résumé local. Fruits et légumes passent par l'étiquette de catégorie ; les autres produits par le code-barres, joint à `products.jsonl.gz` pour le poids du paquet. La carte retenue est écrite dans `packages/core/src/pricing/open-prices-map.ts` (16 entrées par catégorie : 13 fruits et légumes, l'œuf, le blanc et la cuisse de poulet ; 14 par code-barres. Les « 14 clés utilisables » de la section C sont un résultat du banc de mesure, pas la taille de la carte) ; ce fichier fait foi, pas la liste de la section C, qui date du banc de mesure.
> - **Niveau 3** : l'INSEE est une table générée dans le code (`packages/core/src/pricing/insee-table.ts`, par `pnpm --filter core insee:import`), reliée à 19 ingrédients du référentiel par `insee-map.ts`. **Import du 21/11/2026, données jusqu'à 2026-10** (fichier INSEE du 9 novembre). Elle se régénère à la main : l'app ne télécharge pas l'INSEE. Les séries approximatives (veau, filet mignon de porc, jambon blanc, crevette) ne sont pas reliées.
> - Le pays se lit dans `locations.jsonl.gz` (la ligne de prix n'a pas de champ pays) ; un prix demande au moins 3 relevés.

1. **Prix de référence local** (fichier YAML ou CSV, quelques dizaines de lignes). Fait la liste de courses même si le réseau est coupé, et couvre l'épicerie, les œufs, le lait, les pâtes, le riz, où ni l'INSEE ni les catégories d'Open Prices ne suffisent.
2. **Open Prices** pour la mise à jour. Une requête par ingrédient, filtrée sur les lieux français et les 6 derniers mois (décision de l'utilisateur du 2026-11-20, à la place des 90 jours de la première recherche), en prenant la **médiane** des prix pour éviter qu'un relevé isolé fausse l'estimation. Pour fruits et légumes frais : `category_tag` (`en:carrots`...). Pour viande, crèmerie, épicerie : `product__categories_tags__contains` ou le code-barres. Garder le dernier prix et sa date, et afficher le nombre de relevés.
3. **INSEE prix moyens** en repli pour fruits, légumes et viande (44 produits alimentaires, voir « Formats réels »), avec le mois du relevé affiché.

**Pourquoi cette combinaison**

- Open Prices est la seule source testée qui donne des prix en rayon, par enseigne, récents (novembre 2026), gratuits, sans clé et avec une licence claire. Il est aussi maintenu activement.
- Mais sa couverture est irrégulière : poulet frais et œufs quasi absents en catégorie. D'où le niveau 1 et le niveau 3, qui évitent qu'une ligne de liste reste sans prix.
- L'INSEE est fiable, officiel et simple à lire (un CSV), mais ne couvre ni crèmerie ni épicerie, et a un à deux mois de retard.
- Le scraping des drives coûte cher en maintenance (anti-bot, 403) et viole les CGU d'au moins Carrefour. Pour quelques requêtes par semaine, le bénéfice ne justifie pas ce risque.

**Réglage pratique**

- Télécharger le dump `prices.jsonl.gz` (22 Mo) une fois par semaine et interroger en local plutôt que d'appeler l'API ingrédient par ingrédient. Cela contourne l'absence de filtre pays sur l'API.
- Mettre en cache le CSV INSEE (il change une fois par mois).
- Toujours afficher la source, la date et le nombre de relevés à côté de chaque prix, pour que l'estimation reste lisible comme une estimation.

### À garder pour plus tard

- **RNM FranceAgriMer** : si l'outil doit suggérer des légumes de saison ou de bon marché, les commentaires de conjoncture et les cotations au détail peuvent servir. Il faudrait analyser du HTML ; à envisager seulement si le besoin est réel.
- **Contribuer à Open Prices** : l'utilisateur peut ajouter ses propres tickets (application Open Food Facts). Cela améliore la couverture de ses magasins habituels, et c'est la voie qui augmente le plus la qualité à long terme.
- **API payantes de scraping** (Apify, Piloterr) : seulement si un besoin de prix exact par magasin apparaît. Coût et conformité CGU à vérifier d'abord.
- **Ce qui n'a pas été évalué** : Lidl, Monoprix et Franprix (aucun test dédié, seule la présence de Franprix dans Open Prices est confirmée), l'API Melodi de l'INSEE au-delà du CSV, les tarifs réels des services payants.

## Ce qui a été testé et ce qui ne l'a pas été

**Testé** : API Open Prices (stats, prix, lieux, filtres, catégories, fraîcheur), dump JSONL (en-têtes), pages Hugging Face et GitHub d'Open Prices (code, licence, dernier push), CSV INSEE téléchargé et lu (valeurs de 2026-09 le 12 nov. ; 63 séries et dernier mois 2026-10 le 20 nov.), page RNM carotte et mentions légales, recherches data.gouv.fr, `robots.txt` de Carrefour, Leclerc, Intermarché, Auchan et Monoprix, requêtes simples vers Carrefour (403), Leclerc et Auchan (200), métadonnées GitHub du projet `leclerc-drive-mcp`.

**Testé le 20 nov. (lot 7.0)** : `prices.jsonl.gz`, `locations.jsonl.gz` et `products.jsonl.gz` téléchargés, décompressés et lus ligne par ligne ; `DS_IPC_PM_CSV_FR.zip` téléchargé, décompressé et lu avec le module `csv` de Python. Voir « Formats réels des fichiers ».

**Non testé** : contenu des pages drive des enseignes, services Apify et Piloterr (existence et tarifs), texte actuel des CGU Carrefour (lu via résumé de recherche), API Melodi de l'INSEE, détail du stade « Détail » du RNM, limites de débit d'Open Prices, données des enseignes Lidl, Monoprix et Franprix.
