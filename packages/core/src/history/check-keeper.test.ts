import { describe, expect, it, vi } from "vitest";
import { createCheckKeeper } from "./check-keeper.ts";

interface Call {
  id: number;
  keys: readonly string[];
  resolve(): void;
  reject(message: string): void;
}

// Faux `setChecked` à promesses contrôlées.
function controlled() {
  const calls: Call[] = [];
  const live = { now: 0, max: 0 };
  const state = { throwSync: false };
  const store = {
    setChecked(id: number, keys: readonly string[]): Promise<void> {
      if (state.throwSync) throw new Error("levée");
      live.now += 1;
      live.max = Math.max(live.max, live.now);
      return new Promise<void>((resolve, reject) => {
        calls.push({
          id,
          keys,
          resolve() {
            live.now -= 1;
            resolve();
          },
          reject(message) {
            live.now -= 1;
            reject(new Error(message));
          },
        });
      });
    },
  };
  return { store, calls, live, state };
}

const flush = async (): Promise<void> => {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
};

describe("createCheckKeeper", () => {
  it("réponse tardive : une coche plus récente n'est jamais défaite, une seconde écriture part avec elle", async () => {
    const { store, calls } = controlled();
    const keeper = createCheckKeeper(store);
    keeper.set(1, ["A"]);
    await flush();
    keeper.set(1, ["A", "B"]);
    calls[0]!.resolve();
    await flush();
    expect(keeper.snapshot()[1]?.keys).toEqual(["A", "B"]);
    expect(calls).toHaveLength(2);
    expect(calls[1]?.keys).toEqual(["A", "B"]);
    calls[1]!.resolve();
    await flush();
    expect(keeper.snapshot()[1]).toEqual({ keys: ["A", "B"], saving: false, error: null });
  });

  it("jamais deux écritures de la même entrée en même temps", async () => {
    const { store, calls, live } = controlled();
    const keeper = createCheckKeeper(store);
    for (const keys of [["A"], ["A", "B"], ["B"], []]) {
      keeper.set(1, keys);
      await flush();
    }
    // Chaque écriture réglée libère la suivante : à aucun moment il n'y en a deux.
    for (let at = 0; at < calls.length; at += 1) {
      calls[at]!.resolve();
      await flush();
    }
    expect(calls).toHaveLength(2);
    expect(live.max).toBe(1);
  });

  it("regroupe : trois coches pendant une écriture ne donnent qu'une écriture de plus, avec le dernier état", async () => {
    const { store, calls } = controlled();
    const keeper = createCheckKeeper(store);
    keeper.set(1, ["A"]);
    await flush();
    keeper.set(1, ["B"]);
    keeper.set(1, ["C"]);
    keeper.set(1, ["D"]);
    calls[0]!.resolve();
    await flush();
    expect(calls).toHaveLength(2);
    expect(calls[1]?.keys).toEqual(["D"]);
  });

  it("un échec dépassé par un état plus récent est oublié : l'état récent part, pas d'erreur", async () => {
    const { store, calls } = controlled();
    const keeper = createCheckKeeper(store);
    keeper.set(1, ["A"]);
    await flush();
    keeper.set(1, ["A", "B"]);
    calls[0]!.reject("échec 1");
    await flush();
    expect(keeper.snapshot()[1]?.error).toBeNull();
    expect(calls[1]?.keys).toEqual(["A", "B"]);
    expect(keeper.snapshot()[1]?.saving).toBe(true);
  });

  it("un échec sans état plus récent est gardé, sans retour en arrière", async () => {
    const { store, calls } = controlled();
    const keeper = createCheckKeeper(store);
    keeper.set(1, ["A"]);
    await flush();
    calls[0]!.reject("disque plein");
    await flush();
    expect(keeper.snapshot()[1]).toEqual({ keys: ["A"], saving: false, error: "disque plein" });
  });

  it("un rejet qui n'est pas une erreur donne la phrase de repli", async () => {
    const keeper = createCheckKeeper({
      setChecked: vi.fn<() => Promise<never>>().mockRejectedValue("texte"),
    });
    keeper.set(1, ["A"]);
    await flush();
    expect(keeper.snapshot()[1]?.error).toBe("Erreur inconnue de l'historique.");
  });

  it("retry réentrant : deux appels dans la même tâche ne font qu'une écriture", async () => {
    const { store, calls } = controlled();
    const keeper = createCheckKeeper(store);
    keeper.set(1, ["A"]);
    await flush();
    calls[0]!.reject("x");
    await flush();
    keeper.retry(1);
    keeper.retry(1);
    await flush();
    expect(calls).toHaveLength(2);
    expect(calls[1]?.keys).toEqual(["A"]);
  });

  it("nouvelle tentative après un rejet : l'erreur s'efface au succès ; un nouveau set efface une erreur", async () => {
    const { store, calls } = controlled();
    const keeper = createCheckKeeper(store);
    keeper.set(1, ["A"]);
    await flush();
    calls[0]!.reject("x");
    await flush();
    keeper.retry(1);
    await flush();
    expect(keeper.snapshot()[1]?.error).toBeNull();
    calls[1]!.resolve();
    await flush();
    expect(keeper.snapshot()[1]).toEqual({ keys: ["A"], saving: false, error: null });

    keeper.set(1, ["A", "B"]);
    await flush();
    calls[2]!.reject("y");
    await flush();
    expect(keeper.snapshot()[1]?.error).toBe("y");
    keeper.set(1, ["B"]);
    await flush();
    expect(keeper.snapshot()[1]?.error).toBeNull();
    expect(calls[3]?.keys).toEqual(["B"]);
  });

  it("retry sans erreur : aucune écriture", async () => {
    const { store, calls } = controlled();
    const keeper = createCheckKeeper(store);
    keeper.retry(1);
    keeper.set(1, ["A"]);
    await flush();
    calls[0]!.resolve();
    await flush();
    keeper.retry(1);
    await flush();
    expect(calls).toHaveLength(1);
  });

  it("deux entrées sont indépendantes", async () => {
    const { store, calls } = controlled();
    const keeper = createCheckKeeper(store);
    keeper.set(1, ["A"]);
    keeper.set(2, ["B"]);
    await flush();
    expect(calls.map((call) => call.id)).toEqual([1, 2]);
  });

  it("un setChecked qui lève de façon synchrone est un rejet, sans exception hors de set", async () => {
    const { store, state } = controlled();
    state.throwSync = true;
    const keeper = createCheckKeeper(store);
    expect(() => {
      keeper.set(1, ["A"]);
    }).not.toThrow();
    await flush();
    expect(keeper.snapshot()[1]).toEqual({ keys: ["A"], saving: false, error: "levée" });
  });

  it("snapshots gelés, même objet tant que rien ne change ; un abonné qui lève n'arrête pas les autres", async () => {
    const { store, calls } = controlled();
    const errors: unknown[] = [];
    const keeper = createCheckKeeper(store, { onListenerError: (error) => errors.push(error) });
    const first = keeper.snapshot();
    expect(keeper.snapshot()).toBe(first);
    expect(Object.isFrozen(first)).toBe(true);
    let heard = 0;
    keeper.subscribe(() => {
      throw new Error("abonné");
    });
    const off = keeper.subscribe(() => {
      heard += 1;
    });
    keeper.set(1, ["A"]);
    await flush();
    expect(heard).toBeGreaterThan(0);
    expect(errors.length).toBeGreaterThan(0);
    const second = keeper.snapshot();
    expect(second).not.toBe(first);
    expect(keeper.snapshot()).toBe(second);
    expect(Object.isFrozen(second)).toBe(true);
    expect(Object.isFrozen(second[1])).toBe(true);
    expect(Object.isFrozen(second[1]?.keys)).toBe(true);
    off();
    const before = heard;
    calls[0]!.resolve();
    await flush();
    expect(heard).toBe(before);
  });
});
