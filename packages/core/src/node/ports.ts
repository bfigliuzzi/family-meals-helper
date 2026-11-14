import type { Clock } from "../ports/clock.ts";
import type { HttpClient } from "../ports/http-client.ts";
import type { SecretStore } from "../ports/secret-store.ts";

export const nodeHttpClient: HttpClient = {
  send: (request) => fetch(request),
};

export const nodeClock: Clock = {
  now: () => new Date(),
};

// La clé vient de ANTHROPIC_API_KEY ; une chaîne vide vaut « absente ».
export function createEnvSecretStore(env: NodeJS.ProcessEnv): SecretStore {
  return {
    get(key) {
      const value = key === "anthropic-api-key" ? env["ANTHROPIC_API_KEY"] : undefined;
      return Promise.resolve(value === undefined || value === "" ? null : value);
    },
  };
}

// Une erreur sur stdout ou stderr (tube fermé par « | head », terminal disparu…) ne doit jamais faire planter la
// commande : une exception non capturée sortirait en code 1, qui veut dire « PDF écrit avec avertissement », et
// pourrait faire perdre un PDF déjà payé. La sortie au terminal est faite au mieux ; le code de sortie reste celui du
// résultat.
export function onOutputError(error: Error): void {
  // Ignorée, volontairement : l'erreur n'est ni relancée ni écrite (elle viendrait d'une sortie déjà cassée).
  void error;
}

export function guardOutputStreams(): void {
  for (const stream of [process.stdout, process.stderr]) stream.on("error", onOutputError);
}
