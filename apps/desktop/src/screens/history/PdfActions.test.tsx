import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithMantine } from "../../test/render.tsx";
import { PdfActions } from "./PdfActions.tsx";

// Une promesse que le test règle à la main.
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((ok, fail) => {
    resolve = ok;
    reject = fail;
  });
  return { promise, resolve, reject };
}

const OPEN = { name: /^Ouvrir la fiche/ };
const EXPORT = { name: /^Exporter dans Téléchargements/ };

function setup(handlers: { onOpen?: () => Promise<void>; onExport?: () => Promise<string> } = {}) {
  const onOpen = vi.fn(handlers.onOpen ?? (() => Promise.resolve()));
  const onExport = vi.fn(handlers.onExport ?? (() => Promise.resolve("/Users/x/Downloads/f.pdf")));
  renderWithMantine(<PdfActions dateText="16 novembre 2026" onOpen={onOpen} onExport={onExport} />);
  return { onOpen, onExport, user: userEvent.setup() };
}

describe("PdfActions : clic réentrant avant le rendu", () => {
  it("deux clics dans le même rendu sur « Ouvrir » : une seule ouverture", () => {
    const pending = deferred<void>();
    const { onOpen } = setup({ onOpen: () => pending.promise });
    const button = screen.getByRole("button", OPEN);
    act(() => {
      fireEvent.click(button);
      fireEvent.click(button);
    });
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("deux clics dans le même rendu sur « Exporter » : un seul export", () => {
    const pending = deferred<string>();
    const { onExport } = setup({ onExport: () => pending.promise });
    const button = screen.getByRole("button", EXPORT);
    act(() => {
      fireEvent.click(button);
      fireEvent.click(button);
    });
    expect(onExport).toHaveBeenCalledTimes(1);
  });
});

describe("PdfActions : nouvelle tentative après un rejet", () => {
  it("« Ouvrir » : l'erreur s'affiche, puis un second clic rouvre et efface l'erreur", async () => {
    const onOpen = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error("Ouverture dans Aperçu impossible."))
      .mockResolvedValue(undefined);
    const { user } = setup({ onOpen });
    await user.click(screen.getByRole("button", OPEN));
    expect(await screen.findByText("Ouverture dans Aperçu impossible.")).toBeTruthy();
    await user.click(screen.getByRole("button", OPEN));
    await waitFor(() => {
      expect(onOpen).toHaveBeenCalledTimes(2);
    });
    await waitFor(() => {
      expect(screen.queryByText("Ouverture dans Aperçu impossible.")).toBeNull();
    });
  });

  it("« Exporter » : l'erreur s'affiche, puis un second clic exporte et efface l'erreur", async () => {
    const onExport = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error("Copie dans Téléchargements impossible."))
      .mockResolvedValue("/Users/x/Downloads/menu-batch-2026-11-16.pdf");
    const { user } = setup({ onExport });
    await user.click(screen.getByRole("button", EXPORT));
    expect(await screen.findByText("Copie dans Téléchargements impossible.")).toBeTruthy();
    await user.click(screen.getByRole("button", EXPORT));
    expect(await screen.findByText(/menu-batch-2026-11-16\.pdf$/)).toBeTruthy();
    expect(onExport).toHaveBeenCalledTimes(2);
    expect(screen.queryByText("Copie dans Téléchargements impossible.")).toBeNull();
  });
});

describe("PdfActions : texte affiché", () => {
  it("le nom du fichier exporté est nettoyé par `printable`", async () => {
    const { user } = setup({
      onExport: () => Promise.resolve("/Users/x/Downloads/menu\u202E-batch\u200B.pdf"),
    });
    await user.click(screen.getByRole("button", EXPORT));
    expect(await screen.findByText("Copiée dans Téléchargements : menu-batch.pdf")).toBeTruthy();
    expect(screen.getByRole("status").textContent).not.toMatch(/[\u202E\u200B]/);
  });
});
