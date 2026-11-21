// Les trois fichiers du dump Open Prices que l'app télécharge (`<nom>.jsonl.gz`).
export type OpenPricesFile = "locations" | "prices" | "products";

export const OPEN_PRICES_FILES: readonly OpenPricesFile[] = ["locations", "prices", "products"];

export interface OpenPricesStore {
  // La ligne unique de la base : jour du dernier essai de téléchargement, et résumé en service (texte JSON), tous
  // deux `null` tant qu'ils n'existent pas.
  load(): Promise<{ attemptedAt: string | null; summary: string | null }>;
  // Télécharge les trois fichiers dans le dossier de l'app. Le jour est écrit comme jour de l'essai avant tout réseau.
  download(today: string): Promise<void>;
  // Un morceau de fichier compressé à partir de `offset` ; vide à la fin.
  read(file: OpenPricesFile, offset: number): Promise<Uint8Array<ArrayBuffer>>;
  // Enregistre le résumé, puis supprime les fichiers téléchargés.
  save(today: string, summary: string): Promise<void>;
}
