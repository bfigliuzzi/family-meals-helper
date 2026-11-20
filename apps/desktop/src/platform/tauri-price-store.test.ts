import { describe, expect, it, vi } from "vitest";
import type { Invoke } from "./tauri-error.ts";
import { createTauriPriceStore } from "./tauri-price-store.ts";

function recordingInvoke(reply: (command: string) => Promise<unknown>) {
  const calls: { command: string; args: Record<string, unknown> | undefined }[] = [];
  const invoke: Invoke = <T>(command: string, args?: Record<string, unknown>) => {
    calls.push({ command, args });
    return reply(command) as Promise<T>;
  };
  return { invoke, calls };
}

describe("createTauriPriceStore", () => {
  it("appelle les trois commandes avec leurs arguments exacts", async () => {
    const rows = [{ key: "fresh|carotte", unit: "kg", cents: 250, date: "2026-11-16" }];
    const { invoke, calls } = recordingInvoke((command) =>
      Promise.resolve(command === "price_table_list" ? rows : undefined),
    );
    const store = createTauriPriceStore(invoke);
    expect(await store.listManual()).toEqual(rows);
    await store.setManual({ key: "fresh|carotte", unit: "kg", cents: 250, date: "2026-11-16" });
    await store.deleteManual("fresh|carotte");
    expect(calls).toEqual([
      { command: "price_table_list", args: undefined },
      {
        command: "price_table_set",
        args: { key: "fresh|carotte", unit: "kg", cents: 250, date: "2026-11-16" },
      },
      { command: "price_table_delete", args: { key: "fresh|carotte" } },
    ]);
  });

  it("une erreur texte du Rust arrive telle quelle, pour chaque commande", async () => {
    const store = createTauriPriceStore(
      vi.fn<() => Promise<never>>().mockRejectedValue("Table de prix pleine (1000 prix)."),
    );
    await expect(store.listManual()).rejects.toThrow("Table de prix pleine (1000 prix).");
    await expect(
      store.setManual({ key: "fresh|a", unit: "l", cents: 1, date: "2026-11-16" }),
    ).rejects.toThrow("Table de prix pleine (1000 prix).");
    await expect(store.deleteManual("fresh|a")).rejects.toThrow("Table de prix pleine");
  });

  it("un rejet qui n'est pas un texte donne le repli", async () => {
    const store = createTauriPriceStore(
      vi.fn<() => Promise<never>>().mockRejectedValue({ detail: "x" }),
    );
    await expect(store.listManual()).rejects.toThrow("Erreur inconnue de la table de prix.");
    await expect(store.deleteManual("fresh|a")).rejects.toThrow(
      "Erreur inconnue de la table de prix.",
    );
  });
});
