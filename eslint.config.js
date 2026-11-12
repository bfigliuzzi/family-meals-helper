import { builtinModules } from "node:module";
import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

const portMessage = "core n'accède pas directement à l'extérieur : passer par un port.";
const platformImports = {
  group: ["@tauri-apps/*", "react", "react/*", "react-dom", "react-dom/*"],
  message: "core ne dépend ni de Tauri ni de React : passer par un port.",
};
const jsExtensionImports = {
  regex: "^\\.{1,2}/.*\\.[cm]?js$",
  message: "Import relatif vers un fichier TypeScript : écrire l'extension .ts, .mts ou .cts.",
};
const appImports = {
  regex: "(^|/)apps/",
  message: "core ne dépend pas des applications : c'est l'inverse.",
};
// Code pur de core : no-undef n'y accepte que les globales d'ECMAScript, plus ces API
// communes à Node et au navigateur, qui ne font ni réseau, ni disque, ni horloge.
const portableGlobals = Object.fromEntries(
  [
    "AbortController",
    "AbortSignal",
    "Headers",
    "Request",
    "Response",
    "TextDecoder",
    "TextEncoder",
    "URL",
    "URLSearchParams",
    "queueMicrotask",
    "structuredClone",
  ].map((name) => [name, "readonly"]),
);
const coreFiles = ["packages/core/**/*.{ts,tsx,mts,cts}"];
const coreTestFiles = ["packages/core/**/*.{test,spec}.{ts,tsx,mts,cts}"];
const coreNodeFiles = ["packages/core/src/node/**"];

export default defineConfig(
  globalIgnores(["**/dist/", "**/src-tauri/", "docs/", ".serena/", ".worktrees-buildplan/"]),
  js.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
  },
  { files: ["**/*.js"], extends: [tseslint.configs.disableTypeChecked] },
  { files: ["apps/desktop/**/*.{ts,tsx}"], extends: [reactHooks.configs.flat.recommended] },
  {
    files: coreFiles,
    ignores: [...coreTestFiles, ...coreNodeFiles],
    languageOptions: { globals: portableGlobals },
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: builtinModules.map((name) => ({ name, message: portMessage })),
          patterns: [
            platformImports,
            jsExtensionImports,
            appImports,
            { group: ["node:*"], message: portMessage },
            {
              group: ["vite", "vite/*", "vitest", "vitest/*", "@types/*"],
              message: "Outil de développement : réservé aux tests.",
            },
            {
              regex: "(^|/)node/|\\.(test|spec)\\.[cm]?tsx?$",
              message: "Le code pur de core n'importe ni src/node/ ni les tests.",
            },
          ],
        },
      ],
      "no-restricted-syntax": [
        "error",
        { selector: "ImportExpression", message: "Pas d'import dynamique dans core." },
        {
          selector: "MetaProperty[meta.name='import']",
          message: "Pas d'import.meta dans le code pur : il dépend de l'environnement.",
        },
        {
          selector: "TSImportType",
          message: "Écrire « import type { X } from … » : ses frontières sont contrôlées.",
        },
        {
          selector:
            "MemberExpression[object.name='globalThis'], VariableDeclarator[init.name='globalThis']",
          message:
            "Pas d'accès par globalThis dans le code pur : écrire la globale permise directement.",
        },
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message: "L'heure courante passe par le port Clock.",
        },
        {
          selector:
            "CallExpression[arguments.length=0] > MemberExpression.callee[property.name=/^format(ToParts)?$/]",
          message:
            "Sans argument, format() lit l'heure courante : passer la date reçue du port Clock.",
        },
        {
          selector: "CallExpression[callee.name='Date']",
          message: "L'heure courante passe par le port Clock.",
        },
      ],
      "no-restricted-properties": [
        "error",
        { object: "Date", property: "now", message: "L'heure courante passe par le port Clock." },
        {
          object: "Temporal",
          property: "Now",
          message: "L'heure courante passe par le port Clock.",
        },
        {
          object: "AbortSignal",
          property: "timeout",
          message: "Un délai réel passe par le port Clock.",
        },
      ],
      "no-eval": "error",
      "no-console": "error",
      "no-undef": ["error", { typeof: true }],
      "@typescript-eslint/triple-slash-reference": [
        "error",
        { lib: "never", path: "never", types: "never" },
      ],
      "no-new-func": "error",
      "no-restricted-globals": [
        "error",
        {
          globals: ["process", "Buffer", "require", "fetch", "WebSocket", "global"].map((name) => ({
            name,
            message: portMessage,
          })),
          checkGlobalObject: true,
        },
      ],
    },
  },
  {
    files: [...coreTestFiles, ...coreNodeFiles],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [platformImports, jsExtensionImports, appImports] },
      ],
    },
  },
);
