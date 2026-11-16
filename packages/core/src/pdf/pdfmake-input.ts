import type { TDocumentDefinitions } from "pdfmake/interfaces.js";

// pdfmake modifie la définition qu'il reçoit (positions, vecteurs des cases à cocher…) : un second rendu de la même
// définition échouerait. Il reçoit donc une copie ; les fonctions (pied de page, dispositions) sont gardées telles
// quelles.
export function copyDefinition<T>(value: T): T {
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

// Ce que reçoit `createPdf`, dans Node comme dans la vue web : une copie de la définition, avec le titre et la date
// du document (celle du port `Clock`, pour que deux rendus avec la même date donnent la même `CreationDate`).
export function pdfmakeInput(doc: TDocumentDefinitions, at: Date): TDocumentDefinitions {
  return {
    ...copyDefinition(doc),
    info: { ...doc.info, title: "Fiche de batch cooking", creationDate: at },
  };
}
