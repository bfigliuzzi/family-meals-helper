import { describe, expect, it } from "vitest";
import { parseMenuReply } from "./menu-reply.ts";

const json = JSON.stringify({
  dishes: [
    {
      name: "Soupe",
      day: "mon",
      ingredients: [
        { name: "poireau", qty: 3, unit: "piece", form: "fresh", category: null, sameDay: false },
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
    const result = parseMenuReply('{"dishes":[{"name":"X","day":"sat","ingredients":[]}]}');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("day");
  });
});
