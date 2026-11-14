import { z } from "zod";
import { MenuSchema } from "../domain/menu.ts";
import type { Menu } from "../domain/menu.ts";

// Lit une réponse JSON de l'IA, avec ou sans bloc de code, et la valide avec le schéma donné.
export function parseJsonReply<T>(
  text: string,
  schema: z.ZodType<T>,
): { ok: true; value: T } | { ok: false; error: string } {
  const trimmed = text.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(trimmed);
  const body = fenced?.[1] ?? trimmed;
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return { ok: false, error: "La réponse n'est pas du JSON lisible." };
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return {
      ok: false,
      error: `Le JSON ne respecte pas le format attendu :\n${z.prettifyError(parsed.error)}`,
    };
  }
  return { ok: true, value: parsed.data };
}

export function parseMenuReply(
  text: string,
): { ok: true; menu: Menu } | { ok: false; error: string } {
  const parsed = parseJsonReply(text, MenuSchema);
  return parsed.ok ? { ok: true, menu: parsed.value } : parsed;
}
