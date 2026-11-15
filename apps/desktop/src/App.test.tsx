import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createSettingsKeeper } from "core";
import { describe, expect, it } from "vitest";
import { App } from "./App.tsx";
import { createKeychainSecretAdmin } from "./platform/keychain-secret-admin.ts";
import type { Invoke } from "./platform/tauri-error.ts";
import { fakeSecretAdmin, fakeSettingsStore, lastWritten } from "./test/fakes.ts";
import { renderWithMantine } from "./test/render.tsx";

function setup() {
  const settings = fakeSettingsStore();
  const secrets = fakeSecretAdmin();
  const keeper = createSettingsKeeper(settings.store);
  renderWithMantine(<App services={{ settings: keeper, secretAdmin: secrets.admin }} />);
  return { settings, secrets, user: userEvent.setup() };
}

const nav = (name: string) => screen.getByRole("button", { name });
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
    renderWithMantine(
      <App services={{ settings: keeper, secretAdmin: createKeychainSecretAdmin(invoke) }} />,
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
