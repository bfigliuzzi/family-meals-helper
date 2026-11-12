import { describe, expect, it } from "vitest";
import { CORE_CHECK_MESSAGE } from "./index.ts";

describe("core", () => {
  it("expose le message de contrôle", () => {
    expect(CORE_CHECK_MESSAGE).toBe("Le paquet core est bien relié à l'application.");
  });
});
