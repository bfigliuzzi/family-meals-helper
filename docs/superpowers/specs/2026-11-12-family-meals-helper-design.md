# Family Meals Helper : conception

Statut : validée par l'utilisateur le 12/11/2026. Ce document est la source de vérité du produit. Le découpage en lots est dans `docs/roadmap.md`.

Mise à jour du 13/11/2026, après le lot 2 : des notes datées en §3.1, §5.1, §6.2, §6.3, §6.5, §6.6, §7 et §8 disent ce qui a changé depuis la validation, et pourquoi. Le texte qui ne vaut plus est gardé, marqué « ne vaut plus depuis ».

## 1. Intention

L'utilisateur prépare chaque semaine un **batch cook** : une session de cuisine de 2 à 3 h où l'on prépare à l'avance les dîners de la semaine. Il reprenait jusqu'ici les menus de cuisine-addict.com et en a fait le tour.

L'outil compose des menus de batch cook nouveaux à partir d'une envie (« un bœuf bourguignon », « du potimarron »), en respectant les contraintes du foyer, la saison et les règles de méthode de cuisine-addict. Il produit ensuite la liste de courses, qui sert à commander au drive, et une fiche PDF à suivre en cuisine.

Le partage du travail entre l'IA et le code :
- **L'IA** compose, modifie et rédige, et dialogue avec l'utilisateur.
- **Le code** calcule et vérifie tout ce qui peut l'être : saison, exclusions, conservation, équilibre, planning, quantités, coût. Quand une règle est vérifiable par le code, c'est le code qui tranche.

## 2. Vocabulaire

- **`core`** : le package TypeScript pur qui contient toute la logique métier. Il ne dépend ni de Tauri ni du navigateur.
- **port** : une interface de `core` vers l'extérieur (stockage, HTTP, horloge, secrets). L'app desktop, et plus tard un serveur web, fournissent les implémentations.
- **référentiel** : le catalogue d'ingrédients de `core` (§7).
- **menu courant** : le menu affiché pendant une session de conversation. Chaque message de l'utilisateur le modifie.
- **constat** : le résultat d'une vérification. Il porte un niveau (`error` ou `warning`), la règle, le plat concerné et un message lisible à la fois par l'IA et par l'utilisateur.
- **règle bloquante** : un constat `error`. L'IA doit corriger, sinon le menu est refusé.
- **règle souple** : un constat `warning`. L'IA a un essai de correction, puis l'écart est affiché.
- **appareil d'appoint** : un appareil qui n'est pas toujours sorti en cuisine (§3.2).

## 3. Le foyer (décidé par l'utilisateur)

### 3.1 Personnes et repas
- 4 personnes : 2 adultes qui mangent de tout, 2 enfants de 5 et 8 ans sans goût particulier.
- **Quantités pour 4 portions adultes pleines.** Les restes servent au déjeuner du lendemain.
- Le menu couvre uniquement les dîners de semaine. Le nombre de dîners suit la demande, 5 par défaut.
- Une alimentation variée, équilibrée et healthy, selon mangerbouger.fr (§6.3). Les plats hors de ces recommandations (très riches, frits) apparaissent seulement si la demande les mentionne.
- Une liste d'ingrédients à éviter, toujours appliquée. Chaque entrée a une raison facultative (« n'aime pas », « introuvable »).
- La session de cuisine dure 3 h au maximum. L'objectif est 2 h à 2 h 30.
- La session a lieu le **dimanche** par défaut (décision de l'utilisateur, 2026-11-13). Elle peut aussi avoir lieu le vendredi, le samedi ou le lundi : la ligne de commande a une option `--session-day`. Le nombre de jours entre la session et chaque dîner décide de la conservation (§6.2). Une session en milieu de semaine n'est pas prévue : elle tomberait après certains dîners.

### 3.2 Équipement
- **Toujours disponible** : le four, une plaque induction 4 feux, un Thermomix TM5 et un Kenwood Cooking Chef. Le Kenwood chauffe (mijotage, sauces) et sert aussi à trancher et à râper. S'y ajoutent des casseroles, une poêle en inox et un mixeur plongeant.
- **Appareils d'appoint, un par session au maximum** :
  - un Cookeo, pour la cuisson sous pression ;
  - un cuiseur vapeur multi-étages Cuisinart ;
  - un airfryer, petit modèle, pour de petites quantités.
- L'outil choisit un appareil d'appoint seulement quand il fait gagner du temps, et il le nomme. Une session sans appareil d'appoint est normale : la place en cuisine est limitée.
- L'équipement est stocké dans les réglages et modifiable. Chaque appareil est décrit par un fichier de données : nom, nombre de cuissons simultanées, usages, toujours disponible ou d'appoint. Ajouter un appareil revient à ajouter un fichier.

## 4. Périmètre

**Objectifs**
- Des menus nouveaux et variés autour de l'envie de l'utilisateur.
- Les règles bloquantes respectées à chaque menu remis à l'utilisateur.
- Une liste de courses utilisable telle quelle au drive, et un PDF utilisable tel quel en cuisine.
- Un code qui grandit par ajout de modules, et une logique qui passe sur un serveur web sans être réécrite.

**Hors périmètre pour cette version** : plusieurs utilisateurs ou des comptes ; des prix exacts du magasin ou une commande au drive ; les déjeuners, les week-ends, les desserts, les goûters ; le calcul des nutriments ; le mobile ; une version web ; la reprise des recettes de cuisine-addict (on n'en reprend que les règles).

**Ce qui fait jeter un menu à l'utilisateur, même s'il est valide** :
- des ingrédients exotiques ou difficiles à trouver ;
- un coût trop élevé ;
- une session de plus de 3 h ;
- un manquement à la sécurité alimentaire ;
- des plats qui reviennent d'une semaine à l'autre.

Pour le premier point, c'est l'utilisateur qui juge, car l'outil ne connaît pas son magasin. L'IA reste sur des produits courants de supermarché. Quand l'utilisateur refuse un ingrédient, il l'ajoute en un clic à sa liste d'exclusions.

## 5. Parcours

### 5.1 La demande
L'utilisateur écrit en langage libre :
- un plat imposé (« un bœuf bourguignon, compose-moi 4 dîners avec ») ;
- des contraintes combinées : plat, style, nombre de dîners, plafond de budget ;
- ou un seul ingrédient.

Une demande explicite l'emporte sur une règle souple. Un bourguignon demandé compte dans le plafond de viande rouge, mais il ne doit pas être retiré à cause de ce plafond : l'IA ajuste les autres plats. Les règles bloquantes s'appliquent toujours.

> **Note du 13/11/2026 (lot 2, décision de l'utilisateur).** Cette priorité tient au **prompt seul**. Le code ne devine pas quel plat la demande nomme. Tout constat de plafond (`meat`, `cured-meat`) ou de `same-protein` est renvoyé une fois à l'IA, avec la phrase « Si la demande nomme un de ces plats, garde-le et ajuste les autres. ». Si l'IA retire quand même le plat demandé, rien ne le signale. La vraie garantie, épingler un plat dans l'app pour que l'IA ne puisse pas le retirer, est prévue au lot 6. La version précédente (« il n'est jamais retiré à cause de ce plafond ») se lisait comme une garantie du code ; elle ne vaut plus depuis cette date. Une première version avait un détecteur de plat demandé dans le code ; elle a été supprimée parce qu'elle produisait des régressions.
>
> Les plafonds de budget de la demande sont reportés au lot 7 (§6.6).

### 5.2 La composition
1. L'IA propose un menu : les plats, le jour prévu pour chacun, les accompagnements préparés le soir même. Pour chaque plat, elle donne aussi ses grandes phases (préparation, cuisson) avec durée, appareil et présence de l'utilisateur requise ou non.
2. Le code vérifie le menu (§6) et construit un premier planning (§6.4).
3. S'il y a des constats `error`, ou des constats `warning` pas encore soumis à l'IA, `core` renvoie les constats à l'IA pour correction. Un constat `warning` n'est renvoyé qu'une fois par règle (pas par plat). Ce cycle va jusqu'à 3 essais. Pendant ce temps, l'utilisateur voit « vérification en cours ». Après 3 essais, il voit le meilleur menu obtenu avec ses constats : celui qui a le moins de constats `error`, puis le moins de `warning`.
4. L'utilisateur voit le menu courant : les plats, le jour, la conservation, le temps de session calculé, le coût estimé et les avertissements.

### 5.3 La conversation
- Chaque message de l'utilisateur produit une **modification** du menu courant, qui repasse par les étapes 2 et 3.
- Une demande ciblée (« remplace le plat 3 ») ne change que ce qu'elle vise. L'IA peut toucher un autre plat si une règle l'exige, par exemple pour garder un ingrédient partagé ; elle nomme alors ce plat et dit pourquoi.
- L'IA reçoit le menu courant en données structurées, un résumé de la conversation et les 5 derniers menus de l'historique.
- Sur un ingrédient du menu, une action « éviter cet ingrédient » l'ajoute à la liste d'exclusions avec une raison.

### 5.4 Après la validation
1. L'IA rédige le détail : les recettes, les étapes de la session et ce qu'il reste à faire chaque soir.
2. Le code recalcule le planning à partir des étapes détaillées. S'il dépasse 3 h, l'IA corrige les étapes sans changer les plats, en 3 essais au plus. En cas d'échec, l'app propose de revenir au menu pour remplacer le plat le plus long.
3. Le code produit la liste de courses et le PDF. Le menu entre dans l'historique, qui garde les 5 derniers menus validés.

## 6. Règles et vérifications

Chaque règle existe sous deux formes :
- **en texte**, dans le prompt système, pour que l'IA compose juste du premier coup ;
- **en code**, dans `core`, qui produit des constats.

Le prompt système, qui contient les règles longues, est mis en cache (prompt caching).

### 6.1 Méthode cuisine-addict
Source : `docs/research/cuisine-addict-regles.md`. Ce fichier extrait 17 guides et donne la page d'origine de chaque règle. On en tire :
- **un texte de règles pour le prompt**, qui couvre :
  - la composition : 1 ou 2 ingrédients de saison phares partagés entre les plats, des préparations communes, au plus une cuisson longue, des cuissons réparties entre les appareils ;
  - l'organisation de la session ;
  - ce qui se prépare le soir même : pâtes, riz, risotto, œufs, grillades, poisson ; le fromage et la crème s'ajoutent ce jour-là ;
  - le réchauffage et les aliments à ne pas réchauffer ;
- **des tables de données pour le code** : la durée de conservation au frigo et au congélateur par catégorie d'aliment, la liste des aliments qui ne se congèlent pas, la liste des aliments qui ne se réchauffent pas.

> **Note du 13/11/2026 (lot 2).** Ces tables sont dans `packages/core/src/rules/conservation-table.ts`, une exception par nom d'ingrédient en plus de la valeur par catégorie. Le prompt reprend leurs chiffres : il est généré à partir d'elles, pour que le texte et le contrôle ne divergent pas. La liste « ne se réchauffe pas » est courte : les pâtes (`warning`, sauf dans un gratin, des lasagnes ou des cannelloni) et les fruits de mer (`error`). Le risotto, le riz et le reste du §6.1 passent seulement par le prompt.

Quand deux pages donnent des durées différentes (section 3.9 du fichier), la table retient la plus courte.

### 6.2 Conservation (règles bloquantes)
- Un plat se conserve aussi longtemps que son ingrédient le plus fragile.
- L'ordre des dîners suit ces durées : poisson et viande en début de semaine, plats 100 % légumes en fin de semaine.
- Si un plat est prévu après la fin de sa durée au frigo, il est marqué « à congeler dès la fin de la session », avec sa consigne de décongélation. S'il ne se congèle pas, c'est un constat `error`.

> **Note du 13/11/2026 (lot 2) : ce que fait le code.**
> - La durée se compte depuis le jour de session (§3.1) : avec une session le dimanche, le lundi est à 1 jour, le vendredi à 5 jours.
> - Les ingrédients marqués `sameDay` (préparés le soir même) ne comptent pas pour la conservation. L'IA les marque elle-même ; le code la croit.
> - Un plat qui se congèle mal (pomme de terre, légumes secs, fromage…) donne un `warning`, pas une `error` : seul un aliment qui ne se congèle pas du tout bloque.
> - L'ordre des dîners n'est pas une règle bloquante. Le code propose, en `warning` (règle `day-order`), un ordre du plus fragile au moins fragile quand il fait congeler moins de plats. Il ne propose jamais un ordre qui ajoute une `error`, mais il ne trouve pas toujours le meilleur.
> - « À congeler » est calculé par le code, jamais déclaré par l'IA. `compose` l'affiche avec la consigne de décongélation. Les consignes de sécurité (2 h, refroidir) iront dans le PDF (lot 4).
> - La durée vient de la catégorie de l'ingrédient, pas du type de plat (pas de durée « soupe 5 jours »). Pommes de terre préparées d'avance : 2 jours (décision de l'utilisateur).
- Le PDF reprend les consignes de sécurité : 2 h maximum à température ambiante, refroidir avant de mettre au frigo, ne pas recongeler.

### 6.3 Équilibre mangerbouger.fr (règles souples)
Source : `docs/research/mangerbouger-recommandations.md`. Les seuils chiffrés sont recopiés du texte brut des pages, avec leur URL, dans la section « Citations vérifiées (2026-11-13) », et l'utilisateur les a relus (lot 2).

Les recommandations du site portent sur la semaine entière, tous repas confondus. Le menu ne couvre que les dîners et les restes du midi. D'où les contrôles suivants :
- des légumes à chaque dîner, dans le plat ou en accompagnement (l'ail, l'oignon et l'échalote ne comptent pas) ;
- au moins un plat à base de légumes secs (le site en recommande au moins 2 par semaine) ;
- au plus 500 g de viande hors volaille par adulte sur la semaine, et au plus 2 plats de viande rouge ou de porc. Les quantités du menu sont pour 4 portions adultes : le code divise le total du menu par 4 pour le comparer au seuil par adulte (2 000 g sur le menu) ;
- au plus un plat avec de la charcuterie, en petite quantité (le site fixe 150 g par semaine pour un adulte, et la réserve à l'exception pour un enfant ; 600 g sur le menu). Les saucisses comptent comme de la charcuterie, comme sur le site ;
- jamais la même protéine deux soirs de suite ;
- au moins un féculent complet ou semi-complet.

Deux consignes vont seulement dans le prompt : la viande en quantité moindre que l'accompagnement, et un sel modéré.

**Poisson** (décision de l'utilisateur, 2026-11-13) : le site recommande du poisson 2 fois par semaine, dont un poisson gras. Le foyer en mange peu et le poisson frais est trop compliqué à gérer. L'outil applique donc :
- le poisson et les fruits de mer sont facultatifs et peu fréquents ;
- ils sont **seulement surgelés ou en conserve, jamais frais** : une autre forme donne un constat `error` (règle `fish`) ;
- **aucun constat pour un menu sans poisson**, et aucun poisson gras demandé ;
- un poisson préparé d'avance suit les règles normales (1 jour au frigo, se congèle). Le prompt conseille de cuire le poisson surgelé le soir même, en 15 minutes au plus ; cette durée n'est pas contrôlée, car il n'y a pas de durées avant le lot 3 ;
- les fruits de mer ne se réchauffent pas : ils sont ajoutés le soir même (`sameDay`), sinon constat `error` (règle `reheat`) ;
- le thon en conserve est accepté ; la sardine et le maquereau, que le foyer n'aime pas, ne sont pas interdits dans le code : ils passent par la liste d'exclusions (`--exclude sardine --exclude maquereau` en ligne de commande).

> **Ne vaut plus depuis le 2026-11-13** (version validée le 12/11/2026) : « L'outil propose donc l'une de ces deux options : un poisson cuit le soir même, en 15 minutes au plus ; un plat de poisson prévu le lundi ou le mardi. Un menu sans poisson donne un constat `warning`. » Ce qui a changé : plus de poisson frais, plus de `warning` « menu sans poisson ». Pourquoi : décision de l'utilisateur, d'après ses habitudes (« on consomme assez peu de poisson ; surgelé si besoin, le frais est trop compliqué à gérer »).

### 6.4 Planning de session (règles bloquantes)
- **L'entrée** est une liste d'étapes. Chaque étape a une description, une durée, un appareil, les étapes dont elle dépend, et une mention « l'utilisateur est mobilisé » ou « l'appareil tourne seul ».
- Ces étapes sont les grandes phases avant la validation (§5.2), puis les étapes détaillées après (§5.4).
- **Le code calcule le planning et vérifie** :
  - qu'aucun appareil ne dépasse son nombre de cuissons simultanées (4 feux, 1 ou 2 plats au four, 1 Thermomix…) ;
  - que l'utilisateur n'a qu'une tâche manuelle à la fois ;
  - qu'il y a au plus un appareil d'appoint ;
  - que la durée totale tient en 3 h ou moins.
- La durée affichée est toujours celle calculée par le code.

### 6.5 Saison et exclusions (règles bloquantes)
- **Saison** : une table des fruits et légumes de saison en France, mois par mois, stockée dans le dépôt.
  - Source à vérifier en premier : l'API « fruits et légumes de saison » de l'ADEME (impactco2.fr).
  - À défaut : une table saisie à partir d'un calendrier officiel.
  - **La table est l'union de l'ADEME et du calendrier mangerbouger** (décision de l'utilisateur, 2026-11-13) : un mois est de saison s'il l'est pour l'une des deux sources. Une ligne mangerbouger ajoute des mois, elle n'en retire jamais. La carotte et le chou rouge sont ainsi de saison toute l'année, l'endive retrouve mai. Les lignes mangerbouger sont dans `packages/core/src/season/manual-months.ts`, le détail dans `docs/research/saison-fruits-legumes.md`. Ne vaut plus depuis cette date : « une ligne manuelle l'emporte sur l'ADEME » (lot 1), qui retirait des mois à l'endive.
  - Le contrôle porte sur les fruits et légumes de forme `frais` (§7). Un ingrédient hors saison passe s'il est nommé dans la demande.
  - L'ail, l'oignon, l'échalote et le citron sont exemptés du contrôle et proposés toute l'année : ce sont presque des produits du quotidien, qu'on trouve tout le temps en magasin (décision de l'utilisateur, 2026-11-13).
- **Exclusions** : le contrôle compare les noms normalisés du référentiel, synonymes et variantes compris. Par exemple, « courgette » exclut aussi « courgette jaune ».

### 6.6 Quantités (règles souples) et budget
- Le code donne, par groupe de catégories, une fourchette de quantité plausible par portion adulte, en poids cru. Par exemple, 100 à 200 g de viande (bœuf, porc, volaille). Elle se calcule par plat : le total du groupe divisé par 4 portions. Une quantité hors fourchette donne un constat `warning`. Les ingrédients de placard (sel, huile, farine…) ne comptent pas.
- Ces fourchettes sont des bornes de vraisemblance pour attraper une erreur de l'IA, pas des recommandations nutritionnelles. Elles sont dans `packages/core/src/rules/quantity-table.ts`, par groupe et non par ingrédient du référentiel.
- La viande, la volaille, la charcuterie, le poisson et les fruits de mer doivent être donnés en grammes : sinon, constat `error` (règle `menu-shape`), car les plafonds ne se calculent pas sans grammes. Les œufs se comptent en pièces (une pièce vaut 50 g).
- **Budget** : si la demande fixe un plafond, un dépassement donne un constat `warning`. **Reporté au lot 7** (décision de l'utilisateur, 2026-11-13) : le coût vient avec les prix (§8), et il n'existe aucun constat de budget avant. Le plafond de la demande n'est pas encore contrôlé.

## 7. Ingrédients et liste de courses

**Ce que porte chaque ingrédient d'une recette** :
- un nom normalisé du référentiel ;
- une quantité pour 4 portions adultes, en g, en ml ou en pièces ;
- une **forme** : `frais`, `conserve`, `surgelé` ou `sec`. Le référentiel donne la forme par défaut, et l'IA la précise au besoin (« maïs en conserve »).

**Ce que contient le référentiel**, pour chaque ingrédient :
- le nom et ses synonymes ;
- une catégorie détaillée : viande rouge, volaille, porc, charcuterie, poisson, poisson gras, œuf, légume sec, légume, fruit, féculent complet, féculent raffiné, produit laitier… ;
- le rayon ;
- la forme par défaut ;
- l'unité d'achat et le poids moyen d'une pièce (**pas encore dans le référentiel** : arrivent avec la liste de courses, lot 4) ;
- un drapeau `placard` ;
- la fourchette de quantité plausible (**pas par entrée** : le code la donne par groupe de catégories, §6.6).

**Comment le référentiel est utilisé** :
- L'IA reçoit la liste des noms et les emploie.
- Pour un ingrédient absent du référentiel, l'IA fournit sa catégorie, choisie dans une liste fermée du schéma. Le code l'accepte et le marque « à confirmer ».
- Le **type d'un plat** est déduit par le code à partir des catégories de ses ingrédients : viande rouge, volaille, poisson, végétarien, présence de légumes secs, de féculent complet, protéine principale.

> **Note du 13/11/2026 (lot 2).** Le « profil d'un plat » (`packages/core/src/rules/dish-profile.ts`) donne les catégories présentes, les poids par catégorie et la protéine principale (celle qui pèse le plus ; à égalité, la première de la liste poisson, fruits de mer, viande rouge, porc, volaille, œuf, légume sec). Il n'a pas de champ « végétarien » : le marquage (V) du PDF viendra au lot 4. La charcuterie compte comme du porc pour la protéine principale. Le référentiel reste un point de départ : les poissons y sont en forme par défaut surgelé, et la saucisse est classée charcuterie.

**La liste de courses** :
- Le code additionne les quantités de chaque ingrédient sur tous les plats, puis les convertit en unités d'achat : pièces arrondies au-dessus, poids arrondis à une valeur courante.
- Elle est classée par rayon : fruits et légumes, viande et poisson, crèmerie, épicerie salée, épicerie sucrée, surgelés.
- Chaque ligne indique la répartition entre plats : « 1,1 kg tomates (a 400 / b 200 / d 500) ».
- Les ingrédients marqués `placard` (sel, épices, huiles, vinaigres, farine, sucre, bouillon, moutarde…) vont dans une section « vérifie ton placard ».
- Les conserves et les surgelés restent dans la liste, à leur rayon.

## 8. Prix

Il n'existe pas d'API publique de prix pour les enseignes françaises, et les CGU des drives interdisent l'extraction de leurs données. Le coût affiché est donc un **ordre de grandeur**, assez précis pour comparer deux menus. La recherche détaillée est dans `docs/research/sources-prix.md`.

**D'où vient le prix d'un ingrédient** : de la première source qui en a un, dans cet ordre.
1. **La table de prix manuelle** de l'utilisateur : produit, prix, unité, date. Elle se modifie depuis la page ingrédients.
2. **Open Prices** (Open Food Facts) :
   - `core` télécharge le fichier `prices.jsonl.gz` (22 Mo) au plus une fois par semaine, en tâche de fond, à travers les ports ;
   - il le lit ligne par ligne et ne garde que les magasins français et les 6 derniers mois ;
   - il ne stocke qu'un prix médian par ingrédient du référentiel ;
   - on passe par ce fichier parce que l'API ne filtre pas par pays ;
   - la licence ODbL impose de citer la source dans l'app.
3. **L'INSEE**, prix moyens de vente au détail : un fichier CSV de 62 produits (fruits, légumes, viandes).
4. Sinon, « prix inconnu », signalé dans le total.

**Comment le coût est utilisé** :
- La source de chaque prix est affichée.
- Le coût est calculé après chaque proposition, pour l'affichage. Il n'entre pas dans la composition.
- L'IA reçoit seulement la consigne d'éviter les produits chers, et le plafond de budget s'il est donné. *Lot 7 : au lot 2, aucun contrôle de budget n'existe (§6.6).*
- L'app fonctionne aussi sans données Open Prices.

## 9. Ce que l'outil produit

**L'interface** :
- **Nouvelle session** : la conversation avec l'IA, et le menu courant affiché à côté, mis à jour à chaque modification.
- **Ingrédients** : la liste de courses par rayon, avec des cases à cocher, les coûts estimés et le total.
- **Réglages** : les ingrédients à éviter, l'équipement, la clé d'API, le modèle, la table de prix.
- **Historique** : les 5 derniers menus, avec leur PDF.
- L'utilisateur veut une app soignée : une interface propre et sobre.

**Le PDF**, sur le modèle des fiches cuisine-addict :
1. Le menu : plats repérés (a), (b), (c)…, plats végétariens marqués (V), jour prévu et conservation (frigo, congélation).
2. La liste de courses par rayon, avec la répartition entre plats.
3. Le matériel : appareils utilisés et boîtes de conservation.
4. Les étapes de la session dans l'ordre chronologique, regroupées par phase. Chaque étape donne son appareil, sa durée et les quantités au moment où elles servent.
5. Les consignes de conservation et de sécurité.
6. « Ce qu'il reste à faire chaque soir » : la préparation à sortir, ce qu'on ajoute et la façon de réchauffer.

## 10. Architecture

**Choix de l'utilisateur** :
- une application desktop **Tauri**, pour sa légèreté et pour éviter un serveur local à démarrer ;
- un passage en site web possible plus tard.

**Pile technique** :
- **TypeScript** partout, dans un monorepo pnpm : `packages/core` et `apps/desktop`.
- **`core`** reçoit tout accès extérieur par des ports. Pour un serveur web, on fournit d'autres implémentations de ces ports, et `core` ne change pas.
- **Tauri 2** fournit la fenêtre, SQLite et le trousseau macOS, avec ses plugins officiels. Le Rust se limite à ces plugins et à leur configuration.
- **React + Vite** pour l'interface.
- **L'API Claude**, avec le SDK TypeScript officiel d'Anthropic. Les sorties de l'IA sont structurées et validées par des schémas **Zod**. Le modèle est configurable, `claude-sonnet-5-5` par défaut.
- **SQLite** stocke les réglages, les exclusions, l'équipement, l'historique, la table de prix et le résumé Open Prices. La même interface pourra plus tard s'appuyer sur PostgreSQL.
- **Vitest** pour les tests, concentrés sur `core`.

**Clé d'API et appels à Claude** :
- Au démarrage, l'app lit la clé dans le trousseau macOS et la garde en mémoire.
- Les requêtes partent par le plugin HTTP de Tauri, côté Rust, ce qui évite les problèmes de CORS.
- `core` ne voit qu'un port `HttpClient`.
- Pour un site web, la clé passera côté serveur.

**Organisation du code** :
```
packages/core/src/
  domain/        types et schémas Zod : Menu, Dish, Ingredient, Step, Schedule, Finding (constat), ShoppingList
  ai/            client Claude, prompts, cycle proposer → vérifier → corriger, modification du menu courant
  rules/         tables et contrôles : conservation, équilibre, quantités, exclusions
  season/        table et contrôle de saison
  equipment/     descriptions des appareils
  scheduling/    construction et vérification du planning
  ingredients/   référentiel, normalisation, liste de courses
  pricing/       sources de prix et estimation
  pdf/           génération du PDF d'un menu validé
  ports/         interfaces : stockage, HTTP, horloge, secrets
  node/          implémentations Node des ports et commandes de développement (seul dossier, avec les tests, où Node est permis)
apps/desktop/    Tauri + React : écrans et implémentations des ports
docs/research/   sources des règles (cuisine-addict, mangerbouger, prix)
```
Les règles d'écriture de `core` (frontière du code pur, globales permises, heure par le port `Clock`) sont dans `docs/conventions-core.md`. Chaque module de `core` se teste seul. Les identifiants de code sont en anglais ; les textes affichés, le PDF et les docs sont en français.

## 11. Laissé au builder
- Le découpage des prompts et le format exact des sorties structurées.
- Le moteur de PDF, à condition qu'il fonctionne dans `core` sans Tauri (par exemple `@react-pdf/renderer` ou `pdfmake`).
- Le contenu de départ du référentiel et des tables de conservation, tiré des fichiers de recherche.
- La présentation de l'interface.
