import type { IngredientRef } from "../domain/ingredient.ts";
import { normalizeName } from "../ingredients/normalize.ts";
import type { Month, SeasonRow } from "./months.ts";

export interface AdemeProduct {
  name: string;
  slug: string;
  months: number[];
}

function isMonthNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 12;
}

// Une réponse dont le format a changé doit faire échouer l'import, pas créer des lacunes.
export function parseAdemeResponse(json: unknown): AdemeProduct[] {
  const data: unknown =
    typeof json === "object" && json !== null && "data" in json ? json.data : undefined;
  if (!Array.isArray(data)) {
    throw new Error("Réponse ADEME inattendue : « data » n'est pas un tableau.");
  }
  const items: unknown[] = data;
  const products: AdemeProduct[] = [];
  for (const [position, item] of items.entries()) {
    const record: Record<string, unknown> =
      typeof item === "object" && item !== null ? (item as Record<string, unknown>) : {};
    const { name, slug, months } = record;
    const label = typeof name === "string" ? name : `produit n° ${position + 1}`;
    if (typeof name !== "string" || typeof slug !== "string") {
      throw new Error(`Réponse ADEME inattendue : « ${label} » n'a pas de nom ou de slug.`);
    }
    if (!Array.isArray(months) || months.length === 0 || !months.every(isMonthNumber)) {
      throw new Error(`Réponse ADEME inattendue : « ${label} » n'a pas de mois valides.`);
    }
    products.push({ name, slug, months });
  }
  return products;
}

// Tous les fruits et légumes, quelle que soit leur forme par défaut : le contrôle porte sur la forme reçue.
function isProduce(ref: IngredientRef): boolean {
  return ref.category === "vegetable" || ref.category === "fruit";
}

function sortedMonths(months: readonly number[]): Month[] {
  return [...new Set(months)].sort((a, b) => a - b) as Month[];
}

export function buildSeasonTable(input: {
  products: readonly AdemeProduct[];
  refs: readonly IngredientRef[];
  aliases: Readonly<Record<string, string>>;
  manual: Readonly<Record<string, SeasonRow>>;
}): { table: Record<string, SeasonRow>; gaps: string[] } {
  const { products, refs, aliases, manual } = input;
  const refNames = new Set(refs.map((ref) => ref.name));
  const bySlug = new Map(products.map((product) => [product.slug, product]));
  const byName = new Map(products.map((product) => [normalizeName(product.name), product]));

  for (const name of Object.keys(aliases)) {
    if (!refNames.has(name)) throw new Error(`Alias « ${name} » : absent du référentiel.`);
  }
  for (const name of Object.keys(manual)) {
    if (!refNames.has(name))
      throw new Error(`Ligne manuelle « ${name} » : absente du référentiel.`);
  }

  const table: Record<string, SeasonRow> = {};
  const gaps: string[] = [];
  for (const ref of refs.filter(isProduce)) {
    const slug = aliases[ref.name];
    let product: AdemeProduct | undefined;
    if (slug !== undefined) {
      product = bySlug.get(slug);
      if (product === undefined) {
        throw new Error(
          `Alias « ${ref.name} » : le slug « ${slug} » est absent de la réponse ADEME.`,
        );
      }
    } else {
      product = byName.get(normalizeName(ref.name));
    }
    // La table est l'union des mois ADEME et des mois du calendrier mangerbouger (lignes `manual`) :
    // une ligne manuelle complète l'ADEME, elle ne lui retire aucun mois.
    const fromManual = manual[ref.name];
    if (fromManual !== undefined && product !== undefined) {
      table[ref.name] = {
        months: sortedMonths([...product.months, ...fromManual.months]),
        source: `ademe + ${fromManual.source}`,
      };
    } else if (fromManual !== undefined) {
      table[ref.name] = { months: sortedMonths(fromManual.months), source: fromManual.source };
    } else if (product !== undefined) {
      table[ref.name] = { months: sortedMonths(product.months), source: "ademe" };
    } else {
      gaps.push(ref.name);
    }
  }
  return { table, gaps };
}

function byCodeUnit(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

// Aucune date dans le texte : deux générations successives se comparent à l'identique.
export function renderSeasonTableModule(table: Record<string, SeasonRow>): string {
  const lines = Object.keys(table)
    .sort(byCodeUnit)
    .map((name) => {
      const row = table[name]!;
      return `  ${JSON.stringify(name)}: { months: [${row.months.join(", ")}], source: ${JSON.stringify(row.source)} },`;
    });
  return [
    "// Fichier généré par `pnpm --filter core season:import`, ne pas modifier à la main.",
    "// Source et date : `docs/research/saison-fruits-legumes.md`.",
    'import type { SeasonRow } from "./months.ts";',
    "",
    "export const SEASON_TABLE: Readonly<Record<string, SeasonRow>> = {",
    ...lines,
    "};",
    "",
  ].join("\n");
}
