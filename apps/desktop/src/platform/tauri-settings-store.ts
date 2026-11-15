import type { SettingsStore } from "core";
import { toTauriError } from "./tauri-error.ts";
import type { Invoke } from "./tauri-error.ts";

// Le document est lu et écrit par deux commandes Rust (src-tauri/src/settings_db.rs) : le front n'a aucun accès
// SQL. L'ordre des écritures est géré par le propriétaire du document (createSettingsKeeper), pas ici.
export function createTauriSettingsStore(invoke: Invoke): SettingsStore {
  const fallback = "Erreur inconnue de la base des réglages.";
  return {
    read: () =>
      invoke<string | null>("settings_read").catch((reason: unknown) => {
        throw toTauriError(reason, fallback);
      }),
    write: (document) =>
      invoke<undefined>("settings_write", { document }).catch((reason: unknown) => {
        throw toTauriError(reason, fallback);
      }),
  };
}
