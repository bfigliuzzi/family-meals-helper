import { DEFAULT_BASE_URL, DEFAULT_MODEL } from "../ai/model.ts";
import type { Feature } from "../ai/model.ts";

const FEATURES: readonly Feature[] = ["format", "effort", "cache"];

function isFeature(value: string): value is Feature {
  return (FEATURES as readonly string[]).includes(value);
}

// Seul endroit qui lit ANTHROPIC_BASE_URL, ANTHROPIC_MODEL et FMH_DISABLE.
export function readAiConfig(
  env: NodeJS.ProcessEnv,
):
  | { ok: true; baseURL: string; model: string; disabled: Set<Feature> }
  | { ok: false; error: string } {
  const disabled = new Set<Feature>();
  const raw = env["FMH_DISABLE"] ?? "";
  for (const part of raw.split(",")) {
    const value = part.trim();
    if (value === "") continue;
    if (!isFeature(value)) {
      return {
        ok: false,
        error: `FMH_DISABLE : valeur inconnue « ${value} » (valeurs permises : ${FEATURES.join(", ")}).`,
      };
    }
    disabled.add(value);
  }
  const baseURL = env["ANTHROPIC_BASE_URL"];
  const model = env["ANTHROPIC_MODEL"];
  if (baseURL !== undefined && baseURL !== "" && !baseURL.startsWith("https://")) {
    return {
      ok: false,
      error: "ANTHROPIC_BASE_URL doit commencer par https:// (la clé part dans l'en-tête).",
    };
  }
  return {
    ok: true,
    baseURL: baseURL === undefined || baseURL === "" ? DEFAULT_BASE_URL : baseURL,
    model: model === undefined || model === "" ? DEFAULT_MODEL : model,
    disabled,
  };
}
