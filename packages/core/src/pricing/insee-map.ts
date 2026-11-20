import type { InseeMapEntry } from "./insee.ts";

// Série INSEE (`DS_IPC_PM`) → ingrédient du référentiel (clé « forme|nom canonique »), écrite à la main. Seules les
// correspondances sûres y figurent : veau (escalope pour sauté), filet mignon de porc (rôti dans le filet), jambon
// blanc et crevette (unité non écrite) restent sans prix plutôt que d'afficher un prix faux comme officiel. La pomme de
// terre prend la série de conservation. Le pain prend la baguette, sous ses deux formes `dry` et `fresh` : l'IA écrit
// l'une ou l'autre (pas de repli général sur la forme par défaut, il donnerait au maïs en conserve le prix du maïs frais). `docs/research/sources-prix.md` (section B) décrit les séries.
export const INSEE_MAP: readonly InseeMapEntry[] = [
  { series: "1223", key: "dry|pain", unit: "kg" },
  { series: "1223", key: "fresh|pain", unit: "kg" },
  { series: "3814", key: "fresh|artichaut", unit: "piece" },
  { series: "3838", key: "fresh|chou-fleur", unit: "piece" },
  { series: "3965", key: "fresh|poivron", unit: "kg" },
  { series: "8934", key: "fresh|citron", unit: "kg" },
  { series: "8935", key: "fresh|clémentine", unit: "kg" },
  { series: "8942", key: "fresh|orange", unit: "kg" },
  { series: "8943", key: "fresh|poire", unit: "kg" },
  { series: "8944", key: "fresh|pomme", unit: "kg" },
  { series: "8948", key: "fresh|carotte", unit: "kg" },
  { series: "8949", key: "fresh|champignon de Paris", unit: "kg" },
  { series: "8951", key: "fresh|courgette", unit: "kg" },
  { series: "8952", key: "fresh|endive", unit: "kg" },
  { series: "8953", key: "fresh|oignon", unit: "kg" },
  { series: "8954", key: "fresh|poireau", unit: "kg" },
  { series: "8955", key: "fresh|tomate", unit: "kg" },
  { series: "8958", key: "fresh|haricot vert", unit: "kg" },
  { series: "8959", key: "fresh|pomme de terre", unit: "kg" },
  { series: "1266", key: "fresh|échine de porc", unit: "kg" },
];
