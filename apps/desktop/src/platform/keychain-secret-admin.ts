import type { SecretAdmin, SecretKey } from "core";
import { toTauriError } from "./tauri-error.ts";
import type { Invoke } from "./tauri-error.ts";

// Le front n'a jamais accès à la clé stockée : `secret_status` ne rend que sa présence. La clé tapée passe une fois
// par la vue web, au moment de `set`.
// `has`, `set` et `delete` passent l'un après l'autre : un `has` lancé en revenant sur Réglages attend la fin
// d'un `set` encore en cours. La file continue après un échec ; chaque appelant reçoit le résultat ou l'erreur
// de sa propre opération.
export function createKeychainSecretAdmin(invoke: Invoke): SecretAdmin {
  let queue: Promise<unknown> = Promise.resolve();

  function enqueue<T>(command: string, args: Record<string, unknown>): Promise<T> {
    const result = queue
      .then(() => invoke<T>(command, args))
      .catch((reason: unknown) => {
        throw toTauriError(reason, "Erreur inconnue du trousseau.");
      });
    queue = result.catch(() => undefined);
    return result;
  }

  return {
    has: (key: SecretKey) => enqueue<boolean>("secret_status", { key }),
    set: (key: SecretKey, value: string) => enqueue<void>("secret_set", { key, value }),
    delete: (key: SecretKey) => enqueue<void>("secret_delete", { key }),
  };
}
