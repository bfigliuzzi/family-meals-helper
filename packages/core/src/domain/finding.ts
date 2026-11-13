export type FindingLevel = "error" | "warning";
export type RuleId =
  | "menu-shape"
  | "exclusion"
  | "season"
  | "unknown-category"
  | "invalid-reply"
  | "conservation"
  | "day-order"
  | "reheat"
  | "fish"
  | "vegetables"
  | "pulses"
  | "meat"
  | "cured-meat"
  | "same-protein"
  | "whole-starch"
  | "quantity"
  | "phases"
  | "equipment"
  | "extra-appliance"
  | "session-length";

export interface Finding {
  level: FindingLevel;
  rule: RuleId;
  dish: number | null;
  ingredient: string | null;
  message: string;
}
