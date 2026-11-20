import { DetailSchema, MAX_CHECKED_BYTES } from "core";
import type {
  HistoryRow,
  HistoryStore,
  ManualPriceRow,
  Model,
  PriceStore,
  SecretAdmin,
  SessionDeps,
  Settings,
  SettingsStore,
} from "core";
import type { TDocumentDefinitions } from "pdfmake/interfaces.js";

type Schema = Parameters<SessionDeps["createModel"]>[1];

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

// Fausse table de prix en mémoire. Chaque opération peut échouer à la demande (`state.listError`, `setError`,
// `deleteError` : le message du rejet, `null` pour réussir) ; `sets` et `deletes` gardent les appels reçus. Avec
// `state.holdSet`, chaque `setManual` attend que le test le règle par `held[n].resolve()` ou `held[n].reject(message)`.
export function fakePriceStore(initial: ManualPriceRow[] = []) {
  const rows = new Map(initial.map((row) => [row.key, row]));
  const state = {
    listError: null as string | null,
    setError: null as string | null,
    deleteError: null as string | null,
    holdSet: false,
    lists: 0,
  };
  const sets: ManualPriceRow[] = [];
  const held: { resolve(): void; reject(message: string): void }[] = [];
  const deletes: string[] = [];
  const store: PriceStore = {
    listManual() {
      state.lists += 1;
      if (state.listError !== null) return Promise.reject(new Error(state.listError));
      return Promise.resolve([...rows.values()].sort((a, b) => a.key.localeCompare(b.key)));
    },
    setManual(row) {
      sets.push({ ...row });
      if (state.setError !== null) return Promise.reject(new Error(state.setError));
      if (state.holdSet) {
        return new Promise<void>((resolve, reject) => {
          held.push({
            resolve() {
              rows.set(row.key, { ...row });
              resolve();
            },
            reject(message) {
              reject(new Error(message));
            },
          });
        });
      }
      rows.set(row.key, { ...row });
      return Promise.resolve();
    },
    deleteManual(key) {
      deletes.push(key);
      if (state.deleteError !== null) return Promise.reject(new Error(state.deleteError));
      rows.delete(key);
      return Promise.resolve();
    },
  };
  return { store, state, sets, deletes, held, rows: () => [...rows.values()] };
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

// Un faux modèle à réponses : chaque `complete` répond la réponse suivante de `replies`, la dernière se répétant.
// Avec `state.hold`, chaque `complete` attend `release` ou `fail` (rang de l'appel, depuis 0).
function scriptedModel(replies: string[], stopReasons: (string | null)[] = []) {
  const calls: { system: string; user: string }[] = [];
  const waiting: { reply: Reply; resolve(reply: Reply): void; reject(error: Error): void }[] = [];
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
    model,
    calls,
    state,
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

// Faux modèles de composition (`replies`) et de détail (`detailReplies`) : `createModel` rend l'un ou l'autre selon
// le schéma demandé. `stopReasons` donne, appel par appel, la raison d'arrêt de la composition (« end_turn » par
// défaut). `state.hold`, `release` et `fail` concernent la composition ; `detail.state.hold`, `detail.release` et
// `detail.fail` le détail.
export function fakeMenuModel(
  replies: string[],
  stopReasons: (string | null)[] = [],
  detailReplies: string[] = [],
) {
  const menu = scriptedModel(replies, stopReasons);
  const detail = scriptedModel(detailReplies);
  const received: Settings[] = [];
  const created = { menu: 0, detail: 0 };
  return {
    state: menu.state,
    calls: menu.calls,
    received,
    created: () => created.menu,
    release: (index: number) => {
      menu.release(index);
    },
    fail: (index: number, error: Error) => {
      menu.fail(index, error);
    },
    detail: {
      state: detail.state,
      calls: detail.calls,
      created: () => created.detail,
      release: (index: number) => {
        detail.release(index);
      },
      fail: (index: number, error: Error) => {
        detail.fail(index, error);
      },
    },
    createModel: (settings: Settings, schema: Schema): Promise<Model> => {
      received.push(settings);
      if (schema === DetailSchema) {
        created.detail += 1;
        return Promise.resolve(detail.model);
      }
      created.menu += 1;
      return Promise.resolve(menu.model);
    },
  };
}

// Faux rendu de la fiche : `%PDF-1.7 exemple`. `calls` garde les définitions reçues ; `failNext` fait échouer le
// prochain rendu ; `hold` retient le prochain rendu jusqu'à `release()`.
export function fakeRenderPdf() {
  const calls: { doc: TDocumentDefinitions; at: Date }[] = [];
  const failures: string[] = [];
  const state = { hold: false };
  const releases: (() => void)[] = [];
  const bytes = () => new TextEncoder().encode("%PDF-1.7 exemple");
  return {
    calls,
    failNext(message: string) {
      failures.push(message);
    },
    hold() {
      state.hold = true;
    },
    release() {
      const next = releases.shift();
      if (next === undefined) throw new Error("aucun rendu retenu");
      next();
    },
    renderPdf: (doc: TDocumentDefinitions, at: Date): Promise<Uint8Array> => {
      calls.push({ doc, at });
      const failure = failures.shift();
      if (failure !== undefined) return Promise.reject(new Error(failure));
      if (!state.hold) return Promise.resolve(bytes());
      state.hold = false;
      return new Promise<Uint8Array>((resolve) => {
        releases.push(() => {
          resolve(bytes());
        });
      });
    },
  };
}

// Jetons distincts, comme `crypto.randomUUID()`.
export function fakeNewToken(): () => string {
  let count = 0;
  return () => {
    count += 1;
    return `token-${String(count)}`;
  };
}

type HistoryCall = "add" | "list" | "open" | "export" | "check";

const SAVE_REFUSED = "Enregistrement dans l'historique impossible.";
const ENTRY_UNREADABLE = "Entrée d'historique illisible.";
const NOT_A_PDF = "Fiche refusée : ce n'est pas un PDF.";
export const PDF_GONE = "Cette fiche n'existe plus : elle a été retirée de l'historique.";
// Les mêmes phrases que le Rust (history.rs) : fakes.test.ts le vérifie en lisant ce fichier.
export const CHECKS_REFUSED = "Cases cochées refusées.";
export const CHECKS_GONE =
  "Ce menu n'est plus dans l'historique : ses cases ne peuvent plus être enregistrées.";

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

// Les mêmes refus que le Rust (history.rs : `check_keys`), dans le même ordre : clé vide, doublon, octets UTF-8.
function checkKeys(checked: readonly string[]): void {
  const seen = new Set<string>();
  let total = 0;
  const encoder = new TextEncoder();
  for (const key of checked) {
    total += encoder.encode(key).length;
    if (key === "" || seen.has(key) || total > MAX_CHECKED_BYTES) throw new Error(CHECKS_REFUSED);
    seen.add(key);
  }
}

const sameBytes = (a: Uint8Array, b: Uint8Array): boolean =>
  a.length === b.length && a.every((byte, index) => byte === b[index]);

// Faux historique en mémoire, qui se comporte comme le Rust : ajout en tête, purge à 5, un jeton déjà vu rend son id
// avec le même contenu et est refusé avec un autre. Il enregistre les appels (`added`, `opened`, `exported`).
// `failNext` fait échouer le prochain appel du genre ; `loseNextReply` enregistre le prochain `add` puis rejette
// (l'accusé IPC perdu) ; `hold` retient le prochain appel du genre jusqu'à `release()` : il répond alors ce qu'il
// aurait répondu au moment de l'appel. Pour « check » (`setChecked`), tout se règle à la libération, comme dans la
// vraie vie où l'écriture a lieu quand la base répond : arguments copiés à l'appel, contrôles et écriture au
// règlement, un échec injecté ou une retenue consommés dès l'appel. `checkedCalls` garde les appels,
// `checkedWrites` les écritures faites, `checksInFlight` le nombre d'appels non réglés (`now`) et son maximum.
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
  const checkedCalls: { id: number; keys: string[] }[] = [];
  const checkedWrites: { id: number; keys: string[] }[] = [];
  const checksInFlight = { now: 0, max: 0 };

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
    setChecked(id, checked) {
      const keys = [...checked];
      checkedCalls.push({ id, keys });
      checksInFlight.now += 1;
      checksInFlight.max = Math.max(checksInFlight.max, checksInFlight.now);
      const failure = failures.get("check");
      failures.delete("check");
      const held = holds.delete("check");
      const settle = (): Promise<void> => {
        checksInFlight.now -= 1;
        try {
          if (failure !== undefined) throw new Error(failure);
          checkKeys(keys);
          const stored = entries.find((candidate) => candidate.id === id);
          if (stored === undefined) throw new Error(CHECKS_GONE);
          stored.checked = JSON.stringify(keys);
          checkedWrites.push({ id, keys });
          return Promise.resolve();
        } catch (error) {
          return Promise.reject(error instanceof Error ? error : new Error("erreur"));
        }
      };
      if (!held) return settle();
      return new Promise<void>((resolve, reject) => {
        pendingReleases.push(() => {
          settle().then(resolve, reject);
        });
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
    checkedCalls,
    checkedWrites,
    checksInFlight,
    // Simule une purge : retire l'entrée.
    remove(id: number) {
      const at = entries.findIndex((stored) => stored.id === id);
      if (at !== -1) entries.splice(at, 1);
    },
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
