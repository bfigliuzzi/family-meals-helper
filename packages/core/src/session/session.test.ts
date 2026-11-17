import { describe, expect, it, vi } from "vitest";
import type { Model, ModelReply } from "../ai/model.ts";
import type { Menu, MenuIngredient } from "../domain/menu.ts";
import { asReply, balancedMenu } from "../rules/fixtures/menus.ts";
import { serializeHistoryEntry } from "../history/history.ts";
import type { HistoryEntry } from "../history/history.ts";
import type { HistoryRow, HistoryStore } from "../ports/history-store.ts";
import type { SettingsStore } from "../ports/settings-store.ts";
import { createSettingsKeeper } from "../settings/settings-keeper.ts";
import type { Settings } from "../settings/settings.ts";
import { createSession } from "./session.ts";
import type { SendOutcome, SessionSnapshot } from "./session.ts";

const FIRST = "un bœuf bourguignon, un plat végétarien";
const SECOND = "remplace le plat c par un plat de poisson";
const THIRD = "rends le plat a plus léger";
const B = balancedMenu().dishes[1]!.name;

const usage = { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 };

function reply(text: string): ModelReply {
  return { text, stopReason: "end_turn", usage };
}

function item(name: string, qty: number): MenuIngredient {
  return { name, qty, unit: "g", form: "fresh", category: null, sameDay: false };
}

// balancedMenu() auquel on ajoute des ingrédients de plus au plat a (tomate et poivron : hors saison en novembre).
function faulty(...extra: MenuIngredient[]): string {
  const menu = balancedMenu();
  menu.dishes[0]!.ingredients.push(...extra);
  return asReply(menu);
}

const valid = (options: { requested?: readonly string[]; note?: string } = {}): string =>
  asReply(balancedMenu(), options);

function withDishes(count: number): string {
  const menu: Menu = balancedMenu();
  while (menu.dishes.length < count) menu.dishes.push(structuredClone(menu.dishes[0]!));
  menu.dishes.length = count;
  return asReply(menu);
}

const clockAt = (date: Date) => ({ now: () => date });

// Historique de lecture seule : `list` rend les lignes, le reste n'est pas utilisé avant 6.5b.
function listOnly(list: () => Promise<HistoryRow[]>): HistoryStore {
  return {
    add: () => Promise.reject(new Error("jamais appelé")),
    list,
    openPdf: () => Promise.reject(new Error("jamais appelé")),
    exportPdf: () => Promise.reject(new Error("jamais appelé")),
  };
}

// Ces tests ne valident pas : le rendu et le jeton ne servent pas (voir validate.test.ts).
const unusedValidation = {
  renderPdf: () => Promise.reject(new Error("jamais appelé")),
  newToken: () => "jamais-appele",
};

const emptyHistory = listOnly(() => Promise.resolve([]));

function pastRow(id: number, date: string, dishName: string): HistoryRow {
  const menu = balancedMenu();
  menu.dishes[0]!.name = dishName;
  const entry: HistoryEntry = {
    version: 1,
    date,
    request: "x",
    sessionDay: "sun",
    menu,
    sheet: "detail",
  };
  return { id, entry: serializeHistoryEntry(entry), checked: "[]" };
}

interface Options {
  // Avec `hold`, chaque `complete` attend `release` ou `fail`.
  hold?: boolean;
  clock?: { now: () => Date };
  createModel?: (settings: Settings) => Promise<Model>;
  history?: HistoryStore;
}

// Faux modèle : chaque `complete` répond la réponse suivante de `replies`, la dernière se répétant.
async function harness(replies: string[], options: Options = {}) {
  const store: SettingsStore = {
    read: () => Promise.resolve(null),
    write: () => Promise.resolve(),
  };
  const keeper = createSettingsKeeper(store);
  keeper.load();
  await vi.waitFor(() => {
    expect(keeper.snapshot().status).toBe("ready");
  });
  const calls: { system: string; user: string }[] = [];
  const received: Settings[] = [];
  const waiting: {
    text: string;
    resolve: (reply: ModelReply) => void;
    reject: (e: Error) => void;
  }[] = [];
  const seenAttempts: number[] = [];
  let created = 0;
  const state = {
    hold: options.hold === true,
    session: undefined as undefined | ReturnType<typeof createSession>,
  };
  const model: Model = {
    complete(prompt) {
      calls.push(prompt);
      const pending = state.session?.snapshot().pending;
      if (pending !== null && pending !== undefined) seenAttempts.push(pending.attempt);
      const text = replies[Math.min(calls.length, replies.length) - 1]!;
      if (!state.hold) return Promise.resolve(reply(text));
      return new Promise<ModelReply>((resolve, reject) => {
        waiting.push({ text, resolve, reject });
      });
    },
  };
  const session = createSession({
    settings: keeper,
    clock: options.clock ?? clockAt(new Date(2026, 10, 16)),
    history: options.history ?? emptyHistory,
    ...unusedValidation,
    createModel:
      options.createModel ??
      ((settings) => {
        created += 1;
        received.push(settings);
        return Promise.resolve(model);
      }),
  });
  state.session = session;
  return {
    keeper,
    session,
    calls,
    received,
    seenAttempts,
    created: () => created,
    state,
    release(index: number) {
      const call = waiting[index]!;
      call.resolve(reply(call.text));
    },
    fail(index: number, error: Error) {
      waiting[index]!.reject(error);
    },
    async say(text: string): Promise<SendOutcome> {
      session.setDraft(text);
      return session.send();
    },
  };
}

const snapshotOf = (h: { session: { snapshot(): SessionSnapshot } }) => h.session.snapshot();

describe("verrou", () => {
  it("deux `send` dans la même tâche : le second rend `busy`, un seul createModel, un seul complete", async () => {
    const h = await harness([valid()], { hold: true });
    h.session.setDraft(FIRST);
    const first = h.session.send();
    const second = await h.session.send();
    expect(second).toEqual({ ok: false, reason: "busy" });
    await vi.waitFor(() => {
      expect(h.calls).toHaveLength(1);
    });
    h.release(0);
    expect(await first).toEqual({ ok: true });
    expect(h.created()).toBe(1);
    expect(h.calls).toHaveLength(1);
  });

  it("`pending` est publié avant tout `await` : il est là dès le retour de `send`", async () => {
    const h = await harness([valid()], { hold: true });
    h.session.setDraft(FIRST);
    const promise = h.session.send();
    expect(snapshotOf(h).pending).toEqual({ message: FIRST, attempt: 1 });
    await vi.waitFor(() => {
      expect(h.calls).toHaveLength(1);
    });
    h.release(0);
    await promise;
  });

  it("réglages pas chargés : `settings`, aucun createModel", async () => {
    const store: SettingsStore = {
      read: () => Promise.resolve(null),
      write: () => Promise.resolve(),
    };
    let created = 0;
    const session = createSession({
      settings: createSettingsKeeper(store),
      clock: clockAt(new Date(2026, 10, 16)),
      history: emptyHistory,
      ...unusedValidation,
      createModel: () => {
        created += 1;
        return Promise.reject(new Error("jamais appelé"));
      },
    });
    session.setDraft(FIRST);
    expect(await session.send()).toEqual({ ok: false, reason: "settings" });
    expect(created).toBe(0);
    expect(session.snapshot().pending).toBeNull();
  });

  it("brouillon vide ou blanc : `empty` ; 2 001 caractères : `too-long`", async () => {
    const h = await harness([valid()]);
    expect(await h.session.send()).toEqual({ ok: false, reason: "empty" });
    expect(await h.say("  \n ")).toEqual({ ok: false, reason: "empty" });
    expect(await h.say("x".repeat(2001))).toEqual({ ok: false, reason: "too-long" });
    expect(h.created()).toBe(0);
    expect(snapshotOf(h).outcomes).toBe(0);
  });

  it("`send` ne rejette jamais : une horloge ou un createModel qui lèvent donnent `failed`, puis un `send` part", async () => {
    let broken = false;
    const clock = {
      now: () => {
        if (broken) throw new Error("horloge cassée");
        return new Date(2026, 10, 16);
      },
    };
    const h = await harness([valid()], { clock });
    broken = true;
    expect(await h.say(FIRST)).toEqual({ ok: false, reason: "failed" });
    expect(snapshotOf(h).failure?.technicalError).toBe("Erreur inattendue : horloge cassée");
    expect(snapshotOf(h).pending).toBeNull();
    broken = false;
    expect(await h.session.send()).toEqual({ ok: true });

    let failing = true;
    let created = 0;
    const fine: Model = { complete: () => Promise.resolve(reply(valid())) };
    const g = await harness([valid()], {
      createModel: () => {
        created += 1;
        return failing ? Promise.reject(new Error("SDK introuvable")) : Promise.resolve(fine);
      },
    });
    expect(await g.say(FIRST)).toEqual({ ok: false, reason: "failed" });
    expect(snapshotOf(g).failure?.technicalError).toBe("Erreur inattendue : SDK introuvable");
    expect(snapshotOf(g).failure?.stop).toBe("technical-error");
    expect(snapshotOf(g).pending).toBeNull();
    expect(snapshotOf(g).draft).toBe(FIRST);
    failing = false;
    expect(await g.session.send()).toEqual({ ok: true });
    expect(created).toBe(2);
  });

  it.each([
    [
      "un objet sans toString utilisable",
      () => JSON.parse('{"toString":null}') as unknown,
      "erreur inconnue",
    ],
    [
      "une Error dont le message lève",
      () => {
        const error = new Error("x");
        Object.defineProperty(error, "message", {
          get() {
            throw new Error("getter cassé");
          },
        });
        return error;
      },
      "erreur inconnue",
    ],
    [
      "une Error dont le message change de type entre deux lectures",
      () => {
        const error = new Error("x");
        let reads = 0;
        Object.defineProperty(error, "message", {
          get() {
            reads += 1;
            return reads === 1 ? "premier" : Symbol("second");
          },
        });
        return error;
      },
      "premier",
    ],
  ])(
    "un rejet illisible (%s) donne `failed`, libère le verrou, et un `send` suivant part",
    async (_name, make, expected) => {
      let failing = true;
      const fine: Model = { complete: () => Promise.resolve(reply(valid())) };
      const h = await harness([valid()], {
        createModel: () =>
          Promise.resolve().then(() => {
            if (failing) throw make();
            return fine;
          }),
      });
      h.session.setDraft(FIRST);
      expect(await h.session.send()).toEqual({ ok: false, reason: "failed" });
      expect(snapshotOf(h).pending).toBeNull();
      expect(snapshotOf(h).failure?.technicalError).toBe(`Erreur inattendue : ${expected}`);
      expect(snapshotOf(h).outcomes).toBe(1);
      failing = false;
      expect(await h.session.send()).toEqual({ ok: true });
    },
  );
});

describe("publications", () => {
  it("une seule publication après la dernière réponse : au premier essai, et après un troisième essai terminal", async () => {
    const h = await harness([valid()], { hold: true });
    let count = 0;
    h.session.subscribe(() => {
      count += 1;
    });
    h.session.setDraft(FIRST);
    const first = h.session.send();
    await vi.waitFor(() => {
      expect(h.calls).toHaveLength(1);
    });
    count = 0;
    h.release(0);
    await first;
    expect(count).toBe(1);
    expect(snapshotOf(h).pending).toBeNull();
    expect(snapshotOf(h).current).not.toBeNull();

    const g = await harness(
      [faulty(item("tomate", 100)), faulty(item("tomate", 200)), faulty(item("tomate", 300))],
      { hold: true },
    );
    let publications = 0;
    g.session.subscribe(() => {
      publications += 1;
    });
    g.session.setDraft(FIRST);
    const run = g.session.send();
    for (const index of [0, 1]) {
      await vi.waitFor(() => {
        expect(g.calls).toHaveLength(index + 1);
      });
      g.release(index);
    }
    await vi.waitFor(() => {
      expect(g.calls).toHaveLength(3);
    });
    publications = 0;
    g.release(2);
    await run;
    expect(publications).toBe(1);
    expect(snapshotOf(g).pending).toBeNull();
    expect(snapshotOf(g).current?.attempts).toBe(3);
  });

  it("`pending.attempt` : 1, 2 puis 3 pendant les trois `complete` ; jamais 2 pour un cycle valide au premier essai", async () => {
    const g = await harness([
      faulty(item("tomate", 100)),
      faulty(item("tomate", 200)),
      faulty(item("tomate", 300)),
    ]);
    await g.say(FIRST);
    expect(g.seenAttempts).toEqual([1, 2, 3]);

    const h = await harness([valid()]);
    const seen: number[] = [];
    h.session.subscribe(() => {
      const { pending } = h.session.snapshot();
      if (pending !== null) seen.push(pending.attempt);
    });
    await h.say(FIRST);
    expect(seen).not.toContain(2);
    expect(h.seenAttempts).toEqual([1]);
  });

  it("`current.attempts` compte les essais du cycle : un menu retenu à l'essai 1 d'un cycle de 3 essais donne 3", async () => {
    const h = await harness([
      faulty(item("tomate", 100)),
      faulty(item("tomate", 100), item("poivron", 100)),
      faulty(item("tomate", 100), item("poivron", 200)),
    ]);
    await h.say(FIRST);
    expect(snapshotOf(h).current?.attempts).toBe(3);
    const errors = snapshotOf(h).current?.check.findings.filter((f) => f.level === "error");
    expect(errors).toHaveLength(1);
  });

  it("un abonné qui lève est signalé, et les autres sont appelés", () => {
    const errors: unknown[] = [];
    const store: SettingsStore = {
      read: () => Promise.resolve(null),
      write: () => Promise.resolve(),
    };
    const session = createSession({
      settings: createSettingsKeeper(store),
      clock: clockAt(new Date(2026, 10, 16)),
      history: emptyHistory,
      ...unusedValidation,
      createModel: () => Promise.reject(new Error("inutile")),
      onListenerError: (error) => {
        errors.push(error);
      },
    });
    let called = 0;
    session.subscribe(() => {
      throw new Error("abonné en erreur");
    });
    session.subscribe(() => {
      called += 1;
    });
    session.setDraft("x");
    expect(errors).toHaveLength(1);
    expect(called).toBe(1);
  });

  it("même objet tant que rien ne change, gelé en profondeur", async () => {
    const h = await harness([valid({ requested: [B] })]);
    const before = snapshotOf(h);
    h.session.setDraft("");
    h.session.setDinners(5);
    h.session.setSessionDay("sun");
    expect(snapshotOf(h)).toBe(before);
    await h.say(FIRST);
    const after = snapshotOf(h);
    expect(Object.isFrozen(after)).toBe(true);
    expect(Object.isFrozen(after.exchanges)).toBe(true);
    expect(Object.isFrozen(after.exchanges[0])).toBe(true);
    expect(Object.isFrozen(after.current?.menu.dishes[0]?.ingredients)).toBe(true);
    expect(Object.isFrozen(after.pinned)).toBe(true);
  });
});

describe("composition et révision", () => {
  it("première demande : composeMenu avec `Nombre de dîners : 5`, un échange, le menu, les épingles du résultat, brouillon vidé", async () => {
    const h = await harness([valid({ note: "Menu de saison.", requested: [B] })]);
    expect(await h.say(FIRST)).toEqual({ ok: true });
    expect(h.calls[0]?.user).toContain(`Demande : ${FIRST}`);
    expect(h.calls[0]?.user).toContain("Nombre de dîners : 5");
    const snap = snapshotOf(h);
    expect(snap.exchanges).toEqual([{ message: FIRST, note: "Menu de saison." }]);
    expect(snap.current?.menu.dishes).toHaveLength(5);
    expect(snap.current?.month).toBe(11);
    expect(snap.current?.sessionDay).toBe("sun");
    expect(snap.current?.dinners).toBe(5);
    expect(snap.dinners).toBe(5);
    expect(snap.pinned).toEqual([B]);
    expect(snap.draft).toBe("");
    expect(snap.outcomes).toBe(1);
    expect(snap.failure).toBeNull();
  });

  it("deuxième message : reviseMenu, avec la demande d'origine ; le troisième cite le second dans la conversation", async () => {
    const h = await harness([valid()]);
    await h.say(FIRST);
    await h.say(SECOND);
    const second = h.calls[1]!.user;
    expect(second).toContain(`Demande d'origine : ${FIRST}`);
    expect(second).toContain("Menu courant");
    expect(second).toContain(`Nouveau message : ${SECOND}`);
    expect(second).not.toContain("Conversation (messages précédents)");
    await h.say(THIRD);
    const third = h.calls[2]!.user;
    expect(third).toContain("Conversation (messages précédents) :");
    expect(third).toContain(`- ${SECOND}`);
    expect(third).toContain(`Nouveau message : ${THIRD}`);
    expect(snapshotOf(h).exchanges.map((exchange) => exchange.message)).toEqual([
      FIRST,
      SECOND,
      THIRD,
    ]);
  });

  it.each([0, 6])(
    "menu de %i plats : `dinners` reste 5 et le message suivant part en révision à 5 dîners",
    async (count) => {
      const h = await harness([withDishes(count), withDishes(count), valid()]);
      await h.say(FIRST);
      const snap = snapshotOf(h);
      expect(snap.current?.menu.dishes).toHaveLength(count);
      expect(snap.current?.stop).toBe("no-progress");
      expect(snap.current?.check.findings.some((f) => f.rule === "menu-shape")).toBe(true);
      expect(snap.dinners).toBe(5);
      expect(snap.current?.dinners).toBe(5);
      expect(await h.say(SECOND)).toEqual({ ok: true });
      expect(h.calls).toHaveLength(3);
      expect(h.calls[2]?.user).toContain("Nouveau message");
      expect(h.calls[2]?.user).toContain("Nombre de dîners : 5");
    },
  );

  it("un message qui échoue n'entre pas dans la conversation ni dans le prompt suivant", async () => {
    const h = await harness([valid(), "pas du JSON 1", "{}", "[1]", valid()]);
    await h.say(FIRST);
    const refused = await h.say(SECOND);
    expect(refused).toEqual({ ok: false, reason: "failed" });
    const snap = snapshotOf(h);
    expect(snap.failure?.stop).toBe("max-attempts");
    expect(snap.failure?.revision).toBe(true);
    expect(snap.failure?.attempts).toBe(3);
    expect(snap.draft).toBe(SECOND);
    expect(snap.exchanges).toHaveLength(1);
    expect(await h.say(THIRD)).toEqual({ ok: true });
    expect(h.calls[4]?.user).toContain(`Nouveau message : ${THIRD}`);
    expect(h.calls[4]?.user).not.toContain(SECOND);
    expect(snapshotOf(h).failure).toBeNull();
  });

  it("plat épinglé retiré : un seul appel, `pinned-removed`, menu courant, épingles et brouillon inchangés", async () => {
    const renamed = balancedMenu();
    renamed.dishes[1]!.name = "Pizza maison";
    const h = await harness([valid({ requested: [B] }), asReply(renamed)]);
    await h.say(FIRST);
    const before = snapshotOf(h);
    expect(before.pinned).toEqual([B]);
    expect(await h.say(SECOND)).toEqual({ ok: false, reason: "failed" });
    expect(h.calls).toHaveLength(2);
    const after = snapshotOf(h);
    expect(after.failure?.stop).toBe("pinned-removed");
    expect(after.failure?.pinnedRemoved).toEqual([B]);
    expect(after.current).toBe(before.current);
    expect(after.pinned).toBe(before.pinned);
    expect(after.draft).toBe(SECOND);
    expect(after.exchanges).toBe(before.exchanges);
  });

  it("désépinglé puis marqué `requested` par l'IA : pas réépinglé", async () => {
    const h = await harness([valid({ requested: [B] })]);
    await h.say(FIRST);
    expect(snapshotOf(h).pinned).toEqual([B]);
    h.session.togglePin(B);
    expect(snapshotOf(h).pinned).toEqual([]);
    await h.say(SECOND);
    expect(snapshotOf(h).pinned).toEqual([]);
    expect(h.calls[1]?.user).not.toContain("Plats épinglés");
  });

  it("épinglé à la main : le prompt suivant le cite dans « Plats épinglés » ; un nom inconnu est ignoré", async () => {
    const h = await harness([valid()]);
    h.session.togglePin(B);
    expect(snapshotOf(h).pinned).toEqual([]);
    await h.say(FIRST);
    h.session.togglePin("Un plat qui n'existe pas");
    expect(snapshotOf(h).pinned).toEqual([]);
    h.session.togglePin("POULET aux carottes");
    expect(snapshotOf(h).pinned).toEqual([B]);
    await h.say(SECOND);
    expect(h.calls[1]?.user).toContain(`Plats épinglés, à garder sous ce nom : ${B}.`);
  });
});

describe("plats passés", () => {
  const rows = [
    pastRow(2, "2026-11-09", "Curry de pois chiches"),
    { id: 9, entry: "{pas du json", checked: "[]" },
    pastRow(1, "2026-11-02", "Gratin de courge"),
  ];

  it("2 entrées lisibles et 1 illisible : le prompt de la composition donne leurs plats", async () => {
    const h = await harness([valid()], { history: listOnly(() => Promise.resolve(rows)) });
    expect(await h.say(FIRST)).toEqual({ ok: true });
    const user = h.calls[0]!.user;
    expect(user).toContain("Plats des semaines passées");
    expect(user).toContain("Curry de pois chiches");
    expect(user).toContain("Gratin de courge");
    expect(user).not.toContain("pas du json");
  });

  it("la révision les donne aussi", async () => {
    const h = await harness([valid(), valid()], {
      history: listOnly(() => Promise.resolve(rows)),
    });
    await h.say(FIRST);
    await h.say(SECOND);
    expect(h.calls[1]!.user).toContain("Curry de pois chiches");
  });

  it("une lecture qui rejette : la composition part, sans cette ligne", async () => {
    const h = await harness([valid()], {
      history: listOnly(() => Promise.reject(new Error("base fermée"))),
    });
    expect(await h.say(FIRST)).toEqual({ ok: true });
    expect(h.calls[0]!.user).not.toContain("Plats des semaines passées");
  });

  it("une lecture qui lève tout de suite : la composition part aussi", async () => {
    const h = await harness([valid()], {
      history: listOnly(() => {
        throw new Error("lecture cassée");
      }),
    });
    expect(await h.say(FIRST)).toEqual({ ok: true });
    expect(h.calls[0]!.user).not.toContain("Plats des semaines passées");
  });
});

describe("entrées figées pendant l'appel", () => {
  it("brouillon, jour, dîners et épingles ignorés ; l'appel garde ses réglages ; l'opération suivante prend les nouveaux", async () => {
    const h = await harness([valid(), faulty(item("tomate", 100)), valid()]);
    await h.say(FIRST);
    h.state.hold = true;
    h.session.setDraft(SECOND);
    const run = h.session.send();
    await vi.waitFor(() => {
      expect(h.calls).toHaveLength(2);
    });
    const during = snapshotOf(h);
    h.session.setDraft("autre chose");
    h.session.setSessionDay("sat");
    h.session.setDinners(3);
    h.session.togglePin(B);
    h.session.reset();
    expect(snapshotOf(h)).toBe(during);

    h.keeper.apply((settings) => ({
      ...settings,
      model: "autre-modele",
      exclusions: [...settings.exclusions, { term: "navet", reason: "" }],
      equipment: settings.equipment.map((item) =>
        item.id === "oven" ? { ...item, available: false } : item,
      ),
    }));
    h.release(0);
    await vi.waitFor(() => {
      expect(h.calls).toHaveLength(3);
    });
    expect(h.created()).toBe(2);
    expect(h.received[1]?.model).not.toBe("autre-modele");
    expect(h.calls[2]!.system).toContain("Cuisson longue sans surveillance : four.");
    expect(h.calls[2]!.user).toContain("Nombre de dîners : 5");
    expect(h.calls[2]!.user).toContain("Session de cuisine : dimanche");
    expect(h.calls[2]!.user).toContain("Ingrédients exclus : aucun");
    h.release(1);
    await run;

    h.state.hold = false;
    await h.say(THIRD);
    expect(h.created()).toBe(3);
    expect(h.received[2]?.model).toBe("autre-modele");
    const next = h.calls[3]!;
    expect(next.system).not.toContain("Cuisson longue sans surveillance : four.");
    expect(next.user).toContain("Ingrédients exclus : navet");
  });
});

describe("champs", () => {
  it("`setDinners` ignore 0, 6 et 2,5 ; 3 passe au premier prompt", async () => {
    const h = await harness([valid()]);
    for (const value of [0, 6, 2.5]) {
      h.session.setDinners(value);
      expect(snapshotOf(h).dinners).toBe(5);
    }
    h.session.setDinners(3);
    expect(snapshotOf(h).dinners).toBe(3);
    await h.say(FIRST);
    expect(h.calls[0]?.user).toContain("Nombre de dîners : 3");
    expect(snapshotOf(h).dinners).toBe(3);
  });

  it("le mois est lu sur l'horloge au moment du clic ; le jour de session part dans le prompt", async () => {
    let date = new Date(2026, 9, 3);
    const h = await harness([valid()], { clock: { now: () => date } });
    expect(snapshotOf(h).month).toBe(10);
    date = new Date(2026, 10, 16);
    h.session.setSessionDay("sat");
    await h.say(FIRST);
    expect(h.calls[0]?.user).toContain("Mois : novembre");
    expect(h.calls[0]?.user).toContain("Session de cuisine : samedi");
    expect(snapshotOf(h).month).toBe(11);
    expect(snapshotOf(h).current?.sessionDay).toBe("sat");
  });

  it("`reset` efface la conversation, le menu et les épingles ; garde le jour, les dîners et `outcomes`", async () => {
    const h = await harness([valid({ requested: [B] })]);
    h.session.setSessionDay("fri");
    h.session.setDinners(3);
    await h.say(FIRST);
    h.session.setDraft("brouillon");
    h.session.reset();
    const snap = snapshotOf(h);
    expect(snap.exchanges).toEqual([]);
    expect(snap.current).toBeNull();
    expect(snap.pinned).toEqual([]);
    expect(snap.draft).toBe("");
    expect(snap.failure).toBeNull();
    expect(snap.sessionDay).toBe("fri");
    expect(snap.dinners).toBe(3);
    expect(snap.outcomes).toBe(1);
  });
});
