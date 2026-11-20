import { describe, expect, it } from "vitest";
import { describeParseError, parseBatchArgs, parseComposeArgs } from "./compose-args.ts";

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
      budget: null,
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
      budget: null,
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

const BUDGET_ERROR =
  "--budget attend un montant en euros supérieur à 0 et au plus 10000, par exemple 60 ou 45,50";

describe("--budget (compose et batch)", () => {
  const parsers = { compose: parseComposeArgs, batch: parseBatchArgs };
  for (const [command, parse] of Object.entries(parsers)) {
    it(`${command} : lit 60 et 45,50, absent vaut null`, () => {
      expect(parse(["x", "--budget", "60"])).toMatchObject({ ok: true, budget: 60 });
      expect(parse(["x", "--budget", "45,50"])).toMatchObject({ ok: true, budget: 45.5 });
      expect(parse(["x", "--budget", "45.5"])).toMatchObject({ ok: true, budget: 45.5 });
      expect(parse(["x"])).toMatchObject({ ok: true, budget: null });
    });
    it(`${command} : refuse 0, x, une valeur vide et un montant hors bornes, avec le message exact`, () => {
      for (const value of ["0", "x", "", "10000,01", "-3", "1,234"]) {
        expect(parse(["x", `--budget=${value}`])).toEqual({ ok: false, error: BUDGET_ERROR });
      }
    });
  }
});

describe("erreurs d'arguments en français", () => {
  const parsers = { compose: parseComposeArgs, batch: parseBatchArgs };
  for (const [command, parse] of Object.entries(parsers)) {
    it(`${command} : une option sans valeur et une option inconnue`, () => {
      expect(parse(["x", "--budget"])).toEqual({
        ok: false,
        error: "Une option attend une valeur : --budget",
      });
      expect(parse(["x", "--inconnue"])).toEqual({
        ok: false,
        error: "Option inconnue : --inconnue",
      });
    });
    it(`${command} : un drapeau avec une valeur, une valeur qui commence par un tiret`, () => {
      expect(parse(["x", "--dry-run=yes"])).toEqual({
        ok: false,
        error: "L'option --dry-run ne prend pas de valeur.",
      });
      expect(parse(["x", "--budget", "-3"])).toEqual({
        ok: false,
        error: "Valeur de --budget ambiguë : écrire --budget=<valeur>.",
      });
    });
  }
  it("--budget=-3 donne le message du montant refusé", () => {
    expect(parseComposeArgs(["x", "--budget=-3"])).toEqual({ ok: false, error: BUDGET_ERROR });
  });
  it("describeParseError : phrase d'un argument sans option, au choix de l'appelant", () => {
    const error = Object.assign(new Error("Unexpected argument 'x'"), {
      code: "ERR_PARSE_ARGS_UNEXPECTED_POSITIONAL",
    });
    expect(describeParseError(error, "Ce script ne prend aucun argument sans option.")).toBe(
      "Ce script ne prend aucun argument sans option.",
    );
    expect(describeParseError(error)).toBe(
      "Une seule demande attendue : la mettre entre guillemets.",
    );
    expect(describeParseError(new Error("autre"))).toBe("Arguments illisibles.");
  });
});

describe("parseComposeArgs : --out", () => {
  it("refuse --out, réservé à batch", () => {
    const result = parseComposeArgs(["x", "--out", "menu.pdf"]);
    expect(result.ok).toBe(false);
  });
});

describe("parseBatchArgs", () => {
  it("lit la demande, --out et les valeurs par défaut", () => {
    expect(parseBatchArgs(["un bœuf bourguignon", "--out", "menu.pdf"])).toEqual({
      ok: true,
      request: "un bœuf bourguignon",
      exclusions: [],
      month: null,
      sessionDay: "sun",
      maxAttempts: 3,
      dryRun: false,
      budget: null,
      out: "menu.pdf",
    });
  });
  it("lit les mêmes options que compose", () => {
    expect(
      parseBatchArgs([
        "x",
        "--out",
        "/tmp/MENU.PDF",
        "--exclude",
        "courgette",
        "--month",
        "11",
        "--session-day",
        "samedi",
        "--max-attempts",
        "2",
      ]),
    ).toMatchObject({
      ok: true,
      exclusions: ["courgette"],
      month: 11,
      sessionDay: "sat",
      maxAttempts: 2,
      out: "/tmp/MENU.PDF",
    });
  });
  it("accepte l'absence de --out, avec ou sans --dry-run : le PDF ira dans Téléchargements", () => {
    expect(parseBatchArgs(["x"])).toMatchObject({ ok: true, dryRun: false, out: null });
    expect(parseBatchArgs(["x", "--dry-run"])).toMatchObject({
      ok: true,
      dryRun: true,
      out: null,
    });
  });
  it("exige une extension .pdf, sans tenir compte de la casse", () => {
    expect(parseBatchArgs(["x", "--out", "menu.txt"])).toEqual({
      ok: false,
      error: "--out attend un nom de fichier qui finit par .pdf",
    });
    expect(parseBatchArgs(["x", "--out", "menu.PDF"]).ok).toBe(true);
  });
  it("garde les erreurs de compose : demande absente, --max-attempts hors bornes", () => {
    expect(parseBatchArgs(["--out", "a.pdf"])).toEqual({
      ok: false,
      error:
        'La demande est obligatoire : batch "<demande>" [--exclude x] [--budget 60] [--out <fichier.pdf>]',
    });
    expect(parseBatchArgs(["x", "--out", "a.pdf", "--max-attempts", "4"])).toEqual({
      ok: false,
      error: "--max-attempts attend un nombre de 1 à 3",
    });
  });
});
