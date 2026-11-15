import type { SecretAdmin, SettingsStore } from "core";

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
