# Roadmap : lots livrables

Ce fichier découpe la conception (`docs/superpowers/specs/2026-11-12-family-meals-helper-design.md`) en lots. Chaque lot se livre via `/nico-build-plan`, un lot à la fois, dans l'ordre. La conception reste la source de vérité ; un lot y renvoie par numéro de section plutôt que de la recopier.

Chaque lot se termine sur un **livrable vérifiable** : une commande dont le résultat montre que le lot marche. Quand un lot est livré, son statut passe à `livré` avec la date et le commit.

Le premier objectif d'usage est le **tracer** (un menu réel produit de bout en bout) : à la fin du lot 4, l'utilisateur peut déjà préparer un batch cook en ligne de commande. Les lots 5 à 7 y ajoutent l'app desktop puis les prix. Le lot 5 bis (signature de l'app) s'insère entre le 5 et le 6, sur décision de l'utilisateur du 2026-11-15.

| Lot | Titre | Dépend de | Statut |
|---|---|---|---|
| 0 | Socle du monorepo | — | `livré` (2026-11-13, `baebfc7`) |
| 1 | Tracer : composition IA en ligne de commande | 0 | `livré` (2026-11-13, `7dc9b43` et `ebe6cd1`) |
| 2 | Conservation, équilibre et quantités | 1 | `livré` (2026-11-13, `908c016` et `52960c8`) |
| 3 | Équipement et planning de session | 1 | `livré` (2026-11-13, `5b98d7b`) |
| 4 | Détail, liste de courses et PDF | 2, 3 | `livré` (2026-11-14, `ca72cc6`) ; démonstration réelle non faite |
| 5 | App desktop : coquille, réglages, persistance | 4 | `livré` (2026-11-15, `63f2bc7`) |
| 5 bis | Signature stable de l'app | 5 | `livré` (2026-11-16, `8bcf097`) |
| 6 | App desktop : session, ingrédients, historique | 5 bis | à faire |
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
- Une CI GitHub Actions (Ubuntu, sans Rust) qui lance ces scripts, sur le remote https://github.com/bfigliuzzi/family-meals-helper. *Depuis le lot 5 (2026-11-15), elle a aussi un job Rust sur macOS.*

**Livrable vérifiable** : `pnpm install --frozen-lockfile && pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm build` passe ; `pnpm --filter desktop tauri dev` ouvre la fenêtre.

**Bilan de validation du livrable**
- Vérifié : `pnpm --filter desktop tauri dev` a ouvert la fenêtre « Family Meals Helper », avec le texte venu de `core`. Une capture de la fenêtre seule a été regardée par l'exécutant puis par un relecteur. La capture n'est pas conservée dans le dépôt.
- Construit mais non vérifié : `pnpm --filter desktop tauri build --bundles app` a produit un `.app`. Il n'est pas signé et n'a jamais été ouvert.

**Ce que ça ne fera PAS (visible)** : aucune fonction métier ; la fenêtre n'affiche qu'un texte de contrôle.

**Reliquats du lot 0** (dettes connues, chacune reprise dans le lot qui doit la traiter) :
- **CSP désactivée** (`"csp": null` dans `apps/desktop/src-tauri/tauri.conf.json`) et **permissions `core:default` trop larges** (`capabilities/default.json`) : à traiter au lot 5, qui réécrit les permissions pour SQLite, le trousseau et HTTP. **Traité au lot 5 (2026-11-15, `63f2bc7`)** : CSP réelle, `core:default` retiré, la capability ne permet que les 5 commandes de l'app ; les contre-épreuves en console ont été faites sur un `.app` (voir « Bilan de validation » du lot 5). Les permissions ne portent finalement ni sur SQLite ni sur HTTP, qui n'ont plus de plugin.
- **Pas de vérification Rust en CI** : décision de cadrage, le Rust ne contient que de la configuration. À revoir au lot 5, quand le Rust fera plus que cela. **Traité au lot 5 (2026-11-15, `63f2bc7`)** : un job `rust` sur `macos-15` lance `cargo fmt --check`, `cargo clippy` et `cargo test`.
- **Arrêt de `tauri dev`** : pnpm 12 place chaque script dans son propre groupe de processus, donc arrêter `pnpm --filter desktop tauri dev` peut laisser Vite ou l'app tourner. Les plans des lots qui relancent `tauri dev` (5 et 6) vérifient après l'arrêt que le port 1420 est libre (`lsof -nP -iTCP:1420 -sTCP:LISTEN`) et que l'app ne tourne plus.
- **Types Node visibles dans tout `core`** : `tsconfig.json` les charge explicitement, ce choix vient notamment du SDK Anthropic (lot 1). La frontière du code pur tient par ESLint seulement, pas par TypeScript. Un second programme TypeScript sans types Node avait été essayé puis supprimé (voir `docs/conventions-core.md`, §7).
- **Contournements délibérés non couverts** (`as`, `Reflect.get`, dépendance qui accède à l'extérieur) et lectures implicites résiduelles (`Math.random()`, fuseau par défaut d'`Intl`, `format(at)` avec `at` à `undefined`) : dette assumée, jugée en relecture. Le principe d'arrêt est dans `docs/conventions-core.md`, §6.

## Lot 1 : tracer, composition IA en ligne de commande

**Statut** : `livré` le 2026-11-13, commits `7dc9b43` (le lot) et `ebe6cd1` (ail, oignon, échalote et citron exemptés du contrôle de saison), branche `lot-1-tracer`, CI GitHub verte sur les deux.

**Objectif** : prouver la chaîne demande → IA → vérification → correction sur un vrai appel à Claude, avec les règles bloquantes les plus simples.

**Contenu** (conception §2, §5.1, §5.2, §6.5, §7)
- `domain/` : schémas Zod de Menu, Plat, Ingrédient (avec forme) ; le Constat est une interface TypeScript sans schéma Zod, car il n'est jamais lu depuis l'extérieur.
- `ports/` : `HttpClient`, `Clock`, `SecretStore`. Une implémentation Node pour la ligne de commande, dans `packages/core/src/node/`.
- `ingredients/` : référentiel de départ (une centaine d'ingrédients courants) avec synonymes, catégorie détaillée, rayon, forme, drapeau `placard`. *Le rayon a été retiré au lot 4 (2026-11-14, courses en drive).*
- `season/` : table de saison France par mois (§6.5 : vérifier d'abord l'API ADEME).
- `rules/` : contrôle des exclusions et de la saison, qui produit des constats.
- `ai/` : client Claude via le port HTTP, prompt système avec le texte des règles cuisine-addict de composition (§6.1) en prompt caching, sortie structurée validée par Zod, cycle proposer → vérifier → corriger (3 essais).
- Une commande de développement, dans `packages/core/src/node/` et déclarée dans le `package.json` de `core` : `pnpm --filter core compose "<demande>" [--exclude courgette] [--month 11]`, qui affiche le menu et ses constats.

**Livrable vérifiable**
- Tests Vitest des contrôles exclusions et saison, sans appel réseau.
- Un test du cycle de correction avec un faux client IA qui renvoie d'abord un menu fautif.
- Une démonstration réelle : `compose "un bœuf bourguignon, 5 dîners" --exclude courgette` renvoie un menu sans courgette et sans légume hors saison.

**Ce que ça ne fera PAS (visible)** : pas de conservation, d'équilibre ni de planning (ces lots sont livrés depuis, voir les lots 2 et 3) ; pas de recettes détaillées ; pas d'interface ; pas de modification du menu courant (une demande = une composition).

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
- **`ai/` n'est pas réexporté par `src/index.ts`** : l'app desktop n'a pas besoin du SDK dans son bundle. Le lot 5 ou 6 décidera comment l'app y accède. **Précisé le 2026-11-15 (lot 5)** : le lot 5 n'appelle pas Claude et n'importe pas `ai/`. L'appel passera par une commande Rust qui ajoute la clé (lot 6) ; l'emplacement du SDK reste à décider dans le plan du lot 6, et `ai/` ne sera réexporté que si la vue web garde le SDK. **Précisé le 2026-11-16 (lot 6.4)** : `core` exporte la session et ses aides d'affichage (`session/`, `MenuReplySchema`, `RULE_LABELS`, `describeIngredient`, `printable`) sans le SDK ; `platform/services.ts` charge `platform/ai-model.ts` par `import()` au premier appel ; c'est ce module qui importe `core/ai`, dans un morceau JS à part.
- **Dette `ANTHROPIC_CUSTOM_HEADERS`** : le constructeur du SDK Anthropic lit toujours cette variable, aucune option ne l'empêche (voir `docs/conventions-core.md`, §2).
- **`FMH_DISABLE`** (`format`, `effort`, `cache`) : prévu pour un proxy qui refuse une de ces fonctions. Mammouth les accepte toutes (démo du 2026-11-13) ; la variable reste disponible pour un autre proxy.
- **Pas de repli automatique** sur un autre modèle en cas de refus (`fallbacks`).
- **Contrôle de saison partiel** : `champignon de Paris` et `patate douce` n'ont pas de ligne dans la table (voir `docs/research/saison-fruits-legumes.md`) ; un ingrédient absent du référentiel est contrôlé à travers les fruits et légumes connus que cite son nom ; s'il n'en cite aucun, il est listé « non vérifié ». La sortie de `compose` le dit.
- **Corrections du cycle 1 de relecture** appliquées : clé expurgée des erreurs ; `ANTHROPIC_BASE_URL` en `https://` obligatoire ; exclusions par groupe de catégorie (`CATEGORY_GROUPS`), par mot-groupe et sur le nom du plat ; saison contrôlée sur la forme reçue et sur les fruits et légumes cités dans un nom inconnu ; nombre de dîners : le plus grand nombre de « dîners » cité ; plafond de 3 essais dans le moteur ; compteur d'appels en échec ; endive corrigée à la main (mangerbouger), alias du céleri branche retiré.
- **Rejeté ou reporté** :
  - Objets Zod stricts (rejeté) : avec le format imposé, le schéma JSON interdit déjà les champs en trop ; sans lui, un champ en trop est ignoré et jamais affiché.
  - Faux rattachements de la normalisation (reporté au lot 2) : « maïs » et le mot « mais » donnent la même clé ; `find("pâté")` renvoie `pâtes` ; `--exclude pâtes` exclut « pâte à pizza ». Effet actuel : un « mais » dans la demande compte comme une demande de maïs, ce qui l'exempte du contrôle de saison. **Traité au lot 2** (livré le 2026-11-13, `52960c8`) : le mot « mais » est retiré de la demande avant la lecture des ingrédients demandés, et `pâtes` garde son `s` (`PLURAL_KEPT`), donc `find("pâté")` et `find("pâte à pizza")` ne renvoient plus `pâtes`. Il reste des limites, voir « Reliquats du lot 2 ».
  - Groupes reconnus dans la demande (reporté) : « une soupe de courge » ne vaut pas demande pour le potiron ; « un plat pas cher avec des courgettes » coupe la demande (choix prudent : au pire un constat de trop).
  - Exclure une variante exclut toute l'entrée (`--exclude "tomate cerise"` exclut toutes les tomates) : voulu, dans le sens prudent.
  - Faux rattachements de la normalisation et noms de plats (reporté au lot 2) : avec le contrôle du nom du plat, `--exclude pâtes` signale aussi « Pâté chinois ». Il reste reporté avec « mais » / maïs et « pâté » / pâtes. **Traité au lot 2** : « Pâté chinois » n'est plus signalé par `--exclude pâtes` (test dans `check-exclusions.test.ts`).
  - Noms composés frais (accepté) : « sauce tomate », reçue en `fresh` en novembre, déclenche le contrôle de saison sur la tomate qu'elle contient. L'IA corrige en passant à `canned`, au prix d'un essai ; sens prudent. « jus de citron » n'est plus concerné : le citron est exempté (conception §6.5).
  - `redact` masque un mot ordinaire long après « Bearer » (« Bearer authentication failed » devient « Bearer [clé masquée] failed ») : le texte perd un mot, rien ne fuit. Comportement prudent gardé ; à revoir si un vrai message de proxy le montre.
  - Nom du plat (faux positif voulu) : « Chili sans viande » avec `--exclude viande` donne un constat, car la négation n'est plus analysée dans les noms de plats. Le prompt demande à l'IA de ne pas écrire ce genre de nom ; au pire, un essai de plus.
  - Exemption de saison : un ingrédient voulu qui suit une négation dans la même phrase (« sans tomate, avec des courgettes ») n'est pas compté comme demandé. C'est le sens prudent : au pire un constat de saison, que l'IA corrige.
  - `redact` : un jeton partiel sous une forme rare (`Bearer \"…\"` échappé en JSON, `Bearer: …`, `Bearer%20…`) n'est pas masqué. La clé exacte, elle, l'est toujours. À revoir si un vrai message d'un proxy montre une de ces formes.
  - Plafond de 2 $ par mois : hors du code ; suivi par `GET https://api.mammouth.ai/key/info` (orchestrateur). Après la fumée et la démo du lot 1 : 0,0064 $.
  - Autres valeurs de saison de l'ADEME (orange absente en décembre) : pas corrigées au cas par cas. L'oignon et l'échalote, qui en faisaient partie, sont désormais exemptés (conception §6.5).
- **`pnpm --filter core compose` renvoie le code 1 quand la commande échoue** : pnpm remplace le code de sortie de `node` (2) par 1. Le code 0/1/2 de la conception du lot vaut pour `node src/node/compose.ts` lancé directement.

## Lot 2 : conservation, équilibre et quantités

**Statut** : `livré` le 2026-11-13, commits `908c016` (citations mangerbouger vérifiées et calendrier de saison, dans `docs/research`) et `52960c8` (le lot), branche `lot-2-conservation-equilibre`, CI GitHub verte sur `52960c8`.

**Objectif** : tous les contrôles de contenu du menu, bloquants et souples.

**Contenu** (conception §6.1, §6.2, §6.3, §6.6, §7)
- Tables de conservation tirées de `docs/research/cuisine-addict-regles.md` (durée la plus courte en cas de conflit), aliments qui ne se congèlent pas, aliments qui ne se réchauffent pas.
- Déduction du type d'un plat à partir des catégories de ses ingrédients.
- Contrôles : conservation et ordre des jours, marquage « à congeler », équilibre mangerbouger (seuils revérifiés sur le site), poisson, fourchettes de quantités, plafond de budget en `warning` (reporté au lot 7, voir plus bas).
- Distinction `error` / `warning` dans le cycle de correction (§5.2 étape 3), et priorité de la demande explicite sur les règles souples (§5.1) (obtenue par le prompt seul, voir plus bas).
- Le prompt système intègre les règles d'équilibre et de conservation.

**Ce qui a changé en cours de lot** (décisions de l'utilisateur, 2026-11-13 ; le contenu ci-dessus est le contenu prévu)
- **Budget reporté au lot 7** : aucun constat de budget au lot 2.
- **Session le dimanche par défaut**, option `--session-day` (vendredi, samedi, dimanche, lundi). Les jours écoulés entre la session et chaque dîner (dimanche : lundi 1 … vendredi 5) décident de la conservation.
- **Seuils par adulte** = quantité du menu divisée par 4 portions. Les seuils mangerbouger (500 g de viande hors volaille, 150 g de charcuterie) viennent des citations exactes que l'utilisateur a relues.
- **Poisson seulement surgelé ou en conserve**, jamais frais (constat `error` de la règle `fish`), et **pas de constat « menu sans poisson »** : le foyer en mange peu. Écart voulu avec la conception §6.3 (note datée dans la conception). Le thon est accepté ; sardine et maquereau, que le foyer n'aime pas, passent par `--exclude`, pas par le code. Les poissons du référentiel (`saumon`, `maquereau`, `cabillaud`, `colin`) sont en forme par défaut `frozen`, rayon surgelés. *Les rayons ont été retirés du référentiel au lot 4 (2026-11-14) : seule la forme par défaut `frozen` reste.*
- **Pommes de terre préparées d'avance : 2 jours** au frigo.
- **Table de saison = union** des mois ADEME et des mois du calendrier mangerbouger (`packages/core/src/season/manual-months.ts`) : une ligne mangerbouger ajoute des mois, elle n'en retire jamais. Carotte et chou rouge sont donc de saison toute l'année, l'endive retrouve mai.
- **Plat demandé protégé par le prompt seul** (§5.1). Le code ne devine pas quel plat la demande nomme. Tout constat de plafond (`meat`, `cured-meat`) ou de `same-protein` est renvoyé une fois à l'IA, avec la phrase « Si la demande nomme un de ces plats, garde-le et ajuste les autres. ». Si l'IA retire quand même le plat demandé, rien ne le signale : la vraie garantie (épingler un plat dans l'app) est au lot 6.
- Une première version détectait le plat demandé dans le code (règle `requested`, drapeau `fromRequest`). Elle a été **supprimée** avant le commit : elle produisait des régressions à chaque relecture. Elle ne vaut plus et n'existe pas dans le dépôt.

**Livrable vérifiable** : un test par règle, avec un menu-fixture qui la viole et un qui la respecte ; `compose` affiche les constats `warning` et les plats à congeler.

**Bilan de validation du livrable**
- Vérifié sans appel réel : 336 tests Vitest (23 fichiers) passent en local et en CI.
  - Un test par règle (`conservation`, `day-order`, `reheat`, `fish`, `vegetables`, `pulses`, `meat`, `cured-meat`, `same-protein`, `whole-starch`, `quantity`), avec un menu qui la viole et un qui la respecte (`check-conservation.test.ts`, `check-balance.test.ts`, `check-quantities.test.ts`).
  - Cycle de correction avec un faux client IA : un `warning` n'est renvoyé qu'une fois par règle, `bestOf` compare les erreurs puis les `warning`, un plafond dépassé par un plat de la demande est renvoyé avec la phrase de §5.1 (`compose.test.ts`).
  - `compose --dry-run` affiche les prompts avec le jour de session, sans réseau ni clé.
  - Le rendu de `compose` (« À congeler » avec la consigne de décongélation, durée au frigo de chaque plat, constats triés `error` puis `warning`, forme du poisson toujours affichée) est vérifié par test sans réseau (`render.test.ts`).
- **Aucune démonstration réelle avec l'IA dans ce lot**, par décision. On ne sait donc pas encore si le modèle respecte les nouvelles consignes du prompt (grammes obligatoires pour la viande, le poisson et la charcuterie ; poisson surgelé ; `sameDay`) ni combien d'essais il faut. Le prompt système est plus long (il reste en cache). La première démonstration réelle viendra avec un lot suivant.

**Ce que ça ne fera PAS (visible)**
- Pas de planning ni de durée de session (lot 3). **Livré au lot 3 (2026-11-13)** : ne vaut plus.
- Pas de plafond de budget : reporté au lot 7.
- Pas de constat « menu sans poisson » ni de poisson gras demandé : décision de l'utilisateur.
- Sardine et maquereau ne sont pas exclus par `core` : il faut `--exclude sardine --exclude maquereau` (réglages d'exclusions au lot 5).
- Pas de contrôle de la durée de cuisson du poisson (« 15 minutes au plus ») : pas de durées avant le lot 3. Le prompt la demande. **Depuis le lot 3 (2026-11-13), il y a des durées de phases, mais ce contrôle n'existe toujours pas** (voir « Ce que ça ne fera PAS » du lot 3).
- Pas de mode de cuisson : une omelette ou des pommes de terre à l'eau marquées « préparées d'avance » sont traitées comme une préparation aux œufs ou une purée ; seul le prompt les envoie au soir même.
- Pas de consignes de sécurité complètes (2 h à température ambiante, refroidir avant le frigo) dans `compose` : elles iront dans le PDF (lot 4). **Livré au lot 4 (2026-11-14)** : la fiche porte une note de sécurité. La consigne de congélation dit « après refroidissement rapide » et « ne pas recongeler ».
- Pas de durée par type de plat (soupe 5 j, quiche) : la durée vient des catégories des ingrédients.
- Pas de sous vide ni de consigne de décongélation propre à un plat.
- Ordre des jours partiel : la proposition vient d'un tri par fragilité ; elle ne trouve pas toujours le meilleur ordre, mais n'ajoute jamais d'erreur.
- Pas de fourchette de quantité pour la charcuterie, les œufs, le fromage, les matières grasses ; un légume en pièces n'est pas contrôlé en quantité.
- Pas de seuils enfants, ni de plafond de sel ou de matières grasses.
- `sameDay` est cru sur parole : un mijoté marqué `sameDay` échappe à la conservation.
- Plat demandé : priorité par le prompt seul (voir plus haut) ; si l'IA le retire, rien ne le signale avant le lot 6.
- Une règle souple a un seul essai de correction par règle, pas par plat.

**Reliquats du lot 2** (dettes connues, chacune reprise dans le lot qui doit la traiter, ou laissée en l'état si c'est un choix prudent) :
- **Phrase de congélation des pâtes écrite en dur** : la chaîne `pastaException` dans `conservationPromptLines` (`packages/core/src/rules/conservation-table.ts`), et le message du constat `reheat` (`check-conservation.ts`), énumèrent « gratin, lasagnes, cannelloni » à la main au lieu de la tirer de `PASTA_DISH_WORDS`. Une autre phrase du prompt, `PASTA_SESSION_EXCEPTION_FR`, est déjà générée depuis cette liste. Changer la liste sans changer ces phrases ferait diverger le prompt du contrôle. Dette de code, à traiter dès qu'on touche à ces fichiers.
- **Pâtes non reconnues** : `isIdentifiedPasta` reconnaît les pâtes du référentiel, et, hors référentiel, un nom qui contient un mot de `PASTA_WORDS` (macaroni, spaghetti, penne, tagliatelle, coquillette, lasagne, cannelloni) **et** dont la catégorie est féculent ou absente. Deux cas lui échappent, sans constat `reheat` : une pâte que l'IA classe en `other` ou en légume, même avec un mot de la liste (`macaroni` en `other`) ; une pâte dont le nom n'est pas dans la liste (`fusilli`, `farfalle`), même bien classée en `refined-starch`. Elle est alors traitée comme n'importe quel ingrédient de sa catégorie.
- **Fragilité décidée par catégorie** : la durée au frigo et la congélation d'un ingrédient viennent de sa catégorie, avec quelques exceptions par nom (`KEEPING_BY_NAME`). C'est une approximation, qui peut se tromper dans les deux sens : un plat à congeler ou un `warning` de trop, mais aussi une préparation **manquée**. Exemple : une omelette décrite par des œufs préparés d'avance est acceptée à J+2, sans constat de conservation, car le code ne voit que la catégorie `egg` (2 j, se congèle) et non le mot « omelette », qui ne compte que pour un ingrédient nommé ainsi.
- **Tomate toujours fragile** : `tomate` vaut 2 j au frigo et « se congèle mal », même cuisinée en sauce (le code ne voit pas le mode de cuisson). `tomate concassée` vaut 3 j et se congèle.
- **Invariant N** (négation en tête de phrase, voir le bilan du lot 1) : une négation couvre toute la phrase jusqu'à sa fin (« pas de porc cette semaine, un poulet basquaise » : le poulet n'est pas compté comme demandé), et une interdiction écrite après l'ingrédient (« le porc est interdit ») compte comme une demande pour la saison. Pour exclure un ingrédient, utiliser `--exclude`.
- **Limites de la normalisation** :
  - « pâtés » (au pluriel) donne encore la clé de `pâtes` ;
  - « mais » écrit pour « maïs » dans la demande n'exempte plus le maïs du contrôle de saison (sens prudent) ;
  - la clé du mot « mais » reste celle de « maïs » : `--exclude mais` exclut toujours le maïs.
- **Plat demandé non épinglé** : les règles `meat`, `cured-meat` et `same-protein` ne savent pas quel plat la demande nomme ; l'épinglage est au lot 6 (voir « Ce qui a changé en cours de lot »).
- **Aucune démonstration réelle** : voir le bilan. À faire avec la clé Mammouth (appels rares), à la première occasion. **Toujours à faire au 2026-11-14** : le lot 4 ne l'a pas faite non plus (pas de clé dans l'environnement de construction) ; une seule démonstration de `batch`, lancée par l'utilisateur, couvre les lots 2, 3 et 4 (voir « Reliquats du lot 4 »).

## Lot 3 : équipement et planning de session

**Statut** : `livré` le 2026-11-13, commit `5b98d7b` (branche `lot-3-equipement-planning`), CI GitHub verte.

**Objectif** : calculer la durée réelle d'une session et refuser ce qui ne tient pas dans la cuisine ou dans 3 h.

**Contenu** (conception §3.2, §6.4)
- `equipment/` : un fichier de données par appareil (appareils toujours disponibles et d'appoint, nombre de cuissons simultanées, usages).
- `scheduling/` : construction du planning à partir d'étapes (dépendances, appareil, présence de l'utilisateur), contrôle des emplacements par appareil, une tâche manuelle à la fois, un appareil d'appoint au plus, 3 h au maximum.
- L'IA fournit les grandes phases de chaque plat dès la proposition ; `compose` affiche la durée calculée.

**Ce qui a changé en cours de lot** (décisions de l'utilisateur, 2026-11-13 ; le contenu ci-dessus est le contenu prévu)
- **Capacités** au plus : four 2, plaque 4, Thermomix 1, Kenwood 1, chaque appareil d'appoint 1 ; un seul appareil d'appoint par session.
- **Des maximums, pas un idéal** : le prompt le dit, pour que l'IA n'utilise pas tous les appareils par principe.
- **Plus de 3 h = `error`** ; **2 h 30 : objectif demandé dans le prompt et rappelé dans l'affichage, sans constat** : entre 2 h 30 et 3 h, aucun constat.
- **Équipement constant, sans option de ligne de commande** : `HOUSEHOLD_EQUIPMENT` (`equipment/household.ts`) jusqu'au lot 5. Pas un fichier par appareil, contrairement à ce que prévoyait « Contenu » (note datée dans la conception, §3.2). *Note du 2026-11-15 : les réglages d'équipement sont livrés au lot 5, mais la composition utilise toujours `HOUSEHOLD_EQUIPMENT` ; leur application vient au lot 6.*
- **Plats entièrement `sameDay` hors planning** : ils se font le soir.
- **Plafond de jetons par défaut passé de 4000 à 8000** (`max_tokens` dans `anthropic-client.ts`, une option `maxTokens` peut le remplacer) : la réponse porte maintenant les phases de chaque plat.
- **Planificateur à deux ordres** (révision après relecture) : glouton par insertion, il essaie deux ordres et garde le plus court. La première version n'en essayait qu'un.

**Livrable vérifiable** : tests du planificateur sur des cas construits à la main (four saturé, deux appareils d'appoint, dépassement de 3 h, cas qui tient en 2 h 15) ; `compose` affiche une durée de session.

**Bilan de validation du livrable**
- Vérifié sans appel réel : 434 tests Vitest (26 fichiers).
  - Les quatre cas du livrable sont testés : four saturé, deux appareils d'appoint, plus de 3 h, et 2 h 15, qui est le `balancedMenu()` des fixtures.
  - Quatre nouveaux constats `error` : `phases` (forme des phases), `equipment` (appareil absent), `extra-appliance` (plus d'un appareil d'appoint), `session-length` (le message nomme le plat qui finit le plus tard).
  - `compose` affiche la durée de session, l'appareil d'appoint et le planning ; `compose --dry-run` a été vérifié.
- **Aucune démonstration réelle avec l'IA dans ce lot.** On ne sait pas si Mammouth accepte le nouveau schéma (le champ `phases`), ni combien d'essais il faut. À faire à la première occasion. **Toujours à faire au 2026-11-14** (voir « Reliquats du lot 4 »).

**Ce que ça ne fera PAS (visible)**
- Pas d'étapes détaillées, seulement les grandes phases. **Livré au lot 4 (2026-11-14)** : `batch` rédige un détail par étapes, et `compose` reste aux grandes phases.
- Les durées de l'IA sont crues sur parole.
- Un préchauffage ou une dépendance oubliés peuvent sous-estimer la durée, sans constat. Le prompt demande un préchauffage de 15 minutes ; son effet sur la durée dépend du planning (des phases qui se chevauchent peuvent l'absorber).
- « Une phase = une place d'un appareil », le préchauffage commun, et l'exclusion du refroidissement et de la vaisselle sont demandés à l'IA par le prompt ; le code ne les vérifie pas.
- Le planificateur n'est pas optimal. Mesure faite en relecture : 300 tirages de menus chargés en travail à la main, 5 à 7 phases, comparés à tous les ordres d'insertion compatibles. 7 cas sur 300 sont plus longs que le meilleur ordre, jusqu'à 60 min de plus. Aucun ne fait passer un menu faisable au-dessus de 180 min dans cet échantillon. Un faux refus reste possible ; sa fréquence n'est pas mesurée.
- Tout plat qui n'est pas entièrement `sameDay` doit recevoir au moins une phase, même si sa préparation est partagée avec un autre plat ; sinon constat `phases`. Un plat entièrement `sameDay` doit avoir `phases` vide.
- Pas de contrôle « une seule cuisson longue », ni « poisson en 15 minutes » : le prompt le demande, le code ne le vérifie pas.
- Après 3 essais, le menu retenu peut s'afficher sans durée (« durée non calculée »), si ses phases restent fausses.
- ~~Les séparateurs Unicode et les caractères de direction ne sont pas neutralisés dans la sortie de `compose`.~~ **Fermé au lot 4 (2026-11-14)** : `printable` retire les caractères `Default_Ignorable_Code_Point` et remplace les contrôles C0/C1 et U+2028/2029 par une espace, pour `compose` comme pour le PDF.

**Reliquats du lot 3** (dettes connues, chacune reprise dans le lot qui doit la traiter) :
- **Validation d'un équipement modifiable** (capacités entières ≥ 1, `id` uniques) : reportée au lot 5, qui rend l'équipement modifiable (ajoutée à son contenu). **Traitée au lot 5 (2026-11-15, `63f2bc7`)** : `settings/settings.ts` valide la capacité (entier de 1 à 10) ; la table du code garde ses `id` uniques, puisqu'on ne peut ni ajouter ni retirer d'appareil.
- **Démonstration réelle** : à faire avec la clé Mammouth (appels rares), à la première occasion. **Toujours à faire au 2026-11-14** : couverte par la démonstration de `batch` du lot 4 (voir « Reliquats du lot 4 »).

## Lot 4 : détail, liste de courses et PDF

**Statut** : `livré` le 2026-11-14, commit `ca72cc6` (branche `lot-4-detail-courses-pdf`), CI GitHub verte (run 43534798699, terminé le 2026-11-14). **Démonstration réelle non faite** (pas de clé dans l'environnement de construction) : à lancer par l'utilisateur, voir « Reliquats du lot 4 ».

**Objectif** : fermer le tracer. Un menu validé donne une fiche PDF utilisable en cuisine.

**Contenu** (conception §5.4, §7, §9, avec leurs notes du 2026-11-14)
- Rédaction du détail par l'IA après validation : étapes rédigées, ce qu'il reste à faire chaque soir ; replanification et correction si le planning dépasse 3 h.
- Liste de courses : somme par ingrédient dans l'unité de la recette, répartition entre plats, placard.
- `pdf/` : génération de la fiche dans `core` (moteur pdfmake), A4 portrait, 1 à 2 feuilles (§9).
- Une commande : `pnpm --filter core batch "<demande>" [--out menu.pdf]`, qui enchaîne composition, validation automatique, détail et PDF.

Contenu prévu à l'origine : recettes, conversion en unités d'achat, rayons, PDF en six parties (voir `60c6d39`).

**Livrable vérifiable** : tests de la liste de courses (somme, unités mélangées, répartition, placard) ; un PDF généré depuis un menu-fixture sans appel réseau (`pnpm --filter core pdf:fixture --out <fichier.pdf>`), contrôlé à l'œil par l'utilisateur ; une démonstration réelle de `batch` (**non faite**, voir « Reliquats du lot 4 »).

**Ce qui a changé en cours de lot**

*Décisions de l'utilisateur (2026-11-13 et 2026-11-14)* :
- Pas d'unité d'achat ni de poids de pièce. La liste additionne les quantités de la recette (g, ml, pièce), une somme par unité, sans conversion.
- **Pas de rayons** (courses en drive) : une liste d'ingrédients regroupés avec leur répartition, par exemple « 1 kg de potiron (d : 600 g, e : 400 g) ». Les rayons sont retirés du référentiel.
- Pas de boîtes de conservation. La fiche donne la durée maximale au frigo et la congélation, tirées des tables du lot 2.
- Un seul appel de détail. Le code calcule tout ce qu'il peut : menu, conservation, liste, quantités, planning, consignes.
- Plus de 3 h après 3 essais : PDF produit avec un avertissement en première page, code 1.
- Détail faux ou illisible après 3 essais : PDF de repli avec les grandes phases de la composition, un avertissement, code 1. Code 2 seulement sans menu utilisable, ou pour une erreur d'usage ou locale.
- `--out` facultatif. Par défaut, `~/Downloads/menu-batch-AAAA-MM-JJ.pdf`, puis `-2`, `-3`… sans jamais écraser un fichier. Un chemin relatif se comprend depuis le dossier où la commande a été tapée (`INIT_CWD`).
- **Fiche au format cuisine-addict** (retour de l'utilisateur sur la première fiche) : pas d'horaires ; étapes rédigées (découpes, matière grasse, feu, remuer, ce qu'il faut garder) ; quantité au moment de l'usage ; tas partagés ; soupe au Thermomix s'il est libre ; compacte, 1 à 2 feuilles ; **A4 portrait sur une colonne**.
- Une seule démonstration réelle, lancée par l'utilisateur.

*Choix faits par le décideur à la place de l'utilisateur, absent* :
- Moteur pdfmake, police Roboto livrée dans le paquet ; rendu dans `src/node/`.
- (V) déduit des catégories et des groupes du référentiel.
- Un ingrédient inconnu est marqué « à confirmer ».
- `batch` s'arrête avant le détail si la composition garde une `error`.
- Les quantités sont **calculées par le code** à partir de repères `{a.1}` placés par l'IA dans le texte ; un tas partagé s'écrit `{d.1/e.1}`.
- Les étapes sont imprimées dans l'ordre du planning. Les indications « Après l'étape N » (dépendance ou appareil occupé) et « Pendant ce temps » sont calculées, et « Pendant ce temps » apparaît une seule fois par cuisson.
- Conservation par tas :
  - mention complète sur l'étape qui finit le plat ;
  - « au frais dès que prêt » pour un tas sans suite ;
  - « au frais jusqu'à l'étape N » si la suite attend 60 min ou plus.

  On préfère une consigne de trop à une consigne manquante.
- Pas de flèche (absente de Roboto) : les tas s'écrivent comme la liste, la conservation est séparée par « — ».
- Le cas limite à 3 pages est accepté, la police reste à 9 pt.
- Caractères invisibles : suppression selon `\p{Default_Ignorable_Code_Point}` avant la comparaison et l'impression.
- Une exclusion trouvée dans le texte du détail (étape, titre de phase, soir) ou dans une phase de la composition est **bloquante** : nouvel essai, puis repli.
- Le nom par défaut ne remplace jamais un fichier. Un `--out` existant est remplacé en gardant ses droits POSIX ; un nouveau fichier suit l'`umask`.

**Bilan de validation du livrable**
- 810 tests Vitest (40 fichiers), lint, format, typecheck, build et CI verts.
- Liste de courses testée : somme, unités mélangées, répartition, placard, inconnu « à confirmer », formes.
- Détail testé : lecture, correction en 3 essais, plats intouchables, plus de 3 h, repli, exclusions.
- `pdf:fixture` (fiche d'exemple sur 2 pages, fiche de repli sur 1 page) regardé par l'utilisateur sur la première version, puis réécrit à son retour.
- Fiche lourde : rien de perdu à la pagination.
- `batch` testé de bout en bout avec de faux modèles, écriture du fichier comprise.
- 13 cycles de relecture croisée. La règle de bascule vers un exécutant Opus a été appliquée ; les régressions des cycles 7 à 11 venaient des spécifications du décideur.
- **Démonstration réelle : non faite.** Elle vaut aussi pour les démonstrations des lots 2 et 3, qui gardent leur mention « à faire » tant qu'elle n'a pas eu lieu.

**Ce que ça ne fera PAS (visible)**
- Pas de conversation. Un menu qui garde une `error` arrête `batch` sans PDF.
- Pas de prix. Pas de PDF dans l'app (lot 6), pas d'historique.
- Pas d'unités d'achat ni de rayons : les quantités sont celles des recettes, sans conversion, dans une liste alphabétique. La matière grasse est en ml, pas en cuillères.
- Pas de boîtes de conservation ni d'ustensiles : seulement les appareils.
- Pas de recettes complètes : des étapes rédigées par l'IA. Seules les quantités du menu sont calculées par le code ; le reste du texte n'est pas contrôlé, sauf pour les exclusions et les repères. Une quantité écrite à la main n'est signalée que si elle a la forme « nombre + g, kg, ml, cl ou l » devant un nom du menu.
- Le partage d'une quantité entre plusieurs étapes (« la moitié de… ») est écrit par l'IA.
- Pas d'horaires : la durée calculée s'affiche une fois. Les indications d'enchaînement viennent du planning et ne valent que si les durées de l'IA sont justes. Le planificateur n'est pas toujours optimal.
- Une préparation réservée reçoit sa consigne de conservation propre seulement si l'IA a déclaré la dépendance demandée par le prompt. Sinon, la note générale de la fiche s'applique (« ranger chaque préparation dès qu'elle est froide, 2 h max »). Une préparation reprise moins de 60 min plus tard n'a pas de consigne propre.
- Une étape de matériel (préchauffage du four) peut recevoir une consigne de conservation inutile, dans de rares cas : le code ne devine pas si une étape touche un aliment.
- Si l'IA donne plus de titres de phase que prévu, la fiche peut déborder sur une 3e page.
- Plus de 3 h après 3 essais : PDF avec avertissement, pas de retour au menu (lot 6). Détail faux : fiche de repli avec les grandes phases, sans quantités par étape ni consigne du soir rédigée.
- (V) peut se tromper pour un ingrédient animal mal classé ou absent du référentiel. La conservation vient des tables par catégorie du lot 2, avec leurs limites.
- Exclusions :
  - contrôlées par des mots entiers et par les groupes du référentiel ; elles peuvent refuser à tort un texte qui contient le mot ailleurs (« noix de muscade » avec `--exclude noix`), ce qui est voulu, par prudence ;
  - **pas de groupes d'allergènes** (sujet **abandonné le 2026-11-14** : personne n'est allergique dans le foyer, voir « Questions ouvertes ») : `--exclude lait` n'exclut ni le beurre ni la crème, `--exclude arachide` n'exclut pas les cacahuètes, `--exclude soja` n'exclut pas la sauce soja ; il faut exclure chaque ingrédient par son nom ;
  - un nom écrit avec une lettre d'un autre alphabet qui ressemble à une lettre latine (homoglyphe) n'est pas détecté.
- Un émoji s'affiche comme un carré vide. La note de sécurité peut être coupée entre deux pages.

**Reliquats du lot 4** (dettes connues, chacune reprise dans le lot qui doit la traiter)
- **Démonstration réelle** de `batch` avec la clé Mammouth, à lancer par l'utilisateur. Elle couvre aussi les lots 2 et 3. Vérifier que Mammouth accepte le schéma du détail ; sinon `FMH_DISABLE=format`. Noter les jetons affichés, pour le budget de 2 $/mois. L'utilisateur n'a pas vu les fiches finales : regarder les deux fiches de fixture (`pdf:fixture` et `pdf:fixture --fallback`) avant la démonstration.
- **Groupes d'allergènes** absents du référentiel (voir « Questions ouvertes »). **Abandonné le 2026-11-14** : décision de l'utilisateur, personne n'est allergique ; on exclut chaque ingrédient par son nom.
- **Homoglyphes** non détectés par les exclusions (il faudrait la table des confusables d'Unicode, UTS #39).
- **Préparation réservée sans dépendance déclarée** par l'IA : pas de consigne de conservation propre (le code ne sait pas quelle étape utilise vraiment une préparation ; la note générale s'applique).
- **ACL** : le remplacement d'un `--out` existant garde les droits POSIX, pas les ACL ni les attributs étendus.
- **Faux positifs voulus** des exclusions (« noix de muscade »).
- **Consigne de trop** possible sur un préchauffage.
- **« Après N appels »** : quand le détail part en repli après un appel en échec ou refusé, la raison imprimée (« restent incohérentes après N appels », `ai/batch.ts`) compte aussi cet appel.
- Cas limite à 3 pages ; note de sécurité coupée entre deux pages (cosmétique).
- Reliquats des lots 2 et 3 : ne changent pas, sauf les caractères Unicode du lot 3, **fermés** (`printable` et `Default_Ignorable_Code_Point`).

## Lot 5 : app desktop, coquille, réglages et persistance

**Statut** : `livré` le 2026-11-15, commit `63f2bc7` (branche `lot-5-app-reglages`), CI GitHub verte (jobs `check` et `rust`).

**Objectif** : l'app desktop existe, garde ses données et ses secrets.

**Contenu** (conception §3, §9 Réglages, §10)
- Implémentations Tauri des ports : SQLite (plugin officiel), trousseau macOS pour la clé d'API, plugin HTTP. *Ne vaut plus pour les trois : voir « Ce qui a changé en cours de lot ».*
- Stockage des réglages : exclusions avec raison, équipement disponible, modèle Claude.
- Validation de l'équipement modifiable (reportée du lot 3) : capacités entières ≥ 1, `id` uniques.
- Écran Réglages et navigation entre les quatre écrans (vides pour Nouvelle session, Ingrédients, Historique).
- Une interface sobre et soignée ; le choix du système de composants est à trancher avant ce lot (voir « Questions ouvertes »). *Tranché : Mantine.*
- Reliquats du lot 0 à traiter ici : CSP (`"csp": null`) et permissions `core:default` remplacées par des permissions minimales ; décider d'une vérification Rust en CI (lot 0, « Reliquats »). *Fait.*
- Si le plan relance `tauri dev` : vérifier après l'arrêt que le port 1420 est libre et que l'app ne tourne plus (pnpm 12, un groupe de processus par script).

**Livrable vérifiable** : tests des implémentations de ports qui le permettent ; l'app lancée enregistre une exclusion et la clé, puis les retrouve après redémarrage.

**Ce qui a changé en cours de lot** (décisions de l'utilisateur au cadrage du 2026-11-14, puis arbitrages du décideur après chaque relecture croisée ; le contenu ci-dessus est le contenu prévu)
- **Mantine 9.8.0** (décision de l'utilisateur) pour l'interface, sans Storybook, sans procédure Claude Design, sans plugins PostCSS ni fichier CSS. Raison : une bibliothèque existante suffit à une interface sobre. La CSP garde `style-src 'unsafe-inline'`, parce que Mantine injecte ses styles à l'exécution.
- **Plugin SQL retiré**, remplacé par deux commandes Rust, `settings_read` et `settings_write` (`apps/desktop/src-tauri/src/settings_db.rs`), sur `rusqlite` 0.42 (fonction `bundled`).
  - Raison : le plugin accepte n'importe quel chemin de base, donc la vue web pouvait ouvrir ou écrire n'importe quel fichier SQLite de l'utilisateur, et sa permission ne se limite pas à une table. Écart à la décision de cadrage « SQLite, plugin officiel ».
  - La base est un fichier fixe, `~/Library/Application Support/com.familymealshelper.desktop/family-meals-helper.db`. Les réglages y sont un seul document JSON, limité à 256 Kio.
  - Les migrations passent par `PRAGMA user_version`, dans une transaction : version 0 vers 1 ; version 1 inchangée ; version supérieure ou négative refusée sans écriture.
  - Le travail bloquant (SQLite et trousseau) passe par `spawn_blocking`.
- **Plugin HTTP retiré** : le lot 5 n'a aucun transport réseau. Raison : `tauri-plugin-http` installe un proxy fourni par la vue web, sans contrôle ; une clé lue par le front pouvait partir vers n'importe quel hôte. Le transport vers Claude est reporté au lot 6 (voir ses obligations). Écart à la roadmap d'origine.
- **Pas de plugin `single-instance`, mais un verrou de fichier** : `family-meals-helper.lock`, pris par `File::try_lock` au premier accès aux réglages et gardé jusqu'à la fin du processus. Raison : sur macOS, le plugin laisse passer deux démarrages simultanés (course constatée). Le verrou est coopératif : il n'arrête ni `sqlite3` ni un autre programme.
- **Trousseau par la crate `keyring` 4.2**, derrière trois commandes Rust. Raison : il n'existe pas de plugin officiel pour le trousseau macOS (écart à la conception §10, qui l'annonçait). C'est l'ancien trousseau macOS, avec ACL : il fait confiance au binaire qui a créé l'entrée.
- **`secret_status` à la place d'un `secret_get`** : la commande ne rend qu'un booléen (la clé est-elle enregistrée ?), les deux autres sont `secret_set` et `secret_delete`. Raison : tant que le front pouvait lire la clé, chaque faille de la vue web (proxy HTTP, navigation, WebRTC, préconnexion) pouvait la faire sortir. Maintenant, la clé ne sort plus du Rust. Côté `core`, `SecretAdmin` (`has`, `set`, `delete`) remplace le `WritableSecretStore` prévu au plan ; il n'étend pas `SecretStore`, dont `get` reste réservé à l'appel à l'API. Le Rust valide la clé comme `core` : ASCII visible, de 1 à 500 octets.
- **Garde de navigation** : le plugin local `navigation-guard` (`apps/desktop/src-tauri/src/navigation.rs`) n'accepte que les pages de l'app, `about:blank` et, en dev, `http://localhost:1420`. Raison : la CSP ne couvre pas la navigation de la page principale, qui aurait permis d'envoyer des données vers un hôte externe. `window.open` n'ouvre rien (comportement par défaut de wry), et `index.html` coupe le préchargement DNS.
- **CSP réelle et permissions minimales** : `core:default` est retiré, la capability ne permet que les 5 commandes de l'app, `connect-src` est limité à l'IPC. Les fichiers `permissions/autogenerated/*.toml` sont committés : leur contenu est le même sur toutes les machines, et un changement de droit se voit dans le diff.
- **Réglages en un document JSON versionné** (`version: 1`), validé dans `core` (`settings/settings.ts`). Un seul propriétaire au-dessus des écrans, `createSettingsKeeper` (`settings/settings-keeper.ts`) : il écrit dans l'ordre, ne relit jamais après un échec, et l'erreur s'affiche avec « Réessayer ». L'enregistrement est immédiat. Raison : deux écrans qui écrivent chacun de leur côté s'écraseraient.
- **Équipement** : chaque appareil du code a une disponibilité et une capacité (entier de 1 à 10) ; on ne peut ni ajouter ni retirer d'appareil (décision de l'utilisateur). Les textes `uses` du four et de la plaque ne contiennent plus de nombre, puisque la capacité varie. `applyEquipmentSettings` existe mais n'est pas branché dans la composition (lot 6).
- **CI** : un job `rust` sur `macos-15` lance `cargo fmt --check`, `cargo clippy --locked --all-targets -- -D warnings` et `cargo test --locked`. Raison : le Rust contient maintenant la logique des réglages et du trousseau. Les tests de l'app (Vitest et jsdom) tournent dans `pnpm test`.
- **Allergènes abandonnés** (décision de l'utilisateur, 2026-11-14) : personne n'est allergique ; il n'y aura pas de groupes d'allergènes. Les exclusions sont un terme et une raison facultative, au plus 200.

**Bilan de validation du livrable**
- **Tests** : 895 tests `core`, 53 tests de l'app (Vitest, jsdom) et 19 tests Rust (`cargo test` : navigation, trousseau, et réglages SQLite sur une base en mémoire ou un fichier temporaire). `lint`, `format:check`, `typecheck`, `build`, `clippy` et `fmt` passent en local, et la CI GitHub est verte (jobs `check` et `rust`).
- **Relectures** : 6 cycles de relecture croisée (Opus et Codex), jusqu'au consensus. Après deux cycles de corrections régressives de l'exécutant Sonnet, la règle de bascule a été appliquée : un exécutant Opus a fini le travail.
- **Contre-épreuves manuelles de l'utilisateur (2026-11-15), toutes conformes**, sur l'app lancée puis sur un `.app` construit par `tauri build --debug --bundles app` (CSP de production, inspecteur web) :
  - un aliment, l'airfryer décoché et la clé sont retrouvés après un redémarrage, sans nouvelle demande d'accès au trousseau ;
  - le `.app`, de signature différente, demande l'accès au trousseau : refuser donne une alerte, autoriser fonctionne ;
  - 8 contre-épreuves en console : `secret_get` refusé, `secret_status` rend vrai, une commande inconnue refusée, `plugin:app|version` refusé, script en ligne bloqué, `fetch` refusé, `window.open` rend `null`, `location.assign` vers un hôte externe bloqué ;
  - seconde instance : « Réglages indisponibles », et la clé reste modifiable (voulu).
- **Défaut trouvé à cette occasion** : dans le `.app`, « Supprimer la clé » échouait avec « Invalid attempt to change the owner of this item », sur une clé créée par le binaire de développement (autre signature). Cause : l'ACL de l'ancien trousseau est liée à la signature du binaire. Correction : un message clair (comment supprimer l'entrée dans Trousseaux d'accès) et la limite écrite ci-dessous. Une entrée factice créée par `security add-generic-password` a ensuite servi à le reproduire : le remplacement de la clé réussit, la suppression affiche ce message.
- **Aucun appel réel à l'IA** dans ce lot.

**Ce que ça ne fera PAS (visible)**
- Pas de composition dans l'app : « Nouvelle session », « Ingrédients » et « Historique » affichent seulement « À venir ». **Les réglages ne servent encore à rien** : l'équipement, les exclusions et le modèle ne sont lus par aucune commande (`compose` et `batch` gardent `HOUSEHOLD_EQUIPMENT` et `--exclude`), ils serviront au lot 6.
- **200 aliments à éviter au plus** ; **capacité de 1 à 10** : le champ borne la saisie, le plafond protège surtout la taille du document.
- **Brouillons perdus** : un aliment, un modèle ou une clé tapés sans être enregistrés sont oubliés quand on quitte Réglages (c'est dit à l'écran). Si un enregistrement échoue et qu'on quitte l'app, les changements non enregistrés sont perdus.
- **Seconde instance refusée** : elle s'ouvre, mais ses réglages sont refusés (« Réglages indisponibles »), avec un message qui dit de fermer l'autre fenêtre. Sa section « Clé d'API » reste utilisable. La « première » est celle qui a accédé aux réglages la première, pas celle qui a démarré la première ; l'autre fenêtre n'est pas remise au premier plan.
- **Suppression de la clé impossible depuis une autre version de l'app** : l'app n'est pas signée, donc chaque nouvelle version (ou recompilation en développement) demande d'autoriser la lecture de la clé. Elle peut ensuite remplacer la clé, mais pas la supprimer, même après « Toujours autoriser » ; l'app explique alors comment supprimer l'entrée dans Trousseaux d'accès. Le message parle d'une « autre version de l'app » même quand la cause est un refus d'accès (code -25299) ; la marche à suivre répare quand même. Repris au lot 5 bis.
  > **Note du 2026-11-16 (lot 5 bis) :** réglé pour le `.app` signé par une identité Apple Development. Constaté : A enregistre une clé ; B, de `CDHash` différent et de même exigence désignée, la lit deux fois sans demande d'accès, puis la supprime (voir le bilan du lot 5 bis). Reste vrai pour `tauri dev` et pour un `.app` construit sans `APPLE_SIGNING_IDENTITY`, qui sont signés ad hoc. Le message d'erreur a aussi changé : à l'enregistrement, il nomme le refus d'accès (code -25299) en plus de l'autre version de l'app ; à la suppression, il ne parle que de l'autre version.
- La clé tapée passe une fois par la vue web ; ensuite, seul le Rust la voit.
- WebRTC et la préconnexion ne sont pas bloqués : ils n'ont aucun secret à emporter.
- Le verrou des réglages n'arrête pas `sqlite3` ni un autre programme.
- Pas de bouton « Tester la clé », pas d'adresse d'API réglable (la clé Mammouth demande `https://api.mammouth.ai`) : le fournisseur sera choisi avant le lot 6, voir « Questions ouvertes ».
- Pas d'ajout ni de suppression d'appareil, pas d'ustensiles. Pas de modification d'une exclusion (on la retire puis on l'ajoute de nouveau). Pas d'annulation, d'import ni d'export. Pas de table de prix (lot 7).
- Un document de réglages abîmé à la main, une migration ratée ou un document d'une version future laissent l'écran en erreur, sans bouton pour repartir des valeurs par défaut.
- Le mode clair ou sombre suit macOS, sans réglage. La fenêtre ne garde ni sa taille ni sa position. L'app n'est pas signée.
  > **Note du 2026-11-16 (lot 5 bis) :** le `.app` est signé depuis le lot 5 bis. Reste vrai pour `tauri dev` (signature ad hoc).

**Reliquats du lot 5** (dettes connues, chacune reprise dans le lot qui doit la traiter)
- (lot 6) **Brancher `applyEquipmentSettings`, les exclusions enregistrées et le modèle choisi** partout où `HOUSEHOLD_EQUIPMENT`, `--exclude` et le modèle par défaut servent en dur : `rules/check-menu.ts`, `ai/prompt.ts`, `ai/batch.ts`, `pdf/sheet.ts`.
- (lot 6) **Brouillon de capacité jamais remis à jour, et retrait d'un aliment par sa position**, à revoir quand le keeper sera partagé avec l'action « éviter cet ingrédient ».
- (lot 6) **Un abonné du keeper qui lève une erreur est ignoré sans trace** (choix écrit en commentaire).
- (lot 5 bis) **Demande d'accès au trousseau et suppression impossible après une nouvelle version.** Traité au lot 5 bis (2026-11-16, `8bcf097`) pour le `.app` signé ; la demande d'accès reste pour `tauri dev`.
- (non planifié) Un échec de `app_config_dir()` empêche l'app de démarrer ; seulement sans `HOME`.
- (non planifié) Le paquet JS fait environ 517 kB (avertissement de Vite).
- (non planifié) En dev, `StrictMode` lit deux fois le trousseau : deux demandes d'accès sont possibles.
- (non planifié) Dans les messages d'erreur, le détail technique reste en anglais (en petit, sous la phrase française).
- (non planifié) Un document de plus de 200 aliments écrit avant la borne serait illisible ; aucune base réelle n'est concernée.

## Lot 5 bis : signature stable de l'app

**Statut** : `livré` (2026-11-16, `8bcf097`). Ajouté le 2026-11-15, sur décision de l'utilisateur, avant le lot 6.

**Objectif** : la clé d'API enregistrée dans le trousseau se lit sans demande d'accès après une reconstruction de l'app, et on peut la supprimer depuis l'app.

**Pourquoi** (au 2026-11-15, avant le lot) : l'app n'est pas signée, et le trousseau macOS lie l'accès à une entrée à la signature du binaire qui l'a créée. Chaque nouvelle version demande donc d'autoriser la lecture, et ne peut pas supprimer la clé d'une version précédente (voir « Ce que ça ne fera PAS » du lot 5). Le lot 6 lira la clé à chaque appel à Claude : il vaut mieux régler cela avant.

**Contenu**
- Signer l'app avec une identité stable : un certificat de signature de code auto-signé créé dans Trousseaux d'accès, ou un certificat Apple Development. L'identité est passée par `APPLE_SIGNING_IDENTITY` à `tauri build`. *Note du 2026-11-16 : le choix auto-signé est écarté. L'utilisateur a choisi le certificat Apple Development d'emblée, sans essai auto-signé.*
- `tauri dev` reste en signature ad hoc (chaque recompilation change la signature) : la demande d'accès au trousseau continue d'y apparaître. À écrire dans `CLAUDE.md`.
- Dire dans `CLAUDE.md` comment créer l'identité et construire le `.app` signé.

**Livrable vérifiable** : après deux reconstructions du `.app` avec la même identité, la clé se lit sans demande d'accès et « Supprimer la clé » réussit depuis l'app.

**Ce qui a changé en cours de lot** (2026-11-16)
- **Apple Development direct**, sans essai auto-signé (décision de l'utilisateur). Xcode et un identifiant Apple servent à créer le certificat, pas ensuite à construire.
- **L'utilisateur crée l'identité lui-même**, avec la marche à suivre de `CLAUDE.md`. Aucun agent n'écrit dans le trousseau.
- **Les compilations signées passent par `env -u ...`** : les variables `APPLE_CERTIFICATE`, `APPLE_ID` et leurs voisines sont retirées, pour que la CLI Tauri n'importe pas de certificat et ne tente pas de notarisation.
- **Deux textes d'erreur, pas un seul** (le plan en prévoyait un). À l'enregistrement, le message nomme le refus d'accès, le cas d'une clé d'une autre version, et dit « Réessayez et cliquez « Autoriser » ». À la suppression, il ne parle que d'une autre version de l'app. Les codes -25244 et -25299 (en enregistrement) donnent le même texte.
- **Identité invalide après sa création** : `security find-identity -v -p codesigning` rendait `0 valid identities found`, alors que la même commande sans `-v` listait l'identité. Cause : le certificat intermédiaire « Apple Worldwide Developer Relations Certification Authority » **G3** manquait (seul l'ancien, expiré, était dans `System.keychain`). L'utilisateur l'a ajouté à son trousseau de session depuis https://www.apple.com/certificateauthority/AppleWWDRCAG3.cer. La marche à suivre de `CLAUDE.md` le dit.
- **Pas d'ancienne entrée dans le trousseau** : la suppression manuelle unique prévue n'a pas eu lieu d'être.
- **Preuve par les clics de l'utilisateur** : les contrôles de `codesign` sont faits par commande, mais la demande d'accès au trousseau ne se voit qu'à l'écran.
- **Version B distinguée par `--config`** : un titre de fenêtre différent change le binaire, donc son `CDHash`, sans toucher au code du dépôt.

**Bilan de validation du livrable**
- **Tests** : 895 tests `core`, 53 tests de l'app (Vitest, jsdom) et 20 tests Rust (19 au lot 5, plus le test du texte de suppression). `lint`, `format:check`, `typecheck`, `build`, `clippy` et `fmt` passent en local ; la CI GitHub est verte (jobs `check` et `rust`) sur `8bcf097`.
- **Contre-épreuve, conforme** (2026-11-16, macOS 26.7.3, certificat Apple Development d'une Personal Team, `TeamIdentifier` 8Y4UG35YZV) :
  - version A : signée, avec la protection renforcée à l'exécution (`hardened runtime`), exigence désignée (DR) sans `cdhash`, `CDHash` 57f0cba2… ; l'utilisateur enregistre une clé factice sans demande d'accès et ouvre l'inspecteur web ;
  - version B (titre de fenêtre changé par `--config`) : `CDHash` 8bc7d920…, même DR que A, `codesign --verify -R` avec la DR de A rend 0, même certificat feuille ; l'utilisateur lit la clé sans demande d'accès, ouvre B une seconde fois sans demande, puis « Supprimer la clé » réussit (l'entrée est absente ensuite) ;
  - version finale : `CDHash` fac4b3b7…, mêmes contrôles verts.
- **Inspecteur web** : ouvert dans la version A, conforme.
- **Limite du constat** : un seul Mac, une seule identité (Personal Team), macOS 26.7.3. Rien de plus général n'est affirmé.

**Ce que ça ne fera PAS (visible)**
- Pas de notarisation, pas de distribution à d'autres machines, pas de signature en CI. Un autre Mac devra créer sa propre identité.
- `tauri dev` reste ad hoc : la demande d'accès au trousseau revient à chaque recompilation du Rust.
- Une version ad hoc (`tauri dev`, ou `.app` construit sans `APPLE_SIGNING_IDENTITY`) peut remplacer la clé enregistrée par le `.app` signé, mais pas la supprimer, et inversement. Ce croisement entre version ad hoc et version signée n'a pas été testé au lot 5 bis : c'est le comportement attendu (constaté au lot 5 entre deux versions ad hoc), à confirmer. Consigne : enregistrer la clé depuis le `.app` signé.
- Une clé enregistrée par une version non signée ou signée autrement reste à supprimer à la main dans Trousseaux d'accès, une seule fois. Cette fois, aucune entrée ne préexistait.
- L'identité n'est pas dans `tauri.conf.json` : chaque compilation signée passe `APPLE_SIGNING_IDENTITY`. L'oublier donne un `.app` ad hoc, sans erreur.
- Xcode et un identifiant Apple sont nécessaires pour créer l'identité (pas pour construire ensuite).
- Le certificat Apple Development a une durée limitée ; son renouvellement peut faire revenir une demande d'accès.
- Le trousseau garde deux textes d'erreur, un par action. Quand le refus d'accès et l'autre version de l'app sont deux causes possibles (enregistrement), le texte les nomme toutes les deux : l'app ne fait pas d'appel en plus pour les distinguer. Pas de bouton pour réparer le trousseau depuis l'app.
- Rien d'autre ne change dans l'interface.

## Lot 6 : app desktop, session, ingrédients et historique

**Objectif** : le parcours complet dans l'app.

**Contenu** (conception §5.2 à §5.4, §9)
- Écran Nouvelle session : conversation, menu courant à côté, « vérification en cours », constats et avertissements.
- Modification du menu courant (§5.3) : demandes ciblées, résumé de conversation, action « éviter cet ingrédient ».
- **Épingler un plat demandé** : un plat que la demande nomme, ou que l'utilisateur épingle, ne peut pas être retiré par l'IA (conception §5.1). Au lot 2, la protection tient au prompt seul et rien ne signale un plat retiré ; c'est ce lot qui en fait une vraie garantie.
- Validation, détail, export du PDF.
- Écran Ingrédients : liste avec cases à cocher (l'état coché est conservé). *Au lot 4, les rayons ont été retirés (courses en drive) : la liste est alphabétique, sans rayon. Reste à trancher avant ce lot si l'écran reste par rayon (voir « Questions ouvertes »).*
- Historique des 5 derniers menus, transmis à l'IA, avec réouverture du PDF.
- Si le plan relance `tauri dev` : vérifier après l'arrêt que le port 1420 est libre et que l'app ne tourne plus (pnpm 12, un groupe de processus par script).

**Obligations reportées du lot 5** (2026-11-15)
- **Transport vers Claude par une commande Rust qui ajoute elle-même la clé** (`Authorization: Bearer`, que Mammouth attend aussi), vers des hôtes fixes (Anthropic ou Mammouth, selon le choix du fournisseur : voir « Questions ouvertes »). La clé ne passe jamais par la vue web. Décidé : le transport, c'est-à-dire que la clé reste côté Rust. Reste à décider (point suivant) : où vit le SDK, dans la vue web avec un `fetch` adapté, ou plus du tout. Le reliquat du lot 1 « `ai/` n'est pas réexporté » se règle avec ce choix : si la vue web garde le SDK, `ai/` devra être réexporté.
- Aucune commande ne rend la clé (`secret_status` ne rend qu'un booléen) et la vue web ne fournit pas de proxy. Les redirections sont refusées hors des hôtes permis, ou il n'y en a pas du tout.
- **Le SDK Anthropic dans une vue web** : il détecte `window`, donc il faudrait `dangerouslyAllowBrowser: true`. Son `fetch` serait adapté vers la commande Rust, avec une `apiKey` factice que le Rust remplace. L'autre voie : la commande Rust fait l'appel sans SDK. À trancher dans le plan du lot 6. Si l'appel garde une `Origin`, vérifier l'en-tête `anthropic-dangerous-direct-browser-access`.
- **Masquage de la clé** dans les erreurs et les journaux : le Rust refait ce que fait `redact` dans `core`, et aucune erreur renvoyée à la vue web ne contient la clé.
- **Nouvelles tables** (historique) : de nouvelles commandes Rust dans `settings_db.rs` ou un module voisin, avec une migration `user_version` 2. Jamais de SQL fourni par la vue web.
- **Le keeper partagé** par les écrans (action « éviter cet ingrédient ») ; reprendre les reliquats du lot 5 (brouillon de capacité, retrait par position, abonné qui lève une erreur).
- **Brancher les réglages** : `applyEquipmentSettings`, les exclusions enregistrées et le modèle choisi (reliquat du lot 5).
- Toute nouvelle commande est ajoutée à `AppManifest::commands` (`build.rs`), à `capabilities/default.json` et à `generate_handler!` (`src/main.rs`), et son fichier `permissions/autogenerated/*.toml` est committé ; le `.toml` d'une commande retirée se supprime à la main.

**Notes de livraison, sous-lot 6.5b** (2026-11-16, code seulement : preuve dans le `.app` signé et démonstration payée restent à faire par l'utilisateur)
- 6.5a (déjà commité) : historique en base (table `history`, fiche PDF en BLOB), écran Historique, rendu PDF dans la vue web.
- 6.5b : « Valider ce menu » contrôle le menu avec les réglages, le jour et le nombre de dîners du moment, puis fait rédiger le détail (1 à 3 appels), rend la fiche, l'enregistre dans l'historique et l'ouvre dans Aperçu. Plus de 3 h, ou détail inutilisable : l'app demande (« Revenir au menu » ou « Garder la fiche »). Une seule fonction de la session (`operate`) publie la fin d'une opération ; un échec local se reprend sans nouvel appel à Claude (mêmes octets, même jeton).
- Version d'essai (`pnpm --filter desktop build:essai`, mode Vite `essai`) : réponses d'exemple, sans Claude ; absente du build normal (prouvé par recherche du texte dans `dist`).

**Livrable vérifiable** : tests de la modification du menu courant avec un faux client IA, dont un test où l'IA tente de retirer un plat épinglé ; dans l'app, l'utilisateur compose, modifie un plat, valide et obtient le PDF ; le menu apparaît dans l'historique.

**Ce que ça ne fera PAS (visible)** : pas de prix.

## Lot 7 : prix

**Objectif** : afficher un coût estimé par ligne et par menu.

**Contenu** (conception §8, `docs/research/sources-prix.md`)
- `pricing/` : table manuelle, INSEE, résumé Open Prices (téléchargement hebdomadaire en tâche de fond, lecture en flux, médiane par ingrédient du référentiel), ordre de priorité, source affichée.
- Le résumé Open Prices et la table de prix passent par des commandes Rust dédiées (comme les réglages), pas par un plugin SQL (décision du lot 5).
- Affichage du coût dans le menu courant, la page Ingrédients (avec modification de la table manuelle) et le PDF ; mention de la licence ODbL.
- **Plafond de budget** (reporté du lot 2, décision de l'utilisateur du 2026-11-13) : quand la demande fixe un plafond, un dépassement donne un constat `warning` (conception §6.6). Aucun constat de budget avant ce lot.

**Livrable vérifiable** : tests de l'estimation sur un extrait de fichier Open Prices et un extrait du CSV INSEE ; un test du constat de budget (un menu qui dépasse le plafond, un qui le respecte) ; dans l'app, un menu affiche un coût total et la source de chaque prix ; l'app reste utilisable sans données Open Prices.

**Ce que ça ne fera PAS (visible)** : pas de prix d'un magasin précis ; pas de comparaison entre enseignes.

**Depuis le lot 4 (2026-11-14)** : les pièces n'ont pas de poids moyen (abandonné au lot 4) et la liste de courses garde l'unité de la recette. L'estimation de prix devra utiliser l'unité de la recette (g, ml, pièce).

---

## Questions ouvertes (à trancher avant le lot concerné)

- ~~**Avant le lot 0** : le remote git et la branche de travail ; le profil Codex du projet.~~ Tranché : remote GitHub public https://github.com/bfigliuzzi/family-meals-helper, une branche par lot (`lot-0-socle`) ; profil Codex `~/.codex/family-meals-helper.config.toml` en gpt-6.1-sol, effort high.
- ~~**Avant le lot 5** : nico-build-plan suppose un Storybook (`packages/design-system`) et une procédure Claude Design pour tout composant d'interface. Ce projet n'en a pas : décider s'il en crée un, ou si les lots UI utilisent une bibliothèque de composants existante.~~ Tranché le 2026-11-14 : Mantine 9.8.0, sans Storybook ni procédure Claude Design.
- ~~**Avant le lot 5** : groupes d'allergènes dans le référentiel, par exemple les 14 allergènes de l'étiquetage européen, rattachés à chaque entrée, avec une source dans `docs/research/`. Recommandation du décideur : un petit lot dédié. (Voir « Reliquats du lot 4 ».)~~ Abandonné le 2026-11-14 : personne n'est allergique dans le foyer, il n'y aura pas de groupes d'allergènes. On exclut chaque ingrédient par son nom.
- **Avant le lot 6** : l'adresse de l'API dans l'app. La clé de l'utilisateur est une clé Mammouth, qui demande `https://api.mammouth.ai` ; sans réglage, l'app appellerait `api.anthropic.com` avec cette clé, et l'appel échouerait. Recommandation du décideur : un choix « Fournisseur : Anthropic ou Mammouth » dans Réglages, qui fixe les deux seuls hôtes permis à la commande Rust ; pas d'adresse libre, qui ouvrirait la clé à n'importe quel hôte. À trancher par l'utilisateur.
- **Avant le lot 6** : l'écran Ingrédients reste-t-il par rayon ? Les rayons ont été retirés du référentiel au lot 4 (courses en drive) ; les rajouter serait une donnée par entrée.
