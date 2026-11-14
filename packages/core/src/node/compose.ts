// Commande de développement : pnpm --filter core compose "<demande>" [--exclude x] [--month 11] [--session-day dimanche] [--dry-run]
// Appel réel à l'IA sans --dry-run : la clé est dans ANTHROPIC_API_KEY.
import { createAnthropicModel } from "../ai/anthropic-client.ts";
import { composeMenu, exitCodeOf } from "../ai/compose.ts";
import { renderComposeResult } from "../ai/render.ts";
import { MenuSchema } from "../domain/menu.ts";
import { buildIngredientIndex } from "../ingredients/index-lookup.ts";
import { REFERENTIAL } from "../ingredients/referential.ts";
import { unknownExclusionTerms } from "../rules/check-exclusions.ts";
import { monthOf } from "../season/months.ts";
import { SEASON_TABLE } from "../season/season-table.ts";
import { parseComposeArgs } from "./compose-args.ts";
import { readAiConfig } from "./config.ts";
import { composeDryRunLines } from "./dry-run.ts";
import { createEnvSecretStore, guardOutputStreams, nodeClock, nodeHttpClient } from "./ports.ts";

async function main(): Promise<number> {
  const args = parseComposeArgs(process.argv.slice(2));
  if (!args.ok) {
    process.stderr.write(`${args.error}\n`);
    return 2;
  }
  const month = args.month ?? monthOf(nodeClock.now());
  const input = {
    request: args.request,
    exclusions: args.exclusions,
    month,
    sessionDay: args.sessionDay,
    maxAttempts: args.maxAttempts,
  };

  for (const term of unknownExclusionTerms(input.exclusions, buildIngredientIndex(REFERENTIAL))) {
    process.stderr.write(
      `« ${term} » ne correspond à aucun ingrédient du référentiel : seuls les noms d'ingrédients inconnus et les noms de plats seront contrôlés.\n`,
    );
  }

  if (args.dryRun) {
    process.stdout.write(composeDryRunLines(input).join("\n"));
    return 0;
  }

  const config = readAiConfig(process.env);
  if (!config.ok) {
    process.stderr.write(`${config.error}\n`);
    return 2;
  }
  const apiKey = await createEnvSecretStore(process.env).get("anthropic-api-key");
  if (apiKey === null) {
    process.stderr.write("ANTHROPIC_API_KEY manquante.\n");
    return 2;
  }
  const disabled = config.disabled.size === 0 ? "aucun" : [...config.disabled].join(", ");
  process.stderr.write(
    `Modèle : ${config.model} · URL : ${config.baseURL} · essais au plus : ${input.maxAttempts} · désactivé : ${disabled}\n`,
  );

  const model = createAnthropicModel({
    apiKey,
    baseURL: config.baseURL,
    model: config.model,
    http: nodeHttpClient,
    logger: console,
    disabled: config.disabled,
    schema: MenuSchema,
  });
  const result = await composeMenu(input, {
    model,
    refs: REFERENTIAL,
    seasonTable: SEASON_TABLE,
    onAttempt: (attempt) => {
      process.stderr.write(`Essai ${attempt.number} sur ${input.maxAttempts} : vérification…\n`);
    },
  });
  process.stdout.write(`${renderComposeResult(result, input)}\n`);
  return exitCodeOf(result);
}

guardOutputStreams();

// Une erreur imprévue donne le code 2, jamais le code 1 de Node.
main().then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
  },
);
