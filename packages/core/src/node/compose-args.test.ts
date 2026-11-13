import { describe, expect, it } from "vitest";
import { parseComposeArgs } from "./compose-args.ts";

describe("parseComposeArgs", () => {
  it("lit la demande et les valeurs par défaut", () => {
    expect(parseComposeArgs(["un bœuf bourguignon"])).toEqual({
      ok: true,
      request: "un bœuf bourguignon",
      exclusions: [],
      month: null,
      sessionDay: "sun",
      maxAttempts: 3,
      dryRun: false,
    });
  });
  it("lit --exclude répétable, --month, --max-attempts et --dry-run", () => {
    expect(
      parseComposeArgs([
        "x",
        "--exclude",
        "courgette",
        "--exclude",
        "poulet",
        "--month",
        "11",
        "--max-attempts",
        "2",
        "--dry-run",
      ]),
    ).toEqual({
      ok: true,
      request: "x",
      exclusions: ["courgette", "poulet"],
      month: 11,
      sessionDay: "sun",
      maxAttempts: 2,
      dryRun: true,
    });
  });
  it("découpe --exclude sur la virgule", () => {
    const result = parseComposeArgs(["x", "--exclude", "courgette, poulet", "--exclude", "porc"]);
    expect(result).toMatchObject({ ok: true, exclusions: ["courgette", "poulet", "porc"] });
  });
  it("lit --session-day sans tenir compte de la casse ni des accents", () => {
    expect(parseComposeArgs(["x", "--session-day", "samedi"])).toMatchObject({ sessionDay: "sat" });
    expect(parseComposeArgs(["x", "--session-day", "Dimanche"])).toMatchObject({
      sessionDay: "sun",
    });
    expect(parseComposeArgs(["x", "--session-day", "vendredi"])).toMatchObject({
      sessionDay: "fri",
    });
    expect(parseComposeArgs(["x", "--session-day", "lundi"])).toMatchObject({ sessionDay: "mon" });
  });
  it("refuse un jour de session hors vendredi, samedi, dimanche, lundi", () => {
    expect(parseComposeArgs(["x", "--session-day", "mardi"])).toEqual({
      ok: false,
      error: "--session-day attend vendredi, samedi, dimanche ou lundi",
    });
  });
  it("exige une demande", () => {
    const result = parseComposeArgs(["--dry-run"]);
    expect(result.ok).toBe(false);
  });
  it("refuse plusieurs demandes", () => {
    expect(parseComposeArgs(["un", "deux"]).ok).toBe(false);
  });
  it("refuse un mois hors de 1 à 12", () => {
    for (const month of ["0", "13", "abc", "1.5"]) {
      const result = parseComposeArgs(["x", "--month", month]);
      expect(result).toEqual({ ok: false, error: "--month attend un nombre de 1 à 12" });
    }
  });
  it("refuse un nombre d'essais hors de 1 à 3", () => {
    for (const value of ["0", "4", "x"]) {
      expect(parseComposeArgs(["x", "--max-attempts", value]).ok).toBe(false);
    }
  });
  it("refuse une option inconnue", () => {
    expect(parseComposeArgs(["x", "--model", "m"]).ok).toBe(false);
  });
});
