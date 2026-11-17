import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { MAX_CHECKED_BYTES } from "core";
import type { HistoryRow } from "core";
import { describe, expect, it } from "vitest";
import { CHECKS_GONE, CHECKS_REFUSED, fakeHistoryStore } from "./fakes.ts";

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

const row = (id: number): HistoryRow => ({ id, entry: entry("2026-11-16"), checked: "[]" });
const flush = async (): Promise<void> => {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
};

describe("fakeHistoryStore : setChecked", () => {
  it("écrit l'état complet, comme serde_json::to_string, et le rend à list", async () => {
    const history = fakeHistoryStore([row(1)]);
    await history.store.setChecked(1, ["frozen|cabillaud", "placard"]);
    expect(history.rows()[0]?.checked).toBe('["frozen|cabillaud","placard"]');
    expect(history.checkedWrites).toEqual([{ id: 1, keys: ["frozen|cabillaud", "placard"] }]);
    await history.store.setChecked(1, []);
    expect(history.rows()[0]?.checked).toBe("[]");
  });

  it("refuse clé vide, doublon et un octet de trop ; accepte la borne exacte en octets", async () => {
    const history = fakeHistoryStore([row(1)]);
    await history.store.setChecked(1, ["ancien"]);
    const tooBig = "é".repeat(MAX_CHECKED_BYTES / 2 + 1);
    for (const keys of [[""], ["a", "b", "a"], [tooBig]]) {
      await expect(history.store.setChecked(1, keys)).rejects.toThrow(CHECKS_REFUSED);
    }
    expect(history.rows()[0]?.checked).toBe('["ancien"]');
    const exact = "é".repeat(MAX_CHECKED_BYTES / 2);
    await expect(history.store.setChecked(1, [exact])).resolves.toBeUndefined();
  });

  it("refuse une entrée absente, ou purgée", async () => {
    const history = fakeHistoryStore([row(1)]);
    await expect(history.store.setChecked(9, ["a"])).rejects.toThrow(CHECKS_GONE);
    history.remove(1);
    await expect(history.store.setChecked(1, ["a"])).rejects.toThrow(CHECKS_GONE);
    expect(history.rows()).toEqual([]);
  });

  it("les phrases sont celles de history.rs", () => {
    const source = readFileSync(
      resolve(import.meta.dirname, "../../src-tauri/src/history.rs"),
      "utf8",
    );
    const phrase = (name: string): string | undefined => {
      const found = new RegExp(`const ${name}: &str =\\s*"([^"]*)";`).exec(source);
      return found?.[1];
    };
    expect(phrase("CHECKS_REFUSED")).toBe(CHECKS_REFUSED);
    expect(phrase("CHECKS_GONE")).toBe(CHECKS_GONE);
    expect(phrase("CHECKS_FAILED")).toBe("Enregistrement des cases impossible.");
  });

  it("contre-épreuve : une écriture retenue puis une seconde immédiate, la base finit sur l'ancien état", async () => {
    const history = fakeHistoryStore([row(1)]);
    history.hold("check");
    const first = history.store.setChecked(1, ["A"]);
    const second = history.store.setChecked(1, ["A", "B"]);
    await second;
    expect(history.rows()[0]?.checked).toBe('["A","B"]');
    expect(history.checksInFlight.now).toBe(1);
    history.release();
    await first;
    expect(history.rows()[0]?.checked).toBe('["A"]');
    expect(history.checksInFlight).toEqual({ now: 0, max: 2 });
  });

  it("un échec injecté et une retenue : la promesse reste pendante jusqu'à release, puis rejette", async () => {
    const history = fakeHistoryStore([row(1)]);
    history.failNext("check", "x");
    history.hold("check");
    let settled = false;
    const call = history.store.setChecked(1, ["A"]).finally(() => {
      settled = true;
    });
    call.catch(() => undefined);
    await flush();
    expect(settled).toBe(false);
    expect(history.checksInFlight.now).toBe(1);
    history.release();
    await expect(call).rejects.toThrow("x");
    expect(history.checksInFlight.now).toBe(0);
    expect(history.rows()[0]?.checked).toBe("[]");
  });

  it("copie les arguments à l'appel", async () => {
    const history = fakeHistoryStore([row(1)]);
    history.hold("check");
    const keys = ["A"];
    const call = history.store.setChecked(1, keys);
    keys.push("B");
    history.release();
    await call;
    expect(history.rows()[0]?.checked).toBe('["A"]');
  });
});
