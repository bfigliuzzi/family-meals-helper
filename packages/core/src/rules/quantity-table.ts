import type { Category } from "../domain/ingredient.ts";

// Fourchettes de quantité par portion adulte, en grammes de poids cru (conception §6.6). Ce sont des bornes de
// vraisemblance pour attraper une erreur de l'IA, pas des recommandations nutritionnelles.
export interface QuantityGroup {
  id: string;
  label: string;
  categories: readonly Category[];
  minPerAdult: number;
  maxPerAdult: number;
}

export const QUANTITY_GROUPS: readonly QuantityGroup[] = [
  // Conception §6.6 : « par exemple, 100 à 200 g de viande crue ».
  {
    id: "meat",
    label: "viande",
    categories: ["red-meat", "pork", "poultry"],
    minPerAdult: 100,
    maxPerAdult: 200,
  },
  // Portion de 100 g : « Une portion de poisson équivaut à 100g » (https://www.mangerbouger.fr/l-essentiel/les-recommandations-sur-l-alimentation-l-activite-physique-et-la-sedentarite/aller-vers/aller-vers-les-poissons-gras-et-maigres-en-alternance).
  // Borne basse abaissée à 60 g : du thon en conserve complète un plat sans en être la seule protéine.
  {
    id: "fish",
    label: "poisson",
    categories: ["fish", "oily-fish", "seafood"],
    minPerAdult: 60,
    maxPerAdult: 200,
  },
  // Vraisemblance (sec ou égoutté) ; borne haute à 250 g : des pois chiches en conserve (800 g pour 4) sont normaux.
  { id: "pulse", label: "légumes secs", categories: ["pulse"], minPerAdult: 40, maxPerAdult: 250 },
  // CA §1.2 : 100 g de pâtes par adulte (`docs/research/cuisine-addict-regles.md`).
  {
    id: "starch",
    label: "féculents",
    categories: ["whole-starch", "refined-starch"],
    minPerAdult: 40,
    maxPerAdult: 150,
  },
  // Vraisemblance.
  {
    id: "potato",
    label: "pommes de terre",
    categories: ["potato"],
    minPerAdult: 100,
    maxPerAdult: 350,
  },
  // Portion de 80 à 100 g : « Une portion « adulte », c'est l'équivalent de 80 à 100 grammes »
  // (https://www.mangerbouger.fr/l-essentiel/les-recommandations-sur-l-alimentation-l-activite-physique-et-la-sedentarite/augmenter/augmenter-les-fruits-et-legumes) ; plafond de vraisemblance. Borne basse abaissée à 50 g :
  // un plat où le légume est un complément (hachis, carotte 300 g pour 4) reste plausible.
  {
    id: "vegetable",
    label: "légumes",
    categories: ["vegetable"],
    minPerAdult: 50,
    maxPerAdult: 500,
  },
];
