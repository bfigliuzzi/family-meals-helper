import { pdfmakeInput } from "core";
import type { TDocumentDefinitions } from "pdfmake/interfaces.js";

// pdfmake navigateur et ses polices (≈ 2,7 Mo non minifiés) : chargés au premier rendu, dans des morceaux à part.
// Le VFS (les quatre Roboto en base64) n'est ajouté qu'une fois : la promesse est gardée au niveau du module.
let loading: ReturnType<typeof load> | null = null;

async function load() {
  const [pdfModule, vfsModule] = await Promise.all([
    import("pdfmake/build/pdfmake.js"),
    import("pdfmake/build/vfs_fonts.js"),
  ]);
  const pdfMake = pdfModule.default;
  pdfMake.addVirtualFileSystem(vfsModule.default);
  return pdfMake;
}

export async function renderSheetPdf(doc: TDocumentDefinitions, at: Date): Promise<Uint8Array> {
  loading ??= load();
  let pdfMake: Awaited<ReturnType<typeof load>>;
  try {
    pdfMake = await loading;
  } catch (error) {
    // Un chargement raté ne reste pas en mémoire : le « Réessayer » suivant le refait.
    loading = null;
    throw error;
  }
  // `pdfMake` est un objet partagé : politique d'accès et polices sont remises à chaque rendu, juste avant
  // `createPdf`, qui les lit sur-le-champ. Pas de politique d'accès aux fichiers locaux : l'objet navigateur n'en a pas (l'appeler lèverait).
  pdfMake.setUrlAccessPolicy(() => false);
  pdfMake.setFonts({
    Roboto: {
      normal: "Roboto-Regular.ttf",
      bold: "Roboto-Medium.ttf",
      italics: "Roboto-Italic.ttf",
      bolditalics: "Roboto-MediumItalic.ttf",
    },
  });
  // Le calcul bloque le fil principal : l'écran peint d'abord « Préparation de la fiche… ».
  await new Promise((resolve) => setTimeout(resolve, 0));
  return new Uint8Array(await pdfMake.createPdf(pdfmakeInput(doc, at)).getBuffer());
}
