# Sources de prix alimentaires en magasin (France) pour un outil local personnel

> **Rôle** : origine des choix de prix (§8 de la conception), qui fixe l'ordre des sources. Ce fichier donne les URL, les formats et les limites constatées de chaque source.
> **Règle de lecture** : les marqueurs [TESTÉ], [LU] et [NON VÉRIFIÉ] indiquent le niveau de confiance ; revérifier un point [NON VÉRIFIÉ] avant de s'appuyer dessus.

Date de la recherche : 12 novembre 2026. Usage visé : un seul utilisateur, quelques requêtes par semaine, estimer le coût d'une liste de courses (fruits, légumes, viande, crèmerie, épicerie).

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
| **INSEE prix moyens de vente de détail** (data.gouv.fr) | Moyenne nationale mensuelle issue des relevés de l'IPC | 62 produits seulement (14 légumes, 8 fruits, 12 viandes, quelques poissons) ; moyenne France | CSV zippé téléchargeable | Gratuit, sans clé | Dernier mois dans le fichier : 2026-09 (fichier téléchargé le 12 nov.) | Licence Ouverte 2.0 (`lov2`) | **Filet de sécurité** fruits/légumes/viande |
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
- Dump quotidien : `https://prices.openfoodfacts.org/data/prices.jsonl.gz`, 22 Mo, en-tête `last-modified` du 11 nov. 2026. Dataset Parquet sur Hugging Face (page répond 200).
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
- Téléchargement direct sans clé : `curl -L -o pm.zip https://api.insee.fr/melodi/file/DS_IPC_PM/DS_IPC_PM_CSV_FR` (HTTP 200, 140 Ko). Contient `DS_IPC_PM_data.csv` (20 719 lignes) et `DS_IPC_PM_metadata.csv` (libellés des produits).
- Le CSV contient 62 produits (le fichier de métadonnées en liste 63 avec une ligne en plus). Exemples du mois 2026-09, en EUR :

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

## Recommandation

### MVP : trois niveaux, dans cet ordre

1. **Prix de référence local** (fichier YAML ou CSV, quelques dizaines de lignes). Fait la liste de courses même si le réseau est coupé, et couvre l'épicerie, les œufs, le lait, les pâtes, le riz, où ni l'INSEE ni les catégories d'Open Prices ne suffisent.
2. **Open Prices** pour la mise à jour. Une requête par ingrédient, filtrée sur les lieux français et les 90 derniers jours, en prenant la **médiane** des prix pour éviter qu'un relevé isolé fausse l'estimation. Pour fruits et légumes frais : `category_tag` (`en:carrots`...). Pour viande, crèmerie, épicerie : `product__categories_tags__contains` ou le code-barres. Garder le dernier prix et sa date, et afficher le nombre de relevés.
3. **INSEE prix moyens** en repli pour fruits, légumes et viande (62 produits), avec le mois du relevé affiché.

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

**Testé** : API Open Prices (stats, prix, lieux, filtres, catégories, fraîcheur), dump JSONL (en-têtes), pages Hugging Face et GitHub d'Open Prices (code, licence, dernier push), CSV INSEE téléchargé et lu (62 produits, valeurs de 2026-09), page RNM carotte et mentions légales, recherches data.gouv.fr, `robots.txt` de Carrefour, Leclerc, Intermarché, Auchan et Monoprix, requêtes simples vers Carrefour (403), Leclerc et Auchan (200), métadonnées GitHub du projet `leclerc-drive-mcp`.

**Non testé** : contenu des pages drive des enseignes, services Apify et Piloterr (existence et tarifs), texte actuel des CGU Carrefour (lu via résumé de recherche), API Melodi de l'INSEE, détail du stade « Détail » du RNM, limites de débit d'Open Prices, données des enseignes Lidl, Monoprix et Franprix.
