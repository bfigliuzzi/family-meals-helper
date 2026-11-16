import { Paper, ScrollArea, Stack, Text, Title } from "@mantine/core";
import { printable } from "core";
import type { Exchange } from "core";
import { TEXTS } from "./texts.ts";

// Du plus récent au plus ancien : le dernier échange est toujours en haut, sans défilement automatique.
export function ExchangeList({ exchanges }: { exchanges: readonly Exchange[] }) {
  if (exchanges.length === 0) return null;
  return (
    <Stack gap="xs">
      <Title order={4}>{TEXTS.exchanges}</Title>
      <Text size="xs" c="dimmed">
        {TEXTS.exchangesOrder}
      </Text>
      <ScrollArea.Autosize mah={360}>
        <Stack gap="xs">
          {exchanges
            .map((exchange, index) => ({ exchange, index }))
            .reverse()
            .map(({ exchange, index }) => {
              const note = printable(exchange.note).trim();
              return (
                <Paper key={index} withBorder p="sm">
                  <Text size="xs" c="dimmed">
                    {TEXTS.you}
                  </Text>
                  <Text size="sm" style={{ overflowWrap: "anywhere" }}>
                    {exchange.message}
                  </Text>
                  <Text size="xs" c="dimmed" mt="xs">
                    {TEXTS.claude}
                  </Text>
                  <Text size="sm" style={{ overflowWrap: "anywhere" }}>
                    {note === "" ? (index === 0 ? TEXTS.firstNote : TEXTS.nextNote) : note}
                  </Text>
                </Paper>
              );
            })}
        </Stack>
      </ScrollArea.Autosize>
    </Stack>
  );
}
