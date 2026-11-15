import { Badge, Button, Group, Stack, Text, Title } from "@mantine/core";

export function PlaceholderScreen({
  title,
  text,
  hint,
  action,
}: {
  title: string;
  text: string;
  hint?: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <Stack gap="md">
      <Group>
        <Title order={2}>{title}</Title>
        <Badge variant="light" color="gray">
          À venir
        </Badge>
      </Group>
      <Text>{text}</Text>
      {hint !== undefined && <Text c="dimmed">{hint}</Text>}
      {action !== undefined && (
        <Group>
          <Button variant="light" onClick={action.onClick}>
            {action.label}
          </Button>
        </Group>
      )}
    </Stack>
  );
}
