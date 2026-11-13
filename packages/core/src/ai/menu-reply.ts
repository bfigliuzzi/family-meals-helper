import { z } from "zod";
import { MenuSchema } from "../domain/menu.ts";
import type { Menu } from "../domain/menu.ts";

export function parseMenuReply(
  text: string,
): { ok: true; menu: Menu } | { ok: false; error: string } {
  const trimmed = text.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(trimmed);
  const body = fenced?.[1] ?? trimmed;
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return { ok: false, error: "La réponse n'est pas du JSON lisible." };
  }
  const parsed = MenuSchema.safeParse(json);
  if (!parsed.success) {
    return {
      ok: false,
      error: `Le JSON ne respecte pas le format attendu :\n${z.prettifyError(parsed.error)}`,
    };
  }
  return { ok: true, menu: parsed.data };
}
