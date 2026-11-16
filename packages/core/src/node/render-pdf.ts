import pdfmake from "pdfmake";
import type { TDocumentDefinitions } from "pdfmake/interfaces.js";
import { pdfmakeInput } from "../pdf/pdfmake-input.ts";

export interface PdfFonts {
  normal: Uint8Array;
  bold: Uint8Array;
  italics: Uint8Array;
  bolditalics: Uint8Array;
}

// Rend la fiche en octets. La date du document vient de l'appelant (port `Clock`), pour que
// deux rendus du même document avec la même date donnent la même `CreationDate`.
export async function renderPdf(
  doc: TDocumentDefinitions,
  fonts: PdfFonts,
  at: Date,
): Promise<Uint8Array> {
  // `pdfmake` est un objet partagé par tout le processus. Politiques et polices sont donc remises
  // à chaque appel, juste avant `createPdf`, qui les lit sur-le-champ.
  // pdfmake ne télécharge rien et ne lit aucun fichier : les polices arrivent en octets.
  pdfmake.setUrlAccessPolicy(() => false);
  pdfmake.setLocalAccessPolicy(() => false);
  pdfmake.setFonts({ Roboto: fonts });
  return new Uint8Array(await pdfmake.createPdf(pdfmakeInput(doc, at)).getBuffer());
}
