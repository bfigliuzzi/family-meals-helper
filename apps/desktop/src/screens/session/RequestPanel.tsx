import {
  Alert,
  Box,
  Button,
  Group,
  Loader,
  Paper,
  Stack,
  Text,
  Textarea,
  Title,
} from "@mantine/core";
import { isSessionBusy } from "core";
import type { Session, SessionSnapshot, SettingsSnapshot } from "core";
import { useRef, useState } from "react";
import type { RefObject, SyntheticEvent } from "react";
import { SettingsLoading } from "../settings/SettingsLoading.tsx";
import { failureText, failureTitle, opensSettings, pendingText, TEXTS } from "./texts.ts";

function FailureAlert({
  failure,
  onOpenSettings,
}: {
  failure: NonNullable<SessionSnapshot["failure"]>;
  onOpenSettings: () => void;
}) {
  const technical = failure.stop === "technical-error";
  return (
    <Alert color={technical ? "red" : "orange"} variant="light" title={failureTitle(failure)}>
      <Text size="sm">{failureText(failure)}</Text>
      {technical && opensSettings(failure.technicalError ?? "") && (
        <Button variant="light" size="xs" mt="xs" onClick={onOpenSettings}>
          {TEXTS.openSettings}
        </Button>
      )}
    </Alert>
  );
}

export function RequestPanel({
  session,
  snapshot,
  settings,
  field,
  onOpenSettings,
}: {
  session: Session;
  snapshot: SessionSnapshot;
  settings: SettingsSnapshot;
  // Le champ de la demande : l'écran le crée pour y rendre le focus après « Effacer ».
  field: RefObject<HTMLTextAreaElement | null>;
  onOpenSettings: () => void;
}) {
  const [error, setError] = useState<string | undefined>(undefined);
  const form = useRef<HTMLFormElement>(null);
  const revision = snapshot.current !== null;
  const { pending } = snapshot;

  async function submit(event: SyntheticEvent) {
    event.preventDefault();
    const outcome = await session.send();
    if (!outcome.ok && outcome.reason === "empty") {
      setError(revision ? TEXTS.reviseEmpty : TEXTS.requestEmpty);
    } else if (!outcome.ok && outcome.reason === "too-long") {
      setError(TEXTS.tooLong);
    }
    // Le focus revient au champ s'il n'est allé nulle part d'autre, et si l'écran est encore là.
    const active = document.activeElement;
    if (
      field.current !== null &&
      (active === document.body || (active !== null && form.current?.contains(active) === true))
    ) {
      field.current.focus();
    }
  }

  let body;
  if (settings.status === "load-error") {
    body = (
      <Alert color="red" variant="light" title={TEXTS.settingsUnavailable}>
        <Text size="sm">{TEXTS.settingsNeeded}</Text>
        <Button variant="light" size="xs" mt="xs" onClick={onOpenSettings}>
          {TEXTS.openSettings}
        </Button>
      </Alert>
    );
  } else if (settings.status !== "ready") {
    body = <SettingsLoading />;
  } else {
    body = (
      <form
        ref={form}
        onSubmit={(event) => {
          submit(event).catch((error: unknown) => {
            console.error("Envoi de la demande en erreur", error);
          });
        }}
      >
        <Stack gap="sm">
          <Textarea
            ref={field}
            label={revision ? TEXTS.reviseLabel : TEXTS.requestLabel}
            placeholder={revision ? TEXTS.revisePlaceholder : TEXTS.requestPlaceholder}
            autosize
            minRows={3}
            maxRows={8}
            maxLength={2000}
            readOnly={isSessionBusy(snapshot)}
            value={snapshot.draft}
            error={error}
            onChange={(event) => {
              setError(undefined);
              session.setDraft(event.currentTarget.value);
            }}
          />
          <Group>
            <Button
              type="submit"
              loading={pending !== null}
              onClick={(event) => {
                // Le second clic d'un double clic ne renvoie pas le formulaire.
                if (event.detail > 1) event.preventDefault();
              }}
            >
              {revision ? TEXTS.send : TEXTS.compose}
            </Button>
          </Group>
          <Text size="xs" c="dimmed">
            {TEXTS.duration}
          </Text>
        </Stack>
      </form>
    );
  }

  return (
    <Paper withBorder p="lg">
      <Stack gap="sm">
        <Title order={3}>{revision ? TEXTS.reviseTitle : TEXTS.requestTitle}</Title>
        {body}
        <Box role="status">
          {pending !== null && (
            <Paper withBorder p="sm">
              <Group wrap="nowrap">
                <Loader size="sm" />
                <Stack gap={2}>
                  <Text fw={600}>{TEXTS.checking}</Text>
                  <Text size="sm">{pendingText(pending.attempt)}</Text>
                  <Text size="sm" c="dimmed">
                    {TEXTS.patience}
                  </Text>
                </Stack>
              </Group>
            </Paper>
          )}
        </Box>
        {snapshot.failure !== null && (
          <FailureAlert failure={snapshot.failure} onOpenSettings={onOpenSettings} />
        )}
      </Stack>
    </Paper>
  );
}
