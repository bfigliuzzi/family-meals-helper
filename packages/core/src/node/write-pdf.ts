import { randomBytes } from "node:crypto";
import { lstat, open, rename, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { OutputTarget } from "./output-path.ts";

const MAX_DEFAULT_NAMES = 999;

// Ce que l'écriture demande à un fichier ouvert. Un `FileHandle` de Node le fournit ; les tests passent un fichier dont
// la fermeture échoue, ce qu'un vrai disque ne permet pas de provoquer.
export interface PdfFile {
  chmod(mode: number): Promise<void>;
  writeFile(bytes: Uint8Array): Promise<void>;
  close(): Promise<void>;
}

// Ouvre un fichier qui ne doit pas exister encore (« wx »). Un nouveau fichier reçoit `0o666` moins l'`umask`.
export type OpenNew = (path: string) => Promise<PdfFile>;

const openNew: OpenNew = (path) => open(path, "wx");

function errorCode(error: unknown): string | undefined {
  return error instanceof Error && "code" in error && typeof error.code === "string"
    ? error.code
    : undefined;
}

// Le nettoyage est au mieux : son échec ne doit jamais masquer l'erreur d'écriture d'origine.
async function discard(path: string): Promise<void> {
  await rm(path, { force: true }).catch(() => undefined);
}

// Donne les droits (`mode`, s'il n'est pas null) avant d'écrire le moindre octet, écrit, puis ferme. La fermeture est
// tentée une seule fois, que l'écriture réussisse ou non ; une fermeture qui échoue est un échec d'écriture, car les
// octets peuvent ne pas être tous sur le disque. En cas d'échec, l'erreur rendue est la première rencontrée.
async function fill(file: PdfFile, bytes: Uint8Array, mode: number | null): Promise<void> {
  try {
    if (mode !== null) await file.chmod(mode);
    await file.writeFile(bytes);
  } catch (error) {
    await file.close().catch(() => undefined);
    throw error;
  }
  await file.close();
}

// Nom par défaut : le premier `stem.pdf`, `stem-2.pdf`… que `open(…, "wx")` réussit à créer. « wx » réserve le nom de
// façon atomique : un fichier créé pendant les appels à l'IA, ou par une autre commande lancée en même temps, passe
// au nom suivant et n'est jamais écrasé. Pas de fichier temporaire ni de renommage ici : le fichier garde les droits
// donnés par l'`umask`. Si l'écriture ou la fermeture échoue, le fichier créé est supprimé.
async function writeNew(
  folder: string,
  stem: string,
  bytes: Uint8Array,
  openFile: OpenNew,
): Promise<string> {
  for (let number = 1; number <= MAX_DEFAULT_NAMES; number++) {
    const path = join(folder, `${stem}${number === 1 ? "" : `-${number}`}.pdf`);
    let file: PdfFile;
    try {
      file = await openFile(path);
    } catch (error) {
      if (errorCode(error) === "EEXIST") continue;
      throw error;
    }
    try {
      await fill(file, bytes, null);
    } catch (error) {
      await discard(path);
      throw error;
    }
    return path;
  }
  throw new Error(`Aucun nom libre pour ${stem}… dans ${folder}.`);
}

// `--out` : écriture dans un temporaire du même dossier, puis renommage, pour que l'ancien fichier reste intact si
// l'écriture échoue. Le nom du temporaire est court et ne dépend pas de la cible (une cible au nom très long resterait
// valable). Un fichier ordinaire remplacé transmet ses droits POSIX au nouveau ; un nouveau fichier garde ceux donnés
// par l'`umask`, sans `chmod`.
async function writeReplacing(path: string, bytes: Uint8Array, openFile: OpenNew): Promise<string> {
  const existing = await lstat(path).catch(() => null);
  const mode = existing?.isFile() === true ? existing.mode & 0o777 : null;
  const temp = join(dirname(path), `.fmh-${process.pid}-${randomBytes(4).toString("hex")}.tmp`);
  // Si l'ouverture échoue, rien n'a été créé : pas de nettoyage.
  const file = await openFile(temp);
  try {
    await fill(file, bytes, mode);
    await rename(temp, path);
  } catch (error) {
    await discard(temp);
    throw error;
  }
  return path;
}

// Écrit le PDF et rend le chemin réellement écrit. `openFile` n'est remplacé que dans les tests.
export function writePdf(
  target: OutputTarget,
  bytes: Uint8Array,
  openFile: OpenNew = openNew,
): Promise<string> {
  return target.kind === "new"
    ? writeNew(target.folder, target.stem, bytes, openFile)
    : writeReplacing(target.path, bytes, openFile);
}
