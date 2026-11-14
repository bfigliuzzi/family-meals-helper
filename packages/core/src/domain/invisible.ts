// Caractères sans glyphe : la propriété Unicode `Default_Ignorable_Code_Point` (trait d'union conditionnel,
// espaces et joints sans chasse, gluon de mots, sélecteurs de variante, marque d'ordre des octets, remplissages
// hangul, étiquettes…). Les marques et isolats de direction en font partie : ils sont retirés comme les autres, pas
// changés en espace. On les retire avant d'imprimer (`printable`) et avant de lire ou de comparer un texte
// (`lightNormalize`, découpage de la demande), pour que le contrôle lise le même mot que celui qui sera imprimé.
const INVISIBLE = /\p{Default_Ignorable_Code_Point}/gu;

// Retire ces caractères sans rien mettre à leur place : « anti\u00adoxydant » devient « antioxydant ».
// Les autres caractères restent tels quels.
export function removeInvisible(text: string): string {
  return text.replace(INVISIBLE, "");
}
