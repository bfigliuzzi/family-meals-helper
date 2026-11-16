import { Button, Group, Popover, Stack, Text, TextInput } from "@mantine/core";
import { describeIngredient, printable } from "core";
import type { MenuIngredient, SettingsKeeper } from "core";
import { useState } from "react";
import type { SyntheticEvent } from "react";
import { refusalMessage } from "../settings/refusal.ts";
import { TEXTS } from "./texts.ts";

// Un ingrédient du menu : un clic ouvre la fenêtre qui l'ajoute aux aliments à éviter. Le terme enregistré est le
// nom brut ; seul ce qui s'affiche passe par `printable`.
export function AvoidIngredient({
  ingredient,
  settings,
  onAvoided,
}: {
  ingredient: MenuIngredient;
  settings: SettingsKeeper;
  onAvoided: (term: string) => void;
}) {
  const [opened, setOpened] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | undefined>(undefined);
  const name = printable(ingredient.name);

  function close() {
    setOpened(false);
    setReason("");
    setError(undefined);
  }

  function submit(event: SyntheticEvent) {
    event.preventDefault();
    const result = settings.apply((current) => ({
      ...current,
      exclusions: [...current.exclusions, { term: ingredient.name, reason }],
    }));
    if (result.ok) {
      close();
      onAvoided(ingredient.name);
      return;
    }
    setError(printable(refusalMessage(result.issues)));
  }

  return (
    <Popover
      opened={opened}
      onChange={(next) => {
        if (next) setOpened(true);
        else close();
      }}
      trapFocus
      returnFocus
      withArrow
      width={280}
      position="bottom-start"
    >
      <Popover.Target>
        <Button
          variant="subtle"
          size="compact-xs"
          onClick={() => {
            setOpened((open) => !open);
          }}
        >
          {printable(describeIngredient(ingredient))}
        </Button>
      </Popover.Target>
      <Popover.Dropdown>
        <form onSubmit={submit}>
          <Stack gap="xs">
            <Text size="sm">Éviter « {name} » dans les prochains menus ?</Text>
            <TextInput
              label={TEXTS.reasonLabel}
              placeholder={TEXTS.reasonPlaceholder}
              value={reason}
              error={error}
              onChange={(event) => {
                setReason(event.currentTarget.value);
                setError(undefined);
              }}
            />
            <Group gap="xs">
              <Button size="xs" type="submit">
                {TEXTS.avoid}
              </Button>
              <Button size="xs" variant="subtle" onClick={close}>
                {TEXTS.cancel}
              </Button>
            </Group>
          </Stack>
        </form>
      </Popover.Dropdown>
    </Popover>
  );
}
