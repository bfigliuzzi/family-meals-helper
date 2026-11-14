// Test de connexion : un seul appel réel, même forme de requête que `compose`.
// Lancé par l'orchestrateur avec la clé, jamais par les tests.
import { createAnthropicModel } from "../ai/anthropic-client.ts";
import { parseMenuReply } from "../ai/menu-reply.ts";
import { buildSystemPrompt } from "../ai/prompt.ts";
import { MenuSchema } from "../domain/menu.ts";
import { REFERENTIAL } from "../ingredients/referential.ts";
import { readAiConfig } from "./config.ts";
import { createEnvSecretStore, nodeHttpClient } from "./ports.ts";

async function main(): Promise<number> {
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
  const model = createAnthropicModel({
    apiKey,
    baseURL: config.baseURL,
    model: config.model,
    http: nodeHttpClient,
    logger: console,
    disabled: config.disabled,
    schema: MenuSchema,
    maxTokens: 300,
  });
  try {
    const reply = await model.complete({
      system: buildSystemPrompt(REFERENTIAL),
      user: 'Test de connexion : renvoie exactement {"dishes":[]}',
    });
    const { usage } = reply;
    process.stdout.write(
      [
        `Modèle : ${config.model}`,
        `Raison d'arrêt : ${reply.stopReason ?? "inconnue"}`,
        `Texte : ${reply.text}`,
        `Jetons : entrée hors cache ${usage.input}, lus en cache ${usage.cacheRead}, écrits en cache ${usage.cacheWrite}, sortie ${usage.output}`,
        "",
      ].join("\n"),
    );
    return parseMenuReply(reply.text).ok ? 0 : 1;
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 2;
  }
}

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
