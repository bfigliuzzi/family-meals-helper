import { describe, expect, it } from "vitest";
import { APPLIANCES } from "../domain/menu.ts";
import {
  APPLIANCE_LABELS,
  HOUSEHOLD_EQUIPMENT,
  UTENSILS_FR,
  equipmentPromptLines,
} from "./household.ts";

describe("HOUSEHOLD_EQUIPMENT", () => {
  it("donne les capacités du foyer", () => {
    const slots = Object.fromEntries(HOUSEHOLD_EQUIPMENT.map((spec) => [spec.id, spec.slots]));
    expect(slots).toEqual({
      oven: 2,
      induction: 4,
      thermomix: 1,
      kenwood: 1,
      cookeo: 1,
      steamer: 1,
      airfryer: 1,
    });
  });
  it("compte trois appareils d'appoint : Cookeo, cuiseur vapeur, airfryer", () => {
    expect(
      HOUSEHOLD_EQUIPMENT.filter((spec) => spec.extra)
        .map((spec) => spec.id)
        .sort(),
    ).toEqual(["airfryer", "cookeo", "steamer"]);
  });
  it("a une fiche, une seule, pour chaque appareil sauf `none`", () => {
    for (const id of APPLIANCES.filter((appliance) => appliance !== "none")) {
      expect(HOUSEHOLD_EQUIPMENT.filter((spec) => spec.id === id)).toHaveLength(1);
    }
    expect(HOUSEHOLD_EQUIPMENT).toHaveLength(APPLIANCES.length - 1);
  });
});

describe("équipement gelé et cohérent", () => {
  it("ne peut pas être modifié", () => {
    expect(Object.isFrozen(HOUSEHOLD_EQUIPMENT)).toBe(true);
    for (const spec of HOUSEHOLD_EQUIPMENT) expect(Object.isFrozen(spec)).toBe(true);
    expect(Object.isFrozen(APPLIANCE_LABELS)).toBe(true);
  });
  it("a des capacités entières d'au moins 1 et des id uniques", () => {
    for (const spec of HOUSEHOLD_EQUIPMENT) {
      expect(Number.isInteger(spec.slots)).toBe(true);
      expect(spec.slots).toBeGreaterThanOrEqual(1);
    }
    const ids = HOUSEHOLD_EQUIPMENT.map((spec) => spec.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("equipmentPromptLines", () => {
  const text = equipmentPromptLines(HOUSEHOLD_EQUIPMENT).join("\n");
  it("nomme chaque appareil avec son nombre de cuissons en même temps", () => {
    for (const spec of HOUSEHOLD_EQUIPMENT) {
      expect(text).toContain(`${APPLIANCE_LABELS[spec.id]} ${spec.slots} (${spec.uses})`);
    }
    expect(text).toContain("Cookeo 1");
  });
  it("liste les ustensiles", () => {
    for (const utensil of UTENSILS_FR) expect(text).toContain(utensil);
  });
  it("dit que les nombres sont des maximums et que l'appoint est facultatif", () => {
    expect(text).toContain("un seul par session au plus");
    expect(text).toContain("Une session sans appareil d'appoint est normale");
    expect(text).toContain("maximums, pas un objectif");
  });
  it("ne commence aucune ligne par « Le soir même » et ne dit pas « Session de cuisine »", () => {
    for (const line of equipmentPromptLines(HOUSEHOLD_EQUIPMENT)) {
      expect(line.startsWith("Le soir même")).toBe(false);
    }
    expect(text).not.toContain("Session de cuisine");
  });
});
