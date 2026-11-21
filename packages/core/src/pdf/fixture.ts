import { HOUSEHOLD_EQUIPMENT } from "../equipment/household.ts";
import { buildIngredientIndex } from "../ingredients/index-lookup.ts";
import { REFERENTIAL } from "../ingredients/referential.ts";
import { menuCost } from "../pricing/cost.ts";
import { inseeLookup } from "../pricing/insee.ts";
import { INSEE_TABLE } from "../pricing/insee-table.ts";
import { checkMenu } from "../rules/check-menu.ts";
import { autumnDetail } from "../rules/fixtures/detail.ts";
import { asReply, autumnMenu } from "../rules/fixtures/menus.ts";
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
    equipment: HOUSEHOLD_EQUIPMENT,
  });
  const base = {
    sessionDay: "sun",
    menu,
    keeping: checked.keeping,
    index,
    equipment: HOUSEHOLD_EQUIPMENT,
    // Date fixe : la fiche d'exemple reste la même d'un jour à l'autre.
    cost: { cost: menuCost(menu, index, [inseeLookup(INSEE_TABLE)]), pricedOn: "2026-11-16" },
  } as const;
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

// Réponses d'exemple du modèle d'essai de l'app (sans appel à Claude) : le menu d'automne, sous la forme que le
// schéma de composition demande, et son détail.
export function fixtureReplies(): { menu: string; detail: string } {
  return {
    menu: asReply(autumnMenu(), { note: "Menu d'exemple, sans appel à Claude.", requested: [] }),
    detail: JSON.stringify(autumnDetail()),
  };
}
