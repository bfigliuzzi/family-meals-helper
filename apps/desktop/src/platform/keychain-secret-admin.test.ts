import { describe, expect, it } from "vitest";
import { createKeychainSecretAdmin } from "./keychain-secret-admin.ts";
import type { Invoke } from "./tauri-error.ts";

interface Call {
  command: string;
  args: Record<string, unknown> | undefined;
}

function recordingInvoke(reply: (command: string) => Promise<unknown>) {
  const calls: Call[] = [];
  const invoke: Invoke = <T>(command: string, args?: Record<string, unknown>) => {
    calls.push({ command, args });
    return reply(command) as Promise<T>;
  };
  return { invoke, calls };
}

describe("createKeychainSecretAdmin", () => {
  it("appelle les trois commandes avec leurs arguments exacts", async () => {
    const { invoke, calls } = recordingInvoke(() => Promise.resolve(undefined));
    const admin = createKeychainSecretAdmin(invoke);
    await admin.has("anthropic-api-key");
    await admin.set("anthropic-api-key", "sk-test");
    await admin.delete("anthropic-api-key");
    expect(calls).toEqual([
      { command: "secret_status", args: { key: "anthropic-api-key" } },
      { command: "secret_set", args: { key: "anthropic-api-key", value: "sk-test" } },
      { command: "secret_delete", args: { key: "anthropic-api-key" } },
    ]);
  });
  it("`has` rend le booléen reçu de `secret_status`", async () => {
    const absent = createKeychainSecretAdmin(recordingInvoke(() => Promise.resolve(false)).invoke);
    expect(await absent.has("anthropic-api-key")).toBe(false);
    const present = createKeychainSecretAdmin(recordingInvoke(() => Promise.resolve(true)).invoke);
    expect(await present.has("anthropic-api-key")).toBe(true);
  });
  it("n'expose aucune lecture de la valeur", () => {
    const admin = createKeychainSecretAdmin(recordingInvoke(() => Promise.resolve(true)).invoke);
    expect(Object.keys(admin).sort()).toEqual(["delete", "has", "set"]);
  });
  it("transforme un rejet en texte en Error avec ce message", async () => {
    // Tauri rejette avec un texte, pas avec une Error.
    const invoke: Invoke = () =>
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
      Promise.reject("Lecture du trousseau impossible : verrouillé");
    const admin = createKeychainSecretAdmin(invoke);
    const error: unknown = await admin.has("anthropic-api-key").catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("Lecture du trousseau impossible : verrouillé");
  });
  it("donne un message neutre pour tout autre rejet, sans y recopier l'objet reçu", async () => {
    const invoke: Invoke = () =>
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
      Promise.reject({ secret: "sk-ne-pas-afficher" });
    const admin = createKeychainSecretAdmin(invoke);
    await expect(admin.set("anthropic-api-key", "sk-ne-pas-afficher")).rejects.toThrow(
      new Error("Erreur inconnue du trousseau."),
    );
  });
  it("met les opérations en file : un has lancé pendant un set attend sa fin", async () => {
    const held: { release: () => void }[] = [];
    const { invoke, calls } = recordingInvoke((command) =>
      command === "secret_set"
        ? new Promise<void>((resolve) => {
            held.push({ release: () => resolve() });
          })
        : Promise.resolve(true),
    );
    const admin = createKeychainSecretAdmin(invoke);
    const setting = admin.set("anthropic-api-key", "sk-x");
    const checking = admin.has("anthropic-api-key");
    await Promise.resolve();
    await Promise.resolve();
    expect(calls.map((call) => call.command)).toEqual(["secret_set"]);
    held[0]?.release();
    await setting;
    expect(await checking).toBe(true);
    expect(calls.map((call) => call.command)).toEqual(["secret_set", "secret_status"]);
  });
  it("un set qui échoue n'empêche pas le has suivant", async () => {
    const { invoke, calls } = recordingInvoke((command) =>
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
      command === "secret_set" ? Promise.reject("refusé") : Promise.resolve(false),
    );
    const admin = createKeychainSecretAdmin(invoke);
    const setting = admin.set("anthropic-api-key", "sk-x");
    const checking = admin.has("anthropic-api-key");
    await expect(setting).rejects.toThrow("refusé");
    expect(await checking).toBe(false);
    expect(calls.map((call) => call.command)).toEqual(["secret_set", "secret_status"]);
  });
});
