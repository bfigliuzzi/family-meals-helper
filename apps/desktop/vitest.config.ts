import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config.ts";

// `viteConfig` est une fonction du mode : elle est évaluée avant la fusion (mode `test` sous Vitest).
export default defineConfig((env) =>
  mergeConfig(
    viteConfig(env),
    defineConfig({ test: { environment: "jsdom", setupFiles: ["./src/test/setup.ts"] } }),
  ),
);
