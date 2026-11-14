import { describe, expect, it } from "vitest";
import { APPLIANCES } from "../domain/menu.ts";
import {
  APPLIANCE_LABELS,
  HOUSEHOLD_EQUIPMENT,
  UTENSILS_FR,
  applianceChoiceLines,
  equipmentCapacityLines,
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

describe("equipmentCapacityLines", () => {
  const capacity = equipmentCapacityLines(HOUSEHOLD_EQUIPMENT);
  const all = equipmentPromptLines(HOUSEHOLD_EQUIPMENT);
  const choices = applianceChoiceLines(HOUSEHOLD_EQUIPMENT);
  it("donne les quatre lignes de capacité puis les règles de choix, sans la consigne de durée", () => {
    expect(capacity).toHaveLength(4 + choices.length);
    expect(capacity.slice(4)).toEqual(choices);
    expect(capacity.join("\n")).not.toContain("le menu est refusé");
  });
  it("est suivie de la seule ligne de durée dans le prompt de composition", () => {
    expect(all.slice(0, capacity.length)).toEqual(capacity);
    expect(all).toHaveLength(capacity.length + 1);
    expect(all[capacity.length]).toBe(
      "Le code calcule la durée de la session à partir des phases. Vise 2 h à 2 h 30 ; au-delà de 3 h, le menu est refusé. Lance la cuisson longue le plus tôt possible.",
    );
  });
});

describe("applianceChoiceLines", () => {
  const text = applianceChoiceLines(HOUSEHOLD_EQUIPMENT).join("\n");
  it("met la soupe au Thermomix s'il tient et s'il est libre, sinon casserole et mixeur plongeant", () => {
    expect(text).toContain("Soupe ou velouté : au Thermomix, qui cuit puis mixe dans le même bol");
    expect(text).toContain("si le volume tient dans le bol et s'il est libre");
    expect(text).toContain("sinon une casserole sur la plaque, puis le mixeur plongeant");
    expect(text).toContain("Ne mixe pas à la main ce que le Thermomix vient de cuire.");
  });
  it("donne le mijoté, la cuisson longue et le Cookeo", () => {
    expect(text).toContain("cocotte sur la plaque, ou Kenwood (mijotage, sauces)");
    expect(text).toContain("Cuisson longue sans surveillance : four.");
    expect(text).toContain(
      "Cookeo comme appareil d'appoint, s'il fait gagner du temps sur une légumineuse ou une viande.",
    );
    expect(text).not.toContain("s'il est l'appareil d'appoint");
  });
  it("ne cite que les appareils présents", () => {
    const without = HOUSEHOLD_EQUIPMENT.filter(
      (spec) => spec.id !== "thermomix" && spec.id !== "cookeo" && spec.id !== "kenwood",
    );
    const lines = applianceChoiceLines(without).join("\n");
    expect(lines).not.toContain("Thermomix");
    expect(lines).not.toContain("Cookeo");
    expect(lines).not.toContain("Kenwood");
    expect(lines).toContain(
      "Soupe ou velouté : une casserole sur la plaque, puis le mixeur plongeant.",
    );
  });
});
