import { Alert, Box, Button, Group, Text } from "@mantine/core";
import { printable } from "core";
import { useRef, useState } from "react";
import { HISTORY_TEXTS, fileName } from "./texts.ts";

// Les deux actions sur une fiche : l'ouvrir dans Aperçu, ou en copier le PDF dans Téléchargements. La zone
// `role="status"` est toujours montée, vide au départ : un lecteur d'écran annonce ce qui s'y écrit ensuite.
export function PdfActions({
  dateText,
  onOpen,
  onExport,
}: {
  dateText: string;
  onOpen: () => Promise<void>;
  onExport: () => Promise<string>;
}) {
  // Un état par action : l'une finissant ne libère pas l'autre. Les `useRef` ferment la fenêtre entre le clic et le
  // rendu qui désactive le bouton.
  const [opening, setOpening] = useState(false);
  const [exporting, setExporting] = useState(false);
  const openingNow = useRef(false);
  const exportingNow = useRef(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function open() {
    if (openingNow.current) return;
    openingNow.current = true;
    setOpening(true);
    setCopied(null);
    setError(null);
    try {
      await onOpen();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Erreur inconnue.");
    } finally {
      openingNow.current = false;
      setOpening(false);
    }
  }

  async function copy() {
    if (exportingNow.current) return;
    exportingNow.current = true;
    setExporting(true);
    setCopied(null);
    setError(null);
    try {
      setCopied(fileName(await onExport()));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Erreur inconnue.");
    } finally {
      exportingNow.current = false;
      setExporting(false);
    }
  }

  return (
    <Box>
      <Group gap="xs" wrap="wrap">
        <Button
          variant="light"
          size="xs"
          aria-label={`${HISTORY_TEXTS.open} du ${dateText}`}
          loading={opening}
          onClick={(event) => {
            // Le second clic d'un double clic ne relance pas l'action.
            if (event.detail > 1) return;
            void open();
          }}
        >
          {HISTORY_TEXTS.open}
        </Button>
        <Button
          variant="default"
          size="xs"
          aria-label={`${HISTORY_TEXTS.export} la fiche du ${dateText}`}
          loading={exporting}
          onClick={(event) => {
            if (event.detail > 1) return;
            void copy();
          }}
        >
          {HISTORY_TEXTS.export}
        </Button>
      </Group>
      <Box role="status">
        {copied !== null && (
          <Text size="sm" mt="xs">
            {HISTORY_TEXTS.copied}
            {printable(copied)}
          </Text>
        )}
        {error !== null && (
          <Alert color="red" variant="light" mt="xs">
            {printable(error)}
          </Alert>
        )}
      </Box>
    </Box>
  );
}
