import type { SessionDay } from "../domain/menu.ts";
import type { IngredientIndex } from "../ingredients/index-lookup.ts";
import type { Month, SeasonRow } from "../season/months.ts";

export interface CheckContext {
  request: string;
  exclusions: readonly string[];
  month: Month;
  sessionDay: SessionDay;
  dinners: number;
  index: IngredientIndex;
  seasonTable: Readonly<Record<string, SeasonRow>>;
}
