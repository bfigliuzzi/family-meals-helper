# Conventions de `packages/core`

Ce fichier dit comment écrire du code dans `packages/core` sans casser la frontière du code pur. Il vient du lot 0 (règles dans `eslint.config.js`). Les lots 1 à 7 le suivent. La conception (`docs/superpowers/specs/2026-11-12-family-meals-helper-design.md`, §10) dit pourquoi : `core` n'accède à l'extérieur que par des ports, pour pouvoir passer plus tard sur un serveur web.

## 1. Organisation

- `core` a un seul programme TypeScript (`packages/core/tsconfig.json`). Les types Node y sont visibles partout : `tsconfig.json` les charge explicitement (`"types": ["node"]`, avec `@types/node` en dépendance de `core`). Ce choix vient notamment du SDK Anthropic (lot 1), qui les charge de toute façon.
- Le code Node vit dans `packages/core/src/node/` : implémentations Node des ports, commandes de développement comme `compose`. ESLint y autorise Node.
- Les tests se nomment `*.test.ts` ou `*.spec.ts`. ESLint les traite comme du code Node : ils peuvent lire des fichiers.
- Tout le reste de `packages/core/src/` est le **code pur**. C'est lui que la garde surveille.
- `src/index.ts` réexporte le code pur et n'importe jamais `src/node/`. Le script `test` de `core` lance `node src/index.ts` avant Vitest : si un import de `index.ts` ne se résout pas sous Node, `pnpm test` échoue.
- Pour que Node charge le code tel quel, il faut :
  - des imports relatifs avec l'extension du fichier source (`.ts`, `.mts`, `.cts`). ESLint refuse les imports relatifs en `.js`, `.mjs` et `.cjs` ;
  - une syntaxe TypeScript effaçable (`erasableSyntaxOnly` : pas d'`enum` ni de `namespace`) ;
  - des imports de types écrits `import type { X } from "./module.ts"`. Le type d'import `import("./module.ts").X` est refusé dans le code pur (sélecteur `TSImportType`), à ne pas confondre avec l'import dynamique, aussi refusé.
- Un script de `core` se déclare dans `packages/core/package.json`, sans toucher à ESLint ni aux tsconfig. Par exemple `compose` : `node src/node/compose.ts`.
- Scripts du lot 1 : `compose` (composition par l'IA), `smoke` (un seul appel de test de connexion) et `season:import` (régénère `src/season/season-table.ts` depuis l'API ADEME ; voir `docs/research/saison-fruits-legumes.md`). Le script d'import est le seul code qui fait un appel réseau hors de l'IA.
- Scripts du lot 4 : `batch` (composition, détail, liste de courses et fiche PDF) et `pdf:fixture` (une fiche d'exemple, sans réseau ni clé ; `--fallback` pour la fiche de repli). `batch` passe par `runBatchCommand(argv, io)` (`src/node/batch-command.ts`) : tout ce qui touche à l'extérieur (environnement, modèles, polices, destination, écriture, heure) arrive par l'objet `io`, remplacé dans les tests.

- Scripts et modules du lot 5 : le module `settings/` contient `settings.ts` (schéma, validation, `loadSettings`, `applyEquipmentSettings`, `checkApiKey`, qui n'accepte que des lettres sans accent, des chiffres, `-` et `_`, comme `check_secret` côté Rust) et `settings-keeper.ts` (`createSettingsKeeper`, le propriétaire du document de réglages, qui écrit dans l'ordre). Les ports sont `SettingsStore` (`read` et `write` transportent du **texte** : parsing, validation et sérialisation restent dans `core`), `SecretStore` (`get`, réservé à l'appel à l'API ; son implémentation Node ne change pas) et `SecretAdmin` (`has`, `set`, `delete` : il ne lit jamais la valeur de la clé). Les implémentations pour l'app sont dans `apps/desktop/src/platform/`, pas dans `core`.
- **Faire évoluer le document de réglages** : la `version` s'incrémente à tout changement de forme, `loadSettings` porte une transformation explicite de chaque version précédente, et une version future est refusée sans écriture. `MAX_DOCUMENT_BYTES` est le même qu'en Rust (`settings_db.rs`), et `MAX_EXCLUSIONS` est choisi pour que le pire document valide tienne dedans (un test le vérifie).
- **Session de composition (lot 6.4)** : le module `session/` contient `session.ts` (`createSession`, le propriétaire de la conversation, du menu courant, des épingles et de l'opération en cours, créé une fois pour toute l'app comme le keeper). Le verrou est pris avant tout `await` : `send` n'est pas `async`, sa partie synchrone contrôle « déjà en cours », prépare l'entrée et publie `pending`, puis rend la promesse de l'opération. Les entrées de l'appel (réglages lus, équipement, exclusions, modèle, menu, épingles) sont calculées une fois au clic puis gelées (`deepFreeze`), et les changements faits pendant l'appel sont ignorés. `send` ne rejette jamais : tout échec devient un `failure` du snapshot. Le résultat est publié en une seule fois, avec `pending` nul et `outcomes + 1`.
- **Historique (lot 6.5a)** : le module `history/` contient `history.ts` (`HistoryEntrySchema` du document `entry` d'une ligne d'historique, `version: 1`, avec une vraie date `AAAA-MM-JJ` ; `serializeHistoryEntry` ; `readHistory`, qui ne lève jamais et compte les lignes illisibles ; `pastMenus`, les plats des 5 derniers menus donnés à l'IA ; `localDateText`). Le port `HistoryStore` (`ports/history-store.ts`) transporte du texte et des octets : l'app l'implémente par des commandes Rust (`apps/desktop/src/platform/tauri-history-store.ts`). `MAX_PDF_BYTES` (1 Mio) est le même qu'en Rust (`history.rs`) : un test de `history.test.ts` le vérifie en lisant le fichier Rust. Le point d'entrée `core/fixtures` (`src/pdf/fixture.ts`) donne la fiche d'exemple et `fixtureReplies()` ; il n'est importé que par des tests, et le script `test` le charge sous Node (`node src/pdf/fixture.ts`).
- **Cases cochées de l'écran Ingrédients (lot 6.6)** : `history/checks.ts` prépare la vue de la liste de courses (`shoppingChecklist`, déjà passée par `printable`, et `shoppingKey`, la clé d'une case : celle de regroupement de `buildShoppingList`) et lit `history.checked` (`readChecked`, qui ne lève jamais). `history/check-keeper.ts` (`createCheckKeeper`) est le propriétaire des cases : état complet à chaque coche, une écriture à la fois par entrée, et une réponse ne touche jamais l'état affiché. `MAX_CHECKED_BYTES` (256 Kio) est le même qu'en Rust (`history.rs`) : un test de `history.test.ts` le vérifie en lisant le fichier Rust.
- Messages de validation en français : chaque schéma Zod porte son `error`, et un test vérifie qu'aucun message ne contient « Invalid », « expected », « Required » ni « received ».

## 2. SDK Anthropic

Il vit dans `packages/core/src/ai/`, comme la conception le demande. Il reçoit une fonction `fetch` construite à partir du port `HttpClient`, avec `Request` et `Response`. Le SDK ne fait donc aucun appel réseau par lui-même.

Le client est construit dans `src/ai/anthropic-client.ts` avec des options toutes explicites, pour qu'il ne lise de l'environnement que ce qu'on ne peut pas éviter :

- `apiKey` : la clé reçue du `SecretStore` (le SDK l'envoie en `Authorization: Bearer`, ce qu'attend aussi Mammouth), et, dans l'app, une clé factice : le Rust ajoute la vraie (`ai_send`). On ne passe pas `authToken`, exclusif d'`apiKey`.
- `browser` : vrai dans la vue web de l'app (il devient `dangerouslyAllowBrowser`, que le SDK exige dès qu'il voit un navigateur), faux pour la CLI. Il choisit aussi les textes d'erreur de `describeApiError` : ceux de l'app renvoient aux Réglages, ceux de la CLI citent les variables d'environnement.
- `baseURL` : donnée par le code Node pour la CLI, et dans l'app par `createAppModel` (`MAMMOUTH_BASE_URL`) ; le SDK ajoute `/v1/messages`.
- `fetch` : adapté du port `HttpClient`.
- `webhookKey: null` : sans cela, le SDK lit `ANTHROPIC_WEBHOOK_SIGNING_KEY`.
- `openTelemetry: false` : sans cela, il lit les variables `ANTHROPIC_OPEN_TELEMETRY*`.
- `maxRetries: 0` : aucun nouvel essai caché qui facturerait deux fois.
- `logLevel: "warn"` et `logger` : le journal vient du code Node pour la CLI, et dans l'app de `createAppModel` (`console`) ; le code pur n'a pas `console`.

**Dette nommée** : le constructeur du SDK lit toujours `ANTHROPIC_CUSTOM_HEADERS`, aucune option ne l'empêche. C'est un code venu d'une dépendance qui accède lui-même à l'extérieur (§6, point 1) : accepté.

Autre dette du même ordre : pour un modèle déprécié, le SDK écrit directement dans `console.warn`, même avec un `logger` fourni.

`core` exporte la session (`createSession`), le schéma de réponse (`MenuReplySchema`) et des aides d'affichage (`RULE_LABELS`, `describeIngredient`, `printable`), sans le SDK. `composeMenu` et `reviseMenu` sont appelés par la session et ne sont pas exportés : `session.ts` n'importe que `ai/compose.ts`, qui n'importe pas le SDK. `platform/services.ts` charge `platform/ai-model.ts` par `import()` au premier appel ; c'est ce module qui importe `core/ai`, dans un morceau JS à part.

Le SDK est exposé par un point d'entrée à part, `core/ai` (`src/ai/index.ts`, hors de `src/index.ts` pour que l'écran Réglages n'importe pas le SDK). Il exporte aussi `TransportError`, l'erreur d'un transport qui échoue en local (trousseau, taille, réseau, délai) : son message, déjà en français et sans la clé, s'affiche tel quel, `describeApiError` le rendant quand elle est la `cause` d'une erreur de connexion du SDK. Le script `test` charge ce point d'entrée sous Node (`node src/ai/index.ts`).

Les erreurs du client ne sortent jamais telles quelles : `complete` les traduit en français (`describeApiError`) et en retire la clé et toute suite `Bearer …` (`redact`). Le cycle de composition ne dépend donc pas du SDK. Le SDK rend le JSON reçu sans le vérifier : `complete` lit la réponse par `readMessage`, dans le même `try`, qui vérifie le type de tout ce qu'elle lit (`content` tableau d'objets, `text` chaîne pour un bloc texte, `stop_reason` chaîne ou `null`, compteurs d'usage nombres finis, ceux du cache absents ou `null` comptant 0), sinon « Réponse de l'IA inattendue. ». Une réponse 2xx sans `content-type` JSON, sans corps ou mal typée finit donc sur cette phrase, jamais sur une `TypeError` en anglais. `describeApiError` ne lève jamais : elle reprend le texte de l'API (`apiMessage`) s'il est une chaîne, sinon, si le SDK a lu un corps d'erreur JSON (`error.error`), le message du SDK (`error.message`) s'il en est une, et tout son corps est dans un `try` dont le repli est « Erreur de l'API. ».

Le `throw` qui suit ce `catch` porte `// eslint-disable-next-line preserve-caught-error` : on ne joint pas l'erreur d'origine (`cause`), parce qu'elle peut contenir la clé et que Node l'afficherait en entier.

**Règle** : l'environnement (`ANTHROPIC_API_KEY`, `ANTHROPIC_BASE_URL`, `ANTHROPIC_MODEL`, `FMH_DISABLE`) n'est lu que dans `packages/core/src/node/`.

## 2 bis. PDF (pdfmake)

- La fiche est **décrite** par le code pur : `src/pdf/sheet.ts` rend une définition de document (`TDocumentDefinitions`), sans effet de bord. Il n'importe que des types de pdfmake, avec `import type { … } from "pdfmake/interfaces.js"` : le chemin `pdfmake/interfaces` seul n'est pas résolu par TypeScript en `NodeNext`, l'extension `.js` l'est (l'import de type est effacé, il n'y a aucun import réel).
- Le **rendu en octets, l'écriture du fichier et la date** sont dans `src/node/` (`render-pdf.ts`, `pdf-fonts.ts`). Le rendu navigateur est dans l'app (`apps/desktop/src/platform/pdf-renderer.ts`, pdfmake navigateur et son VFS Roboto, sans `setLocalAccessPolicy` que l'objet navigateur n'a pas) ; `core` garde la définition (`buildSheetDocument`) et `pdfmakeInput` (`src/pdf/pdfmake-input.ts`, pur : copie de la définition, titre et `creationDate`), que les deux rendus utilisent. Aucun import de pdfmake à l'exécution hors de `src/node/` et des tests. Vérification : `rg -n "from \"pdfmake" packages/core/src --glob '!**/node/**' --glob '!*.test.ts' | rg -v "import type"` ne doit rien afficher.
- `pdfmake` est un objet partagé par tout le processus. `renderPdf` remet donc polices et politiques d'accès à chaque appel, juste avant `createPdf`, qui les lit sur-le-champ. Les politiques d'accès sont `() => false` : pdfmake ne télécharge rien et ne lit aucun fichier.
- Effets constatés dans les sources (pdfmake 0.3.14, pdfkit 0.20.2), acceptés :
  - pdfkit exécute `new Date()` dans son constructeur (`CreationDate`), valeur ensuite remplacée par `info.creationDate`, que `renderPdf` fixe avec la date du port `Clock` : deux rendus avec la même date donnent la même `CreationDate` ;
  - pdfmake passe `font: null` à pdfkit, donc la police standard Helvetica (fichier AFM sur le disque) n'est pas chargée ;
  - les polices (Roboto, livrée dans le paquet pdfmake, quatre styles) arrivent en octets (`Uint8Array`), lues par `loadPdfFonts`. Aucun fichier de police n'est ajouté au dépôt.

### Écriture du fichier

- Sans `--out` : `open(…, "wx")` sur `menu-batch-AAAA-MM-JJ.pdf`, puis `-2`, `-3`… Le nom est réservé au moment d'écrire : deux commandes en même temps, ou un fichier créé pendant les appels, ne s'écrasent jamais.
- Avec `--out` : un temporaire au nom court dans le même dossier, puis `rename`. Si l'écriture échoue, l'ancien fichier reste intact. Le fichier remplacé garde ses bits de droits POSIX ; un nouveau fichier suit l'`umask`. **Limite** : les ACL et les attributs étendus d'un fichier remplacé ne sont pas gardés.
- La destination est contrôlée avant tout appel payé : dossier existant, accessible en écriture et en traversée ; cible absente (`ENOENT` seulement) ou fichier ordinaire, pas un lien symbolique, accessible en écriture.
- Les erreurs de stdout et stderr (tube fermé…) sont ignorées (`guardOutputStreams`) : les erreurs de sortie ne changent pas le code de sortie, qui dit seulement si le PDF a été écrit. Le PDF est écrit avant le résumé.

## 2 ter. Texte venu de l'IA

- Avant d'imprimer et avant de comparer des noms (`lightNormalize`, exclusions), les caractères `\p{Default_Ignorable_Code_Point}` sont supprimés (`domain/invisible.ts`). Les contrôles C0/C1 et U+2028/2029 deviennent une espace (`printable`, `src/ai/printable.ts`). Un texte vide une fois imprimé est refusé par le contrôle (`isBlankWhenPrinted`).
- Dans l'app, tout texte venu de l'IA (noms de plats et d'ingrédients, note, messages des constats, erreur technique) s'affiche après `printable`, qui est exporté par `core`. Les données de la session ne sont pas modifiées : le nettoyage se fait à l'affichage. Un aliment ajouté par « éviter » garde son nom brut dans les réglages, et l'écran Réglages l'affiche lui aussi par `printable`.
- Les repères `{a.1}` du détail sont lus par un seul analyseur (`parseStepText`, `src/pdf/step-text.ts`), partagé par le contrôle et le rendu.

## 3. Globales

- Le code pur n'utilise que les globales d'ECMAScript et la liste `portableGlobals` d'`eslint.config.js` (`URL`, `Request`, `Response`, `Headers`, `TextEncoder`, `AbortController`…). Elles s'écrivent directement.
- Pas de `globalThis` : ni `globalThis.X`, ni `globalThis["X"]`, ni `const g = globalThis`, ni déstructuration. Le code pur n'en a jamais besoin.
- Pas de `console`.
- Le réseau, le disque, l'horloge, le hasard et l'environnement passent par un port. Le code pur reçoit ces accès par les ports : le SDK reçoit un `fetch` adapté depuis `HttpClient`, les fonctions métier reçoivent une date fournie par `Clock`. Seules les implémentations Node des ports (dans `src/node/`) lisent l'heure et font les requêtes.
- Le keeper (`settings-keeper.ts`) n'utilise que des promesses. Il n'emploie pas `queueMicrotask` pour relancer l'erreur d'un abonné : elle ferait échouer Vitest sur les tests qui la provoquent (raison écrite en commentaire dans le fichier).
- On peut ajouter à `portableGlobals` une API sans entrée-sortie. Le plan du lot concerné le dit.

## 4. Types

Les types propres au DOM ou à Node (`RequestInit`, `HeadersInit`, `DOMException`, `NodeJS.*`…) ne sont pas disponibles dans le code pur : ESLint refuse leurs noms comme globales. Pour les obtenir, on les dérive d'une API permise **en position de type** :

```ts
type Fetch = typeof globalThis.fetch;
type RequestOptions = Parameters<typeof globalThis.fetch>[1];
```

En position de valeur, `typeof globalThis.fetch` est refusé.

## 5. Heure et dates

- Toute date arrive en argument, depuis le port `Clock`. Ce paramètre n'est pas optionnel (`at: Date`, pas `at?: Date`).
- Sont refusés : `Date.now()`, `new Date()` sans argument, `Date()`, `Temporal.Now`, `AbortSignal.timeout`.
- Un appel `format()` ou `formatToParts()` **sans argument** est refusé, quel que soit l'objet, parce que `Intl.DateTimeFormat#format()` lit l'heure courante. Une méthode métier ne s'appelle donc pas `format()` sans paramètre : la nommer `render()`, `toText()`…
- Pour les erreurs zod, utiliser `z.prettifyError(error)`, pas `error.format()`.

## 6. Principe d'arrêt de la garde (dette assumée)

> **Ce que la garde couvre.** Dans le code pur de `packages/core` (tout sauf `src/node/` et les tests), ESLint refuse les accès **ordinaires** à l'extérieur :
> - modules Node, Tauri, React, Vite ;
> - imports vers `apps/`, `src/node/` ou les tests ;
> - import dynamique, `import.meta`, directives `/// <reference>` ;
> - toute globale qui n'est pas d'ECMAScript ou de la courte liste `portableGlobals`, y compris sous `typeof` ;
> - tout accès par `globalThis`, et toute copie de `globalThis` dans une variable ;
> - lecture de l'heure par `Date.now()`, `new Date()`, `Date()`, `Temporal.Now`, `format()` sans argument ;
> - minuterie par `AbortSignal.timeout` ;
> - `eval`, `new Function`, `console`.
>
> Par « ordinaire », on entend la manière dont on écrit ce code quand on ne cherche pas à contourner la règle.
>
> **Ce qu'elle ne couvre pas, par choix.**
> 1. **Les contournements délibérés** : conversion de type (`as`), `Reflect.get`, code venu d'une dépendance qui accède elle-même à l'extérieur.
> 2. **Les lectures implicites résiduelles** d'API ECMAScript permises : `Math.random()` ; les fuseaux et la langue par défaut de `Intl` et `toLocaleString` ; `format(at)` quand `at` vaut `undefined` ; une méthode d'une API permise qui s'appuie sur l'horloge et n'est pas listée ci-dessus.
> 3. **Les types** : les types Node sont visibles dans tout `core` (chargés explicitement par `tsconfig.json`, et le SDK Anthropic du lot 1 les charge aussi). La frontière tient par ESLint, pas par TypeScript.
>
> **Règle d'arrêt.** On ajoute une règle seulement quand un **usage ordinaire** trouvé dans du code réel ou en relecture passe la garde. Toute nouvelle règle arrive avec deux contre-épreuves : une qui doit échouer sur l'usage visé, et une qui doit passer sur un usage légitime proche. Un contournement délibéré ou une lecture implicite résiduelle n'appelle pas de règle nouvelle : il relève de la relecture du code. Les relecteurs des lots suivants jugent selon ce critère.

Pour ajouter une règle : constater que l'usage indésirable **passe** la garde actuelle (`pnpm lint`) ; préparer les deux contre-épreuves, la ligne qui doit échouer et la ligne légitime proche ; modifier `eslint.config.js` ; vérifier que la première échoue maintenant et que la seconde passe.

## 7. Historique de la garde (lot 0)

La garde a changé pendant le lot 0. Ces choix ne valent plus, mais on les garde pour ne pas les redécouvrir :

- Un second programme TypeScript sans types Node (`tsconfig.pure.json`) et un fichier témoin (`purity-check.ts`) ont existé, puis ont été **supprimés**. Le SDK Anthropic charge les types Node (via `undici-types`, constaté sur une copie jetable qui ajoutait le SDK) : aucun programme TypeScript ne peut contenir à la fois le code pur et la garantie « pas de types Node ». Garder le fichier témoin aurait échoué dès le lot 1.
- Une liste noire de globales (`fetch`, `process`…) a été remplacée par une **liste d'autorisation** (`no-undef` plus `portableGlobals`), parce qu'une liste noire est à compléter à chaque relecture.
- `globalThis.X` d'abord traité comme contournement délibéré a été **requalifié** en usage ordinaire, d'où l'interdiction de tout accès par `globalThis`.
