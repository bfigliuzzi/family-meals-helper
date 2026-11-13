# Roadmap : lots livrables

Ce fichier découpe la conception (`docs/superpowers/specs/2026-11-12-family-meals-helper-design.md`) en lots. Chaque lot se livre via `/nico-build-plan`, un lot à la fois, dans l'ordre. La conception reste la source de vérité ; un lot y renvoie par numéro de section plutôt que de la recopier.

Chaque lot se termine sur un **livrable vérifiable** : une commande dont le résultat montre que le lot marche. Quand un lot est livré, son statut passe à `livré` avec la date et le commit.

Le premier objectif d'usage est le **tracer** (un menu réel produit de bout en bout) : à la fin du lot 4, l'utilisateur peut déjà préparer un batch cook en ligne de commande. Les lots 5 à 7 y ajoutent l'app desktop puis les prix.

| Lot | Titre | Dépend de | Statut |
|---|---|---|---|
| 0 | Socle du monorepo | — | `livré` (2026-11-13, `baebfc7`) |
| 1 | Tracer : composition IA en ligne de commande | 0 | `livré` (2026-11-13, `7dc9b43` et `ebe6cd1`) |
| 2 | Conservation, équilibre et quantités | 1 | à faire |
| 3 | Équipement et planning de session | 1 | à faire |
| 4 | Détail, liste de courses et PDF | 2, 3 | à faire |
| 5 | App desktop : coquille, réglages, persistance | 4 | à faire |
| 6 | App desktop : session, ingrédients, historique | 5 | à faire |
| 7 | Prix | 4 (affichage dans l'app : 6) | à faire |

---

## Lot 0 : socle du monorepo

**Statut** : `livré` le 2026-11-13, commit `baebfc7` (branche `lot-0-socle`), CI GitHub verte.

**Objectif** : un dépôt où chaque lot suivant ajoute du code sans toucher à l'outillage.

**Contenu**
- Monorepo pnpm : `packages/core`, `apps/desktop`. Versions figées : Node 24.22.3 (`.node-version`), pnpm 12.18.0 (`packageManager`), Rust 1.100.0 (`rust-toolchain.toml`).
- TypeScript strict, ESLint, Prettier, Vitest dans `core`.
- Une garde ESLint du code pur de `core` (pas de Node, de Tauri, de React, d'horloge ni de globales hors liste dans le code pur) ; le code Node vit dans `packages/core/src/node/`. Les règles d'écriture sont dans `docs/conventions-core.md`.
- `apps/desktop` : Tauri 2 + React + Vite, qui ouvre une fenêtre affichant une valeur importée de `core` (preuve que le lien entre les deux marche).
- Scripts racine : `pnpm lint`, `pnpm format:check`, `pnpm typecheck`, `pnpm test`, `pnpm build`. `pnpm build` ne lance aucun Rust (`tsc` puis Vite).
- Une CI GitHub Actions (Ubuntu, sans Rust) qui lance ces scripts, sur le remote https://github.com/bfigliuzzi/family-meals-helper.

**Livrable vérifiable** : `pnpm install --frozen-lockfile && pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm build` passe ; `pnpm --filter desktop tauri dev` ouvre la fenêtre.

**Bilan de validation du livrable**
- Vérifié : `pnpm --filter desktop tauri dev` a ouvert la fenêtre « Family Meals Helper », avec le texte venu de `core`. Une capture de la fenêtre seule a été regardée par l'exécutant puis par un relecteur. La capture n'est pas conservée dans le dépôt.
- Construit mais non vérifié : `pnpm --filter desktop tauri build --bundles app` a produit un `.app`. Il n'est pas signé et n'a jamais été ouvert.

**Ce que ça ne fera PAS (visible)** : aucune fonction métier ; la fenêtre n'affiche qu'un texte de contrôle.

**Reliquats du lot 0** (dettes connues, chacune reprise dans le lot qui doit la traiter) :
- **CSP désactivée** (`"csp": null` dans `apps/desktop/src-tauri/tauri.conf.json`) et **permissions `core:default` trop larges** (`capabilities/default.json`) : à traiter au lot 5, qui réécrit les permissions pour SQLite, le trousseau et HTTP.
- **Pas de vérification Rust en CI** : décision de cadrage, le Rust ne contient que de la configuration. À revoir au lot 5, quand le Rust fera plus que cela.
- **Arrêt de `tauri dev`** : pnpm 12 place chaque script dans son propre groupe de processus, donc arrêter `pnpm --filter desktop tauri dev` peut laisser Vite ou l'app tourner. Les plans des lots qui relancent `tauri dev` (5 et 6) vérifient après l'arrêt que le port 1420 est libre (`lsof -nP -iTCP:1420 -sTCP:LISTEN`) et que l'app ne tourne plus.
- **Types Node visibles dans tout `core`** : `tsconfig.json` les charge explicitement, ce choix vient notamment du SDK Anthropic (lot 1). La frontière du code pur tient par ESLint seulement, pas par TypeScript. Un second programme TypeScript sans types Node avait été essayé puis supprimé (voir `docs/conventions-core.md`, §7).
- **Contournements délibérés non couverts** (`as`, `Reflect.get`, dépendance qui accède à l'extérieur) et lectures implicites résiduelles (`Math.random()`, fuseau par défaut d'`Intl`, `format(at)` avec `at` à `undefined`) : dette assumée, jugée en relecture. Le principe d'arrêt est dans `docs/conventions-core.md`, §6.

## Lot 1 : tracer, composition IA en ligne de commande

**Statut** : `livré` le 2026-11-13, commits `7dc9b43` (le lot) et `ebe6cd1` (ail, oignon, échalote et citron exemptés du contrôle de saison), branche `lot-1-tracer`, CI GitHub verte sur les deux.

**Objectif** : prouver la chaîne demande → IA → vérification → correction sur un vrai appel à Claude, avec les règles bloquantes les plus simples.

**Contenu** (conception §2, §5.1, §5.2, §6.5, §7)
- `domain/` : schémas Zod de Menu, Plat, Ingrédient (avec forme) ; le Constat est une interface TypeScript sans schéma Zod, car il n'est jamais lu depuis l'extérieur.
- `ports/` : `HttpClient`, `Clock`, `SecretStore`. Une implémentation Node pour la ligne de commande, dans `packages/core/src/node/`.
- `ingredients/` : référentiel de départ (une centaine d'ingrédients courants) avec synonymes, catégorie détaillée, rayon, forme, drapeau `placard`.
- `season/` : table de saison France par mois (§6.5 : vérifier d'abord l'API ADEME).
- `rules/` : contrôle des exclusions et de la saison, qui produit des constats.
- `ai/` : client Claude via le port HTTP, prompt système avec le texte des règles cuisine-addict de composition (§6.1) en prompt caching, sortie structurée validée par Zod, cycle proposer → vérifier → corriger (3 essais).
- Une commande de développement, dans `packages/core/src/node/` et déclarée dans le `package.json` de `core` : `pnpm --filter core compose "<demande>" [--exclude courgette] [--month 11]`, qui affiche le menu et ses constats.

**Livrable vérifiable**
- Tests Vitest des contrôles exclusions et saison, sans appel réseau.
- Un test du cycle de correction avec un faux client IA qui renvoie d'abord un menu fautif.
- Une démonstration réelle : `compose "un bœuf bourguignon, 5 dîners" --exclude courgette` renvoie un menu sans courgette et sans légume hors saison.

**Ce que ça ne fera PAS (visible)** : pas de conservation, d'équilibre ni de planning ; pas de recettes détaillées ; pas d'interface ; pas de modification du menu courant (une demande = une composition).

**Contrat de code** : le lot 1 suit `docs/conventions-core.md` (code Node dans `src/node/`, accès extérieurs par les ports (le SDK reçoit un `fetch` adapté de `HttpClient`, les fonctions métier une date fournie par `Clock`), pas de `globalThis` ni de `console` dans le code pur, `Parameters<typeof globalThis.fetch>[1]` pour les types de requête, pas de `format()` sans argument, `z.prettifyError` pour les erreurs zod). Le SDK Anthropic vit dans `packages/core/src/ai/`.

**Pour le décideur** : la clé d'API est lue depuis la variable d'environnement `ANTHROPIC_API_KEY` dans l'implémentation Node de `SecretStore`. Pour une démonstration réelle, la clé de l'utilisateur est une clé Mammouth, lue depuis l'environnement ; il faut aussi `ANTHROPIC_BASE_URL=https://api.mammouth.ai` et `ANTHROPIC_MODEL=claude-sonnet-5-5`.

**Bilan de validation du livrable**
- Vérifié sans appel réel : tests Vitest des contrôles (exclusions avec groupes et ingrédients inconnus, saison avec les négations de la demande, forme du menu), du cycle de correction avec un faux client IA (premier menu fautif, puis menu correct ; réponse coupée, refus, erreur réseau qui garde le premier menu), du client Anthropic avec un faux `HttpClient` (URL, en-tête `Authorization: Bearer`, corps, une seule requête sur une erreur 500). `compose --dry-run` affiche les prompts sans réseau ni clé ; sans clé, `compose` s'arrête avec le code 2 avant tout appel.
- Négation et repérage (invariants N et E2 des corrections du cycle 4) : la négation ne sert qu'à décider si un ingrédient est « demandé » (exemption de saison), avec une portée qui va du premier marqueur négatif jusqu'à la fin de la phrase, parenthèses comprises ; le nom du plat est contrôlé en entier, sans analyse de négation.
- Vérifié avec un appel réel, le 2026-11-13, à travers le proxy Mammouth (`ANTHROPIC_BASE_URL=https://api.mammouth.ai`, `ANTHROPIC_MODEL=claude-sonnet-5-5`) :
  - **Sonde** : `POST /v1/messages` avec `{}` renvoie HTTP 400 « anthropic_messages: Invalid model name… ». La route existe et la clé passe ; rien n'a été dépensé.
  - **Fumée** (`pnpm --filter core smoke`) : code 0, texte `{"dishes":[]}`. Jetons : entrée hors cache 29, lus en cache 0, écrits en cache 2499, sortie 11.
  - **Démo** `compose "un bœuf bourguignon, 5 dîners" --exclude courgette` : code 0 au premier essai, en 1 appel. 5 plats sur 5 jours, aucune courgette, aucun constat. Jetons d'entrée 2703 (hors cache 204, lus en cache 2499, écrits en cache 0), jetons de sortie 3350. Sortie, sans la clé :

    ```text
    Modèle : claude-sonnet-5-5 · URL : https://api.mammouth.ai · essais au plus : 3 · désactivé : aucun
    Essai 1 sur 3 : vérification…
    Menu pour novembre (essai 1 sur 3)

    a. Bœuf bourguignon aux carottes (lundi)
       bœuf à braiser 800 g · carotte 500 g · oignon 2 pièces · champignon de Paris 250 g · lardons 150 g · vin rouge 500 ml · concentré de tomate 30 g · farine 30 g · ail 2 pièces · thym 2 g · laurier 2 pièces · pomme de terre 600 g
    b. Gratin de poireaux au jambon (mardi)
       poireau 800 g · jambon blanc 200 g · lait 300 ml · farine 30 g · beurre 30 g · muscade 1 g
       Le soir même : crème liquide 100 ml · emmental râpé 80 g
    c. Soupe de lentilles corail et carottes (mercredi)
       lentilles corail 250 g · carotte 500 g · oignon 1 pièce · bouillon de légumes 1000 ml (frais) · cumin 3 g · huile d'olive 20 ml
       Le soir même : pain 200 g (frais)
    d. Saucisses aux lentilles vertes, carottes et poireaux (jeudi)
       saucisse 600 g · lentilles vertes 250 g · carotte 300 g · poireau 300 g · oignon 1 pièce · bouillon de volaille 600 ml (frais) · moutarde 20 g · thym 2 g
    e. Curry de pois chiches, carottes et poireaux (vendredi)
       pois chiche 480 g · carotte 400 g · poireau 300 g · tomate concassée 400 g · lait de coco 400 ml · curry 10 g · gingembre 15 g · oignon 1 pièce
       Le soir même : riz basmati 300 g

    Constats : aucun
    Contrôle de saison partiel, non vérifiés : champignon de Paris
    À confirmer (absents du référentiel) : vin rouge (autre)
    Appels à l'IA : 1 · jetons d'entrée : 2703 (hors cache 204, lus en cache 2499, écrits en cache 0) · jetons de sortie : 3350
    ```
  - **Coût** : 0,0064 $ au total pour la fumée et la démo, relevé sur `GET /key/info` de Mammouth.
  - **Conclusion** : Mammouth accepte l'API Messages, la sortie structurée, `effort` et le cache de prompt (2499 jetons écrits par la fumée, relus par la démo). Aucun `FMH_DISABLE` n'a été nécessaire.

**Reliquats du lot 1** (dettes connues, chacune reprise dans le lot qui doit la traiter) :
- **`ai/` n'est pas réexporté par `src/index.ts`** : l'app desktop n'a pas besoin du SDK dans son bundle. Le lot 5 ou 6 décidera comment l'app y accède.
- **Dette `ANTHROPIC_CUSTOM_HEADERS`** : le constructeur du SDK Anthropic lit toujours cette variable, aucune option ne l'empêche (voir `docs/conventions-core.md`, §2).
- **`FMH_DISABLE`** (`format`, `effort`, `cache`) : prévu pour un proxy qui refuse une de ces fonctions. Mammouth les accepte toutes (démo du 2026-11-13) ; la variable reste disponible pour un autre proxy.
- **Pas de repli automatique** sur un autre modèle en cas de refus (`fallbacks`).
- **Contrôle de saison partiel** : `champignon de Paris` et `patate douce` n'ont pas de ligne dans la table (voir `docs/research/saison-fruits-legumes.md`) ; un ingrédient absent du référentiel est contrôlé à travers les fruits et légumes connus que cite son nom ; s'il n'en cite aucun, il est listé « non vérifié ». La sortie de `compose` le dit.
- **Corrections du cycle 1 de relecture** appliquées : clé expurgée des erreurs ; `ANTHROPIC_BASE_URL` en `https://` obligatoire ; exclusions par groupe de catégorie (`CATEGORY_GROUPS`), par mot-groupe et sur le nom du plat ; saison contrôlée sur la forme reçue et sur les fruits et légumes cités dans un nom inconnu ; nombre de dîners : le plus grand nombre de « dîners » cité ; plafond de 3 essais dans le moteur ; compteur d'appels en échec ; endive corrigée à la main (mangerbouger), alias du céleri branche retiré.
- **Rejeté ou reporté** :
  - Objets Zod stricts (rejeté) : avec le format imposé, le schéma JSON interdit déjà les champs en trop ; sans lui, un champ en trop est ignoré et jamais affiché.
  - Faux rattachements de la normalisation (reporté au lot 2) : « maïs » et le mot « mais » donnent la même clé ; `find("pâté")` renvoie `pâtes` ; `--exclude pâtes` exclut « pâte à pizza ». Effet actuel : un « mais » dans la demande compte comme une demande de maïs, ce qui l'exempte du contrôle de saison.
  - Groupes reconnus dans la demande (reporté) : « une soupe de courge » ne vaut pas demande pour le potiron ; « un plat pas cher avec des courgettes » coupe la demande (choix prudent : au pire un constat de trop).
  - Exclure une variante exclut toute l'entrée (`--exclude "tomate cerise"` exclut toutes les tomates) : voulu, dans le sens prudent.
  - Faux rattachements de la normalisation et noms de plats (reporté au lot 2) : avec le contrôle du nom du plat, `--exclude pâtes` signale aussi « Pâté chinois ». Il reste reporté avec « mais » / maïs et « pâté » / pâtes.
  - Noms composés frais (accepté) : « sauce tomate », reçue en `fresh` en novembre, déclenche le contrôle de saison sur la tomate qu'elle contient. L'IA corrige en passant à `canned`, au prix d'un essai ; sens prudent. « jus de citron » n'est plus concerné : le citron est exempté (conception §6.5).
  - `redact` masque un mot ordinaire long après « Bearer » (« Bearer authentication failed » devient « Bearer [clé masquée] failed ») : le texte perd un mot, rien ne fuit. Comportement prudent gardé ; à revoir si un vrai message de proxy le montre.
  - Nom du plat (faux positif voulu) : « Chili sans viande » avec `--exclude viande` donne un constat, car la négation n'est plus analysée dans les noms de plats. Le prompt demande à l'IA de ne pas écrire ce genre de nom ; au pire, un essai de plus.
  - Exemption de saison : un ingrédient voulu qui suit une négation dans la même phrase (« sans tomate, avec des courgettes ») n'est pas compté comme demandé. C'est le sens prudent : au pire un constat de saison, que l'IA corrige.
  - `redact` : un jeton partiel sous une forme rare (`Bearer \"…\"` échappé en JSON, `Bearer: …`, `Bearer%20…`) n'est pas masqué. La clé exacte, elle, l'est toujours. À revoir si un vrai message d'un proxy montre une de ces formes.
  - Plafond de 2 $ par mois : hors du code ; suivi par `GET https://api.mammouth.ai/key/info` (orchestrateur). Après la fumée et la démo du lot 1 : 0,0064 $.
  - Autres valeurs de saison de l'ADEME (orange absente en décembre) : pas corrigées au cas par cas. L'oignon et l'échalote, qui en faisaient partie, sont désormais exemptés (conception §6.5).
- **`pnpm --filter core compose` renvoie le code 1 quand la commande échoue** : pnpm remplace le code de sortie de `node` (2) par 1. Le code 0/1/2 de la conception du lot vaut pour `node src/node/compose.ts` lancé directement.

## Lot 2 : conservation, équilibre et quantités

**Objectif** : tous les contrôles de contenu du menu, bloquants et souples.

**Contenu** (conception §6.1, §6.2, §6.3, §6.6, §7)
- Tables de conservation tirées de `docs/research/cuisine-addict-regles.md` (durée la plus courte en cas de conflit), aliments qui ne se congèlent pas, aliments qui ne se réchauffent pas.
- Déduction du type d'un plat à partir des catégories de ses ingrédients.
- Contrôles : conservation et ordre des jours, marquage « à congeler », équilibre mangerbouger (seuils revérifiés sur le site), poisson, fourchettes de quantités, plafond de budget en `warning`.
- Distinction `error` / `warning` dans le cycle de correction (§5.2 étape 3), et priorité de la demande explicite sur les règles souples (§5.1).
- Le prompt système intègre les règles d'équilibre et de conservation.

**Livrable vérifiable** : un test par règle, avec un menu-fixture qui la viole et un qui la respecte ; `compose` affiche les constats `warning` et les plats à congeler.

**Ce que ça ne fera PAS (visible)** : pas de planning ni de durée de session.

## Lot 3 : équipement et planning de session

**Objectif** : calculer la durée réelle d'une session et refuser ce qui ne tient pas dans la cuisine ou dans 3 h.

**Contenu** (conception §3.2, §6.4)
- `equipment/` : un fichier de données par appareil (appareils toujours disponibles et d'appoint, nombre de cuissons simultanées, usages).
- `scheduling/` : construction du planning à partir d'étapes (dépendances, appareil, présence de l'utilisateur), contrôle des emplacements par appareil, une tâche manuelle à la fois, un appareil d'appoint au plus, 3 h au maximum.
- L'IA fournit les grandes phases de chaque plat dès la proposition ; `compose` affiche la durée calculée.

**Livrable vérifiable** : tests du planificateur sur des cas construits à la main (four saturé, deux appareils d'appoint, dépassement de 3 h, cas qui tient en 2 h 15) ; `compose` affiche une durée de session.

**Ce que ça ne fera PAS (visible)** : pas d'étapes détaillées, seulement les grandes phases.

## Lot 4 : détail, liste de courses et PDF

**Objectif** : fermer le tracer. Un menu validé donne une fiche PDF utilisable en cuisine.

**Contenu** (conception §5.4, §7, §9)
- Rédaction du détail par l'IA après validation : recettes, étapes détaillées, ce qu'il reste à faire chaque soir ; replanification et correction si le planning dépasse 3 h.
- Liste de courses : somme par ingrédient, conversion en unités d'achat, rayons, répartition entre plats, section placard.
- `pdf/` : génération du PDF dans `core` (moteur au choix, §11), avec les six parties de §9.
- Une commande : `pnpm --filter core batch "<demande>" --out menu.pdf`, qui enchaîne composition, validation automatique, détail et PDF.

**Livrable vérifiable** : tests de la liste de courses (somme, arrondis, placard) ; un PDF généré depuis un menu-fixture sans appel réseau, contrôlé à l'œil par l'utilisateur ; une démonstration réelle de `batch`.

**Ce que ça ne fera PAS (visible)** : pas de conversation (le menu est validé tel quel) ; pas de prix dans le PDF.

## Lot 5 : app desktop, coquille, réglages et persistance

**Objectif** : l'app desktop existe, garde ses données et ses secrets.

**Contenu** (conception §3, §9 Réglages, §10)
- Implémentations Tauri des ports : SQLite (plugin officiel), trousseau macOS pour la clé d'API, plugin HTTP.
- Stockage des réglages : exclusions avec raison, équipement disponible, modèle Claude.
- Écran Réglages et navigation entre les quatre écrans (vides pour Nouvelle session, Ingrédients, Historique).
- Une interface sobre et soignée ; le choix du système de composants est à trancher avant ce lot (voir « Questions ouvertes »).
- Reliquats du lot 0 à traiter ici : CSP (`"csp": null`) et permissions `core:default` remplacées par des permissions minimales ; décider d'une vérification Rust en CI (lot 0, « Reliquats »).
- Si le plan relance `tauri dev` : vérifier après l'arrêt que le port 1420 est libre et que l'app ne tourne plus (pnpm 12, un groupe de processus par script).

**Livrable vérifiable** : tests des implémentations de ports qui le permettent ; l'app lancée enregistre une exclusion et la clé, puis les retrouve après redémarrage.

**Ce que ça ne fera PAS (visible)** : pas encore de composition dans l'app.

## Lot 6 : app desktop, session, ingrédients et historique

**Objectif** : le parcours complet dans l'app.

**Contenu** (conception §5.2 à §5.4, §9)
- Écran Nouvelle session : conversation, menu courant à côté, « vérification en cours », constats et avertissements.
- Modification du menu courant (§5.3) : demandes ciblées, résumé de conversation, action « éviter cet ingrédient ».
- Validation, détail, export du PDF.
- Écran Ingrédients : liste par rayon avec cases à cocher (l'état coché est conservé).
- Historique des 5 derniers menus, transmis à l'IA, avec réouverture du PDF.
- Si le plan relance `tauri dev` : vérifier après l'arrêt que le port 1420 est libre et que l'app ne tourne plus (pnpm 12, un groupe de processus par script).

**Livrable vérifiable** : tests de la modification du menu courant avec un faux client IA ; dans l'app, l'utilisateur compose, modifie un plat, valide et obtient le PDF ; le menu apparaît dans l'historique.

**Ce que ça ne fera PAS (visible)** : pas de prix.

## Lot 7 : prix

**Objectif** : afficher un coût estimé par ligne et par menu.

**Contenu** (conception §8, `docs/research/sources-prix.md`)
- `pricing/` : table manuelle, INSEE, résumé Open Prices (téléchargement hebdomadaire en tâche de fond, lecture en flux, médiane par ingrédient du référentiel), ordre de priorité, source affichée.
- Affichage du coût dans le menu courant, la page Ingrédients (avec modification de la table manuelle) et le PDF ; mention de la licence ODbL.

**Livrable vérifiable** : tests de l'estimation sur un extrait de fichier Open Prices et un extrait du CSV INSEE ; dans l'app, un menu affiche un coût total et la source de chaque prix ; l'app reste utilisable sans données Open Prices.

**Ce que ça ne fera PAS (visible)** : pas de prix d'un magasin précis ; pas de comparaison entre enseignes.

---

## Questions ouvertes (à trancher avant le lot concerné)

- ~~**Avant le lot 0** : le remote git et la branche de travail ; le profil Codex du projet.~~ Tranché : remote GitHub public https://github.com/bfigliuzzi/family-meals-helper, une branche par lot (`lot-0-socle`) ; profil Codex `~/.codex/family-meals-helper.config.toml` en gpt-6.1-sol, effort high.
- **Avant le lot 5** : nico-build-plan suppose un Storybook (`packages/design-system`) et une procédure Claude Design pour tout composant d'interface. Ce projet n'en a pas : décider s'il en crée un, ou si les lots UI utilisent une bibliothèque de composants existante.
