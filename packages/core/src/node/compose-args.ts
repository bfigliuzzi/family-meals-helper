import { parseArgs } from "node:util";
import type { Month } from "../season/months.ts";

export function parseComposeArgs(argv: readonly string[]):
  | {
      ok: true;
      request: string;
      exclusions: string[];
      month: Month | null;
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
    maxAttempts,
    dryRun: values["dry-run"] === true,
  };
}
