import { Group, Loader, Stack, Text } from "@mantine/core";
import { printable } from "core";
import type { PriceSnapshot } from "core";
import {
  INGREDIENTS_TEXTS as TEXTS,
  openPricesErrorText,
  openPricesReadErrorText,
  openPricesReadyText,
} from "./texts.ts";

function stateText(openPrices: PriceSnapshot["openPrices"]): string {
  if (openPrices.status === "refreshing") return TEXTS.openPricesRefreshing;
  if (openPrices.status === "ready" && openPrices.fetchedAt !== null) {
    return openPricesReadyText(openPrices.fetchedAt);
  }
  return TEXTS.openPricesNone;
}

// L'état des prix Open Prices sous la liste : jour du résumé en service, téléchargement en cours, ou dernier échec.
// Un échec de mise à jour s'ajoute à la ligne d'état, qui dit ce qui est quand même en service.
export function OpenPricesStatus({ openPrices }: { openPrices: PriceSnapshot["openPrices"] }) {
  // Lecture du résumé échouée : on ne sait pas ce qui est en service, seul le message de lecture est affiché.
  const readFailed = openPrices.errorStage === "read";
  return (
    <Stack gap={2}>
      {!readFailed && (
        <Group gap={6} wrap="nowrap">
          {openPrices.status === "refreshing" && <Loader size="xs" aria-hidden="true" />}
          <Text size="xs" c="dimmed">
            {stateText(openPrices)}
          </Text>
        </Group>
      )}
      {openPrices.error !== null && (
        <Text size="xs" c="orange">
          {readFailed
            ? openPricesReadErrorText(printable(openPrices.error))
            : openPricesErrorText(printable(openPrices.error))}
        </Text>
      )}
    </Stack>
  );
}
