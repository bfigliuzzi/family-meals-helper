import { z } from "zod";
import type { PastMenu } from "../ai/compose.ts";
import { MenuSchema, SESSION_DAYS } from "../domain/menu.ts";
import type { HistoryRow } from "../ports/history-store.ts";

const DATE_ERROR = "La date de l'entrée est illisible.";

// Une vraie date `AAAA-MM-JJ` : le 30 février et le 13e mois sont refusés (le Rust fait le même contrôle).
function isRealDate(text: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (match === null) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  // `setFullYear` : `new Date(a, …)` lirait une année de 0 à 99 comme 1900 à 1999.
  const date = new Date(2000, 0, 1);
  date.setFullYear(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

// Document de `history.entry`, validé à la lecture. `version` change à toute modification de forme.
export const HistoryEntrySchema = z.object(
  {
    version: z.literal(1, { error: "La version de l'entrée est inconnue." }),
    date: z.string({ error: DATE_ERROR }).refine(isRealDate, { error: DATE_ERROR }),
    request: z.string({ error: "La demande de l'entrée est illisible." }),
    sessionDay: z.enum(SESSION_DAYS, { error: "Le jour de session de l'entrée est inconnu." }),
    menu: MenuSchema,
    sheet: z.enum(["detail", "too-long", "fallback"], {
      error: "Le type de fiche de l'entrée est inconnu.",
    }),
  },
  { error: "L'entrée de l'historique est illisible." },
);
export type HistoryEntry = z.infer<typeof HistoryEntrySchema>;

// Le message de tout refus à l'écriture, y compris ceux de `MenuSchema` (qu'on ne touche pas : ses messages repartent
// vers l'IA). `readHistory` n'a pas cette option : il jette le diagnostic et ne garde que le compte des refus.
const PARSE_OPTIONS = { error: () => "Entrée d'historique illisible." };

export interface HistoryItem {
  id: number;
  entry: HistoryEntry;
  checked: string;
}

// `AAAA-MM-JJ` en heure locale ; la date arrive en argument (port `Clock`).
export function localDateText(at: Date): string {
  const pad = (value: number, size: number): string => String(value).padStart(size, "0");
  return `${pad(at.getFullYear(), 4)}-${pad(at.getMonth() + 1, 2)}-${pad(at.getDate(), 2)}`;
}

export function serializeHistoryEntry(entry: HistoryEntry): string {
  return JSON.stringify(HistoryEntrySchema.parse(entry, PARSE_OPTIONS));
}

// Ne lève jamais : une ligne illisible (JSON cassé, version inconnue, menu ou date invalides) est comptée et
// ignorée, les autres gardent leur ordre.
export function readHistory(rows: readonly HistoryRow[]): {
  items: HistoryItem[];
  unreadable: number;
} {
  const items: HistoryItem[] = [];
  let unreadable = 0;
  for (const row of rows) {
    try {
      const parsed = HistoryEntrySchema.safeParse(JSON.parse(row.entry));
      if (parsed.success) items.push({ id: row.id, entry: parsed.data, checked: row.checked });
      else unreadable += 1;
    } catch {
      unreadable += 1;
    }
  }
  return { items, unreadable };
}

// Les plats des 5 derniers menus, donnés à l'IA (« ne les reprends pas »). `items` va du plus récent au plus ancien.
export function pastMenus(items: readonly { entry: HistoryEntry }[]): PastMenu[] {
  return items.slice(0, 5).map(({ entry }) => ({
    date: entry.date,
    dishes: entry.menu.dishes.map((dish) => dish.name),
  }));
}
