import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createSettingsKeeper, defaultSettings } from "core";
import type { SettingsIssue, SettingsKeeper } from "core";
import { describe, expect, it } from "vitest";
import { fakeSecretAdmin, fakeSettingsStore, lastWritten } from "../test/fakes.ts";
import { renderWithMantine } from "../test/render.tsx";
import { SettingsScreen } from "./SettingsScreen.tsx";

function setup(
  options: {
    settings?: string | null;
    key?: string | null;
    readError?: string;
    hasError?: string;
  } = {},
) {
  const settings = fakeSettingsStore(options.settings ?? null);
  const secrets = fakeSecretAdmin(options.key ?? null);
  // Réglés avant le rendu : la lecture commence dès le montage.
  settings.state.readError = options.readError ?? null;
  secrets.state.hasError = options.hasError ?? null;
  const keeper = createSettingsKeeper(settings.store);
  renderWithMantine(<SettingsScreen settings={keeper} secretAdmin={secrets.admin} />);
  return { settings, secrets, keeper, user: userEvent.setup() };
}

const input = (label: string) => screen.getByLabelText<HTMLInputElement>(label);
const button = (name: string) => screen.getByRole("button", { name });
const ready = () => screen.findByText("Aucun aliment à éviter pour l'instant.");

// Texte des éléments qui décrivent un champ (`aria-describedby`) : là où Mantine rend son message d'erreur.
function descriptionOf(element: HTMLElement): string {
  const ids = element.getAttribute("aria-describedby")?.split(" ") ?? [];
  return ids.map((id) => document.getElementById(id)?.textContent ?? "").join(" ");
}

function documentWith(exclusions: { term: string; reason: string }[]): string {
  return JSON.stringify({ ...defaultSettings(), exclusions });
}

async function addExclusion(user: ReturnType<typeof userEvent.setup>, term: string, reason = "") {
  await user.type(input("Aliment"), term);
  if (reason !== "") await user.type(input("Raison (facultative)"), reason);
  await user.click(button("Ajouter"));
}

describe("chargement", () => {
  it("1. store vide : chargement, puis 7 appareils, aucun aliment et le modèle par défaut", async () => {
    setup();
    expect(screen.getAllByText("Chargement des réglages…").length).toBeGreaterThan(0);
    await ready();
    expect(screen.getAllByRole("checkbox")).toHaveLength(7);
    expect(input("Modèle").value).toBe("claude-sonnet-5-5");
    expect(screen.queryByText("Chargement des réglages…")).toBeNull();
  });
  it("2. store qui rejette : alerte, puis « Réessayer » affiche les réglages", async () => {
    const { settings, user } = setup({ readError: "disque absent" });
    await screen.findByText("Réglages indisponibles");
    expect(screen.getByText("Impossible d'ouvrir les réglages.")).toBeTruthy();
    expect(screen.getByText("Détail : disque absent")).toBeTruthy();
    expect(
      screen.getByText(
        "Si l'erreur revient, fermez les autres fenêtres de l'app puis réessayez, ou quittez l'app et relancez-la.",
      ),
    ).toBeTruthy();
    settings.state.readError = null;
    await user.click(button("Réessayer"));
    await ready();
    expect(screen.queryByText("Réglages indisponibles")).toBeNull();
  });
  it("3. document illisible : alerte avec le message de lecture", async () => {
    setup({ settings: "{" });
    await screen.findByText("Réglages indisponibles");
    expect(screen.getByText("Les réglages enregistrés sont illisibles.")).toBeTruthy();
    expect(screen.getByText(/^Détail : /)).toBeTruthy();
  });
  it("3 bis. réglages d'une version future : message, sans bouton « Réessayer »", async () => {
    setup({ settings: JSON.stringify({ version: 2 }) });
    await screen.findByText("Réglages indisponibles");
    expect(
      screen.getByText("Ces réglages viennent d'une version plus récente de l'app."),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Réessayer" })).toBeNull();
  });
  it("garde la clé affichable quand le document est illisible", async () => {
    setup({ settings: "{", key: "sk-secret-value" });
    await screen.findByText("Réglages indisponibles");
    await screen.findByText("Clé enregistrée");
    expect(screen.queryByLabelText("Modèle")).toBeNull();
  });
});

describe("aliments à éviter", () => {
  it("4. ajoute « céleri » avec sa raison : écriture, ligne affichée, champs vidés", async () => {
    const { settings, user } = setup();
    await ready();
    await addExclusion(user, "céleri", "n'aime pas");
    await waitFor(() => {
      expect(settings.written).toHaveLength(1);
    });
    expect(lastWritten(settings.written).exclusions).toEqual([
      { term: "céleri", reason: "n'aime pas" },
    ]);
    expect(screen.getByText("céleri")).toBeTruthy();
    expect(screen.getByText("n'aime pas")).toBeTruthy();
    expect(input("Aliment").value).toBe("");
    expect(input("Raison (facultative)").value).toBe("");
    expect(document.activeElement).toBe(input("Aliment"));
    expect(screen.queryByText("Aucun aliment à éviter pour l'instant.")).toBeNull();
  });
  it("5. un doublon et un terme vide sont refusés sous le champ, sans écriture", async () => {
    const { settings, user } = setup();
    await ready();
    await addExclusion(user, "céleri");
    await waitFor(() => {
      expect(settings.written).toHaveLength(1);
    });
    await addExclusion(user, "Céleri");
    expect(await screen.findByText("« Céleri » est déjà dans la liste.")).toBeTruthy();
    await user.clear(input("Aliment"));
    await user.click(button("Ajouter"));
    expect(await screen.findByText("Écrivez le nom d'un aliment.")).toBeTruthy();
    expect(screen.queryByText("« Céleri » est déjà dans la liste.")).toBeNull();
    expect(settings.written).toHaveLength(1);
  });
  it("6. avertit d'un terme hors référentiel, pas d'un terme connu", async () => {
    const { user } = setup();
    await ready();
    await addExclusion(user, "zzzz");
    await screen.findByText(/Inconnu du référentiel/);
    await addExclusion(user, "carotte");
    await screen.findByText("carotte");
    expect(screen.getAllByText(/Inconnu du référentiel/)).toHaveLength(1);
  });
  it("7. « Retirer » écrit un document sans le terme", async () => {
    const { settings, user } = setup();
    await ready();
    await addExclusion(user, "céleri");
    await waitFor(() => {
      expect(settings.written).toHaveLength(1);
    });
    await user.click(button("Retirer céleri"));
    await waitFor(() => {
      expect(settings.written).toHaveLength(2);
    });
    expect(lastWritten(settings.written).exclusions).toEqual([]);
    expect(screen.getByText("Aucun aliment à éviter pour l'instant.")).toBeTruthy();
  });
  it("7 bis. le 201ᵉ aliment est refusé sous « Aliment », sans écriture ; un retrait efface le message", async () => {
    const full = Array.from({ length: 200 }, (_, index) => ({
      term: `aliment${index}`,
      reason: "",
    }));
    const { settings, user } = setup({ settings: documentWith(full) });
    await screen.findByText("aliment199");
    await addExclusion(user, "fenouil");
    expect(await screen.findByText("200 aliments au plus.")).toBeTruthy();
    expect(input("Aliment").getAttribute("aria-invalid")).toBe("true");
    expect(descriptionOf(input("Aliment"))).toContain("200 aliments au plus.");
    expect(input("Aliment").value).toBe("fenouil");
    expect(settings.written).toHaveLength(0);
    expect(screen.queryByText("fenouil")).toBeNull();

    await user.click(button("Retirer aliment0"));
    await waitFor(() => {
      expect(settings.written).toHaveLength(1);
    });
    expect(screen.queryByText("200 aliments au plus.")).toBeNull();
    await user.click(button("Ajouter"));
    await waitFor(() => {
      expect(settings.written).toHaveLength(2);
    });
    expect(lastWritten(settings.written).exclusions.at(-1)).toEqual({
      term: "fenouil",
      reason: "",
    });
  });
  it("7 ter. terme vide et raison trop longue : chaque message sous son champ", async () => {
    const { settings, user } = setup();
    await ready();
    await user.type(input("Raison (facultative)"), "r".repeat(121));
    await user.click(button("Ajouter"));
    expect(descriptionOf(input("Aliment"))).toContain("Écrivez le nom d'un aliment.");
    expect(descriptionOf(input("Raison (facultative)"))).toContain("120 caractères au plus.");
    await user.type(input("Aliment"), "céleri");
    await user.click(button("Ajouter"));
    expect(input("Aliment").getAttribute("aria-invalid")).not.toBe("true");
    expect(descriptionOf(input("Raison (facultative)"))).toContain("120 caractères au plus.");
    expect(settings.written).toHaveLength(0);
  });
});

describe("équipement", () => {
  const checkbox = (name: string) => screen.getByRole<HTMLInputElement>("checkbox", { name });
  const slotsOf = (written: readonly string[], id: string) =>
    lastWritten(written).equipment.find((appliance) => appliance.id === id);

  it("8. décocher l'airfryer écrit, désactive sa capacité ; la capacité du four s'écrit à la sortie du champ", async () => {
    const { settings, user } = setup();
    await ready();
    await user.click(checkbox("Airfryer disponible"));
    await waitFor(() => {
      expect(settings.written).toHaveLength(1);
    });
    expect(slotsOf(settings.written, "airfryer")?.available).toBe(false);
    expect(input("Cuissons en même temps : Airfryer").disabled).toBe(true);
    expect(input("Cuissons en même temps : Four").disabled).toBe(false);

    const oven = input("Cuissons en même temps : Four");
    await user.clear(oven);
    await user.type(oven, "1");
    expect(settings.written).toHaveLength(1);
    await user.tab();
    await waitFor(() => {
      expect(settings.written).toHaveLength(2);
    });
    expect(slotsOf(settings.written, "oven")?.slots).toBe(1);

    // Champ vidé puis quitté : la valeur enregistrée revient, sans écriture.
    await user.clear(oven);
    await user.tab();
    expect(oven.value).toBe("1");
    expect(settings.written).toHaveLength(2);
  });
  it("8 bis. Entrée dans le champ enregistre une seule fois", async () => {
    const { settings, user } = setup();
    await ready();
    const induction = input("Cuissons en même temps : Plaque induction");
    await user.clear(induction);
    await user.type(induction, "3{Enter}");
    await waitFor(() => {
      expect(settings.written).toHaveLength(1);
    });
    expect(slotsOf(settings.written, "induction")?.slots).toBe(3);
    await user.tab();
    expect(settings.written).toHaveLength(1);
  });
  it("9. une écriture qui échoue laisse la case dans son nouvel état", async () => {
    const { settings, user } = setup();
    await ready();
    settings.state.writeMode = "fail";
    await user.click(checkbox("Cookeo disponible"));
    await waitFor(() => {
      expect(settings.written).toHaveLength(1);
    });
    expect(checkbox("Cookeo disponible").checked).toBe(false);
  });
  it("9 bis. changer une capacité puis cocher aussitôt un autre appareil : la dernière écriture contient les deux", async () => {
    const { settings, user } = setup();
    await ready();
    settings.state.writeMode = "hold";
    const oven = input("Cuissons en même temps : Four");
    await user.clear(oven);
    await user.type(oven, "1");
    // La sortie du champ lance la première écriture, que le faux store retient.
    await user.tab();
    await waitFor(() => {
      expect(settings.held).toHaveLength(1);
    });
    // Le clic tombe pendant que l'écriture est en cours : il est pris, et suivi d'une seconde écriture.
    await user.click(checkbox("Cookeo disponible"));
    expect(checkbox("Cookeo disponible").checked).toBe(false);
    expect(settings.held).toHaveLength(1);
    settings.held[0]?.resolve();
    await waitFor(() => {
      expect(settings.held).toHaveLength(2);
    });
    settings.held[1]?.resolve();
    const last = lastWritten(settings.written);
    expect(last.equipment.find((appliance) => appliance.id === "oven")?.slots).toBe(1);
    expect(last.equipment.find((appliance) => appliance.id === "cookeo")?.available).toBe(false);
  });
});

describe("modèle", () => {
  it("10. refuse un modèle au motif invalide, écrit un modèle valide", async () => {
    const { settings, user } = setup();
    await ready();
    expect(button("Enregistrer le modèle").hasAttribute("disabled")).toBe(true);
    const model = input("Modèle");
    await user.clear(model);
    await user.type(model, "claude sonnet");
    await user.click(button("Enregistrer le modèle"));
    expect(await screen.findByText(/Lettres sans accent, chiffres/)).toBeTruthy();
    expect(settings.written).toHaveLength(0);
    await user.clear(model);
    await user.type(model, "claude-opus-5-5");
    await user.click(button("Enregistrer le modèle"));
    await waitFor(() => {
      expect(settings.written).toHaveLength(1);
    });
    expect(lastWritten(settings.written).model).toBe("claude-opus-5-5");
    expect(screen.queryByText(/Lettres sans accent, chiffres/)).toBeNull();
  });
});

describe("clé d'API", () => {
  it("11. clé absente : enregistre la clé sans espaces, affiche le badge, ne la montre nulle part", async () => {
    const { secrets, user } = setup();
    await screen.findByText(
      "Aucune clé enregistrée. Sans clé, l'app ne pourra pas composer de menus.",
    );
    await user.type(input("Clé d'API"), "  sk-test-factice  ");
    await user.click(button("Enregistrer la clé"));
    expect(await screen.findByText("Clé enregistrée")).toBeTruthy();
    expect(secrets.calls.set).toEqual(["sk-test-factice"]);
    expect(screen.getByText("Clé enregistrée dans le trousseau.")).toBeTruthy();
    for (const field of document.querySelectorAll("input")) {
      expect(field.value).not.toContain("sk-test-factice");
    }
    expect(document.body.textContent).not.toContain("sk-test-factice");
  });
  it("11 bis. refuse une clé vide ou avec un espace, sans appeler le trousseau", async () => {
    const { secrets, user } = setup();
    await screen.findByText(/Aucune clé enregistrée/);
    await user.click(button("Enregistrer la clé"));
    expect(await screen.findByText("Collez la clé avant d'enregistrer.")).toBeTruthy();
    await user.type(input("Clé d'API"), "sk ab");
    await user.click(button("Enregistrer la clé"));
    expect(await screen.findByText(/sans espace/)).toBeTruthy();
    expect(secrets.calls.set).toEqual([]);
  });
  it("12. clé présente : badge, aucune lecture possible ; « Supprimer » après confirmation", async () => {
    const { secrets, user } = setup({ key: "sk-secret-value" });
    await screen.findByText("Clé enregistrée");
    // L'écran ne reçoit qu'un `SecretAdmin` : il n'a aucun moyen de lire la valeur.
    // @ts-expect-error `SecretAdmin` n'a pas de méthode `get`.
    expect(secrets.admin.get).toBeUndefined();
    expect(secrets.calls.has).toBeGreaterThan(0);
    expect(document.body.textContent).not.toContain("sk-secret-value");
    await user.click(button("Supprimer la clé"));
    expect(screen.getByText(/Supprimer la clé du trousseau \?/)).toBeTruthy();
    await user.click(button("Supprimer"));
    await screen.findByText(/Aucune clé enregistrée/);
    expect(secrets.calls.delete).toBe(1);
    expect(screen.getByText("Clé supprimée du trousseau.")).toBeTruthy();
    expect(screen.queryByText("Clé enregistrée")).toBeNull();
  });
  it("13. lecture du trousseau en échec : alerte et « Réessayer »", async () => {
    const { secrets, user } = setup({ hasError: "trousseau verrouillé" });
    await screen.findByText("Trousseau inaccessible");
    expect(screen.getByText("trousseau verrouillé")).toBeTruthy();
    secrets.state.hasError = null;
    await ready();
    await user.click(screen.getAllByRole("button", { name: "Réessayer" })[0] as HTMLElement);
    await screen.findByText(/Aucune clé enregistrée/);
    expect(screen.queryByText("Trousseau inaccessible")).toBeNull();
  });
  it("14. clé absente, écriture refusée : alerte, état « absente », saisie conservée", async () => {
    const { secrets, user } = setup();
    secrets.state.setError = "accès refusé";
    await screen.findByText(/Aucune clé enregistrée/);
    await user.type(input("Clé d'API"), "sk-test-factice");
    await user.click(button("Enregistrer la clé"));
    expect(await screen.findByText("Échec de l'enregistrement de la clé")).toBeTruthy();
    expect(screen.getByText("accès refusé")).toBeTruthy();
    expect(screen.getByText(/Aucune clé enregistrée/)).toBeTruthy();
    expect(input("Clé d'API").value).toBe("sk-test-factice");
    expect(screen.queryByText("Clé enregistrée")).toBeNull();
  });
  it("15. clé présente, remplacement refusé : alerte, badge conservé, « Annuler » referme le formulaire", async () => {
    const { secrets, user } = setup({ key: "sk-ancienne" });
    secrets.state.setError = "accès refusé";
    await screen.findByText("Clé enregistrée");
    await user.click(button("Remplacer la clé"));
    await user.type(input("Clé d'API"), "sk-nouvelle");
    await user.click(button("Enregistrer la clé"));
    expect(await screen.findByText("Échec de l'enregistrement de la clé")).toBeTruthy();
    expect(screen.getByText("Clé enregistrée")).toBeTruthy();
    await user.click(button("Annuler"));
    expect(screen.queryByLabelText("Clé d'API")).toBeNull();
    expect(screen.queryByText("Échec de l'enregistrement de la clé")).toBeNull();
    expect(screen.getByText("Clé enregistrée")).toBeTruthy();
    expect(secrets.state.value).toBe("sk-ancienne");
  });
  it("16. clé présente, suppression refusée : alerte avec le message reçu, état « présente »", async () => {
    const { secrets, user } = setup({ key: "sk-ancienne" });
    // Message que `secret_delete` rend quand l'entrée appartient à une autre version de l'app.
    // Copie du texte figé par le test Rust
    // `owner_refusal_text_is_the_one_shown_in_the_settings_test` (secrets.rs) : à modifier ensemble.
    const ownerRefusal =
      "Le trousseau refuse la suppression : la clé a été enregistrée par une autre version de l'app (par exemple celle de développement). Ouvrez l'app Trousseaux d'accès, cherchez « com.familymealshelper.desktop », supprimez cette entrée, puis enregistrez la clé ici. Détail : Couldn't access platform storage: Invalid attempt to change the owner of this item.";
    secrets.state.deleteError = ownerRefusal;
    await screen.findByText("Clé enregistrée");
    await user.click(button("Supprimer la clé"));
    await user.click(button("Supprimer"));
    expect(await screen.findByText("Échec de la suppression de la clé")).toBeTruthy();
    expect(screen.getByText(ownerRefusal)).toBeTruthy();
    expect(screen.getByText("Clé enregistrée")).toBeTruthy();
    expect(secrets.state.value).toBe("sk-ancienne");
    expect(document.body.textContent).not.toContain("sk-ancienne");
  });
});

// Règle de l'écran : tout refus d'`apply` provoqué par l'utilisateur s'affiche près de l'action, même quand son
// chemin ne vise aucun champ. Le propriétaire est enveloppé pour refuser chaque action avec un constat donné.
describe("aucun refus muet", () => {
  function setupRefusing(issues: SettingsIssue[]) {
    const settings = fakeSettingsStore(documentWith([{ term: "céleri", reason: "" }]));
    const secrets = fakeSecretAdmin(null);
    const keeper = createSettingsKeeper(settings.store);
    const refusing: SettingsKeeper = { ...keeper, apply: () => ({ ok: false, issues }) };
    renderWithMantine(<SettingsScreen settings={refusing} secretAdmin={secrets.admin} />);
    return { settings, user: userEvent.setup() };
  }
  const elsewhere = [{ path: ["version"], message: "Refus de test." }];

  it("ajout d'un aliment : message sous « Aliment »", async () => {
    const { settings, user } = setupRefusing(elsewhere);
    await screen.findByText("céleri");
    await addExclusion(user, "fenouil", "trop fort");
    expect(descriptionOf(input("Aliment"))).toContain("Refus de test.");
    expect(descriptionOf(input("Raison (facultative)"))).not.toContain("Refus de test.");
    expect(settings.written).toHaveLength(0);
  });
  it("ajout refusé sans constat (réglages pas prêts) : message sous « Aliment »", async () => {
    const { settings, user } = setupRefusing([]);
    await screen.findByText("céleri");
    await addExclusion(user, "fenouil");
    expect(descriptionOf(input("Aliment"))).toContain("Les réglages ne sont pas encore chargés");
    expect(settings.written).toHaveLength(0);
  });
  it("retrait d'un aliment : message sous « Aliment », ligne gardée", async () => {
    const { settings, user } = setupRefusing(elsewhere);
    await screen.findByText("céleri");
    await user.click(button("Retirer céleri"));
    expect(descriptionOf(input("Aliment"))).toContain("Refus de test.");
    expect(screen.getByText("céleri")).toBeTruthy();
    expect(settings.written).toHaveLength(0);
  });
  it("case d'un appareil : message sous la case, case inchangée", async () => {
    const { settings, user } = setupRefusing(elsewhere);
    await screen.findByText("céleri");
    const box = screen.getByRole<HTMLInputElement>("checkbox", { name: "Cookeo disponible" });
    await user.click(box);
    const row = box.closest("tr");
    expect(row?.textContent).toContain("Refus de test.");
    expect(
      screen.getByRole<HTMLInputElement>("checkbox", { name: "Cookeo disponible" }).checked,
    ).toBe(true);
    expect(settings.written).toHaveLength(0);
  });
  it("capacité d'un appareil : message sous le champ", async () => {
    const { settings, user } = setupRefusing(elsewhere);
    await screen.findByText("céleri");
    const oven = input("Cuissons en même temps : Four");
    await user.clear(oven);
    await user.type(oven, "1");
    await user.tab();
    expect(descriptionOf(input("Cuissons en même temps : Four"))).toContain("Refus de test.");
    expect(settings.written).toHaveLength(0);
  });
  it("modèle : message sous « Modèle »", async () => {
    const { settings, user } = setupRefusing(elsewhere);
    await screen.findByText("céleri");
    await user.type(input("Modèle"), "-bis");
    await user.click(button("Enregistrer le modèle"));
    expect(descriptionOf(input("Modèle"))).toContain("Refus de test.");
    expect(settings.written).toHaveLength(0);
  });
});

describe("autres corrections de l'écran", () => {
  it("N2. une seconde instance : réglages refusés, mais la clé s'enregistre quand même", async () => {
    const { secrets, user } = setup({
      readError:
        "Family Meals Helper est déjà ouverte dans une autre fenêtre : fermez celle-ci et utilisez l'autre.",
    });
    await screen.findByText("Réglages indisponibles");
    expect(screen.getByText("Impossible d'ouvrir les réglages.")).toBeTruthy();
    expect(screen.getByText(/Détail : Family Meals Helper est déjà ouverte/)).toBeTruthy();
    await screen.findByText(/Aucune clé enregistrée/);
    await user.type(input("Clé d'API"), "sk-test-factice");
    await user.click(button("Enregistrer la clé"));
    expect(await screen.findByText("Clé enregistrée")).toBeTruthy();
    expect(secrets.calls.set).toEqual(["sk-test-factice"]);
  });
  it("N8. le bouton « œil » a un libellé français", async () => {
    setup();
    await screen.findByText(/Aucune clé enregistrée/);
    expect(screen.getByRole("button", { name: "Afficher ou masquer la clé" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Toggle password visibility/i })).toBeNull();
  });
  it("N9. « Annuler » est désactivé pendant un appel au trousseau", async () => {
    const settings = fakeSettingsStore();
    const keeper = createSettingsKeeper(settings.store);
    const release: (() => void)[] = [];
    const secrets = fakeSecretAdmin("sk-ancienne");
    secrets.admin.set = () =>
      new Promise<void>((resolve) => {
        release.push(resolve);
      });
    secrets.admin.delete = () =>
      new Promise<void>((resolve) => {
        release.push(resolve);
      });
    renderWithMantine(<SettingsScreen settings={keeper} secretAdmin={secrets.admin} />);
    const user = userEvent.setup();
    await screen.findByText("Clé enregistrée");
    await user.click(button("Remplacer la clé"));
    await user.type(input("Clé d'API"), "sk-nouvelle");
    await user.click(button("Enregistrer la clé"));
    await waitFor(() => {
      expect(release).toHaveLength(1);
    });
    expect(button("Annuler").hasAttribute("disabled")).toBe(true);
    release[0]?.();
    await screen.findByText("Clé enregistrée dans le trousseau.");
    await user.click(button("Supprimer la clé"));
    await user.click(button("Supprimer"));
    await waitFor(() => {
      expect(release).toHaveLength(2);
    });
    expect(button("Annuler").hasAttribute("disabled")).toBe(true);
    release[1]?.();
    await screen.findByText(/Aucune clé enregistrée/);
  });
  it("N10. les appareils s'affichent dans l'ordre du code, même si le document les range autrement", async () => {
    const reordered = {
      version: 1,
      exclusions: [],
      model: "claude-sonnet-5-5",
      equipment: [
        { id: "induction", available: true, slots: 4 },
        { id: "oven", available: true, slots: 2 },
      ],
    };
    setup({ settings: JSON.stringify(reordered) });
    await ready();
    const names = screen.getAllByRole("checkbox").map((box) => box.getAttribute("aria-label"));
    expect(names[0]).toBe("Four disponible");
    expect(names[1]).toBe("Plaque induction disponible");
    expect(names).toHaveLength(7);
  });
});
