import { Alert, Box, Button, Group, List, Loader, Paper, Stack, Text, Title } from "@mantine/core";
import {
  DAY_LABELS,
  SESSION_DAY_LABELS,
  dishLetter,
  durationText,
  monthName,
  printable,
} from "core";
import type { HistoryStore, Session, Validation, ValidatedMenu } from "core";
import { useEffect, useRef } from "react";
import { PdfActions } from "../history/PdfActions.tsx";
import { longDate } from "../history/texts.ts";
import {
  VALIDATE_TEXTS as T,
  detailAttemptText,
  endSentence,
  plural,
  savedOpenErrorText,
} from "./texts.ts";

function capitalized(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function titleOf(validation: Validation): string {
  switch (validation.step) {
    case "detail":
      return T.titles.detail;
    case "decide":
      return validation.warning === "too-long" ? T.titles.tooLong : T.titles.fallback;
    case "save":
      return T.titles.save;
    case "save-failed":
      return T.titles.saveFailed;
    case "saved":
      return T.titles.saved;
  }
}

function Recall({ validated }: { validated: ValidatedMenu }) {
  return (
    <Stack gap="xs" style={{ overflowWrap: "anywhere" }}>
      <Text size="sm">
        Session le {SESSION_DAY_LABELS[validated.sessionDay]} · saison :{" "}
        {monthName(validated.month)} · validé le {longDate(validated.date)}
      </Text>
      <List size="sm" spacing={2} listStyleType="none">
        {validated.menu.dishes.map((dish, index) => (
          <List.Item key={`${String(index)}-${dish.name}`}>
            {dishLetter(index)}. {printable(dish.name)} — {capitalized(DAY_LABELS[dish.day])}
          </List.Item>
        ))}
      </List>
    </Stack>
  );
}

function Working({
  title,
  lines,
}: {
  title: string;
  lines: readonly { text: string; dim: boolean }[];
}) {
  return (
    <Paper withBorder p="sm">
      <Group wrap="nowrap">
        <Loader size="sm" />
        <Stack gap={2}>
          <Text fw={600}>{title}</Text>
          {lines.map((line) => (
            <Text key={line.text} size="sm" c={line.dim ? "dimmed" : undefined}>
              {line.text}
            </Text>
          ))}
        </Stack>
      </Group>
    </Paper>
  );
}

function attemptsText(attempts: number): string {
  return `${String(attempts)} ${plural(attempts, "essai", "essais")}`;
}

// Remplace les options et la grille pendant toute la validation. L'écran ne garde rien : l'étape, les essais et le
// résultat sont dans le snapshot de la session. Le titre reçoit le focus à chaque changement d'étape.
export function ValidationPanel({
  session,
  history,
  validation,
  validated,
  onLeave,
}: {
  session: Session;
  history: HistoryStore;
  validation: Validation;
  validated: ValidatedMenu;
  // Appelé après « Revenir au menu » et « Commencer une nouvelle session » : l'écran redonne le focus au champ,
  // une fois la grille remontée.
  onLeave: () => void;
}) {
  const title = useRef<HTMLHeadingElement>(null);
  const { step } = validation;
  useEffect(() => {
    title.current?.focus();
  }, [step]);

  function back() {
    session.backToMenu();
    onLeave();
  }

  let status = null;
  let body = null;
  if (validation.step === "detail") {
    status = (
      <Working
        title={T.writing}
        lines={[
          { text: detailAttemptText(validation.attempt), dim: false },
          { text: T.detailPatience, dim: true },
        ]}
      />
    );
  } else if (validation.step === "save") {
    status = <Working title={T.preparing} lines={[{ text: T.preparingHint, dim: true }]} />;
  } else if (validation.step === "decide" && validation.warning === "too-long") {
    body = (
      <>
        <Alert color="yellow" variant="light">
          <Stack gap="xs">
            <Text size="sm" style={{ overflowWrap: "anywhere" }}>
              La session détaillée dure {durationText(validation.minutes)}, au-delà de 3 h, après{" "}
              {attemptsText(validation.attempts)} de Claude. Le plat qui finit le plus tard est «{" "}
              {printable(validation.lastDish)} » (fin à {durationText(validation.lastEnd)}).
            </Text>
            <List size="sm">
              <List.Item>
                {T.keep} : {T.keepFree}
              </List.Item>
              <List.Item>
                {T.back} : {T.backTooLong}
              </List.Item>
            </List>
          </Stack>
        </Alert>
        <Group gap="sm">
          <Button variant="default" onClick={back}>
            {T.back}
          </Button>
          <Button
            variant="default"
            onClick={() => {
              void session.keepSheet();
            }}
          >
            {T.keep}
          </Button>
        </Group>
      </>
    );
  } else if (validation.step === "decide") {
    // Une erreur technique vide après nettoyage n'affiche pas de ligne « Message reçu : » seule.
    const received = endSentence(printable(validation.technicalError ?? ""));
    body = (
      <>
        <Alert color="yellow" variant="light">
          <Stack gap="xs">
            <Text size="sm">Raison : {printable(validation.reason)}.</Text>
            {received !== "" && <Text size="sm">Message reçu : {received}</Text>}
            <Text size="sm">{T.fallbackExplain}</Text>
            <List size="sm">
              <List.Item>
                {T.keepPhases} : {T.keepPhasesFree}
              </List.Item>
              <List.Item>
                {T.back} : {T.backFallback}
              </List.Item>
            </List>
          </Stack>
        </Alert>
        <Group gap="sm">
          <Button variant="default" onClick={back}>
            {T.back}
          </Button>
          <Button
            variant="default"
            onClick={() => {
              void session.keepSheet();
            }}
          >
            {T.keepPhases}
          </Button>
        </Group>
      </>
    );
  } else if (validation.step === "save-failed") {
    body = (
      <>
        <Alert color="red" variant="light">
          <Stack gap="xs">
            <Text size="sm">{printable(validation.message)}</Text>
            <Text size="sm">{T.saveFailedKept}</Text>
          </Stack>
        </Alert>
        <Group gap="sm">
          <Button
            onClick={() => {
              void session.retrySave();
            }}
          >
            {T.retry}
          </Button>
          <Button variant="default" onClick={back}>
            {T.back}
          </Button>
        </Group>
        <Text size="xs" c="dimmed">
          {T.saveFailedBack}
        </Text>
      </>
    );
  } else {
    const { id, warning, openError } = validation;
    body = (
      <>
        <Alert color="teal" variant="light">
          {openError === null ? T.savedOk : savedOpenErrorText(openError)}
        </Alert>
        {warning !== null && (
          <Alert color="yellow" variant="light">
            {warning === "too-long" ? T.warningTooLong : T.warningFallback}
          </Alert>
        )}
        <PdfActions
          dateText={longDate(validated.date)}
          onOpen={() => session.reopen()}
          onExport={() => history.exportPdf(id)}
        />
        <Group gap="sm">
          <Button
            onClick={() => {
              session.reset();
              onLeave();
            }}
          >
            {T.newSession}
          </Button>
          <Button variant="default" onClick={back}>
            {T.back}
          </Button>
        </Group>
        <Text size="xs" c="dimmed">
          {T.savedBackHelp}
        </Text>
      </>
    );
  }

  return (
    <Paper withBorder p="lg">
      <Stack gap="md">
        <Title order={3} tabIndex={-1} ref={title}>
          {titleOf(validation)}
        </Title>
        <Recall validated={validated} />
        <Box role="status">{status}</Box>
        {body}
      </Stack>
    </Paper>
  );
}
