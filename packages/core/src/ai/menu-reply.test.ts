import { describe, expect, it } from "vitest";
import { DetailSchema } from "../domain/detail.ts";
import { MenuReplySchema, parseJsonReply, parseMenuReply } from "./menu-reply.ts";

const json = JSON.stringify({
  note: "",
  dishes: [
    {
      name: "Soupe",
      day: "mon",
      requested: false,
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
      '{"note":"","dishes":[{"name":"X","day":"sat","requested":false,"ingredients":[],"phases":[]}]}',
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
    const result = parseMenuReply(
      '{"note":"","dishes":[{"name":"X","day":"mon","requested":false,"ingredients":[]}]}',
    );
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

describe("parseMenuReply : requested et note", () => {
  const twoDishes = (note: string): string => {
    const reply = JSON.parse(json) as { note: string; dishes: Record<string, unknown>[] };
    const [soup] = reply.dishes;
    return JSON.stringify({
      note,
      dishes: [
        { ...soup, requested: false },
        { ...soup, name: "Bœuf bourguignon", day: "tue", requested: true },
      ],
    });
  };

  it("lit `requested` et `note`, et rend un `Menu` sans eux", () => {
    const result = parseMenuReply(twoDishes("J'ai ajouté le bœuf."));
    if (!result.ok) throw new Error(result.error);
    expect(result.note).toBe("J'ai ajouté le bœuf.");
    expect(result.requested).toEqual(["Bœuf bourguignon"]);
    expect(result.menu.dishes).toHaveLength(2);
    for (const dish of result.menu.dishes) {
      expect(Object.keys(dish).sort()).toEqual(["day", "ingredients", "name", "phases"]);
    }
  });

  it("une réponse sans `requested` ou sans `note` est illisible", () => {
    const parsed = JSON.parse(json) as { note?: string; dishes: Record<string, unknown>[] };
    const withoutNote = { dishes: parsed.dishes };
    const withoutRequested = {
      note: "",
      dishes: parsed.dishes.map((dish) =>
        Object.fromEntries(Object.entries(dish).filter(([key]) => key !== "requested")),
      ),
    };
    for (const reply of [withoutNote, withoutRequested]) {
      expect(MenuReplySchema.safeParse(reply).success).toBe(false);
      expect(parseMenuReply(JSON.stringify(reply)).ok).toBe(false);
    }
  });
});

describe("parseMenuReply : messages en français", () => {
  const parsed = JSON.parse(json) as { note?: unknown; dishes: Record<string, unknown>[] };
  const errorOf = (reply: unknown): string => {
    const result = parseMenuReply(JSON.stringify(reply));
    if (result.ok) throw new Error("réponse acceptée");
    return result.error;
  };

  it("dit en français que `note` manque ou n'est pas un texte", () => {
    for (const note of [undefined, 3]) {
      const error = errorOf({ ...parsed, note });
      expect(error).toContain("`note` est absente ou n'est pas un texte");
      expect(error).not.toMatch(/Invalid|expected|Required|received/);
    }
  });

  it("dit en français que `requested` manque ou n'est pas un booléen", () => {
    const withValue = (requested: unknown) => ({
      ...parsed,
      dishes: parsed.dishes.map((dish) => ({ ...dish, requested })),
    });
    for (const requested of [undefined, "oui"]) {
      const error = errorOf(withValue(requested));
      expect(error).toContain("`requested` est absent ou n'est pas un booléen");
      expect(error).not.toMatch(/Invalid|expected|Required|received/);
    }
  });
});
