import type { ApplianceId, Phase } from "../domain/menu.ts";
import type { Equipment } from "../equipment/household.ts";

export interface SessionPhase {
  dish: number;
  phase: Phase;
}
export interface ScheduledPhase extends SessionPhase {
  start: number;
  end: number;
}
export interface SessionPlan {
  // Fin de la dernière phase ; 0 sans phase.
  minutes: number;
  // Triées par début, puis ordre d'entrée.
  phases: ScheduledPhase[];
  // Appareils d'appoint utilisés, dans l'ordre de première apparition.
  extras: ApplianceId[];
}

export const MAX_SESSION_MINUTES = 180;
export const MAX_PHASE_MINUTES = 600;
// Plafond du nombre de phases du menu : borne la récursion des priorités et la recherche de cycles.
export const MAX_SESSION_PHASES = 60;

export function durationText(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  if (rest === 0) return `${hours} h`;
  return `${hours} h ${String(rest).padStart(2, "0")}`;
}

export function clockText(minutes: number): string {
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`;
}

// Planificateur glouton déterministe, phase par phase, avec insertion (conception §6.4) : deux ordres de
// priorité, on garde le planning le plus court (à égalité, celui du plus long chemin).
// Précondition : entrée validée par `checkSession` (id uniques, dépendances connues et sans cycle,
// minutes entières de 1 à 600, au plus `MAX_SESSION_PHASES` phases, appareil présent dans l'équipement ou `none`).
export function planSession(phases: readonly SessionPhase[], equipment: Equipment): SessionPlan {
  const indexOfId = new Map<string, number>();
  for (const [index, entry] of phases.entries()) indexOfId.set(entry.phase.id, index);
  const dependencies = phases.map((entry) =>
    [...new Set(entry.phase.after)].flatMap((id) => {
      const found = indexOfId.get(id);
      return found === undefined ? [] : [found];
    }),
  );
  const successors: number[][] = phases.map(() => []);
  for (const [index, deps] of dependencies.entries()) {
    for (const dep of deps) successors[dep]!.push(index);
  }

  // Plus long chemin jusqu'à la fin, pour un poids par phase. Mémoïsé ; la récursion a au plus
  // `MAX_SESSION_PHASES` niveaux.
  const longestPath = (weight: (index: number) => number): number[] => {
    const memo: (number | undefined)[] = phases.map(() => undefined);
    const valueOf = (index: number): number => {
      const known = memo[index];
      if (known !== undefined) return known;
      const value = weight(index) + Math.max(0, ...successors[index]!.map(valueOf));
      memo[index] = value;
      return value;
    };
    return phases.map((_, index) => valueOf(index));
  };
  // Durée de la phase plus le plus long chemin de ses successeurs. Toute durée valant au moins 1,
  // elle décroît strictement le long d'une dépendance : une phase passe avant ses successeurs.
  const pathPriority = longestPath((index) => phases[index]!.phase.minutes);
  // Même chemin, mais seule compte la durée des phases qui tournent seules : fait passer en tête
  // ce qui débloque une cuisson sans mobiliser la personne.
  const idlePriority = longestPath((index) =>
    phases[index]!.phase.attended ? 0 : phases[index]!.phase.minutes,
  );
  const indexes = phases.map((_, index) => index);
  const byPath = [...indexes].sort((a, b) => pathPriority[b]! - pathPriority[a]! || a - b);
  // `pathPriority` départage les égalités d'`idlePriority` : une dépendance passe toujours avant son successeur.
  const byIdle = [...indexes].sort(
    (a, b) => idlePriority[b]! - idlePriority[a]! || pathPriority[b]! - pathPriority[a]! || a - b,
  );

  const slotsOf = (appliance: ApplianceId): number =>
    appliance === "none"
      ? Number.POSITIVE_INFINITY
      : (equipment.find((spec) => spec.id === appliance)?.slots ?? 0);

  const placeInOrder = (order: readonly number[]): SessionPlan => {
    const placed: { index: number; start: number; end: number }[] = [];
    for (const index of order) {
      const { phase } = phases[index]!;
      const earliest = Math.max(0, ...dependencies[index]!.map((dep) => endOf(placed, dep)));
      const candidates = [
        ...new Set([earliest, ...placed.map((slot) => slot.end).filter((end) => end > earliest)]),
      ].sort((a, b) => a - b);
      const capacity = slotsOf(phase.appliance);
      const fits = (start: number): boolean => {
        const end = start + phase.minutes;
        if (phase.appliance !== "none") {
          const same = placed.filter(
            (slot) => phases[slot.index]!.phase.appliance === phase.appliance,
          );
          const instants = [
            start,
            ...same.map((slot) => slot.start).filter((s) => s > start && s < end),
          ];
          const crowded = instants.some(
            (instant) =>
              same.filter((slot) => slot.start <= instant && instant < slot.end).length >= capacity,
          );
          if (crowded) return false;
        }
        if (phase.attended) {
          const busy = placed.some(
            (slot) => phases[slot.index]!.phase.attended && slot.start < end && start < slot.end,
          );
          if (busy) return false;
        }
        return true;
      };
      // Le dernier candidat (la plus grande fin placée) est toujours libre.
      const start = candidates.find(fits) ?? candidates[candidates.length - 1]!;
      placed.push({ index, start, end: start + phase.minutes });
    }

    const scheduled: ScheduledPhase[] = placed
      .sort((a, b) => a.start - b.start || a.index - b.index)
      .map((slot) => ({ ...phases[slot.index]!, start: slot.start, end: slot.end }));
    const extras: ApplianceId[] = [];
    for (const entry of phases) {
      const spec = equipment.find((candidate) => candidate.id === entry.phase.appliance);
      if (spec?.extra === true && !extras.includes(spec.id)) extras.push(spec.id);
    }
    return {
      minutes: Math.max(0, ...scheduled.map((entry) => entry.end)),
      phases: scheduled,
      extras,
    };
  };

  const first = placeInOrder(byPath);
  const second = placeInOrder(byIdle);
  return second.minutes < first.minutes ? second : first;
}

function endOf(placed: readonly { index: number; end: number }[], index: number): number {
  return placed.find((slot) => slot.index === index)?.end ?? 0;
}
