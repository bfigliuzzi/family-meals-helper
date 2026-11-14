import {
  chmod,
  mkdir,
  mkdtemp,
  open,
  readFile,
  readdir,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { checkDestination, checkFolder } from "./batch-command.ts";
import { resolveOutputTarget } from "./output-path.ts";
import type { OutputTarget } from "./output-path.ts";
import { writePdf } from "./write-pdf.ts";
import type { OpenNew } from "./write-pdf.ts";

let folder: string;
beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "fmh-write-"));
});
afterEach(async () => {
  // Les dossiers de test peuvent avoir été rendus non inscriptibles.
  await chmod(folder, 0o700).catch(() => undefined);
  await rm(folder, { recursive: true, force: true });
});

const asRoot = process.getuid?.() === 0;
const bytesOf = (text: string): Uint8Array => new TextEncoder().encode(text);
const pdf = bytesOf("%PDF-1.3 contenu %%EOF");
const read = async (path: string): Promise<string> => readFile(path, "utf8");
const replace = (name: string): OutputTarget => ({ kind: "replace", path: join(folder, name) });
const fresh = (stem = "menu-batch-2026-11-13"): OutputTarget => ({ kind: "new", folder, stem });
const modeOf = async (path: string): Promise<number> => (await stat(path)).mode & 0o777;

// Lance `run` avec un `umask` donné, puis remet l'ancien, même en cas d'échec. Vitest lance chaque fichier de test
// dans son propre processus : le changement ne touche pas les autres fichiers.
async function withUmask(mask: number, run: () => Promise<void>): Promise<void> {
  const previous = process.umask(mask);
  try {
    await run();
  } finally {
    process.umask(previous);
  }
}

// Un vrai fichier sur le disque, dont l'écriture (après 10 octets) ou la fermeture échoue sur commande.
function failingOpen(fail: { write?: Error; close?: Error }): OpenNew {
  return async (path) => {
    const real = await open(path, "wx");
    return {
      chmod: (mode) => real.chmod(mode),
      writeFile: async (bytes) => {
        if (fail.write === undefined) return real.writeFile(bytes);
        await real.writeFile(bytes.subarray(0, 10));
        throw fail.write;
      },
      close: async () => {
        await real.close();
        if (fail.close !== undefined) throw fail.close;
      },
    };
  };
}
const ioError = (call: string): Error =>
  Object.assign(new Error(`EIO: i/o error, ${call}`), { code: "EIO" });

describe("writePdf : nom par défaut (jamais de remplacement)", () => {
  it("écrit stem.pdf et rend ce chemin", async () => {
    const path = await writePdf(fresh(), pdf);
    expect(path).toBe(join(folder, "menu-batch-2026-11-13.pdf"));
    expect(new Uint8Array(await readFile(path))).toEqual(pdf);
    expect(await readdir(folder)).toEqual(["menu-batch-2026-11-13.pdf"]);
  });

  it("passe à -2, puis -3, quand le nom est pris, sans toucher aux fichiers existants", async () => {
    await writeFile(join(folder, "menu-batch-2026-11-13.pdf"), "premier");
    expect(await writePdf(fresh(), bytesOf("second"))).toBe(
      join(folder, "menu-batch-2026-11-13-2.pdf"),
    );
    expect(await writePdf(fresh(), bytesOf("troisième"))).toBe(
      join(folder, "menu-batch-2026-11-13-3.pdf"),
    );
    expect(await read(join(folder, "menu-batch-2026-11-13.pdf"))).toBe("premier");
    expect(await read(join(folder, "menu-batch-2026-11-13-2.pdf"))).toBe("second");
    expect(await read(join(folder, "menu-batch-2026-11-13-3.pdf"))).toBe("troisième");
  });

  it("deux écritures en parallèle du même nom donnent deux fichiers intacts à deux chemins distincts", async () => {
    const [first, second] = await Promise.all([
      writePdf(fresh(), bytesOf("A".repeat(50_000))),
      writePdf(fresh(), bytesOf("B".repeat(50_000))),
    ]);
    expect(first).not.toBe(second);
    expect([first, second].sort()).toEqual([
      join(folder, "menu-batch-2026-11-13-2.pdf"),
      join(folder, "menu-batch-2026-11-13.pdf"),
    ]);
    expect(await read(first)).toBe("A".repeat(50_000));
    expect(await read(second)).toBe("B".repeat(50_000));
    expect((await readdir(folder)).sort()).toHaveLength(2);
  });

  it("garde intact un fichier créé entre le choix de la cible et l'écriture, et dit le vrai chemin", async () => {
    const target = resolveOutputTarget(null, new Date(2026, 10, 13, 9), {
      env: {},
      cwd: () => folder,
      homedir: () => folder,
    });
    expect(target.kind).toBe("new");
    // Le dossier Téléchargements du dossier personnel factice.
    await mkdir(join(folder, "Downloads"));
    const created = join(folder, "Downloads", "menu-batch-2026-11-13.pdf");
    // Le fichier apparaît après le choix de la cible (par exemple pendant les appels à l'IA).
    await writeFile(created, "arrivé entre-temps");
    const written = await writePdf(target, pdf);
    expect(written).toBe(join(folder, "Downloads", "menu-batch-2026-11-13-2.pdf"));
    expect(await read(created)).toBe("arrivé entre-temps");
    expect(new Uint8Array(await readFile(written))).toEqual(pdf);
  });

  it("n'écrase pas un lien symbolique du même nom, même sans cible", async () => {
    const elsewhere = join(folder, "ailleurs.txt");
    await writeFile(elsewhere, "intact");
    await symlink(elsewhere, join(folder, "menu-batch-2026-11-13.pdf"));
    expect(await writePdf(fresh(), pdf)).toBe(join(folder, "menu-batch-2026-11-13-2.pdf"));
    expect(await read(elsewhere)).toBe("intact");
  });

  it("donne au nouveau fichier les droits de l'umask (077 → 0600)", async () => {
    await withUmask(0o077, async () => {
      const path = await writePdf(fresh(), pdf);
      expect(await modeOf(path)).toBe(0o600);
    });
  });

  it("supprime le fichier et rend l'erreur de fermeture quand la fermeture échoue", async () => {
    await expect(writePdf(fresh(), pdf, failingOpen({ close: ioError("close") }))).rejects.toThrow(
      "EIO: i/o error, close",
    );
    expect(await readdir(folder)).toEqual([]);
  });

  it("rend l'erreur d'écriture, pas celle de la fermeture, quand les deux échouent", async () => {
    const opening = failingOpen({ write: ioError("write"), close: ioError("close") });
    await expect(writePdf(fresh(), pdf, opening)).rejects.toThrow("EIO: i/o error, write");
    expect(await readdir(folder)).toEqual([]);
  });

  it("échoue avec un message clair sans créer de fichier quand le dossier a disparu", async () => {
    await expect(
      writePdf({ kind: "new", folder: join(folder, "disparu"), stem: "x" }, pdf),
    ).rejects.toThrow(/ENOENT/);
    expect(await readdir(folder)).toEqual([]);
  });
});

describe("writePdf : --out (remplacement)", () => {
  it("écrit un nouveau fichier, sans laisser de temporaire", async () => {
    const path = await writePdf(replace("menu.pdf"), pdf);
    expect(path).toBe(join(folder, "menu.pdf"));
    expect(new Uint8Array(await readFile(path))).toEqual(pdf);
    expect(await readdir(folder)).toEqual(["menu.pdf"]);
  });

  it("remplace un fichier existant par les octets du PDF", async () => {
    await writeFile(join(folder, "menu.pdf"), "ancien");
    await writePdf(replace("menu.pdf"), pdf);
    expect(new Uint8Array(await readFile(join(folder, "menu.pdf")))).toEqual(pdf);
    expect(await readdir(folder)).toEqual(["menu.pdf"]);
  });

  it("réussit pour une cible de 240 caractères, sans laisser de temporaire", async () => {
    const name = `${"a".repeat(236)}.pdf`;
    expect(name).toHaveLength(240);
    await writePdf(replace(name), pdf);
    expect(await readdir(folder)).toEqual([name]);
    expect(new Uint8Array(await readFile(join(folder, name)))).toEqual(pdf);
  });

  it("garde les droits du fichier remplacé (0600 reste 0600)", async () => {
    const path = join(folder, "menu.pdf");
    await writeFile(path, "ancien");
    await chmod(path, 0o600);
    await writePdf(replace("menu.pdf"), pdf);
    expect(await modeOf(path)).toBe(0o600);
  });

  it("donne à une nouvelle cible les droits de l'umask (077 → 0600), sans chmod", async () => {
    await withUmask(0o077, async () => {
      const path = await writePdf(replace("menu.pdf"), pdf);
      expect(await modeOf(path)).toBe(0o600);
    });
  });

  it("garde les droits du fichier remplacé, quel que soit l'umask (0644 reste 0644 avec 077)", async () => {
    const path = join(folder, "menu.pdf");
    await writeFile(path, "ancien");
    await chmod(path, 0o644);
    await withUmask(0o077, async () => {
      await writePdf(replace("menu.pdf"), pdf);
    });
    expect(await modeOf(path)).toBe(0o644);
    expect(new Uint8Array(await readFile(path))).toEqual(pdf);
  });

  it("garde l'ancien fichier et nettoie le temporaire quand la fermeture échoue", async () => {
    const target = join(folder, "menu.pdf");
    await writeFile(target, "ancien");
    await expect(
      writePdf(replace("menu.pdf"), pdf, failingOpen({ close: ioError("close") })),
    ).rejects.toThrow("EIO: i/o error, close");
    expect(await read(target)).toBe("ancien");
    expect(await readdir(folder)).toEqual(["menu.pdf"]);
  });

  it("ne laisse aucun temporaire quand le renommage échoue, et ne touche pas à la cible", async () => {
    // La cible est un dossier non vide : le renommage échoue après l'écriture du temporaire.
    const target = join(folder, "menu.pdf");
    await mkdir(target);
    await writeFile(join(target, "garde.txt"), "intact");
    await expect(writePdf(replace("menu.pdf"), pdf)).rejects.toThrow();
    expect(await readdir(folder)).toEqual(["menu.pdf"]);
    expect(await read(join(target, "garde.txt"))).toBe("intact");
  });

  it("échoue sans rien créer quand le dossier de destination a disparu", async () => {
    await expect(
      writePdf({ kind: "replace", path: join(folder, "disparu", "menu.pdf") }, pdf),
    ).rejects.toThrow();
    expect(await readdir(folder)).toEqual([]);
  });

  it.skipIf(asRoot)(
    "garde l'ancien fichier et nettoie quand le dossier refuse l'écriture",
    async () => {
      const target = join(folder, "menu.pdf");
      await writeFile(target, "ancien");
      await chmod(folder, 0o500);
      await expect(writePdf(replace("menu.pdf"), pdf)).rejects.toThrow();
      await chmod(folder, 0o700);
      expect(await read(target)).toBe("ancien");
      expect(await readdir(folder)).toEqual(["menu.pdf"]);
    },
  );
});

describe("checkFolder", () => {
  it("accepte un dossier inscriptible, refuse un dossier absent ou un fichier", async () => {
    expect(await checkFolder(folder)).toBeNull();
    expect(await checkFolder(join(folder, "absent"))).toContain("n'existe pas");
    await writeFile(join(folder, "fichier.txt"), "x");
    expect(await checkFolder(join(folder, "fichier.txt"))).toContain("n'est pas un dossier");
  });
  it.skipIf(asRoot)("refuse un dossier sans droit d'écriture", async () => {
    await chmod(folder, 0o500);
    expect(await checkFolder(folder)).toContain("n'est pas accessible en écriture");
  });
});

describe("checkDestination", () => {
  it("accepte un nouveau fichier et un fichier ordinaire inscriptible", async () => {
    const target = join(folder, "menu.pdf");
    expect(await checkDestination(target)).toBeNull();
    await writeFile(target, "ancien");
    expect(await checkDestination(target)).toBeNull();
  });

  it("refuse un nom de 300 caractères, sans le prendre pour un fichier absent", async () => {
    const message = await checkDestination(join(folder, `${"a".repeat(296)}.pdf`));
    expect(message).not.toBeNull();
    expect(message).toContain("ENAMETOOLONG");
  });

  it("refuse un lien symbolique, et ne touche pas au fichier visé", async () => {
    const linked = join(folder, "autre.txt");
    await writeFile(linked, "intact");
    const link = join(folder, "menu.pdf");
    await symlink(linked, link);
    expect(await checkDestination(link)).toContain("n'est pas un fichier ordinaire");
    expect(await readFile(linked, "utf8")).toBe("intact");
  });

  it("refuse un dossier nommé menu.pdf", async () => {
    const target = join(folder, "menu.pdf");
    await mkdir(target);
    expect(await checkDestination(target)).toContain("n'est pas un fichier ordinaire");
  });

  it("refuse un dossier parent absent, ou qui est un fichier", async () => {
    expect(await checkDestination(join(folder, "absent", "menu.pdf"))).toContain("n'existe pas");
    const file = join(folder, "fichier.txt");
    await writeFile(file, "x");
    expect(await checkDestination(join(file, "menu.pdf"))).not.toBeNull();
  });

  it.skipIf(asRoot)("refuse un fichier en lecture seule", async () => {
    const target = join(folder, "menu.pdf");
    await writeFile(target, "ancien");
    await chmod(target, 0o444);
    expect(await checkDestination(target)).toContain("n'est pas accessible en écriture");
  });

  it.skipIf(asRoot)("refuse un dossier sans droit d'écriture ou de traversée", async () => {
    const locked = join(folder, "verrouille");
    await mkdir(locked);
    await chmod(locked, 0o500);
    expect(await checkDestination(join(locked, "menu.pdf"))).toContain(
      "n'est pas accessible en écriture",
    );
    await chmod(locked, 0o600);
    expect(await checkDestination(join(locked, "menu.pdf"))).not.toBeNull();
    await chmod(locked, 0o700);
  });
});
