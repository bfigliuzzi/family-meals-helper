import type { ManualPriceRow, PriceStore } from "core";
import { toTauriError } from "./tauri-error.ts";
import type { Invoke } from "./tauri-error.ts";

// Trois commandes Rust (src-tauri/src/price_table.rs) : le front n'a aucun accès SQL.
export function createTauriPriceStore(invoke: Invoke): PriceStore {
  const fallback = "Erreur inconnue de la table de prix.";
  const failed = (reason: unknown): never => {
    throw toTauriError(reason, fallback);
  };
  return {
    listManual: () => invoke<ManualPriceRow[]>("price_table_list").catch(failed),
    setManual: (row) =>
      invoke<undefined>("price_table_set", {
        key: row.key,
        unit: row.unit,
        cents: row.cents,
        date: row.date,
      }).catch(failed),
    deleteManual: (key) => invoke<undefined>("price_table_delete", { key }).catch(failed),
  };
}
