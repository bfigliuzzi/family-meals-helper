import {
  Button,
  Grid,
  Group,
  Input,
  NumberInput,
  SegmentedControl,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { SESSION_DAYS, SESSION_DAY_LABELS, isSessionBusy, monthName } from "core";
import type { HistoryStore, PriceKeeper, Session, SettingsKeeper } from "core";
import { useEffect, useId, useRef, useState } from "react";
import { useSessionSnapshot } from "../useSessionSnapshot.ts";
import { useSettingsSnapshot } from "../useSettingsSnapshot.ts";
import { ExchangeList } from "./session/ExchangeList.tsx";
import { MenuPanel } from "./session/MenuPanel.tsx";
import { RequestPanel } from "./session/RequestPanel.tsx";
import { ValidationPanel } from "./session/ValidationPanel.tsx";
import { TEXTS } from "./session/texts.ts";

const BREAKPOINTS = { xs: "480px", sm: "700px", md: "900px", lg: "1100px", xl: "1300px" };

const DAY_OPTIONS = SESSION_DAYS.map((day) => ({
  value: day,
  label: SESSION_DAY_LABELS[day].charAt(0).toUpperCase() + SESSION_DAY_LABELS[day].slice(1),
}));

// L'écran ne garde rien d'important : la conversation, le menu, les épingles et l'appel en cours sont dans le
// propriétaire de la session, qui survit au changement d'écran.
export function NewSessionScreen({
  session,
  settings,
  history,
  prices,
  onOpenSettings,
}: {
  session: Session;
  settings: SettingsKeeper;
  history: HistoryStore;
  prices: PriceKeeper;
  onOpenSettings: () => void;
}) {
  const snapshot = useSessionSnapshot(session);
  const settingsSnapshot = useSettingsSnapshot(settings);
  const [confirming, setConfirming] = useState(false);
  const field = useRef<HTMLTextAreaElement>(null);
  const dayLabelId = useId();
  // Champ du nombre de dîners : un brouillon, comme la capacité d'un appareil dans Réglages.
  const [dinners, setDinners] = useState<number | string>(snapshot.dinners);
  const [shownDinners, setShownDinners] = useState(snapshot.dinners);
  if (shownDinners !== snapshot.dinners) {
    setShownDinners(snapshot.dinners);
    setDinners(snapshot.dinners);
  }

  // Champ « Budget max (€) » : le brouillon et son refus (`budgetInvalid`) vivent dans la session, qui survit au
  // changement d'écran. L'écran ne garde que « l'erreur est-elle déjà montrée » : après une perte de focus ou un envoi
  // refusé ; un retour sur l'écran avec un brouillon illisible la montre tout de suite.
  const [budgetTouched, setBudgetTouched] = useState(snapshot.budgetInvalid);
  const budgetField = useRef<HTMLInputElement>(null);

  useEffect(() => {
    settings.load();
  }, [settings]);

  // Un nouveau résultat remonte tout l'affichage du menu : une fenêtre « éviter » ouverte disparaît, et le focus
  // qu'elle avait tombe sur la page. Il revient alors au champ de cet écran (monté), pas à celui de l'écran qui a
  // lancé l'appel (peut-être déjà quitté).
  const results = useRef(snapshot.exchanges.length);
  useEffect(() => {
    if (results.current === snapshot.exchanges.length) return;
    results.current = snapshot.exchanges.length;
    if (document.activeElement === document.body) field.current?.focus();
  }, [snapshot.exchanges.length]);

  // « Revenir au menu », « Commencer une nouvelle session » et « Effacer » remplacent la vue de validation par la
  // grille : le champ n'est pas encore monté dans le gestionnaire du clic. Le focus est demandé ici et donné par
  // l'effet, après le rendu qui a remonté le champ.
  const [focusRequest, setFocusRequest] = useState(0);
  useEffect(() => {
    if (focusRequest > 0) field.current?.focus();
  }, [focusRequest]);
  const askFocus = () => {
    setFocusRequest((count) => count + 1);
  };

  const busy = isSessionBusy(snapshot);
  const { current, validation, validated } = snapshot;
  const canRestart =
    !busy &&
    (snapshot.exchanges.length > 0 ||
      snapshot.draft !== "" ||
      snapshot.failure !== null ||
      validation !== null);

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-start">
        <Stack gap="xs" maw={560}>
          <Title order={2}>{TEXTS.title}</Title>
          <Text size="sm" c="dimmed">
            {TEXTS.intro}
          </Text>
          <Text size="sm" c="dimmed">
            {TEXTS.lost}
          </Text>
        </Stack>
        <Button
          variant="subtle"
          color="gray"
          disabled={!canRestart}
          onClick={() => {
            setConfirming(true);
          }}
        >
          {TEXTS.restart}
        </Button>
      </Group>
      {confirming && canRestart && (
        <Stack gap="xs" align="flex-start">
          <Text size="sm">
            {validation === null ? TEXTS.restartAsk : TEXTS.restartAskValidation}
          </Text>
          <Group gap="xs">
            <Button
              color="red"
              size="xs"
              onClick={() => {
                session.reset();
                setConfirming(false);
                askFocus();
              }}
            >
              {TEXTS.erase}
            </Button>
            <Button
              variant="default"
              size="xs"
              onClick={() => {
                setConfirming(false);
              }}
            >
              {TEXTS.cancel}
            </Button>
          </Group>
        </Stack>
      )}
      {validation !== null && validated !== null ? (
        <ValidationPanel
          session={session}
          history={history}
          validation={validation}
          validated={validated}
          onLeave={askFocus}
        />
      ) : (
        <>
          <Group wrap="wrap" align="flex-end" gap="lg">
            <Stack gap={4}>
              <Input.Wrapper label={TEXTS.dayLabel} labelProps={{ id: dayLabelId }}>
                <SegmentedControl
                  aria-labelledby={dayLabelId}
                  data={DAY_OPTIONS}
                  value={snapshot.sessionDay}
                  disabled={busy}
                  onChange={(value) => {
                    const day = SESSION_DAYS.find((candidate) => candidate === value);
                    if (day !== undefined) session.setSessionDay(day);
                  }}
                />
              </Input.Wrapper>
              {current !== null && current.sessionDay !== snapshot.sessionDay && (
                <Text size="sm">{TEXTS.dayChanged}</Text>
              )}
            </Stack>
            <Stack gap={4}>
              <NumberInput
                label={TEXTS.dinnersLabel}
                description={TEXTS.dinnersHint}
                min={1}
                max={5}
                allowDecimal={false}
                clampBehavior="strict"
                w={180}
                disabled={busy}
                value={dinners}
                onChange={(value) => {
                  setDinners(value);
                  if (typeof value === "number") session.setDinners(value);
                }}
                onBlur={() => {
                  if (dinners === "") setDinners(snapshot.dinners);
                }}
              />
              {current !== null && current.dinners !== snapshot.dinners && (
                <Text size="sm">{TEXTS.dinnersChanged}</Text>
              )}
            </Stack>
            <NumberInput
              ref={budgetField}
              label={TEXTS.budgetLabel}
              description={TEXTS.budgetHint}
              decimalScale={2}
              decimalSeparator=","
              allowNegative={false}
              hideControls
              clampBehavior="none"
              w={180}
              disabled={busy}
              value={snapshot.budgetDraft}
              error={budgetTouched && snapshot.budgetInvalid ? TEXTS.budgetError : undefined}
              onChange={(value) => {
                session.setBudgetDraft(value);
                if (!session.snapshot().budgetInvalid) setBudgetTouched(false);
              }}
              onBlur={() => {
                setBudgetTouched(true);
              }}
            />
            <Text size="sm">Saison : {monthName(snapshot.month)}</Text>
          </Group>
          <Grid type="container" breakpoints={BREAKPOINTS}>
            <Grid.Col span={{ base: 12, sm: 5 }}>
              <Stack gap="md">
                <RequestPanel
                  session={session}
                  snapshot={snapshot}
                  settings={settingsSnapshot}
                  field={field}
                  onBudgetBlocked={() => {
                    setBudgetTouched(true);
                    budgetField.current?.focus();
                  }}
                  onOpenSettings={onOpenSettings}
                />
                <ExchangeList exchanges={snapshot.exchanges} />
              </Stack>
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 7 }}>
              <MenuPanel
                snapshot={snapshot}
                session={session}
                settings={settings}
                prices={prices}
                field={field}
                onOpenSettings={onOpenSettings}
              />
            </Grid.Col>
          </Grid>
        </>
      )}
    </Stack>
  );
}
