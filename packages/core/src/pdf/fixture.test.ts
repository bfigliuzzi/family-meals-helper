import { describe, expect, it } from "vitest";
import { parseMenuReply } from "../ai/menu-reply.ts";
import { DetailSchema } from "../domain/detail.ts";
import { fixtureReplies } from "./fixture.ts";

describe("fixtureReplies", () => {
  it("le menu d'exemple est lisible par le schéma de composition, sans plat épinglé", () => {
    const result = parseMenuReply(fixtureReplies().menu);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.note).toBe("Menu d'exemple, sans appel à Claude.");
    expect(result.requested).toEqual([]);
    expect(result.menu.dishes).toHaveLength(5);
  });

  it("le détail d'exemple est lisible par le schéma du détail", () => {
    expect(DetailSchema.safeParse(JSON.parse(fixtureReplies().detail)).success).toBe(true);
  });
});
