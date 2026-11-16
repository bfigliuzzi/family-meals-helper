export const DEFAULT_MODEL = "claude-sonnet-5-5";
export const DEFAULT_BASE_URL = "https://api.anthropic.com";
// Seul hôte que l'app appelle (lot 6) : le transport Rust (`ai_send`) n'envoie rien d'autre.
export const MAMMOUTH_BASE_URL = "https://api.mammouth.ai";

// Fonctions qu'on peut ne pas envoyer à un proxy qui les refuse (FMH_DISABLE).
export type Feature = "format" | "effort" | "cache";

// `input` ne compte que la partie hors cache.
export interface TokenUsage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export interface ModelReply {
  text: string;
  stopReason: string | null;
  usage: TokenUsage;
}

export interface Model {
  complete(prompt: { system: string; user: string }): Promise<ModelReply>;
}
