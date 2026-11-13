export const CORE_CHECK_MESSAGE = "Le paquet core est bien relié à l'application.";

export * from "./domain/finding.ts";
export * from "./domain/ingredient.ts";
export * from "./domain/menu.ts";
export type * from "./ports/clock.ts";
export type * from "./ports/http-client.ts";
export type * from "./ports/secret-store.ts";
export * from "./ingredients/index-lookup.ts";
export * from "./ingredients/normalize.ts";
export * from "./ingredients/referential.ts";
export * from "./season/build-table.ts";
export * from "./season/check-season.ts";
export * from "./season/months.ts";
export * from "./season/season-table.ts";
export * from "./rules/check-exclusions.ts";
export * from "./rules/check-menu.ts";
export type * from "./rules/context.ts";
export * from "./rules/menu-shape.ts";
