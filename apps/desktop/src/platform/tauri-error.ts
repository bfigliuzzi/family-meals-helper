export type Invoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

// Tauri rejette avec un texte : on le range dans une `Error`. Tout autre rejet reçoit un message neutre, sans
// y recopier l'objet reçu.
export function toTauriError(reason: unknown, fallback: string): Error {
  return typeof reason === "string" ? new Error(reason) : new Error(fallback);
}
