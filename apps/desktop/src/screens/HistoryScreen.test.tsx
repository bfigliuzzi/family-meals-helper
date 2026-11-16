import { MantineProvider } from "@mantine/core";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MenuSchema, serializeHistoryEntry } from "core";
import type { HistoryEntry, HistoryRow, HistoryStore } from "core";
import { describe, expect, it, vi } from "vitest";
import { PDF_GONE, fakeHistoryStore } from "../test/fakes.ts";
import menuReply from "../test/fixtures/menu-reply.json";
import { theme } from "../theme.ts";
import { renderWithMantine } from "../test/render.tsx";
import { HistoryScreen } from "./HistoryScreen.tsx";

const MENU = MenuSchema.parse(menuReply);
const FIRST_DISH = "a. Cabillaud, fondue de poireaux et riz complet";
const PDF = new TextEncoder().encode("%PDF-1.7 exemple");
const INVISIBLE = /[\u202E\u200B]/;

function rowOf(id: number, overrides: Partial<HistoryEntry> = {}): HistoryRow {
  const entry: HistoryEntry = {
    version: 1,
    date: "2026-11-16",
    request: "un bœuf bourguignon",
    sessionDay: "sun",
    menu: MENU,
    sheet: "detail",
    ...overrides,
  };
  return { id, entry: serializeHistoryEntry(entry), checked: "[]" };
}

const broken = (id: number): HistoryRow => ({ id, entry: "{pas du json", checked: "[]" });

function setup(
  rows: HistoryRow[] = [],
  prepare: (history: ReturnType<typeof fakeHistoryStore>) => void = () => undefined,
) {
  const history = fakeHistoryStore(rows);
  prepare(history);
  const onNewSession = vi.fn();
  let store = history.store;
  let shownRefresh = 0;
  const view = (refresh: number) => (
    <HistoryScreen history={store} refresh={refresh} onNewSession={onNewSession} />
  );
  const { rerender } = renderWithMantine(view(0));
  const again = (refresh: number) => (
    <MantineProvider theme={theme} env="test">
      {view(refresh)}
    </MantineProvider>
  );
  return {
    history,
    onNewSession,
    user: userEvent.setup(),
    refresh: (value: number) => {
      shownRefresh = value;
      rerender(again(value));
    },
    // Remplace le magasin donné à l'écran, sans changer `refresh`.
    swapStore: (next: HistoryStore) => {
      store = next;
      rerender(again(shownRefresh));
    },
  };
}

const cards = () => screen.getAllByRole("heading", { level: 3 });

describe("HistoryScreen : états", () => {
  it("montre le chargement, puis l'état vide avec son bouton", async () => {
    const { onNewSession, user } = setup();
    expect(screen.getByText("Chargement de l'historique…")).toBeTruthy();
    expect(await screen.findByText(/Aucun menu validé pour l'instant/)).toBeTruthy();
    expect(screen.queryByText("Chargement de l'historique…")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Aller à Nouvelle session" }));
    expect(onNewSession).toHaveBeenCalledTimes(1);
  });

  it("liste les entrées dans l'ordre, date en toutes lettres, demande et plats nettoyés", async () => {
    setup([
      rowOf(2, {
        request: "un bœuf\u202E bourguignon\u200B",
        menu: MenuSchema.parse({
          dishes: menuReply.dishes.map((dish, index) =>
            index === 0 ? { ...dish, name: "Cabil\u200Blaud\u202E" } : dish,
          ),
        }),
      }),
      rowOf(1, { date: "2026-11-09", sessionDay: "sat" }),
    ]);
    await screen.findAllByRole("heading", { level: 3 });
    expect(cards().map((title) => title.textContent)).toEqual([
      "lundi 16 novembre 2026",
      "lundi 9 novembre 2026",
    ]);
    expect(screen.getAllByText("Le plus récent")).toHaveLength(1);
    expect(screen.getByText("Session le dimanche · 5 dîners")).toBeTruthy();
    expect(screen.getByText("Session le samedi · 5 dîners")).toBeTruthy();
    const requests = screen.getAllByText(/Demande : « un bœuf bourguignon »/);
    expect(requests).toHaveLength(2);
    for (const request of requests) {
      expect(request.getAttribute("title")).toBe("un bœuf bourguignon");
    }
    expect(screen.getByText("a. Cabillaud")).toBeTruthy();
    expect(screen.getAllByText(FIRST_DISH)).toHaveLength(1);
    expect(document.body.textContent).not.toMatch(INVISIBLE);
  });

  it("une année avant 100 ne s'affiche pas en 19xx", async () => {
    setup([rowOf(1, { date: "0099-11-16" })]);
    const [title] = await screen.findAllByRole("heading", { level: 3 });
    expect(title?.textContent).not.toContain("1999");
    expect(title?.textContent).toMatch(/\b99\b/);
    expect(
      screen.getByRole("button", { name: /^Ouvrir la fiche du .* novembre 99$/ }),
    ).toBeTruthy();
  });

  it("badge d'avertissement selon la fiche", async () => {
    setup([rowOf(3, { sheet: "too-long" }), rowOf(2, { sheet: "fallback" }), rowOf(1)]);
    await screen.findAllByRole("heading", { level: 3 });
    expect(screen.getByText("Session de plus de 3 h")).toBeTruthy();
    expect(screen.getByText("Grandes phases seulement")).toBeTruthy();
  });

  it("une entrée illisible : alerte au singulier", async () => {
    setup([rowOf(2), broken(1)]);
    expect(
      await screen.findByText("1 entrée de l'historique est illisible : elle est ignorée."),
    ).toBeTruthy();
  });

  it("deux entrées illisibles : l'alerte est au pluriel", async () => {
    setup([broken(3), broken(2), rowOf(1)]);
    expect(
      await screen.findByText("2 entrées de l'historique sont illisibles : elles sont ignorées."),
    ).toBeTruthy();
  });

  it("erreur de lecture : alerte et « Réessayer », qui relit", async () => {
    const { user } = setup([rowOf(1)], (history) => {
      history.failNext("list", "Base des réglages indisponible : verrou\u202E");
    });
    expect(await screen.findByText("Historique indisponible")).toBeTruthy();
    expect(screen.getByText("Base des réglages indisponible : verrou")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(INVISIBLE);
    await user.click(screen.getByRole("button", { name: "Réessayer" }));
    expect(await screen.findByText("lundi 16 novembre 2026")).toBeTruthy();
    expect(screen.queryByText("Historique indisponible")).toBeNull();
  });

  it("« Réessayer » est chargé pendant la relecture : un double clic ne relit qu'une fois", async () => {
    const { history, user } = setup([rowOf(1)], (store) => {
      store.failNext("list", "Base indisponible");
    });
    await screen.findByText("Historique indisponible");
    expect(history.lists.count).toBe(1);
    history.hold("list");
    const retry = screen.getByRole("button", { name: "Réessayer" });
    await user.dblClick(retry);
    expect(history.lists.count).toBe(2);
    expect(retry.hasAttribute("data-loading")).toBe(true);
    history.release();
    expect(await screen.findByText("lundi 16 novembre 2026")).toBeTruthy();
    expect(history.lists.count).toBe(2);
  });

  it("lecture automatique retenue après une erreur : « Réessayer » est chargé, désactivé, et un clic ne lance rien", async () => {
    const { history, user, refresh } = setup([rowOf(1)], (store) => {
      store.failNext("list", "Base indisponible");
    });
    await screen.findByText("Historique indisponible");
    expect(history.lists.count).toBe(1);
    history.hold("list");
    refresh(1);
    await waitFor(() => {
      expect(history.lists.count).toBe(2);
    });
    const retry = screen.getByRole("button", { name: "Réessayer" });
    expect(retry.hasAttribute("data-loading")).toBe(true);
    expect(retry.hasAttribute("disabled")).toBe(true);
    await user.click(retry);
    expect(history.lists.count).toBe(2);
    history.release();
    expect(await screen.findByText("lundi 16 novembre 2026")).toBeTruthy();
    expect(history.lists.count).toBe(2);
  });

  it("A retenue, B lancée par `refresh`, A finit : « Réessayer » reste désactivé jusqu'à B", async () => {
    const { history, user, refresh } = setup([rowOf(1)], (store) => {
      store.failNext("list", "Base indisponible");
    });
    await screen.findByText("Historique indisponible");
    history.hold("list");
    const retry = screen.getByRole("button", { name: "Réessayer" });
    await user.click(retry);
    history.hold("list");
    refresh(1);
    await waitFor(() => {
      expect(history.lists.count).toBe(3);
    });
    history.release();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.getByRole("button", { name: "Réessayer" }).hasAttribute("data-loading")).toBe(
      true,
    );
    expect(history.lists.count).toBe(3);
    history.release();
    expect(await screen.findByText("lundi 16 novembre 2026")).toBeTruthy();
  });

  it("A retenue, B échoue avant A : « Réessayer » se réactive aussitôt, et A ne change plus rien", async () => {
    const { history, user, refresh } = setup([rowOf(1)], (store) => {
      store.failNext("list", "Première erreur");
    });
    await screen.findByText("Première erreur");
    history.hold("list");
    await user.click(screen.getByRole("button", { name: "Réessayer" }));
    history.failNext("list", "Seconde erreur");
    refresh(1);
    expect(await screen.findByText("Seconde erreur")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Réessayer" }).hasAttribute("data-loading")).toBe(
      false,
    );
    history.release();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.getByText("Seconde erreur")).toBeTruthy();
    expect(screen.queryByText("lundi 16 novembre 2026")).toBeNull();
    const retry = screen.getByRole("button", { name: "Réessayer" });
    expect(retry.hasAttribute("data-loading")).toBe(false);
    expect(retry.hasAttribute("disabled")).toBe(false);
    const before = history.lists.count;
    await user.click(retry);
    await waitFor(() => {
      expect(history.lists.count).toBe(before + 1);
    });
  });

  it("un nouveau magasin dont la lecture est retenue : « Réessayer » est chargé, désactivé, et un clic ne lance rien", async () => {
    const { history, user, swapStore } = setup([rowOf(1)], (store) => {
      store.failNext("list", "Base indisponible");
    });
    await screen.findByText("Historique indisponible");
    const other = fakeHistoryStore([rowOf(2)]);
    other.hold("list");
    swapStore(other.store);
    await waitFor(() => {
      expect(other.lists.count).toBe(1);
    });
    const retry = screen.getByRole("button", { name: "Réessayer" });
    expect(retry.hasAttribute("data-loading")).toBe(true);
    expect(retry.hasAttribute("disabled")).toBe(true);
    await user.click(retry);
    expect(other.lists.count).toBe(1);
    expect(history.lists.count).toBe(1);
    other.release();
    expect(await screen.findByText("lundi 16 novembre 2026")).toBeTruthy();
    expect(other.lists.count).toBe(1);
  });

  it("`refresh` 1 puis retour à 0 avec lectures retenues : « Réessayer » reste chargé pendant la dernière", async () => {
    const { history, user, refresh } = setup([rowOf(1)], (store) => {
      store.failNext("list", "Base indisponible");
    });
    await screen.findByText("Historique indisponible");
    history.hold("list");
    refresh(1);
    await waitFor(() => {
      expect(history.lists.count).toBe(2);
    });
    history.hold("list");
    refresh(0);
    await waitFor(() => {
      expect(history.lists.count).toBe(3);
    });
    const retry = screen.getByRole("button", { name: "Réessayer" });
    expect(retry.hasAttribute("data-loading")).toBe(true);
    expect(retry.hasAttribute("disabled")).toBe(true);
    await user.click(retry);
    expect(history.lists.count).toBe(3);
    history.release();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.getByRole("button", { name: "Réessayer" }).hasAttribute("data-loading")).toBe(
      true,
    );
    history.release();
    expect(await screen.findByText("lundi 16 novembre 2026")).toBeTruthy();
    expect(history.lists.count).toBe(3);
  });
});

describe("HistoryScreen : fiche", () => {
  it("« Ouvrir la fiche » appelle openPdf avec l'id, et les noms accessibles citent la date", async () => {
    const { history, user } = setup([rowOf(4)]);
    await screen.findByText("lundi 16 novembre 2026");
    const open = screen.getByRole("button", { name: "Ouvrir la fiche du 16 novembre 2026" });
    expect(open.textContent).toBe("Ouvrir la fiche");
    await user.click(open);
    await waitFor(() => {
      expect(history.opened).toEqual([4]);
    });
    const exportButton = screen.getByRole("button", {
      name: "Exporter dans Téléchargements la fiche du 16 novembre 2026",
    });
    expect(exportButton.textContent).toBe("Exporter dans Téléchargements");
  });

  it("la zone `status` de chaque fiche existe, vide, avant toute action", async () => {
    setup([rowOf(2), rowOf(1)]);
    await screen.findAllByRole("heading", { level: 3 });
    const zones = screen.getAllByRole("status");
    expect(zones).toHaveLength(2);
    for (const zone of zones) expect(zone.textContent).toBe("");
  });

  it("« Exporter » écrit le nom du fichier seul ; un second export prend le nom suivant", async () => {
    const { history, user } = setup([rowOf(1)]);
    await screen.findByText("lundi 16 novembre 2026");
    const exportButton = screen.getByRole("button", { name: /^Exporter dans Téléchargements/ });
    await user.click(exportButton);
    expect(
      await screen.findByText(/Copiée dans Téléchargements : menu-batch-2026-11-16\.pdf$/),
    ).toBeTruthy();
    await user.click(exportButton);
    expect(
      await screen.findByText(/Copiée dans Téléchargements : menu-batch-2026-11-16-2\.pdf$/),
    ).toBeTruthy();
    expect(history.exported).toEqual([1, 1]);
    expect(document.body.textContent).not.toContain("/Users/test");
  });

  it("une entrée purgée pendant l'affichage : la phrase du Rust, dans l'alerte de la fiche", async () => {
    const { history, user } = setup([rowOf(1)]);
    await screen.findByText("lundi 16 novembre 2026");
    history.failNext("open", PDF_GONE);
    await user.click(screen.getByRole("button", { name: /^Ouvrir la fiche/ }));
    const status = screen.getByRole("status");
    expect(await within(status).findByText(PDF_GONE)).toBeTruthy();
    history.failNext("export", PDF_GONE);
    await user.click(screen.getByRole("button", { name: /^Exporter dans Téléchargements/ }));
    await waitFor(() => {
      expect(within(status).getByText(PDF_GONE)).toBeTruthy();
    });
  });

  it("un export retenu n'est pas relancé quand « Ouvrir » se termine : « Exporter » reste chargé", async () => {
    const { history, user } = setup([rowOf(1)], (store) => {
      store.hold("export");
    });
    await screen.findByText("lundi 16 novembre 2026");
    const exportButton = screen.getByRole("button", { name: /^Exporter dans Téléchargements/ });
    await user.click(exportButton);
    await user.click(screen.getByRole("button", { name: /^Ouvrir la fiche/ }));
    await waitFor(() => {
      expect(history.opened).toEqual([1]);
    });
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /^Ouvrir la fiche/ }).hasAttribute("data-loading"),
      ).toBe(false);
    });
    expect(exportButton.hasAttribute("data-loading")).toBe(true);
    await user.click(exportButton);
    expect(history.exported).toEqual([1]);
    history.release();
    expect(await screen.findByText(/Copiée dans Téléchargements/)).toBeTruthy();
    expect(history.exported).toEqual([1]);
  });

  it("le message d'erreur d'une action est nettoyé par `printable`", async () => {
    const { history, user } = setup([rowOf(1)]);
    await screen.findByText("lundi 16 novembre 2026");
    history.failNext("export", "Copie\u202E impossible\u200B.");
    await user.click(screen.getByRole("button", { name: /^Exporter dans Téléchargements/ }));
    const status = screen.getByRole("status");
    expect(await within(status).findByText("Copie impossible.")).toBeTruthy();
    expect(status.textContent).not.toMatch(INVISIBLE);
  });

  it("double clic sur « Exporter » : un seul export", async () => {
    const { history, user } = setup([rowOf(1)], (store) => {
      store.hold("export");
    });
    await screen.findByText("lundi 16 novembre 2026");
    await user.dblClick(screen.getByRole("button", { name: /^Exporter dans Téléchargements/ }));
    expect(history.exported).toEqual([1]);
    history.release();
    expect(await screen.findByText(/Copiée dans Téléchargements/)).toBeTruthy();
    expect(history.exported).toEqual([1]);
  });

  it("le second clic d'un double clic (detail 2) n'exporte pas", async () => {
    const { history } = setup([rowOf(1)]);
    await screen.findByText("lundi 16 novembre 2026");
    fireEvent.click(screen.getByRole("button", { name: /^Exporter dans Téléchargements/ }), {
      detail: 2,
    });
    fireEvent.click(screen.getByRole("button", { name: /^Ouvrir la fiche/ }), { detail: 2 });
    expect(history.exported).toEqual([]);
    expect(history.opened).toEqual([]);
  });
});

describe("HistoryScreen : relecture", () => {
  it("`refresh` qui augmente : list rappelée et nouvelle entrée affichée", async () => {
    const { history, refresh } = setup([rowOf(1)]);
    await screen.findByText("lundi 16 novembre 2026");
    expect(cards()).toHaveLength(1);
    await history.store.add("jeton", rowOf(2, { date: "2026-11-23" }).entry, PDF);
    refresh(1);
    expect(await screen.findByText("lundi 23 novembre 2026")).toBeTruthy();
    expect(cards()).toHaveLength(2);
  });

  it("une première lecture retenue qui répond après la seconde ne remplace pas la liste plus récente", async () => {
    const { history, refresh } = setup([rowOf(1)], (store) => {
      store.hold("list");
    });
    // Première lecture retenue : elle répondra avec une liste de 1 entrée.
    await history.store.add("jeton", rowOf(2, { date: "2026-11-23" }).entry, PDF);
    refresh(1);
    expect(await screen.findByText("lundi 23 novembre 2026")).toBeTruthy();
    expect(cards()).toHaveLength(2);
    history.release();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(cards()).toHaveLength(2);
    expect(screen.getByText("lundi 23 novembre 2026")).toBeTruthy();
  });
});
