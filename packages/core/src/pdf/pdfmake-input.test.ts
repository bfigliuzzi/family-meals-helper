import { describe, expect, it } from "vitest";
import type { TDocumentDefinitions } from "pdfmake/interfaces.js";
import { copyDefinition, pdfmakeInput } from "./pdfmake-input.ts";

const at = new Date(2026, 10, 16, 9, 30);

describe("pdfmakeInput", () => {
  const doc: TDocumentDefinitions = {
    info: { author: "Famille" },
    content: [{ text: "Bonjour" }, { canvas: [{ type: "rect", x: 1, y: 1, w: 2, h: 2 }] }],
    footer: () => "pied",
  };

  it("rend une copie distincte de l'original, avec le titre et la date", () => {
    const result = pdfmakeInput(doc, at);
    expect(result).not.toBe(doc);
    expect(result.content).not.toBe(doc.content);
    expect(result.content).toEqual(doc.content);
    expect(result.info).toEqual({
      author: "Famille",
      title: "Fiche de batch cooking",
      creationDate: at,
    });
    expect(doc.info).toEqual({ author: "Famille" });
    expect(result.footer).toBe(doc.footer);
  });

  it("modifier la copie ne touche pas l'original", () => {
    const copy = copyDefinition(doc) as { content: { text: string }[] };
    copy.content[0]!.text = "autre";
    expect((doc.content as { text: string }[])[0]!.text).toBe("Bonjour");
  });
});
