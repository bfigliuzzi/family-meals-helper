import { DetailSchema, MenuReplySchema } from "core";
import { describe, expect, it } from "vitest";
import { createFixtureModel } from "./fixture-model.ts";

const prompt = { system: "", user: "" };

describe("modèle d'exemple", () => {
  it("répond le détail pour DetailSchema, le menu sinon, sans usage", async () => {
    const detail = await createFixtureModel(DetailSchema).complete(prompt);
    expect(DetailSchema.safeParse(JSON.parse(detail.text)).success).toBe(true);
    const menu = await createFixtureModel(MenuReplySchema).complete(prompt);
    expect(MenuReplySchema.safeParse(JSON.parse(menu.text)).success).toBe(true);
    expect(menu.text).toContain("Menu d'exemple, sans appel à Claude.");
    expect(menu.stopReason).toBe("end_turn");
    expect(menu.usage).toEqual({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });
  });
});
