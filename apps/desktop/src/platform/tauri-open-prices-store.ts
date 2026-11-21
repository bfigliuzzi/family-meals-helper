import type { OpenPricesFile, OpenPricesStore } from "core";
import { toTauriError } from "./tauri-error.ts";
import type { Invoke } from "./tauri-error.ts";

const UNEXPECTED_READ = "Réponse de lecture des prix inattendue.";
const UNEXPECTED_LOAD = "Réponse des prix Open Prices inattendue.";

const tagOf = (value: unknown): string => Object.prototype.toString.call(value);

// Les trois formes que Tauri 2.12 peut rendre pour un `tauri::ipc::Response` : un `ArrayBuffer` par le transport
// normal, un `Uint8Array`, ou un tableau de nombres par le repli `postMessage` (un morceau de 512 Kio : il ne coûte
// que du temps). Toute autre forme est refusée. `Object.prototype.toString` plutôt que `instanceof` : le même
// contrôle vaut pour un `ArrayBuffer` venu d'une autre fenêtre ou d'un autre contexte.
function toBytes(value: unknown): Uint8Array<ArrayBuffer> {
  if (tagOf(value) === "[object ArrayBuffer]") return new Uint8Array(value as ArrayBuffer);
  if (tagOf(value) === "[object Uint8Array]") return Uint8Array.from(value as Uint8Array);
  if (
    Array.isArray(value) &&
    value.every((item) => Number.isInteger(item) && item >= 0 && item <= 255)
  ) {
    return Uint8Array.from(value as number[]);
  }
  throw new Error(UNEXPECTED_READ);
}

function toState(value: unknown): { attemptedAt: string | null; summary: string | null } {
  if (typeof value !== "object" || value === null) throw new Error(UNEXPECTED_LOAD);
  const { attemptedAt, summary } = value as Record<string, unknown>;
  const text = (field: unknown): string | null => {
    if (field === null || field === undefined) return null;
    if (typeof field === "string") return field;
    throw new Error(UNEXPECTED_LOAD);
  };
  return { attemptedAt: text(attemptedAt), summary: text(summary) };
}

// Quatre commandes Rust (src-tauri/src/open_prices.rs) : la vue web ne donne jamais d'adresse ni de chemin, seulement
// le nom d'un des trois fichiers et un décalage.
export function createTauriOpenPricesStore(invoke: Invoke): OpenPricesStore {
  const fallback = "Erreur inconnue des prix Open Prices.";
  const failed = (reason: unknown): never => {
    throw reason instanceof Error ? reason : toTauriError(reason, fallback);
  };
  return {
    load: () => invoke<unknown>("open_prices_load").then(toState).catch(failed),
    download: (today) => invoke<undefined>("open_prices_download", { today }).catch(failed),
    read: (file: OpenPricesFile, offset: number) =>
      invoke<unknown>("open_prices_read", { file, offset }).then(toBytes).catch(failed),
    save: (today, summary) =>
      invoke<undefined>("open_prices_save", { today, summary }).catch(failed),
  };
}
