import { access, constants, lstat, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { z } from "zod";
import { batchExitCode, batchMenu } from "../ai/batch.ts";
import { buildDetailSystemPrompt, buildDetailUserPrompt } from "../ai/detail-prompt.ts";
import type { Feature, Model } from "../ai/model.ts";
import { renderBatchResult } from "../ai/render.ts";
import { DetailSchema } from "../domain/detail.ts";
import { MenuSchema } from "../domain/menu.ts";
import { HOUSEHOLD_EQUIPMENT } from "../equipment/household.ts";
import { buildIngredientIndex } from "../ingredients/index-lookup.ts";
import { REFERENTIAL } from "../ingredients/referential.ts";
import { unknownExclusionTerms } from "../rules/check-exclusions.ts";
import { autumnMenu } from "../rules/fixtures/menus.ts";
import { checkSession } from "../scheduling/check-session.ts";
import { monthOf } from "../season/months.ts";
import { SEASON_TABLE } from "../season/season-table.ts";
import { parseBatchArgs } from "./compose-args.ts";
import { readAiConfig } from "./config.ts";
import type { OutputTarget } from "./output-path.ts";
import { composeDryRunLines } from "./dry-run.ts";
import { createEnvSecretStore } from "./ports.ts";
import { renderPdf } from "./render-pdf.ts";
import type { PdfFonts } from "./render-pdf.ts";

// Tout ce que `batch` touche à l'extérieur : en vrai dans `batch.ts`, remplacé dans les tests.
export interface BatchIo {
  env: NodeJS.ProcessEnv;
  stdout(text: string): void;
  stderr(text: string): void;
  now(): Date;
  createModel(
    schema: z.ZodType,
    config: { apiKey: string; baseURL: string; model: string; disabled: ReadonlySet<Feature> },
  ): Model;
  loadFonts(): Promise<PdfFonts>;
  // Cible du PDF : `--out` (remplacement permis), ou le nom par défaut dans Téléchargements (jamais de remplacement).
  resolveOutputTarget(out: string | null, now: Date): OutputTarget;
  // Message d'erreur, ou null si le PDF pourra être écrit à cet endroit.
  checkTarget(target: OutputTarget): Promise<string | null>;
  // Écrit le PDF et rend le chemin réellement écrit.
  writePdf(target: OutputTarget, bytes: Uint8Array): Promise<string>;
}

async function isAccessible(path: string, mode: number): Promise<boolean> {
  try {
    await access(path, mode);
    return true;
  } catch {
    return false;
  }
}

function errorCode(error: unknown): string {
  return error instanceof Error && "code" in error && typeof error.code === "string"
    ? error.code
    : "erreur inconnue";
}

// Le dossier existe, est un dossier, et on peut y écrire et le traverser.
export async function checkFolder(folder: string): Promise<string | null> {
  let folderStat;
  try {
    folderStat = await stat(folder);
  } catch (error) {
    return errorCode(error) === "ENOENT"
      ? `Le dossier « ${folder} » n'existe pas.`
      : `Le dossier « ${folder} » est inaccessible (${errorCode(error)}).`;
  }
  if (!folderStat.isDirectory()) return `« ${folder} » n'est pas un dossier.`;
  if (!(await isAccessible(folder, constants.W_OK | constants.X_OK))) {
    return `Le dossier « ${folder} » n'est pas accessible en écriture.`;
  }
  return null;
}

// Pour `--out` : le dossier parent est utilisable ; si la cible existe, c'est un fichier ordinaire (ni dossier, ni lien
// symbolique) qui accepte l'écriture. Seul « ENOENT » veut dire « absent, donc correct » : toute autre erreur (nom trop
// long, droit refusé…) est un refus. Une modification entre ce contrôle et l'écriture reste possible : l'échec
// d'écriture donne alors le code 2, avec son message.
export async function checkDestination(path: string): Promise<string | null> {
  const target = resolve(path);
  const folderError = await checkFolder(dirname(target));
  if (folderError !== null) return folderError;
  let targetStat;
  try {
    targetStat = await lstat(target);
  } catch (error) {
    return errorCode(error) === "ENOENT"
      ? null
      : `Le fichier « ${target} » est inutilisable (${errorCode(error)}).`;
  }
  if (!targetStat.isFile()) {
    return `« ${target} » existe et n'est pas un fichier ordinaire (dossier ou lien symbolique).`;
  }
  if (!(await isAccessible(target, constants.W_OK))) {
    return `« ${target} » existe et n'est pas accessible en écriture.`;
  }
  return null;
}

// Avant tout appel payé. Un nom par défaut n'a besoin que d'un dossier utilisable : le nom libre est réservé à
// l'écriture.
export function checkOutputTarget(target: OutputTarget): Promise<string | null> {
  return target.kind === "new" ? checkFolder(target.folder) : checkDestination(target.path);
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// 0 : fiche propre ; 1 : fiche écrite avec un avertissement ; 2 : pas de fiche (menu inutilisable, erreur d'usage
// ou erreur locale).
export async function runBatchCommand(argv: readonly string[], io: BatchIo): Promise<0 | 1 | 2> {
  const args = parseBatchArgs(argv);
  if (!args.ok) {
    io.stderr(`${args.error}\n`);
    return 2;
  }
  const month = args.month ?? monthOf(io.now());
  const input = {
    request: args.request,
    exclusions: args.exclusions,
    month,
    sessionDay: args.sessionDay,
    maxAttempts: args.maxAttempts,
  };

  for (const term of unknownExclusionTerms(input.exclusions, buildIngredientIndex(REFERENTIAL))) {
    io.stderr(
      `« ${term} » ne correspond à aucun ingrédient du référentiel : seuls les noms d'ingrédients inconnus et les noms de plats seront contrôlés.\n`,
    );
  }

  if (args.dryRun) {
    const system = buildDetailSystemPrompt(HOUSEHOLD_EQUIPMENT);
    const example = autumnMenu();
    const user = buildDetailUserPrompt({
      menu: example,
      sessionDay: args.sessionDay,
      composedMinutes: checkSession(example, HOUSEHOLD_EQUIPMENT).plan?.minutes ?? 0,
      exclusions: input.exclusions,
    });
    io.stdout(
      [
        ...composeDryRunLines(input),
        "=== Prompt système du détail ===",
        system,
        "",
        "=== Prompt utilisateur du détail (exemple : le vrai dépend du menu composé) ===",
        user,
        "",
        `Taille du détail : système ${system.length} caractères, utilisateur ${user.length} caractères. Aucun appel effectué.`,
        "",
      ].join("\n"),
    );
    return 0;
  }

  // Vérifications locales avant tout appel payé : une erreur ici ne coûte rien.
  const config = readAiConfig(io.env);
  if (!config.ok) {
    io.stderr(`${config.error}\n`);
    return 2;
  }
  const apiKey = await createEnvSecretStore(io.env).get("anthropic-api-key");
  if (apiKey === null) {
    io.stderr("ANTHROPIC_API_KEY manquante.\n");
    return 2;
  }
  let fonts: PdfFonts;
  try {
    fonts = await io.loadFonts();
  } catch (error) {
    io.stderr(`Police du PDF introuvable : ${describeError(error)}\n`);
    return 2;
  }
  const target = io.resolveOutputTarget(args.out, io.now());
  const destinationError = await io.checkTarget(target);
  if (destinationError !== null) {
    io.stderr(`${destinationError}\n`);
    return 2;
  }

  const disabled = config.disabled.size === 0 ? "aucun" : [...config.disabled].join(", ");
  io.stderr(
    `Modèle : ${config.model} · URL : ${config.baseURL} · essais au plus : ${input.maxAttempts} (composition et détail) · désactivé : ${disabled}\n`,
  );
  const modelConfig = {
    apiKey,
    baseURL: config.baseURL,
    model: config.model,
    disabled: config.disabled,
  };
  const result = await batchMenu(input, {
    models: {
      compose: io.createModel(MenuSchema, modelConfig),
      detail: io.createModel(DetailSchema, modelConfig),
    },
    refs: REFERENTIAL,
    seasonTable: SEASON_TABLE,
    onAttempt: (stage, number) => {
      io.stderr(
        `${stage === "compose" ? "Composition" : "Détail"}, essai ${number} sur ${input.maxAttempts} : vérification…\n`,
      );
    },
  });
  // Le PDF payé est écrit avant le résumé : un terminal fermé ne doit pas le faire perdre.
  let failure: string | null = null;
  let written: string | null = null;
  if (result.sheet !== null) {
    try {
      const bytes = await renderPdf(result.sheet, fonts, io.now());
      try {
        written = await io.writePdf(target, bytes);
      } catch (error) {
        failure = `Écriture du PDF impossible : ${describeError(error)}`;
      }
    } catch (error) {
      failure = `Échec du rendu du PDF : ${describeError(error)}`;
    }
  }
  io.stdout(`${renderBatchResult(result, input)}\n`);
  if (failure !== null) {
    io.stderr(`${failure}\n`);
    return 2;
  }
  if (written !== null) io.stdout(`PDF écrit : ${written}\n`);
  return batchExitCode(result);
}
