// La fixture `menu-reply.json` est la réponse de l'IA `asReply(balancedMenu(), { note, requested: [premier plat] })`
// de `packages/core/src/rules/fixtures/menus.ts` (menu de 5 plats, novembre, session le dimanche), écrite une fois
// par un script jetable.
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MenuReplySchema, createSession, createSettingsKeeper } from "core";
import type { Model, Settings } from "core";
import { StrictMode } from "react";
import { describe, expect, it, vi } from "vitest";
import { createAppModel } from "../platform/ai-model.ts";
import {
  fakeHistoryStore,
  fakeMenuModel,
  fakeSettingsStore,
  fixedClock,
  lastWritten,
} from "../test/fakes.ts";
import menuReply from "../test/fixtures/menu-reply.json";
import { renderWithMantine } from "../test/render.tsx";
import { NewSessionScreen } from "./NewSessionScreen.tsx";

const MENU = JSON.stringify(menuReply);
const FIRST_DISH = "a. Cabillaud, fondue de poireaux et riz complet";
const NOTE = "Menu de saison, sans poisson frais.";

function menuWith(change: (reply: typeof menuReply) => void): string {
  const copy = structuredClone(menuReply);
  change(copy);
  return JSON.stringify(copy);
}

interface Options {
  readError?: string;
  createModel?: (settings: Settings) => Promise<Model>;
  stopReasons?: (string | null)[];
  strict?: boolean;
}

function setup(replies: string[], options: Options = {}) {
  const settings = fakeSettingsStore();
  if (options.readError !== undefined) settings.state.readError = options.readError;
  const keeper = createSettingsKeeper(settings.store);
  const model = fakeMenuModel(replies, options.stopReasons);
  const session = createSession({
    settings: keeper,
    clock: fixedClock,
    history: fakeHistoryStore().store,
    createModel: options.createModel ?? model.createModel,
  });
  const onOpenSettings = vi.fn();
  const screenElement = (
    <NewSessionScreen session={session} settings={keeper} onOpenSettings={onOpenSettings} />
  );
  renderWithMantine(
    options.strict === true ? <StrictMode>{screenElement}</StrictMode> : screenElement,
  );
  return { settings, keeper, model, session, onOpenSettings, user: userEvent.setup() };
}

type User = ReturnType<typeof userEvent.setup>;

const SEND = /^(Composer le menu|Envoyer la modification)$/;
const field = () => screen.getByRole("textbox", { name: /^(Demande|Modification)/ });
const sendButton = () => screen.getByRole("button", { name: SEND });
const ready = () => screen.findByRole("button", { name: SEND });

async function type(user: User, text: string) {
  await user.type(field(), text);
}

// Écrit le message et clique sur le bouton d'envoi, puis attend que l'appel soit fini.
async function say(user: User, text: string) {
  await type(user, text);
  await user.click(sendButton());
  await waitFor(() => {
    expect(sendButton().hasAttribute("data-loading")).toBe(false);
  });
}

describe("fixture", () => {
  it("la réponse de menu-reply.json donne un menu en un essai", async () => {
    const { user, model } = setup([MENU]);
    await ready();
    await say(user, "un bœuf bourguignon");
    expect(model.calls).toHaveLength(1);
    expect(screen.getByText(FIRST_DISH)).toBeTruthy();
  });
});

describe("état vide", () => {
  it("titres, phrases d'avertissement, nombre de dîners à 5, zone d'état vide", async () => {
    setup([MENU]);
    await ready();
    expect(screen.getByRole("heading", { name: "Nouvelle session" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Votre demande" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Menu courant" })).toBeTruthy();
    expect(screen.getByText(/perdue quand vous quittez l'app/)).toBeTruthy();
    expect(screen.getByText(/plusieurs minutes/)).toBeTruthy();
    expect(screen.getByRole<HTMLInputElement>("textbox", { name: /Nombre de dîners/ }).value).toBe(
      "5",
    );
    expect(screen.getByText(/Seul ce champ fixe le nombre de dîners/)).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe("");
  });

  it("champ vide : « Composer le menu » est actif, le clic demande d'écrire, aucun modèle créé", async () => {
    const { user, model } = setup([MENU]);
    await ready();
    expect(sendButton().hasAttribute("disabled")).toBe(false);
    await user.click(sendButton());
    expect(await screen.findByText("Écrivez votre demande.")).toBeTruthy();
    expect(model.created()).toBe(0);
  });

  it("réglages indisponibles : alerte, bouton « Ouvrir les réglages », pas de champ de demande", async () => {
    const { user, onOpenSettings } = setup([MENU], { readError: "base verrouillée" });
    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText("Réglages indisponibles")).toBeTruthy();
    expect(screen.queryByRole("textbox", { name: /^Demande/ })).toBeNull();
    await user.click(within(alert).getByRole("button", { name: "Ouvrir les réglages" }));
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });
});

describe("aucun appel sans clic", () => {
  it("rien ne part au rendu, même en StrictMode", async () => {
    const { model } = setup([MENU], { strict: true });
    await ready();
    expect(model.created()).toBe(0);
    expect(model.calls).toHaveLength(0);
  });
});

describe("double clic", () => {
  it("donne `detail === 2` au second clic de `user.dblClick`", async () => {
    const { user } = setup([MENU]);
    await ready();
    const details: number[] = [];
    sendButton().addEventListener("click", (event) => details.push(event.detail));
    await user.dblClick(sendButton());
    expect(details).toEqual([1, 2]);
  });

  it("un seul appel, tant que le premier est en cours", async () => {
    const { user, model } = setup([MENU]);
    await ready();
    model.state.hold = true;
    await type(user, "un bœuf bourguignon");
    await user.dblClick(sendButton());
    expect(model.created()).toBe(1);
    await waitFor(() => {
      expect(model.calls).toHaveLength(1);
    });
    model.release(0);
    expect(await screen.findByText(FIRST_DISH)).toBeTruthy();
    expect(model.calls).toHaveLength(1);
  });

  it("un seul appel, même quand le premier échoue aussitôt", async () => {
    let created = 0;
    const { user } = setup([MENU], {
      createModel: () => {
        created += 1;
        return Promise.reject(new Error("clé absente"));
      },
    });
    await ready();
    await type(user, "un bœuf bourguignon");
    await user.dblClick(sendButton());
    await screen.findByText("L'appel à Claude a échoué");
    expect(created).toBe(1);
  });
});

describe("pendant l'appel", () => {
  it("le champ est en lecture seule, la zone d'état annonce l'essai, les commandes sont désactivées", async () => {
    const { user, model } = setup([MENU]);
    await ready();
    await say(user, "un bœuf bourguignon");
    model.state.hold = true;
    await type(user, "remplace le plat c");
    await user.click(sendButton());
    await waitFor(() => {
      expect(model.calls).toHaveLength(2);
    });
    const message = field() as HTMLTextAreaElement;
    expect(message.readOnly).toBe(true);
    expect(message.value).toBe("remplace le plat c");
    const status = screen.getAllByRole("status")[0]!;
    expect(status.textContent).toContain("Vérification en cours");
    expect(status.textContent).toContain("Essai 1 sur 3");
    expect(screen.getByRole("radio", { name: "Samedi" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("textbox", { name: /Nombre de dîners/ }).hasAttribute("disabled")).toBe(
      true,
    );
    for (const box of screen.getAllByRole("checkbox", { name: /^Épinglé/ })) {
      expect(box.hasAttribute("disabled")).toBe(true);
    }
    expect(screen.getByRole("button", { name: "Recommencer" }).hasAttribute("disabled")).toBe(true);
    // Le menu précédent reste affiché.
    expect(screen.getByText(FIRST_DISH)).toBeTruthy();
    model.release(0);
    await waitFor(() => {
      expect(sendButton().hasAttribute("data-loading")).toBe(false);
    });
  });
});

describe("résultat", () => {
  it("affiche l'échange, le menu, ses constats, l'épingle du plat demandé, et rend le focus au champ vide", async () => {
    const { user } = setup([MENU]);
    await ready();
    await say(user, "un bœuf bourguignon");
    expect(screen.getByText("un bœuf bourguignon")).toBeTruthy();
    expect(screen.getByText(NOTE)).toBeTruthy();
    expect(screen.getByText(FIRST_DISH)).toBeTruthy();
    // Le choix du jour de session, et le jour du plat a.
    expect(screen.getAllByText("Lundi")).toHaveLength(2);
    expect(screen.getAllByText(/Se garde \d j au frigo/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Durée calculée : 2 h 15/)).toBeTruthy();
    expect(screen.getByText("Aucun constat détecté")).toBeTruthy();
    const pinned = screen.getByRole("checkbox", { name: `Épinglé : ${FIRST_DISH}` });
    expect((pinned as HTMLInputElement).checked).toBe(true);
    expect((field() as HTMLTextAreaElement).value).toBe("");
    expect(document.activeElement).toBe(field());
    expect(screen.getByRole("heading", { name: "Modifier le menu" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Envoyer la modification" })).toBeTruthy();
  });

  it("nettoie le texte de l'IA : ni U+202E ni U+200B dans la note ni dans un nom de plat", async () => {
    const dirty = menuWith((reply) => {
      reply.note = "Menu\u202e de\u200b saison.";
      reply.dishes[1]!.name = "Poulet\u202e aux\u200b carottes";
    });
    const { user } = setup([dirty]);
    await ready();
    await say(user, "un menu");
    expect(screen.getByText("Menu de saison.")).toBeTruthy();
    expect(screen.getByText("b. Poulet aux carottes")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/[\u202e\u200b]/);
  });

  it("nombre de dîners et jour choisis avant le premier message partent dans le premier prompt", async () => {
    const { user, model } = setup([MENU]);
    await ready();
    const dinners = screen.getByRole("textbox", { name: /Nombre de dîners/ });
    await user.clear(dinners);
    await user.type(dinners, "3");
    await user.click(screen.getByRole("radio", { name: "Samedi" }));
    await say(user, "un menu");
    expect(model.calls[0]?.user).toContain("Nombre de dîners : 3");
    expect(model.calls[0]?.user).toContain("Session de cuisine : samedi");
  });
});

describe("échecs", () => {
  // Tauri rejette avec un texte, pas avec une Error : `invoke` lève ici le texte tel quel.
  const failing = (invokeError: string) => (settings: Settings) =>
    Promise.resolve(
      createAppModel(
        () =>
          Promise.resolve().then(() => {
            throw JSON.parse(JSON.stringify(invokeError));
          }),
        settings,
        MenuReplySchema,
      ),
    );

  it("clé absente, par le vrai createAppModel : la phrase du Rust, « Ouvrir les réglages », message gardé", async () => {
    const sentence = "Aucune clé d'API dans le trousseau : enregistrez-la dans Réglages.";
    const { user, onOpenSettings } = setup([MENU], { createModel: failing(sentence) });
    await ready();
    await say(user, "un bœuf bourguignon");
    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText("L'appel à Claude a échoué")).toBeTruthy();
    expect(alert.textContent).toContain(sentence);
    expect((field() as HTMLTextAreaElement).value).toBe("un bœuf bourguignon");
    await user.click(within(alert).getByRole("button", { name: "Ouvrir les réglages" }));
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });

  it("délai dépassé : la phrase, sans « Ouvrir les réglages »", async () => {
    const sentence = "Délai dépassé : Mammouth n'a pas répondu à temps.";
    const { user } = setup([MENU], { createModel: failing(sentence) });
    await ready();
    await say(user, "un bœuf bourguignon");
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain(sentence);
    expect(within(alert).queryByRole("button")).toBeNull();
  });

  it("plat épinglé retiré : l'alerte nomme le plat et le menu affiché est inchangé", async () => {
    const renamed = menuWith((reply) => {
      reply.dishes[0]!.name = "Pizza maison";
    });
    const { user } = setup([MENU, renamed]);
    await ready();
    await say(user, "un bœuf bourguignon");
    await say(user, "remplace le plat a");
    const alert = await screen.findByRole("alert");
    expect(
      within(alert).getByText("Menu inchangé : la réponse retirait un plat épinglé"),
    ).toBeTruthy();
    expect(alert.textContent).toContain("« Cabillaud, fondue de poireaux et riz complet »");
    expect(screen.getByText(FIRST_DISH)).toBeTruthy();
    expect(screen.queryByText("a. Pizza maison")).toBeNull();
  });

  it("menu inutilisable : trois réponses illisibles, « en 3 essais », aucun menu, message gardé", async () => {
    const { user } = setup(["pas du JSON", "{}", "[1]"]);
    await ready();
    await say(user, "un menu");
    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText("Menu inutilisable")).toBeTruthy();
    expect(alert.textContent).toContain("en 3 essais");
    expect(screen.getByText("Le menu proposé s'affichera ici, avec ses constats.")).toBeTruthy();
    expect((field() as HTMLTextAreaElement).value).toBe("un menu");
  });
});

describe("épingles", () => {
  it("décocher « Épinglé » puis envoyer : le prompt suivant n'a plus la ligne « Plats épinglés »", async () => {
    const { user, model } = setup([MENU]);
    await ready();
    await say(user, "un bœuf bourguignon");
    await user.click(screen.getByRole("checkbox", { name: `Épinglé : ${FIRST_DISH}` }));
    expect(
      screen.getByRole<HTMLInputElement>("checkbox", { name: `Épinglé : ${FIRST_DISH}` }).checked,
    ).toBe(false);
    await say(user, "remplace le plat c");
    expect(model.calls[1]?.user).not.toContain("Plats épinglés");
  });
});

describe("éviter un ingrédient", () => {
  it("ajoute le terme et la raison aux réglages, confirme, rend le focus, refuse le doublon", async () => {
    const { user, settings } = setup([MENU]);
    await ready();
    await say(user, "un bœuf bourguignon");
    const ingredient = () => screen.getByRole("button", { name: /^poireau 600 g/ });
    await user.click(ingredient());
    await user.type(screen.getByRole("textbox", { name: "Raison (facultative)" }), "n'aime pas");
    await user.click(screen.getByRole("button", { name: "Éviter" }));
    await waitFor(() => {
      expect(lastWritten(settings.written).exclusions).toEqual([
        { term: "poireau", reason: "n'aime pas" },
      ]);
    });
    expect(
      screen.getByText(/« poireau » ajouté aux aliments à éviter\. Il compte à partir du prochain/),
    ).toBeTruthy();
    await waitFor(() => {
      expect(document.activeElement).toBe(ingredient());
    });

    await user.click(ingredient());
    await user.click(screen.getByRole("button", { name: "Éviter" }));
    expect(await screen.findByText("« poireau » est déjà dans la liste.")).toBeTruthy();
  });
});

describe("Recommencer", () => {
  it("demande confirmation dans la page ; « Annuler » ne vide rien, « Effacer » vide tout sauf le jour et les dîners", async () => {
    const { user } = setup([MENU]);
    await ready();
    await user.click(screen.getByRole("radio", { name: "Samedi" }));
    const dinners = screen.getByRole("textbox", { name: /Nombre de dîners/ });
    await user.clear(dinners);
    await user.type(dinners, "4");
    await say(user, "un bœuf bourguignon");

    await user.click(screen.getByRole("button", { name: "Recommencer" }));
    expect(screen.getByText(/Recommencer la session \?/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Annuler" }));
    expect(screen.queryByText(/Recommencer la session \?/)).toBeNull();
    expect(screen.getByText(FIRST_DISH)).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Recommencer" }));
    await user.click(screen.getByRole("button", { name: "Effacer" }));
    expect(screen.queryByText(FIRST_DISH)).toBeNull();
    expect(screen.queryByText("un bœuf bourguignon")).toBeNull();
    expect(screen.getByRole("heading", { name: "Votre demande" })).toBeTruthy();
    expect(screen.getByRole<HTMLInputElement>("radio", { name: "Samedi" }).checked).toBe(true);
    expect(screen.getByRole<HTMLInputElement>("textbox", { name: /Nombre de dîners/ }).value).toBe(
      "4",
    );
  });
});

// Un ingrédient en plus dans le plat a : hors saison en novembre, donc une erreur de saison par ingrédient.
const OFF_SEASON = ["tomate", "poivron"] as const;

function withErrors(count: 1 | 2, qty: number): string {
  return menuWith((reply) => {
    for (const name of OFF_SEASON.slice(0, count)) {
      reply.dishes[0]!.ingredients.push({
        name,
        qty,
        unit: "g",
        form: "fresh",
        category: null,
        sameDay: false,
      });
    }
  });
}

const withoutPulses = () =>
  menuWith((reply) => {
    reply.dishes[3]!.ingredients = reply.dishes[3]!.ingredients.filter(
      (ingredient) => ingredient.name !== "lentilles corail",
    );
  });

describe("constats", () => {
  it("le badge dit « 1 erreur » au singulier", async () => {
    const errors = setup([withErrors(1, 100)]);
    await ready();
    await say(errors.user, "un menu");
    expect(screen.getByText("1 erreur")).toBeTruthy();
  });

  it("un seul avertissement, aucune erreur : « 1 avertissement »", async () => {
    const { user } = setup([withoutPulses()]);
    await ready();
    await say(user, "un menu");
    expect(screen.getByText("1 avertissement")).toBeTruthy();
    expect(screen.queryByText(/erreur/)).toBeNull();
  });

  it("« Des erreurs restent après 3 essais » : le nombre d'essais du cycle, pas le numéro du meilleur", async () => {
    // L'essai 1 (une erreur) est retenu ; les essais 2 et 3 en ont deux.
    const { user } = setup([withErrors(1, 100), withErrors(2, 100), withErrors(2, 200)]);
    await ready();
    await say(user, "un menu");
    expect(screen.getByText(/Des erreurs restent après 3 essais/)).toBeTruthy();
  });

  it("« Cycle interrompu » : un menu avec une erreur, puis un essai qui échoue", async () => {
    const { user, model } = setup([withErrors(1, 100)]);
    await ready();
    model.state.hold = true;
    await type(user, "un menu");
    await user.click(sendButton());
    await waitFor(() => {
      expect(model.calls).toHaveLength(1);
    });
    model.release(0);
    await waitFor(() => {
      expect(model.calls).toHaveLength(2);
    });
    model.fail(1, new Error("Connexion à Mammouth impossible : vérifiez le réseau."));
    const alert = await screen.findByText("Cycle interrompu");
    const box = alert.closest("[role=alert]")!;
    expect(box.textContent).toContain("Connexion à Mammouth impossible : vérifiez le réseau.");
    expect(screen.getByText("a. Cabillaud, fondue de poireaux et riz complet")).toBeTruthy();
  });
});

describe("échecs sans menu", () => {
  it("un refus : « Claude a refusé la demande »", async () => {
    const { user } = setup([""], { stopReasons: ["refusal"] });
    await ready();
    await say(user, "un menu");
    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText("Claude a refusé la demande")).toBeTruthy();
    expect(alert.textContent).toContain("Reformulez votre message.");
  });

  it("une réponse coupée sans menu : « Réponse coupée »", async () => {
    const { user } = setup(['{"note":'], { stopReasons: ["max_tokens"] });
    await ready();
    await say(user, "un menu");
    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText("Réponse coupée")).toBeTruthy();
    expect(alert.textContent).toContain("trop longue");
  });
});

describe("changements en attente", () => {
  it("« Jour changé » apparaît quand le jour diffère de celui du calcul, et disparaît au retour", async () => {
    const { user } = setup([MENU]);
    await ready();
    await say(user, "un menu");
    expect(screen.queryByText(/Jour changé/)).toBeNull();
    await user.click(screen.getByRole("radio", { name: "Samedi" }));
    expect(screen.getByText("Jour changé : pris en compte au prochain message.")).toBeTruthy();
    await user.click(screen.getByRole("radio", { name: "Dimanche" }));
    expect(screen.queryByText(/Jour changé/)).toBeNull();
  });

  it("« Nombre changé » compare au nombre demandé, pas au nombre de plats : un menu de 0 plat pour 5 dîners n'en affiche pas", async () => {
    const empty = menuWith((reply) => {
      reply.dishes = [];
    });
    const { user } = setup([empty]);
    await ready();
    await say(user, "un menu");
    expect(screen.getByText("Aucun plat dans ce menu : demandez une modification.")).toBeTruthy();
    expect(screen.queryByText(/Nombre changé/)).toBeNull();
    const dinners = screen.getByRole("textbox", { name: /Nombre de dîners/ });
    await user.clear(dinners);
    await user.type(dinners, "3");
    expect(screen.getByText("Nombre changé : pris en compte au prochain message.")).toBeTruthy();
    await user.clear(dinners);
    await user.type(dinners, "5");
    expect(screen.queryByText(/Nombre changé/)).toBeNull();
  });
});

describe("accessibilité et focus", () => {
  it("le choix du jour est un groupe nommé", async () => {
    setup([MENU]);
    await ready();
    expect(screen.getByRole("radiogroup", { name: "Jour de la session de cuisine" })).toBeTruthy();
  });

  it("après « Effacer », le focus est dans le champ de demande", async () => {
    const { user } = setup([MENU]);
    await ready();
    await say(user, "un menu");
    await user.click(screen.getByRole("button", { name: "Recommencer" }));
    await user.click(screen.getByRole("button", { name: "Effacer" }));
    expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "Demande" }));
  });

  it("la zone d'état existe aussi pendant le chargement et quand les réglages sont indisponibles", async () => {
    setup([MENU], { readError: "base verrouillée" });
    // Juste après le rendu, sans rien attendre : les réglages se chargent.
    expect(screen.getByRole("status")).toBeTruthy();
    await screen.findByText("Réglages indisponibles");
    expect(screen.getByRole("status")).toBeTruthy();
  });
});

describe("menu remplacé", () => {
  const swapped = menuWith((reply) => {
    reply.dishes[0]!.ingredients[0]!.name = "navet";
  });

  it("une fenêtre « éviter » ouverte pendant un appel est fermée quand le menu change, sans rien enregistrer", async () => {
    const { user, model, settings } = setup([MENU, swapped]);
    await ready();
    await say(user, "un menu");
    model.state.hold = true;
    await type(user, "change le premier ingrédient");
    await user.click(sendButton());
    await waitFor(() => {
      expect(model.calls).toHaveLength(2);
    });
    await user.click(screen.getByRole("button", { name: /^poireau 600 g/ }));
    await user.type(screen.getByRole("textbox", { name: "Raison (facultative)" }), "trop cher");
    expect(screen.getByText(/dans les prochains menus/)).toBeTruthy();
    model.state.hold = false;
    model.release(0);
    await screen.findByRole("button", { name: /^navet 600 g/ });
    expect(screen.queryByText(/dans les prochains menus/)).toBeNull();
    expect(screen.queryByRole("textbox", { name: "Raison (facultative)" })).toBeNull();
    expect(settings.written).toHaveLength(0);
  });

  it("la confirmation « éviter » disparaît quand une modification est acceptée", async () => {
    const { user } = setup([MENU]);
    await ready();
    await say(user, "un menu");
    await user.click(screen.getByRole("button", { name: /^poireau 600 g/ }));
    await user.click(screen.getByRole("button", { name: "Éviter" }));
    expect(await screen.findByText(/ajouté aux aliments à éviter/)).toBeTruthy();
    await say(user, "une modification");
    expect(screen.queryByText(/ajouté aux aliments à éviter/)).toBeNull();
  });
});

describe("refus d'un doublon", () => {
  it("le message cite le terme sans caractère invisible", async () => {
    const dirty = menuWith((reply) => {
      reply.dishes[0]!.ingredients[0]!.name = "poireau\u202e\u200b";
    });
    const { user } = setup([dirty]);
    await ready();
    await say(user, "un menu");
    const ingredient = () => screen.getByRole("button", { name: /^poireau 600 g/ });
    await user.click(ingredient());
    await user.click(screen.getByRole("button", { name: "Éviter" }));
    await screen.findByText(/ajouté aux aliments à éviter/);
    await user.click(ingredient());
    await user.click(screen.getByRole("button", { name: "Éviter" }));
    const message = await screen.findByText(/est déjà dans la liste/);
    expect(message.textContent).toContain("poireau");
    expect(message.textContent).not.toMatch(/[\u202e\u200b]/);
  });
});
