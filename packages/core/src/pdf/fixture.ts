import { HOUSEHOLD_EQUIPMENT } from "../equipment/household.ts";
import { buildIngredientIndex } from "../ingredients/index-lookup.ts";
import { REFERENTIAL } from "../ingredients/referential.ts";
import { checkMenu } from "../rules/check-menu.ts";
import { autumnDetail } from "../rules/fixtures/detail.ts";
import { autumnMenu } from "../rules/fixtures/menus.ts";
import { checkDetail } from "../scheduling/check-detail.ts";
import { SEASON_TABLE } from "../season/season-table.ts";
import type { SheetInput } from "./sheet.ts";

// Fiche d'exemple, sans réseau ni clé : le menu et le détail d'automne, en novembre, session le dimanche.
// `phases` donne la fiche de repli, avec les grandes phases du menu à la place des étapes détaillées.
export function fixtureSheetInput(mode: "detail" | "phases"): SheetInput {
  const index = buildIngredientIndex(REFERENTIAL);
  const menu = autumnMenu();
  const checked = checkMenu(menu, {
    request: "5 dîners de saison (exemple)",
    exclusions: [],
    month: 11,
    sessionDay: "sun",
    dinners: menu.dishes.length,
    index,
    seasonTable: SEASON_TABLE,
  });
  const base = { sessionDay: "sun", menu, keeping: checked.keeping, index } as const;
  if (mode === "phases") {
    if (checked.session === null) throw new Error("Le menu d'exemple n'a pas de planning.");
    return {
      ...base,
      steps: {
        kind: "phases",
        plan: checked.session,
        reason:
          "les étapes détaillées restent incohérentes après 3 appels (enchaînement des étapes)",
      },
    };
  }
  const detail = autumnDetail();
  const check = checkDetail(menu, detail, HOUSEHOLD_EQUIPMENT, index, []);
  if (check.plan === null) throw new Error("Le détail d'exemple n'a pas de planning.");
  return { ...base, steps: { kind: "detail", detail, plan: check.plan, findings: check.findings } };
}
