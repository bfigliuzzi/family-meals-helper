// Les deux fichiers de la version navigateur de pdfmake n'ont pas de types : on leur donne ceux du paquet
// `@types/pdfmake`. Ce sont des modules CommonJS : Vite et Node rendent l'objet exporté dans `default`.
declare module "pdfmake/build/pdfmake.js" {
  import * as pdfmake from "pdfmake";
  const api: typeof pdfmake;
  export default api;
}

declare module "pdfmake/build/vfs_fonts.js" {
  import type { TVirtualFileSystem } from "pdfmake/interfaces.js";
  const vfs: TVirtualFileSystem;
  export default vfs;
}
