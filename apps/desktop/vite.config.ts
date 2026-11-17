import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Le mode d'essai (réponses d'exemple, sans Claude) est choisi par le mode Vite, jamais par une variable
// d'environnement ni un fichier `.env*` : seul `build:essai` (`vite build --mode essai`) le met à vrai.
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  clearScreen: false,
  server: { port: 1420, strictPort: true, watch: { ignored: ["**/src-tauri/**"] } },
  define: { __FMH_FIXTURE_MODEL__: JSON.stringify(mode === "essai") },
}));
