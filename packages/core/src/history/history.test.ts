import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { balancedMenu } from "../rules/fixtures/menus.ts";
import { MAX_PDF_BYTES } from "../ports/history-store.ts";
import type { HistoryRow } from "../ports/history-store.ts";
import {
  HistoryEntrySchema,
  localDateText,
  pastMenus,
  readHistory,
  serializeHistoryEntry,
} from "./history.ts";
import type { HistoryEntry } from "./history.ts";

function entryOf(overrides: Partial<HistoryEntry> = {}): HistoryEntry {
  return {
    version: 1,
    date: "2026-11-16",
    request: "un bœuf bourguignon",
    sessionDay: "sun",
    menu: balancedMenu(),
    sheet: "detail",
    ...overrides,
  };
}

const row = (id: number, entry: string): HistoryRow => ({ id, entry, checked: "[]" });

describe("serializeHistoryEntry et readHistory", () => {
  it("aller-retour : l'entrée relue est celle qui a été écrite", () => {
    const entry = entryOf({ sheet: "too-long" });
    const { items, unreadable } = readHistory([row(3, serializeHistoryEntry(entry))]);
    expect(unreadable).toBe(0);
    expect(items).toEqual([{ id: 3, entry, checked: "[]" }]);
  });

  it("une ligne illisible, une version 2, un menu invalide, une date 2026-02-30 : 4 ignorées, les autres dans l'ordre", () => {
    const good = (id: number) => row(id, serializeHistoryEntry(entryOf()));
    const rows = [
      good(6),
      row(5, "{pas du json"),
      row(4, JSON.stringify({ ...entryOf(), version: 2 })),
      good(3),
      row(2, JSON.stringify({ ...entryOf(), menu: { dishes: "oups" } })),
      row(1, JSON.stringify({ ...entryOf(), date: "2026-02-30" })),
      good(0),
    ];
    const { items, unreadable } = readHistory(rows);
    expect(unreadable).toBe(4);
    expect(items.map((item) => item.id)).toEqual([6, 3, 0]);
  });

  it("ne lève jamais, même pour du texte qui n'est pas un objet", () => {
    for (const text of ["", "null", "3", "[]", '"x"', "{}"]) {
      expect(readHistory([row(1, text)])).toEqual({ items: [], unreadable: 1 });
    }
  });

  it("refuse d'écrire une entrée invalide", () => {
    expect(() => serializeHistoryEntry(entryOf({ date: "2026-13-01" }))).toThrow();
  });

  it("un menu invalide est refusé sans message anglais de Zod", () => {
    const broken = { ...entryOf(), menu: { dishes: "oups" } } as unknown as HistoryEntry;
    let messages: string[] = [];
    try {
      serializeHistoryEntry(broken);
    } catch (error) {
      messages = error instanceof z.ZodError ? error.issues.map((issue) => issue.message) : [];
    }
    expect(messages.length).toBeGreaterThan(0);
    for (const message of messages) {
      expect(message).not.toMatch(/Invalid|expected|Required|received/i);
      expect(message).toBe("Entrée d'historique illisible.");
    }
  });
});

describe("HistoryEntrySchema", () => {
  it("vraies dates seulement, années bissextiles comprises", () => {
    const dateOk = (date: string) => HistoryEntrySchema.safeParse({ ...entryOf(), date }).success;
    expect(dateOk("2024-02-29")).toBe(true);
    expect(dateOk("2026-11-16")).toBe(true);
    for (const bad of ["2025-02-29", "2026-02-30", "2026-13-01", "2026-1-1", "2026-11-00", "x"]) {
      expect(dateOk(bad), bad).toBe(false);
    }
  });

  it("les messages sont en français", () => {
    const broken: Record<string, unknown> = {
      version: { ...entryOf(), version: 2 },
      date: { ...entryOf(), date: "2026-02-30" },
      "date absente": { ...entryOf(), date: undefined },
      request: { ...entryOf(), request: 3 },
      sessionDay: { ...entryOf(), sessionDay: "tue" },
      sheet: { ...entryOf(), sheet: "pdf" },
      "pas un objet": 3,
    };
    for (const [name, value] of Object.entries(broken)) {
      const result = HistoryEntrySchema.safeParse(value);
      expect(result.success, name).toBe(false);
      if (result.success) continue;
      for (const issue of result.error.issues) {
        expect(issue.message, name).not.toMatch(/Invalid|expected|Required|received/i);
        expect(issue.message.trim(), name).not.toBe("");
      }
    }
  });
});

describe("pastMenus", () => {
  it("7 entrées : les 5 premières, avec les noms des plats", () => {
    const items = Array.from({ length: 7 }, (_, index) => ({
      entry: entryOf({ date: `2026-11-${String(20 - index).padStart(2, "0")}` }),
    }));
    const result = pastMenus(items);
    expect(result).toHaveLength(5);
    expect(result[0]).toEqual({
      date: "2026-11-20",
      dishes: balancedMenu().dishes.map((dish) => dish.name),
    });
    expect(result[4]?.date).toBe("2026-11-16");
  });
});

describe("localDateText", () => {
  it("écrit la date locale AAAA-MM-JJ", () => {
    expect(localDateText(new Date(2026, 0, 5))).toBe("2026-01-05");
    expect(localDateText(new Date(2026, 11, 31, 23, 59))).toBe("2026-12-31");
  });
});

describe("MAX_PDF_BYTES", () => {
  it("est le même qu'en Rust (history.rs)", () => {
    const source = readFileSync(
      new URL("../../../../apps/desktop/src-tauri/src/history.rs", import.meta.url),
      "utf8",
    );
    const rust = /const MAX_PDF_BYTES: usize = ([\d* ]+);/.exec(source);
    expect(rust).not.toBeNull();
    const value = rust![1]!.split("*").reduce((product, part) => product * Number(part.trim()), 1);
    expect(value).toBe(MAX_PDF_BYTES);
  });
});
