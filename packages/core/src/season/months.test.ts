import { describe, expect, it } from "vitest";
import { describeMonths, monthOf } from "./months.ts";

describe("monthOf", () => {
  it("renvoie le numéro du mois de 1 à 12", () => {
    expect(monthOf(new Date(2026, 10, 13))).toBe(11);
    expect(monthOf(new Date(2026, 0, 1))).toBe(1);
  });
});

describe("describeMonths", () => {
  it("décrit une série simple", () => {
    expect(describeMonths([5, 6, 7, 8, 9, 10])).toBe("mai à octobre");
  });
  it("décrit une série qui passe par décembre", () => {
    expect(describeMonths([1, 2, 3, 10, 11, 12])).toBe("octobre à mars");
  });
  it("décrit un trou et un mois seul", () => {
    expect(describeMonths([4, 6, 7, 8])).toBe("avril, juin à août");
    expect(describeMonths([1])).toBe("janvier");
  });
});
