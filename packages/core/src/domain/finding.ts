export type FindingLevel = "error" | "warning";
export type RuleId = "menu-shape" | "exclusion" | "season" | "unknown-category" | "invalid-reply";

export interface Finding {
  level: FindingLevel;
  rule: RuleId;
  dish: number | null;
  ingredient: string | null;
  message: string;
}
