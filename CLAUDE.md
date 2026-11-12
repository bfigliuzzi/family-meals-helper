# Family Meals Helper

App desktop (Tauri + React + TypeScript) qui compose des menus de batch cook avec Claude, puis produit la liste de courses et une fiche PDF. Toute la logique métier vit dans `packages/core`, sans dépendance à Tauri, pour pouvoir passer plus tard sur un serveur web.

- **Comportement du produit, règles, architecture** → `docs/superpowers/specs/2026-11-12-family-meals-helper-design.md`. Source de vérité : en cas de doute sur ce que l'outil doit faire, elle tranche.
- **Lot en cours, ordre des lots, livrable attendu** → `docs/roadmap.md`. Un lot livré y passe au statut `livré`.
- **Valeurs des règles** (durées de conservation, seuils d'équilibre, sources de prix) → `docs/research/`, un fichier par source ; chaque fichier dit en tête comment le lire.

Les textes de l'interface, du PDF et des docs sont en français. Les identifiants de code sont en anglais.
