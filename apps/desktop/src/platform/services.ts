import { invoke } from "@tauri-apps/api/core";
import { createSession, createSettingsKeeper } from "core";
import type { HistoryStore, SecretAdmin, Session, SettingsKeeper } from "core";
import { createKeychainSecretAdmin } from "./keychain-secret-admin.ts";
import { createTauriHistoryStore } from "./tauri-history-store.ts";
import { createTauriSettingsStore } from "./tauri-settings-store.ts";

export interface Services {
  settings: SettingsKeeper;
  secretAdmin: SecretAdmin;
  session: Session;
  history: HistoryStore;
}

// À appeler une seule fois, hors de tout composant : le propriétaire du document et la file du trousseau vivent
// aussi longtemps que l'app.
export function createServices(): Services {
  const settings = createSettingsKeeper(createTauriSettingsStore(invoke), {
    onListenerError: (error) => {
      console.error("Abonné des réglages en erreur", error);
    },
  });
  const history = createTauriHistoryStore(invoke);
  return {
    settings,
    secretAdmin: createKeychainSecretAdmin(invoke),
    history,
    session: createSession({
      settings,
      clock: { now: () => new Date() },
      history,
      // Chargé au premier appel : le SDK n'est pas dans le paquet principal.
      // Dans le build normal, `__FMH_FIXTURE_MODEL__` vaut `false` à la compilation : Vite retire la branche et
      // son `import()`, le modèle d'exemple n'est pas dans le build livré.
      createModel: async (current, schema) => {
        if (__FMH_FIXTURE_MODEL__) {
          const { createFixtureModel } = await import("./fixture-model.ts");
          return createFixtureModel(schema);
        }
        const { createAppModel } = await import("./ai-model.ts");
        return createAppModel(invoke, current, schema);
      },
      // pdfmake et ses polices sont chargés au premier rendu, dans des morceaux à part.
      renderPdf: async (doc, at) => (await import("./pdf-renderer.ts")).renderSheetPdf(doc, at),
      newToken: () => crypto.randomUUID(),
      onListenerError: (error) => {
        console.error("Abonné de la session en erreur", error);
      },
    }),
  };
}
