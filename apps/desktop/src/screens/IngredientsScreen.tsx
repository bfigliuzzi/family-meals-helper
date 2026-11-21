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
  checklistCost,
  dishLetter,
  isValidManualKey,
  printable,
  readChecked,
  readHistory,
  shoppingChecklist,
} from "core";
import type {
  CheckKeeper,
  ChecklistLine,
  HistoryItem,
  HistoryStore,
  IngredientIndex,
  PriceKeeper,
} from "core";
import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { useCheckSnapshot } from "../useCheckSnapshot.ts";
import { useLatestRead } from "../useLatestRead.ts";
import { usePriceSnapshot } from "../usePriceSnapshot.ts";
import { dinnersText, fullDate } from "./history/texts.ts";
import { OpenPricesStatus } from "./ingredients/OpenPricesStatus.tsx";
import { PriceModal } from "./ingredients/PriceModal.tsx";
import { INGREDIENTS_TEXTS as TEXTS, checkedCountText, myPriceLabel } from "./ingredients/texts.ts";

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
const GROWING: CSSProperties = { flex: 1 };

function ChecklistView({
  item,
  checks,
  prices,
  reading,
  onReload,
}: {
  item: HistoryItem;
  checks: CheckKeeper;
  prices: PriceKeeper;
  reading: boolean;
  onReload: () => void;
}) {
  const { entry } = item;
  const request = printable(entry.request);
  const checklist = shoppingChecklist(entry.menu, indexOf());
  const priceSnapshot = usePriceSnapshot(prices);
  const { manual } = priceSnapshot;
  // Le coût se recalcule quand le menu ou les sources de prix changent, pas à chaque coche.
  const cost = useMemo(
    () => checklistCost(entry.menu, indexOf(), priceSnapshot.lookups),
    [entry.menu, priceSnapshot.lookups],
  );
  const [editing, setEditing] = useState<ChecklistLine | null>(null);
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

  const box = (
    key: string,
    lines: readonly { text: string; size: "sm" | "xs" }[],
    action?: ReactNode,
  ) => {
    const checkbox = (
      <Checkbox
        key={key}
        size="sm"
        styles={CHECKBOX_STYLES}
        style={action === undefined ? undefined : GROWING}
        checked={checkedKeys.has(key)}
        onChange={() => {
          toggle(key);
        }}
        label={<CheckLabel lines={lines} checked={checkedKeys.has(key)} />}
      />
    );
    // Le bouton est hors du `<label>` : un clic dessus ne coche pas la case.
    return action === undefined ? (
      checkbox
    ) : (
      <Group key={key} wrap="nowrap" align="flex-start" justify="space-between" gap="xs">
        {checkbox}
        {action}
      </Group>
    );
  };

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
          <Stack gap={2}>
            <Text size="sm" fw={600}>
              {cost.total}
            </Text>
            <Text size="xs" c="dimmed">
              {TEXTS.costDisclaimer}
            </Text>
          </Stack>
          {manual.status === "error" && (
            <Alert color="yellow" variant="light">
              <Stack gap="xs" align="flex-start">
                <Text size="sm">
                  {TEXTS.manualUnreadable}
                  {manual.error === null ? "" : ` ${printable(manual.error)}`}
                </Text>
                <Button
                  variant="light"
                  size="xs"
                  onClick={() => {
                    void prices.load();
                  }}
                >
                  {TEXTS.retry}
                </Button>
              </Stack>
            </Alert>
          )}
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
            box(
              line.key,
              [
                { text: line.name, size: "sm" },
                { text: line.detail, size: "xs" },
                { text: cost.lines.get(line.key) ?? "", size: "xs" },
              ],
              isValidManualKey(line.key) ? (
                <Button
                  variant="subtle"
                  size="compact-xs"
                  aria-label={myPriceLabel(line.name)}
                  disabled={manual.status !== "ready"}
                  onClick={() => {
                    setEditing(line);
                  }}
                >
                  {TEXTS.myPrice}
                </Button>
              ) : (
                <Text size="xs" c="dimmed" ta="right">
                  {TEXTS.myPriceUnavailable}
                </Text>
              ),
            ),
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
          {cost.notice !== "" && (
            <Text size="xs" c="dimmed">
              {cost.notice}
            </Text>
          )}
          <OpenPricesStatus openPrices={priceSnapshot.openPrices} />
        </Stack>
      </Paper>
      {editing !== null && (
        <PriceModal
          key={editing.key}
          line={editing}
          existing={manual.rows.find((row) => row.key === editing.key)}
          prices={prices}
          onClose={() => {
            setEditing(null);
          }}
        />
      )}
    </Stack>
  );
}

// La liste de courses du dernier menu validé, avec une case par ligne et une pour tout le placard. L'écran relit
// quand `refresh` change (une validation finie pendant qu'il est affiché). Les cases passent par le propriétaire
// `checks` : l'écran n'écrit jamais lui-même dans l'historique.
export function IngredientsScreen({
  history,
  checks,
  prices,
  refresh,
  onNewSession,
}: {
  history: HistoryStore;
  checks: CheckKeeper;
  prices: PriceKeeper;
  refresh: number;
  onNewSession: () => void;
}) {
  const { state, reading, retry } = useLatestRead(history, refresh, readLatest);
  // Une relecture à chaque affichage de l'écran est voulue : elle est bon marché.
  useEffect(() => {
    void prices.load();
  }, [prices]);
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
          prices={prices}
          reading={reading}
          onReload={retry}
        />
      )}
    </Stack>
  );
}
