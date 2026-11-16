import { TransportError } from "core/ai";
import { describe, expect, it, vi } from "vitest";
import {
  AI_SEND_URL,
  BODY_UNUSABLE_MESSAGE,
  createTauriHttpClient,
  LEAK_MESSAGE,
} from "./tauri-http-client.ts";
import type { AiSendReply } from "./tauri-http-client.ts";
import type { Invoke } from "./tauri-error.ts";

interface Call {
  command: string;
  args: Record<string, unknown> | undefined;
}

function recordingInvoke(reply: () => Promise<unknown>) {
  const calls: Call[] = [];
  const invoke: Invoke = <T>(command: string, args?: Record<string, unknown>) => {
    calls.push({ command, args });
    return reply() as Promise<T>;
  };
  return { invoke, calls };
}

const okReply: AiSendReply = {
  status: 200,
  headers: [["content-type", "application/json"]],
  body: '{"ok":true}',
};

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  let reject: (reason: unknown) => void = () => undefined;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

function post(init: RequestInit = {}): Request {
  return new Request(AI_SEND_URL, { method: "POST", body: "{}", ...init });
}

async function errorOf(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => undefined,
    (reason: unknown) => reason,
  );
}

function isAbortError(reason: unknown): boolean {
  return reason instanceof DOMException && reason.name === "AbortError";
}

describe("createTauriHttpClient", () => {
  it("envoie à ai_send tous les en-têtes et le corps exact", async () => {
    const { invoke, calls } = recordingInvoke(() => Promise.resolve(okReply));
    const body = '{"model":"m","messages":[{"role":"user","content":"é"}]}';
    const request = new Request(AI_SEND_URL, {
      method: "POST",
      body,
      headers: {
        "content-type": "application/json",
        "anthropic-version": "2026-10-21",
        "x-a": "b",
      },
    });
    await createTauriHttpClient(invoke).send(request);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.command).toBe("ai_send");
    const args = calls[0]?.args as { headers: [string, string][]; body: string };
    expect(args.body).toBe(body);
    expect(Object.fromEntries(args.headers)).toEqual({
      "content-type": "application/json",
      "anthropic-version": "2026-10-21",
      "x-a": "b",
    });
  });

  it("refuse toute autre adresse ou méthode sans appeler ai_send", async () => {
    const { invoke, calls } = recordingInvoke(() => Promise.resolve(okReply));
    const client = createTauriHttpClient(invoke);
    const requests = [
      new Request("https://api.anthropic.com/v1/messages", { method: "POST", body: "{}" }),
      new Request(`${AI_SEND_URL}?beta=true`, { method: "POST", body: "{}" }),
      new Request("http://api.mammouth.ai/v1/messages", { method: "POST", body: "{}" }),
      new Request(AI_SEND_URL, { method: "GET" }),
    ];
    for (const request of requests) {
      const error = await errorOf(client.send(request));
      expect(error).toBeInstanceOf(TransportError);
      expect((error as Error).message).toBe("Adresse refusée : l'app n'appelle que Mammouth.");
    }
    expect(calls).toHaveLength(0);
  });

  it("rend statut, en-têtes et corps reçus", async () => {
    const reply: AiSendReply = {
      status: 429,
      headers: [
        ["content-type", "application/json"],
        ["retry-after", "7"],
      ],
      body: '{"type":"error"}',
    };
    const { invoke } = recordingInvoke(() => Promise.resolve(reply));
    const response = await createTauriHttpClient(invoke).send(post());
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("7");
    expect(response.headers.get("content-type")).toBe("application/json");
    expect(await response.text()).toBe('{"type":"error"}');
  });

  it("204, 205 et 304 sont refusés avec une phrase fixe, sans planter", async () => {
    for (const status of [204, 205, 304]) {
      const reply: AiSendReply = { status, headers: [], body: "" };
      const { invoke } = recordingInvoke(() => Promise.resolve(reply));
      const error: unknown = await createTauriHttpClient(invoke)
        .send(post())
        .catch((e: unknown) => e);
      expect(error, String(status)).toBeInstanceOf(TransportError);
      expect((error as Error).message).toBe(BODY_UNUSABLE_MESSAGE);
    }
  });

  it("un rejet texte devient une TransportError avec ce texte, un autre rejet un message neutre", async () => {
    const text = "Aucune clé d'API dans le trousseau : enregistrez-la dans Réglages.";
    // Tauri rejette avec un texte, pas avec une Error.
    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
    const rejectingText = recordingInvoke(() => Promise.reject(text));
    const fromText = await errorOf(createTauriHttpClient(rejectingText.invoke).send(post()));
    expect(fromText).toBeInstanceOf(TransportError);
    expect((fromText as Error).message).toBe(text);
    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
    const rejectingObject = recordingInvoke(() => Promise.reject({ secret: "sk-ne-pas-afficher" }));
    const fromObject = await errorOf(createTauriHttpClient(rejectingObject.invoke).send(post()));
    expect(fromObject).toBeInstanceOf(TransportError);
    expect((fromObject as Error).message).toBe("Erreur inconnue du transport.");
  });

  it("un rejet vide (le Rust a refusé un texte qui contenait la clé) donne la phrase fixe", async () => {
    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
    const rejecting = recordingInvoke(() => Promise.reject(""));
    const error = await errorOf(createTauriHttpClient(rejecting.invoke).send(post()));
    expect(error).toBeInstanceOf(TransportError);
    expect((error as Error).message).toBe(LEAK_MESSAGE);
    expect(LEAK_MESSAGE).not.toBe("");
  });

  it("signal déjà abandonné : aucun appel", async () => {
    const { invoke, calls } = recordingInvoke(() => Promise.resolve(okReply));
    const controller = new AbortController();
    controller.abort();
    const error = await errorOf(
      createTauriHttpClient(invoke).send(post({ signal: controller.signal })),
    );
    expect(isAbortError(error)).toBe(true);
    expect(calls).toHaveLength(0);
  });

  it("abandon pendant la lecture du corps : aucun appel", async () => {
    const { invoke, calls } = recordingInvoke(() => Promise.resolve(okReply));
    const controller = new AbortController();
    const reading = deferred<string>();
    const request = Object.assign(post({ signal: controller.signal }), {
      text: () => reading.promise,
    });
    const sending = createTauriHttpClient(invoke).send(request);
    controller.abort();
    expect(isAbortError(await errorOf(sending))).toBe(true);
    expect(calls).toHaveLength(0);
  });

  it("corps lu puis abandon avant la reprise : aucun appel", async () => {
    const { invoke, calls } = recordingInvoke(() => Promise.resolve(okReply));
    const controller = new AbortController();
    const reading = deferred<string>();
    const request = Object.assign(post({ signal: controller.signal }), {
      text: () => reading.promise,
    });
    const sending = createTauriHttpClient(invoke).send(request);
    // Dans le même tour et dans cet ordre : la course voit d'abord le corps, seule la revérification arrête l'appel.
    reading.resolve("{}");
    controller.abort();
    expect(isAbortError(await errorOf(sending))).toBe(true);
    expect(calls).toHaveLength(0);
  });

  it("abandon pendant l'appel : rejet AbortError, la réponse tardive est ignorée", async () => {
    const late = deferred<AiSendReply>();
    const { invoke, calls } = recordingInvoke(() => late.promise);
    const controller = new AbortController();
    const sending = createTauriHttpClient(invoke).send(post({ signal: controller.signal }));
    await vi.waitFor(() => {
      expect(calls).toHaveLength(1);
    });
    controller.abort();
    expect(isAbortError(await errorOf(sending))).toBe(true);
    late.resolve(okReply);
    await Promise.resolve();
    expect(calls).toHaveLength(1);
  });

  it("abandon pendant l'appel puis rejet tardif d'invoke : aucun rejet non géré", async () => {
    const late = deferred<AiSendReply>();
    const { invoke, calls } = recordingInvoke(() => late.promise);
    const controller = new AbortController();
    const sending = createTauriHttpClient(invoke).send(post({ signal: controller.signal }));
    await vi.waitFor(() => {
      expect(calls).toHaveLength(1);
    });
    controller.abort();
    expect(isAbortError(await errorOf(sending))).toBe(true);
    late.reject("erreur tardive");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(calls).toHaveLength(1);
  });

  it("l'écouteur est retiré après une réponse, un rejet d'invoke et un abandon", async () => {
    async function outcome(reply: () => Promise<unknown>, abortAfterCall: boolean) {
      const controller = new AbortController();
      const request = post({ signal: controller.signal });
      const add = vi.spyOn(request.signal, "addEventListener");
      const remove = vi.spyOn(request.signal, "removeEventListener");
      const { invoke, calls } = recordingInvoke(reply);
      const sending = createTauriHttpClient(invoke).send(request);
      if (abortAfterCall) {
        await vi.waitFor(() => {
          expect(calls).toHaveLength(1);
        });
        controller.abort();
      }
      await errorOf(sending);
      expect(add).toHaveBeenCalledTimes(1);
      const [addedName, added] = add.mock.calls[0] ?? [];
      expect(addedName).toBe("abort");
      expect(remove).toHaveBeenCalledWith("abort", added);
    }
    await outcome(() => Promise.resolve(okReply), false);
    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
    await outcome(() => Promise.reject("refusé"), false);
    await outcome(() => new Promise(() => undefined), true);
  });
});
