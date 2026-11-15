// Le magasin transporte le texte du document de réglages : le parsing, la validation et la sérialisation
// sont dans settings/settings.ts.
export interface SettingsStore {
  // null : rien d'enregistré.
  read(): Promise<string | null>;
  write(document: string): Promise<void>;
}
