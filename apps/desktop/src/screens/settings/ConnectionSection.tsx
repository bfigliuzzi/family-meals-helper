import {
  Alert,
  Badge,
  Button,
  Divider,
  Group,
  Loader,
  Paper,
  PasswordInput,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { checkApiKey } from "core";
import type { SettingsKeeper, SettingsSnapshot, SecretAdmin } from "core";
import { useEffect, useState } from "react";
import type { SyntheticEvent } from "react";
import { messageAt, refusalMessage } from "./refusal.ts";
import { SettingsLoading } from "./SettingsLoading.tsx";

const SECRET = "anthropic-api-key";

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "Erreur inconnue.";
}

// Le front ne lit jamais la clé stockée : il ne connaît que sa présence (`has`).
type Presence =
  { status: "checking" | "present" | "absent" } | { status: "error"; message: string };
type Mode = "view" | "replace" | "confirm-delete";

function ApiKeyPart({ secretAdmin }: { secretAdmin: SecretAdmin }) {
  const [presence, setPresence] = useState<Presence>({ status: "checking" });
  const [attempt, setAttempt] = useState(0);
  const [mode, setMode] = useState<Mode>("view");
  const [draft, setDraft] = useState("");
  const [draftError, setDraftError] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<{ title: string; message: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    secretAdmin.has(SECRET).then(
      (present) => {
        if (active) setPresence({ status: present ? "present" : "absent" });
      },
      (error: unknown) => {
        if (active) setPresence({ status: "error", message: messageOf(error) });
      },
    );
    return () => {
      active = false;
    };
  }, [secretAdmin, attempt]);

  function closeForm() {
    setMode("view");
    setDraft("");
    setDraftError(undefined);
    setFailure(null);
  }

  async function save(event: SyntheticEvent) {
    event.preventDefault();
    const checked = checkApiKey(draft);
    if (!checked.ok) {
      setDraftError(checked.error);
      return;
    }
    setDraftError(undefined);
    setFailure(null);
    setBusy(true);
    try {
      await secretAdmin.set(SECRET, checked.key);
      setDraft("");
      setPresence({ status: "present" });
      setMode("view");
      setNotice("Clé enregistrée dans le trousseau.");
    } catch (error) {
      setFailure({ title: "Échec de l'enregistrement de la clé", message: messageOf(error) });
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setFailure(null);
    setBusy(true);
    try {
      await secretAdmin.delete(SECRET);
      setPresence({ status: "absent" });
      setMode("view");
      setNotice("Clé supprimée du trousseau.");
    } catch (error) {
      setFailure({ title: "Échec de la suppression de la clé", message: messageOf(error) });
    } finally {
      setBusy(false);
    }
  }

  const keyForm = (cancellable: boolean) => (
    <form onSubmit={(event) => void save(event)}>
      <Stack gap="xs" align="flex-start">
        <PasswordInput
          label="Clé d'API"
          description="Elle est rangée dans le trousseau macOS et ne sera plus jamais affichée."
          placeholder="Collez votre clé ici"
          autoComplete="off"
          spellCheck={false}
          visibilityToggleButtonProps={{ "aria-label": "Afficher ou masquer la clé" }}
          w="100%"
          value={draft}
          error={draftError}
          onChange={(event) => {
            setDraft(event.currentTarget.value);
          }}
        />
        <Group gap="xs">
          <Button type="submit" loading={busy}>
            Enregistrer la clé
          </Button>
          {cancellable && (
            <Button type="button" variant="subtle" disabled={busy} onClick={closeForm}>
              Annuler
            </Button>
          )}
        </Group>
      </Stack>
    </form>
  );

  let body;
  if (presence.status === "checking") {
    body = (
      <Group gap="xs">
        <Loader size="xs" />
        <Text size="sm">Vérification du trousseau…</Text>
      </Group>
    );
  } else if (presence.status === "error") {
    body = (
      <Alert color="red" variant="light" title="Trousseau inaccessible">
        <Text size="sm">{presence.message}</Text>
        <Button
          variant="light"
          size="xs"
          mt="xs"
          onClick={() => {
            setPresence({ status: "checking" });
            setAttempt((count) => count + 1);
          }}
        >
          Réessayer
        </Button>
      </Alert>
    );
  } else if (presence.status === "absent") {
    body = (
      <Stack gap="sm">
        <Text size="sm">
          Aucune clé enregistrée. Sans clé, l'app ne pourra pas composer de menus.
        </Text>
        {keyForm(false)}
      </Stack>
    );
  } else {
    body = (
      <Stack gap="sm">
        <Group gap="sm">
          <Badge color="teal" variant="light">
            Clé enregistrée
          </Badge>
          <Text size="sm" c="dimmed">
            Elle est dans le trousseau macOS et n'est jamais réaffichée.
          </Text>
        </Group>
        {mode === "view" && (
          <Group gap="xs">
            <Button
              variant="default"
              size="xs"
              onClick={() => {
                setNotice(null);
                setMode("replace");
              }}
            >
              Remplacer la clé
            </Button>
            <Button
              variant="subtle"
              color="red"
              size="xs"
              onClick={() => {
                setNotice(null);
                setMode("confirm-delete");
              }}
            >
              Supprimer la clé
            </Button>
          </Group>
        )}
        {mode === "replace" && keyForm(true)}
        {mode === "confirm-delete" && (
          <Stack gap="xs" align="flex-start">
            <Text size="sm">
              Supprimer la clé du trousseau ? Sans clé, l'app ne pourra pas composer de menus.
            </Text>
            <Group gap="xs">
              <Button color="red" size="xs" loading={busy} onClick={() => void remove()}>
                Supprimer
              </Button>
              <Button variant="default" size="xs" disabled={busy} onClick={closeForm}>
                Annuler
              </Button>
            </Group>
          </Stack>
        )}
      </Stack>
    );
  }

  return (
    <Stack gap="xs">
      <Text fw={600}>Clé d'API</Text>
      {body}
      {failure !== null && (
        <Alert color="red" variant="light" title={failure.title}>
          {failure.message}
        </Alert>
      )}
      {notice !== null && (
        <Text size="sm" c="teal" role="status">
          {notice}
        </Text>
      )}
    </Stack>
  );
}

function ModelPart({ model, apply }: { model: string; apply: SettingsKeeper["apply"] }) {
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | undefined>(undefined);
  const value = draft ?? model;

  function save(event: SyntheticEvent) {
    event.preventDefault();
    const result = apply((settings) => ({ ...settings, model: value }));
    if (result.ok) {
      setDraft(null);
      setError(undefined);
      return;
    }
    setError(messageAt(result.issues, ["model"]) ?? refusalMessage(result.issues));
  }

  return (
    <form onSubmit={save}>
      <Group align="flex-start" gap="sm">
        <TextInput
          style={{ flex: 1 }}
          label="Modèle"
          description="Identifiant du modèle Claude utilisé pour composer les menus. Par défaut : claude-sonnet-5-5."
          spellCheck={false}
          autoComplete="off"
          value={value}
          error={error}
          onChange={(event) => {
            setDraft(event.currentTarget.value);
          }}
        />
        <Button type="submit" variant="default" mt={25} disabled={value.trim() === model}>
          Enregistrer le modèle
        </Button>
      </Group>
    </form>
  );
}

export function ConnectionSection({
  snapshot,
  apply,
  secretAdmin,
}: {
  snapshot: SettingsSnapshot;
  apply: SettingsKeeper["apply"];
  secretAdmin: SecretAdmin;
}) {
  return (
    <Paper withBorder p="lg">
      <Title order={3}>Connexion à Claude</Title>
      <Text c="dimmed" size="sm">
        La clé d'API et le modèle servent à composer les menus.
      </Text>
      <Divider my="md" />
      <ApiKeyPart secretAdmin={secretAdmin} />
      {snapshot.status !== "load-error" && (
        <>
          <Divider my="md" />
          {snapshot.status === "ready" ? (
            <ModelPart model={snapshot.settings.model} apply={apply} />
          ) : (
            <SettingsLoading />
          )}
        </>
      )}
    </Paper>
  );
}
