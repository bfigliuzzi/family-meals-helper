import { MAX_PDF_BYTES } from "core";
import type { HistoryRow, HistoryStore } from "core";
import { toTauriError } from "./tauri-error.ts";
import type { Invoke } from "./tauri-error.ts";

// Cinq commandes Rust (src-tauri/src/history.rs) : le front n'a aucun accès SQL ni aucun chemin de fichier.
export function createTauriHistoryStore(invoke: Invoke): HistoryStore {
  const fallback = "Erreur inconnue de l'historique.";
  const failed = (reason: unknown): never => {
    throw toTauriError(reason, fallback);
  };
  return {
    add: (token, entry, pdf) => {
      // Contrôlé avant `Array.from` : un PDF trop grand ne coûte ni copie ni envoi.
      if (pdf.length > MAX_PDF_BYTES) return Promise.reject(new Error("Fiche trop grande."));
      // `invoke` sérialise en JSON : un `Uint8Array` deviendrait `{"0":37,…}`, que `Vec<u8>` refuse.
      return invoke<number>("history_add", { token, entry, pdf: Array.from(pdf) }).catch(failed);
    },
    list: () => invoke<HistoryRow[]>("history_list").catch(failed),
    openPdf: (id) => invoke<undefined>("history_open_pdf", { id }).catch(failed),
    exportPdf: (id) => invoke<string>("history_export_pdf", { id }).catch(failed),
    // `invoke` sérialise en JSON : le tableau reçu (gelé) est recopié en tableau simple.
    setChecked: (id, checked) =>
      invoke<undefined>("history_set_checked", { id, checked: [...checked] }).catch(failed),
  };
}
