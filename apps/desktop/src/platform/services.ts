import { invoke } from "@tauri-apps/api/core";
import { createSettingsKeeper } from "core";
import type { SettingsKeeper, SecretAdmin } from "core";
import { createKeychainSecretAdmin } from "./keychain-secret-admin.ts";
import { createTauriSettingsStore } from "./tauri-settings-store.ts";

export interface Services {
  settings: SettingsKeeper;
  secretAdmin: SecretAdmin;
}

// À appeler une seule fois, hors de tout composant : le propriétaire du document et la file du trousseau vivent
// aussi longtemps que l'app.
export function createServices(): Services {
  return {
    settings: createSettingsKeeper(createTauriSettingsStore(invoke), {
      onListenerError: (error) => {
        console.error("Abonné des réglages en erreur", error);
      },
    }),
    secretAdmin: createKeychainSecretAdmin(invoke),
  };
}
