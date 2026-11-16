import { buildSheetDocument } from "core";
import { fixtureSheetInput } from "core/fixtures";
import { describe, expect, it } from "vitest";
import { renderSheetPdf } from "./pdf-renderer.ts";

const at = new Date(2026, 10, 16, 9, 30);
const asText = (bytes: Uint8Array): string => Buffer.from(bytes).toString("latin1");

describe("renderSheetPdf", () => {
  it("rend la fiche d'exemple : %PDF-, plus de 20 Ko, Roboto embarquée", async () => {
    const bytes = await renderSheetPdf(buildSheetDocument(fixtureSheetInput("detail")), at);
    expect(asText(bytes).startsWith("%PDF-")).toBe(true);
    expect(bytes.length).toBeGreaterThan(20_000);
    expect(asText(bytes)).toContain("Roboto");
  });

  it("deux rendus de suite réussissent, avec la même définition", async () => {
    const doc = buildSheetDocument(fixtureSheetInput("phases"));
    const first = await renderSheetPdf(doc, at);
    const second = await renderSheetPdf(doc, at);
    expect(asText(first).startsWith("%PDF-")).toBe(true);
    expect(asText(second).startsWith("%PDF-")).toBe(true);
  });
});
