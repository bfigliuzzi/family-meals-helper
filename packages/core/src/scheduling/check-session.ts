import { isBlankWhenPrinted } from "../ai/printable.ts";
import type { Finding } from "../domain/finding.ts";
import type { Dish, Menu } from "../domain/menu.ts";
import { APPLIANCE_LABELS } from "../equipment/household.ts";
import type { Equipment } from "../equipment/household.ts";
import {
  MAX_PHASE_MINUTES,
  MAX_SESSION_MINUTES,
  MAX_SESSION_PHASES,
  durationText,
  planSession,
} from "./plan-session.ts";
import type { SessionPhase, SessionPlan } from "./plan-session.ts";

// Plat « du soir » : au moins un ingrédient, tous `sameDay`. Il ne se prépare pas pendant la session.
export function isEveningDish(dish: Dish): boolean {
  return dish.ingredients.length > 0 && dish.ingredients.every((ingredient) => ingredient.sameDay);
}

function error(rule: Finding["rule"], dish: number | null, message: string): Finding {
  return { level: "error", rule, dish, ingredient: null, message };
}

export function checkSession(
  menu: Menu,
  equipment: Equipment,
): { findings: Finding[]; plan: SessionPlan | null } {
  const findings: Finding[] = [];
  const sessionPhases: SessionPhase[] = [];
  for (const [dishIndex, dish] of menu.dishes.entries()) {
    if (isEveningDish(dish)) {
      if (dish.phases.length > 0) {
        findings.push(
          error(
            "phases",
            dishIndex,
            "Tous les ingrédients sont `sameDay` : le plat se prépare le soir, laisse `phases` vide.",
          ),
        );
      }
      continue;
    }
    if (dish.phases.length === 0) {
      findings.push(
        error(
          "phases",
          dishIndex,
          "Le plat se prépare pendant la session : donne ses grandes phases (`phases`).",
        ),
      );
    }
    for (const phase of dish.phases) sessionPhases.push({ dish: dishIndex, phase });
  }

  // Avant tout calcul de graphe : un menu énorme ne doit ni faire déborder la pile ni ralentir le contrôle.
  if (sessionPhases.length > MAX_SESSION_PHASES) {
    findings.push(
      error(
        "phases",
        null,
        `Le menu a ${sessionPhases.length} phases ; ${MAX_SESSION_PHASES} au plus. Donne seulement les grandes phases de chaque plat.`,
      ),
    );
    return { findings, plan: null };
  }
  // Même raison pour `after` : un constat par dépendance inconnue ne doit pas exploser. On compte les id
  // distincts, car les doublons sont tolérés (D10bis) ; le `Set` est un parcours linéaire, sans récursion.
  for (const { dish, phase } of sessionPhases) {
    const distinct = new Set(phase.after).size;
    if (distinct > MAX_SESSION_PHASES) {
      findings.push(
        error(
          "phases",
          dish,
          `La phase « ${phase.id} » a ${distinct} dépendances distinctes ; ${MAX_SESSION_PHASES} au plus.`,
        ),
      );
      return { findings, plan: null };
    }
  }

  const known = new Set<string>();
  const existing = new Set(sessionPhases.map((entry) => entry.phase.id));
  for (const { dish, phase } of sessionPhases) {
    if (phase.id.trim() === "") {
      findings.push(error("phases", dish, "Une phase n'a pas d'`id`."));
    } else if (known.has(phase.id)) {
      findings.push(error("phases", dish, `L'id de phase « ${phase.id} » est déjà pris.`));
    } else {
      known.add(phase.id);
    }
    // Le texte compte tel qu'il sera imprimé : fait seulement de caractères neutralisés, il serait vide sur la fiche.
    if (isBlankWhenPrinted(phase.description)) {
      findings.push(error("phases", dish, `La phase « ${phase.id} » n'a pas de description.`));
    }
    if (
      !Number.isInteger(phase.minutes) ||
      phase.minutes < 1 ||
      phase.minutes > MAX_PHASE_MINUTES
    ) {
      findings.push(
        error(
          "phases",
          dish,
          `La phase « ${phase.id} » doit durer un nombre entier de minutes, de 1 à ${MAX_PHASE_MINUTES} (reçu : ${phase.minutes}).`,
        ),
      );
    }
    for (const dependency of new Set(phase.after)) {
      if (!existing.has(dependency)) {
        findings.push(
          error(
            "phases",
            dish,
            `La phase « ${phase.id} » dépend de « ${dependency} », qui n'existe pas.`,
          ),
        );
      }
    }
  }

  const stuck = phasesInCycles(sessionPhases);
  if (stuck.length > 0) {
    findings.push(
      error(
        "phases",
        null,
        `Dépendances circulaires : ces phases ne peuvent jamais commencer : ${stuck.join(", ")}.`,
      ),
    );
  }

  for (const { dish, phase } of sessionPhases) {
    if (phase.appliance !== "none" && !equipment.some((spec) => spec.id === phase.appliance)) {
      findings.push(
        error(
          "equipment",
          dish,
          `La phase « ${phase.id} » utilise ${APPLIANCE_LABELS[phase.appliance]}, absent de l'équipement.`,
        ),
      );
    }
  }
  // Un planning sur des phases fausses n'a pas de sens : l'IA corrige d'abord la structure.
  if (findings.length > 0) return { findings, plan: null };

  const plan = planSession(sessionPhases, equipment);
  if (plan.extras.length > 1) {
    findings.push(
      error(
        "extra-appliance",
        null,
        `La session utilise ${plan.extras.length} appareils d'appoint (${plan.extras.map((id) => APPLIANCE_LABELS[id]).join(", ")}) ; un seul au plus par session. Garde celui qui fait gagner le plus de temps, ou aucun.`,
      ),
    );
  }
  if (plan.minutes > MAX_SESSION_MINUTES) {
    const last = lastDish(plan, menu);
    findings.push(
      error(
        "session-length",
        null,
        `La session calculée dure ${durationText(plan.minutes)} ; le maximum est ${durationText(MAX_SESSION_MINUTES)} (objectif 2 h à 2 h 30). Ne raccourcis pas une durée réelle : fais tourner des cuissons en même temps, sépare le travail à la main de ce qui tourne seul, ou remplace le plat qui finit le plus tard : « ${last.name} » (fin à ${durationText(last.end)}).`,
      ),
    );
  }
  return { findings, plan };
}

// Phases restantes après un tri topologique de Kahn : celles qui ne peuvent jamais commencer, dans l'ordre du menu.
// Les dépendances inconnues sont ignorées ; une dépendance à soi-même est un cycle.
function phasesInCycles(entries: readonly SessionPhase[]): string[] {
  const ids = new Set(entries.map((entry) => entry.phase.id));
  const waiting = new Map<number, Set<string>>(
    entries.map((entry, index) => [
      index,
      new Set(entry.phase.after.filter((dependency) => ids.has(dependency))),
    ]),
  );
  const done = new Set<string>();
  let progressed = true;
  while (progressed) {
    progressed = false;
    for (const [index, deps] of waiting) {
      if ([...deps].every((dependency) => done.has(dependency))) {
        done.add(entries[index]!.phase.id);
        waiting.delete(index);
        progressed = true;
      }
    }
  }
  return [...waiting.keys()].map((index) => entries[index]!.phase.id);
}

// Plat de la phase qui finit le plus tard ; à égalité de fin, la première du planning.
export function lastDish(plan: SessionPlan, menu: Menu): { name: string; end: number } {
  let last = plan.phases[0]!;
  for (const entry of plan.phases) if (entry.end > last.end) last = entry;
  return { name: menu.dishes[last.dish]!.name, end: last.end };
}
