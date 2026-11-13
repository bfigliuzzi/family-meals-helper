import { describe, expect, it } from "vitest";
import { HOUSEHOLD_EQUIPMENT } from "../equipment/household.ts";
import { phase } from "../rules/fixtures/menus.ts";
import { APPLIANCES } from "../domain/menu.ts";
import type { Phase } from "../domain/menu.ts";
import { clockText, durationText, planSession } from "./plan-session.ts";
import type { SessionPlan } from "./plan-session.ts";

function plan(...phases: Phase[]): SessionPlan {
  return planSession(
    phases.map((entry) => ({ dish: 0, phase: entry })),
    HOUSEHOLD_EQUIPMENT,
  );
}

function startOf(result: SessionPlan, id: string): number {
  const found = result.phases.find((entry) => entry.phase.id === id);
  if (found === undefined) throw new Error(`phase ${id} absente`);
  return found.start;
}

function span(result: SessionPlan, id: string): [number, number] {
  const found = result.phases.find((entry) => entry.phase.id === id);
  if (found === undefined) throw new Error(`phase ${id} absente`);
  return [found.start, found.end];
}

// Plus grand nombre de phases d'un appareil en même temps.
function maxLoad(result: SessionPlan, appliance: string): number {
  const own = result.phases.filter((entry) => entry.phase.appliance === appliance);
  return Math.max(
    0,
    ...own.map(
      (probe) =>
        own.filter((other) => other.start <= probe.start && probe.start < other.end).length,
    ),
  );
}

describe("planSession : capacités", () => {
  it("four saturé : trois phases de 40 min, deux places", () => {
    const result = plan(
      phase("a", 40, "oven", false),
      phase("b", 40, "oven", false),
      phase("c", 40, "oven", false),
    );
    expect([startOf(result, "a"), startOf(result, "b"), startOf(result, "c")]).toEqual([0, 0, 40]);
    expect(result.minutes).toBe(80);
    expect(maxLoad(result, "oven")).toBeLessThanOrEqual(2);
  });
  it("plaque : cinq phases de 30 min, quatre feux", () => {
    const result = plan(
      ...["a", "b", "c", "d", "e"].map((id) => phase(id, 30, "induction", false)),
    );
    expect(["a", "b", "c", "d", "e"].map((id) => startOf(result, id))).toEqual([0, 0, 0, 0, 30]);
    expect(result.minutes).toBe(60);
  });
  it("une seule tâche manuelle à la fois", () => {
    const result = plan(phase("a", 20, "none", true), phase("b", 20, "none", true));
    expect(span(result, "a")).toEqual([0, 20]);
    expect(span(result, "b")).toEqual([20, 40]);
  });
  it("une phase qui tourne seule libère la personne", () => {
    const result = plan(phase("a", 20, "none", true), phase("b", 60, "oven", false));
    expect(startOf(result, "a")).toBe(0);
    expect(startOf(result, "b")).toBe(0);
    expect(result.minutes).toBe(60);
  });
  it("une phase mobilisée sur un appareil occupe la personne et l'appareil", () => {
    const hand = plan(phase("a", 20, "thermomix", true), phase("b", 20, "none", true));
    expect(span(hand, "a")).toEqual([0, 20]);
    expect(span(hand, "b")).toEqual([20, 40]);
    const device = plan(phase("a", 20, "thermomix", true), phase("b", 20, "thermomix", false));
    expect(span(device, "a")).toEqual([0, 20]);
    expect(span(device, "b")).toEqual([20, 40]);
  });
  it("une attente `none` non mobilisée ne bloque pas la personne", () => {
    const result = plan(phase("m", 30, "none", false), phase("d", 30, "none", true));
    expect(startOf(result, "m")).toBe(0);
    expect(startOf(result, "d")).toBe(0);
  });
  it("vérifie la capacité dans tout le créneau inséré", () => {
    const result = plan(
      phase("pa", 10, "none", true),
      phase("ca", 100, "oven", false, ["pa"]),
      phase("pb", 10, "none", true),
      phase("cb", 100, "oven", false, ["pb"]),
      phase("cc", 30, "oven", false),
    );
    expect(span(result, "ca")).toEqual([10, 110]);
    expect(span(result, "cb")).toEqual([20, 120]);
    expect(span(result, "cc")).toEqual([110, 140]);
    expect(maxLoad(result, "oven")).toBeLessThanOrEqual(2);
  });
});

describe("planSession : dépendances et priorités", () => {
  it("une phase attend la fin de sa dépendance", () => {
    const result = plan(phase("a", 20, "none", true), phase("b", 10, "oven", false, ["a"]));
    expect(startOf(result, "b")).toBe(20);
  });
  it("une dépendance peut venir d'un autre plat", () => {
    const result = planSession(
      [
        { dish: 0, phase: phase("a1", 20, "none", true) },
        { dish: 1, phase: phase("b1", 30, "kenwood", false, ["a1"]) },
      ],
      HOUSEHOLD_EQUIPMENT,
    );
    expect(span(result, "b1")).toEqual([20, 50]);
  });
  it("lance d'abord la phase du plus long chemin", () => {
    const result = plan(
      phase("x", 10, "none", true),
      phase("p", 15, "none", true),
      phase("c", 120, "oven", false, ["p"]),
    );
    expect(startOf(result, "p")).toBe(0);
    expect(startOf(result, "x")).toBe(15);
    expect(result.minutes).toBe(135);
  });
  it("à priorité égale, garde l'ordre d'entrée", () => {
    const result = plan(phase("a", 10, "none", true), phase("b", 10, "none", true));
    expect(startOf(result, "a")).toBe(0);
    expect(startOf(result, "b")).toBe(10);
  });
  it("ne laisse pas une soupe peu urgente bloquer le Thermomix et repousser le four", () => {
    const result = plan(
      phase("prep", 10, "none", true),
      phase("mix", 10, "thermomix", true, ["prep"]),
      phase("cuire", 150, "oven", false, ["mix"]),
      phase("soupe", 40, "thermomix", false),
    );
    expect(span(result, "prep")).toEqual([0, 10]);
    expect(span(result, "mix")).toEqual([10, 20]);
    expect(span(result, "cuire")).toEqual([20, 170]);
    expect(span(result, "soupe")).toEqual([20, 60]);
    expect(result.minutes).toBe(170);
  });
  it("préchauffage commun : le four démarre à chaud pour toutes les cuissons", () => {
    const result = plan(
      phase("p", 20, "oven", false),
      phase("a", 20, "oven", false, ["p"]),
      phase("b", 175, "oven", false, ["p"]),
    );
    expect(span(result, "b")).toEqual([20, 195]);
    expect(result.minutes).toBe(195);
  });
  it("lance une longue tâche à la main sans retarder une chaîne courte qui finit par une cuisson", () => {
    const result = plan(
      phase("u", 100, "none", true),
      phase("p", 10, "none", true),
      phase("c", 85, "oven", false, ["p"]),
    );
    expect(span(result, "p")).toEqual([0, 10]);
    expect(span(result, "c")).toEqual([10, 95]);
    expect(span(result, "u")).toEqual([10, 110]);
    expect(result.minutes).toBe(110);
  });
  it("cas réaliste : le four démarre pendant la préparation à la main", () => {
    const result = plan(
      phase("a1", 70, "none", true),
      phase("b1", 15, "induction", true),
      phase("b2", 50, "oven", false, ["b1"]),
    );
    expect(span(result, "b1")).toEqual([0, 15]);
    expect(span(result, "b2")).toEqual([15, 65]);
    expect(span(result, "a1")).toEqual([15, 85]);
    expect(result.minutes).toBe(85);
  });
  it("respecte la dépendance quand les priorités sont égales, même entrée avant", () => {
    const result = plan(phase("c", 30, "oven", false, ["p"]), phase("p", 10, "none", true));
    expect(span(result, "p")).toEqual([0, 10]);
    expect(span(result, "c")).toEqual([10, 40]);
    expect(result.minutes).toBe(40);
  });
  it("est déterministe", () => {
    const entry = [
      phase("a", 15, "none", true),
      phase("b", 40, "induction", false, ["a"]),
      phase("c", 30, "kenwood", false),
    ];
    expect(plan(...entry)).toEqual(plan(...entry));
  });
});

describe("planSession : résultat", () => {
  it("une phase valide seule se termine", () => {
    expect(plan(phase("a", 10, "none", true)).minutes).toBe(10);
  });
  it("sans phase, la durée est 0", () => {
    const result = plan();
    expect(result.minutes).toBe(0);
    expect(result.phases).toEqual([]);
  });
  it("liste les appareils d'appoint sans doublon, dans l'ordre d'apparition", () => {
    const result = plan(
      phase("a", 10, "airfryer", false),
      phase("b", 10, "cookeo", false),
      phase("c", 10, "airfryer", false),
      phase("d", 10, "oven", false),
    );
    expect(result.extras).toEqual(["airfryer", "cookeo"]);
  });
  it("trie les phases par début puis ordre d'entrée", () => {
    const result = plan(
      phase("a", 10, "none", true),
      phase("b", 10, "none", true),
      phase("c", 10, "oven", false),
    );
    expect(result.phases.map((entry) => entry.phase.id)).toEqual(["a", "c", "b"]);
  });
  it("garde le numéro du plat", () => {
    const result = planSession(
      [{ dish: 3, phase: phase("d1", 5, "none", true) }],
      HOUSEHOLD_EQUIPMENT,
    );
    expect(result.phases[0]?.dish).toBe(3);
  });
});

describe("durationText et clockText", () => {
  it.each([
    [45, "45 min"],
    [60, "1 h"],
    [65, "1 h 05"],
    [135, "2 h 15"],
    [180, "3 h"],
  ])("%i min s'écrit %s", (minutes, text) => {
    expect(durationText(minutes)).toBe(text);
  });
  it.each([
    [0, "0:00"],
    [135, "2:15"],
  ])("%i min s'écrit %s sur l'horloge", (minutes, text) => {
    expect(clockText(minutes)).toBe(text);
  });
});

describe("planSession : invariants sur 500 entrées pseudo-aléatoires", () => {
  it("respecte durées, dépendances, capacités et exclusivité de la personne", () => {
    let seed = 42;
    const next = (bound: number): number => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      // Bits hauts : le bit faible d'un LCG modulo 2^32 alterne d'un tirage à l'autre.
      return Math.floor((seed / 2 ** 32) * bound);
    };
    const combos = new Set<string>();
    for (let round = 0; round < 500; round++) {
      const count = 1 + next(12);
      const built: Phase[] = [];
      for (let i = 0; i < count; i++) {
        const after = built.filter(() => next(3) === 0).map((entry) => entry.id);
        const minutes = 1 + next(60);
        const appliance = APPLIANCES[next(APPLIANCES.length)]!;
        const attended = next(2) === 0;
        combos.add(`${appliance}/${attended}`);
        built.push(phase(`p${i}`, minutes, appliance, attended, after));
      }
      for (let i = built.length - 1; i > 0; i--) {
        const j = next(i + 1);
        [built[i], built[j]] = [built[j]!, built[i]!];
      }
      const result = plan(...built);
      expect(result.phases).toHaveLength(count);
      const ends = new Map(result.phases.map((entry) => [entry.phase.id, entry.end]));
      for (const entry of result.phases) {
        expect(entry.end - entry.start).toBe(entry.phase.minutes);
        for (const id of entry.phase.after)
          expect(entry.start).toBeGreaterThanOrEqual(ends.get(id)!);
        const spec = HOUSEHOLD_EQUIPMENT.find(
          (candidate) => candidate.id === entry.phase.appliance,
        );
        if (spec !== undefined) {
          const load = result.phases.filter(
            (other) =>
              other.phase.appliance === spec.id &&
              other.start <= entry.start &&
              entry.start < other.end,
          ).length;
          expect(load).toBeLessThanOrEqual(spec.slots);
        }
        if (entry.phase.attended) {
          for (const other of result.phases) {
            if (other === entry || !other.phase.attended) continue;
            expect(other.start < entry.end && entry.start < other.end).toBe(false);
          }
        }
      }
      expect(result.minutes).toBe(Math.max(...result.phases.map((entry) => entry.end)));
    }
    expect(combos.size).toBe(APPLIANCES.length * 2);
  });
});
