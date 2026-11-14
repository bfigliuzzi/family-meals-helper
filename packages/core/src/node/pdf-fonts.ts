import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import type { PdfFonts } from "./render-pdf.ts";

const require = createRequire(import.meta.url);

// Roboto est livrée dans le paquet pdfmake : aucun fichier de police n'est ajouté au dépôt.
async function readFont(file: string): Promise<Uint8Array> {
  return new Uint8Array(await readFile(require.resolve(`pdfmake/fonts/Roboto/${file}`)));
}

export async function loadPdfFonts(): Promise<PdfFonts> {
  const [normal, bold, italics, bolditalics] = await Promise.all([
    readFont("Roboto-Regular.ttf"),
    readFont("Roboto-Medium.ttf"),
    readFont("Roboto-Italic.ttf"),
    readFont("Roboto-MediumItalic.ttf"),
  ]);
  return { normal, bold, italics, bolditalics };
}
