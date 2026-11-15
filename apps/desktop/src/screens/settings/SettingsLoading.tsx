import { Group, Loader, Text } from "@mantine/core";

export function SettingsLoading() {
  return (
    <Group gap="xs">
      <Loader size="sm" />
      <Text size="sm">Chargement des réglages…</Text>
    </Group>
  );
}
