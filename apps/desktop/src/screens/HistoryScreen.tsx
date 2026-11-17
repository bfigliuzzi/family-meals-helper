import {
  Alert,
  Badge,
  Button,
  Group,
  List,
  Loader,
  Paper,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { SESSION_DAY_LABELS, dishLetter, printable, readHistory } from "core";
import type { HistoryItem, HistoryStore } from "core";
import { PdfActions } from "./history/PdfActions.tsx";
import { useLatestRead } from "../useLatestRead.ts";
import { HISTORY_TEXTS, dinnersText, fullDate, longDate, unreadableText } from "./history/texts.ts";

const readEntries = async (store: HistoryStore) => readHistory(await store.list());

function EntryCard({
  item,
  latest,
  history,
}: {
  item: HistoryItem;
  latest: boolean;
  history: HistoryStore;
}) {
  const { entry } = item;
  const request = printable(entry.request);
  const warning =
    entry.sheet === "too-long"
      ? HISTORY_TEXTS.tooLong
      : entry.sheet === "fallback"
        ? HISTORY_TEXTS.fallback
        : null;
  return (
    <Paper withBorder p="md" style={{ overflowWrap: "anywhere" }}>
      <Stack gap="xs">
        <Group justify="space-between" align="flex-start" wrap="wrap">
          <Title order={3} size="h4">
            {fullDate(entry.date)}
          </Title>
          <Group gap="xs">
            {latest && (
              <Badge variant="light" color="gray">
                {HISTORY_TEXTS.latest}
              </Badge>
            )}
            {warning !== null && (
              <Badge variant="light" color="yellow">
                {warning}
              </Badge>
            )}
          </Group>
        </Group>
        <Text size="sm" c="dimmed">
          Session le {SESSION_DAY_LABELS[entry.sessionDay]} ·{" "}
          {dinnersText(entry.menu.dishes.length)}
        </Text>
        <Text size="sm" lineClamp={2} title={request}>
          Demande : « {request} »
        </Text>
        <List size="sm" spacing={2} listStyleType="none">
          {entry.menu.dishes.map((dish, index) => (
            <List.Item key={`${String(index)}-${dish.name}`}>
              {dishLetter(index)}. {printable(dish.name)}
            </List.Item>
          ))}
        </List>
        <PdfActions
          dateText={longDate(entry.date)}
          onOpen={() => history.openPdf(item.id)}
          onExport={() => history.exportPdf(item.id)}
        />
      </Stack>
    </Paper>
  );
}

// Les 5 derniers menus validés. L'écran ne fait que lire (lecture locale et gratuite) : il relit quand `refresh`
// change, c'est-à-dire quand une opération de la session se termine pendant qu'il est affiché.
export function HistoryScreen({
  history,
  refresh,
  onNewSession,
}: {
  history: HistoryStore;
  refresh: number;
  onNewSession: () => void;
}) {
  const { state, reading, retry } = useLatestRead(history, refresh, readEntries);

  return (
    <Stack gap="lg">
      <Stack gap="xs">
        <Title order={2}>{HISTORY_TEXTS.title}</Title>
        <Text size="sm" c="dimmed">
          {HISTORY_TEXTS.intro}
        </Text>
      </Stack>
      {state.status === "loading" && (
        <Group gap="xs">
          <Loader size="sm" />
          <Text size="sm">{HISTORY_TEXTS.loading}</Text>
        </Group>
      )}
      {state.status === "error" && (
        <Alert color="red" variant="light" title={HISTORY_TEXTS.errorTitle}>
          <Stack gap="xs" align="flex-start">
            <Text size="sm">{printable(state.message)}</Text>
            <Button variant="light" size="xs" loading={reading} onClick={retry}>
              {HISTORY_TEXTS.retry}
            </Button>
          </Stack>
        </Alert>
      )}
      {state.status === "ready" && (
        <>
          {state.value.unreadable > 0 && (
            <Alert color="yellow" variant="light">
              {unreadableText(state.value.unreadable)}
            </Alert>
          )}
          {state.value.items.length === 0 && (
            <Paper withBorder p="lg">
              <Stack gap="md" align="flex-start">
                <Text c="dimmed">{HISTORY_TEXTS.empty}</Text>
                <Button variant="light" onClick={onNewSession}>
                  {HISTORY_TEXTS.goToNewSession}
                </Button>
              </Stack>
            </Paper>
          )}
          {state.value.items.length > 0 && (
            <Stack gap="sm">
              {state.value.items.map((item, index) => (
                <EntryCard key={item.id} item={item} latest={index === 0} history={history} />
              ))}
            </Stack>
          )}
        </>
      )}
    </Stack>
  );
}
