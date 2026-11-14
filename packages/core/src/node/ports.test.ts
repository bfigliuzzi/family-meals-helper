import { describe, expect, it } from "vitest";
import { onOutputError } from "./ports.ts";

function errorWithCode(code: string): NodeJS.ErrnoException {
  return Object.assign(new Error(`write ${code}`), { code });
}

describe("onOutputError", () => {
  it.each(["EPIPE", "EBADF", "EIO", "ECONNRESET"])("ne lève pas pour %s", (code) => {
    expect(() => onOutputError(errorWithCode(code))).not.toThrow();
  });
  it("ne lève pas pour une erreur sans code", () => {
    expect(() => onOutputError(new Error("inconnue"))).not.toThrow();
  });
});
