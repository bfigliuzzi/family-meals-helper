import {
  Alert,
  Box,
  Button,
  Checkbox,
  Divider,
  Group,
  List,
  Loader,
  Paper,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import {
  REFERENTIAL,
  SESSION_DAY_LABELS,
  buildIngredientIndex,
  dishLetter,
  printable,
  readChecked,
  readHistory,
  shoppingChecklist,
} from "core";
import type { CheckKeeper, HistoryItem, HistoryStore, IngredientIndex } from "core";
import type { CSSProperties, ReactNode } from "react";
import { useCheckSnapshot } from "../useCheckSnapshot.ts";
import { useLatestRead } from "../useLatestRead.ts";
import { dinnersText, fullDate } from "./history/texts.ts";
import { INGREDIENTS_TEXTS as TEXTS, checkedCountText } from "./ingredients/texts.ts";

type Latest = { kind: "empty" } | { kind: "unreadable" } | { kind: "ready"; item: HistoryItem };

// Seule la ligne la plus récente compte, même illisible : montrer la liste d'un menu plus ancien sous le titre
// « dernier menu » tromperait.
async function readLatest(store: HistoryStore): Promise<Latest> {
  const first = (await store.list())[0];
  if (first === undefined) return { kind: "empty" };
  const item = readHistory([first]).items[0];
  return item === undefined ? { kind: "unreadable" } : { kind: "ready", item };
}

// Le référentiel ne change pas pendant que l'app tourne : l'index est construit une fois, au premier menu affiché.
let index: IngredientIndex | null = null;
function indexOf(): IngredientIndex {
  index ??= buildIngredientIndex(REFERENTIAL);
  return index;
}

const BLOCK: CSSProperties = { display: "block" };

// Le libellé ne contient que des éléments en ligne (il est dans un `<label>`) : un clic sur la quantité coche aussi.
function CheckLabel({
  lines,
  checked,
}: {
  lines: readonly { text: string; size: "sm" | "xs" }[];
  checked: boolean;
}): ReactNode {
  return (
    <Stack component="span" gap={0}>
      {lines.map(({ text, size }, at) => (
        <Text
          key={`${String(at)}-${text}`}
          span
          size={size}
          style={BLOCK}
          c={checked || size === "xs" ? "dimmed" : undefined}
          td={checked && at === 0 ? "line-through" : undefined}
        >
          {text}
        </Text>
      ))}
    </Stack>
  );
}

const CHECKBOX_STYLES = { body: { width: "100%" }, labelWrapper: { flex: 1 } };

function ChecklistView({
  item,
  checks,
  reading,
  onReload,
}: {
  item: HistoryItem;
  checks: CheckKeeper;
  reading: boolean;
  onReload: () => void;
}) {
  const { entry } = item;
  const request = printable(entry.request);
  const checklist = shoppingChecklist(entry.menu, indexOf());
  const owned = useCheckSnapshot(checks)[item.id];
  const writeError = owned?.error ?? null;
  const stored = readChecked(item.checked);
  // Les cases affichées : ce que le propriétaire a voulu en dernier, sinon ce que la base dit. Les clés qui ne sont
  // plus dans la liste (référentiel changé) ne sont pas affichées ; elles quittent la base à la coche suivante.
  const shown = owned?.keys ?? stored ?? [];
  const checkedKeys = new Set(shown.filter((key) => checklist.keys.includes(key)));

  function toggle(toggled: string): void {
    checks.set(
      item.id,
      checklist.keys.filter((key) =>
        key === toggled ? !checkedKeys.has(key) : checkedKeys.has(key),
      ),
    );
  }

  const box = (key: string, lines: readonly { text: string; size: "sm" | "xs" }[]) => (
    <Checkbox
      key={key}
      size="sm"
      styles={CHECKBOX_STYLES}
      checked={checkedKeys.has(key)}
      onChange={() => {
        toggle(key);
      }}
      label={<CheckLabel lines={lines} checked={checkedKeys.has(key)} />}
    />
  );

  return (
    <Stack gap="md">
      <Paper withBorder p="md" style={{ overflowWrap: "anywhere" }}>
        <Stack gap="xs">
          <Title order={3} size="h4">
            {fullDate(entry.date)}
          </Title>
          <Text size="sm" c="dimmed">
            Session le {SESSION_DAY_LABELS[entry.sessionDay]} ·{" "}
            {dinnersText(entry.menu.dishes.length)}
          </Text>
          <Text size="sm" lineClamp={2} title={request}>
            Demande : « {request} »
          </Text>
          <List size="sm" spacing={2} listStyleType="none">
            {entry.menu.dishes.map((dish, at) => (
              <List.Item key={`${String(at)}-${dish.name}`}>
                {dishLetter(at)}. {printable(dish.name)}
              </List.Item>
            ))}
          </List>
        </Stack>
      </Paper>
      {owned === undefined && stored === null && (
        <Alert color="yellow" variant="light">
          {TEXTS.unreadableChecks}
        </Alert>
      )}
      <Paper withBorder p="md" style={{ overflowWrap: "anywhere" }}>
        <Stack gap="sm">
          <Group justify="space-between" wrap="wrap">
            <Title order={3} size="h4">
              {TEXTS.listTitle}
            </Title>
            <Group gap="xs">
              <Box role="status">
                <Text size="sm">{checkedCountText(checkedKeys.size, checklist.keys.length)}</Text>
              </Box>
              {owned?.saving === true && <Loader size="xs" aria-hidden="true" />}
            </Group>
          </Group>
          {checklist.evening && (
            <Text size="xs" c="dimmed">
              {TEXTS.eveningLegend}
            </Text>
          )}
          {checklist.toConfirm && (
            <Text size="xs" c="dimmed">
              {TEXTS.toConfirmLegend}
            </Text>
          )}
          {owned !== undefined && writeError !== null && (
            <Alert color="red" variant="light" title={TEXTS.writeErrorTitle}>
              <Stack gap="xs" align="flex-start">
                <Text size="sm">
                  {printable(writeError)} {TEXTS.writeErrorLoss}
                </Text>
                <Group gap="xs">
                  <Button
                    variant="light"
                    size="xs"
                    loading={owned.saving}
                    onClick={() => {
                      checks.retry(item.id);
                    }}
                  >
                    {TEXTS.retry}
                  </Button>
                  <Button variant="subtle" size="xs" loading={reading} onClick={onReload}>
                    {TEXTS.reload}
                  </Button>
                </Group>
              </Stack>
            </Alert>
          )}
          {checklist.lines.map((line) =>
            box(line.key, [
              { text: line.name, size: "sm" },
              { text: line.detail, size: "xs" },
            ]),
          )}
          <Divider />
          {checklist.pantry === null ? (
            <Text size="sm" c="dimmed">
              {TEXTS.noPantry}
            </Text>
          ) : (
            box(checklist.pantry.key, [
              { text: TEXTS.pantryTitle, size: "sm" },
              { text: TEXTS.pantryHint, size: "xs" },
              ...checklist.pantry.items.map((text) => ({ text, size: "xs" as const })),
            ])
          )}
        </Stack>
      </Paper>
    </Stack>
  );
}

// La liste de courses du dernier menu validé, avec une case par ligne et une pour tout le placard. L'écran relit
// quand `refresh` change (une validation finie pendant qu'il est affiché). Les cases passent par le propriétaire
// `checks` : l'écran n'écrit jamais lui-même dans l'historique.
export function IngredientsScreen({
  history,
  checks,
  refresh,
  onNewSession,
}: {
  history: HistoryStore;
  checks: CheckKeeper;
  refresh: number;
  onNewSession: () => void;
}) {
  const { state, reading, retry } = useLatestRead(history, refresh, readLatest);
  return (
    <Stack gap="lg">
      <Stack gap="xs">
        <Title order={2}>{TEXTS.title}</Title>
        <Text size="sm" c="dimmed">
          {TEXTS.intro}
        </Text>
      </Stack>
      {state.status === "loading" && (
        <Group gap="xs">
          <Loader size="sm" />
          <Text size="sm">{TEXTS.loading}</Text>
        </Group>
      )}
      {state.status === "error" && (
        <Alert color="red" variant="light" title={TEXTS.errorTitle}>
          <Stack gap="xs" align="flex-start">
            <Text size="sm">{printable(state.message)}</Text>
            <Button variant="light" size="xs" loading={reading} onClick={retry}>
              {TEXTS.retry}
            </Button>
          </Stack>
        </Alert>
      )}
      {state.status === "ready" && state.value.kind === "empty" && (
        <Paper withBorder p="lg">
          <Stack gap="md" align="flex-start">
            <Text c="dimmed">{TEXTS.empty}</Text>
            <Button variant="light" onClick={onNewSession}>
              {TEXTS.goToNewSession}
            </Button>
          </Stack>
        </Paper>
      )}
      {state.status === "ready" && state.value.kind === "unreadable" && (
        <Alert color="yellow" variant="light">
          {TEXTS.unreadableMenu}
        </Alert>
      )}
      {state.status === "ready" && state.value.kind === "ready" && (
        <ChecklistView
          key={state.value.item.id}
          item={state.value.item}
          checks={checks}
          reading={reading}
          onReload={retry}
        />
      )}
    </Stack>
  );
}
