import type { Model, SecretAdmin, Settings, SettingsStore } from "core";

export interface HeldWrite {
  document: string;
  resolve(): void;
  reject(message: string): void;
}

// Faux magasin de réglages, en mémoire. `writeMode` : « ok » (réussit), « fail » (rejette) ou « hold » (retient
// chaque écriture jusqu'à ce que le test la règle).
export function fakeSettingsStore(initial: string | null = null) {
  const state = {
    text: initial,
    readError: null as string | null,
    writeMode: "ok" as "ok" | "fail" | "hold",
    writeError: "disque plein",
    reads: 0,
  };
  const written: string[] = [];
  const held: HeldWrite[] = [];
  const store: SettingsStore = {
    read() {
      state.reads += 1;
      if (state.readError !== null) return Promise.reject(new Error(state.readError));
      return Promise.resolve(state.text);
    },
    write(document) {
      written.push(document);
      if (state.writeMode === "fail") return Promise.reject(new Error(state.writeError));
      if (state.writeMode === "ok") {
        state.text = document;
        return Promise.resolve();
      }
      return new Promise<void>((resolve, reject) => {
        held.push({
          document,
          resolve() {
            state.text = document;
            resolve();
          },
          reject(message) {
            reject(new Error(message));
          },
        });
      });
    },
  };
  return { store, state, written, held };
}

// Faux trousseau en mémoire ; chaque opération peut échouer à la demande. Comme le vrai, il n'expose aucune
// lecture de la valeur : `state.value` sert seulement aux vérifications des tests.
export function fakeSecretAdmin(initial: string | null = null) {
  const state = {
    value: initial,
    hasError: null as string | null,
    setError: null as string | null,
    deleteError: null as string | null,
  };
  const calls = { has: 0, set: [] as string[], delete: 0 };
  const admin: SecretAdmin = {
    has() {
      calls.has += 1;
      if (state.hasError !== null) return Promise.reject(new Error(state.hasError));
      return Promise.resolve(state.value !== null);
    },
    set(_key, value) {
      calls.set.push(value);
      if (state.setError !== null) return Promise.reject(new Error(state.setError));
      state.value = value;
      return Promise.resolve();
    },
    delete() {
      calls.delete += 1;
      if (state.deleteError !== null) return Promise.reject(new Error(state.deleteError));
      state.value = null;
      return Promise.resolve();
    },
  };
  return { admin, state, calls };
}

// Le dernier document écrit, relu.
export function lastWritten(written: readonly string[]): {
  model: string;
  exclusions: { term: string; reason: string }[];
  equipment: { id: string; available: boolean; slots: number }[];
} {
  const document = written.at(-1);
  if (document === undefined) throw new Error("aucune écriture");
  return JSON.parse(document) as ReturnType<typeof lastWritten>;
}

// Le 16 novembre 2026 : le mois de la fixture de menu (saison de novembre).
export const fixedClock = { now: () => new Date(2026, 10, 16) };

type Reply = Awaited<ReturnType<Model["complete"]>>;

// Faux modèle de composition. Chaque `complete` répond la réponse suivante de `replies`, la dernière se répétant.
// `stopReasons` donne, appel par appel, la raison d'arrêt (« end_turn » par défaut).
// Avec `hold = true`, chaque `complete` attend `release` ou `fail` (rang de l'appel, depuis 0).
export function fakeMenuModel(replies: string[], stopReasons: (string | null)[] = []) {
  const calls: { system: string; user: string }[] = [];
  const received: Settings[] = [];
  const waiting: { reply: Reply; resolve(reply: Reply): void; reject(error: Error): void }[] = [];
  let created = 0;
  const state = { hold: false };
  const model: Model = {
    complete(prompt) {
      calls.push(prompt);
      const text = replies[Math.min(calls.length, replies.length) - 1] ?? "";
      const reply: Reply = {
        text,
        stopReason: stopReasons[calls.length - 1] ?? "end_turn",
        usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 },
      };
      if (!state.hold) return Promise.resolve(reply);
      return new Promise<Reply>((resolve, reject) => {
        waiting.push({ reply, resolve, reject });
      });
    },
  };
  return {
    state,
    calls,
    received,
    created: () => created,
    createModel: (settings: Settings): Promise<Model> => {
      created += 1;
      received.push(settings);
      return Promise.resolve(model);
    },
    release(index: number) {
      const call = waiting[index];
      if (call === undefined) throw new Error(`aucun appel ${String(index)} en attente`);
      call.resolve(call.reply);
    },
    fail(index: number, error: Error) {
      const call = waiting[index];
      if (call === undefined) throw new Error(`aucun appel ${String(index)} en attente`);
      call.reject(error);
    },
  };
}
