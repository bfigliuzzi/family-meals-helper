import { parseArgs } from "node:util";
import type { SessionDay } from "../domain/menu.ts";
import { SESSION_DAYS, SESSION_DAY_LABELS } from "../domain/menu.ts";
import { lightNormalize } from "../ingredients/normalize.ts";
import type { Month } from "../season/months.ts";

export function parseComposeArgs(argv: readonly string[]):
  | {
      ok: true;
      request: string;
      exclusions: string[];
      month: Month | null;
      sessionDay: SessionDay;
      maxAttempts: 1 | 2 | 3;
      dryRun: boolean;
    }
  | { ok: false; error: string } {
  let parsed;
  try {
    parsed = parseArgs({
      args: [...argv],
      allowPositionals: true,
      options: {
        exclude: { type: "string", multiple: true },
        month: { type: "string" },
        "session-day": { type: "string" },
        "max-attempts": { type: "string" },
        "dry-run": { type: "boolean" },
      },
    });
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
  const { values, positionals } = parsed;

  const request = positionals[0]?.trim() ?? "";
  if (request === "") {
    return { ok: false, error: 'La demande est obligatoire : compose "<demande>" [--exclude x]' };
  }
  if (positionals.length > 1) {
    return { ok: false, error: "Une seule demande attendue : la mettre entre guillemets." };
  }

  let month: Month | null = null;
  if (values.month !== undefined) {
    const value = Number(values.month);
    if (!/^\d+$/.test(values.month) || value < 1 || value > 12) {
      return { ok: false, error: "--month attend un nombre de 1 à 12" };
    }
    month = value as Month;
  }

  let sessionDay: SessionDay = "sun";
  if (values["session-day"] !== undefined) {
    const wanted = lightNormalize(values["session-day"]);
    const found = SESSION_DAYS.find((day) => lightNormalize(SESSION_DAY_LABELS[day]) === wanted);
    if (found === undefined) {
      return { ok: false, error: "--session-day attend vendredi, samedi, dimanche ou lundi" };
    }
    sessionDay = found;
  }

  let maxAttempts: 1 | 2 | 3 = 3;
  if (values["max-attempts"] !== undefined) {
    const value = Number(values["max-attempts"]);
    if (!/^\d+$/.test(values["max-attempts"]) || value < 1 || value > 3) {
      return { ok: false, error: "--max-attempts attend un nombre de 1 à 3" };
    }
    maxAttempts = value as 1 | 2 | 3;
  }

  return {
    ok: true,
    request,
    exclusions: (values.exclude ?? [])
      .flatMap((value) => value.split(","))
      .map((term) => term.trim())
      .filter((term) => term !== ""),
    month,
    sessionDay,
    maxAttempts,
    dryRun: values["dry-run"] === true,
  };
}
