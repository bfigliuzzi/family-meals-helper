import { describe, expect, it, vi } from "vitest";
import type { Invoke } from "./tauri-error.ts";
import { createTauriOpenPricesStore } from "./tauri-open-prices-store.ts";

function recordingInvoke(reply: (command: string) => Promise<unknown>) {
  const calls: { command: string; args: Record<string, unknown> | undefined }[] = [];
  const invoke: Invoke = <T>(command: string, args?: Record<string, unknown>) => {
    calls.push({ command, args });
    return reply(command) as Promise<T>;
  };
  return { invoke, calls };
}

const replying =
  (reply: unknown): Invoke =>
  <T>() =>
    Promise.resolve(reply as T);

const BYTES = [1, 2, 3, 255, 0];

describe("createTauriOpenPricesStore", () => {
  it("appelle les quatre commandes avec leurs arguments exacts", async () => {
    const { invoke, calls } = recordingInvoke((command) => {
      if (command === "open_prices_load") {
        return Promise.resolve({ attemptedAt: "2026-11-20", summary: "{}" });
      }
      if (command === "open_prices_read") return Promise.resolve(new Uint8Array(BYTES).buffer);
      return Promise.resolve(undefined);
    });
    const store = createTauriOpenPricesStore(invoke);
    expect(await store.load()).toEqual({ attemptedAt: "2026-11-20", summary: "{}" });
    await store.download("2026-11-20");
    expect([...(await store.read("prices", 524288))]).toEqual(BYTES);
    await store.save("2026-11-20", '{"version":1}');
    expect(calls).toEqual([
      { command: "open_prices_load", args: undefined },
      { command: "open_prices_download", args: { today: "2026-11-20" } },
      { command: "open_prices_read", args: { file: "prices", offset: 524288 } },
      { command: "open_prices_save", args: { today: "2026-11-20", summary: '{"version":1}' } },
    ]);
  });

  it("`load` rend deux null quand la base n'a rien", async () => {
    const store = createTauriOpenPricesStore(replying({ attemptedAt: null, summary: null }));
    expect(await store.load()).toEqual({ attemptedAt: null, summary: null });
  });

  it("`load` refuse une réponse de forme inattendue", async () => {
    for (const reply of [null, "texte", { attemptedAt: 3, summary: null }, { summary: [] }]) {
      const store = createTauriOpenPricesStore(replying(reply));
      await expect(store.load(), JSON.stringify(reply)).rejects.toThrow(
        "Réponse des prix Open Prices inattendue.",
      );
    }
  });

  it("`read` rend le même Uint8Array pour un ArrayBuffer, un Uint8Array et un tableau de nombres", async () => {
    for (const reply of [new Uint8Array(BYTES).buffer, new Uint8Array(BYTES), BYTES]) {
      const store = createTauriOpenPricesStore(replying(reply));
      const bytes = await store.read("locations", 0);
      expect(bytes).toBeInstanceOf(Uint8Array);
      expect([...bytes]).toEqual(BYTES);
    }
  });

  it("`read` rend un tableau vide à la fin du fichier", async () => {
    const store = createTauriOpenPricesStore(replying(new ArrayBuffer(0)));
    expect((await store.read("products", 99)).length).toBe(0);
  });

  it("`read` refuse toute autre forme avec la phrase exacte", async () => {
    for (const reply of ["abc", 3, null, { 0: 1 }, [1, 2, 256], [1, "2"], [1.5]]) {
      const store = createTauriOpenPricesStore(replying(reply));
      await expect(store.read("prices", 0), JSON.stringify(reply)).rejects.toThrow(
        "Réponse de lecture des prix inattendue.",
      );
    }
  });

  it("une erreur texte du Rust arrive telle quelle, pour chaque commande", async () => {
    const store = createTauriOpenPricesStore(
      vi.fn<() => Promise<never>>().mockRejectedValue("Téléchargement Open Prices interrompu."),
    );
    await expect(store.load()).rejects.toThrow("Téléchargement Open Prices interrompu.");
    await expect(store.download("2026-11-20")).rejects.toThrow("interrompu");
    await expect(store.read("prices", 0)).rejects.toThrow("interrompu");
    await expect(store.save("2026-11-20", "{}")).rejects.toThrow("interrompu");
  });

  it("un rejet qui n'est pas un texte donne le repli", async () => {
    const store = createTauriOpenPricesStore(
      vi.fn<() => Promise<never>>().mockRejectedValue({ detail: "x" }),
    );
    await expect(store.download("2026-11-20")).rejects.toThrow(
      "Erreur inconnue des prix Open Prices.",
    );
  });
});
