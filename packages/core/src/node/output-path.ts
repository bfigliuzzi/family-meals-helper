import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";

// Où écrire le PDF. Le nom par défaut n'est pas choisi ici : il se réserve au moment d'écrire (`writePdf`), pour qu'un
// fichier apparu entre-temps, ou une autre commande lancée en même temps, ne soit jamais écrasé.
export type OutputTarget =
  // `--out` donné : chemin absolu, le remplacement d'un fichier existant est permis.
  | { kind: "replace"; path: string }
  // Défaut : `<stem>.pdf` dans `folder`, ou `<stem>-2.pdf`, `<stem>-3.pdf`… ; jamais de remplacement.
  | { kind: "new"; folder: string; stem: string };

// Un chemin relatif se comprend depuis le dossier où l'utilisateur a tapé la commande : pnpm lance le script dans
// `packages/core` mais pose `INIT_CWD` sur le dossier de départ. Sans `INIT_CWD`, on prend le dossier courant.
// Un chemin absolu reste tel quel.
export function absoluteOutPath(out: string, env: NodeJS.ProcessEnv, cwd: string): string {
  if (isAbsolute(out)) return out;
  const start = env["INIT_CWD"];
  return resolve(start === undefined || start === "" ? cwd : start, out);
}

// Ce que le choix de la cible demande à l'extérieur : remplacé dans les tests. L'heure n'en fait pas partie : elle
// vient du port `Clock`, comme pour le reste de la commande.
export interface OutputContext {
  env: NodeJS.ProcessEnv;
  cwd(): string;
  homedir(): string;
}

export const nodeOutputContext: OutputContext = {
  env: process.env,
  cwd: () => process.cwd(),
  homedir: () => homedir(),
};

function dateText(at: Date): string {
  const two = (value: number): string => String(value).padStart(2, "0");
  return `${at.getFullYear()}-${two(at.getMonth() + 1)}-${two(at.getDate())}`;
}

// Avec `--out` : ce chemin, rendu absolu. Sans `--out` : `menu-batch-AAAA-MM-JJ` dans le dossier Téléchargements.
export function resolveOutputTarget(
  out: string | null,
  now: Date,
  ctx: OutputContext,
): OutputTarget {
  if (out !== null) return { kind: "replace", path: absoluteOutPath(out, ctx.env, ctx.cwd()) };
  return {
    kind: "new",
    folder: join(ctx.homedir(), "Downloads"),
    stem: `menu-batch-${dateText(now)}`,
  };
}
