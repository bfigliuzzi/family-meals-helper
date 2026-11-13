import type { ApplianceId } from "../domain/menu.ts";

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

// Lignes du prompt système, générées depuis la constante pour que le prompt et les contrôles ne divergent pas.
export function equipmentPromptLines(equipment: Equipment): string[] {
  return [
    `Équipement toujours disponible, avec le nombre de cuissons en même temps au plus : ${describeSpecs(equipment.filter((spec) => !spec.extra))}. Ustensiles : ${UTENSILS_FR.join(", ")}.`,
    `Appareils d'appoint, un seul par session au plus, et seulement s'il fait gagner du temps, avec le nombre de cuissons en même temps au plus : ${describeSpecs(equipment.filter((spec) => spec.extra))}. Une session sans appareil d'appoint est normale : la place en cuisine est limitée.`,
    "Ces nombres sont des maximums, pas un objectif.",
    "La session est faite par une seule personne, qui ne fait qu'une tâche à la main à la fois ; pendant qu'un appareil tourne seul, elle peut faire autre chose.",
    "Le code calcule la durée de la session à partir des phases. Vise 2 h à 2 h 30 ; au-delà de 3 h, le menu est refusé. Lance la cuisson longue le plus tôt possible.",
  ];
}
