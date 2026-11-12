# Roadmap : lots livrables

Ce fichier découpe la conception (`docs/superpowers/specs/2026-11-12-family-meals-helper-design.md`) en lots. Chaque lot se livre via `/nico-build-plan`, un lot à la fois, dans l'ordre. La conception reste la source de vérité ; un lot y renvoie par numéro de section plutôt que de la recopier.

Chaque lot se termine sur un **livrable vérifiable** : une commande dont le résultat montre que le lot marche. Quand un lot est livré, son statut passe à `livré` avec la date et le commit.

Le premier objectif d'usage est le **tracer** (un menu réel produit de bout en bout) : à la fin du lot 4, l'utilisateur peut déjà préparer un batch cook en ligne de commande. Les lots 5 à 7 y ajoutent l'app desktop puis les prix.

| Lot | Titre | Dépend de | Statut |
|---|---|---|---|
| 0 | Socle du monorepo | — | à faire |
| 1 | Tracer : composition IA en ligne de commande | 0 | à faire |
| 2 | Conservation, équilibre et quantités | 1 | à faire |
| 3 | Équipement et planning de session | 1 | à faire |
| 4 | Détail, liste de courses et PDF | 2, 3 | à faire |
| 5 | App desktop : coquille, réglages, persistance | 4 | à faire |
| 6 | App desktop : session, ingrédients, historique | 5 | à faire |
| 7 | Prix | 4 (affichage dans l'app : 6) | à faire |

---

## Lot 0 : socle du monorepo

**Objectif** : un dépôt où chaque lot suivant ajoute du code sans toucher à l'outillage.

**Contenu**
- Monorepo pnpm : `packages/core`, `apps/desktop`.
- TypeScript strict, ESLint, Prettier, Vitest dans `core`.
- `apps/desktop` : Tauri 2 + React + Vite, qui ouvre une fenêtre affichant une valeur importée de `core` (preuve que le lien entre les deux marche).
- Scripts racine : `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`.
- Une CI GitHub Actions qui lance ces quatre scripts, si un remote est configuré.

**Livrable vérifiable** : `pnpm lint && pnpm typecheck && pnpm test && pnpm build` passe ; `pnpm --filter desktop tauri dev` ouvre la fenêtre.

**Ce que ça ne fera PAS (visible)** : aucune fonction métier ; la fenêtre n'affiche qu'un texte de contrôle.

## Lot 1 : tracer, composition IA en ligne de commande

**Objectif** : prouver la chaîne demande → IA → vérification → correction sur un vrai appel à Claude, avec les règles bloquantes les plus simples.

**Contenu** (conception §2, §5.1, §5.2, §6.5, §7)
- `domain/` : schémas Zod de Menu, Plat, Ingrédient (avec forme), Constat.
- `ports/` : `HttpClient`, `Clock`, `SecretStore`. Une implémentation Node pour la ligne de commande.
- `ingredients/` : référentiel de départ (une centaine d'ingrédients courants) avec synonymes, catégorie détaillée, rayon, forme, drapeau `placard`.
- `season/` : table de saison France par mois (§6.5 : vérifier d'abord l'API ADEME).
- `rules/` : contrôle des exclusions et de la saison, qui produit des constats.
- `ai/` : client Claude via le port HTTP, prompt système avec le texte des règles cuisine-addict de composition (§6.1) en prompt caching, sortie structurée validée par Zod, cycle proposer → vérifier → corriger (3 essais).
- Une commande de développement : `pnpm --filter core compose "<demande>" [--exclude courgette] [--month 11]`, qui affiche le menu et ses constats.

**Livrable vérifiable**
- Tests Vitest des contrôles exclusions et saison, sans appel réseau.
- Un test du cycle de correction avec un faux client IA qui renvoie d'abord un menu fautif.
- Une démonstration réelle : `compose "un bœuf bourguignon, 5 dîners" --exclude courgette` renvoie un menu sans courgette et sans légume hors saison.

**Ce que ça ne fera PAS (visible)** : pas de conservation, d'équilibre ni de planning ; pas de recettes détaillées ; pas d'interface ; pas de modification du menu courant (une demande = une composition).

**Pour le décideur** : la clé d'API Claude est lue depuis la variable d'environnement `ANTHROPIC_API_KEY` dans l'implémentation Node de `SecretStore`.

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

- **Avant le lot 0** : le remote git et la branche de travail ; le profil Codex du projet (`~/.codex/family-meals-helper.config.toml` n'existe pas).
- **Avant le lot 5** : nico-build-plan suppose un Storybook (`packages/design-system`) et une procédure Claude Design pour tout composant d'interface. Ce projet n'en a pas : décider s'il en crée un, ou si les lots UI utilisent une bibliothèque de composants existante.
