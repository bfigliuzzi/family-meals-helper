import { invoke } from "@tauri-apps/api/core";
import { MenuReplySchema, createSession, createSettingsKeeper } from "core";
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
      createModel: async (current) => {
        const { createAppModel } = await import("./ai-model.ts");
        return createAppModel(invoke, current, MenuReplySchema);
      },
      onListenerError: (error) => {
        console.error("Abonné de la session en erreur", error);
      },
    }),
  };
}
