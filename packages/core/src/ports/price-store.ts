import type { PriceUnit } from "../pricing/price.ts";

// Une ligne de la table de prix de l'utilisateur : le prix d'un kilo, d'un litre ou d'une pièce, en centimes entiers.
export interface ManualPriceRow {
  // « forme|nom canonique » (`shoppingKey`).
  key: string;
  unit: PriceUnit;
  cents: number;
  // AAAA-MM-JJ, jour de saisie.
  date: string;
}

export interface PriceStore {
  // Triée par clé.
  listManual(): Promise<ManualPriceRow[]>;
  // Ajoute la clé, ou remplace son prix.
  setManual(row: ManualPriceRow): Promise<void>;
  // Une clé absente n'est pas une erreur.
  deleteManual(key: string): Promise<void>;
}
