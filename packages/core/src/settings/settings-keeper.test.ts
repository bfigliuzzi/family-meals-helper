import { describe, expect, it } from "vitest";
import type { SettingsStore } from "../ports/settings-store.ts";
import { createSettingsKeeper } from "./settings-keeper.ts";
import type { SettingsSnapshot } from "./settings-keeper.ts";
import { defaultSettings } from "./settings.ts";
import type { Settings } from "./settings.ts";

interface HeldWrite {
  document: string;
  resolve(): void;
  reject(error: unknown): void;
}

// Faux store : chaque `write` rend une promesse qu'on règle à la main, et vérifie qu'il n'y en a jamais deux en même temps.
function fakeStore(initial: string | null = null) {
  const calls = { reads: 0 };
  const writes: HeldWrite[] = [];
  const state = { inFlight: 0, maxInFlight: 0, readError: null as unknown, text: initial };
  const store: SettingsStore = {
    read() {
      calls.reads += 1;
      // Tauri rejette avec un texte : le faux doit pouvoir faire de même.
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
      if (state.readError !== null) return Promise.reject(state.readError);
      return Promise.resolve(state.text);
    },
    write(document) {
      state.inFlight += 1;
      state.maxInFlight = Math.max(state.maxInFlight, state.inFlight);
      return new Promise<void>((resolve, reject) => {
        writes.push({
          document,
          resolve() {
            state.inFlight -= 1;
            resolve();
          },
          reject(error) {
            state.inFlight -= 1;
            // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
            reject(error);
          },
        });
      });
    },
  };
  return { store, calls, writes, state };
}

async function settle(): Promise<void> {
  for (let turn = 0; turn < 10; turn += 1) await Promise.resolve();
}

async function readyKeeper(initial: string | null = null) {
  const fake = fakeStore(initial);
  const keeper = createSettingsKeeper(fake.store);
  keeper.load();
  await settle();
  return { ...fake, keeper };
}

function readySnapshot(snapshot: SettingsSnapshot) {
  if (snapshot.status !== "ready") throw new Error(`état ${snapshot.status}`);
  return snapshot;
}

const addTerm = (term: string) => (settings: Settings) => ({
  ...settings,
  exclusions: [...settings.exclusions, { term, reason: "" }],
});

function termsOf(document: string | undefined): string[] {
  const parsed = JSON.parse(document ?? "{}") as Settings;
  return parsed.exclusions.map((exclusion) => exclusion.term);
}

describe("lecture", () => {
  it("commence à « idle », sans lire", () => {
    const { store, calls } = fakeStore();
    const keeper = createSettingsKeeper(store);
    expect(keeper.snapshot()).toEqual({ status: "idle" });
    expect(calls.reads).toBe(0);
  });
  it("lit une seule fois : un second load() pendant la lecture, ou après, ne relit pas", async () => {
    const { store, calls } = fakeStore();
    const keeper = createSettingsKeeper(store);
    keeper.load();
    expect(keeper.snapshot()).toEqual({ status: "loading" });
    keeper.load();
    expect(calls.reads).toBe(1);
    await settle();
    expect(keeper.snapshot()).toEqual({
      status: "ready",
      settings: defaultSettings(),
      save: "idle",
    });
    keeper.load();
    keeper.load();
    expect(calls.reads).toBe(1);
  });
  it("après un échec de lecture, load() relit puis passe à « ready »", async () => {
    const fake = fakeStore();
    fake.state.readError = new Error("verrou");
    const keeper = createSettingsKeeper(fake.store);
    keeper.load();
    await settle();
    expect(keeper.snapshot()).toEqual({
      status: "load-error",
      error: "Impossible d'ouvrir les réglages.",
      detail: "verrou",
      retryable: true,
    });
    fake.state.readError = null;
    keeper.load();
    await settle();
    expect(fake.calls.reads).toBe(2);
    expect(keeper.snapshot().status).toBe("ready");
  });
  it("accepte un rejet qui n'est pas une Error (message de Tauri)", async () => {
    const fake = fakeStore();
    fake.state.readError = "no such table: settings";
    const keeper = createSettingsKeeper(fake.store);
    keeper.load();
    await settle();
    expect(keeper.snapshot()).toMatchObject({
      status: "load-error",
      error: "Impossible d'ouvrir les réglages.",
      detail: "no such table: settings",
    });
  });
  it("document illisible : message de loadSettings, réessayable", async () => {
    const { keeper } = await readyKeeper("{");
    const snapshot = keeper.snapshot();
    expect(snapshot).toMatchObject({ status: "load-error", retryable: true });
    expect(snapshot.status === "load-error" && snapshot.error).toBe(
      "Les réglages enregistrés sont illisibles.",
    );
    expect(snapshot.status === "load-error" && snapshot.detail).not.toBeNull();
  });
  it("version future : non réessayable, un second load() ne lit pas et rend le même instantané", async () => {
    const { keeper, calls } = await readyKeeper(
      JSON.stringify({ ...defaultSettings(), version: 2 }),
    );
    const first = keeper.snapshot();
    expect(first).toEqual({
      status: "load-error",
      error: "Ces réglages viennent d'une version plus récente de l'app.",
      detail: null,
      retryable: false,
    });
    keeper.load();
    expect(calls.reads).toBe(1);
    expect(keeper.snapshot()).toBe(first);
  });
});

describe("apply", () => {
  it("est refusé pendant « idle » et « loading »", () => {
    const { store, writes } = fakeStore();
    const keeper = createSettingsKeeper(store);
    expect(keeper.apply(addTerm("noix"))).toEqual({ ok: false, issues: [] });
    keeper.load();
    expect(keeper.apply(addTerm("noix"))).toEqual({ ok: false, issues: [] });
    expect(writes).toHaveLength(0);
  });
  it("accepte une action : document affiché aussitôt, écriture en file", async () => {
    const { keeper, writes } = await readyKeeper();
    expect(keeper.apply(addTerm("céleri"))).toEqual({ ok: true });
    const snapshot = readySnapshot(keeper.snapshot());
    expect(snapshot.settings.exclusions).toEqual([{ term: "céleri", reason: "" }]);
    expect(snapshot.save).toBe("saving");
    await settle();
    expect(writes).toHaveLength(1);
    expect(termsOf(writes[0]?.document)).toEqual(["céleri"]);
    writes[0]?.resolve();
    await settle();
    expect(readySnapshot(keeper.snapshot()).save).toBe("saved");
  });
  it("document invalide : renvoie les issues, aucune écriture, même instantané", async () => {
    const { keeper, writes } = await readyKeeper();
    const before = keeper.snapshot();
    const copy = structuredClone(before);
    const result = keeper.apply((settings) => ({ ...settings, model: "" }));
    expect(result).toEqual({
      ok: false,
      issues: [{ path: ["model"], message: "Écrivez l'identifiant d'un modèle." }],
    });
    expect(writes).toHaveLength(0);
    expect(keeper.snapshot()).toBe(before);
    expect(keeper.snapshot()).toEqual(copy);
  });
  it("un callback qui modifie son argument lève une TypeError, le document reste intact", async () => {
    const { keeper, writes } = await readyKeeper();
    const before = keeper.snapshot();
    const copy = structuredClone(before);
    expect(() =>
      keeper.apply((settings) => {
        (settings.exclusions as { term: string; reason: string }[]).push({ term: "x", reason: "" });
        return settings;
      }),
    ).toThrow(TypeError);
    expect(() =>
      keeper.apply((settings) => {
        (settings as { model: string }).model = "autre";
        return settings;
      }),
    ).toThrow(TypeError);
    expect(keeper.snapshot()).toBe(before);
    expect(keeper.snapshot()).toEqual(copy);
    expect(writes).toHaveLength(0);
  });
  it("gèle le document en profondeur : tableaux et éléments compris", async () => {
    const { keeper } = await readyKeeper();
    keeper.apply(addTerm("noix"));
    await settle();
    const snapshot = readySnapshot(keeper.snapshot());
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.settings)).toBe(true);
    expect(Object.isFrozen(snapshot.settings.exclusions)).toBe(true);
    expect(Object.isFrozen(snapshot.settings.exclusions[0])).toBe(true);
    expect(Object.isFrozen(snapshot.settings.equipment)).toBe(true);
    expect(Object.isFrozen(snapshot.settings.equipment[0])).toBe(true);
  });
  it("gèle aussi le document lu, avant toute action", async () => {
    const { keeper } = await readyKeeper();
    const { settings } = readySnapshot(keeper.snapshot());
    expect(Object.isFrozen(settings)).toBe(true);
    expect(Object.isFrozen(settings.equipment[0])).toBe(true);
  });
});

describe("snapshot et abonnements", () => {
  it("rend le même objet entre deux changements, un nouvel objet après chaque changement", async () => {
    const { keeper, writes } = await readyKeeper();
    const first = keeper.snapshot();
    expect(keeper.snapshot()).toBe(first);
    keeper.apply(addTerm("noix"));
    await settle();
    const second = keeper.snapshot();
    expect(second).not.toBe(first);
    expect(keeper.snapshot()).toBe(second);
    writes[0]?.resolve();
    await settle();
    expect(keeper.snapshot()).not.toBe(second);
  });
  it("prévient les abonnés à chaque changement, et plus après le désabonnement", async () => {
    const { store } = fakeStore();
    const keeper = createSettingsKeeper(store);
    let count = 0;
    const unsubscribe = keeper.subscribe(() => {
      count += 1;
    });
    keeper.load();
    await settle();
    expect(count).toBe(2);
    unsubscribe();
    keeper.apply(addTerm("noix"));
    await settle();
    expect(count).toBe(2);
  });
});

describe("écritures", () => {
  it("A échoue pendant que B, C, D sont appliquées : la dernière écriture contient tout, jamais deux écritures à la fois", async () => {
    const { keeper, writes, state } = await readyKeeper();
    keeper.apply(addTerm("a"));
    await settle();
    expect(writes).toHaveLength(1);
    keeper.apply(addTerm("b"));
    await settle();
    keeper.apply(addTerm("c"));
    await settle();
    keeper.apply(addTerm("d"));
    await settle();
    // Tant que A n'est pas réglée, aucune autre écriture ne démarre.
    expect(writes).toHaveLength(1);
    writes[0]?.reject(new Error("disque plein"));
    await settle();
    expect(writes).toHaveLength(2);
    expect(termsOf(writes[1]?.document)).toEqual(["a", "b", "c", "d"]);
    // L'état ne devient pas « échec » : d'autres écritures suivent.
    expect(readySnapshot(keeper.snapshot()).save).toBe("saving");
    writes[1]?.resolve();
    await settle();
    expect(writes).toHaveLength(3);
    expect(termsOf(writes[2]?.document)).toEqual(["a", "b", "c", "d"]);
    writes[2]?.resolve();
    await settle();
    expect(writes).toHaveLength(4);
    writes[3]?.resolve();
    await settle();
    expect(readySnapshot(keeper.snapshot()).save).toBe("saved");
    expect(state.maxInFlight).toBe(1);
  });
  it("dernière écriture en échec : { failed, retrying: false }, le document garde le changement", async () => {
    const { keeper, writes } = await readyKeeper();
    keeper.apply(addTerm("noix"));
    await settle();
    writes[0]?.reject(new Error("disque plein"));
    await settle();
    const snapshot = readySnapshot(keeper.snapshot());
    expect(snapshot.save).toEqual({ failed: "disque plein", retrying: false });
    expect(snapshot.settings.exclusions).toEqual([{ term: "noix", reason: "" }]);
  });
  it("retrySave() : { failed, retrying: true } tant que l'écriture est retenue, puis « saved » avec le changement", async () => {
    const { keeper, writes, calls } = await readyKeeper();
    keeper.apply(addTerm("noix"));
    await settle();
    writes[0]?.reject(new Error("disque plein"));
    await settle();
    keeper.retrySave();
    await settle();
    expect(readySnapshot(keeper.snapshot()).save).toEqual({
      failed: "disque plein",
      retrying: true,
    });
    expect(writes).toHaveLength(2);
    writes[1]?.resolve();
    await settle();
    expect(readySnapshot(keeper.snapshot()).save).toBe("saved");
    expect(termsOf(writes[1]?.document)).toEqual(["noix"]);
    expect(calls.reads).toBe(1);
  });
  it("un réessai qui échoue donne { failed: nouveau message, retrying: false }", async () => {
    const { keeper, writes } = await readyKeeper();
    keeper.apply(addTerm("noix"));
    await settle();
    writes[0]?.reject(new Error("premier"));
    await settle();
    keeper.retrySave();
    await settle();
    writes[1]?.reject(new Error("second"));
    await settle();
    expect(readySnapshot(keeper.snapshot()).save).toEqual({ failed: "second", retrying: false });
  });
  it("une nouvelle action pendant l'échec garde l'alerte, puis écrit tout et la fait disparaître", async () => {
    const { keeper, writes } = await readyKeeper();
    keeper.apply(addTerm("céleri"));
    await settle();
    writes[0]?.reject(new Error("disque plein"));
    await settle();
    keeper.apply(addTerm("fenouil"));
    await settle();
    expect(readySnapshot(keeper.snapshot()).save).toEqual({
      failed: "disque plein",
      retrying: true,
    });
    writes[1]?.resolve();
    await settle();
    expect(termsOf(writes[1]?.document)).toEqual(["céleri", "fenouil"]);
    expect(readySnapshot(keeper.snapshot()).save).toBe("saved");
  });
  it("un rejet qui n'est pas une Error garde son texte", async () => {
    const { keeper, writes } = await readyKeeper();
    keeper.apply(addTerm("noix"));
    await settle();
    writes[0]?.reject("database is locked");
    await settle();
    expect(readySnapshot(keeper.snapshot()).save).toEqual({
      failed: "database is locked",
      retrying: false,
    });
  });
});

describe("abonné qui lève une erreur", () => {
  it("n'empêche pas l'écriture suivante : l'état final est « saved »", async () => {
    const { keeper, writes } = await readyKeeper();
    let first = true;
    keeper.subscribe(() => {
      if (first) {
        first = false;
        throw new Error("abonné défaillant");
      }
    });
    const seen: string[] = [];
    keeper.subscribe(() => {
      seen.push(keeper.snapshot().status);
    });
    expect(keeper.apply(addTerm("noix"))).toEqual({ ok: true });
    await settle();
    expect(writes).toHaveLength(1);
    writes[0]?.resolve();
    await settle();
    expect(readySnapshot(keeper.snapshot()).save).toBe("saved");
    // L'autre abonné a bien été prévenu, malgré le premier.
    expect(seen.length).toBeGreaterThanOrEqual(2);
    // Une écriture ultérieure passe aussi.
    keeper.apply(addTerm("fenouil"));
    await settle();
    expect(writes).toHaveLength(2);
    writes[1]?.resolve();
    await settle();
    expect(readySnapshot(keeper.snapshot()).save).toBe("saved");
  });
  it("pendant la lecture : l'état atteint « ready »", async () => {
    const { store } = fakeStore();
    const keeper = createSettingsKeeper(store);
    keeper.subscribe(() => {
      throw new Error("abonné défaillant");
    });
    keeper.load();
    await settle();
    expect(keeper.snapshot().status).toBe("ready");
  });
});
