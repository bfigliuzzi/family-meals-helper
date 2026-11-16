import { describe, expect, it } from "vitest";
import { fakeHistoryStore } from "./fakes.ts";

const pdf = new TextEncoder().encode("%PDF-1.7 exemple");
const entry = (date: string) => JSON.stringify({ version: 1, date });

// Le faux historique refuse ce que refuse le Rust (history.rs), pour que les tests d'écran ne passent pas avec des
// entrées que le vrai magasin rejetterait.
describe("fakeHistoryStore", () => {
  it("accepte une entrée et un PDF valides", async () => {
    const history = fakeHistoryStore();
    await expect(history.store.add("jeton-1", entry("2024-02-29"), pdf)).resolves.toBe(1);
  });

  it("refuse un PDF qui ne commence pas par %PDF-", async () => {
    const history = fakeHistoryStore();
    await expect(
      history.store.add("jeton", entry("2026-11-16"), new Uint8Array([37])),
    ).rejects.toThrow("Fiche refusée : ce n'est pas un PDF.");
    await expect(history.store.add("jeton", entry("2026-11-16"), new Uint8Array())).rejects.toThrow(
      "ce n'est pas un PDF",
    );
    // Assez long, mais mauvais préfixe : seule la comparaison des octets le refuse.
    await expect(
      history.store.add("jeton", entry("2026-11-16"), new TextEncoder().encode("%PDX-1.7 exemple")),
    ).rejects.toThrow("Fiche refusée : ce n'est pas un PDF.");
    expect(history.rows()).toEqual([]);
  });

  it("refuse une fausse date, ou une entrée qui n'est pas du JSON", async () => {
    const history = fakeHistoryStore();
    for (const text of [
      entry("2026-02-30"),
      entry("2025-02-29"),
      entry("2026-1-1"),
      "{pas du json",
      "null",
      "{}",
    ]) {
      await expect(history.store.add("jeton", text, pdf)).rejects.toThrow(
        "Entrée d'historique illisible.",
      );
    }
    expect(history.rows()).toEqual([]);
  });

  it("refuse un jeton hors de [A-Za-z0-9_-]{1,64}", async () => {
    const history = fakeHistoryStore();
    for (const token of ["", "jeton ?", "../x", "a".repeat(65)]) {
      await expect(history.store.add(token, entry("2026-11-16"), pdf)).rejects.toThrow(
        "Enregistrement dans l'historique impossible.",
      );
    }
    expect(history.rows()).toEqual([]);
  });
});
