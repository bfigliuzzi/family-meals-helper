import type { IngredientIndex } from "../ingredients/index-lookup.ts";
import type { Month, SeasonRow } from "../season/months.ts";

export interface CheckContext {
  request: string;
  exclusions: readonly string[];
  month: Month;
  dinners: number;
  index: IngredientIndex;
  seasonTable: Readonly<Record<string, SeasonRow>>;
}
