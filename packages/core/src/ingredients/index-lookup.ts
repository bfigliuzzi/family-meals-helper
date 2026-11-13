import type { IngredientRef } from "../domain/ingredient.ts";
import { lightNormalize, normalizeName } from "./normalize.ts";

export interface IngredientIndex {
  find(name: string): IngredientRef | undefined;
  keysOf(ref: IngredientRef): readonly string[];
  // Les entrées à partir desquelles l'index est construit.
  refs: readonly IngredientRef[];
  scan(text: string): { refs: IngredientRef[]; rest: string };
  requestedIn(request: string): IngredientRef[];
}

const NEGATIVE_MARKERS = new Set([
  "sans",
  "pas",
  "ni",
  "aucun",
  "aucune",
  "sauf",
  "evite",
  "eviter",
  "evitez",
  "jamais",
]);

// Retire le mot « mais » (la conjonction) sans toucher à « maïs » : « mais pas de tomate » ne doit
// pas faire lire « mais » comme du maïs. Limite : « mais » écrit pour « maïs » n'exempte plus le maïs.
function withoutBut(sentence: string): string {
  return sentence.replace(/(^|[^\p{L}])mais(?=$|[^\p{L}])/giu, "$1 ");
}

// Invariant N (roadmap, bilan du lot 1). Sert seulement à `requestedIn` : prendre à tort un
// ingrédient pour demandé l'exempterait du contrôle de saison, donc on coupe large.
// On découpe en phrases, seulement sur . ; ! ? et le retour à la ligne : ni virgule, ni
// parenthèse, ni mot ne sont des limites. Dans chaque phrase, on garde les mots qui précèdent le
// premier marqueur négatif ; tout ce qui le suit est ignoré jusqu'à la fin de la phrase.
// Les phrases ne sont jamais rejointes : une clé du référentiel ne peut pas en enjamber deux.
function requestedParts(text: string): string[] {
  const parts: string[] = [];
  for (const sentence of text.split(/[.;!?\n]/)) {
    const words = lightNormalize(withoutBut(sentence))
      .split(" ")
      .filter((word) => word !== "");
    const marker = words.findIndex((word) => NEGATIVE_MARKERS.has(word));
    const kept = (marker === -1 ? words : words.slice(0, marker)).join(" ");
    if (kept !== "") parts.push(kept);
  }
  return parts;
}

export function containsWords(text: string, term: string): boolean {
  const wanted = normalizeName(term);
  if (wanted === "") return false;
  return ` ${normalizeName(text)} `.includes(` ${wanted} `);
}

export function buildIngredientIndex(refs: readonly IngredientRef[]): IngredientIndex {
  const byKey = new Map<string, IngredientRef>();
  const keys = new Map<IngredientRef, string[]>();
  for (const ref of refs) {
    const own: string[] = [];
    for (const label of [ref.name, ...ref.synonyms, ...ref.variants]) {
      const key = normalizeName(label);
      const owner = byKey.get(key);
      if (owner !== undefined && owner !== ref) {
        throw new Error(`Clé « ${key} » partagée entre « ${owner.name} » et « ${ref.name} ».`);
      }
      byKey.set(key, ref);
      if (!own.includes(key)) own.push(key);
    }
    keys.set(ref, own);
  }
  const keyWords = [...byKey.keys()].map((key) => ({
    words: key.split(" "),
    ref: byKey.get(key)!,
  }));
  const longest = Math.max(1, ...keyWords.map((entry) => entry.words.length));

  function scan(text: string): { refs: IngredientRef[]; rest: string } {
    const words = normalizeName(text)
      .split(" ")
      .filter((word) => word !== "");
    const found: IngredientRef[] = [];
    const rest: string[] = [];
    let i = 0;
    while (i < words.length) {
      let matched = false;
      for (let length = Math.min(longest, words.length - i); length >= 1 && !matched; length--) {
        const candidate = words.slice(i, i + length).join(" ");
        const ref = byKey.get(candidate);
        if (ref !== undefined) {
          if (!found.includes(ref)) found.push(ref);
          i += length;
          matched = true;
        }
      }
      if (!matched) {
        rest.push(words[i]!);
        i++;
      }
    }
    return { refs: found, rest: rest.join(" ") };
  }

  function requestedIn(request: string): IngredientRef[] {
    const found: IngredientRef[] = [];
    for (const part of requestedParts(request)) {
      for (const ref of scan(part).refs) {
        if (!found.includes(ref)) found.push(ref);
      }
    }
    return found;
  }

  return {
    refs,
    find: (name) => byKey.get(normalizeName(name)),
    keysOf: (ref) => keys.get(ref) ?? [],
    scan,
    requestedIn,
  };
}
