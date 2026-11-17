// Validation du menu dans l'écran Nouvelle session (lot 6.5b). `menu-reply.json` est le menu `balancedMenu()` et
// `detail-reply.json` son détail `balancedDetail()` (`packages/core/src/rules/fixtures/`), écrits une fois par un
// script jetable.
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createSession, createSettingsKeeper } from "core";
import type { SessionDeps } from "core";
import { describe, expect, it, vi } from "vitest";
import {
  fakeHistoryStore,
  fakeMenuModel,
  fakeNewToken,
  fakeRenderPdf,
  fakeSettingsStore,
  fixedClock,
} from "../test/fakes.ts";
import detailReply from "../test/fixtures/detail-reply.json";
import menuReply from "../test/fixtures/menu-reply.json";
import { renderWithMantine } from "../test/render.tsx";
import { NewSessionScreen } from "./NewSessionScreen.tsx";

const MENU = JSON.stringify(menuReply);
const DETAIL = JSON.stringify(detailReply);

// Le détail de référence avec une session de `total` minutes (la braise, étape s3, est sur le chemin le plus long).
function lasting(total: number): string {
  const copy = structuredClone(detailReply);
  const braise = copy.steps.find((step) => step.id === "s3");
  if (braise !== undefined) braise.minutes = total - 15;
  return JSON.stringify(copy);
}

interface Options {
  detailReplies?: string[];
  createModel?: SessionDeps["createModel"];
}

function setup(options: Options = {}) {
  const settings = fakeSettingsStore();
  const keeper = createSettingsKeeper(settings.store);
  const model = fakeMenuModel([MENU], [], options.detailReplies ?? [DETAIL]);
  const history = fakeHistoryStore();
  const render = fakeRenderPdf();
  const session = createSession({
    settings: keeper,
    clock: fixedClock,
    history: history.store,
    createModel: options.createModel ?? model.createModel,
    renderPdf: render.renderPdf,
    newToken: fakeNewToken(),
  });
  renderWithMantine(
    <NewSessionScreen
      session={session}
      settings={keeper}
      history={history.store}
      onOpenSettings={() => undefined}
    />,
  );
  return { keeper, model, history, render, session, user: userEvent.setup() };
}

type Setup = ReturnType<typeof setup>;

const field = () => screen.getByRole("textbox", { name: /^(Demande|Modification)/ });
const button = (name: string | RegExp) => screen.getByRole("button", { name });
const validateButton = () => button("Valider ce menu");
const active = () => document.activeElement;

// Compose le menu de la fixture, puis attend qu'il soit affiché.
async function composed(): Promise<Setup> {
  const context = setup();
  await screen.findByRole("button", { name: "Composer le menu" });
  await context.user.type(field(), "un bœuf bourguignon");
  await context.user.click(button("Composer le menu"));
  await screen.findByRole("button", { name: "Valider ce menu" });
  return context;
}

async function composedWith(options: Options): Promise<Setup> {
  const context = setup(options);
  await screen.findByRole("button", { name: "Composer le menu" });
  await context.user.type(field(), "un bœuf bourguignon");
  await context.user.click(button("Composer le menu"));
  await screen.findByRole("button", { name: "Valider ce menu" });
  return context;
}

describe("bloc de validation", () => {
  it("« Valider ce menu » sous le menu, avec le coût écrit ; désactivé pendant un appel", async () => {
    const { user, model } = setup();
    await screen.findByRole("button", { name: "Composer le menu" });
    expect(screen.queryByRole("button", { name: "Valider ce menu" })).toBeNull();
    model.state.hold = true;
    await user.type(field(), "x");
    await user.click(button("Composer le menu"));
    model.release(0);
    expect(await screen.findByRole("button", { name: "Valider ce menu" })).toBeTruthy();
    expect(
      screen.getByText(/1 à 3 appels, quelques minutes, sans annulation possible/),
    ).toBeTruthy();
    expect(validateButton().hasAttribute("disabled")).toBe(false);
    // Pendant une modification, le bouton est désactivé.
    model.state.hold = true;
    await user.type(field(), "autre chose");
    await user.click(button("Envoyer la modification"));
    await waitFor(() => {
      expect(validateButton().hasAttribute("disabled")).toBe(true);
    });
    model.release(1);
    await waitFor(() => {
      expect(validateButton().hasAttribute("disabled")).toBe(false);
    });
  });

  it("blocage : alerte avec le constat et la phrase sans appel ; « Écrire une modification » met le focus sur le champ", async () => {
    const { user, keeper, model } = await composed();
    keeper.apply((settings) => ({
      ...settings,
      exclusions: [...settings.exclusions, { term: "poireau", reason: "" }],
    }));
    await user.click(validateButton());
    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText("Validation impossible")).toBeTruthy();
    expect(within(alert).getByText(/Le menu ne passe plus le contrôle/)).toBeTruthy();
    expect(within(alert).getAllByText(/poireau/).length).toBeGreaterThan(0);
    expect(within(alert).getByText(/sans appel à Claude/)).toBeTruthy();
    expect(model.detail.created()).toBe(0);
    // L'écran reste sur le menu.
    expect(screen.getByRole("heading", { name: "Menu courant" })).toBeTruthy();
    await user.click(button("Écrire une modification"));
    expect(active()).toBe(field());
  });
});

describe("double clic", () => {
  it("un seul `createModel` du détail, avec `hold`", async () => {
    const { user, model } = await composed();
    model.detail.state.hold = true;
    await user.dblClick(validateButton());
    expect(model.detail.created()).toBe(1);
    await waitFor(() => {
      expect(model.detail.calls).toHaveLength(1);
    });
    model.detail.release(0);
    expect(await screen.findByRole("heading", { name: "Menu validé" })).toBeTruthy();
    expect(model.detail.calls).toHaveLength(1);
  });

  it("un seul `createModel`, même quand il rejette aussitôt, et une nouvelle tentative part", async () => {
    let detailCreated = 0;
    let failing = true;
    const base = fakeMenuModel([MENU], [], [DETAIL]);
    const { user } = await composedWith({
      createModel: (settings, schema) => {
        // Le détail seulement : la composition passe par le faux ordinaire.
        if (base.created() === 0) return base.createModel(settings, schema);
        detailCreated += 1;
        if (failing) return Promise.reject(new Error("SDK introuvable"));
        return base.createModel(settings, schema);
      },
    });
    await user.dblClick(validateButton());
    expect(
      await screen.findByRole("heading", { name: "Détail des étapes inutilisable" }),
    ).toBeTruthy();
    expect(detailCreated).toBe(1);
    // Nouvelle tentative après le rejet : « Revenir au menu », puis valider à nouveau.
    failing = false;
    await user.click(button("Revenir au menu"));
    await user.click(validateButton());
    expect(await screen.findByRole("heading", { name: "Menu validé" })).toBeTruthy();
    expect(detailCreated).toBe(2);
  });
});

describe("gardes du bouton « Valider ce menu »", () => {
  it("un second clic pendant que `validate` n'a pas répondu est ignoré ; après sa réponse, un clic repart", async () => {
    const { user, session } = await composed();
    let answer: (outcome: { ok: false; reason: "blocked" }) => void = () => undefined;
    const spy = vi.spyOn(session, "validate").mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          answer = resolve;
        }),
    );
    await user.click(validateButton());
    await user.click(validateButton());
    expect(spy).toHaveBeenCalledTimes(1);
    answer({ ok: false, reason: "blocked" });
    await waitFor(() => {
      expect(spy).toHaveBeenCalledTimes(1);
    });
    spy.mockResolvedValue({ ok: false, reason: "blocked" });
    await user.click(validateButton());
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("le second clic d'un double clic (`detail` 2) est ignoré", async () => {
    const { session } = await composed();
    const spy = vi.spyOn(session, "validate").mockResolvedValue({ ok: false, reason: "blocked" });
    fireEvent.click(validateButton(), { detail: 2 });
    expect(spy).not.toHaveBeenCalled();
    fireEvent.click(validateButton(), { detail: 1 });
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe("vue de validation", () => {
  it("pendant le détail : options et grille remplacées, titre, zone d'état « Essai 1 sur 3 »", async () => {
    const { user, model } = await composed();
    model.detail.state.hold = true;
    await user.click(validateButton());
    expect(await screen.findByRole("heading", { name: "Validation en cours" })).toBeTruthy();
    expect(screen.queryByRole("textbox", { name: /Nombre de dîners/ })).toBeNull();
    expect(screen.queryByRole("textbox", { name: /^(Demande|Modification)/ })).toBeNull();
    const status = screen.getAllByRole("status")[0]!;
    expect(within(status).getByText(/Essai 1 sur 3/)).toBeTruthy();
    expect(
      screen.getByText(/Session le dimanche · saison : novembre · validé le 16 novembre 2026/),
    ).toBeTruthy();
    expect(screen.getByText(/a\. Cabillaud, fondue de poireaux et riz complet — /)).toBeTruthy();
    model.detail.release(0);
    await screen.findByRole("heading", { name: "Menu validé" });
  });

  it("focus : titre « Validation en cours », puis « Préparation de la fiche », puis « Menu validé »", async () => {
    const { user, model, render } = await composedWith({
      detailReplies: [lasting(200), lasting(210), lasting(220)],
    });
    // Au clic, le premier détail est retenu : le titre « Validation en cours » a déjà le focus.
    model.detail.state.hold = true;
    await user.click(validateButton());
    const working = await screen.findByRole("heading", { name: "Validation en cours" });
    expect(active()).toBe(working);
    await waitFor(() => {
      expect(model.detail.calls).toHaveLength(1);
    });
    model.detail.state.hold = false;
    model.detail.release(0);
    // Plus de 3 h : la question est posée, le titre a le focus.
    const title = await screen.findByRole("heading", { name: "Session de plus de 3 h" });
    expect(active()).toBe(title);
    render.hold();
    await user.click(button("Garder la fiche"));
    const preparing = await screen.findByRole("heading", { name: "Préparation de la fiche" });
    expect(active()).toBe(preparing);
    render.release();
    const saved = await screen.findByRole("heading", { name: "Menu validé" });
    await waitFor(() => {
      expect(active()).toBe(saved);
    });
    expect(model.detail.calls).toHaveLength(3);
  });

  it("plus de 3 h : nombre réel d'essais, plat nommé, coûts, deux boutons égaux ; « Garder la fiche » : alertes séparées", async () => {
    const { user } = await composedWith({
      detailReplies: [lasting(200), lasting(210), lasting(220)],
    });
    await user.click(validateButton());
    await screen.findByRole("heading", { name: "Session de plus de 3 h" });
    expect(screen.getByText(/après 3 essais de Claude/)).toBeTruthy();
    expect(screen.getByText(/Le plat qui finit le plus tard est « /)).toBeTruthy();
    expect(screen.getByText(/La session détaillée dure/).style.overflowWrap).toBe("anywhere");
    expect(screen.getByText(/1 à 3 appels payés/)).toBeTruthy();
    expect(screen.getByText(/Garder la fiche : gratuit/)).toBeTruthy();
    const back = button("Revenir au menu");
    const keep = button("Garder la fiche");
    expect(back.getAttribute("data-variant")).toBe("default");
    expect(keep.getAttribute("data-variant")).toBe("default");
    await user.click(keep);
    await screen.findByRole("heading", { name: "Menu validé" });
    const green = screen.getByText(
      /Menu enregistré dans l'historique\. La fiche s'ouvre dans Aperçu/,
    );
    const yellow = screen.getByText("La fiche porte un avertissement : session de plus de 3 h.");
    expect(green.closest('[role="alert"]')).not.toBe(yellow.closest('[role="alert"]'));
  });

  it("« Revenir au menu » après plus de 3 h : menu affiché, champ pré-rempli, focus sur le champ remonté", async () => {
    const { user } = await composedWith({
      detailReplies: [lasting(200), lasting(210), lasting(220)],
    });
    await user.click(validateButton());
    await screen.findByRole("heading", { name: "Session de plus de 3 h" });
    await user.click(button("Revenir au menu"));
    expect(await screen.findByRole("heading", { name: "Menu courant" })).toBeTruthy();
    expect((field() as HTMLTextAreaElement).value).toMatch(
      /^Remplace le plat [a-e] \(« .+ »\) par un plat plus rapide à préparer\.$/,
    );
    await waitFor(() => {
      expect(active()).toBe(field());
    });
  });

  it("détail inutilisable avec erreur technique : « Raison : » et « Message reçu : » une fois, pas deux « Erreur »", async () => {
    let detailTries = 0;
    const base = fakeMenuModel([MENU], [], [DETAIL]);
    const { user } = await composedWith({
      createModel: (settings, schema) => {
        if (base.created() === 0) return base.createModel(settings, schema);
        detailTries += 1;
        return Promise.reject(new Error("SDK introuvable"));
      },
    });
    await user.click(validateButton());
    await screen.findByRole("heading", { name: "Détail des étapes inutilisable" });
    expect(detailTries).toBe(1);
    expect(screen.getAllByText(/Raison :/)).toHaveLength(1);
    expect(screen.getAllByText(/Message reçu :/)).toHaveLength(1);
    expect(screen.getByText(/Message reçu :/).textContent).toBe(
      "Message reçu : Erreur inattendue : SDK introuvable.",
    );
    expect(button("Revenir au menu").getAttribute("data-variant")).toBe("default");
    expect(button("Garder la fiche des grandes phases").getAttribute("data-variant")).toBe(
      "default",
    );
    expect(document.body.textContent.match(/Erreur/g) ?? []).toHaveLength(1);
    expect(screen.getByText(/Garder la fiche des grandes phases : gratuit/)).toBeTruthy();
  });

  it("« Message reçu » : pas de second point quand le message en a déjà un", async () => {
    const base = fakeMenuModel([MENU], [], [DETAIL]);
    const { user } = await composedWith({
      createModel: (settings, schema) => {
        if (base.created() === 0) return base.createModel(settings, schema);
        return Promise.reject(new Error("Clé refusée (401) : vérifiez-la dans Réglages."));
      },
    });
    await user.click(validateButton());
    await screen.findByRole("heading", { name: "Détail des étapes inutilisable" });
    expect(screen.getByText(/Message reçu :/).textContent).toBe(
      "Message reçu : Erreur inattendue : Clé refusée (401) : vérifiez-la dans Réglages.",
    );
  });

  it("« Message reçu » vide après nettoyage : la ligne n'est pas affichée", async () => {
    const base = fakeMenuModel([MENU], [], [DETAIL]);
    const { user } = await composedWith({
      createModel: (settings, schema) => {
        if (base.created() === 0) return base.createModel(settings, schema);
        return Promise.resolve({ complete: () => Promise.reject(new Error("\u200B")) });
      },
    });
    await user.click(validateButton());
    await screen.findByRole("heading", { name: "Détail des étapes inutilisable" });
    expect(screen.queryByText(/Message reçu/)).toBeNull();
    expect(screen.getAllByText(/Raison :/)).toHaveLength(1);
  });

  it("échec d'enregistrement : alerte et « Réessayer », qui n'appelle pas le modèle", async () => {
    const { user, model, history } = await composed();
    history.failNext("add", "Disque plein.");
    await user.click(validateButton());
    expect(await screen.findByRole("heading", { name: "Fiche non enregistrée" })).toBeTruthy();
    expect(screen.getByText("Disque plein.")).toBeTruthy();
    const calls = model.detail.calls.length;
    await user.click(button("Réessayer"));
    expect(await screen.findByRole("heading", { name: "Menu validé" })).toBeTruthy();
    expect(model.detail.calls).toHaveLength(calls);
    expect(history.added).toHaveLength(2);
  });

  it("Aperçu en échec : un seul bouton pour rouvrir, qui rouvre le même identifiant", async () => {
    const { user, history } = await composed();
    history.failNext("open", "Ouverture dans Aperçu impossible.");
    await user.click(validateButton());
    await screen.findByRole("heading", { name: "Menu validé" });
    expect(
      screen.getByText(/mais Aperçu n'a pas ouvert la fiche : Ouverture dans Aperçu impossible\./),
    ).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /^Ouvrir la fiche/ })).toHaveLength(1);
    await user.click(button(/^Ouvrir la fiche/));
    await waitFor(() => {
      expect(history.opened).toHaveLength(2);
    });
    expect(history.opened[1]).toBe(history.opened[0]);
    expect(await screen.findByText(/La fiche s'ouvre dans Aperçu/)).toBeTruthy();
  });

  it("export depuis la vue validée : message avec le nom du fichier", async () => {
    const { user } = await composed();
    await user.click(validateButton());
    await screen.findByRole("heading", { name: "Menu validé" });
    await user.click(button(/^Exporter dans Téléchargements/));
    expect(
      await screen.findByText(/Copiée dans Téléchargements : menu-batch-2026-11-16\.pdf/),
    ).toBeTruthy();
  });

  it("« Commencer une nouvelle session » : écran vide, jour et dîners gardés, focus sur le champ remonté", async () => {
    const { user } = await composed();
    await user.click(validateButton());
    await screen.findByRole("heading", { name: "Menu validé" });
    await user.click(button("Commencer une nouvelle session"));
    expect(await screen.findByRole("heading", { name: "Votre demande" })).toBeTruthy();
    expect(screen.getByText(/Le menu proposé s'affichera ici/)).toBeTruthy();
    expect(screen.getByRole<HTMLInputElement>("textbox", { name: /Nombre de dîners/ }).value).toBe(
      "5",
    );
    await waitFor(() => {
      expect(active()).toBe(field());
    });
  });

  it("« Recommencer » depuis la vue validée : texte de confirmation, puis focus sur le champ", async () => {
    const { user } = await composed();
    await user.click(validateButton());
    await screen.findByRole("heading", { name: "Menu validé" });
    await user.click(button("Recommencer"));
    expect(screen.getByText(/la validation en cours seront effacés/)).toBeTruthy();
    await user.click(button("Effacer"));
    await screen.findByRole("heading", { name: "Votre demande" });
    await waitFor(() => {
      expect(active()).toBe(field());
    });
  });
});

describe("textes injectés", () => {
  it("un nom de plat avec U+202E et U+200B est nettoyé dans le rappel et la raison", async () => {
    const menu = structuredClone(menuReply);
    menu.dishes[0]!.name = "Plat‮clair​";
    const settings = fakeSettingsStore();
    const keeper = createSettingsKeeper(settings.store);
    const model = fakeMenuModel([JSON.stringify(menu)], [], [DETAIL]);
    const history = fakeHistoryStore();
    const session = createSession({
      settings: keeper,
      clock: fixedClock,
      history: history.store,
      createModel: model.createModel,
      renderPdf: fakeRenderPdf().renderPdf,
      newToken: fakeNewToken(),
    });
    renderWithMantine(
      <NewSessionScreen
        session={session}
        settings={keeper}
        history={history.store}
        onOpenSettings={() => undefined}
      />,
    );
    const user = userEvent.setup();
    await screen.findByRole("button", { name: "Composer le menu" });
    await user.type(field(), "x");
    await user.click(button("Composer le menu"));
    await user.click(await screen.findByRole("button", { name: "Valider ce menu" }));
    await screen.findByRole("heading", { name: /Menu validé|Détail des étapes inutilisable/ });
    expect(document.body.textContent).not.toContain("‮");
    expect(document.body.textContent).not.toContain("​");
  });

  it("le « Message reçu » d'une erreur technique est nettoyé", async () => {
    const dirty = "sale\u202E\u200B";
    // Message reçu : le détail est inutilisable à cause d'une erreur technique.
    const base = fakeMenuModel([MENU], [], [DETAIL]);
    const first = await composedWith({
      createModel: (settings, schema) => {
        if (base.created() === 0) return base.createModel(settings, schema);
        return Promise.reject(new Error(dirty));
      },
    });
    await first.user.click(validateButton());
    await screen.findByRole("heading", { name: "Détail des étapes inutilisable" });
    expect(screen.getByText(/Message reçu : /).textContent).toContain("sale");
    expect(document.body.textContent).not.toContain("\u202E");
    expect(document.body.textContent).not.toContain("\u200B");
  });

  it("l'échec d'enregistrement et celui d'Aperçu sont nettoyés", async () => {
    const dirty = "sale\u202E\u200B";
    const { user, history } = await composed();
    history.failNext("add", dirty);
    await user.click(validateButton());
    await screen.findByRole("heading", { name: "Fiche non enregistrée" });
    expect(screen.getByText(/sale/).textContent).toBe("sale");
    history.failNext("open", dirty);
    await user.click(button("Réessayer"));
    await screen.findByRole("heading", { name: "Menu validé" });
    expect(screen.getByText(/Aperçu n'a pas ouvert la fiche : sale/)).toBeTruthy();
    expect(document.body.textContent).not.toContain("\u202E");
    expect(document.body.textContent).not.toContain("\u200B");
  });
});
