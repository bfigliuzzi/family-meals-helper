export type SecretKey = "anthropic-api-key";

export interface SecretStore {
  get(key: SecretKey): Promise<string | null>;
}

// Gestion d'un secret sans jamais le lire : savoir s'il existe, l'enregistrer, le supprimer.
// C'est ce dont l'écran Réglages a besoin ; la lecture (`SecretStore.get`) reste réservée à l'appel à l'API.
export interface SecretAdmin {
  has(key: SecretKey): Promise<boolean>;
  set(key: SecretKey, value: string): Promise<void>;
  delete(key: SecretKey): Promise<void>;
}
