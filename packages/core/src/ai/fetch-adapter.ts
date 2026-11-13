import type { HttpClient } from "../ports/http-client.ts";

// Le SDK appelle `fetch` ; on le fait passer par le port HttpClient.
export function toFetch(http: HttpClient): typeof globalThis.fetch {
  return (input, init) => http.send(new Request(input, init));
}
