import Anthropic from "@anthropic-ai/sdk";
import type { ClientOptions } from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { MenuSchema } from "../domain/menu.ts";
import type { HttpClient } from "../ports/http-client.ts";
import { toFetch } from "./fetch-adapter.ts";
import type { Feature, MenuModel, ModelReply } from "./model.ts";

export interface AnthropicOptions {
  apiKey: string;
  baseURL: string;
  model: string;
  http: HttpClient;
  logger: NonNullable<ClientOptions["logger"]>;
  disabled: ReadonlySet<Feature>;
  maxTokens?: number;
}

// Toutes les options sont explicites : le SDK ne lit de l'environnement que ce qu'on ne peut pas
// éviter (ANTHROPIC_CUSTOM_HEADERS, dette nommée dans docs/conventions-core.md).
export function createAnthropicMenuModel(opts: AnthropicOptions): MenuModel {
  const client = new Anthropic({
    apiKey: opts.apiKey,
    baseURL: opts.baseURL,
    fetch: toFetch(opts.http),
    webhookKey: null,
    logLevel: "warn",
    logger: opts.logger,
    openTelemetry: false,
    maxRetries: 0,
    timeout: 120_000,
  });

  return {
    async complete(prompt): Promise<ModelReply> {
      const outputConfig = {
        ...(opts.disabled.has("effort") ? {} : { effort: "low" as const }),
        ...(opts.disabled.has("format") ? {} : { format: zodOutputFormat(MenuSchema) }),
      };
      let message;
      try {
        message = await client.messages.create({
          model: opts.model,
          max_tokens: opts.maxTokens ?? 8000,
          system: [
            {
              type: "text",
              text: prompt.system,
              ...(opts.disabled.has("cache")
                ? {}
                : { cache_control: { type: "ephemeral" as const } }),
            },
          ],
          messages: [{ role: "user", content: prompt.user }],
          ...(Object.keys(outputConfig).length === 0 ? {} : { output_config: outputConfig }),
        });
      } catch (error) {
        // Pas de `cause` : l'erreur d'origine peut contenir la clé, et Node l'afficherait en entier.
        // eslint-disable-next-line preserve-caught-error
        throw new Error(redact(describeApiError(error), opts.apiKey));
      }
      const text = message.content
        .map((block) => (block.type === "text" ? block.text : ""))
        .join("");
      return {
        text,
        stopReason: message.stop_reason,
        usage: {
          input: message.usage.input_tokens,
          output: message.usage.output_tokens,
          cacheRead: message.usage.cache_read_input_tokens ?? 0,
          cacheWrite: message.usage.cache_creation_input_tokens ?? 0,
        },
      };
    },
  };
}

// Masque d'abord le jeton après « Bearer », puis la clé elle-même : un message d'erreur ne doit jamais la contenir.
// Un mot ordinaire après « Bearer » (moins de 8 caractères) reste intact.
export function redact(text: string, key: string): string {
  const withoutBearer = text.replace(/Bearer\s+["']?[^\s"',;]{8,}["']?/gi, "Bearer [clé masquée]");
  return key === "" ? withoutBearer : withoutBearer.split(key).join("[clé masquée]");
}

// Message français pour une erreur du SDK ou du réseau.
export function describeApiError(error: unknown): string {
  if (error instanceof Anthropic.APIConnectionTimeoutError) {
    return "Délai dépassé : le serveur n'a pas répondu à temps.";
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return "Connexion impossible : vérifie le réseau et ANTHROPIC_BASE_URL.";
  }
  if (error instanceof Anthropic.APIError) {
    const detail = error.apiMessage ?? error.message;
    switch (error.status) {
      case 400:
        return `Requête refusée (400) : ${detail}. Si un paramètre est cité, essaie FMH_DISABLE=format, effort ou cache.`;
      case 401:
        return "Clé refusée (401) : vérifie ANTHROPIC_API_KEY.";
      case 404:
        return `Route ou modèle introuvable (404) : vérifie ANTHROPIC_BASE_URL et ANTHROPIC_MODEL. ${detail}`;
      case 429:
        return "Trop de requêtes ou quota atteint (429) : réessaie plus tard.";
      default:
        return `Erreur de l'API (${error.status ?? "sans statut"}) : ${detail}`;
    }
  }
  return error instanceof Error ? error.message : String(error);
}
