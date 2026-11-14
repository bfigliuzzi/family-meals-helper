import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Model, ModelReply } from "../ai/model.ts";
import { MenuSchema } from "../domain/menu.ts";
import { autumnCyclicDetail, autumnDetail } from "../rules/fixtures/detail.ts";
import { autumnMenu } from "../rules/fixtures/menus.ts";
import { checkOutputTarget, runBatchCommand } from "./batch-command.ts";
import type { BatchIo } from "./batch-command.ts";
import { resolveOutputTarget } from "./output-path.ts";
import type { OutputTarget } from "./output-path.ts";
import { loadPdfFonts } from "./pdf-fonts.ts";
import { writePdf } from "./write-pdf.ts";

const usage = { input: 100, output: 50, cacheRead: 0, cacheWrite: 0 };
const reply = (text: string, stopReason: string | null = "end_turn"): ModelReply => ({
  text,
  stopReason,
  usage,
});

// Un faux modèle qui rejoue ses réponses dans l'ordre et compte ses appels.
function scripted(replies: ModelReply[]): { model: Model; calls: () => number } {
  let calls = 0;
  return {
    model: {
      complete() {
        const next = replies[calls++];
        return next === undefined
          ? Promise.reject(new Error("script épuisé"))
          : Promise.resolve(next);
      },
    },
    calls: () => calls,
  };
}

// Chemin que le faux `writePdf` « écrit » : celui du remplacement, ou le premier nom par défaut.
function pathOf(target: OutputTarget): string {
  return target.kind === "replace" ? target.path : join(target.folder, `${target.stem}.pdf`);
}

interface Harness {
  io: BatchIo;
  out: string[];
  err: string[];
  written: { path: string; bytes: Uint8Array }[];
  modelsCreated: () => number;
  modelCalls: () => number;
}

function harness(
  over: Partial<BatchIo> & { detail?: ModelReply[]; compose?: ModelReply[] } = {},
): Harness {
  const compose = scripted(over.compose ?? [reply(JSON.stringify(autumnMenu()))]);
  const detail = scripted(over.detail ?? [reply(JSON.stringify(autumnDetail()))]);
  const out: string[] = [];
  const err: string[] = [];
  const written: { path: string; bytes: Uint8Array }[] = [];
  let created = 0;
  const io: BatchIo = {
    env: { ANTHROPIC_API_KEY: "test-key" },
    stdout: (text) => out.push(text),
    stderr: (text) => err.push(text),
    now: () => new Date(Date.UTC(2026, 10, 13, 9, 30)),
    createModel: (schema) => {
      created++;
      return schema === MenuSchema ? compose.model : detail.model;
    },
    loadFonts: loadPdfFonts,
    // Dossier personnel factice : le défaut va dans `<dossier de test>/home/Downloads`.
    resolveOutputTarget: (out, now) =>
      resolveOutputTarget(out, now, {
        env: {},
        cwd: () => folder,
        homedir: () => join(folder, "home"),
      }),
    checkTarget: checkOutputTarget,
    writePdf: (target, bytes) => {
      const path = pathOf(target);
      written.push({ path, bytes });
      return Promise.resolve(path);
    },
    ...over,
  };
  return {
    io,
    out,
    err,
    written,
    modelsCreated: () => created,
    modelCalls: () => compose.calls() + detail.calls(),
  };
}

let folder: string;
beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "fmh-batch-"));
  await mkdir(join(folder, "home", "Downloads"), { recursive: true });
});
afterEach(async () => {
  // Les dossiers de test peuvent avoir été rendus non inscriptibles.
  await chmod(folder, 0o700).catch(() => undefined);
  await rm(folder, { recursive: true, force: true });
});

const request = "5 dîners de saison";
const text = (lines: string[]): string => lines.join("");

describe("runBatchCommand : succès", () => {
  it("écrit un PDF, rend le code 0 et dit où", async () => {
    const h = harness();
    const target = join(folder, "menu.pdf");
    const code = await runBatchCommand([request, "--out", target], h.io);
    expect(code).toBe(0);
    expect(h.written).toHaveLength(1);
    expect(h.written[0]?.path).toBe(target);
    expect(Buffer.from(h.written[0]!.bytes).toString("latin1").startsWith("%PDF-")).toBe(true);
    expect(text(h.out)).toContain(`PDF écrit : ${target}`);
    expect(text(h.out)).toContain("Détail : essai 1 retenu");
    expect(text(h.err)).toContain("Composition, essai 1 sur 3");
    expect(text(h.err)).toContain("Détail, essai 1 sur 3");
  });

  it("rend le code 1, avec un PDF, quand le détail se replie sur les grandes phases, et le dit", async () => {
    const cyclic = (extra: number): ModelReply =>
      reply(
        JSON.stringify({ ...autumnCyclicDetail(), evenings: autumnDetail().evenings.slice(extra) }),
      );
    const h = harness({ detail: [cyclic(0), cyclic(1), cyclic(2)] });
    const code = await runBatchCommand([request, "--out", join(folder, "menu.pdf")], h.io);
    expect(code).toBe(1);
    expect(h.written).toHaveLength(1);
    expect(text(h.out)).toContain("Fiche de repli");
    expect(text(h.out)).toContain("PDF écrit");
  });

  it("rend le code 2, sans PDF, quand le menu garde une erreur", async () => {
    const bad = autumnMenu();
    bad.dishes[1]!.ingredients.push({
      name: "courgette",
      qty: 100,
      unit: "g",
      form: "fresh",
      category: null,
      sameDay: false,
    });
    const badReply = reply(JSON.stringify(bad));
    const h = harness({ compose: [badReply, badReply, badReply] });
    const code = await runBatchCommand(
      [request, "--out", join(folder, "menu.pdf"), "--exclude", "courgette"],
      h.io,
    );
    expect(code).toBe(2);
    expect(h.written).toEqual([]);
    expect(text(h.out)).toContain("Détail : non demandé, le menu garde des erreurs.");
  });
});

describe("runBatchCommand : vérifications locales avant tout appel", () => {
  const asRoot = process.getuid?.() === 0;

  it.skipIf(asRoot)("refuse un dossier de sortie non inscriptible", async () => {
    const locked = join(folder, "verrouille");
    await mkdir(locked);
    await chmod(locked, 0o500);
    const h = harness();
    const code = await runBatchCommand([request, "--out", join(locked, "menu.pdf")], h.io);
    await chmod(locked, 0o700);
    expect(code).toBe(2);
    expect(text(h.err)).toContain("n'est pas accessible en écriture");
    expect(h.modelsCreated()).toBe(0);
    expect(h.modelCalls()).toBe(0);
  });

  it.skipIf(asRoot)("refuse un fichier de sortie existant non inscriptible", async () => {
    const target = join(folder, "menu.pdf");
    await writeFile(target, "ancien");
    await chmod(target, 0o400);
    const h = harness();
    const code = await runBatchCommand([request, "--out", target], h.io);
    expect(code).toBe(2);
    expect(text(h.err)).toContain("existe et n'est pas accessible en écriture");
    expect(h.modelCalls()).toBe(0);
  });

  it("refuse un dossier nommé menu.pdf", async () => {
    const target = join(folder, "menu.pdf");
    await mkdir(target);
    const h = harness();
    const code = await runBatchCommand([request, "--out", target], h.io);
    expect(code).toBe(2);
    expect(text(h.err)).toContain("n'est pas un fichier ordinaire");
    expect(h.modelsCreated()).toBe(0);
    expect(h.modelCalls()).toBe(0);
  });

  it("refuse un dossier parent absent", async () => {
    const h = harness();
    const code = await runBatchCommand(
      [request, "--out", join(folder, "absent", "menu.pdf")],
      h.io,
    );
    expect(code).toBe(2);
    expect(text(h.err)).toContain("n'existe pas");
    expect(h.modelCalls()).toBe(0);
  });

  it("rend le code 2 quand la police est introuvable", async () => {
    const h = harness({ loadFonts: () => Promise.reject(new Error("Roboto-Regular.ttf absent")) });
    const code = await runBatchCommand([request, "--out", join(folder, "menu.pdf")], h.io);
    expect(code).toBe(2);
    expect(text(h.err)).toContain("Police du PDF introuvable : Roboto-Regular.ttf absent");
    expect(h.modelsCreated()).toBe(0);
  });

  it("rend le code 2 quand la clé manque", async () => {
    const h = harness({ env: {} });
    const code = await runBatchCommand([request, "--out", join(folder, "menu.pdf")], h.io);
    expect(code).toBe(2);
    expect(text(h.err)).toContain("ANTHROPIC_API_KEY manquante.");
    expect(h.modelsCreated()).toBe(0);
  });

  it("rend le code 2 pour une configuration d'IA fausse", async () => {
    const h = harness({ env: { ANTHROPIC_API_KEY: "k", FMH_DISABLE: "tout" } });
    const code = await runBatchCommand([request, "--out", join(folder, "menu.pdf")], h.io);
    expect(code).toBe(2);
    expect(text(h.err)).toContain("FMH_DISABLE");
    expect(h.modelCalls()).toBe(0);
  });

  it("rend le code 2 pour des arguments faux, sans rien appeler", async () => {
    for (const argv of [[], [request, "--out", "menu.txt"]]) {
      const h = harness();
      expect(await runBatchCommand(argv, h.io)).toBe(2);
      expect(h.err).not.toEqual([]);
      expect(h.modelCalls()).toBe(0);
    }
  });
});

describe("runBatchCommand : chemin du PDF", () => {
  it("sans --out, la cible est un nom par défaut daté par io.now(), dans Téléchargements", async () => {
    const targets: OutputTarget[] = [];
    const h = harness({ now: () => new Date(2027, 0, 5, 8, 0) });
    const io: BatchIo = {
      ...h.io,
      writePdf: (target) => {
        targets.push(target);
        return Promise.resolve("/chemin/rendu.pdf");
      },
    };
    expect(await runBatchCommand([request], io)).toBe(0);
    expect(targets).toEqual([
      { kind: "new", folder: join(folder, "home", "Downloads"), stem: "menu-batch-2027-01-05" },
    ]);
  });

  it("affiche le chemin rendu par writePdf, pas celui qui était prévu", async () => {
    const h = harness();
    const io: BatchIo = {
      ...h.io,
      writePdf: () =>
        Promise.resolve(join(folder, "home", "Downloads", "menu-batch-2026-11-13-2.pdf")),
    };
    expect(await runBatchCommand([request], io)).toBe(0);
    expect(text(h.out)).toContain(
      `PDF écrit : ${join(folder, "home", "Downloads", "menu-batch-2026-11-13-2.pdf")}\n`,
    );
  });

  it("avec --out, transmet l'argument tel quel, remplace, et écrit au chemin résolu", async () => {
    const asked: (string | null)[] = [];
    const resolved: OutputTarget = { kind: "replace", path: join(folder, "depart", "menu.pdf") };
    const h = harness();
    const io: BatchIo = {
      ...h.io,
      resolveOutputTarget: (out) => {
        asked.push(out);
        return resolved;
      },
      checkTarget: () => Promise.resolve(null),
    };
    expect(await runBatchCommand([request, "--out", "menu.pdf"], io)).toBe(0);
    expect(asked).toEqual(["menu.pdf"]);
    expect(h.written[0]?.path).toBe(join(folder, "depart", "menu.pdf"));
    expect(text(h.out)).toContain(`PDF écrit : ${join(folder, "depart", "menu.pdf")}`);
  });

  it("contrôle la cible avant tout appel payé : le dossier du défaut, ou le chemin de --out", async () => {
    await rm(join(folder, "home", "Downloads"), { recursive: true });
    const absent = harness();
    expect(await runBatchCommand([request], absent.io)).toBe(2);
    expect(text(absent.err)).toContain("n'existe pas");
    expect(absent.modelsCreated()).toBe(0);
    expect(absent.modelCalls()).toBe(0);
  });

  it("de bout en bout : un fichier par défaut créé pendant les appels à l'IA reste intact, et le vrai chemin est dit", async () => {
    const taken = join(folder, "home", "Downloads", "menu-batch-2026-11-13.pdf");
    const h = harness({ now: () => new Date(2026, 10, 13, 9, 30) });
    const io: BatchIo = {
      ...h.io,
      writePdf,
      createModel: (schema, config) => {
        const model = h.io.createModel(schema, config);
        return {
          async complete(prompt) {
            // Un autre fichier apparaît sous le nom par défaut pendant que l'IA travaille.
            await writeFile(taken, "arrivé pendant l'appel").catch(() => undefined);
            return model.complete(prompt);
          },
        };
      },
    };
    expect(await runBatchCommand([request], io)).toBe(0);
    expect(await readFile(taken, "utf8")).toBe("arrivé pendant l'appel");
    const second = join(folder, "home", "Downloads", "menu-batch-2026-11-13-2.pdf");
    expect((await readFile(second)).subarray(0, 5).toString()).toBe("%PDF-");
    expect(text(h.out)).toContain(`PDF écrit : ${second}\n`);
  });

  it("ne refuse pas un nom par défaut déjà pris : le nom libre est choisi à l'écriture", async () => {
    await writeFile(join(folder, "home", "Downloads", "menu-batch-2026-11-13.pdf"), "pris");
    const h = harness({ now: () => new Date(2026, 10, 13, 9, 30) });
    expect(await runBatchCommand([request], h.io)).toBe(0);
  });
});

describe("runBatchCommand : ordre des écritures", () => {
  it("écrit le PDF avant le résumé, puis dit où", async () => {
    const order: string[] = [];
    const h = harness();
    const io: BatchIo = {
      ...h.io,
      stdout: (text) =>
        order.push(text.startsWith("PDF écrit") ? "stdout:pdf-écrit" : "stdout:résumé"),
      writePdf: () => {
        order.push("writePdf");
        return Promise.resolve(join(folder, "menu.pdf"));
      },
    };
    expect(await runBatchCommand([request, "--out", join(folder, "menu.pdf")], io)).toBe(0);
    expect(order).toEqual(["writePdf", "stdout:résumé", "stdout:pdf-écrit"]);
  });
  it("écrit quand même le résumé avant le message d'erreur quand l'écriture échoue", async () => {
    const order: string[] = [];
    const h = harness();
    const io: BatchIo = {
      ...h.io,
      stdout: () => order.push("stdout:résumé"),
      stderr: (text) =>
        order.push(text.startsWith("Écriture du PDF impossible") ? "stderr:échec" : "stderr"),
      writePdf: () => Promise.reject(new Error("disque plein")),
    };
    expect(await runBatchCommand([request, "--out", join(folder, "menu.pdf")], io)).toBe(2);
    expect(order.slice(-2)).toEqual(["stdout:résumé", "stderr:échec"]);
  });
});

describe("runBatchCommand : échecs après les appels", () => {
  it("rend le code 2 en gardant le message d'origine de l'écriture", async () => {
    const h = harness({ writePdf: () => Promise.reject(new Error("disque plein")) });
    const code = await runBatchCommand([request, "--out", join(folder, "menu.pdf")], h.io);
    expect(code).toBe(2);
    expect(text(h.err)).toContain("Écriture du PDF impossible : disque plein");
    expect(text(h.out)).not.toContain("PDF écrit");
  });
});

describe("runBatchCommand : --dry-run", () => {
  it("affiche les prompts des deux étapes, sans appel, sans clé et sans --out", async () => {
    const h = harness({ env: {} });
    const code = await runBatchCommand([request, "--dry-run"], h.io);
    expect(code).toBe(0);
    expect(h.modelsCreated()).toBe(0);
    expect(h.modelCalls()).toBe(0);
    expect(h.written).toEqual([]);
    const printed = text(h.out);
    expect(printed).toContain("=== Prompt système ===");
    expect(printed).toContain("=== Prompt système du détail ===");
    expect(printed).toContain("exemple : le vrai dépend du menu composé");
    expect(printed).toContain("Taille du détail : système");
    expect(printed).toContain("a.1 poireau 600 g");
  });
});

describe("checkOutputTarget", () => {
  it("accepte un nouveau fichier de --out, et le dossier d'un nom par défaut", async () => {
    expect(await checkOutputTarget({ kind: "replace", path: join(folder, "menu.pdf") })).toBeNull();
    expect(
      await checkOutputTarget({
        kind: "new",
        folder: join(folder, "home", "Downloads"),
        stem: "x",
      }),
    ).toBeNull();
  });
  it("refuse un dossier absent pour un nom par défaut, sans regarder le nom du fichier", async () => {
    expect(
      await checkOutputTarget({ kind: "new", folder: join(folder, "absent"), stem: "x" }),
    ).toContain("n'existe pas");
  });
});
