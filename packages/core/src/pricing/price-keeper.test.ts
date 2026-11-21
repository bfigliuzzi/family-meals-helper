import { describe, expect, it, vi } from "vitest";
import type { OpenPricesStore } from "../ports/open-prices-store.ts";
import type { ManualPriceRow, PriceStore } from "../ports/price-store.ts";
import { INSEE_TABLE } from "./insee-table.ts";
import { createPriceKeeper, KEY_REFUSED_MESSAGE } from "./price-keeper.ts";
import { SUMMARY_TOO_BIG_MESSAGE } from "./open-prices.ts";
import type { Diagnostics, OpenPricesSummary } from "./open-prices.ts";

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

// ---- Open Prices (7.4) -------------------------------------------------------------------------------------------

const TODAY = "2026-11-16";
const stat = { median: 2.1, count: 5, first: "2026-06-01", last: "2026-11-10" };
function summaryAt(fetchedAt: string, usable = { category: 14, product: 14 }): OpenPricesSummary {
  return {
    version: 1,
    fetchedAt,
    from: "2026-05-16",
    to: fetchedAt,
    usable,
    prices: { "fresh|carotte": { kg: stat }, "fresh|lait": { l: { ...stat, median: 1.68 } } },
  };
}
const CLEAN: Diagnostics = {
  files: {
    locations: { lines: 10_000, unreadable: 0, badFields: 0 },
    prices: { lines: 10_000, unreadable: 0, badFields: 0 },
    products: { lines: 10_000, unreadable: 0, badFields: 0 },
  },
  usable: { category: 14, product: 14 },
};

function openStoreOf(
  state: { attemptedAt: string | null; summary: OpenPricesSummary | null } = {
    attemptedAt: null,
    summary: null,
  },
) {
  const calls: string[] = [];
  const saved: { today: string; summary: string }[] = [];
  const control = {
    loadError: null as string | null,
    downloadError: null as string | null,
    saveError: null as string | null,
    holdLoad: null as Deferred<{ attemptedAt: string | null; summary: string | null }> | null,
  };
  const store: OpenPricesStore = {
    load() {
      calls.push("load");
      if (control.holdLoad !== null) return control.holdLoad.promise;
      if (control.loadError !== null) return Promise.reject(new Error(control.loadError));
      return Promise.resolve({
        attemptedAt: state.attemptedAt,
        summary: state.summary === null ? null : JSON.stringify(state.summary),
      });
    },
    download(today) {
      calls.push(`download:${today}`);
      if (control.downloadError !== null) return Promise.reject(new Error(control.downloadError));
      return Promise.resolve();
    },
    read: () => Promise.resolve(new Uint8Array(0)),
    save(today, summary) {
      calls.push(`save:${today}`);
      saved.push({ today, summary });
      if (control.saveError !== null) return Promise.reject(new Error(control.saveError));
      return Promise.resolve();
    },
  };
  return { store, calls, saved, control };
}

function keeperWith(
  openStore: ReturnType<typeof openStoreOf>,
  build: () => Promise<{ summary: OpenPricesSummary; diagnostics: Diagnostics }> = () =>
    Promise.resolve({ summary: summaryAt(TODAY), diagnostics: CLEAN }),
  manualStore: PriceStore = storeOf([carrot]),
) {
  const built = vi.fn(build);
  const keeper = createPriceKeeper(manualStore, {
    clock,
    openPrices: { store: openStore.store, build: built },
  });
  return { keeper, built };
}

describe("createPriceKeeper : Open Prices, lecture du résumé", () => {
  it("part de « none » sans résumé en service, avec l'INSEE seul et rien de prêt", () => {
    const { keeper } = keeperWith(openStoreOf());
    expect(keeper.snapshot().openPrices).toEqual({
      status: "none",
      fetchedAt: null,
      error: null,
      errorStage: null,
    });
    expect(keeper.snapshot().ready).toBe(false);
    expect(sourceKinds(keeper)).toEqual(["insee"]);
  });
  it("sans ligne en base : « none », sans erreur, prêt après le premier load", async () => {
    const { keeper } = keeperWith(openStoreOf());
    await keeper.load();
    expect(keeper.snapshot().openPrices).toEqual({
      status: "none",
      fetchedAt: null,
      error: null,
      errorStage: null,
    });
    expect(keeper.snapshot().ready).toBe(true);
    expect(sourceKinds(keeper)).toEqual(["manual", "insee"]);
  });
  it("un résumé lisible : « ready », son jour, et la source entre le manuel et l'INSEE", async () => {
    const { keeper } = keeperWith(
      openStoreOf({ attemptedAt: "2026-11-14", summary: summaryAt("2026-11-14") }),
    );
    await keeper.load();
    expect(keeper.snapshot().openPrices).toEqual({
      status: "ready",
      fetchedAt: "2026-11-14",
      error: null,
      errorStage: null,
    });
    expect(sourceKinds(keeper)).toEqual(["manual", "open-prices", "insee"]);
    expect(keeper.snapshot().lookups[1]?.find("fresh|lait", "l")?.euros).toBe(1.68);
  });
  it("un résumé illisible est un résumé absent, sans message", async () => {
    const openStore = openStoreOf();
    openStore.store.load = () =>
      Promise.resolve({ attemptedAt: "2026-11-14", summary: '{"version":2}' });
    const { keeper } = keeperWith(openStore);
    await keeper.load();
    expect(keeper.snapshot().openPrices).toEqual({
      status: "none",
      fetchedAt: null,
      error: null,
      errorStage: null,
    });
    expect(sourceKinds(keeper)).toEqual(["manual", "insee"]);
  });
  it("une lecture du résumé qui rejette : le manuel et l'INSEE restent, l'erreur est affichée", async () => {
    const openStore = openStoreOf();
    openStore.control.loadError = "Lecture des prix Open Prices impossible.";
    const { keeper } = keeperWith(openStore);
    await expect(keeper.load()).resolves.toBeUndefined();
    expect(keeper.snapshot().openPrices).toEqual({
      status: "none",
      fetchedAt: null,
      error: "Lecture des prix Open Prices impossible.",
      errorStage: "read",
    });
    expect(keeper.snapshot().ready).toBe(true);
    expect(sourceKinds(keeper)).toEqual(["manual", "insee"]);
  });
  it("une table manuelle illisible laisse Open Prices et l'INSEE", async () => {
    const manual = { ...storeOf(), listManual: () => Promise.reject(new Error("Base fermée.")) };
    const { keeper } = keeperWith(
      openStoreOf({ attemptedAt: "2026-11-14", summary: summaryAt("2026-11-14") }),
      undefined,
      manual,
    );
    await keeper.load();
    expect(keeper.snapshot().manual.status).toBe("error");
    expect(sourceKinds(keeper)).toEqual(["open-prices", "insee"]);
  });
  it("seul le premier load lit le résumé", async () => {
    const openStore = openStoreOf();
    const { keeper } = keeperWith(openStore);
    await keeper.load();
    await keeper.load();
    expect(openStore.calls.filter((call) => call === "load")).toHaveLength(1);
  });
  it("« prêt » attend la table de l'utilisateur et le résumé ; la fin de l'un n'efface pas l'autre", async () => {
    const openStore = openStoreOf({ attemptedAt: "2026-11-14", summary: summaryAt("2026-11-14") });
    const held = deferred<{ attemptedAt: string | null; summary: string | null }>();
    openStore.control.holdLoad = held;
    const manualHeld = deferred<ManualPriceRow[]>();
    const manual = { ...storeOf(), listManual: () => manualHeld.promise };
    const { keeper } = keeperWith(openStore, undefined, manual);
    const loading = keeper.load();
    manualHeld.resolve([carrot]);
    await Promise.resolve();
    await Promise.resolve();
    expect(keeper.snapshot().manual.status).toBe("ready");
    expect(keeper.snapshot().ready).toBe(false);
    held.resolve({ attemptedAt: "2026-11-14", summary: JSON.stringify(summaryAt("2026-11-14")) });
    await loading;
    expect(keeper.snapshot().ready).toBe(true);
    expect(sourceKinds(keeper)).toEqual(["manual", "open-prices", "insee"]);
  });
  it("sans option Open Prices : prêt dès la table lue, rien à télécharger", async () => {
    const keeper = createPriceKeeper(storeOf([carrot]), { clock });
    expect(keeper.snapshot().ready).toBe(false);
    await keeper.load();
    expect(keeper.snapshot().ready).toBe(true);
    await keeper.refreshOpenPricesIfDue();
    expect(keeper.snapshot().openPrices.status).toBe("none");
  });
});

describe("createPriceKeeper : Open Prices, rafraîchissement", () => {
  it("dû : télécharge, calcule, enregistre, puis sert les trois sources ; passe par « refreshing »", async () => {
    const openStore = openStoreOf();
    const { keeper, built } = keeperWith(openStore);
    const states: string[] = [];
    keeper.subscribe(() => states.push(keeper.snapshot().openPrices.status));
    await keeper.load();
    await keeper.refreshOpenPricesIfDue();
    expect(openStore.calls).toEqual(["load", `download:${TODAY}`, `save:${TODAY}`]);
    expect(built).toHaveBeenCalledWith(TODAY);
    expect(openStore.saved).toHaveLength(1);
    expect(JSON.parse(openStore.saved[0]!.summary)).toMatchObject({ version: 1, fetchedAt: TODAY });
    expect(states).toContain("refreshing");
    expect(keeper.snapshot().openPrices).toEqual({
      status: "ready",
      fetchedAt: TODAY,
      error: null,
      errorStage: null,
    });
    expect(sourceKinds(keeper)).toEqual(["manual", "open-prices", "insee"]);
  });
  it("pas dû (résumé de 3 jours) : aucun téléchargement", async () => {
    const openStore = openStoreOf({ attemptedAt: "2026-11-13", summary: summaryAt("2026-11-13") });
    const { keeper, built } = keeperWith(openStore);
    await keeper.load();
    await keeper.refreshOpenPricesIfDue();
    expect(openStore.calls).toEqual(["load"]);
    expect(built).not.toHaveBeenCalled();
    expect(keeper.snapshot().openPrices.status).toBe("ready");
  });
  it("un essai a déjà eu lieu aujourd'hui : aucun téléchargement, même sans résumé", async () => {
    const openStore = openStoreOf({ attemptedAt: TODAY, summary: null });
    const { keeper } = keeperWith(openStore);
    await keeper.load();
    await keeper.refreshOpenPricesIfDue();
    expect(openStore.calls).toEqual(["load"]);
  });
  it("un résumé de 9 jours est remplacé", async () => {
    const openStore = openStoreOf({ attemptedAt: "2026-11-07", summary: summaryAt("2026-11-07") });
    const { keeper } = keeperWith(openStore);
    await keeper.load();
    await keeper.refreshOpenPricesIfDue();
    expect(keeper.snapshot().openPrices.fetchedAt).toBe(TODAY);
    expect(openStore.saved).toHaveLength(1);
  });
  it("appelée avant la fin d'un load différé qui dit « essai aujourd'hui » : aucun téléchargement", async () => {
    const openStore = openStoreOf();
    const held = deferred<{ attemptedAt: string | null; summary: string | null }>();
    openStore.control.holdLoad = held;
    const { keeper } = keeperWith(openStore);
    const loading = keeper.load();
    const refreshing = keeper.refreshOpenPricesIfDue();
    held.resolve({ attemptedAt: TODAY, summary: null });
    await Promise.all([loading, refreshing]);
    expect(openStore.calls).toEqual(["load"]);
  });
  it("appelée avant tout load : lit le résumé, puis décide", async () => {
    const openStore = openStoreOf({ attemptedAt: "2026-11-14", summary: summaryAt("2026-11-14") });
    const { keeper } = keeperWith(openStore);
    await keeper.refreshOpenPricesIfDue();
    expect(openStore.calls).toEqual(["load"]);
  });
  it("deux appels de suite (double effet de StrictMode) : un seul téléchargement, la même promesse", async () => {
    const openStore = openStoreOf();
    const { keeper } = keeperWith(openStore);
    void keeper.load();
    const first = keeper.refreshOpenPricesIfDue();
    const second = keeper.refreshOpenPricesIfDue();
    expect(second).toBe(first);
    await Promise.all([first, second]);
    expect(openStore.calls.filter((call) => call.startsWith("download"))).toHaveLength(1);
    await keeper.refreshOpenPricesIfDue();
    expect(openStore.calls.filter((call) => call.startsWith("download"))).toHaveLength(1);
  });
  it("un téléchargement qui échoue, avec un résumé en service : « ready », ancien résumé gardé, erreur affichée", async () => {
    const openStore = openStoreOf({ attemptedAt: "2026-11-01", summary: summaryAt("2026-11-01") });
    openStore.control.downloadError = "Connexion à Open Prices impossible : vérifiez le réseau.";
    const { keeper, built } = keeperWith(openStore);
    await keeper.load();
    await keeper.refreshOpenPricesIfDue();
    expect(keeper.snapshot().openPrices).toEqual({
      status: "ready",
      fetchedAt: "2026-11-01",
      error: "Connexion à Open Prices impossible : vérifiez le réseau.",
      errorStage: "update",
    });
    expect(built).not.toHaveBeenCalled();
    expect(sourceKinds(keeper)).toEqual(["manual", "open-prices", "insee"]);
  });
  it("le même échec sans résumé : « none », l'INSEE et le manuel restent", async () => {
    const openStore = openStoreOf();
    openStore.control.downloadError = "Délai dépassé : Open Prices n'a pas répondu à temps.";
    const { keeper } = keeperWith(openStore);
    await keeper.load();
    await keeper.refreshOpenPricesIfDue();
    expect(keeper.snapshot().openPrices).toEqual({
      status: "none",
      fetchedAt: null,
      error: "Délai dépassé : Open Prices n'a pas répondu à temps.",
      errorStage: "update",
    });
    expect(sourceKinds(keeper)).toEqual(["manual", "insee"]);
  });
  it("un calcul qui échoue : rien n'est enregistré", async () => {
    const openStore = openStoreOf();
    const { keeper } = keeperWith(openStore, () =>
      Promise.reject(new Error("Fichier Open Prices illisible : prices.")),
    );
    await keeper.load();
    await keeper.refreshOpenPricesIfDue();
    expect(openStore.saved).toEqual([]);
    expect(keeper.snapshot().openPrices.error).toBe("Fichier Open Prices illisible : prices.");
    expect(keeper.snapshot().openPrices.status).toBe("none");
  });
  it("une erreur sans message prend la phrase par défaut", async () => {
    const openStore = openStoreOf();
    const { keeper } = keeperWith(openStore, () => Promise.reject(new Error("")));
    await keeper.load();
    await keeper.refreshOpenPricesIfDue();
    expect(keeper.snapshot().openPrices.error).toBe("Mise à jour des prix Open Prices impossible.");
  });
  it("un résumé refusé par la garde de format : jamais enregistré, l'ancien reste, message exact", async () => {
    const openStore = openStoreOf({ attemptedAt: "2026-11-01", summary: summaryAt("2026-11-01") });
    const bad: Diagnostics = {
      ...CLEAN,
      files: { ...CLEAN.files, prices: { lines: 10_000, unreadable: 0, badFields: 50 } },
    };
    const { keeper } = keeperWith(openStore, () =>
      Promise.resolve({ summary: summaryAt(TODAY), diagnostics: bad }),
    );
    await keeper.load();
    await keeper.refreshOpenPricesIfDue();
    expect(openStore.saved).toEqual([]);
    expect(keeper.snapshot().openPrices).toEqual({
      status: "ready",
      fetchedAt: "2026-11-01",
      error: "Résumé Open Prices refusé : prices a 0,50 % de lignes illisibles (format changé ?).",
      errorStage: "update",
    });
    expect(sourceKinds(keeper)).toEqual(["manual", "open-prices", "insee"]);
  });
  it("un résumé trop pauvre contre la semaine précédente est refusé", async () => {
    const openStore = openStoreOf({
      attemptedAt: "2026-11-01",
      summary: summaryAt("2026-11-01", { category: 14, product: 14 }),
    });
    const { keeper } = keeperWith(openStore, () =>
      Promise.resolve({
        summary: summaryAt(TODAY, { category: 14, product: 6 }),
        diagnostics: { ...CLEAN, usable: { category: 14, product: 6 } },
      }),
    );
    await keeper.load();
    await keeper.refreshOpenPricesIfDue();
    expect(openStore.saved).toEqual([]);
    expect(keeper.snapshot().openPrices.error).toContain("Résumé Open Prices refusé");
  });
  it("un résumé trop grand pour la base n'est pas enregistré", async () => {
    const openStore = openStoreOf();
    const prices: OpenPricesSummary["prices"] = {};
    for (let i = 0; i < 20_000; i += 1) prices[`fresh|produit numéro ${i}`] = { kg: stat };
    const { keeper } = keeperWith(openStore, () =>
      Promise.resolve({ summary: { ...summaryAt(TODAY), prices }, diagnostics: CLEAN }),
    );
    await keeper.load();
    await keeper.refreshOpenPricesIfDue();
    expect(openStore.saved).toEqual([]);
    expect(keeper.snapshot().openPrices.error).toBe(SUMMARY_TOO_BIG_MESSAGE);
  });
  it("une écriture du résumé qui échoue : l'ancien reste en service, l'erreur est affichée", async () => {
    const openStore = openStoreOf({ attemptedAt: "2026-11-01", summary: summaryAt("2026-11-01") });
    openStore.control.saveError = "Enregistrement du résumé des prix impossible.";
    const { keeper } = keeperWith(openStore);
    await keeper.load();
    await keeper.refreshOpenPricesIfDue();
    expect(keeper.snapshot().openPrices).toEqual({
      status: "ready",
      fetchedAt: "2026-11-01",
      error: "Enregistrement du résumé des prix impossible.",
      errorStage: "update",
    });
  });
  it("une lecture du résumé échouée : aucun téléchargement dans ce lancement, l'erreur reste (étape « read »)", async () => {
    const openStore = openStoreOf();
    openStore.control.loadError = "Lecture des prix Open Prices impossible.";
    const { keeper, built } = keeperWith(openStore);
    await keeper.load();
    await keeper.refreshOpenPricesIfDue();
    expect(openStore.calls).toEqual(["load"]);
    expect(built).not.toHaveBeenCalled();
    expect(keeper.snapshot().openPrices).toEqual({
      status: "none",
      fetchedAt: null,
      error: "Lecture des prix Open Prices impossible.",
      errorStage: "read",
    });
    expect(sourceKinds(keeper)).toEqual(["manual", "insee"]);
  });
  it("une réussite n'a ni erreur ni étape d'erreur", async () => {
    const { keeper } = keeperWith(openStoreOf());
    await keeper.load();
    await keeper.refreshOpenPricesIfDue();
    expect(keeper.snapshot().openPrices).toMatchObject({ error: null, errorStage: null });
  });
});

describe("createPriceKeeper : file de la table manuelle et tranches", () => {
  it("un load différé suivi d'un set : la lecture finit avec les anciennes lignes, l'état final a le prix du set", async () => {
    const manualHeld = deferred<ManualPriceRow[]>();
    const base = storeOf([carrot]);
    let first = true;
    const manual: PriceStore = {
      ...base,
      listManual: () => {
        if (first) {
          first = false;
          return manualHeld.promise;
        }
        return base.listManual();
      },
    };
    const { keeper } = keeperWith(openStoreOf(), undefined, manual);
    const loading = keeper.load();
    const writing = keeper.set("fresh|poireau", "kg", 3);
    manualHeld.resolve([carrot]);
    await Promise.all([loading, writing]);
    expect(keeper.snapshot().manual.rows.map((row) => row.key)).toEqual([
      "fresh|carotte",
      "fresh|poireau",
    ]);
  });
  it("deux load dont le premier finit après le second : l'ordre de la file est gardé", async () => {
    const heldFirst = deferred<ManualPriceRow[]>();
    const answers = [heldFirst.promise, Promise.resolve([leek])];
    const manual: PriceStore = {
      ...storeOf(),
      listManual: () => answers.shift() ?? Promise.resolve([]),
    };
    const { keeper } = keeperWith(openStoreOf(), undefined, manual);
    const first = keeper.load();
    const second = keeper.load();
    heldFirst.resolve([carrot]);
    await Promise.all([first, second]);
    expect(keeper.snapshot().manual.rows).toEqual([leek]);
  });
  it("la fin d'une lecture de la table n'efface pas un résumé publié entre-temps", async () => {
    const openStore = openStoreOf();
    const manualHeld = deferred<ManualPriceRow[]>();
    const manual: PriceStore = { ...storeOf(), listManual: () => manualHeld.promise };
    const { keeper } = keeperWith(openStore, undefined, manual);
    const loading = keeper.load();
    await keeper.refreshOpenPricesIfDue();
    expect(keeper.snapshot().openPrices.status).toBe("ready");
    manualHeld.resolve([carrot]);
    await loading;
    expect(keeper.snapshot().openPrices.status).toBe("ready");
    expect(sourceKinds(keeper)).toEqual(["manual", "open-prices", "insee"]);
  });
  it("après une erreur, load repasse par « loading » avant de lire ; depuis « ready », il reste « ready »", async () => {
    let mode: "fail" | "hold" | "ok" = "fail";
    const held = deferred<ManualPriceRow[]>();
    const manual: PriceStore = {
      ...storeOf(),
      listManual: () => {
        if (mode === "fail") return Promise.reject(new Error("Panne."));
        if (mode === "hold") return held.promise;
        return Promise.resolve([carrot]);
      },
    };
    const { keeper } = keeperWith(openStoreOf(), undefined, manual);
    await keeper.load();
    expect(keeper.snapshot().manual.status).toBe("error");
    expect(keeper.snapshot().ready).toBe(true);
    mode = "hold";
    const retry = keeper.load();
    await Promise.resolve();
    expect(keeper.snapshot().manual).toEqual({ status: "loading", rows: [], error: null });
    expect(keeper.snapshot().ready).toBe(false);
    held.resolve([carrot]);
    await retry;
    expect(keeper.snapshot().manual.status).toBe("ready");
    expect(keeper.snapshot().ready).toBe(true);
    mode = "hold";
    const again = deferred<ManualPriceRow[]>();
    manual.listManual = () => again.promise;
    const reload = keeper.load();
    await Promise.resolve();
    expect(keeper.snapshot().manual.status).toBe("ready");
    expect(keeper.snapshot().manual.rows).toEqual([carrot]);
    again.resolve([carrot, leek]);
    await reload;
  });
});
