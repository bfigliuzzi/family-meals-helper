import { describe, expect, it } from "vitest";
import { readAiConfig } from "./config.ts";
import { createEnvSecretStore } from "./ports.ts";

describe("readAiConfig", () => {
  it("donne les défauts quand rien n'est défini ou que c'est vide", () => {
    for (const env of [{}, { ANTHROPIC_BASE_URL: "", ANTHROPIC_MODEL: "", FMH_DISABLE: "" }]) {
      const config = readAiConfig(env);
      expect(config).toEqual({
        ok: true,
        baseURL: "https://api.anthropic.com",
        model: "claude-sonnet-5-5",
        disabled: new Set(),
      });
    }
  });
  it("lit l'URL, le modèle et FMH_DISABLE", () => {
    const config = readAiConfig({
      ANTHROPIC_BASE_URL: "https://api.mammouth.ai",
      ANTHROPIC_MODEL: "autre",
      FMH_DISABLE: "format, cache",
    });
    expect(config).toEqual({
      ok: true,
      baseURL: "https://api.mammouth.ai",
      model: "autre",
      disabled: new Set(["format", "cache"]),
    });
  });
  it("exige https:// pour l'URL de base", () => {
    const refused = readAiConfig({ ANTHROPIC_BASE_URL: "http://provider.example" });
    expect(refused).toEqual({
      ok: false,
      error: "ANTHROPIC_BASE_URL doit commencer par https:// (la clé part dans l'en-tête).",
    });
    expect(readAiConfig({ ANTHROPIC_BASE_URL: "https://api.mammouth.ai" }).ok).toBe(true);
  });
  it("refuse une valeur inconnue de FMH_DISABLE", () => {
    const config = readAiConfig({ FMH_DISABLE: "format,magie" });
    expect(config.ok).toBe(false);
    if (!config.ok) expect(config.error).toContain("magie");
  });
});

describe("createEnvSecretStore", () => {
  it("lit ANTHROPIC_API_KEY, vide = absente", async () => {
    expect(await createEnvSecretStore({ ANTHROPIC_API_KEY: "k" }).get("anthropic-api-key")).toBe(
      "k",
    );
    expect(
      await createEnvSecretStore({ ANTHROPIC_API_KEY: "" }).get("anthropic-api-key"),
    ).toBeNull();
    expect(await createEnvSecretStore({}).get("anthropic-api-key")).toBeNull();
  });
});
