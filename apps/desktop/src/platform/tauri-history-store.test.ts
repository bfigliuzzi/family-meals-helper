import { MAX_PDF_BYTES } from "core";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Invoke } from "./tauri-error.ts";
import { createTauriHistoryStore } from "./tauri-history-store.ts";

function recordingInvoke(reply: (command: string) => Promise<unknown>) {
  const calls: { command: string; args: Record<string, unknown> | undefined }[] = [];
  const invoke: Invoke = <T>(command: string, args?: Record<string, unknown>) => {
    calls.push({ command, args });
    return reply(command) as Promise<T>;
  };
  return { invoke, calls };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createTauriHistoryStore", () => {
  it("`add` envoie le jeton, l'entrée et le PDF en tableau de nombres", async () => {
    const { invoke, calls } = recordingInvoke(() => Promise.resolve(7));
    const store = createTauriHistoryStore(invoke);
    const id = await store.add("jeton", '{"date":"2026-11-16"}', new Uint8Array([37, 80, 68, 70]));
    expect(id).toBe(7);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.command).toBe("history_add");
    const args = calls[0]?.args;
    expect(args?.["token"]).toBe("jeton");
    expect(args?.["entry"]).toBe('{"date":"2026-11-16"}');
    expect(Array.isArray(args?.["pdf"])).toBe(true);
    expect(args?.["pdf"]).toEqual([37, 80, 68, 70]);
  });

  it("un PDF de MAX_PDF_BYTES octets part, un de plus est refusé avant tout `invoke` et avant `Array.from`", async () => {
    const { invoke, calls } = recordingInvoke(() => Promise.resolve(1));
    const store = createTauriHistoryStore(invoke);
    await store.add("jeton", "{}", new Uint8Array(MAX_PDF_BYTES));
    expect(calls).toHaveLength(1);

    const spy = vi.spyOn(Array, "from");
    await expect(store.add("jeton", "{}", new Uint8Array(MAX_PDF_BYTES + 1))).rejects.toThrow(
      "Fiche trop grande.",
    );
    expect(calls).toHaveLength(1);
    expect(spy).not.toHaveBeenCalled();
  });

  it("appelle les trois autres commandes avec leurs arguments exacts", async () => {
    const { invoke, calls } = recordingInvoke((command) =>
      Promise.resolve(command === "history_list" ? [] : "/Users/x/Downloads/menu-batch.pdf"),
    );
    const store = createTauriHistoryStore(invoke);
    expect(await store.list()).toEqual([]);
    await store.openPdf(3);
    expect(await store.exportPdf(3)).toBe("/Users/x/Downloads/menu-batch.pdf");
    expect(calls).toEqual([
      { command: "history_list", args: undefined },
      { command: "history_open_pdf", args: { id: 3 } },
      { command: "history_export_pdf", args: { id: 3 } },
    ]);
  });

  it("`setChecked` appelle history_set_checked avec un tableau simple", async () => {
    const { invoke, calls } = recordingInvoke(() => Promise.resolve(undefined));
    const store = createTauriHistoryStore(invoke);
    const frozen = Object.freeze(["a"]);
    await store.setChecked(3, frozen);
    expect(calls).toEqual([{ command: "history_set_checked", args: { id: 3, checked: ["a"] } }]);
    expect(calls[0]?.args?.["checked"]).not.toBe(frozen);
    expect(Object.isFrozen(calls[0]?.args?.["checked"])).toBe(false);
  });

  it("une erreur texte du Rust arrive telle quelle, pour chaque commande", async () => {
    // Tauri rejette avec un texte, pas avec une Error.
    const store = createTauriHistoryStore(
      vi.fn<() => Promise<never>>().mockRejectedValue("Fiche refusée : ce n'est pas un PDF."),
    );
    await expect(store.add("j", "{}", new Uint8Array([1]))).rejects.toThrow(
      "Fiche refusée : ce n'est pas un PDF.",
    );
    await expect(store.list()).rejects.toThrow("Fiche refusée");
    await expect(store.openPdf(1)).rejects.toThrow("Fiche refusée");
    await expect(store.exportPdf(1)).rejects.toThrow("Fiche refusée");
    await expect(store.setChecked(1, ["a"])).rejects.toThrow("Fiche refusée");
  });

  it("un rejet qui n'est pas un texte donne le repli", async () => {
    const store = createTauriHistoryStore(
      vi.fn<() => Promise<never>>().mockRejectedValue({ detail: "x" }),
    );
    await expect(store.list()).rejects.toThrow("Erreur inconnue de l'historique.");
    await expect(store.setChecked(1, [])).rejects.toThrow("Erreur inconnue de l'historique.");
    await expect(store.add("j", "{}", new Uint8Array([1]))).rejects.toThrow(
      "Erreur inconnue de l'historique.",
    );
  });
});
