import { describe, expect, it } from "vitest";
import { absoluteOutPath, resolveOutputTarget } from "./output-path.ts";
import type { OutputContext } from "./output-path.ts";

// Dossier personnel et dossier courant factices.
function context(over: Partial<OutputContext> = {}): OutputContext {
  return { env: {}, cwd: () => "/dossier/courant", homedir: () => "/home/moi", ...over };
}
const at = new Date(2026, 10, 13, 21, 30);

describe("absoluteOutPath", () => {
  it("garde un chemin absolu tel quel, même avec INIT_CWD", () => {
    expect(absoluteOutPath("/tmp/menu.pdf", { INIT_CWD: "/ailleurs" }, "/cwd")).toBe(
      "/tmp/menu.pdf",
    );
  });
  it("comprend un chemin relatif depuis INIT_CWD, le dossier où la commande a été tapée", () => {
    expect(absoluteOutPath("menu.pdf", { INIT_CWD: "/home/moi/projets" }, "/packages/core")).toBe(
      "/home/moi/projets/menu.pdf",
    );
    expect(absoluteOutPath("sous/menu.pdf", { INIT_CWD: "/home/moi" }, "/cwd")).toBe(
      "/home/moi/sous/menu.pdf",
    );
  });
  it("se replie sur le dossier courant sans INIT_CWD, ou avec INIT_CWD vide", () => {
    expect(absoluteOutPath("menu.pdf", {}, "/packages/core")).toBe("/packages/core/menu.pdf");
    expect(absoluteOutPath("menu.pdf", { INIT_CWD: "" }, "/packages/core")).toBe(
      "/packages/core/menu.pdf",
    );
  });
});

describe("resolveOutputTarget", () => {
  it("avec --out relatif : un remplacement, résolu depuis INIT_CWD", () => {
    expect(resolveOutputTarget("menu.pdf", at, context({ env: { INIT_CWD: "/depart" } }))).toEqual({
      kind: "replace",
      path: "/depart/menu.pdf",
    });
  });
  it("avec --out relatif et sans INIT_CWD : résolu depuis le dossier courant", () => {
    expect(resolveOutputTarget("menu.pdf", at, context())).toEqual({
      kind: "replace",
      path: "/dossier/courant/menu.pdf",
    });
  });
  it("avec --out absolu : un remplacement, chemin inchangé", () => {
    expect(resolveOutputTarget("/tmp/menu.pdf", at, context({ env: { INIT_CWD: "/x" } }))).toEqual({
      kind: "replace",
      path: "/tmp/menu.pdf",
    });
  });
  it("sans --out : un nom neuf dans Téléchargements, daté par la date reçue", () => {
    expect(resolveOutputTarget(null, at, context())).toEqual({
      kind: "new",
      folder: "/home/moi/Downloads",
      stem: "menu-batch-2026-11-13",
    });
    expect(resolveOutputTarget(null, new Date(2027, 0, 5, 8), context())).toMatchObject({
      stem: "menu-batch-2027-01-05",
    });
  });
  it("sans --out : ne dépend ni d'INIT_CWD ni du dossier courant", () => {
    const other = context({ env: { INIT_CWD: "/depart" }, cwd: () => "/autre" });
    expect(resolveOutputTarget(null, at, other)).toEqual(resolveOutputTarget(null, at, context()));
  });
});
