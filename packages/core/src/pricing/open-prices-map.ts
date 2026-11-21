// Correspondance ingrédient → étiquettes Open Prices, écrite à la main (lot 7.4). Elle vit ici et non dans le
// référentiel : ces étiquettes sont propres à une source et bruitées. Une étiquette ne suffit pas à reconnaître un
// produit (lait infantile dans `en:milks`, œufs de caille dans `en:eggs`, beurre aux pépites de chocolat dans
// `en:butters`…) : un relevé `PRODUCT` n'est retenu pour une clé que s'il passe les cinq contrôles de
// `selectProductEntry` (`open-prices.ts`) : une catégorie voulue, aucune catégorie exclue, une unité de paquet
// voulue, un mot voulu dans le nom, aucun mot interdit dans le nom. Les mots sont écrits normalisés
// (`lightNormalize` : minuscules, sans accent, `œ` → `oe`) ; une entrée qui contient une espace se cherche comme
// suite de mots. `open-prices-real.test.ts` vérifie la carte sur les vrais fichiers ; `docs/research/sources-prix.md`
// garde les mesures.

export interface OpenPricesEntry {
  // « forme|nom canonique » (`shoppingKey`).
  key: string;
  // Relevés `CATEGORY`.
  categoryTags?: readonly string[];
  // Un relevé `CATEGORY` en `UNIT` donne un prix à la pièce (jamais pour la tomate, la banane, la pomme de terre : des
  // prix au kilo mal étiquetés).
  pieceOk?: boolean;
  // Relevés `PRODUCT`, joints à `products.jsonl` (étiquettes `categories_tags`).
  productTags?: readonly string[];
  excludeTags?: readonly string[];
  // Unités de paquet acceptées (`g` donne un prix au kilo, `ml` un prix au litre) ; obligatoire avec `productTags`.
  units?: readonly ("g" | "ml")[];
  requireWords?: readonly string[];
  forbidWords?: readonly string[];
}

// Exclusions de catégorie valables pour toute entrée produit : plats, produits cuits ou panés, surgelés, aliments
// pour bébé, préparations pour dessert, œufs de caille.
export const GLOBAL_PRODUCT_EXCLUDE: readonly string[] = [
  "en:precooked-rices",
  "fr:cuites",
  "en:meals",
  "en:microwave-meals",
  "en:refrigerated-meals",
  "en:canned-meals",
  "en:plant-based-meals",
  "en:meal-kits",
  "en:breaded-products",
  "en:cooked-chicken",
  "en:cooked-poultries",
  "en:prepared-meats",
  "en:prepared-poultry-meats",
  "en:prepared-chicken-meats",
  "en:poultry-hams",
  "en:frozen-foods",
  "en:baby-foods",
  "en:dessert-mixes",
  "en:quail-eggs",
];

// Mots interdits dans le nom de toute entrée produit.
export const GLOBAL_FORBIDDEN_WORDS: readonly string[] = [
  "cuit",
  "cuits",
  "cuite",
  "cuites",
  "roti",
  "rotis",
  "rotie",
  "micro",
  "ondable",
  "microwave",
  "pane",
  "panes",
  "surgele",
  "surgeles",
  "express",
  "doypack",
  "infantile",
  "bebe",
  "caille",
  "chocolat",
  "cacao",
  "saveur",
  "aromatise",
  "epices",
  "melange",
  "pret",
  "saute",
];

const CREAM_EXCLUDE = [
  "en:whipped-creams",
  "en:squirty-creams",
  "en:alcoholic-beverages",
  "en:evaporated-milks",
] as const;

const WHOLE_WORDS = [
  "complet",
  "complets",
  "complete",
  "completes",
  "integral",
  "integrale",
  "integrales",
  "integraux",
  "whole",
] as const;

const PREPARED_LENTILS = ["en:prepared-lentils", "en:canned-lentils", "en:canned-legumes"] as const;

// L'ordre compte : la première entrée qui correspond gagne (crème liquide avant crème fraîche ; pâtes complètes avant
// pâtes). `fresh|poulet entier` n'est pas relié : l'étiquette `en:chickens` ramène nuggets, cordons bleus et plats.
export const OPEN_PRICES_MAP: readonly OpenPricesEntry[] = [
  { key: "fresh|carotte", categoryTags: ["en:carrots"] },
  { key: "fresh|tomate", categoryTags: ["en:tomatoes"] },
  {
    key: "fresh|pomme de terre",
    categoryTags: ["en:potatoes", "en:charlotte-potatoes", "en:grenaille-potatoes"],
  },
  {
    key: "fresh|oignon",
    categoryTags: ["en:yellow-onions", "en:onions", "en:red-onions", "en:fresh-red-onions"],
  },
  { key: "fresh|courgette", categoryTags: ["en:zucchini", "en:fresh-zucchini"] },
  { key: "fresh|poireau", categoryTags: ["en:leeks"] },
  {
    key: "fresh|pomme",
    categoryTags: [
      "en:apples",
      "en:apples-chantecler",
      "en:ariane-apples",
      "en:canada-reinettes-apples",
      "en:gala-apples",
      "en:golden-delicious-apples",
      "en:granny-smith-apples",
      "en:idared-apples",
      "en:jonagold-apples",
      "en:pink-lady",
      "en:red-delicious-apples",
    ],
  },
  { key: "fresh|citron", categoryTags: ["en:lemons", "en:eureka-lemons"], pieceOk: true },
  {
    key: "fresh|laitue",
    categoryTags: ["en:lettuces", "fr:batavia", "en:batavia-lettuces"],
    pieceOk: true,
  },
  { key: "fresh|concombre", categoryTags: ["en:cucumbers"], pieceOk: true },
  { key: "fresh|ail", categoryTags: ["en:garlic", "en:garlics"] },
  { key: "fresh|chou-fleur", categoryTags: ["en:cauliflowers"], pieceOk: true },
  { key: "fresh|artichaut", categoryTags: ["en:artichokes"], pieceOk: true },
  {
    key: "fresh|œuf",
    categoryTags: ["en:eggs", "en:chicken-eggs"],
    pieceOk: true,
    productTags: ["en:chicken-eggs", "en:eggs"],
    units: ["g"],
    requireWords: ["oeuf", "oeufs"],
  },
  {
    key: "fresh|lait",
    productTags: ["en:milks"],
    units: ["ml"],
    excludeTags: [
      "en:milk-powders",
      "en:evaporated-milks",
      "en:dehydrated-beverages",
      "en:flavoured-milks",
      "en:plant-based-milks",
      "en:plant-based-beverages",
      "en:infant-formulas",
      "en:baby-milks",
      "en:fermented-milk-products",
      "en:fermented-milk-drinks",
      "en:buttermilks",
      "en:soured-milks",
    ],
    requireWords: ["lait"],
    forbidWords: [
      "coco",
      "amande",
      "avoine",
      "soja",
      "riz",
      "concentre",
      "poudre",
      "croissance",
      "ribot",
      "fermente",
      "chevre",
      "brebis",
      "bufflonne",
    ],
  },
  {
    key: "fresh|beurre",
    productTags: ["en:butters"],
    units: ["g"],
    excludeTags: ["en:clarified-butter", "en:ghee", "en:margarines", "en:dips", "en:pate"],
    requireWords: ["beurre"],
    forbidWords: ["cacahuete", "karite", "pepites", "ail", "herbes", "escargot"],
  },
  {
    key: "fresh|crème liquide",
    productTags: ["en:creams"],
    units: ["ml", "g"],
    excludeTags: CREAM_EXCLUDE,
    requireWords: ["liquide", "fleurette", "fluide"],
    forbidWords: ["vegetal", "coco", "soja", "avoine", "fouettee", "chantilly"],
  },
  {
    key: "fresh|crème fraîche",
    productTags: ["en:creams"],
    units: ["ml", "g"],
    excludeTags: CREAM_EXCLUDE,
    requireWords: ["fraiche", "epaisse"],
    forbidWords: [
      "fleurette",
      "liquide",
      "fluide",
      "vegetal",
      "coco",
      "soja",
      "fouettee",
      "chantilly",
      "glace",
      "dessert",
    ],
  },
  {
    key: "fresh|emmental râpé",
    productTags: ["en:grated-emmentaler"],
    units: ["g"],
    requireWords: ["emmental"],
  },
  {
    key: "dry|riz complet",
    productTags: ["en:brown-rices"],
    units: ["g"],
    excludeTags: ["en:rice-dishes", "en:prepared-rices", "en:red-rices", "en:quinoa"],
    requireWords: ["riz"],
    forbidWords: ["rouge", "quinoa", "sauvage", "demi", "1 2", "noir"],
  },
  {
    key: "dry|riz basmati",
    productTags: ["en:basmati-rices"],
    units: ["g"],
    excludeTags: ["en:rice-dishes", "en:prepared-rices", "en:brown-rices"],
    requireWords: ["basmati", "basmasti"],
    forbidWords: ["citron", "curry", "legumes", "complet", "complets", "demi", "1 2"],
  },
  {
    key: "dry|pâtes complètes",
    productTags: [
      "en:whole-durum-wheat-pasta",
      "en:dried-wholemeal-pasta",
      "en:whole-or-semi-whole-durum-wheat-pasta",
      "en:dry-pastas",
    ],
    units: ["g"],
    excludeTags: ["en:cooked-unsalted-dried-pasta", "en:gluten-free-pasta"],
    // Le nom décide : les étiquettes « complètes » manquent souvent.
    requireWords: WHOLE_WORDS,
    forbidWords: ["farcie", "farcies"],
  },
  {
    key: "dry|pâtes",
    productTags: ["en:dry-pastas"],
    units: ["g"],
    excludeTags: [
      "en:gluten-free-pasta",
      "en:cooked-unsalted-dried-pasta",
      "en:cereal-semolinas",
      "en:wheat-semolinas",
      "fr:sans-gluten",
    ],
    // Les mots « complet » (et `whole`) : filet de sécurité si l'ordre des entrées changeait.
    forbidWords: [
      "semoule",
      "farcie",
      "farcies",
      "sans gluten",
      "lentilles",
      "pois",
      "quinoa",
      "proteine",
      "proteines",
      "proteinee",
      "proteinees",
      "chanterelles",
      "epinards",
      "tricolore",
      "tricolores",
      "barlauch",
      ...WHOLE_WORDS,
    ],
  },
  {
    key: "dry|lentilles corail",
    productTags: ["en:red-lentils", "en:decorticated-red-lentils"],
    units: ["g"],
    excludeTags: PREPARED_LENTILS,
    requireWords: ["lentille", "lentilles"],
  },
  {
    key: "dry|lentilles vertes",
    productTags: ["en:green-lentils"],
    units: ["g"],
    excludeTags: PREPARED_LENTILS,
    requireWords: ["lentille", "lentilles"],
  },
  {
    key: "fresh|bœuf haché",
    productTags: ["en:ground-beef-steaks", "en:fresh-ground-beef-steaks"],
    units: ["g"],
    excludeTags: [
      "en:frozen-ground-steaks",
      "en:frozen-steaks",
      "en:meat-patties",
      "en:veal-meat",
      "en:frozen-meats",
    ],
    requireWords: ["hache", "haches", "hachee"],
    forbidWords: ["veau", "porc", "agneau", "burger", "boulette", "boulettes"],
  },
  {
    key: "fresh|blanc de poulet",
    categoryTags: ["en:chicken-breasts"],
    productTags: ["en:chicken-breasts"],
    units: ["g"],
    excludeTags: ["en:cooked-chicken-breast-slices"],
    requireWords: ["poulet"],
    forbidWords: ["hache", "haches", "hachee"],
  },
  { key: "fresh|cuisse de poulet", categoryTags: ["en:chicken-thighs"] },
];
