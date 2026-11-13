import type { Aisle, Category, Form, IngredientRef } from "../domain/ingredient.ts";

interface Extra {
  synonyms?: string[];
  variants?: string[];
  groups?: string[];
  seasonExempt?: boolean;
}
interface Defaults {
  category: Category;
  aisle: Aisle;
  form: Form;
  pantry: boolean;
}
type Maker = (name: string, extra?: Extra, over?: Partial<Defaults>) => IngredientRef;

// Fabrique d'entrées : les valeurs communes d'un groupe sont écrites une fois.
function group(defaults: Defaults): Maker {
  return (name, extra = {}, over = {}) => {
    const d = { ...defaults, ...over };
    return {
      name,
      synonyms: extra.synonyms ?? [],
      variants: extra.variants ?? [],
      groups: extra.groups ?? [],
      category: d.category,
      aisle: d.aisle,
      defaultForm: d.form,
      pantry: d.pantry,
      seasonExempt: extra.seasonExempt ?? false,
    };
  };
}

const veg = group({ category: "vegetable", aisle: "produce", form: "fresh", pantry: false });
const fruit = group({ category: "fruit", aisle: "produce", form: "fresh", pantry: false });
const herb = group({ category: "herb-spice", aisle: "produce", form: "fresh", pantry: false });
const spice = group({ category: "herb-spice", aisle: "savory-grocery", form: "dry", pantry: true });
const shelf = group({
  category: "condiment",
  aisle: "savory-grocery",
  form: "fresh",
  pantry: true,
});
const canned = group({ category: "other", aisle: "savory-grocery", form: "canned", pantry: false });
const meat = group({ category: "red-meat", aisle: "meat-fish", form: "fresh", pantry: false });
const fish = group({ category: "fish", aisle: "frozen", form: "frozen", pantry: false });
const dairy = group({ category: "dairy", aisle: "dairy", form: "fresh", pantry: false });
const starch = group({
  category: "refined-starch",
  aisle: "savory-grocery",
  form: "dry",
  pantry: false,
});

// Référentiel de départ : noms au singulier, avec accents (le nom est affiché).
// `groups` : termes d'exclusion plus larges que le nom (--exclude poulet).
export const REFERENTIAL: readonly IngredientRef[] = [
  // Légumes frais
  // ail, oignon, échalote, citron : en magasin toute l'année, exemptés de saison (conception §6.5)
  veg("ail", { seasonExempt: true }),
  veg("oignon", {
    variants: ["oignon jaune", "oignon rouge", "oignon blanc"],
    seasonExempt: true,
  }),
  veg("échalote", { seasonExempt: true }),
  veg("carotte"),
  veg("poireau"),
  veg("courgette", { variants: ["courgette jaune", "courgette ronde"] }),
  veg("aubergine"),
  veg("poivron", { variants: ["poivron rouge", "poivron jaune", "poivron vert"] }),
  veg("tomate", { variants: ["tomate cerise", "tomate grappe"], groups: ["tomate"] }),
  veg("concombre"),
  veg("laitue", {
    synonyms: ["salade verte"],
    variants: ["batavia", "feuille de chêne"],
  }),
  veg("mâche"),
  veg("épinard", { variants: ["pousse d'épinard"] }),
  veg("chou vert", { variants: ["chou frisé", "chou de Milan"], groups: ["chou"] }),
  veg("chou rouge", { groups: ["chou"] }),
  veg("chou-fleur", { groups: ["chou"] }),
  veg("brocoli"),
  veg("chou de Bruxelles", { groups: ["chou"] }),
  veg("haricot vert"),
  veg("petit pois"),
  veg("céleri-rave", { groups: ["céleri"] }),
  veg("céleri branche", { groups: ["céleri"] }),
  veg("betterave"),
  veg("navet"),
  veg("panais"),
  veg("potiron", { groups: ["courge"] }),
  veg("butternut", { synonyms: ["courge butternut"], groups: ["courge"] }),
  veg("potimarron", { groups: ["courge"] }),
  veg("fenouil"),
  veg("endive"),
  veg("champignon de Paris", { synonyms: ["champignon"] }),
  veg("radis"),
  veg("artichaut"),
  veg("asperge"),
  veg("blette", { synonyms: ["bette"] }),
  veg("topinambour"),
  veg("patate douce"),
  veg("maïs", {}, { form: "canned", aisle: "savory-grocery" }),
  // Fruits frais
  fruit("citron", { seasonExempt: true }),
  fruit("pomme"),
  fruit("poire"),
  fruit("orange"),
  fruit("clémentine"),
  fruit("figue"),
  fruit("raisin"),
  // Herbes fraîches
  herb("persil"),
  herb("coriandre"),
  herb("ciboulette"),
  herb("basilic"),
  herb("gingembre"),
  // Épices et herbes sèches
  spice("poivre"),
  spice("thym"),
  spice("laurier"),
  spice("cumin"),
  spice("curry"),
  spice("paprika"),
  spice("muscade"),
  spice("piment d'Espelette"),
  spice("herbes de Provence"),
  spice("cannelle"),
  // Placard
  shelf("sel", {}, { form: "dry" }),
  shelf("huile d'olive", {}, { category: "fat" }),
  shelf("huile de tournesol", {}, { category: "fat" }),
  shelf("vinaigre de vin"),
  shelf("vinaigre balsamique"),
  shelf("moutarde"),
  shelf("sauce soja"),
  shelf("bouillon de volaille", { groups: ["volaille", "viande"] }, { form: "dry" }),
  shelf("bouillon de légumes", {}, { form: "dry" }),
  shelf("concentré de tomate", { groups: ["tomate"] }, { form: "canned" }),
  shelf("farine", {}, { category: "refined-starch", form: "dry" }),
  shelf("sucre", {}, { category: "sugar", aisle: "sweet-grocery", form: "dry" }),
  shelf("miel", {}, { category: "sugar", aisle: "sweet-grocery" }),
  // Conserves et surgelés
  canned(
    "tomate concassée",
    { variants: ["pulpe de tomate"], groups: ["tomate"] },
    { category: "vegetable" },
  ),
  canned("lait de coco"),
  canned("pois chiche", {}, { category: "pulse" }),
  canned("haricot rouge", {}, { category: "pulse" }),
  canned("thon", { groups: ["poisson"] }, { category: "fish" }),
  canned("sardine", { groups: ["poisson"] }, { category: "oily-fish" }),
  canned(
    "crevette",
    { groups: ["fruits de mer"] },
    { category: "seafood", form: "frozen", aisle: "frozen" },
  ),
  // Viandes et poissons
  meat("bœuf à braiser", {
    synonyms: ["paleron", "macreuse", "gîte", "joue de bœuf", "bœuf bourguignon"],
    groups: ["bœuf", "viande"],
  }),
  meat("bœuf haché", {
    synonyms: ["steak haché", "viande hachée"],
    groups: ["bœuf", "viande"],
  }),
  meat("veau", { synonyms: ["sauté de veau"], groups: ["viande"] }),
  meat("agneau", { synonyms: ["épaule d'agneau"], groups: ["viande"] }),
  meat(
    "blanc de poulet",
    {
      synonyms: ["filet de poulet", "escalope de poulet"],
      groups: ["poulet", "volaille", "viande"],
    },
    { category: "poultry" },
  ),
  meat(
    "cuisse de poulet",
    { synonyms: ["haut de cuisse de poulet"], groups: ["poulet", "volaille", "viande"] },
    { category: "poultry" },
  ),
  meat("poulet entier", { groups: ["poulet", "volaille", "viande"] }, { category: "poultry" }),
  meat(
    "dinde",
    { synonyms: ["escalope de dinde"], groups: ["volaille", "viande"] },
    { category: "poultry" },
  ),
  meat(
    "échine de porc",
    { synonyms: ["rôti de porc"], groups: ["porc", "viande"] },
    { category: "pork" },
  ),
  meat("filet mignon de porc", { groups: ["porc", "viande"] }, { category: "pork" }),
  // Charcuterie : « Les saucisses de porc ou de volaille […] font partie de la charcuterie »
  // https://www.mangerbouger.fr/l-essentiel/les-recommandations-sur-l-alimentation-l-activite-physique-et-la-sedentarite/reduire/reduire-la-charcuterie
  meat(
    "saucisse",
    { variants: ["saucisse de Toulouse", "chipolata"], groups: ["porc", "viande"] },
    { category: "cured-meat" },
  ),
  meat("lardons", { groups: ["porc", "viande"] }, { category: "cured-meat" }),
  meat("jambon blanc", { groups: ["porc", "viande"] }, { category: "cured-meat" }),
  meat("chorizo", { groups: ["porc", "viande"] }, { category: "cured-meat" }),
  // Poisson : le foyer n'achète que du surgelé (ou de la conserve), jamais du frais (conception §6.3,
  // décision de l'utilisateur) ; le rayon servira à la liste de courses.
  fish("saumon", { groups: ["poisson"] }, { category: "oily-fish" }),
  fish("maquereau", { groups: ["poisson"] }, { category: "oily-fish" }),
  fish("cabillaud", { synonyms: ["dos de cabillaud"], groups: ["poisson"] }),
  fish("colin", { groups: ["poisson"] }),
  // Œufs et crèmerie
  dairy("œuf", {}, { category: "egg" }),
  dairy("lait"),
  dairy("crème fraîche", { synonyms: ["crème épaisse"], groups: ["crème"] }),
  dairy("crème liquide", { synonyms: ["crème fleurette"], groups: ["crème"] }),
  dairy("beurre", {}, { category: "fat" }),
  dairy("yaourt nature"),
  dairy(
    "emmental râpé",
    { synonyms: ["fromage râpé", "gruyère râpé"], groups: ["fromage"] },
    { category: "cheese" },
  ),
  dairy("parmesan", { groups: ["fromage"] }, { category: "cheese" }),
  dairy("comté", { groups: ["fromage"] }, { category: "cheese" }),
  dairy("mozzarella", { groups: ["fromage"] }, { category: "cheese" }),
  dairy("fromage de chèvre", { synonyms: ["chèvre"], groups: ["fromage"] }, { category: "cheese" }),
  dairy("feta", { groups: ["fromage"] }, { category: "cheese" }),
  dairy("ricotta", { groups: ["fromage"] }, { category: "cheese" }),
  dairy("pâte brisée", {}, { category: "refined-starch" }),
  dairy("pâte feuilletée", {}, { category: "refined-starch" }),
  // Féculents et légumes secs
  starch("riz basmati", { groups: ["riz"] }),
  starch("riz complet", { groups: ["riz"] }, { category: "whole-starch" }),
  starch("pâtes", {
    variants: ["spaghetti", "penne", "tagliatelle", "coquillettes"],
    groups: ["pâtes"],
  }),
  starch("pâtes complètes", { groups: ["pâtes"] }, { category: "whole-starch" }),
  starch("semoule"),
  starch("boulgour", {}, { category: "whole-starch" }),
  starch("quinoa", {}, { category: "whole-starch" }),
  starch("lentilles vertes", { groups: ["lentille"] }, { category: "pulse" }),
  starch("lentilles corail", { groups: ["lentille"] }, { category: "pulse" }),
  starch("pain"),
  {
    ...veg("pomme de terre", { variants: ["pomme de terre à chair ferme", "grenaille"] }),
    category: "potato",
  },
];
