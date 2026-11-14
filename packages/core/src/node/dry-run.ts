import { buildSystemPrompt, buildUserPrompt } from "../ai/prompt.ts";
import type { ComposeInput } from "../ai/compose.ts";
import { REFERENTIAL } from "../ingredients/referential.ts";
import { expectedDinners } from "../rules/menu-shape.ts";
import { inSeasonNames } from "../season/check-season.ts";
import { SEASON_TABLE } from "../season/season-table.ts";

// Ce que `compose --dry-run` et `batch --dry-run` affichent des prompts de composition : sans réseau ni clé.
export function composeDryRunLines(input: ComposeInput): string[] {
  const system = buildSystemPrompt(REFERENTIAL);
  const user = buildUserPrompt({
    request: input.request,
    exclusions: input.exclusions,
    month: input.month,
    sessionDay: input.sessionDay,
    dinners: expectedDinners(input.request),
    inSeason: inSeasonNames(input.month, REFERENTIAL, SEASON_TABLE),
  });
  return [
    "=== Prompt système ===",
    system,
    "",
    "=== Prompt utilisateur (essai 1) ===",
    user,
    "",
    `Taille : système ${system.length} caractères, utilisateur ${user.length} caractères. Aucun appel effectué.`,
    "",
  ];
}
