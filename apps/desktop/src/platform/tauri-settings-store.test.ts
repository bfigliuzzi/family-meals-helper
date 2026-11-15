import { describe, expect, it } from "vitest";
import type { Invoke } from "./tauri-error.ts";
import { createTauriSettingsStore } from "./tauri-settings-store.ts";

function recordingInvoke(reply: (command: string) => Promise<unknown>) {
  const calls: { command: string; args: Record<string, unknown> | undefined }[] = [];
  const invoke: Invoke = <T>(command: string, args?: Record<string, unknown>) => {
    calls.push({ command, args });
    return reply(command) as Promise<T>;
  };
  return { invoke, calls };
}

describe("createTauriSettingsStore", () => {
  it("appelle les deux commandes avec leurs arguments exacts", async () => {
    const { invoke, calls } = recordingInvoke(() => Promise.resolve(null));
    const store = createTauriSettingsStore(invoke);
    await store.read();
    await store.write('{"version":1}');
    expect(calls).toEqual([
      { command: "settings_read", args: undefined },
      { command: "settings_write", args: { document: '{"version":1}' } },
    ]);
  });
  it("transmet null tel quel, et le texte lu", async () => {
    const empty = createTauriSettingsStore(recordingInvoke(() => Promise.resolve(null)).invoke);
    expect(await empty.read()).toBeNull();
    const full = createTauriSettingsStore(recordingInvoke(() => Promise.resolve("{}")).invoke);
    expect(await full.read()).toBe("{}");
  });
  it("transforme un rejet en texte en Error avec ce message", async () => {
    // Tauri rejette avec un texte, pas avec une Error.
    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
    const store = createTauriSettingsStore(() => Promise.reject("déjà ouverte"));
    const error: unknown = await store.read().catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("déjà ouverte");
    await expect(store.write("{}")).rejects.toThrow("déjà ouverte");
  });
  it("donne un message neutre pour tout autre rejet", async () => {
    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
    const store = createTauriSettingsStore(() => Promise.reject({ detail: "x" }));
    await expect(store.read()).rejects.toThrow("Erreur inconnue de la base des réglages.");
  });
});
