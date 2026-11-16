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
import { useCallback, useEffect, useRef, useState } from "react";
import { PdfActions } from "./history/PdfActions.tsx";
import { HISTORY_TEXTS, dinnersText, fullDate, longDate, unreadableText } from "./history/texts.ts";

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; items: HistoryItem[]; unreadable: number };

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
  const [state, setState] = useState<State>({ status: "loading" });
  // `attempt` est le numéro de la lecture demandée : il ne fait qu'augmenter, à chaque clic sur « Réessayer » et à
  // chaque changement de `refresh` ou de `history` (ajusté pendant le rendu, jamais dans un effet). Un seul effet lance les lectures.
  // `settled` est le numéro de la dernière lecture lancée qui a répondu. Tant qu'ils diffèrent, une lecture est en
  // cours : `reading` est calculé, jamais stocké.
  const [attempt, setAttempt] = useState(0);
  const [settled, setSettled] = useState<number | null>(null);
  const [previousRefresh, setPreviousRefresh] = useState(refresh);
  const [previousHistory, setPreviousHistory] = useState(history);
  if (refresh !== previousRefresh || history !== previousHistory) {
    setPreviousRefresh(refresh);
    setPreviousHistory(history);
    setAttempt(attempt + 1);
  }
  const reading = attempt !== settled;
  // Une lecture qui répond après une lecture plus récente est ignorée.
  const latestRead = useRef(0);

  const load = useCallback(
    async (number: number) => {
      latestRead.current += 1;
      const mine = latestRead.current;
      let next: State;
      try {
        next = { status: "ready", ...readHistory(await history.list()) };
      } catch (reason) {
        next = {
          status: "error",
          message: reason instanceof Error ? reason.message : "Erreur inconnue.",
        };
      }
      if (mine === latestRead.current) {
        setState(next);
        setSettled(number);
      }
    },
    [history],
  );

  useEffect(() => {
    void load(attempt);
  }, [load, attempt]);

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
            <Button
              variant="light"
              size="xs"
              loading={reading}
              onClick={() => {
                setAttempt(attempt + 1);
              }}
            >
              {HISTORY_TEXTS.retry}
            </Button>
          </Stack>
        </Alert>
      )}
      {state.status === "ready" && (
        <>
          {state.unreadable > 0 && (
            <Alert color="yellow" variant="light">
              {unreadableText(state.unreadable)}
            </Alert>
          )}
          {state.items.length === 0 && (
            <Paper withBorder p="lg">
              <Stack gap="md" align="flex-start">
                <Text c="dimmed">{HISTORY_TEXTS.empty}</Text>
                <Button variant="light" onClick={onNewSession}>
                  {HISTORY_TEXTS.goToNewSession}
                </Button>
              </Stack>
            </Paper>
          )}
          {state.items.length > 0 && (
            <Stack gap="sm">
              {state.items.map((item, index) => (
                <EntryCard key={item.id} item={item} latest={index === 0} history={history} />
              ))}
            </Stack>
          )}
        </>
      )}
    </Stack>
  );
}
