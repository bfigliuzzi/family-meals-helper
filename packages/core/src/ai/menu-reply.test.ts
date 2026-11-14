import { describe, expect, it } from "vitest";
import { DetailSchema } from "../domain/detail.ts";
import { parseJsonReply, parseMenuReply } from "./menu-reply.ts";

const json = JSON.stringify({
  dishes: [
    {
      name: "Soupe",
      day: "mon",
      ingredients: [
        { name: "poireau", qty: 3, unit: "piece", form: "fresh", category: null, sameDay: false },
      ],
      phases: [
        {
          id: "a1",
          description: "Cuire la soupe",
          minutes: 30,
          appliance: "kenwood",
          attended: false,
          after: [],
        },
      ],
    },
  ],
});

describe("parseMenuReply", () => {
  it("lit un JSON valide", () => {
    const result = parseMenuReply(json);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.menu.dishes[0]?.name).toBe("Soupe");
  });
  it("lit un JSON entouré de clôtures", () => {
    expect(parseMenuReply("```json\n" + json + "\n```").ok).toBe(true);
    expect(parseMenuReply("```\n" + json + "\n```").ok).toBe(true);
  });
  it("refuse un texte qui n'est pas du JSON", () => {
    const result = parseMenuReply("Voici votre menu !");
    expect(result.ok).toBe(false);
  });
  it("refuse un JSON hors schéma avec le message de z.prettifyError", () => {
    const result = parseMenuReply(
      '{"dishes":[{"name":"X","day":"sat","ingredients":[],"phases":[]}]}',
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("day");
  });
  it("lit les phases d'un plat", () => {
    const result = parseMenuReply(json);
    if (result.ok) expect(result.menu.dishes[0]?.phases[0]?.id).toBe("a1");
    else expect.unreachable();
  });
  it("refuse un JSON sans phases en citant `phases`", () => {
    const result = parseMenuReply('{"dishes":[{"name":"X","day":"mon","ingredients":[]}]}');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("phases");
  });
});

describe("parseJsonReply", () => {
  const detail = JSON.stringify({ steps: [], evenings: [] });
  it("lit une réponse du détail, avec ou sans bloc de code", () => {
    expect(parseJsonReply(detail, DetailSchema)).toEqual({
      ok: true,
      value: { steps: [], evenings: [] },
    });
    expect(parseJsonReply(`\`\`\`json\n${detail}\n\`\`\``, DetailSchema).ok).toBe(true);
  });
  it("refuse un menu comme détail, et un texte qui n'est pas du JSON", () => {
    const wrong = parseJsonReply(json, DetailSchema);
    expect(wrong.ok).toBe(false);
    if (!wrong.ok) expect(wrong.error).toContain("format attendu");
    expect(parseJsonReply("bonjour", DetailSchema)).toEqual({
      ok: false,
      error: "La réponse n'est pas du JSON lisible.",
    });
  });
});
