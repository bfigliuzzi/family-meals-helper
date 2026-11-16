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
}

// Le même qu'en Rust (apps/desktop/src-tauri/src/history.rs) : un test le vérifie en lisant ce fichier.
export const MAX_PDF_BYTES = 1024 * 1024;
