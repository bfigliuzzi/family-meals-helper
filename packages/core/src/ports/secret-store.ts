export type SecretKey = "anthropic-api-key";

export interface SecretStore {
  get(key: SecretKey): Promise<string | null>;
}
