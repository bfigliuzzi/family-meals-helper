# Family Meals Helper

App desktop (Tauri + React + TypeScript) qui compose des menus de batch cook avec Claude, puis produit la liste de courses et une fiche PDF. Toute la logique métier vit dans `packages/core`, sans dépendance à Tauri, pour pouvoir passer plus tard sur un serveur web.

- **Comportement du produit, règles, architecture** → `docs/superpowers/specs/2026-11-12-family-meals-helper-design.md`. Source de vérité : en cas de doute sur ce que l'outil doit faire, elle tranche.
- **Lot en cours, ordre des lots, livrable attendu** → `docs/roadmap.md`. Un lot livré y passe au statut `livré`.
- **Valeurs des règles** (durées de conservation, seuils d'équilibre, sources de prix) → `docs/research/`, un fichier par source ; chaque fichier dit en tête comment le lire.
- **Écrire du code dans `packages/core`** (où va le code Node, globales permises, accès extérieurs par les ports, règle pour ajouter une règle ESLint) → `docs/conventions-core.md`. À lire avant de toucher à `core`.

## Commandes

Versions figées : Node 24.22.3 (`.node-version`, à activer avec `fnm use`), pnpm 12.18.0 (champ `packageManager`, pnpm le télécharge seul), Rust 1.100.0 (`rust-toolchain.toml`, via rustup).

- Tout vérifier : `pnpm install --frozen-lockfile && pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm build`. C'est ce que lance la CI (sans Rust).
- Lancer l'app : `pnpm --filter desktop tauri dev` (port 1420, premier lancement long : compilation Rust).
- Composer un menu (lot 1) : `pnpm --filter core compose "<demande>" [--exclude x] [--month 11] [--max-attempts 3] [--dry-run]`. `--dry-run` affiche les prompts sans réseau ni clé. Sans `--dry-run`, appel réel : clé dans `ANTHROPIC_API_KEY`, URL et modèle dans `ANTHROPIC_BASE_URL` / `ANTHROPIC_MODEL` (`FMH_DISABLE=format,effort,cache` retire une fonction qu'un proxy refuse). `pnpm --filter core smoke` fait un seul appel de test ; `pnpm --filter core season:import` régénère la table de saison (voir `docs/research/saison-fruits-legumes.md`).
- Depuis un sous-paquet, `pnpm -w lint` (ou `-w format:check`) lance le script racine.
- Ce projet est sur GitHub : https://github.com/bfigliuzzi/family-meals-helper. Le profil Codex du projet est `~/.codex/family-meals-helper.config.toml` (gpt-6.1-sol, effort high).

Les textes de l'interface, du PDF et des docs sont en français. Les identifiants de code sont en anglais.
