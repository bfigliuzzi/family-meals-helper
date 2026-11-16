import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createSession, createSettingsKeeper } from "core";
import { describe, expect, it } from "vitest";
import { App } from "./App.tsx";
import { createKeychainSecretAdmin } from "./platform/keychain-secret-admin.ts";
import type { Invoke } from "./platform/tauri-error.ts";
import {
  fakeMenuModel,
  fakeSecretAdmin,
  fakeSettingsStore,
  fixedClock,
  lastWritten,
} from "./test/fakes.ts";
import menuReply from "./test/fixtures/menu-reply.json";
import { renderWithMantine } from "./test/render.tsx";

function setup(replies: string[] = []) {
  const settings = fakeSettingsStore();
  const secrets = fakeSecretAdmin();
  const keeper = createSettingsKeeper(settings.store);
  const model = fakeMenuModel(replies);
  const session = createSession({
    settings: keeper,
    clock: fixedClock,
    createModel: model.createModel,
  });
  const services = { settings: keeper, secretAdmin: secrets.admin, session };
  const { unmount } = renderWithMantine(<App services={services} />);
  return { settings, secrets, model, session, services, unmount, user: userEvent.setup() };
}

const nav = (name: string) => screen.getByRole("button", { name });
const sessionNav = () => screen.getByRole("button", { name: /^Nouvelle session/ });
const MENU = JSON.stringify(menuReply);
const FIRST_DISH = "a. Cabillaud, fondue de poireaux et riz complet";
const heading = (name: string) => screen.getByRole("heading", { name });
const addCeleri = async (user: ReturnType<typeof userEvent.setup>, term = "céleri") => {
  await user.type(screen.getByLabelText("Aliment"), term);
  await user.click(screen.getByRole("button", { name: "Ajouter" }));
};
const ready = () => screen.findByText(/Aucun aliment à éviter|Retirer/);

describe("navigation", () => {
  it("affiche « Nouvelle session » au démarrage, puis change d'écran", async () => {
    const { user } = setup();
    expect(heading("Nouvelle session")).toBeTruthy();
    expect(nav("Nouvelle session").getAttribute("aria-current")).toBe("page");
    expect(nav("Réglages").hasAttribute("aria-current")).toBe(false);

    await user.click(nav("Réglages"));
    expect(heading("Réglages")).toBeTruthy();
    expect(nav("Réglages").getAttribute("aria-current")).toBe("page");
    expect(nav("Nouvelle session").hasAttribute("aria-current")).toBe(false);

    await user.click(nav("Historique"));
    expect(screen.getByText(/Cet écran arrive dans une prochaine version\./)).toBeTruthy();
    expect(heading("Historique")).toBeTruthy();
    expect(nav("Historique").getAttribute("aria-current")).toBe("page");

    await user.click(nav("Ingrédients"));
    expect(heading("Ingrédients")).toBeTruthy();
  });
  it("« Ouvrir les réglages » affiche l'écran Réglages", async () => {
    const { user } = setup();
    await user.click(screen.getByRole("button", { name: "Ouvrir les réglages" }));
    expect(heading("Réglages")).toBeTruthy();
  });
});

describe("retour d'enregistrement", () => {
  it("« Réglages enregistrés. » après une écriture réussie : visible sur Réglages, absent ailleurs", async () => {
    const { settings, user } = setup();
    await user.click(nav("Réglages"));
    await ready();
    expect(screen.queryByText("Réglages enregistrés.")).toBeNull();
    await addCeleri(user);
    expect(await screen.findByText("Réglages enregistrés.")).toBeTruthy();
    expect(lastWritten(settings.written).exclusions).toHaveLength(1);
    await user.click(nav("Historique"));
    expect(screen.queryByText("Réglages enregistrés.")).toBeNull();
  });
  it("écriture refusée, « Réessayer » : l'alerte reste et le bouton charge, puis disparaît au succès ; un nouveau rejet la garde avec le nouveau message", async () => {
    const { settings, user } = setup();
    await user.click(nav("Réglages"));
    await ready();
    settings.state.writeMode = "fail";
    await addCeleri(user);
    expect(await screen.findByText("Échec de l'enregistrement des réglages")).toBeTruthy();
    expect(
      screen.getByText(/Les derniers changements ne sont pas encore enregistrés/),
    ).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Afficher le détail" }));
    expect(screen.getByText("Détail : disque plein")).toBeTruthy();

    settings.state.writeMode = "hold";
    await user.click(screen.getByRole("button", { name: "Réessayer" }));
    await waitFor(() => {
      expect(settings.held).toHaveLength(1);
    });
    expect(screen.getByText("Échec de l'enregistrement des réglages")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Réessayer" }).hasAttribute("data-loading")).toBe(
      true,
    );
    settings.held[0]?.resolve();
    await waitFor(() => {
      expect(screen.queryByText("Échec de l'enregistrement des réglages")).toBeNull();
    });

    // Recommencer avec un rejet.
    settings.state.writeMode = "fail";
    await addCeleri(user, "fenouil");
    expect(await screen.findByText("Échec de l'enregistrement des réglages")).toBeTruthy();
    settings.state.writeMode = "hold";
    await user.click(screen.getByRole("button", { name: "Réessayer" }));
    await waitFor(() => {
      expect(settings.held).toHaveLength(2);
    });
    settings.held[1]?.reject("verrou de la base");
    await screen.findByText(/Les derniers changements ne sont pas encore enregistrés/);
    await user.click(screen.getByRole("button", { name: "Afficher le détail" }));
    expect(screen.getByText("Détail : verrou de la base")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Réessayer" }).hasAttribute("data-loading")).toBe(
      false,
    );
  });
});

describe("alerte d'échec dans le flux de la page", () => {
  it("est dans le contenu, après l'écran actif, hors de tout Affix ; le détail est replié et défile", async () => {
    const { settings, user } = setup();
    await user.click(nav("Réglages"));
    await ready();
    settings.state.writeMode = "fail";
    const longDetail = "x".repeat(2000);
    settings.state.writeError = longDetail;
    await addCeleri(user);
    const title = await screen.findByText("Échec de l'enregistrement des réglages");
    const main = screen.getByRole("main");
    expect(main.contains(title)).toBe(true);
    expect(title.closest(".mantine-Affix-root")).toBeNull();
    const settingsTitle = heading("Réglages");
    // Après le titre et le contenu de l'écran : quand l'alerte apparaît, rien au-dessus ne bouge.
    expect(
      settingsTitle.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    const lastSection = screen.getByRole("heading", { name: "Équipement" });
    expect(
      lastSection.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    // Détail replié : absent avant le clic, présent ensuite, dans une zone qui défile.
    expect(screen.queryByText(`Détail : ${longDetail}`)).toBeNull();
    const toggle = screen.getByRole("button", { name: "Afficher le détail" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    await user.click(toggle);
    expect(
      screen.getByRole("button", { name: "Masquer le détail" }).getAttribute("aria-expanded"),
    ).toBe("true");
    const detail = screen.getByText(`Détail : ${longDetail}`);
    expect(toggle.getAttribute("aria-controls")).toBe(detail.id);
    expect(detail.closest(".mantine-ScrollArea-root")).not.toBeNull();
    await user.click(screen.getByRole("button", { name: "Masquer le détail" }));
    expect(screen.queryByText(`Détail : ${longDetail}`)).toBeNull();
  });
});

describe("aller-retour d'écran pendant une écriture", () => {
  it("réglages : le document reste en mémoire, une seule lecture, puis « Réglages enregistrés. »", async () => {
    const { settings, user } = setup();
    await user.click(nav("Réglages"));
    await ready();
    settings.state.writeMode = "hold";
    await addCeleri(user);
    await waitFor(() => {
      expect(settings.held).toHaveLength(1);
    });
    await user.click(nav("Historique"));
    await user.click(nav("Réglages"));
    expect(screen.getByText("céleri")).toBeTruthy();
    expect(settings.state.reads).toBe(1);
    expect(screen.queryByText("Réglages enregistrés.")).toBeNull();
    settings.held[0]?.resolve();
    expect(await screen.findByText("Réglages enregistrés.")).toBeTruthy();
  });
  it("échec pendant l'absence : l'alerte est visible sur Historique et au retour ; « Réessayer » écrit le changement", async () => {
    const { settings, user } = setup();
    await user.click(nav("Réglages"));
    await ready();
    settings.state.writeMode = "hold";
    await addCeleri(user);
    await waitFor(() => {
      expect(settings.held).toHaveLength(1);
    });
    await user.click(nav("Historique"));
    settings.held[0]?.reject("disque plein");
    expect(await screen.findByText("Échec de l'enregistrement des réglages")).toBeTruthy();
    await user.click(nav("Réglages"));
    expect(screen.getByText("Échec de l'enregistrement des réglages")).toBeTruthy();
    expect(screen.getByText("céleri")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Réessayer" }));
    await waitFor(() => {
      expect(settings.held).toHaveLength(2);
    });
    settings.held[1]?.resolve();
    await waitFor(() => {
      expect(screen.queryByText("Échec de l'enregistrement des réglages")).toBeNull();
    });
    expect(lastWritten(settings.written).exclusions.map((item) => item.term)).toEqual(["céleri"]);
  });
  it("échec pendant l'absence, puis une nouvelle action : l'écriture contient les deux changements", async () => {
    const { settings, user } = setup();
    await user.click(nav("Réglages"));
    await ready();
    settings.state.writeMode = "hold";
    await addCeleri(user);
    await waitFor(() => {
      expect(settings.held).toHaveLength(1);
    });
    await user.click(nav("Historique"));
    settings.held[0]?.reject("disque plein");
    await screen.findByText("Échec de l'enregistrement des réglages");
    await user.click(nav("Réglages"));
    await addCeleri(user, "fenouil");
    await waitFor(() => {
      expect(settings.held).toHaveLength(2);
    });
    settings.held[1]?.resolve();
    await waitFor(() => {
      expect(screen.queryByText("Échec de l'enregistrement des réglages")).toBeNull();
    });
    expect(lastWritten(settings.written).exclusions.map((item) => item.term)).toEqual([
      "céleri",
      "fenouil",
    ]);
  });
  it("trousseau : le test de présence du retour attend la fin du set encore en cours", async () => {
    const settings = fakeSettingsStore();
    const keeper = createSettingsKeeper(settings.store);
    const stored = { value: null as string | null };
    const commands: string[] = [];
    const heldSets: (() => void)[] = [];
    const invoke: Invoke = <T,>(command: string, args?: Record<string, unknown>) => {
      commands.push(command);
      if (command === "secret_set") {
        return new Promise<T>((resolve) => {
          heldSets.push(() => {
            stored.value = args?.value as string;
            resolve(undefined as T);
          });
        });
      }
      return Promise.resolve((stored.value !== null) as T);
    };
    const session = createSession({
      settings: keeper,
      clock: fixedClock,
      createModel: fakeMenuModel([]).createModel,
    });
    renderWithMantine(
      <App
        services={{ settings: keeper, secretAdmin: createKeychainSecretAdmin(invoke), session }}
      />,
    );
    const user = userEvent.setup();
    await user.click(nav("Réglages"));
    await screen.findByText(/Aucune clé enregistrée/);
    await user.type(screen.getByLabelText("Clé d'API"), "sk-test-factice");
    await user.click(screen.getByRole("button", { name: "Enregistrer la clé" }));
    await waitFor(() => {
      expect(heldSets).toHaveLength(1);
    });
    await user.click(nav("Historique"));
    await user.click(nav("Réglages"));
    expect(screen.getByText("Vérification du trousseau…")).toBeTruthy();
    expect(commands).toEqual(["secret_status", "secret_set"]);
    heldSets[0]?.();
    expect(await screen.findByText("Clé enregistrée")).toBeTruthy();
    expect(commands).toEqual(["secret_status", "secret_set", "secret_status"]);
    expect(document.body.textContent).not.toContain("sk-test-factice");
  });
});

describe("session pendant un changement d'écran", () => {
  async function startCompose(replies: string[]) {
    const harness = setup(replies);
    const { user, model } = harness;
    await screen.findByRole("button", { name: "Composer le menu" });
    model.state.hold = true;
    await user.type(screen.getByRole("textbox", { name: "Demande" }), "un bœuf bourguignon");
    await user.click(screen.getByRole("button", { name: "Composer le menu" }));
    await waitFor(() => {
      expect(model.calls).toHaveLength(1);
    });
    return harness;
  }

  it("quitter l'écran pendant l'appel puis revenir : le résultat s'affiche, sans second appel", async () => {
    const { user, model } = await startCompose([MENU]);
    await user.click(nav("Réglages"));
    // L'appel continue : la navigation montre un chargement, avec un nom accessible.
    expect(sessionNav().querySelector(".mantine-Loader-root")).not.toBeNull();
    expect(screen.getByRole("button", { name: /Appel en cours/ })).toBeTruthy();
    expect(sessionNav().textContent).not.toContain("Nouveau");
    model.release(0);
    await waitFor(() => {
      expect(sessionNav().textContent).toContain("Nouveau");
    });
    expect(sessionNav().querySelector(".mantine-Loader-root")).toBeNull();

    await user.click(sessionNav());
    expect(await screen.findByText(FIRST_DISH)).toBeTruthy();
    expect(sessionNav().textContent).not.toContain("Nouveau");
    expect(model.created()).toBe(1);
    expect(model.calls).toHaveLength(1);
  });

  it("revenir avant la réponse : « Vérification en cours », puis le menu, sans « Nouveau »", async () => {
    const { user, model } = await startCompose([MENU]);
    await user.click(nav("Réglages"));
    await user.click(sessionNav());
    expect(screen.getAllByRole("status")[0]?.textContent).toContain("Vérification en cours");
    model.release(0);
    expect(await screen.findByText(FIRST_DISH)).toBeTruthy();
    expect(sessionNav().textContent).not.toContain("Nouveau");
    expect(model.calls).toHaveLength(1);
  });
});

describe("la session survit à l'écran, et même à l'app rendue de nouveau", () => {
  it("démontage pendant l'appel : un nouvel <App> sur les mêmes services affiche le résultat, sans second appel", async () => {
    const { user, model, services, unmount } = setup([MENU]);
    await screen.findByRole("button", { name: "Composer le menu" });
    model.state.hold = true;
    await user.type(screen.getByRole("textbox", { name: "Demande" }), "un bœuf bourguignon");
    await user.click(screen.getByRole("button", { name: "Composer le menu" }));
    await waitFor(() => {
      expect(model.calls).toHaveLength(1);
    });
    unmount();
    expect(services.session.snapshot().pending).not.toBeNull();

    renderWithMantine(<App services={services} />);
    expect(await screen.findByText("Vérification en cours")).toBeTruthy();
    model.release(0);
    expect(await screen.findByText(FIRST_DISH)).toBeTruthy();
    expect(model.created()).toBe(1);
    expect(model.calls).toHaveLength(1);
  });

  it("aller-retour sans appel : brouillon, jour, nombre de dîners, épingle décochée, échange et menu sont gardés", async () => {
    const { user, services, unmount } = setup([MENU]);
    const request = await screen.findByRole("textbox", { name: "Demande" });
    await user.type(request, "un bœuf bourguignon");
    await user.click(screen.getByRole("button", { name: "Composer le menu" }));
    await screen.findByText(FIRST_DISH);
    await user.type(screen.getByRole("textbox", { name: "Modification" }), "brouillon en cours");
    await user.click(screen.getByRole("radio", { name: "Samedi" }));
    const dinners = screen.getByRole("textbox", { name: /Nombre de dîners/ });
    await user.clear(dinners);
    await user.type(dinners, "3");
    await user.click(screen.getByRole("checkbox", { name: `Épinglé : ${FIRST_DISH}` }));
    await user.click(nav("Réglages"));
    unmount();

    renderWithMantine(<App services={services} />);
    await user.click(nav("Réglages"));
    await user.click(sessionNav());
    expect(screen.getByRole<HTMLTextAreaElement>("textbox", { name: "Modification" }).value).toBe(
      "brouillon en cours",
    );
    expect(screen.getByRole<HTMLInputElement>("radio", { name: "Samedi" }).checked).toBe(true);
    expect(screen.getByRole<HTMLInputElement>("textbox", { name: /Nombre de dîners/ }).value).toBe(
      "3",
    );
    expect(
      screen.getByRole<HTMLInputElement>("checkbox", { name: `Épinglé : ${FIRST_DISH}` }).checked,
    ).toBe(false);
    expect(screen.getByText("un bœuf bourguignon")).toBeTruthy();
    expect(screen.getByText(FIRST_DISH)).toBeTruthy();
    const snapshot = services.session.snapshot();
    expect(snapshot.draft).toBe("brouillon en cours");
    expect(snapshot.sessionDay).toBe("sat");
    expect(snapshot.dinners).toBe(3);
    expect(snapshot.pinned).toEqual([]);
    expect(snapshot.exchanges).toHaveLength(1);
    expect(snapshot.current?.menu.dishes).toHaveLength(5);
  });
});

describe("focus quand le menu est remplacé", () => {
  it("retour sur l'écran avant la réponse, fenêtre « éviter » ouverte : le focus va au champ de l'écran monté", async () => {
    const swapped = structuredClone(menuReply);
    swapped.dishes[0]!.ingredients[0]!.name = "navet";
    const { user, model } = setup([MENU, JSON.stringify(swapped)]);
    await user.type(await screen.findByRole("textbox", { name: "Demande" }), "un menu");
    await user.click(screen.getByRole("button", { name: "Composer le menu" }));
    await screen.findByText(FIRST_DISH);

    model.state.hold = true;
    await user.type(screen.getByRole("textbox", { name: "Modification" }), "change");
    await user.click(screen.getByRole("button", { name: "Envoyer la modification" }));
    await waitFor(() => {
      expect(model.calls).toHaveLength(2);
    });
    await user.click(nav("Réglages"));
    await user.click(sessionNav());
    await user.click(screen.getByRole("button", { name: /^poireau 600 g/ }));
    await user.type(screen.getByRole("textbox", { name: "Raison (facultative)" }), "trop cher");

    model.state.hold = false;
    model.release(0);
    await screen.findByRole("button", { name: /^navet 600 g/ });
    expect(screen.queryByRole("textbox", { name: "Raison (facultative)" })).toBeNull();
    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "Modification" }));
    });
  });
});

describe("aliment ajouté par « éviter »", () => {
  it("un nom avec U+202E et U+200B s'affiche nettoyé dans Réglages, et « Retirer » retire le terme brut", async () => {
    const dirty = structuredClone(menuReply);
    dirty.dishes[0]!.ingredients[0]!.name = "poireau\u202e\u200b";
    const { user, settings } = setup([JSON.stringify(dirty)]);
    await user.type(await screen.findByRole("textbox", { name: "Demande" }), "un menu");
    await user.click(screen.getByRole("button", { name: "Composer le menu" }));
    await user.click(await screen.findByRole("button", { name: /^poireau 600 g/ }));
    await user.click(screen.getByRole("button", { name: "Éviter" }));
    await waitFor(() => {
      expect(lastWritten(settings.written).exclusions).toHaveLength(1);
    });
    expect(lastWritten(settings.written).exclusions[0]?.term).toBe("poireau\u202e\u200b");

    await user.click(nav("Réglages"));
    const row = (await screen.findByText("poireau")).closest("tr")!;
    expect(row.textContent).not.toMatch(/[\u202e\u200b]/);
    const remove = within(row).getByRole("button", { name: "Retirer poireau" });
    expect(remove.getAttribute("aria-label")).not.toMatch(/[\u202e\u200b]/);
    await user.click(remove);
    await waitFor(() => {
      expect(lastWritten(settings.written).exclusions).toEqual([]);
    });
  });
});
