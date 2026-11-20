import { describe, expect, it, vi } from "vitest";
import type { ManualPriceRow, PriceStore } from "../ports/price-store.ts";
import { INSEE_TABLE } from "./insee-table.ts";
import { createPriceKeeper, KEY_REFUSED_MESSAGE } from "./price-keeper.ts";

const clock = { now: () => new Date(2026, 10, 16) };
const carrot: ManualPriceRow = { key: "fresh|carotte", unit: "kg", cents: 250, date: "2026-11-15" };
const leek: ManualPriceRow = { key: "fresh|poireau", unit: "kg", cents: 300, date: "2026-11-14" };

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
}
function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((ok, ko) => {
    resolve = ok;
    reject = ko;
  });
  return { promise, resolve, reject };
}

function storeOf(initial: ManualPriceRow[] = []): PriceStore & {
  calls: string[];
  written: ManualPriceRow[];
} {
  const calls: string[] = [];
  const written: ManualPriceRow[] = [];
  return {
    calls,
    written,
    listManual: () => {
      calls.push("list");
      return Promise.resolve(initial);
    },
    setManual: (row) => {
      calls.push(`set:${row.key}`);
      written.push(row);
      return Promise.resolve();
    },
    deleteManual: (key) => {
      calls.push(`delete:${key}`);
      return Promise.resolve();
    },
  };
}

function sourceKinds(keeper: ReturnType<typeof createPriceKeeper>): string[] {
  return keeper
    .snapshot()
    .lookups.map((lookup) => lookup.find("fresh|carotte", "kg")?.source.kind ?? "aucun");
}

describe("createPriceKeeper : chargement", () => {
  it("part de « loading » avec l'INSEE seul, puis passe à « ready » avec le manuel avant l'INSEE", async () => {
    const keeper = createPriceKeeper(storeOf([carrot]), { clock });
    expect(keeper.snapshot().manual).toEqual({ status: "loading", rows: [], error: null });
    expect(keeper.snapshot().lookups).toHaveLength(1);
    expect(sourceKinds(keeper)).toEqual(["insee"]);
    await keeper.load();
    expect(keeper.snapshot().manual).toEqual({ status: "ready", rows: [carrot], error: null });
    expect(sourceKinds(keeper)).toEqual(["manual", "insee"]);
  });
  it("ignore les lignes illisibles de la base", async () => {
    const store = storeOf([carrot, { ...leek, cents: 0 }, { ...leek, unit: "g" as never }]);
    const keeper = createPriceKeeper(store, { clock });
    await keeper.load();
    expect(keeper.snapshot().manual.rows).toEqual([carrot]);
  });
  it("une lecture qui échoue donne « error », sans ligne, et l'INSEE seul ; elle ne rejette pas", async () => {
    const store = { ...storeOf(), listManual: () => Promise.reject(new Error("Base fermée.")) };
    const keeper = createPriceKeeper(store, { clock });
    await expect(keeper.load()).resolves.toBeUndefined();
    expect(keeper.snapshot().manual).toEqual({ status: "error", rows: [], error: "Base fermée." });
    expect(sourceKinds(keeper)).toEqual(["insee"]);
  });
  it("une erreur sans message prend la phrase par défaut", async () => {
    const store = { ...storeOf(), listManual: () => Promise.reject(new Error("")) };
    const keeper = createPriceKeeper(store, { clock });
    await keeper.load();
    expect(keeper.snapshot().manual.error).toBe("Lecture de la table de prix impossible.");
  });
  it("une relecture après une erreur répare l'état", async () => {
    let fail = true;
    const store = {
      ...storeOf([carrot]),
      listManual: () => (fail ? Promise.reject(new Error("Panne.")) : Promise.resolve([carrot])),
    };
    const keeper = createPriceKeeper(store, { clock });
    await keeper.load();
    expect(keeper.snapshot().manual.status).toBe("error");
    fail = false;
    await keeper.load();
    expect(keeper.snapshot().manual).toEqual({ status: "ready", rows: [carrot], error: null });
  });
});

describe("createPriceKeeper : écritures", () => {
  it("set arrondit au centime, date du jour par le Clock, et ajoute la ligne", async () => {
    const store = storeOf();
    const keeper = createPriceKeeper(store, { clock });
    await keeper.load();
    await keeper.set("fresh|carotte", "kg", 2.149);
    expect(store.written).toEqual([
      { key: "fresh|carotte", unit: "kg", cents: 215, date: "2026-11-16" },
    ]);
    expect(keeper.snapshot().manual.rows).toEqual(store.written);
    expect(keeper.snapshot().lookups[0]?.find("fresh|carotte", "kg")?.euros).toBe(2.15);
  });
  it("set remplace la ligne de la même clé, sans changer les autres", async () => {
    const keeper = createPriceKeeper(storeOf([carrot, leek]), { clock });
    await keeper.load();
    await keeper.set("fresh|carotte", "piece", 0.59);
    expect(keeper.snapshot().manual.rows).toEqual([
      { key: "fresh|carotte", unit: "piece", cents: 59, date: "2026-11-16" },
      leek,
    ]);
  });
  it("set refuse un prix hors de 0,01 € à 1 000 € sans appeler le magasin", async () => {
    const store = storeOf();
    const keeper = createPriceKeeper(store, { clock });
    await keeper.load();
    for (const euros of [0, 0.004, -1, 1000.01, Number.NaN, Number.POSITIVE_INFINITY]) {
      await expect(keeper.set("fresh|carotte", "kg", euros)).rejects.toThrow(
        "Prix refusé : entre 0,01 € et 1 000 €.",
      );
    }
    await expect(keeper.set("fresh|carotte", "kg", 1000)).resolves.toBeUndefined();
    await expect(keeper.set("fresh|poireau", "kg", 0.01)).resolves.toBeUndefined();
    expect(store.written.map((row) => row.cents)).toEqual([100000, 1]);
  });
  it("set est refusé tant que la table n'est pas lue, ou si elle est illisible", async () => {
    const failing = { ...storeOf(), listManual: () => Promise.reject(new Error("Panne.")) };
    const keeper = createPriceKeeper(failing, { clock });
    await keeper.load();
    await expect(keeper.set("fresh|carotte", "kg", 2)).rejects.toThrow(
      "Votre table de prix n'est pas encore lue.",
    );
    expect(failing.written).toEqual([]);
  });
  it("une lecture différée puis un set : l'état final contient le prix de set (une seule file)", async () => {
    const read = deferred<ManualPriceRow[]>();
    const store = { ...storeOf(), listManual: () => read.promise };
    const keeper = createPriceKeeper(store, { clock });
    const loaded = keeper.load();
    const saved = keeper.set("fresh|carotte", "kg", 2.5);
    await Promise.resolve();
    expect(store.written).toEqual([]);
    read.resolve([leek]);
    await Promise.all([loaded, saved]);
    expect(keeper.snapshot().manual.rows).toEqual([
      leek,
      { key: "fresh|carotte", unit: "kg", cents: 250, date: "2026-11-16" },
    ]);
  });
  it("une lecture lancée après un set attend la fin du set", async () => {
    const write = deferred<undefined>();
    const store = storeOf([leek]);
    store.setManual = (row) => {
      store.calls.push(`set:${row.key}`);
      return write.promise;
    };
    const keeper = createPriceKeeper(store, { clock });
    await keeper.load();
    const saved = keeper.set("fresh|carotte", "kg", 2.5);
    const reloaded = keeper.load();
    await Promise.resolve();
    expect(store.calls).toEqual(["list", "set:fresh|carotte"]);
    write.resolve(undefined);
    await Promise.all([saved, reloaded]);
    expect(store.calls).toEqual(["list", "set:fresh|carotte", "list"]);
  });
  it("deux set simultanés partent dans l'ordre d'appel", async () => {
    const store = storeOf();
    const keeper = createPriceKeeper(store, { clock });
    await keeper.load();
    await Promise.all([
      keeper.set("fresh|carotte", "kg", 1),
      keeper.set("fresh|carotte", "kg", 2),
      keeper.set("fresh|poireau", "kg", 3),
    ]);
    expect(store.written.map((row) => `${row.key}:${String(row.cents)}`)).toEqual([
      "fresh|carotte:100",
      "fresh|carotte:200",
      "fresh|poireau:300",
    ]);
    expect(keeper.snapshot().manual.rows.map((row) => row.cents)).toEqual([200, 300]);
  });
  it("un échec d'écriture rejette, laisse les lignes inchangées, et la file continue", async () => {
    const store = storeOf([carrot]);
    let fail = true;
    store.setManual = (row) => {
      if (fail) return Promise.reject(new Error("Enregistrement du prix impossible."));
      store.written.push(row);
      return Promise.resolve();
    };
    const keeper = createPriceKeeper(store, { clock });
    await keeper.load();
    const before = keeper.snapshot();
    await expect(keeper.set("fresh|carotte", "kg", 9)).rejects.toThrow(
      "Enregistrement du prix impossible.",
    );
    expect(keeper.snapshot()).toBe(before);
    fail = false;
    await keeper.set("fresh|poireau", "kg", 3);
    expect(keeper.snapshot().manual.rows.map((row) => row.key)).toEqual([
      "fresh|carotte",
      "fresh|poireau",
    ]);
  });
  it("remove supprime en base puis retire la ligne ; un échec rejette sans rien changer", async () => {
    const store = storeOf([carrot, leek]);
    const keeper = createPriceKeeper(store, { clock });
    await keeper.load();
    await keeper.remove("fresh|carotte");
    expect(store.calls.at(-1)).toBe("delete:fresh|carotte");
    expect(keeper.snapshot().manual.rows).toEqual([leek]);
    expect(sourceKinds(keeper)).toEqual(["aucun", "insee"]);
    store.deleteManual = () => Promise.reject(new Error("Suppression du prix impossible."));
    const before = keeper.snapshot();
    await expect(keeper.remove("fresh|poireau")).rejects.toThrow("Suppression du prix impossible.");
    expect(keeper.snapshot()).toBe(before);
  });
});

describe("createPriceKeeper : clés", () => {
  it("set refuse une clé invalide avec la phrase exacte, sans appeler le magasin", async () => {
    const store = storeOf();
    const keeper = createPriceKeeper(store, { clock });
    await keeper.load();
    for (const key of [
      "sans-separateur",
      "xxx|carotte",
      "ab|",
      "fresh|",
      `fresh|${"a".repeat(200)}`,
    ]) {
      await expect(keeper.set(key, "kg", 2), key).rejects.toThrow(KEY_REFUSED_MESSAGE);
    }
    expect(KEY_REFUSED_MESSAGE).toBe(
      "Ce produit ne peut pas recevoir de prix personnel : son nom est trop long ou illisible.",
    );
    expect(store.written).toEqual([]);
  });
  it("le contrôle de la clé passe avant celui du prix", async () => {
    const keeper = createPriceKeeper(storeOf(), { clock });
    await keeper.load();
    await expect(keeper.set("xxx|carotte", "kg", 0)).rejects.toThrow(KEY_REFUSED_MESSAGE);
  });
  it("remove d'une clé invalide rejette sans appel au magasin", async () => {
    const store = storeOf();
    const keeper = createPriceKeeper(store, { clock });
    await keeper.load();
    await expect(keeper.remove("xxx|carotte")).rejects.toThrow(KEY_REFUSED_MESSAGE);
    expect(store.calls).toEqual(["list"]);
  });
  it("remove avant la fin de la lecture, ou si la table est illisible, rejette sans appel", async () => {
    const read = deferred<ManualPriceRow[]>();
    const store = { ...storeOf(), listManual: () => read.promise };
    const keeper = createPriceKeeper(store, { clock });
    const loaded = keeper.load();
    const removed = keeper.remove("fresh|carotte");
    const refused = expect(removed).rejects.toThrow("Votre table de prix n'est pas encore lue.");
    read.reject(new Error("Panne."));
    await loaded;
    await refused;
    expect(store.calls).toEqual([]);
  });
  it("remove avant tout load rejette", async () => {
    const store = storeOf([carrot]);
    const keeper = createPriceKeeper(store, { clock });
    await expect(keeper.remove("fresh|carotte")).rejects.toThrow(
      "Votre table de prix n'est pas encore lue.",
    );
    expect(store.calls).toEqual([]);
  });
});

describe("createPriceKeeper : abonnés et instantané", () => {
  it("le snapshot est le même objet tant que rien ne change, et un abonné est prévenu à chaque changement", async () => {
    const keeper = createPriceKeeper(storeOf(), { clock });
    const listener = vi.fn();
    const unsubscribe = keeper.subscribe(listener);
    expect(keeper.snapshot()).toBe(keeper.snapshot());
    await keeper.load();
    expect(listener).toHaveBeenCalledTimes(1);
    const ready = keeper.snapshot();
    expect(keeper.snapshot()).toBe(ready);
    unsubscribe();
    await keeper.set("fresh|carotte", "kg", 2);
    expect(listener).toHaveBeenCalledTimes(1);
  });
  it("un abonné qui lève est signalé et n'empêche ni les autres ni la suite", async () => {
    const onListenerError = vi.fn();
    const keeper = createPriceKeeper(storeOf(), { clock, onListenerError });
    const second = vi.fn();
    keeper.subscribe(() => {
      throw new Error("abonné cassé");
    });
    keeper.subscribe(second);
    await keeper.load();
    expect(onListenerError).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
    await expect(keeper.set("fresh|carotte", "kg", 2)).resolves.toBeUndefined();
  });
  it("l'INSEE de la table du code est bien celui des lookups", () => {
    const keeper = createPriceKeeper(storeOf(), { clock });
    const price = keeper.snapshot().lookups[0]?.find("fresh|carotte", "kg");
    expect(price?.euros).toBe(INSEE_TABLE["fresh|carotte"]?.euros);
  });
});
