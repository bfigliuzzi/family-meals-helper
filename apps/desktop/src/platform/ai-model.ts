import type { Settings } from "core";
import { createAnthropicModel, MAMMOUTH_BASE_URL } from "core/ai";
import type { AnthropicOptions, Model } from "core/ai";
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
  return createAnthropicModel({
    apiKey: RUST_INJECTED_KEY,
    baseURL: MAMMOUTH_BASE_URL,
    model: settings.model,
    http: createTauriHttpClient(invoke),
    logger: console,
    disabled: new Set(),
    schema,
    browser: true,
  });
}
