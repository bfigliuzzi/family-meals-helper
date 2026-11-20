import type { Settings } from "core";
import { createAnthropicModel, MAMMOUTH_BASE_URL } from "core/ai";
import type { AnthropicOptions, Model, ModelReply } from "core/ai";
import { createTauriHttpClient } from "./tauri-http-client.ts";
import type { Invoke } from "./tauri-error.ts";

// Clé factice : le SDK en exige une ; le Rust jette cet en-tête et met la vraie clé.
export const RUST_INJECTED_KEY = "cle-ajoutee-par-le-rust";

// Un modèle par opération payée : le modèle choisi dans Réglages vaut pour l'appel suivant.
export function createAppModel(
  invoke: Invoke,
  settings: Pick<Settings, "model">,
  schema: AnthropicOptions["schema"],
): Model {
  const model = createAnthropicModel({
    apiKey: RUST_INJECTED_KEY,
    baseURL: MAMMOUTH_BASE_URL,
    model: settings.model,
    http: createTauriHttpClient(invoke),
    logger: console,
    disabled: new Set(),
    schema,
    browser: true,
  });
  return {
    async complete(prompt) {
      const reply = await model.complete(prompt);
      console.info(usageLine(reply));
      return reply;
    },
  };
}

// Trace d'un appel réussi : cause de fin et jetons de sortie, rien de la réponse, de la clé ni du prompt.
export function usageLine(reply: Pick<ModelReply, "stopReason" | "usage">): string {
  const known = KNOWN_STOP_REASONS.has(reply.stopReason ?? "null");
  const stop = known ? (reply.stopReason ?? "null") : "autre";
  const tokens = Number.isInteger(reply.usage.output) ? String(reply.usage.output) : "?";
  return `IA : stop_reason=${stop} output_tokens=${tokens}`;
}

// Seules causes de fin écrites telles quelles : une valeur reçue du réseau ne passe jamais dans la console.
const KNOWN_STOP_REASONS: ReadonlySet<string> = new Set([
  "end_turn",
  "max_tokens",
  "stop_sequence",
  "tool_use",
  "refusal",
  "pause_turn",
  "null",
]);
