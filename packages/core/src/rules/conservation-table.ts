import { CATEGORIES, CATEGORY_LABELS } from "../domain/ingredient.ts";
import type { Category, Form, IngredientRef } from "../domain/ingredient.ts";

// Données de conservation et de congélation (conception §6.1, §6.2). Sources : `docs/research/cuisine-addict-regles.md`
// (CA ci-dessous, avec la section ou la ligne). Principe : frigo = borne basse de la fourchette (« à minima »,
// CA §3.1 : des enfants mangent ces plats) et, quand deux pages se contredisent, la valeur la plus courte
// (CA §3.9, conception §6.1).

// yes : se congèle ; poor : « +/- » ou « déconseillé » (CA §3.4) ; no : ne se congèle pas.
export type Freeze = "yes" | "poor" | "no";

export const FRIDGE_DAYS_BY_CATEGORY: Readonly<Record<Category, number | null>> = {
  // CA §3.2 plat cuisiné à base de poisson, crustacés cuits 1 à 2 j
  fish: 1,
  "oily-fish": 1,
  seafood: 1,
  // CA §3.2 préparations œufs/crème 2 à 3 j ; §3.9 quiche 2 à 3 j
  egg: 2,
  dairy: 2, // CA §3.9 soupe avec crème 2 j
  // CA ligne 186 pommes de terre sautées ou en purée 2 j ; §3.9 gratin 2 à 3 j (valeur validée par l'utilisateur)
  potato: 2,
  // CA §3.2 gratin avec pâtes et/ou viande 3 à 4 j
  cheese: 3,
  // CA §3.2 mijotés 3 à 4 j, viande hachée cuite 3 j, volaille cuite 3 à 4 j
  "red-meat": 3,
  pork: 3,
  "cured-meat": 3,
  poultry: 3,
  // CA §3.3 légumes seuls 4/5 j contre §3.2 légumes poêlés 5 j : le plus court
  vegetable: 4,
  fruit: 4,
  // CA §3.2 légumineuses cuites 5 à 7 j ; riz 5 j, pâtes 5 j
  pulse: 5,
  "whole-starch": 5,
  "refined-starch": 5,
  // Ne limitent pas la conservation d'un plat.
  fat: null,
  "herb-spice": null,
  condiment: null,
  sugar: null,
  other: null,
};

export const FREEZE_BY_CATEGORY: Readonly<Record<Category, Freeze>> = {
  // CA §3.4 poisson cuit oui ; CA ligne 293 : un produit cru décongelé puis cuit à cœur peut être recongelé
  fish: "yes",
  "oily-fish": "yes",
  seafood: "yes",
  egg: "yes", // CA §3.4 quiches oui
  // CA §3.4 béchamel, soupes avec crème +/-
  dairy: "poor",
  // CA ligne 255 : purée ou gratin déconseillé
  potato: "poor",
  // CA §3.4 gratins « sans le fromage de préférence »
  cheese: "poor",
  // CA §3.4 viande cuite oui
  "red-meat": "yes",
  pork: "yes",
  "cured-meat": "yes",
  poultry: "yes",
  // CA §3.4 légumes rôtis ou poêlés oui ; CA §1.6 « congeler les plats qui attendront plus de 4 jours »
  vegetable: "yes",
  fruit: "yes",
  pulse: "poor", // CA §3.4 déconseillé
  // CA §3.4 riz, pâtes non (CA §3.9 : conflit sur le riz, la valeur la plus prudente)
  "whole-starch": "no",
  "refined-starch": "no",
  fat: "yes",
  "herb-spice": "yes",
  condiment: "yes",
  sugar: "yes",
  other: "yes",
};

export interface Keeping {
  // Absent : valeur de la catégorie. `null` : ne limite pas la conservation.
  fridgeDays?: number | null;
  freeze?: Freeze;
}

// Exceptions par nom du référentiel (clé = `ref.name`), prioritaires sur la catégorie.
export const KEEPING_BY_NAME: Readonly<Record<string, Keeping>> = {
  // CA §3.2 champignons poêlés 1 à 2 j ; §3.7 « sous 24 à 48 h » ; §3.4 champignons cuits oui
  "champignon de Paris": { fridgeDays: 1, freeze: "yes" },
  // CA §3.2 légumes gorgés d'eau 2 j. Approximation retenue : source l.246 (non) contre l.264 sauce tomate
  // (oui) ; le code ne voit pas la cuisson.
  tomate: { fridgeDays: 2, freeze: "poor" },
  concombre: { fridgeDays: 2, freeze: "no" },
  // CA ligne 211 salade verte, crudités 2/3 j ; §3.2 salade lavée 3 à 4 j : la valeur la plus courte (§3.9) ;
  // ligne 245 salades vertes non
  laitue: { fridgeDays: 2, freeze: "no" },
  mâche: { fridgeDays: 2, freeze: "no" },
  // CA ligne 245 « choux à feuilles : non » (lecture prudente : chou vert, frisé, de Milan, chou rouge)
  "chou vert": { freeze: "no" },
  "chou rouge": { freeze: "no" },
  // CA §3.2 sauce tomate cuisinée 3 à 4 j ; §3.4 sauce tomate oui
  "tomate concassée": { fridgeDays: 3, freeze: "yes" },
  // CA ligne 272 fromages frais
  mozzarella: { fridgeDays: 3, freeze: "no" },
  ricotta: { fridgeDays: 3, freeze: "no" },
  "fromage de chèvre": { fridgeDays: 3, freeze: "no" },
  feta: { fridgeDays: 3, freeze: "no" },
  // CA §3.4 quinoa, boulgour +/-
  quinoa: { fridgeDays: 5, freeze: "poor" },
  boulgour: { fridgeDays: 5, freeze: "poor" },
  // Ne limitent pas (CA §3.4 quiches et tartes oui)
  farine: { fridgeDays: null, freeze: "yes" },
  pain: { fridgeDays: null, freeze: "yes" },
  "pâte brisée": { fridgeDays: null, freeze: "yes" },
  "pâte feuilletée": { fridgeDays: null, freeze: "yes" },
};

// Mots d'un ingrédient (cherchés en mots entiers, `sameDay` exclu) qui interdisent la congélation,
// connu ou non du référentiel. CA lignes 259, 262 et 272.
export const NOT_FREEZABLE_WORDS: readonly string[] = [
  "mayonnaise",
  "hollandaise",
  "tartare",
  "melon",
  "pastèque",
  "omelette",
  "œuf dur",
  "yaourt",
  "fromage frais",
  "fromage blanc",
  "faisselle",
];

// Pâtes (CA §1.5) : cuites le soir même, sauf dans un gratin, des lasagnes ou des cannelloni.
// Pâte identifiée : une de ces entrées du référentiel, ou un nom qui contient un mot de `PASTA_WORDS`.
export const PASTA_REF_NAMES: readonly string[] = ["pâtes", "pâtes complètes"];
export const PASTA_WORDS: readonly string[] = [
  "pâtes",
  "lasagne",
  "cannelloni",
  "macaroni",
  "spaghetti",
  "penne",
  "tagliatelle",
  "coquillette",
];
// Exception : le nom du plat ou de l'ingrédient contient un de ces mots.
export const PASTA_DISH_WORDS: readonly string[] = ["gratin", "lasagne", "cannelloni"];

// « a, b ou c ».
function orList(words: readonly string[]): string {
  return words.length <= 1
    ? words.join("")
    : `${words.slice(0, -1).join(", ")} ou ${words[words.length - 1]!}`;
}

// Phrase du prompt système, générée depuis PASTA_DISH_WORDS : le prompt et le contrôle ne divergent pas.
export const PASTA_SESSION_EXCEPTION_FR = `Seule exception : des pâtes se préparent pendant la session quand le nom du plat ou de l'ingrédient contient ${orList(PASTA_DISH_WORDS)}.`;
// Les pâtes d'un tel plat se congèlent mal plutôt que pas du tout : CA ligne 233 « Lasagnes cuites : Oui /
// déconseillée » (sources en désaccord, on garde le prudent « poor »).
export const PASTA_DISH_FREEZE: Freeze = "poor";

// Poisson et fruits de mer : seulement surgelés ou en conserve (décision de l'utilisateur, conception §6.3).
export const ALLOWED_FISH_FORMS: readonly Form[] = ["frozen", "canned"];

export const FRESH_FISH_CATEGORIES: readonly Category[] = ["fish", "oily-fish", "seafood"];

function labels(categories: readonly Category[]): string {
  return categories.map((category) => CATEGORY_LABELS[category]).join(", ");
}

function categoryOfName(refs: readonly IngredientRef[], name: string): Category | undefined {
  return refs.find((ref) => ref.name === name)?.category;
}

function namesWith(predicate: (keeping: Keeping) => boolean): string[] {
  return Object.entries(KEEPING_BY_NAME)
    .filter(([, keeping]) => predicate(keeping))
    .map(([name]) => name);
}

// Lignes du prompt système, générées à partir des tables ci-dessus : le prompt et le contrôle ne peuvent pas
// diverger.
export function conservationPromptLines(refs: readonly IngredientRef[]): string[] {
  const lines: string[] = [];
  const days = [
    ...new Set(
      CATEGORIES.map((category) => FRIDGE_DAYS_BY_CATEGORY[category]).filter(
        (value): value is number => value !== null,
      ),
    ),
  ].sort((a, b) => a - b);
  const byFamily = days.map(
    (count) =>
      `${count} j : ${labels(CATEGORIES.filter((category) => FRIDGE_DAYS_BY_CATEGORY[category] === count))}`,
  );
  const unlimited = CATEGORIES.filter((category) => FRIDGE_DAYS_BY_CATEGORY[category] === null);
  lines.push(
    `Durée au frigo d'un ingrédient préparé d'avance, par famille : ${byFamily.join(" ; ")}. Ne limitent pas la durée : ${labels(unlimited)}.`,
  );
  const exceptionDays = [
    ...new Set(
      namesWith((keeping) => typeof keeping.fridgeDays === "number").map(
        (name) => KEEPING_BY_NAME[name]!.fridgeDays as number,
      ),
    ),
  ].sort((a, b) => a - b);
  const byName = exceptionDays.map(
    (count) => `${count} j : ${namesWith((keeping) => keeping.fridgeDays === count).join(", ")}`,
  );
  lines.push(
    `Exceptions par ingrédient : ${byName.join(" ; ")}. Ne limitent pas la durée : ${namesWith((keeping) => keeping.fridgeDays === null).join(", ")}.`,
  );
  lines.push(
    "Un plat se garde aussi longtemps que son ingrédient préparé d'avance le plus fragile ; les ingrédients `sameDay` ne comptent pas.",
  );

  const freezeList = (level: Freeze): string => {
    const categories = CATEGORIES.filter((category) => FREEZE_BY_CATEGORY[category] === level);
    const names = namesWith((keeping) => keeping.freeze === level).filter((name) => {
      const category = categoryOfName(refs, name);
      return category === undefined || FREEZE_BY_CATEGORY[category] !== level;
    });
    const except = namesWith(
      (keeping) => keeping.freeze !== undefined && keeping.freeze !== level,
    ).filter((name) => {
      const category = categoryOfName(refs, name);
      return category !== undefined && FREEZE_BY_CATEGORY[category] === level;
    });
    const parts = [labels(categories), ...names];
    if (level === "no") parts.push(...NOT_FREEZABLE_WORDS);
    return `${parts.filter((part) => part !== "").join(", ")}${except.length === 0 ? "" : ` (sauf ${except.join(", ")})`}`;
  };
  const pastaException =
    "sauf les pâtes d'un gratin, de lasagnes ou de cannelloni (nom du plat ou de l'ingrédient) : se congèlent mal";
  lines.push(
    `Un plat servi après sa durée au frigo est congelé dès la fin de la session ; c'est interdit s'il contient un aliment qui ne se congèle pas : ${freezeList("no")} (${pastaException}). Évite en fin de semaine ce qui se congèle mal : ${freezeList("poor")}.`,
  );
  lines.push("Range les plats du plus fragile au moins fragile pour congeler le moins possible.");
  return lines;
}
