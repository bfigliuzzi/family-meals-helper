import pdfmake from "pdfmake";
import type { TDocumentDefinitions } from "pdfmake/interfaces.js";

export interface PdfFonts {
  normal: Uint8Array;
  bold: Uint8Array;
  italics: Uint8Array;
  bolditalics: Uint8Array;
}

// pdfmake modifie la définition qu'il reçoit (positions, vecteurs des cases à cocher…) : un second rendu de la même
// définition échouerait. Il reçoit donc une copie ; les fonctions (pied de page, dispositions) sont gardées telles
// quelles.
function copyDefinition<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item: unknown) => copyDefinition(item)) as T;
  if (
    value !== null &&
    typeof value === "object" &&
    Object.getPrototypeOf(value) === Object.prototype
  ) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, copyDefinition(item)]),
    ) as T;
  }
  return value;
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
  const info = { ...doc.info, title: "Fiche de batch cooking", creationDate: at };
  return new Uint8Array(await pdfmake.createPdf({ ...copyDefinition(doc), info }).getBuffer());
}
