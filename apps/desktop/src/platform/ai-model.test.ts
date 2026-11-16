import { MenuSchema } from "core";
import { createAnthropicModel, MAMMOUTH_BASE_URL } from "core/ai";
import { describe, expect, it } from "vitest";
import { createAppModel, RUST_INJECTED_KEY } from "./ai-model.ts";
import mammouthReply from "./fixtures/mammouth-reply.json";
import { BODY_UNUSABLE_MESSAGE, createTauriHttpClient, LEAK_MESSAGE } from "./tauri-http-client.ts";
import type { Invoke } from "./tauri-error.ts";

interface Call {
  command: string;
  args: { headers: [string, string][]; body: string };
}

function recordingInvoke(reply: () => Promise<unknown>) {
  const calls: Call[] = [];
  const invoke: Invoke = <T>(command: string, args?: Record<string, unknown>) => {
    calls.push({ command, args: args as Call["args"] });
    return reply() as Promise<T>;
  };
  return { invoke, calls };
}

const prompt = { system: "Système", user: "Utilisateur" };

describe("createAppModel", () => {
  it("sans `browser`, le SDK refuse de se construire dans la vue web", () => {
    // Prouve que jsdom est vu comme un navigateur : le test suivant exerce donc bien `dangerouslyAllowBrowser`.
    expect(() =>
      createAnthropicModel({
        apiKey: RUST_INJECTED_KEY,
        baseURL: MAMMOUTH_BASE_URL,
        model: "m",
        http: createTauriHttpClient(() => Promise.reject(new Error("jamais appelé"))),
        logger: console,
        disabled: new Set(),
        schema: MenuSchema,
        browser: false,
      }),
    ).toThrow();
  });

  it("le SDK passe par ai_send, avec le modèle des réglages", async () => {
    const { invoke, calls } = recordingInvoke(() => Promise.resolve(mammouthReply));
    const model = createAppModel(invoke, { model: "claude-modele-de-test" }, MenuSchema);
    await model.complete(prompt);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.command).toBe("ai_send");
    const { headers, body } = calls[0]?.args ?? { headers: [], body: "{}" };
    const sent = JSON.parse(body) as Record<string, unknown>;
    expect(sent["model"]).toBe("claude-modele-de-test");
    expect(sent["stream"] ?? false).toBe(false);
    const byName = Object.fromEntries(headers);
    expect(byName["authorization"]).toBe(`Bearer ${RUST_INJECTED_KEY}`);
    expect(byName["anthropic-dangerous-direct-browser-access"]).toBe("true");
    expect(headers.length).toBeLessThan(32);
    // Ce que le Rust doit filtrer : la liste casse si une montée du SDK ajoute un en-tête.
    expect(headers.map(([name]) => name).sort()).toEqual([
      "accept",
      "anthropic-dangerous-direct-browser-access",
      "anthropic-version",
      "authorization",
      "content-type",
      "user-agent",
      "x-stainless-arch",
      "x-stainless-lang",
      "x-stainless-os",
      "x-stainless-package-version",
      "x-stainless-retry-count",
      "x-stainless-runtime",
      "x-stainless-runtime-version",
      "x-stainless-timeout",
    ]);
  });

  it("lit une réponse de Mammouth passée par ai_send", async () => {
    const { invoke } = recordingInvoke(() => Promise.resolve(mammouthReply));
    const reply = await createAppModel(invoke, { model: "m" }, MenuSchema).complete(prompt);
    expect(reply.text.length).toBeGreaterThan(0);
    expect(reply.usage.input).toBeGreaterThan(0);
  });

  it("une erreur locale du Rust s'affiche telle quelle", async () => {
    const sentence = "Aucune clé d'API dans le trousseau : enregistrez-la dans Réglages.";
    // Tauri rejette avec un texte, pas avec une Error.
    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
    const { invoke } = recordingInvoke(() => Promise.reject(sentence));
    await expect(
      createAppModel(invoke, { model: "m" }, MenuSchema).complete(prompt),
    ).rejects.toThrow(new Error(sentence));
  });

  it("une clé refusée (401) renvoie aux Réglages", async () => {
    const refused = {
      status: 401,
      headers: [["content-type", "application/json"]],
      body: '{"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"}}',
    };
    const { invoke } = recordingInvoke(() => Promise.resolve(refused));
    const error: unknown = await createAppModel(invoke, { model: "m" }, MenuSchema)
      .complete(prompt)
      .catch((reason: unknown) => reason);
    const message = (error as Error).message;
    expect(message).toContain("Réglages");
    expect(message).not.toContain("ANTHROPIC_");
  });

  it("un texte ou un message d'erreur objet donnent une phrase fixe (contre-exemples du cycle 6)", async () => {
    const cases = [
      {
        reply: {
          status: 200,
          headers: [["content-type", "application/json"]],
          body: '{"content":[{"type":"text","text":{"toString":0}}],"stop_reason":null,"usage":{"input_tokens":1,"output_tokens":1}}',
        },
        expected: "Réponse de l'IA inattendue.",
      },
      {
        reply: {
          status: 400,
          headers: [["content-type", "application/json"]],
          body: '{"error":{"message":{"toString":0}}}',
        },
        expected: "Requête refusée (400)",
      },
    ];
    for (const { reply, expected } of cases) {
      const { invoke } = recordingInvoke(() => Promise.resolve(reply));
      const error: unknown = await createAppModel(invoke, { model: "m" }, MenuSchema)
        .complete(prompt)
        .catch((reason: unknown) => reason);
      expect((error as Error).message.startsWith(expected), (error as Error).message).toBe(true);
    }
  });

  it("un 205 au corps JSON donne la phrase du refus, pas une erreur de lecture JSON", async () => {
    // Contre-exemple Codex du cycle 7 : `new Response` vidait le corps et le SDK lisait du JSON vide.
    const reply = { ...mammouthReply, status: 205 };
    const { invoke } = recordingInvoke(() => Promise.resolve(reply));
    await expect(
      createAppModel(invoke, { model: "m" }, MenuSchema).complete(prompt),
    ).rejects.toThrow(new Error(BODY_UNUSABLE_MESSAGE));
  });

  it("un 502 sans corps donne une phrase française avec son statut, sans le texte anglais du SDK", async () => {
    const { invoke } = recordingInvoke(() =>
      Promise.resolve({ status: 502, headers: [], body: "" }),
    );
    const error: unknown = await createAppModel(invoke, { model: "m" }, MenuSchema)
      .complete(prompt)
      .catch((reason: unknown) => reason);
    expect((error as Error).message).toBe("Erreur de l'API (502).");
  });

  it("une erreur rendue sans corps (le Rust l'a vidé) affiche son statut", async () => {
    const { invoke } = recordingInvoke(() =>
      Promise.resolve({ status: 401, headers: [], body: "" }),
    );
    await expect(
      createAppModel(invoke, { model: "m" }, MenuSchema).complete(prompt),
    ).rejects.toThrow(new Error("Clé refusée (401) : vérifiez la clé enregistrée dans Réglages."));
  });

  it("un rejet vide du Rust (clé dans la réponse, ou clé absurde comme `json`) affiche LEAK_MESSAGE", async () => {
    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
    const { invoke } = recordingInvoke(() => Promise.reject(""));
    await expect(
      createAppModel(invoke, { model: "m" }, MenuSchema).complete(prompt),
    ).rejects.toThrow(new Error(LEAK_MESSAGE));
  });

  it("une réponse 200 sans content-type ou sans corps donne une phrase fixe, pas une TypeError", async () => {
    // Contre-exemples des cycles 4 et 5 : le SDK lit alors le corps comme du texte.
    for (const reply of [
      { ...mammouthReply, headers: [] },
      { status: 200, headers: [], body: "" },
    ]) {
      const { invoke } = recordingInvoke(() => Promise.resolve(reply));
      await expect(
        createAppModel(invoke, { model: "m" }, MenuSchema).complete(prompt),
      ).rejects.toThrow(new Error("Réponse de l'IA inattendue."));
    }
  });
});
