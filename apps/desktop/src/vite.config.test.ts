import { afterEach, describe, expect, it, vi } from "vitest";
import viteConfig from "../vite.config.ts";

const define = (mode: string): unknown =>
  viteConfig({ mode, command: "build" }).define?.["__FMH_FIXTURE_MODEL__"];

describe("mode d'essai (réponses d'exemple)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("le mode production le met à faux, même avec VITE_FMH_FIXTURE_MODEL dans l'environnement", () => {
    vi.stubEnv("VITE_FMH_FIXTURE_MODEL", "1");
    process.env["VITE_FMH_FIXTURE_MODEL"] = "1";
    try {
      expect(define("production")).toBe("false");
    } finally {
      delete process.env["VITE_FMH_FIXTURE_MODEL"];
    }
  });

  it("le mode essai le met à vrai ; le mode test à faux", () => {
    expect(define("essai")).toBe("true");
    expect(define("test")).toBe("false");
  });
});
