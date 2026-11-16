// Échec local du transport (trousseau, taille, réseau, délai) : son message, déjà en français et sans la clé,
// s'affiche tel quel.
export class TransportError extends Error {
  override name = "TransportError";
}
