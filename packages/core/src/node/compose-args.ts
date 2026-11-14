import { parseArgs } from "node:util";
import type { SessionDay } from "../domain/menu.ts";
import { SESSION_DAYS, SESSION_DAY_LABELS } from "../domain/menu.ts";
import { lightNormalize } from "../ingredients/normalize.ts";
import type { Month } from "../season/months.ts";

export interface ComposeArgs {
  request: string;
  exclusions: string[];
  month: Month | null;
  sessionDay: SessionDay;
  maxAttempts: 1 | 2 | 3;
  dryRun: boolean;
}

export type BatchArgs = ComposeArgs & { out: string | null };

// Corps commun à `compose` et à `batch` ; `--out` n'est connu que de `batch`.
function parseCommonArgs(
  argv: readonly string[],
  command: "compose" | "batch",
): { ok: true; args: ComposeArgs; out: string | null } | { ok: false; error: string } {
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
        ...(command === "batch" ? { out: { type: "string" } } : {}),
      },
    });
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
  const { values, positionals } = parsed;

  const request = positionals[0]?.trim() ?? "";
  if (request === "") {
    return {
      ok: false,
      error: `La demande est obligatoire : ${command} "<demande>" [--exclude x]${command === "batch" ? " [--out <fichier.pdf>]" : ""}`,
    };
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
    args: {
      request,
      exclusions: (values.exclude ?? [])
        .flatMap((value) => value.split(","))
        .map((term) => term.trim())
        .filter((term) => term !== ""),
      month,
      sessionDay,
      maxAttempts,
      dryRun: values["dry-run"] === true,
    },
    out: "out" in values && typeof values.out === "string" ? values.out : null,
  };
}

export function parseComposeArgs(
  argv: readonly string[],
): ({ ok: true } & ComposeArgs) | { ok: false; error: string } {
  const parsed = parseCommonArgs(argv, "compose");
  return parsed.ok ? { ok: true, ...parsed.args } : parsed;
}

// `--out` est facultatif (sans lui, le PDF va dans Téléchargements). S'il est donné, il finit par .pdf, sans tenir
// compte de la casse.
export function parseBatchArgs(
  argv: readonly string[],
): ({ ok: true } & BatchArgs) | { ok: false; error: string } {
  const parsed = parseCommonArgs(argv, "batch");
  if (!parsed.ok) return parsed;
  const { out } = parsed;
  if (out !== null && !out.toLowerCase().endsWith(".pdf")) {
    return { ok: false, error: "--out attend un nom de fichier qui finit par .pdf" };
  }
  return { ok: true, ...parsed.args, out };
}
