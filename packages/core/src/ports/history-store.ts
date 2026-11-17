// Transport en texte, comme `SettingsStore` : lecture, validation et sérialisation de l'entrée restent dans core
// (history/history.ts).
export interface HistoryRow {
  id: number;
  entry: string;
  checked: string;
}

export interface HistoryStore {
  // `token` : le même pour toutes les reprises d'une validation ; un jeton déjà enregistré rend son id sans rien
  // écrire.
  add(token: string, entry: string, pdf: Uint8Array): Promise<number>;
  // Du plus récent au plus ancien.
  list(): Promise<HistoryRow[]>;
  openPdf(id: number): Promise<void>;
  // Le chemin écrit.
  exportPdf(id: number): Promise<string>;
  // Remplace les cases cochées de l'entrée (état complet, jamais un delta). Rejette si l'entrée n'existe plus.
  setChecked(id: number, checked: readonly string[]): Promise<void>;
}

// Le même qu'en Rust (apps/desktop/src-tauri/src/history.rs) : un test le vérifie en lisant ce fichier.
export const MAX_PDF_BYTES = 1024 * 1024;

// Le même qu'en Rust (history.rs) : somme des longueurs UTF-8 des clés cochées.
export const MAX_CHECKED_BYTES = 256 * 1024;
