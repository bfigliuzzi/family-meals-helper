import Anthropic from "@anthropic-ai/sdk";
import type { ClientOptions } from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";
import type { HttpClient } from "../ports/http-client.ts";
import { toFetch } from "./fetch-adapter.ts";
import type { Feature, Model, ModelReply } from "./model.ts";
import { TransportError } from "./transport-error.ts";

export interface AnthropicOptions {
  apiKey: string;
  baseURL: string;
  model: string;
  http: HttpClient;
  logger: NonNullable<ClientOptions["logger"]>;
  disabled: ReadonlySet<Feature>;
  // Forme de la réponse, envoyée en sortie structurée : celle du menu, ou celle du détail.
  schema: z.ZodType;
  maxTokens?: number;
  // Vrai dans la vue web de l'app (le SDK refuse sinon de se construire dans un navigateur) : les messages
  // d'erreur renvoient alors aux Réglages au lieu des variables d'environnement de la CLI.
  browser: boolean;
}

// Toutes les options sont explicites : le SDK ne lit de l'environnement que ce qu'on ne peut pas
// éviter (ANTHROPIC_CUSTOM_HEADERS, dette nommée dans docs/conventions-core.md).
export function createAnthropicModel(opts: AnthropicOptions): Model {
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
    dangerouslyAllowBrowser: opts.browser,
  });

  return {
    async complete(prompt): Promise<ModelReply> {
      const outputConfig = {
        ...(opts.disabled.has("effort") ? {} : { effort: "low" as const }),
        ...(opts.disabled.has("format") ? {} : { format: zodOutputFormat(opts.schema) }),
      };
      try {
        const message: unknown = await client.messages.create({
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
        // Le SDK rend le JSON reçu sans le vérifier : tout ce que `complete` lit est contrôlé ici, dans ce `try`.
        const reply = readMessage(message);
        if (reply === null) {
          throw new Error("Réponse de l'IA inattendue.");
        }
        return reply;
      } catch (error) {
        // Pas de `cause` : l'erreur d'origine peut contenir la clé, et Node l'afficherait en entier.
        // eslint-disable-next-line preserve-caught-error
        throw new Error(redact(describeApiError(error, opts.browser ? "app" : "cli"), opts.apiKey));
      }
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

// Lecture typée d'un message : `null` si un champ lu n'a pas le type attendu. Le SDK rend le JSON reçu tel quel ; sans
// ce contrôle, un `text` objet ou un `usage` vide échoueraient plus loin, hors du `try`, avec un message anglais.
function readMessage(value: unknown): ModelReply | null {
  if (!isRecord(value)) {
    return null;
  }
  const { content, stop_reason: stopReason, usage } = value;
  if (!Array.isArray(content) || !isRecord(usage)) {
    return null;
  }
  let text = "";
  for (const block of content as unknown[]) {
    if (!isRecord(block)) {
      return null;
    }
    if (block["type"] === "text") {
      const part = block["text"];
      if (typeof part !== "string") {
        return null;
      }
      text += part;
    }
  }
  if (typeof stopReason !== "string" && stopReason !== null) {
    return null;
  }
  const input = usage["input_tokens"];
  const output = usage["output_tokens"];
  // Compteurs de cache : absents ou `null` comptent 0.
  const cacheRead = usage["cache_read_input_tokens"] ?? 0;
  const cacheWrite = usage["cache_creation_input_tokens"] ?? 0;
  if (!isCount(input) || !isCount(output) || !isCount(cacheRead) || !isCount(cacheWrite)) {
    return null;
  }
  return { text, stopReason, usage: { input, output, cacheRead, cacheWrite } };
}

// Masque d'abord le jeton après « Bearer », puis la clé elle-même : un message d'erreur ne doit jamais la contenir.
// Un mot ordinaire après « Bearer » (moins de 8 caractères) reste intact.
export function redact(text: string, key: string): string {
  const withoutBearer = text.replace(/Bearer\s+["']?[^\s"',;]{8,}["']?/gi, "Bearer [clé masquée]");
  return key === "" ? withoutBearer : withoutBearer.split(key).join("[clé masquée]");
}

const API_ERROR_FALLBACK = "Erreur de l'API.";

// Message français pour une erreur du SDK ou du réseau. `audience` choisit les textes : la CLI cite ses variables
// d'environnement, l'app renvoie aux Réglages. Appelée depuis un `catch`, elle ne lève jamais : un champ de l'erreur
// peut venir du JSON reçu (un `apiMessage` objet) ou être un getter qui lève. Repli : « Erreur de l'API. ».
export function describeApiError(error: unknown, audience: "cli" | "app" = "cli"): string {
  try {
    const text = describe(error, audience === "app");
    return typeof text === "string" ? text : API_ERROR_FALLBACK;
  } catch {
    return API_ERROR_FALLBACK;
  }
}

// Une chaîne non vide, sinon `null`.
function textOf(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

// `unknown` : le texte rendu peut venir d'un champ de l'erreur, que rien ne garantit être une chaîne.
function describe(error: unknown, app: boolean): unknown {
  // Échec local du transport de l'app : le SDK l'a enveloppé dans une erreur de connexion, son message est déjà
  // celui à afficher.
  if (error instanceof Anthropic.APIConnectionError && error.cause instanceof TransportError) {
    return error.cause.message;
  }
  if (error instanceof Anthropic.APIConnectionTimeoutError) {
    return "Délai dépassé : le serveur n'a pas répondu à temps.";
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return app
      ? "Connexion impossible : vérifiez le réseau."
      : "Connexion impossible : vérifie le réseau et ANTHROPIC_BASE_URL.";
  }
  if (error instanceof Anthropic.APIError) {
    // Le texte de l'API n'est repris que s'il est une chaîne non vide : `apiMessage` vient du JSON reçu. Sans lui
    // (corps sans `error.message`), le message du SDK, qui résume le corps reçu, mais seulement si le SDK a lu un corps
    // JSON (`error.error`) : sans corps, ce message n'est qu'une phrase anglaise (« 502 status code (no body) »).
    const body: unknown = error.error;
    const detail = textOf(error.apiMessage) ?? (body === undefined ? null : textOf(error.message));
    switch (error.status) {
      case 400: {
        const refused =
          detail === null ? "Requête refusée (400)." : `Requête refusée (400) : ${detail}.`;
        return app
          ? refused
          : `${refused} Si un paramètre est cité, essaie FMH_DISABLE=format, effort ou cache.`;
      }
      case 401:
        return app
          ? "Clé refusée (401) : vérifiez la clé enregistrée dans Réglages."
          : "Clé refusée (401) : vérifie ANTHROPIC_API_KEY.";
      case 404: {
        const sentence = app
          ? "Modèle ou route introuvable (404) : vérifiez le modèle choisi dans Réglages."
          : "Route ou modèle introuvable (404) : vérifie ANTHROPIC_BASE_URL et ANTHROPIC_MODEL.";
        return detail === null ? sentence : `${sentence} ${detail}`;
      }
      case 429:
        return "Trop de requêtes ou quota atteint (429) : réessaie plus tard.";
      default: {
        const received: unknown = error.status;
        const status = typeof received === "number" ? String(received) : "sans statut";
        return detail === null
          ? `Erreur de l'API (${status}).`
          : `Erreur de l'API (${status}) : ${detail}`;
      }
    }
  }
  return error instanceof Error ? error.message : String(error);
}
