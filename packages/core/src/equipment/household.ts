import type { ApplianceId, Phase } from "../domain/menu.ts";

export interface ApplianceSpec {
  readonly id: Exclude<ApplianceId, "none">;
  // Cuissons simultanées au plus.
  readonly slots: number;
  // Appareil d'appoint : un seul par session au plus.
  readonly extra: boolean;
  // Usages, en français, pour le prompt.
  readonly uses: string;
}
export type Equipment = readonly ApplianceSpec[];

export const APPLIANCE_LABELS: Readonly<Record<ApplianceId, string>> = Object.freeze({
  none: "à la main",
  oven: "four",
  induction: "plaque induction",
  thermomix: "Thermomix TM5",
  kenwood: "Kenwood Cooking Chef",
  cookeo: "Cookeo",
  steamer: "cuiseur vapeur multi-étages",
  airfryer: "airfryer",
});

// Ce que fait une phase : à la main, attente, ou l'appareil (« tourne seul » quand il n'occupe pas la personne).
export function phaseUseText(phase: Phase): string {
  if (phase.appliance === "none") return phase.attended ? APPLIANCE_LABELS.none : "attente";
  return `${APPLIANCE_LABELS[phase.appliance]}${phase.attended ? "" : ", tourne seul"}`;
}

// Équipement du foyer (conception §3.2). Constante jusqu'au lot 5, qui le mettra dans les réglages.
const HOUSEHOLD_SPECS: ApplianceSpec[] = [
  { id: "oven", slots: 2, extra: false, uses: "2 plats en même temps, chaleur tournante" },
  { id: "induction", slots: 4, extra: false, uses: "4 feux" },
  { id: "thermomix", slots: 1, extra: false, uses: "cuisson, mixage" },
  { id: "kenwood", slots: 1, extra: false, uses: "mijotage, sauces ; tranche et râpe" },
  { id: "cookeo", slots: 1, extra: true, uses: "cuisson sous pression" },
  { id: "steamer", slots: 1, extra: true, uses: "cuisson vapeur sur plusieurs étages" },
  { id: "airfryer", slots: 1, extra: true, uses: "petit modèle, petites quantités" },
];
export const HOUSEHOLD_EQUIPMENT: Equipment = Object.freeze(
  HOUSEHOLD_SPECS.map((spec) => Object.freeze(spec)),
);

export const UTENSILS_FR = ["casseroles", "poêle en inox", "mixeur plongeant"] as const;

function describeSpecs(specs: Equipment): string {
  return specs
    .map((spec) => `${APPLIANCE_LABELS[spec.id]} ${spec.slots} (${spec.uses})`)
    .join(", ");
}

// Quel appareil pour quelle cuisson : des consignes données à l'IA, sans contrôle de code ni essai payé. Générées
// depuis l'équipement : seuls les appareils présents sont cités.
export function applianceChoiceLines(equipment: Equipment): string[] {
  const has = (id: ApplianceSpec["id"]): boolean => equipment.some((spec) => spec.id === id);
  const lines: string[] = [];
  const pot = has("induction") ? "une casserole sur la plaque, puis le mixeur plongeant" : "";
  if (has("thermomix")) {
    lines.push(
      `Soupe ou velouté : au Thermomix, qui cuit puis mixe dans le même bol, si le volume tient dans le bol et s'il est libre à ce moment${pot === "" ? "" : ` ; sinon ${pot}`}. Le mixage t'occupe (attended true).`,
      "Ne mixe pas à la main ce que le Thermomix vient de cuire.",
    );
  } else if (pot !== "") {
    lines.push(`Soupe ou velouté : ${pot}.`);
  }
  const stew = [
    ...(has("induction") ? ["cocotte sur la plaque"] : []),
    ...(has("kenwood") ? ["Kenwood (mijotage, sauces)"] : []),
  ];
  if (stew.length > 0) {
    lines.push(`Mijoté ou plat en sauce qu'il faut remuer : ${stew.join(", ou ")}.`);
  }
  if (has("oven")) lines.push("Cuisson longue sans surveillance : four.");
  if (has("cookeo")) {
    lines.push(
      "Cookeo comme appareil d'appoint, s'il fait gagner du temps sur une légumineuse ou une viande.",
    );
  }
  return lines;
}

// Lignes de capacité du prompt, générées depuis la constante pour que le prompt et les contrôles ne divergent pas.
// Le détail de la session les reprend seules : sa consigne de durée n'est pas celle de la composition.
export function equipmentCapacityLines(equipment: Equipment): string[] {
  return [
    `Équipement toujours disponible, avec le nombre de cuissons en même temps au plus : ${describeSpecs(equipment.filter((spec) => !spec.extra))}. Ustensiles : ${UTENSILS_FR.join(", ")}.`,
    `Appareils d'appoint, un seul par session au plus, et seulement s'il fait gagner du temps, avec le nombre de cuissons en même temps au plus : ${describeSpecs(equipment.filter((spec) => spec.extra))}. Une session sans appareil d'appoint est normale : la place en cuisine est limitée.`,
    "Ces nombres sont des maximums, pas un objectif.",
    "La session est faite par une seule personne, qui ne fait qu'une tâche à la main à la fois ; pendant qu'un appareil tourne seul, elle peut faire autre chose.",
    ...applianceChoiceLines(equipment),
  ];
}

// Lignes du prompt système de la composition : les capacités, puis la consigne de durée.
export function equipmentPromptLines(equipment: Equipment): string[] {
  return [
    ...equipmentCapacityLines(equipment),
    "Le code calcule la durée de la session à partir des phases. Vise 2 h à 2 h 30 ; au-delà de 3 h, le menu est refusé. Lance la cuisson longue le plus tôt possible.",
  ];
}
