import { MantineProvider } from "@mantine/core";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  INSEE_TABLE,
  MenuSchema,
  createCheckKeeper,
  createPriceKeeper,
  createSession,
  createSettingsKeeper,
  euroText,
  menuCost,
  serializeHistoryEntry,
  sourceText,
  totalText,
  unitPriceText,
  buildIngredientIndex,
  REFERENTIAL,
  inseeLookup,
} from "core";
import type { HistoryEntry, HistoryRow, ManualPriceRow, OpenPricesSummary } from "core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../App.tsx";
import { createKeychainSecretAdmin } from "../platform/keychain-secret-admin.ts";
import type { Invoke } from "../platform/tauri-error.ts";
import {
  CHECKS_GONE,
  fakeHistoryStore,
  fakeOpenPricesStore,
  fakeMenuModel,
  fakeNewToken,
  fakePriceStore,
  fakeRenderPdf,
  fakeSettingsStore,
  fixedClock,
} from "../test/fakes.ts";
import menuReply from "../test/fixtures/menu-reply.json";
import { renderWithMantine } from "../test/render.tsx";
import { theme } from "../theme.ts";
import { IngredientsScreen } from "./IngredientsScreen.tsx";

const INVISIBLE = /[\u202E\u200B]/;
const PDF = new TextEncoder().encode("%PDF-1.7 exemple");
const fixedDay = "2026-11-16";

interface Ingredient {
  name: string;
  qty: number;
  unit: "g" | "ml" | "piece";
  form: "fresh" | "canned" | "frozen" | "dry";
  category: string | null;
  sameDay: boolean;
}
const ing = (name: string, qty: number, over: Partial<Ingredient> = {}): Ingredient => ({
  name,
  qty,
  unit: "g",
  form: "fresh",
  category: null,
  sameDay: false,
  ...over,
});

// Le menu d'exemple, avec le placard du menu d'automne (huile d'olive dans 4 plats, cumin dans le plat d).
function withPantry(dishes = menuReply.dishes) {
  const oil = [30, 30, 20, 20];
  return dishes.map((dish, at) => ({
    ...dish,
    ingredients: [
      ...dish.ingredients,
      ...(at < 4 ? [ing("huile d'olive", oil[at]!, { unit: "ml" })] : []),
      ...(at === 3 ? [ing("cumin", 3, { form: "dry" })] : []),
    ],
  }));
}
const MENU = MenuSchema.parse({ ...menuReply, dishes: withPantry() });

function rowOf(id: number, overrides: Partial<HistoryEntry> = {}, checked = "[]"): HistoryRow {
  const entry: HistoryEntry = {
    version: 1,
    date: "2026-11-17",
    request: "fiche d'exemple",
    sessionDay: "sun",
    menu: MENU,
    sheet: "detail",
    ...overrides,
  };
  return { id, entry: serializeHistoryEntry(entry), checked };
}
const broken = (id: number): HistoryRow => ({ id, entry: "{pas du json", checked: "[]" });

function setup(
  rows: HistoryRow[] = [],
  prepare: (history: ReturnType<typeof fakeHistoryStore>) => void = () => undefined,
  manualPrices: ManualPriceRow[] = [],
  preparePrices: (prices: ReturnType<typeof fakePriceStore>) => void = () => undefined,
  openPrices?: ReturnType<typeof fakeOpenPricesStore>,
) {
  const history = fakeHistoryStore(rows);
  prepare(history);
  const checks = createCheckKeeper(history.store);
  const priceStore = fakePriceStore(manualPrices);
  preparePrices(priceStore);
  const prices = createPriceKeeper(priceStore.store, {
    clock: fixedClock,
    ...(openPrices === undefined
      ? {}
      : {
          openPrices: {
            store: openPrices.store,
            build: () => Promise.reject(new Error("Fichier Open Prices illisible : prices.")),
          },
        }),
  });
  const onNewSession = vi.fn();
  const view = (refresh: number) => (
    <IngredientsScreen
      history={history.store}
      checks={checks}
      prices={prices}
      refresh={refresh}
      onNewSession={onNewSession}
    />
  );
  const { rerender, unmount } = renderWithMantine(view(0));
  return {
    history,
    checks,
    priceStore,
    prices,
    onNewSession,
    unmount,
    user: userEvent.setup(),
    refresh: (value: number) => {
      rerender(
        <MantineProvider theme={theme} env="test">
          {view(value)}
        </MantineProvider>,
      );
    },
  };
}

const boxes = () => screen.getAllByRole<HTMLInputElement>("checkbox");
const box = (name: RegExp | string) => screen.getByRole<HTMLInputElement>("checkbox", { name });
// Mantine range la case et son libellé côte à côte : le `<label>` est relié par `for`.
const labelOf = (input: HTMLInputElement): HTMLLabelElement | null =>
  document.querySelector<HTMLLabelElement>(`label[for="${input.id}"]`);
const labelText = (input: HTMLInputElement): string => labelOf(input)?.textContent ?? "";
const carrot = () => box(/^Carotte /);
const leek = () => box(/^Poireau /);
const counter = () => screen.getByRole("status").textContent;
const flush = () => new Promise((resolve) => setTimeout(resolve, 20));

afterEach(() => {
  vi.restoreAllMocks();
});

describe("IngredientsScreen : états", () => {
  it("montre le chargement, puis la liste", async () => {
    setup([rowOf(1)]);
    expect(screen.getByText("Chargement de la liste de courses…")).toBeTruthy();
    await screen.findByRole("heading", { level: 3, name: "Liste de courses" });
    expect(screen.queryByText("Chargement de la liste de courses…")).toBeNull();
  });

  it("historique vide : le texte et « Aller à Nouvelle session »", async () => {
    const { onNewSession, user } = setup();
    expect(await screen.findByText(/Aucun menu validé pour l'instant/)).toBeTruthy();
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    await user.click(screen.getByRole("button", { name: "Aller à Nouvelle session" }));
    expect(onNewSession).toHaveBeenCalledTimes(1);
  });

  it("ligne la plus récente illisible, une plus ancienne lisible : l'alerte, aucune case", async () => {
    setup([broken(2), rowOf(1)]);
    expect(await screen.findByText(/Le dernier menu de l'historique est illisible/)).toBeTruthy();
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    expect(screen.queryByText("Liste de courses")).toBeNull();
  });

  it("erreur de lecture : alerte et « Réessayer », qui relit", async () => {
    const { user } = setup([rowOf(1)], (history) => {
      history.failNext("list", "Base indisponible\u202E");
    });
    expect(await screen.findByText("Liste de courses indisponible")).toBeTruthy();
    expect(screen.getByText("Base indisponible")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(INVISIBLE);
    await user.click(screen.getByRole("button", { name: "Réessayer" }));
    expect(await screen.findByRole("heading", { name: "Liste de courses" })).toBeTruthy();
    expect(screen.queryByText("Liste de courses indisponible")).toBeNull();
  });

  it("deux clics sur « Réessayer » dans la même tâche : une seule relecture", async () => {
    const { history } = setup([rowOf(1)], (store) => {
      store.failNext("list", "Base indisponible");
    });
    await screen.findByText("Liste de courses indisponible");
    history.hold("list");
    const retry = screen.getByRole("button", { name: "Réessayer" });
    fireEvent.click(retry);
    fireEvent.click(retry);
    expect(history.lists.count).toBe(2);
    history.release();
    await screen.findByRole("heading", { name: "Liste de courses" });
    expect(history.lists.count).toBe(2);
  });
});

describe("IngredientsScreen : la liste", () => {
  it("menu d'exemple : 11 cases dans l'ordre alphabétique, placard en dernier avec ses deux entrées", async () => {
    setup([rowOf(1)]);
    await screen.findByRole("heading", { name: "Liste de courses" });
    expect(boxes()).toHaveLength(11);
    const names = boxes().map((input) => labelText(input));
    expect(names[0]).toMatch(/^Bœuf à braiser/);
    expect(names[1]).toMatch(/^Cabillaud \(surgelé\)600 g \(a\) · soir/);
    expect(names[2]).toMatch(/^Carotte1,1 kg \(b : 500 g, c : 600 g\)/);
    expect(names.slice(0, 10).map((name) => name.split(/\d/)[0])).toEqual([
      "Bœuf à braiser",
      "Cabillaud (surgelé)",
      "Carotte",
      "Cuisse de poulet",
      "Lentilles corail",
      "Navet",
      "Oignon",
      "Poireau",
      "Potiron",
      "Riz complet",
    ]);
    expect(names[10]).toContain("Placard (à vérifier)");
    expect(names[10]).toContain("Cumin : 3 g (d)");
    expect(names[10]).toContain("Huile d'olive : 100 ml (a, b, c, d)");
    expect(screen.getByText(/^soir : utilisé seulement le soir du repas/)).toBeTruthy();
    expect(screen.queryByText(/^à confirmer :/)).toBeNull();
    expect(counter()).toBe("0 cochée sur 11");
  });

  it("en-tête : date en toutes lettres, demande et noms de plats nettoyés", async () => {
    setup([
      rowOf(1, {
        request: "un bœuf\u202E bourguignon\u200B",
        menu: MenuSchema.parse({
          ...menuReply,
          dishes: withPantry().map((dish, at) =>
            at === 0 ? { ...dish, name: "Cabil\u200Blaud\u202E" } : dish,
          ),
        }),
      }),
    ]);
    await screen.findByRole("heading", { name: "Liste de courses" });
    expect(screen.getByRole("heading", { level: 3, name: "mardi 17 novembre 2026" })).toBeTruthy();
    expect(screen.getByText("Session le dimanche · 5 dîners")).toBeTruthy();
    const request = screen.getByText(/Demande : « un bœuf bourguignon »/);
    expect(request.getAttribute("title")).toBe("un bœuf bourguignon");
    expect(screen.getByText("a. Cabillaud")).toBeTruthy();
    expect(screen.getAllByText(/^[a-e]\. /)).toHaveLength(5);
    expect(document.body.textContent).not.toMatch(INVISIBLE);
  });

  it("les cases lues dans la base sont cochées, le compteur les compte", async () => {
    setup([rowOf(1, {}, '["fresh|carotte","placard"]')]);
    await screen.findByRole("heading", { name: "Liste de courses" });
    expect(carrot().checked).toBe(true);
    expect(box(/^Placard/).checked).toBe(true);
    expect(leek().checked).toBe(false);
    expect(counter()).toBe("2 cochées sur 11");
  });

  it("une clé périmée n'est pas affichée ; elle quitte la base à la coche suivante", async () => {
    const { history, user } = setup([rowOf(1, {}, '["fresh|ancien-nom","fresh|carotte"]')]);
    await screen.findByRole("heading", { name: "Liste de courses" });
    expect(counter()).toBe("1 cochée sur 11");
    await user.click(leek());
    expect(history.checkedWrites).toEqual([{ id: 1, keys: ["fresh|carotte", "fresh|poireau"] }]);
  });

  it("cases illisibles : l'alerte, tout décoché, la première coche écrit l'état complet", async () => {
    const { history, user } = setup([rowOf(1, {}, "pas du json")]);
    expect(
      await screen.findByText(/cases cochées enregistrées pour ce menu sont illisibles/),
    ).toBeTruthy();
    expect(boxes().every((input) => !input.checked)).toBe(true);
    await user.click(carrot());
    expect(history.checkedWrites).toEqual([{ id: 1, keys: ["fresh|carotte"] }]);
    expect(screen.queryByText(/sont illisibles/)).toBeNull();
  });

  it("aucune écriture au montage ni à une relecture", async () => {
    const { history, refresh } = setup([rowOf(1)]);
    await screen.findByRole("heading", { name: "Liste de courses" });
    refresh(1);
    await waitFor(() => {
      expect(history.lists.count).toBe(2);
    });
    await flush();
    expect(history.checkedCalls).toEqual([]);
    expect(history.checkedWrites).toEqual([]);
  });

  it("sans placard : pas de case, une phrase", async () => {
    setup([rowOf(1, { menu: MenuSchema.parse(menuReply) })]);
    await screen.findByRole("heading", { name: "Liste de courses" });
    expect(boxes()).toHaveLength(10);
    expect(screen.getByText("Aucun ingrédient de placard dans ce menu.")).toBeTruthy();
  });

  it("ingrédient inconnu : légende « à confirmer »", async () => {
    const dishes = withPantry().map((dish, at) =>
      at === 0
        ? {
            ...dish,
            ingredients: [...dish.ingredients, ing("Pintade", 400, { category: "poultry" })],
          }
        : dish,
    );
    setup([rowOf(1, { menu: MenuSchema.parse({ ...menuReply, dishes }) })]);
    await screen.findByRole("heading", { name: "Liste de courses" });
    expect(screen.getByText(/^à confirmer : ingrédient inconnu de l'app/)).toBeTruthy();
  });

  it("nom d'un ingrédient inconnu nettoyé dans le DOM", async () => {
    const dishes = withPantry().map((dish, at) =>
      at === 0
        ? {
            ...dish,
            ingredients: [
              ...dish.ingredients,
              ing("Pin\u202Etade\u200B", 400, { category: "poultry" }),
            ],
          }
        : dish,
    );
    setup([rowOf(1, { menu: MenuSchema.parse({ ...menuReply, dishes }) })]);
    await screen.findByRole("heading", { name: "Liste de courses" });
    expect(box(/^Pintade /)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(INVISIBLE);
  });
});

describe("IngredientsScreen : noms accessibles et zone de clic", () => {
  it("le nom accessible commence par le nom, puis la quantité", async () => {
    setup([rowOf(1)]);
    await screen.findByRole("heading", { name: "Liste de courses" });
    expect(box(/^Carotte 1,1 kg \(b : 500 g, c : 600 g\) ≈ /)).toBeTruthy();
    expect(box(/^Placard \(à vérifier\).*Cumin : 3 g \(d\)/)).toBeTruthy();
  });

  it("la ligne carotte porte exactement le texte de coût calculé depuis l'INSEE", async () => {
    setup([rowOf(1)]);
    await screen.findByRole("heading", { name: "Liste de courses" });
    expect(screen.getByText(CARROT_INSEE_LINE).textContent).toBe(CARROT_INSEE_LINE);
    expect(CARROT_INSEE_LINE).toMatch(
      /^≈ \d+,\d{2} € · \d+,\d{2} €\/kg · INSEE, moyenne nationale d/,
    );
  });

  it("un clic sur le texte de la quantité coche la case", async () => {
    const { user } = setup([rowOf(1)]);
    await screen.findByRole("heading", { name: "Liste de courses" });
    await user.click(screen.getByText("1,1 kg (b : 500 g, c : 600 g)"));
    expect(carrot().checked).toBe(true);
  });

  it("un clic sur une entrée du placard coche la case du placard", async () => {
    const { user } = setup([rowOf(1)]);
    await screen.findByRole("heading", { name: "Liste de courses" });
    await user.click(screen.getByText("Cumin : 3 g (d)"));
    expect(box(/^Placard/).checked).toBe(true);
  });

  it("le libellé ne contient que des éléments en ligne", async () => {
    setup([rowOf(1)]);
    await screen.findByRole("heading", { name: "Liste de courses" });
    for (const input of boxes()) {
      expect(labelOf(input)?.querySelector("div, p, ul, li")).toBeNull();
    }
  });

  it("deux lignes du même ingrédient en deux formes ont deux noms", async () => {
    const dishes = withPantry().map((dish, at) =>
      at === 0
        ? {
            ...dish,
            ingredients: [
              ...dish.ingredients,
              ing("maïs", 200, { form: "canned" }),
              ing("maïs", 150),
            ],
          }
        : dish,
    );
    setup([rowOf(1, { menu: MenuSchema.parse({ ...menuReply, dishes }) })]);
    await screen.findByRole("heading", { name: "Liste de courses" });
    const names = boxes().map((input) => labelText(input));
    const corn = names.filter((name) => name.startsWith("Maïs"));
    expect(corn).toHaveLength(2);
    expect(box(/^Maïs \(frais\)/)).toBeTruthy();
    expect(box(/^Maïs \(conserve\)/)).toBeTruthy();
    expect(new Set(names).size).toBe(names.length);
    expect(corn.find((name) => name.startsWith("Maïs (frais)"))).not.toMatch(/ · (frais|conserve)/);
  });
});

describe("IngredientsScreen : cocher", () => {
  it("une coche écrit l'état complet, s'affiche tout de suite et se barre", async () => {
    const { history, user } = setup([rowOf(1)]);
    await screen.findByRole("heading", { name: "Liste de courses" });
    history.hold("check");
    await user.click(carrot());
    expect(carrot().checked).toBe(true);
    expect(counter()).toBe("1 cochée sur 11");
    expect(screen.getByText("Carotte").style.textDecoration).toBe("line-through");
    // L'indicateur d'écriture est un chargement masqué, hors de la zone `status`.
    expect(document.querySelector('.mantine-Loader-root[aria-hidden="true"]')).not.toBeNull();
    expect(screen.getByRole("status").querySelector(".mantine-Loader-root")).toBeNull();
    history.release();
    await waitFor(() => {
      expect(document.querySelector(".mantine-Loader-root")).toBeNull();
    });
    expect(history.checkedWrites).toEqual([{ id: 1, keys: ["fresh|carotte"] }]);
    await user.click(leek());
    await user.click(carrot());
    expect(history.checkedWrites.at(-1)).toEqual({ id: 1, keys: ["fresh|poireau"] });
  });

  it("le nom d'une ligne cochée est barré et atténué, celui d'une ligne décochée ne l'est pas", async () => {
    const { user } = setup([rowOf(1)]);
    await screen.findByRole("heading", { name: "Liste de courses" });
    expect(screen.getByText("Carotte").style.color).toBe("");
    expect(screen.getByText("Carotte").style.textDecoration).toBe("");
    await user.click(carrot());
    expect(screen.getByText("Carotte").style.color).toContain("dimmed");
    expect(screen.getByText("Carotte").style.textDecoration).toBe("line-through");
    expect(screen.getByText("Poireau").style.color).toBe("");
  });

  it("le second clic écrit l'état complet, pas un delta", async () => {
    const { history, user } = setup([rowOf(1)]);
    await screen.findByRole("heading", { name: "Liste de courses" });
    await user.click(carrot());
    await user.click(leek());
    expect(history.checkedWrites.at(-1)?.keys).toEqual(["fresh|carotte", "fresh|poireau"]);
    expect(history.rows()[0]?.checked).toBe('["fresh|carotte","fresh|poireau"]');
  });

  it("file : trois coches pendant une écriture retenue, une seule écriture à la fois, la base finit sur l'état affiché", async () => {
    const { history, user } = setup([rowOf(1)]);
    await screen.findByRole("heading", { name: "Liste de courses" });
    history.hold("check");
    await user.click(carrot());
    await user.click(leek());
    await user.click(carrot());
    expect(history.checksInFlight.max).toBe(1);
    history.release();
    await waitFor(() => {
      expect(history.checkedWrites.at(-1)?.keys).toEqual(["fresh|poireau"]);
    });
    expect(history.checksInFlight.max).toBe(1);
    expect(history.rows()[0]?.checked).toBe('["fresh|poireau"]');
    expect(boxes().filter((input) => input.checked)).toHaveLength(1);
    expect(leek().checked).toBe(true);
    expect(carrot().checked).toBe(false);
  });

  it("double clic sur une case : deux bascules, la base finit dans l'état affiché", async () => {
    const { history, user } = setup([rowOf(1)]);
    await screen.findByRole("heading", { name: "Liste de courses" });
    await user.dblClick(carrot());
    expect(carrot().checked).toBe(false);
    await waitFor(() => {
      expect(history.rows()[0]?.checked).toBe("[]");
    });
    expect(history.checksInFlight.max).toBe(1);
  });

  it("échec d'écriture : l'alerte est dans la carte de la liste, la case reste cochée, « Réessayer » renvoie", async () => {
    const { history, user } = setup([rowOf(1)]);
    await screen.findByRole("heading", { name: "Liste de courses" });
    history.failNext("check", "Enregistrement des cases impossible.\u202E");
    await user.click(carrot());
    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText("Cases non enregistrées")).toBeTruthy();
    expect(alert.textContent).toContain("Enregistrement des cases impossible.");
    expect(alert.textContent).toContain(
      "Elles seront perdues si vous quittez l'app sans réessayer.",
    );
    expect(alert.textContent).not.toMatch(INVISIBLE);
    // Sous le titre et le compteur, dans la carte de la liste.
    const list = screen
      .getByRole("heading", { name: "Liste de courses" })
      .closest(".mantine-Paper-root");
    expect(list).not.toBeNull();
    expect(list?.contains(alert)).toBe(true);
    expect(carrot().checked).toBe(true);
    expect(history.checkedWrites).toEqual([]);
    await user.click(within(alert).getByRole("button", { name: "Réessayer" }));
    await waitFor(() => {
      expect(screen.queryByRole("alert")).toBeNull();
    });
    expect(history.checkedWrites).toEqual([{ id: 1, keys: ["fresh|carotte"] }]);
  });

  it("« Réessayer » réentrant : deux clics dans la même tâche, une seule écriture", async () => {
    const { history, user } = setup([rowOf(1)]);
    await screen.findByRole("heading", { name: "Liste de courses" });
    history.failNext("check", "Enregistrement des cases impossible.");
    await user.click(carrot());
    const alert = await screen.findByRole("alert");
    history.hold("check");
    const retry = within(alert).getByRole("button", { name: "Réessayer" });
    fireEvent.click(retry);
    fireEvent.click(retry);
    await waitFor(() => {
      expect(history.checkedCalls).toHaveLength(2);
    });
    await flush();
    expect(history.checkedCalls).toHaveLength(2);
    history.release();
    await flush();
    expect(history.checkedWrites).toHaveLength(1);
  });

  it("entrée purgée pendant l'affichage : l'alerte donne la phrase, « Relire l'historique » relit", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { history, user } = setup([rowOf(1)]);
    await screen.findByRole("heading", { name: "Liste de courses" });
    history.remove(1);
    await user.click(carrot());
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain(CHECKS_GONE);
    expect(history.rows()).toEqual([]);
    await user.click(within(alert).getByRole("button", { name: "Relire l'historique" }));
    expect(await screen.findByText(/Aucun menu validé pour l'instant/)).toBeTruthy();
    expect(errors).not.toHaveBeenCalled();
  });

  it("purge pendant l'écriture retenue : le rejet s'affiche, aucune ligne recréée", async () => {
    const { history, user } = setup([rowOf(1)]);
    await screen.findByRole("heading", { name: "Liste de courses" });
    history.hold("check");
    await user.click(carrot());
    history.remove(1);
    history.release();
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain(CHECKS_GONE);
    expect(history.rows()).toEqual([]);
    await user.click(within(alert).getByRole("button", { name: "Relire l'historique" }));
    expect(await screen.findByText(/Aucun menu validé pour l'instant/)).toBeTruthy();
  });
});

describe("IngredientsScreen : relecture", () => {
  it("`refresh` avec une nouvelle entrée en tête : la nouvelle liste, toutes cases décochées", async () => {
    const { history, user, refresh } = setup([rowOf(1)]);
    await screen.findByRole("heading", { name: "Liste de courses" });
    await user.click(carrot());
    await history.store.add("jeton", rowOf(2, { date: "2026-11-24" }).entry, PDF);
    refresh(1);
    expect(
      await screen.findByRole("heading", { level: 3, name: "mardi 24 novembre 2026" }),
    ).toBeTruthy();
    expect(boxes().every((input) => !input.checked)).toBe(true);
    expect(counter()).toBe("0 cochée sur 11");
  });

  it("une relecture de la même entrée pendant une écriture retenue ne décoche rien", async () => {
    const { history, user, refresh } = setup([rowOf(1)]);
    await screen.findByRole("heading", { name: "Liste de courses" });
    history.hold("check");
    await user.click(carrot());
    refresh(1);
    await waitFor(() => {
      expect(history.lists.count).toBe(2);
    });
    await flush();
    expect(carrot().checked).toBe(true);
    history.release();
    await flush();
    expect(carrot().checked).toBe(true);
  });

  it.each(["succès", "rejet"])(
    "nouveau menu pendant une écriture de l'ancien (%s) : les cases du nouveau et l'absence d'alerte ne changent pas",
    async (outcome) => {
      const { history, user, refresh } = setup([rowOf(1)]);
      await screen.findByRole("heading", { name: "Liste de courses" });
      if (outcome === "rejet") history.failNext("check", "Enregistrement des cases impossible.");
      history.hold("check");
      await user.click(carrot());
      await history.store.add("jeton", rowOf(2, { date: "2026-11-24" }).entry, PDF);
      refresh(1);
      await screen.findByRole("heading", { level: 3, name: "mardi 24 novembre 2026" });
      expect(boxes().every((input) => !input.checked)).toBe(true);
      history.release();
      await flush();
      expect(boxes().every((input) => !input.checked)).toBe(true);
      expect(screen.queryByRole("alert")).toBeNull();
    },
  );
});

const carrotInsee = INSEE_TABLE["fresh|carotte"]!;
const CARROT_INSEE_LINE = `≈ ${euroText((1100 / 1000) * carrotInsee.euros)} · ${unitPriceText("kg", carrotInsee.euros)} · ${sourceText({ kind: "insee", month: carrotInsee.month })}`;
const myPrice = (name: string) =>
  screen.getByRole("button", { name: `Modifier le prix : ${name}` });
const dialog = () => screen.getByRole("dialog");
const priceField = () => within(dialog()).getByLabelText<HTMLInputElement>("Prix (€)");
const saveButton = () => within(dialog()).getByRole("button", { name: "Enregistrer" });
const FIELD_ERROR = "Entrez un prix entre 0,01 € et 1 000 €.";
const totalLine = () => screen.getByText(/^Coût estimé : /).textContent;
const carrotRow: ManualPriceRow = {
  key: "fresh|carotte",
  unit: "kg",
  cents: 250,
  date: "2026-11-10",
};

// Le menu d'exemple avec, en plus, 2 carottes en pièces : la ligne carotte a alors deux unités (g et pièce).
const MENU_WITH_PIECES = MenuSchema.parse({
  ...menuReply,
  dishes: withPantry().map((dish, at) =>
    at === 0
      ? { ...dish, ingredients: [...dish.ingredients, ing("carotte", 2, { unit: "piece" })] }
      : dish,
  ),
});

describe("IngredientsScreen : coût", () => {
  it("affiche le total, la mention, la source de chaque ligne connue et « prix inconnu »", async () => {
    setup([rowOf(1)]);
    await screen.findByRole("heading", { name: "Liste de courses" });
    const index = buildIngredientIndex(REFERENTIAL);
    const expected = totalText(menuCost(MENU, index, [inseeLookup(INSEE_TABLE)]));
    expect(totalLine()).toBe(expected);
    expect(totalLine()).toMatch(/^Coût estimé : au moins \d+,\d{2} € · \d+ prix inconnus?$/);
    expect(
      screen.getByText(
        "Placard non compris. Ordre de grandeur : moyennes de relevés en magasin, pas le prix de votre drive.",
      ),
    ).toBeTruthy();
    expect(labelText(carrot())).toContain(CARROT_INSEE_LINE);
    expect(box(/^Cuisse de poulet /).labels?.[0]?.textContent).toContain("prix inconnu");
    expect(
      screen.getByText("Sources : INSEE, prix moyens de vente au détail, Licence Ouverte 2.0."),
    ).toBeTruthy();
  });

  it("le placard n'a ni coût ni bouton « Mon prix »", async () => {
    setup([rowOf(1)]);
    await screen.findByRole("heading", { name: "Liste de courses" });
    expect(labelText(box(/^Placard/))).not.toMatch(/≈|prix inconnu/);
    expect(screen.getAllByRole("button", { name: /^Modifier le prix : / })).toHaveLength(10);
    expect(screen.getAllByText("Mon prix")).toHaveLength(10);
    expect(screen.queryByRole("button", { name: /Modifier le prix : Placard/ })).toBeNull();
  });

  it("un clic sur « Mon prix » ne coche pas la case", async () => {
    const { user } = setup([rowOf(1)]);
    await screen.findByRole("heading", { name: "Liste de courses" });
    await user.click(myPrice("Carotte"));
    expect(dialog()).toBeTruthy();
    expect(carrot().checked).toBe(false);
    expect(counter()).toBe("0 cochée sur 11");
  });

  it("au clavier, Tab atteint la case puis « Mon prix » de la même ligne", async () => {
    const { user } = setup([rowOf(1)]);
    await screen.findByRole("heading", { name: "Liste de courses" });
    const first = boxes()[0]!;
    first.focus();
    await user.tab();
    expect(document.activeElement).toBe(
      screen.getAllByRole("button", { name: /^Modifier le prix : / })[0],
    );
  });
});

describe("IngredientsScreen : fenêtre de saisie pendant une écriture", () => {
  async function startHeldWrite() {
    const view = setup([rowOf(1)], undefined, [], (prices) => {
      prices.state.holdSet = true;
    });
    await screen.findByRole("heading", { name: "Liste de courses" });
    await view.user.click(myPrice("Carotte"));
    await view.user.type(priceField(), "2,5");
    await view.user.click(saveButton());
    await waitFor(() => {
      expect(view.priceStore.held).toHaveLength(1);
    });
    return view;
  }

  it("ne se ferme par aucun moyen, puis montre l'échec quand l'écriture rejette", async () => {
    const { user, priceStore } = await startHeldWrite();
    expect(dialog().querySelector(".mantine-Modal-close")).toBeNull();
    expect(
      within(dialog()).getByRole<HTMLButtonElement>("button", { name: "Annuler" }).disabled,
    ).toBe(true);
    await user.keyboard("{Escape}");
    expect(screen.getByRole("dialog")).toBeTruthy();
    await user.click(document.querySelector(".mantine-Modal-inner")!);
    expect(screen.getByRole("dialog")).toBeTruthy();
    priceStore.held[0]!.reject("Enregistrement du prix impossible.");
    const alert = await within(dialog()).findByRole("alert");
    expect(within(alert).getByText("Prix non enregistré")).toBeTruthy();
    expect(alert.textContent).toContain("Enregistrement du prix impossible.");
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(dialog().querySelector(".mantine-Modal-close")).not.toBeNull();
  });

  it("une écriture qui réussit ferme la fenêtre à la fin, et elle reste fermée", async () => {
    const { priceStore } = await startHeldWrite();
    expect(screen.getByRole("dialog")).toBeTruthy();
    priceStore.held[0]!.resolve();
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
    await flush();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(priceStore.sets).toHaveLength(1);
    expect(labelText(carrot())).toContain("votre prix du 16/11/2026");
  });
});

describe("IngredientsScreen : produit sans prix personnel possible", () => {
  it("un ingrédient inconnu de plus de 200 octets : le texte à la place du bouton, les autres lignes gardent le leur", async () => {
    const longName = "z".repeat(200);
    const dishes = withPantry().map((dish, at) =>
      at === 0
        ? {
            ...dish,
            ingredients: [...dish.ingredients, ing(longName, 400, { category: "poultry" })],
          }
        : dish,
    );
    setup([rowOf(1, { menu: MenuSchema.parse({ ...menuReply, dishes }) })]);
    await screen.findByRole("heading", { name: "Liste de courses" });
    expect(
      screen.getAllByText(
        "Prix personnel indisponible pour ce produit (nom trop long ou illisible).",
      ),
    ).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: /^Modifier le prix : / })).toHaveLength(10);
    expect(screen.queryByRole("button", { name: /Modifier le prix : Z{5}/ })).toBeNull();
    expect(boxes()).toHaveLength(12);
  });
});

describe("IngredientsScreen : saisie d'un prix", () => {
  it("2,50 puis Enregistrer : le prix part au magasin, la fenêtre se ferme, la ligne et le total changent", async () => {
    const { priceStore, user } = setup([rowOf(1)]);
    await screen.findByRole("heading", { name: "Liste de courses" });
    const before = totalLine();
    await user.click(myPrice("Carotte"));
    expect(screen.getByRole("dialog", { name: "Prix de « Carotte »" })).toBeTruthy();
    expect(screen.getByText("Prix pour le kilo")).toBeTruthy();
    await user.type(priceField(), "2,50");
    await user.click(saveButton());
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
    expect(priceStore.sets).toEqual([
      { key: "fresh|carotte", unit: "kg", cents: 250, date: "2026-11-16" },
    ]);
    expect(labelText(carrot())).toContain("≈ 2,75 € · 2,50 €/kg · votre prix du 16/11/2026");
    expect(totalLine()).not.toBe(before);
    expect(screen.getByText(/^Sources : votre table de prix · INSEE, prix moyens/)).toBeTruthy();
  });

  it.each([
    ["0", "0"],
    ["1500", "1500"],
  ])(
    "%s, Tab, clic sur Enregistrer : message exact, aucun appel, le champ garde la saisie",
    async (typed, shown) => {
      const { priceStore, user } = setup([rowOf(1)]);
      await screen.findByRole("heading", { name: "Liste de courses" });
      await user.click(myPrice("Carotte"));
      await user.type(priceField(), typed);
      expect(screen.queryByText(FIELD_ERROR)).toBeNull();
      await user.tab();
      await user.click(saveButton());
      expect(screen.getByText(FIELD_ERROR)).toBeTruthy();
      expect(priceStore.sets).toEqual([]);
      expect(priceField().value).toBe(shown);
      expect(screen.getByRole("dialog")).toBeTruthy();
    },
  );

  it("un champ vide : l'erreur apparaît au clic sur Enregistrer, sans appel", async () => {
    const { priceStore, user } = setup([rowOf(1)]);
    await screen.findByRole("heading", { name: "Liste de courses" });
    await user.click(myPrice("Carotte"));
    await user.click(saveButton());
    expect(screen.getByText(FIELD_ERROR)).toBeTruthy();
    expect(priceStore.sets).toEqual([]);
  });

  it("2,5 : 250 centimes", async () => {
    const { priceStore, user } = setup([rowOf(1)]);
    await screen.findByRole("heading", { name: "Liste de courses" });
    await user.click(myPrice("Carotte"));
    await user.type(priceField(), "2,5");
    await user.click(saveButton());
    await waitFor(() => {
      expect(priceStore.sets.map((row) => row.cents)).toEqual([250]);
    });
  });

  it("prix existant à la pièce et ligne en grammes : texte explicatif, champ vide, unité kilo", async () => {
    const { priceStore, user } = setup([rowOf(1)], undefined, [
      { key: "fresh|carotte", unit: "piece", cents: 59, date: "2026-11-10" },
    ]);
    await screen.findByRole("heading", { name: "Liste de courses" });
    await waitFor(() => {
      expect(myPrice("Carotte").hasAttribute("disabled")).toBe(false);
    });
    await user.click(myPrice("Carotte"));
    expect(
      screen.getByText(
        "Votre prix actuel : 0,59 €/pièce. Cette liste compte en kilos : en enregistrer un ici remplace l'ancien.",
      ),
    ).toBeTruthy();
    expect(priceField().value).toBe("");
    expect(screen.getByText("Prix pour le kilo")).toBeTruthy();
    await user.type(priceField(), "3");
    await user.click(saveButton());
    await waitFor(() => {
      expect(priceStore.sets).toEqual([
        { key: "fresh|carotte", unit: "kg", cents: 300, date: "2026-11-16" },
      ]);
    });
  });

  it("ligne en grammes et en pièces : unité de départ, préremplissage, changement d'unité", async () => {
    const { user } = setup([rowOf(1, { menu: MENU_WITH_PIECES })], undefined, [carrotRow]);
    await screen.findByRole("heading", { name: "Liste de courses" });
    await waitFor(() => {
      expect(myPrice("Carotte").hasAttribute("disabled")).toBe(false);
    });
    await user.click(myPrice("Carotte"));
    const kilo = within(dialog()).getByRole("radio", { name: "le kilo" });
    const piece = within(dialog()).getByRole("radio", { name: "la pièce" });
    expect(within(dialog()).queryByRole("radio", { name: "le litre" })).toBeNull();
    expect((kilo as HTMLInputElement).checked).toBe(true);
    expect(priceField().value).toBe("2,5");
    await user.click(piece);
    expect(priceField().value).toBe("");
    await user.click(kilo);
    expect(priceField().value).toBe("2,5");
  });

  it("écriture refusée : « Prix non enregistré » et le message, la fenêtre reste ouverte, rien ne change", async () => {
    const { priceStore, user } = setup([rowOf(1)], undefined, [], (prices) => {
      prices.state.setError = "Enregistrement du prix impossible.\u202E";
    });
    await screen.findByRole("heading", { name: "Liste de courses" });
    await user.click(myPrice("Carotte"));
    await user.type(priceField(), "2,5");
    await user.click(saveButton());
    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText("Prix non enregistré")).toBeTruthy();
    expect(alert.textContent).toContain("Enregistrement du prix impossible.");
    expect(alert.textContent).not.toMatch(INVISIBLE);
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(priceStore.rows()).toEqual([]);
    expect(labelText(carrot())).toContain(CARROT_INSEE_LINE);
  });

  it("« Retirer mon prix » supprime la clé et la ligne revient à l'INSEE", async () => {
    const { priceStore, user } = setup([rowOf(1)], undefined, [carrotRow]);
    await screen.findByRole("heading", { name: "Liste de courses" });
    await waitFor(() => {
      expect(labelText(carrot())).toContain("votre prix du 10/11/2026");
    });
    await user.click(myPrice("Carotte"));
    await user.click(within(dialog()).getByRole("button", { name: "Retirer mon prix" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
    expect(priceStore.deletes).toEqual(["fresh|carotte"]);
    expect(labelText(carrot())).toContain(CARROT_INSEE_LINE);
  });

  it("sans prix saisi, « Retirer mon prix » n'est pas proposé ; « Annuler » ferme sans rien écrire", async () => {
    const { priceStore, user } = setup([rowOf(1)]);
    await screen.findByRole("heading", { name: "Liste de courses" });
    await user.click(myPrice("Carotte"));
    expect(within(dialog()).queryByRole("button", { name: "Retirer mon prix" })).toBeNull();
    await user.click(within(dialog()).getByRole("button", { name: "Annuler" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(priceStore.sets).toEqual([]);
    expect(priceStore.deletes).toEqual([]);
  });

  it("table de prix illisible : alerte jaune, coûts de l'INSEE gardés, « Mon prix » désactivé, « Réessayer » relit", async () => {
    const { priceStore, user } = setup([rowOf(1)], undefined, [], (prices) => {
      prices.state.listError = "Lecture de la table de prix impossible.";
    });
    await screen.findByRole("heading", { name: "Liste de courses" });
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain(
      "Votre table de prix ne peut pas être lue : les coûts utilisent seulement les autres sources.",
    );
    expect(alert.textContent).toContain("Lecture de la table de prix impossible.");
    expect(labelText(carrot())).toContain(CARROT_INSEE_LINE);
    for (const button of screen.getAllByRole("button", { name: /^Modifier le prix/ })) {
      expect(button.hasAttribute("disabled")).toBe(true);
    }
    priceStore.state.listError = null;
    await user.click(within(alert).getByRole("button", { name: "Réessayer" }));
    await waitFor(() => {
      expect(screen.queryByRole("alert")).toBeNull();
    });
    expect(priceStore.state.lists).toBe(2);
    expect(myPrice("Carotte").hasAttribute("disabled")).toBe(false);
  });
});

const OP_STAT = { median: 2.4, count: 3, first: "2026-06-01", last: "2026-11-10" };
const OP_SUMMARY: OpenPricesSummary = {
  version: 1,
  fetchedAt: "2026-11-14",
  from: "2026-05-14",
  to: "2026-11-14",
  usable: { category: 14, product: 14 },
  prices: { "fresh|carotte": { kg: OP_STAT } },
};
const OP_ERROR_LINE = (message: string) =>
  `Dernière mise à jour Open Prices impossible : ${message}. Nouvel essai au prochain lancement, demain au plus tôt.`;

describe("IngredientsScreen : état d'Open Prices", () => {
  it("résumé en service : le jour, la licence ODbL, et la ligne carotte cite Open Prices", async () => {
    const openPrices = fakeOpenPricesStore({ attemptedAt: "2026-11-14", summary: OP_SUMMARY });
    setup([rowOf(1)], undefined, [], undefined, openPrices);
    await screen.findByRole("heading", { name: "Liste de courses" });
    expect(
      await screen.findByText(
        "Prix Open Prices du 14/11/2026 (Open Food Facts, licence ODbL), mis à jour chaque semaine.",
      ),
    ).toBeTruthy();
    await waitFor(() => {
      expect(labelText(carrot())).toContain(
        "Open Prices, médiane de 3 relevés (01/06/2026 au 10/11/2026)",
      );
    });
    expect(
      screen.getByText(/^Sources : Open Prices \(Open Food Facts\), licence ODbL/),
    ).toBeTruthy();
  });

  it("aucun résumé : « pas encore téléchargés », sans erreur ; les coûts INSEE restent", async () => {
    const openPrices = fakeOpenPricesStore({ attemptedAt: fixedDay });
    setup([rowOf(1)], undefined, [], undefined, openPrices);
    await screen.findByRole("heading", { name: "Liste de courses" });
    expect(
      await screen.findByText(
        "Prix Open Prices pas encore téléchargés : les coûts utilisent votre table et l'INSEE.",
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/Dernière mise à jour Open Prices impossible/)).toBeNull();
    expect(labelText(carrot())).toContain(CARROT_INSEE_LINE);
  });

  it("téléchargement en cours : le texte et un chargement", async () => {
    const openPrices = fakeOpenPricesStore({});
    openPrices.state.holdDownload = true;
    const { prices } = setup([rowOf(1)], undefined, [], undefined, openPrices);
    await screen.findByRole("heading", { name: "Liste de courses" });
    void prices.refreshOpenPricesIfDue();
    const line = await screen.findByText("Téléchargement des prix Open Prices en cours…");
    expect(line.parentElement?.querySelector(".mantine-Loader-root")).not.toBeNull();
  });

  it("échec du calcul sans résumé : l'erreur en orange s'ajoute, les coûts INSEE et l'écran restent", async () => {
    const openPrices = fakeOpenPricesStore({});
    const { prices } = setup([rowOf(1)], undefined, [], undefined, openPrices);
    await screen.findByRole("heading", { name: "Liste de courses" });
    await prices.refreshOpenPricesIfDue();
    expect(
      await screen.findByText(OP_ERROR_LINE("Fichier Open Prices illisible : prices")),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "Prix Open Prices pas encore téléchargés : les coûts utilisent votre table et l'INSEE.",
      ),
    ).toBeTruthy();
    expect(labelText(carrot())).toContain(CARROT_INSEE_LINE);
    expect(myPrice("Carotte").hasAttribute("disabled")).toBe(false);
  });

  it("échec avec un résumé en service : la ligne d'état dit le jour du résumé gardé, l'erreur s'ajoute", async () => {
    const old = { ...OP_SUMMARY, fetchedAt: "2026-11-05" };
    const openPrices = fakeOpenPricesStore({ attemptedAt: "2026-11-05", summary: old });
    const { prices } = setup([rowOf(1)], undefined, [], undefined, openPrices);
    await screen.findByRole("heading", { name: "Liste de courses" });
    await prices.refreshOpenPricesIfDue();
    expect(
      await screen.findByText(OP_ERROR_LINE("Fichier Open Prices illisible : prices")),
    ).toBeTruthy();
    expect(screen.getByText(/^Prix Open Prices du 05\/11\/2026 /)).toBeTruthy();
  });

  it("lecture du résumé impossible : le texte propre à la lecture, aucun téléchargement", async () => {
    const openPrices = fakeOpenPricesStore({});
    openPrices.state.loadError = "Lecture des prix Open Prices impossible.";
    const { prices } = setup([rowOf(1)], undefined, [], undefined, openPrices);
    await screen.findByRole("heading", { name: "Liste de courses" });
    expect(
      await screen.findByText(
        "Lecture des prix Open Prices impossible. Nouvel essai au prochain lancement.",
      ),
    ).toBeTruthy();
    await prices.refreshOpenPricesIfDue();
    expect(openPrices.calls.filter((call) => call.startsWith("download"))).toEqual([]);
    expect(screen.queryByText(/demain au plus tôt/)).toBeNull();
    expect(screen.queryByText(/pas encore téléchargés/)).toBeNull();
    expect(screen.queryByText(/^Prix Open Prices du /)).toBeNull();
  });
});

function appSetup(rows: HistoryRow[]) {
  const settings = fakeSettingsStore();
  const keeper = createSettingsKeeper(settings.store);
  const history = fakeHistoryStore(rows);
  const invoke: Invoke = () => Promise.reject(new Error("jamais appelé"));
  const priceStore = fakePriceStore();
  const prices = createPriceKeeper(priceStore.store, { clock: fixedClock });
  const session = createSession({
    settings: keeper,
    clock: fixedClock,
    history: history.store,
    createModel: fakeMenuModel([]).createModel,
    renderPdf: fakeRenderPdf().renderPdf,
    newToken: fakeNewToken(),
    priceLookups: () => prices.snapshot().lookups,
  });
  const services = {
    settings: keeper,
    secretAdmin: createKeychainSecretAdmin(invoke),
    session,
    history: history.store,
    checks: createCheckKeeper(history.store),
    prices,
  };
  renderWithMantine(<App services={services} />);
  return { history, user: userEvent.setup() };
}

describe("IngredientsScreen : dans l'app", () => {
  it("quitter l'écran pendant une écriture puis revenir : la case reste cochée avant la libération", async () => {
    const { history, user } = appSetup([rowOf(1)]);
    await user.click(screen.getByRole("button", { name: "Ingrédients" }));
    await screen.findByRole("heading", { name: "Liste de courses" });
    history.hold("check");
    await user.click(carrot());
    await user.click(screen.getByRole("button", { name: "Historique" }));
    await screen.findByText("mardi 17 novembre 2026");
    await user.click(screen.getByRole("button", { name: "Ingrédients" }));
    await screen.findByRole("heading", { name: "Liste de courses" });
    // La base dit encore `[]` : seul le propriétaire a l'état voulu.
    expect(history.rows()[0]?.checked).toBe("[]");
    expect(carrot().checked).toBe(true);
    history.release();
    await flush();
    expect(carrot().checked).toBe(true);
    expect(history.rows()[0]?.checked).toBe('["fresh|carotte"]');
  });
});
