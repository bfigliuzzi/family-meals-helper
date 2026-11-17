// Validation du menu dans la session (lot 6.5b) : contrôle au clic, rédaction du détail, fiche, enregistrement.
import type { TDocumentDefinitions } from "pdfmake/interfaces.js";
import type { ZodType } from "zod";
import { describe, expect, it, vi } from "vitest";
import type { Model, ModelReply } from "../ai/model.ts";
import { DetailSchema } from "../domain/detail.ts";
import { readHistory } from "../history/history.ts";
import type { HistoryRow, HistoryStore } from "../ports/history-store.ts";
import type { SettingsStore } from "../ports/settings-store.ts";
import { asReply, balancedMenu } from "../rules/fixtures/menus.ts";
import { balancedDetail, balancedDetailLasting } from "../rules/fixtures/detail.ts";
import { createSettingsKeeper } from "../settings/settings-keeper.ts";
import { createSession, isSessionBusy } from "./session.ts";
import type { SessionDeps, SessionSnapshot, Validation } from "./session.ts";

const FIRST = "un bœuf bourguignon, un plat végétarien";
const usage = { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 };
const reply = (text: string): ModelReply => ({ text, stopReason: "end_turn", usage });
const detailText = (total?: number): string =>
  JSON.stringify(total === undefined ? balancedDetail() : balancedDetailLasting(total));
const MENU = asReply(balancedMenu());

// Un faux qui retient ses appels : `hold` puis `release()` rend la réponse prévue, `fail(error)` rejette.
function gate<T>() {
  const state = { hold: false };
  const waiting: { resolve(): void; reject(error: Error): void }[] = [];
  return {
    state,
    waiting,
    // `value` est lu au moment de la réponse (à la libération s'il est retenu) ; s'il lève, l'appel rejette.
    wrap<R>(value: () => R): Promise<Awaited<R>> {
      const settle = (): Promise<Awaited<R>> => {
        try {
          return Promise.resolve(value() as Awaited<R>);
        } catch (error) {
          return Promise.reject(error instanceof Error ? error : new Error("erreur"));
        }
      };
      if (!state.hold) return settle();
      return new Promise<Awaited<R>>((resolve, reject) => {
        waiting.push({
          resolve: () => {
            settle().then(resolve, reject);
          },
          reject,
        });
      });
    },
    release(index = 0) {
      waiting[index]!.resolve();
    },
    fail(index: number, error: Error) {
      waiting[index]!.reject(error);
    },
    _unused: undefined as T | undefined,
  };
}

const SAME_CONTENT = "Enregistrement dans l'historique impossible.";

// Faux historique qui se comporte comme le Rust sur les jetons : même contenu, même id ; autre contenu, refus.
function fakeHistory(options: { clockless?: boolean } = {}) {
  void options;
  const rows: { id: number; token: string; entry: string; pdf: Uint8Array }[] = [];
  const added: { token: string; entry: string; pdf: Uint8Array }[] = [];
  const opened: number[] = [];
  const state = {
    failAdd: [] as string[],
    failOpen: [] as string[],
    loseReply: false,
    nextId: 1,
  };
  const openGate = gate<void>();
  const store: HistoryStore = {
    add(token, entry, pdf) {
      added.push({ token, entry, pdf });
      const failure = state.failAdd.shift();
      if (failure !== undefined) return Promise.reject(new Error(failure));
      const known = rows.find((row) => row.token === token);
      if (known !== undefined) {
        const same =
          known.entry === entry &&
          known.pdf.length === pdf.length &&
          known.pdf.every((byte, at) => byte === pdf[at]);
        return same ? Promise.resolve(known.id) : Promise.reject(new Error(SAME_CONTENT));
      }
      const id = state.nextId++;
      rows.unshift({ id, token, entry, pdf });
      if (state.loseReply) {
        state.loseReply = false;
        return Promise.reject(new Error("Erreur inconnue de l'historique."));
      }
      return Promise.resolve(id);
    },
    list: () =>
      Promise.resolve(rows.map(({ id, entry }): HistoryRow => ({ id, entry, checked: "[]" }))),
    openPdf(id) {
      opened.push(id);
      // L'échec passe par la barrière : un appel retenu attend avant de rejeter.
      return openGate.wrap(() => {
        const failure = state.failOpen.shift();
        if (failure !== undefined) throw new Error(failure);
      });
    },
    exportPdf: () => Promise.reject(new Error("jamais appelé")),
    setChecked: () => Promise.reject(new Error("non utilisé")),
  };
  return { store, rows, added, opened, state, openGate };
}

interface Options {
  menuReplies?: string[];
  detailReplies?: string[];
  clock?: { now: () => Date };
  history?: ReturnType<typeof fakeHistory>;
  newToken?: () => string;
}

async function harness(options: Options = {}) {
  const store: SettingsStore = {
    read: () => Promise.resolve(null),
    write: () => Promise.resolve(),
  };
  const keeper = createSettingsKeeper(store);
  keeper.load();
  await vi.waitFor(() => {
    expect(keeper.snapshot().status).toBe("ready");
  });
  const history = options.history ?? fakeHistory();
  const menuReplies = options.menuReplies ?? [MENU];
  const detailReplies = options.detailReplies ?? [detailText()];
  const menuCalls: { system: string; user: string }[] = [];
  const detailCalls: { system: string; user: string }[] = [];
  const detailGate = gate<void>();
  const created = { menu: 0, detail: 0 };
  const createFailure: { error: Error | null } = { error: null };
  const menuModel: Model = {
    complete(prompt) {
      menuCalls.push(prompt);
      return Promise.resolve(
        reply(menuReplies[Math.min(menuCalls.length, menuReplies.length) - 1]!),
      );
    },
  };
  const detailModel: Model = {
    complete(prompt) {
      detailCalls.push(prompt);
      const text = detailReplies[Math.min(detailCalls.length, detailReplies.length) - 1]!;
      return detailGate.wrap(() => reply(text));
    },
  };
  const render = {
    calls: [] as { doc: TDocumentDefinitions; at: Date }[],
    failures: [] as string[],
    gate: gate<void>(),
  };
  let tokens = 0;
  const newToken = options.newToken ?? (() => `token-${String(++tokens)}`);
  const tokenCalls = { count: 0 };
  const deps: SessionDeps = {
    settings: keeper,
    clock: options.clock ?? { now: () => new Date(2026, 10, 16) },
    history: history.store,
    createModel: (_settings: unknown, schema: ZodType) => {
      if (schema === DetailSchema) {
        created.detail += 1;
        if (createFailure.error !== null) return Promise.reject(createFailure.error);
        return Promise.resolve(detailModel);
      }
      created.menu += 1;
      return Promise.resolve(menuModel);
    },
    renderPdf: (doc, at) => {
      render.calls.push({ doc, at });
      const failure = render.failures.shift();
      if (failure !== undefined) return Promise.reject(new Error(failure));
      return render.gate.wrap(() => new TextEncoder().encode("%PDF-1.7 exemple"));
    },
    newToken: () => {
      tokenCalls.count += 1;
      return newToken();
    },
  };
  const session = createSession(deps);
  async function showMenu(): Promise<void> {
    session.setDraft(FIRST);
    expect(await session.send()).toEqual({ ok: true });
  }
  return {
    keeper,
    session,
    history,
    menuCalls,
    detailCalls,
    detailGate,
    created,
    createFailure,
    render,
    tokenCalls,
    showMenu,
    snapshot: (): SessionSnapshot => session.snapshot(),
    validation: (): Validation | null => session.snapshot().validation,
  };
}

type Harness = Awaited<ReturnType<typeof harness>>;

function frozenDeep(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return true;
  return Object.isFrozen(value) && Object.values(value).every(frozenDeep);
}

const entryOf = (h: Harness, at = 0) =>
  readHistory(h.history.rows.map((row) => ({ ...row, checked: "[]" }))).items[at]!.entry;

describe("contrôle au clic", () => {
  it("sans menu : `no-menu`, aucun appel", async () => {
    const h = await harness();
    expect(await h.session.validate()).toEqual({ ok: false, reason: "no-menu" });
    expect(h.created.detail).toBe(0);
    expect(h.snapshot().outcomes).toBe(0);
  });

  it("aliment exclu après l'affichage : `blocked`, le constat `exclusion`, aucun modèle", async () => {
    const h = await harness();
    await h.showMenu();
    const outcomes = h.snapshot().outcomes;
    const ingredient = balancedMenu().dishes[0]!.ingredients[0]!.name;
    h.keeper.apply((settings) => ({
      ...settings,
      exclusions: [...settings.exclusions, { term: ingredient, reason: "" }],
    }));
    expect(await h.session.validate()).toEqual({ ok: false, reason: "blocked" });
    expect(h.snapshot().blocked?.some((finding) => finding.rule === "exclusion")).toBe(true);
    expect(h.snapshot().validation).toBeNull();
    expect(h.created.detail).toBe(0);
    expect(h.snapshot().outcomes).toBe(outcomes);
    // Le message suivant efface le blocage.
    h.keeper.apply((settings) => ({ ...settings, exclusions: [] }));
    h.session.setDraft("autre chose");
    await h.session.send();
    expect(h.snapshot().blocked).toBeNull();
  });

  it("nombre de dîners changé : `menu-shape` ; remis, la validation part sans appel de composition", async () => {
    const h = await harness();
    await h.showMenu();
    h.session.setDinners(3);
    expect(await h.session.validate()).toEqual({ ok: false, reason: "blocked" });
    expect(h.snapshot().blocked?.some((finding) => finding.rule === "menu-shape")).toBe(true);
    h.session.setDinners(5);
    const composeCalls = h.menuCalls.length;
    expect(await h.session.validate()).toEqual({ ok: true });
    expect(h.menuCalls).toHaveLength(composeCalls);
    expect(h.snapshot().blocked).toBeNull();
    expect(h.validation()?.step).toBe("saved");
  });

  it("jour changé sans effet bloquant : la validation passe, l'entrée porte le nouveau jour", async () => {
    const h = await harness();
    await h.showMenu();
    h.session.setSessionDay("sat");
    expect(await h.session.validate()).toEqual({ ok: true });
    expect(entryOf(h).sessionDay).toBe("sat");
  });

  it("réglages pas prêts : `settings`", async () => {
    const h = await harness();
    await h.showMenu();
    vi.spyOn(h.keeper, "snapshot").mockImplementation(() => ({ status: "loading" }) as never);
    expect(await h.session.validate()).toEqual({ ok: false, reason: "settings" });
  });
});

describe("verrou de la validation", () => {
  it("deux `validate` dans la même tâche : le second rend `busy`, un seul createModel ; le reste est ignoré", async () => {
    const h = await harness();
    await h.showMenu();
    h.detailGate.state.hold = true;
    const first = h.session.validate();
    const second = await h.session.validate();
    expect(second).toEqual({ ok: false, reason: "busy" });
    expect(h.validation()).toEqual({ step: "detail", attempt: 1 });
    expect(isSessionBusy(h.snapshot())).toBe(true);
    const during = h.snapshot();
    h.session.setDraft("x");
    h.session.setSessionDay("sat");
    h.session.setDinners(3);
    h.session.togglePin(balancedMenu().dishes[0]!.name);
    h.session.reset();
    expect(await h.session.send()).toEqual({ ok: false, reason: "busy" });
    h.session.backToMenu();
    await h.session.keepSheet();
    await h.session.retrySave();
    expect(h.snapshot()).toBe(during);
    await vi.waitFor(() => {
      expect(h.detailCalls).toHaveLength(1);
    });
    h.detailGate.release();
    expect(await first).toEqual({ ok: true });
    expect(h.created.detail).toBe(1);
  });

  it("l'étape `detail` est publiée avant le premier `await`", async () => {
    const h = await harness();
    await h.showMenu();
    h.detailGate.state.hold = true;
    const promise = h.session.validate();
    expect(h.validation()).toEqual({ step: "detail", attempt: 1 });
    expect(h.snapshot().validated).not.toBeNull();
    await vi.waitFor(() => {
      expect(h.detailCalls).toHaveLength(1);
    });
    h.detailGate.release();
    await promise;
  });

  it("réglages changés pendant le détail : l'essai 2 garde le four, l'entrée garde le jour du clic", async () => {
    const h = await harness({ detailReplies: ["pas du json", detailText()] });
    await h.showMenu();
    h.detailGate.state.hold = true;
    const promise = h.session.validate();
    await vi.waitFor(() => {
      expect(h.detailCalls).toHaveLength(1);
    });
    h.keeper.apply((settings) => ({
      ...settings,
      equipment: settings.equipment.map((item) =>
        item.id === "oven" ? { ...item, available: false } : item,
      ),
    }));
    h.detailGate.release(0);
    await vi.waitFor(() => {
      expect(h.detailCalls).toHaveLength(2);
    });
    expect(h.validation()).toEqual({ step: "detail", attempt: 2 });
    expect(h.detailCalls[1]!.system).toContain("Cuisson longue sans surveillance : four.");
    h.detailGate.release(1);
    await promise;
    expect(entryOf(h).sessionDay).toBe("sun");
  });
});

describe("parcours sans avertissement", () => {
  it("rend une fois, enregistre une fois avec un jeton, ouvre une fois, `outcomes` + 1 exactement", async () => {
    const h = await harness();
    await h.showMenu();
    const outcomes = h.snapshot().outcomes;
    expect(await h.session.validate()).toEqual({ ok: true });
    expect(h.render.calls).toHaveLength(1);
    expect(h.render.calls[0]!.at).toEqual(new Date(2026, 10, 16));
    expect(h.history.added).toHaveLength(1);
    expect(h.history.added[0]!.token).not.toBe("");
    const entry = entryOf(h);
    expect(entry.date).toBe("2026-11-16");
    expect(entry.request).toBe(FIRST);
    expect(entry.menu).toEqual(balancedMenu());
    expect(entry.sheet).toBe("detail");
    expect(h.history.opened).toEqual([1]);
    expect(h.validation()).toEqual({ step: "saved", id: 1, warning: null, openError: null });
    expect(h.snapshot().outcomes).toBe(outcomes + 1);
    expect(h.snapshot().validated).toEqual({
      menu: balancedMenu(),
      sessionDay: "sun",
      month: 11,
      date: "2026-11-16",
    });
  });

  it("snapshots gelés pendant toute la validation, sans octet ; une seule publication à la fin du détail", async () => {
    const h = await harness();
    await h.showMenu();
    const seen: SessionSnapshot[] = [];
    h.session.subscribe(() => {
      seen.push(h.snapshot());
    });
    await h.session.validate();
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every(frozenDeep)).toBe(true);
    expect(JSON.stringify(seen)).not.toContain("PDF");
    // Une seule publication a `pending` nul, `outcomes` + 1 : la fin.
    const steps = seen.map((snapshot) => snapshot.validation?.step);
    expect(steps).toEqual(["detail", "save", "saved"]);
    const outcomes = seen.map((snapshot) => snapshot.outcomes);
    expect(new Set(outcomes).size).toBe(2);
  });
});

describe("plus de 3 h", () => {
  const longReplies = [detailText(200), detailText(210), detailText(220)];

  it("trois détails différents : `decide` `too-long`, 3 essais, aucun rendu ; `keepSheet` enregistre", async () => {
    const h = await harness({ detailReplies: longReplies });
    await h.showMenu();
    const outcomes = h.snapshot().outcomes;
    await h.session.validate();
    const shown = h.validation();
    expect(shown).toMatchObject({ step: "decide", warning: "too-long", attempts: 3 });
    expect(h.detailCalls).toHaveLength(3);
    expect(h.render.calls).toHaveLength(0);
    expect(h.snapshot().outcomes).toBe(outcomes + 1);
    const calls = h.detailCalls.length;
    const created = h.created.detail;
    await h.session.keepSheet();
    expect(entryOf(h).sheet).toBe("too-long");
    expect(h.validation()).toMatchObject({ step: "saved", warning: "too-long" });
    expect(h.detailCalls).toHaveLength(calls);
    expect(h.created.detail).toBe(created);
    expect(h.snapshot().outcomes).toBe(outcomes + 2);
  });

  it("deux détails identiques : `attempts` vaut 2 (cycle arrêté)", async () => {
    const h = await harness({ detailReplies: [detailText(200)] });
    await h.showMenu();
    await h.session.validate();
    expect(h.validation()).toMatchObject({ step: "decide", warning: "too-long", attempts: 2 });
  });

  it("`backToMenu` : menu identique, brouillon pré-rempli ; un brouillon non vide est gardé", async () => {
    const h = await harness({ detailReplies: longReplies });
    await h.showMenu();
    await h.session.validate();
    const menu = h.snapshot().current;
    h.session.backToMenu();
    expect(h.snapshot().validation).toBeNull();
    expect(h.snapshot().validated).toBeNull();
    expect(h.snapshot().current).toBe(menu);
    expect(h.snapshot().draft).toMatch(
      /^Remplace le plat [a-e] \(« .+ »\) par un plat plus rapide à préparer\.$/,
    );
    // Une nouvelle validation refait rédiger le détail : la session n'a rien gardé.
    h.session.setDraft("mon texte");
    await h.session.validate();
    h.session.backToMenu();
    expect(h.snapshot().draft).toBe("mon texte");
  });
});

describe("détail inutilisable", () => {
  it("trois réponses illisibles : `decide` `fallback` ; `keepSheet` écrit les grandes phases", async () => {
    const h = await harness({ detailReplies: ["un", "deux", "trois"] });
    await h.showMenu();
    await h.session.validate();
    expect(h.validation()).toMatchObject({ step: "decide", warning: "fallback", attempts: 3 });
    await h.session.keepSheet();
    expect(JSON.stringify(h.render.calls[0]!.doc)).toContain("Grandes phases de la session");
    expect(entryOf(h).sheet).toBe("fallback");
    expect(h.validation()).toMatchObject({ step: "saved", warning: "fallback" });
  });

  it("`createModel` qui rejette : `decide` `fallback`, « Erreur inattendue », 0 essai ; la session n'est plus occupée", async () => {
    const h = await harness();
    await h.showMenu();
    h.createFailure.error = new Error("SDK introuvable");
    expect(await h.session.validate()).toEqual({ ok: true });
    expect(h.validation()).toMatchObject({
      step: "decide",
      warning: "fallback",
      attempts: 0,
      technicalError: "Erreur inattendue : SDK introuvable",
    });
    expect(isSessionBusy(h.snapshot())).toBe(false);
    await h.session.keepSheet();
    expect(h.validation()?.step).toBe("saved");
  });
});

describe("échecs locaux", () => {
  it("rendu en échec : `save-failed` ; `retrySave` refait le rendu, aucun appel au modèle de plus", async () => {
    const h = await harness();
    await h.showMenu();
    h.render.failures.push("mémoire");
    await h.session.validate();
    expect(h.validation()).toEqual({
      step: "save-failed",
      message: "Préparation de la fiche impossible : mémoire",
    });
    const calls = h.detailCalls.length;
    const created = h.created.detail;
    await h.session.retrySave();
    expect(h.render.calls).toHaveLength(2);
    expect(h.detailCalls).toHaveLength(calls);
    expect(h.created.detail).toBe(created);
    expect(h.validation()?.step).toBe("saved");
  });

  it("enregistrement en échec : `retrySave` ne refait pas le rendu, mêmes octets, même jeton", async () => {
    const h = await harness();
    await h.showMenu();
    h.history.state.failAdd.push("disque plein");
    await h.session.validate();
    expect(h.validation()).toEqual({ step: "save-failed", message: "disque plein" });
    await h.session.retrySave();
    expect(h.render.calls).toHaveLength(1);
    expect(h.history.added).toHaveLength(2);
    expect(h.history.added[1]!.token).toBe(h.history.added[0]!.token);
    expect(h.history.added[1]!.pdf).toBe(h.history.added[0]!.pdf);
    expect(h.validation()?.step).toBe("saved");
  });

  it("accusé perdu : une seule entrée, `saved` avec son id", async () => {
    const h = await harness();
    await h.showMenu();
    h.history.state.loseReply = true;
    await h.session.validate();
    expect(h.validation()?.step).toBe("save-failed");
    await h.session.retrySave();
    expect(h.history.rows).toHaveLength(1);
    expect(h.validation()).toMatchObject({ step: "saved", id: 1 });
  });

  it("double `keepSheet` et double `retrySave` dans la même tâche : un seul rendu, un seul `add`", async () => {
    const h = await harness({ detailReplies: ["un", "deux", "trois"] });
    await h.showMenu();
    await h.session.validate();
    h.render.gate.state.hold = true;
    const first = h.session.keepSheet();
    const second = h.session.keepSheet();
    await vi.waitFor(() => {
      expect(h.render.calls).toHaveLength(1);
    });
    h.render.gate.release();
    await Promise.all([first, second]);
    expect(h.render.calls).toHaveLength(1);
    expect(h.history.added).toHaveLength(1);

    const g = await harness();
    await g.showMenu();
    g.history.state.failAdd.push("x");
    await g.session.validate();
    g.render.gate.state.hold = true;
    const retryA = g.session.retrySave();
    const retryB = g.session.retrySave();
    g.render.gate.state.hold = false;
    await Promise.all([retryA, retryB]);
    expect(g.render.calls).toHaveLength(1);
    expect(g.history.added).toHaveLength(2);
  });
});

describe("Aperçu", () => {
  it("échec d'ouverture : `saved` avec `openError`, `outcomes` + 1 ; `reopen` rouvre le même id, sans `add`", async () => {
    const h = await harness();
    await h.showMenu();
    const outcomes = h.snapshot().outcomes;
    h.history.state.failOpen.push("Ouverture dans Aperçu impossible.");
    await h.session.validate();
    expect(h.validation()).toMatchObject({
      step: "saved",
      openError: "Ouverture dans Aperçu impossible.",
    });
    expect(h.snapshot().outcomes).toBe(outcomes + 1);
    await h.session.reopen();
    expect(h.history.opened).toEqual([1, 1]);
    expect(h.history.added).toHaveLength(1);
    expect(h.render.calls).toHaveLength(1);
    expect(h.validation()).toMatchObject({ step: "saved", openError: null });
    expect(h.snapshot().outcomes).toBe(outcomes + 1);
  });

  it("`reopen` retenu puis `reset` : l'appel attend, et sa réponse (un échec) ne remet rien", async () => {
    const h = await harness();
    await h.showMenu();
    await h.session.validate();
    h.history.state.failOpen.push("Ouverture dans Aperçu impossible.");
    h.history.openGate.state.hold = true;
    const promise = h.session.reopen();
    expect(h.history.openGate.waiting).toHaveLength(1);
    h.session.reset();
    h.history.openGate.release();
    await promise;
    expect(h.validation()).toBeNull();
  });

  it("`reopen` retenu, `backToMenu`, nouvelle validation retenue au détail : l'ancienne réponse ne la remplace pas", async () => {
    const h = await harness();
    await h.showMenu();
    await h.session.validate();
    h.history.state.failOpen.push("x");
    h.history.openGate.state.hold = true;
    const reopened = h.session.reopen();
    expect(h.history.openGate.waiting).toHaveLength(1);
    h.session.backToMenu();
    h.history.openGate.state.hold = false;
    h.detailGate.state.hold = true;
    const again = h.session.validate();
    expect(h.validation()).toEqual({ step: "detail", attempt: 1 });
    h.history.openGate.release();
    await reopened;
    expect(h.validation()).toEqual({ step: "detail", attempt: 1 });
    await vi.waitFor(() => {
      expect(h.detailCalls.length).toBeGreaterThan(0);
    });
    h.detailGate.release();
    await again;
  });

  it("une réouverture retenue d'une ancienne validation ne bloque pas celle de la nouvelle", async () => {
    const h = await harness();
    await h.showMenu();
    await h.session.validate();
    h.history.openGate.state.hold = true;
    const old = h.session.reopen();
    h.session.backToMenu();
    h.history.openGate.state.hold = false;
    await h.session.validate();
    expect(h.validation()?.step).toBe("saved");
    const opened = h.history.opened.length;
    await h.session.reopen();
    expect(h.history.opened).toHaveLength(opened + 1);
    h.history.openGate.release();
    await old;
  });

  it("l'ancienne réouverture échoue après que la nouvelle validation est `saved` : l'erreur ne s'affiche pas sur elle", async () => {
    const h = await harness();
    await h.showMenu();
    await h.session.validate();
    h.history.openGate.state.hold = true;
    const old = h.session.reopen();
    h.session.backToMenu();
    h.history.openGate.state.hold = false;
    await h.session.validate();
    expect(h.validation()).toMatchObject({ step: "saved", openError: null });
    h.history.state.failOpen.push("Ouverture dans Aperçu impossible.");
    h.history.openGate.release();
    await old;
    expect(h.validation()).toMatchObject({ step: "saved", openError: null });
  });

  it("l'ancienne réouverture finit pendant que celle de la nouvelle attend : un nouveau clic reste bloqué", async () => {
    const h = await harness();
    await h.showMenu();
    await h.session.validate();
    h.history.openGate.state.hold = true;
    const old = h.session.reopen();
    h.session.backToMenu();
    h.history.openGate.state.hold = false;
    await h.session.validate();
    h.history.openGate.state.hold = true;
    const current = h.session.reopen();
    const opened = h.history.opened.length;
    h.history.openGate.release(0);
    await old;
    await h.session.reopen();
    expect(h.history.opened).toHaveLength(opened);
    h.history.openGate.release(1);
    await current;
  });

  it("deux `reopen` dans la même tâche : un seul `openPdf`", async () => {
    const h = await harness();
    await h.showMenu();
    await h.session.validate();
    h.history.openGate.state.hold = true;
    const first = h.session.reopen();
    const second = h.session.reopen();
    expect(h.history.opened).toHaveLength(2); // l'ouverture automatique + une seule réouverture
    h.history.openGate.release();
    await Promise.all([first, second]);
  });
});

describe("jetons", () => {
  it("après `saved`, `backToMenu` puis une nouvelle validation : deux entrées, jetons différents", async () => {
    const h = await harness();
    await h.showMenu();
    await h.session.validate();
    h.session.backToMenu();
    await h.session.validate();
    expect(h.history.rows).toHaveLength(2);
    expect(h.history.rows[0]!.token).not.toBe(h.history.rows[1]!.token);
    expect(h.render.calls).toHaveLength(2);
  });

  it("deux propriétaires, même horloge, même historique : deux entrées, chacune son menu", async () => {
    const history = fakeHistory();
    const clock = { now: () => new Date(2026, 10, 16) };
    let sequence = 0;
    const newToken = () => `uuid-${String(++sequence)}`;
    const other = (() => {
      const menu = balancedMenu();
      menu.dishes[0]!.name = "Plat du second propriétaire";
      return asReply(menu);
    })();
    const a = await harness({ history, clock, newToken });
    await a.showMenu();
    await a.session.validate();
    const b = await harness({ history, clock, newToken, menuReplies: [other] });
    await b.showMenu();
    await b.session.validate();
    expect(b.validation()?.step).toBe("saved");
    expect(history.rows).toHaveLength(2);
    expect(history.rows[0]!.entry).not.toBe(history.rows[1]!.entry);
  });

  it("`newToken` n'est appelé qu'une fois par validation, même avec deux `retrySave`", async () => {
    const h = await harness();
    await h.showMenu();
    h.history.state.failAdd.push("un", "deux");
    await h.session.validate();
    await h.session.retrySave();
    expect(h.validation()).toEqual({ step: "save-failed", message: "deux" });
    await h.session.retrySave();
    expect(h.tokenCalls.count).toBe(1);
    expect(new Set(h.history.added.map((call) => call.token)).size).toBe(1);
    expect(h.history.added).toHaveLength(3);
  });
});
