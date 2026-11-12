# Conventions de `packages/core`

Ce fichier dit comment écrire du code dans `packages/core` sans casser la frontière du code pur. Il vient du lot 0 (règles dans `eslint.config.js`). Les lots 1 à 7 le suivent. La conception (`docs/superpowers/specs/2026-11-12-family-meals-helper-design.md`, §10) dit pourquoi : `core` n'accède à l'extérieur que par des ports, pour pouvoir passer plus tard sur un serveur web.

## 1. Organisation

- `core` a un seul programme TypeScript (`packages/core/tsconfig.json`). Les types Node y sont visibles partout : `tsconfig.json` les charge explicitement (`"types": ["node"]`, avec `@types/node` en dépendance de `core`). Ce choix anticipe notamment le SDK Anthropic du lot 1, qui les charge de toute façon.
- Le code Node vit dans `packages/core/src/node/` : implémentations Node des ports, commandes de développement comme `compose`. ESLint y autorise Node.
- Les tests se nomment `*.test.ts` ou `*.spec.ts`. ESLint les traite comme du code Node : ils peuvent lire des fichiers.
- Tout le reste de `packages/core/src/` est le **code pur**. C'est lui que la garde surveille.
- `src/index.ts` réexporte le code pur et n'importe jamais `src/node/`. Le script `test` de `core` lance `node src/index.ts` avant Vitest : si un import de `index.ts` ne se résout pas sous Node, `pnpm test` échoue.
- Pour que Node charge le code tel quel, il faut :
  - des imports relatifs avec l'extension du fichier source (`.ts`, `.mts`, `.cts`). ESLint refuse les imports relatifs en `.js`, `.mjs` et `.cjs` ;
  - une syntaxe TypeScript effaçable (`erasableSyntaxOnly` : pas d'`enum` ni de `namespace`) ;
  - des imports de types écrits `import type { X } from "./module.ts"`. Le type d'import `import("./module.ts").X` est refusé dans le code pur (sélecteur `TSImportType`), à ne pas confondre avec l'import dynamique, aussi refusé.
- Un script de `core` se déclare dans `packages/core/package.json`, sans toucher à ESLint ni aux tsconfig. Par exemple `compose` : `node src/node/compose.ts`.

## 2. SDK Anthropic

Il vit dans `packages/core/src/ai/`, comme la conception le demande. Il reçoit une fonction `fetch` construite à partir du port `HttpClient`, avec `Request` et `Response`. Le SDK ne fait donc aucun appel réseau par lui-même.

## 3. Globales

- Le code pur n'utilise que les globales d'ECMAScript et la liste `portableGlobals` d'`eslint.config.js` (`URL`, `Request`, `Response`, `Headers`, `TextEncoder`, `AbortController`…). Elles s'écrivent directement.
- Pas de `globalThis` : ni `globalThis.X`, ni `globalThis["X"]`, ni `const g = globalThis`, ni déstructuration. Le code pur n'en a jamais besoin.
- Pas de `console`.
- Le réseau, le disque, l'horloge, le hasard et l'environnement passent par un port. Le code pur reçoit ces accès par les ports : le SDK reçoit un `fetch` adapté depuis `HttpClient`, les fonctions métier reçoivent une date fournie par `Clock`. Seules les implémentations Node des ports (dans `src/node/`) lisent l'heure et font les requêtes.
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
