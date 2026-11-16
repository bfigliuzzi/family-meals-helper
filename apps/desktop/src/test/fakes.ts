import type { HistoryRow, HistoryStore, Model, SecretAdmin, Settings, SettingsStore } from "core";

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

type HistoryCall = "add" | "list" | "open" | "export";

const SAVE_REFUSED = "Enregistrement dans l'historique impossible.";
const ENTRY_UNREADABLE = "Entrée d'historique illisible.";
const NOT_A_PDF = "Fiche refusée : ce n'est pas un PDF.";
export const PDF_GONE = "Cette fiche n'existe plus : elle a été retirée de l'historique.";

interface StoredEntry {
  id: number;
  token: string;
  entry: string;
  pdf: Uint8Array;
  checked: string;
}

// Les mêmes refus que le Rust (history.rs : `check_token`, `entry_date`, `check_pdf`).
function isRealDate(text: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (match === null) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(2000, 0, 1);
  date.setFullYear(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

function checkAdd(token: string, entry: string, pdf: Uint8Array): void {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(token)) throw new Error(SAVE_REFUSED);
  let date: unknown;
  try {
    date = (JSON.parse(entry) as { date?: unknown } | null)?.date;
  } catch {
    throw new Error(ENTRY_UNREADABLE);
  }
  if (typeof date !== "string" || !isRealDate(date)) throw new Error(ENTRY_UNREADABLE);
  const magic = [37, 80, 68, 70, 45];
  if (pdf.length < magic.length || !magic.every((byte, index) => pdf[index] === byte)) {
    throw new Error(NOT_A_PDF);
  }
}

const sameBytes = (a: Uint8Array, b: Uint8Array): boolean =>
  a.length === b.length && a.every((byte, index) => byte === b[index]);

// Faux historique en mémoire, qui se comporte comme le Rust : ajout en tête, purge à 5, un jeton déjà vu rend son id
// avec le même contenu et est refusé avec un autre. Il enregistre les appels (`added`, `opened`, `exported`).
// `failNext` fait échouer le prochain appel du genre ; `loseNextReply` enregistre le prochain `add` puis rejette
// (l'accusé IPC perdu) ; `hold` retient le prochain appel du genre jusqu'à `release()` : il répond alors ce qu'il
// aurait répondu au moment de l'appel.
export function fakeHistoryStore(initial: HistoryRow[] = []) {
  const entries: StoredEntry[] = initial.map((row) => ({
    id: row.id,
    token: `initial-${String(row.id)}`,
    entry: row.entry,
    pdf: new Uint8Array(),
    checked: row.checked,
  }));
  let nextId = Math.max(0, ...initial.map((row) => row.id)) + 1;
  const failures = new Map<HistoryCall, string>();
  const holds = new Set<HistoryCall>();
  const state = { loseReply: false };
  const added: { token: string; entry: string; pdf: Uint8Array }[] = [];
  const opened: number[] = [];
  const exported: number[] = [];
  const lists = { count: 0 };
  const exportsPerDate = new Map<string, number>();
  const pendingReleases: (() => void)[] = [];

  // Applique un échec ou une retenue demandés, puis rend le résultat calculé tout de suite.
  function respond<T>(call: HistoryCall, compute: () => T): Promise<T> {
    const message = failures.get(call);
    if (message !== undefined) {
      failures.delete(call);
      return Promise.reject(new Error(message));
    }
    let outcome: { ok: true; value: T } | { ok: false; error: Error };
    try {
      outcome = { ok: true, value: compute() };
    } catch (error) {
      outcome = { ok: false, error: error instanceof Error ? error : new Error("erreur") };
    }
    const settle = (): Promise<T> =>
      outcome.ok ? Promise.resolve(outcome.value) : Promise.reject(outcome.error);
    if (!holds.has(call)) return settle();
    holds.delete(call);
    return new Promise<T>((resolve, reject) => {
      pendingReleases.push(() => {
        settle().then(resolve, reject);
      });
    });
  }
  const rows = (): HistoryRow[] =>
    entries.map(({ id, entry, checked }) => ({ id, entry, checked }));

  const store: HistoryStore = {
    add(token, entry, pdf) {
      added.push({ token, entry, pdf });
      return respond("add", () => {
        checkAdd(token, entry, pdf);
        const known = entries.find((stored) => stored.token === token);
        if (known !== undefined) {
          if (known.entry === entry && sameBytes(known.pdf, pdf)) return known.id;
          throw new Error(SAVE_REFUSED);
        }
        const id = nextId;
        nextId += 1;
        entries.unshift({ id, token, entry, pdf, checked: "[]" });
        entries.length = Math.min(entries.length, 5);
        if (state.loseReply) {
          state.loseReply = false;
          throw new Error("Erreur inconnue de l'historique.");
        }
        return id;
      });
    },
    list() {
      lists.count += 1;
      return respond("list", rows);
    },
    openPdf(id) {
      opened.push(id);
      return respond("open", () => {
        if (!entries.some((stored) => stored.id === id)) throw new Error(PDF_GONE);
      });
    },
    exportPdf(id) {
      exported.push(id);
      return respond("export", () => {
        const stored = entries.find((candidate) => candidate.id === id);
        if (stored === undefined) throw new Error(PDF_GONE);
        const date = (JSON.parse(stored.entry) as { date?: string }).date ?? "2026-11-16";
        const count = (exportsPerDate.get(date) ?? 0) + 1;
        exportsPerDate.set(date, count);
        return `/Users/test/Downloads/menu-batch-${date}${count > 1 ? `-${String(count)}` : ""}.pdf`;
      });
    },
  };
  return {
    store,
    added,
    opened,
    exported,
    lists,
    rows,
    failNext(call: HistoryCall, message: string) {
      failures.set(call, message);
    },
    loseNextReply() {
      state.loseReply = true;
    },
    // Retient le prochain appel du genre ; chaque `release()` libère le plus ancien appel retenu.
    hold(call: HistoryCall) {
      holds.add(call);
    },
    release() {
      const next = pendingReleases.shift();
      if (next === undefined) throw new Error("aucun appel retenu");
      next();
    },
  };
}
