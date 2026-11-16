import type { HttpClient } from "core";
import { MAMMOUTH_BASE_URL, TransportError } from "core/ai";
import type { Invoke } from "./tauri-error.ts";

// Seule adresse que l'app appelle. Le Rust la fixe aussi : cette garde refuse avant même d'appeler `ai_send`.
export const AI_SEND_URL = `${MAMMOUTH_BASE_URL}/v1/messages`;

export interface AiSendReply {
  status: number;
  headers: [string, string][];
  body: string;
}

// Le Rust rejette avec un texte vide quand ce qu'il allait rendre contenait la clé (`outbound`, `ai_transport.rs`) : une
// phrase fixe pourrait elle-même contenir une clé de forme absurde. Cette phrase est écrite ici, elle ne traverse pas l'IPC.
export const LEAK_MESSAGE = "Réponse de Mammouth refusée : elle contenait la clé d'API.";

// Statuts que `new Response` force à un corps vide : le SDK n'aurait rien à lire, et lirait en JSON un corps vide. Le
// Rust ne rend ni 204 ni 205 ; 304 reste possible. Même phrase que le refus du Rust (`BODY_UNUSABLE`, `ai_transport.rs`).
const NULL_BODY_STATUSES = new Set([204, 205, 304]);
export const BODY_UNUSABLE_MESSAGE = "Réponse de Mammouth inutilisable : ignorée.";

function abortError(): DOMException {
  return new DOMException("Requête abandonnée.", "AbortError");
}

// Tauri rejette avec un texte (la phrase française du Rust) : elle devient une `TransportError`, que
// `describeApiError` affiche telle quelle. Tout autre rejet reçoit un message neutre, sans y recopier l'objet reçu.
function transportErrorOf(reason: unknown): TransportError {
  if (reason === "") {
    return new TransportError(LEAK_MESSAGE);
  }
  return new TransportError(typeof reason === "string" ? reason : "Erreur inconnue du transport.");
}

// Transport du SDK Anthropic : la requête passe par la commande `ai_send`, qui ajoute la clé et ne parle qu'à
// Mammouth. Le signal n'est pas transmis au Rust (`invoke` ne s'annule pas) : un abandon rejette tout de suite, et
// la réponse qui arrive après est ignorée.
export function createTauriHttpClient(invoke: Invoke): HttpClient {
  return {
    async send(request) {
      if (request.method !== "POST" || request.url !== AI_SEND_URL) {
        throw new TransportError("Adresse refusée : l'app n'appelle que Mammouth.");
      }
      const { signal } = request;
      if (signal.aborted) {
        throw abortError();
      }
      // Un seul écouteur, posé avant toute attente, retiré dans le `finally`.
      let onAbort: () => void = () => undefined;
      const aborted = new Promise<never>((_resolve, reject) => {
        onAbort = () => {
          reject(abortError());
        };
        signal.addEventListener("abort", onAbort);
      });
      // Cette promesse ne se règle que par un rejet : sans gestionnaire, un abandon que personne n'attend ferait
      // échouer le processus.
      aborted.catch(() => undefined);
      try {
        const body = await Promise.race([request.text(), aborted]);
        // La course peut avoir vu le corps avant l'abandon : on revérifie avant d'appeler le Rust.
        if (signal.aborted) {
          throw abortError();
        }
        const headers = [...request.headers.entries()];
        const call = invoke<AiSendReply>("ai_send", { headers, body }).catch((reason: unknown) => {
          throw transportErrorOf(reason);
        });
        // Une erreur d'`invoke` arrivée après l'abandon ne doit pas rester sans gestionnaire.
        call.catch(() => undefined);
        const reply = await Promise.race([call, aborted]);
        if (NULL_BODY_STATUSES.has(reply.status)) {
          throw new TransportError(BODY_UNUSABLE_MESSAGE);
        }
        return new Response(reply.body, {
          status: reply.status,
          headers: reply.headers,
        });
      } finally {
        signal.removeEventListener("abort", onAbort);
      }
    },
  };
}
