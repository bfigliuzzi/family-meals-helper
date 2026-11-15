import { Alert, Button, Stack, Text, Title } from "@mantine/core";
import type { SettingsKeeper, SecretAdmin } from "core";
import { useEffect } from "react";
import { useSettingsSnapshot } from "../useSettingsSnapshot.ts";
import { ConnectionSection } from "./settings/ConnectionSection.tsx";
import { EquipmentSection } from "./settings/EquipmentSection.tsx";
import { ExclusionsSection } from "./settings/ExclusionsSection.tsx";

// L'écran ne lit ni n'écrit lui-même : le propriétaire du document le fait (`load` au montage, `apply` à chaque
// action), et il garde le document quand on quitte l'écran.
export function SettingsScreen({
  settings: keeper,
  secretAdmin,
}: {
  settings: SettingsKeeper;
  secretAdmin: SecretAdmin;
}) {
  const snapshot = useSettingsSnapshot(keeper);

  useEffect(() => {
    keeper.load();
  }, [keeper]);

  const apply: SettingsKeeper["apply"] = (change) => keeper.apply(change);

  return (
    <Stack gap="xl">
      <Stack gap="xs">
        <Title order={2}>Réglages</Title>
        <Text size="sm" c="dimmed">
          Les cases, les capacités et la liste d'aliments sont enregistrées aussitôt. Un aliment, un
          modèle ou une clé tapés sans avoir été ajoutés ou enregistrés sont oubliés si vous quittez
          cet écran.
        </Text>
      </Stack>
      {snapshot.status === "load-error" && (
        <Alert color="red" variant="light" title="Réglages indisponibles">
          <Text size="sm">{snapshot.error}</Text>
          {snapshot.detail !== null && (
            <Text size="xs" c="dimmed">
              Détail : {snapshot.detail}
            </Text>
          )}
          {snapshot.retryable && (
            <>
              <Button
                variant="light"
                mt="sm"
                onClick={() => {
                  keeper.load();
                }}
              >
                Réessayer
              </Button>
              <Text size="xs" c="dimmed">
                Si l'erreur revient, fermez les autres fenêtres de l'app puis réessayez, ou quittez
                l'app et relancez-la.
              </Text>
            </>
          )}
        </Alert>
      )}
      <ConnectionSection snapshot={snapshot} apply={apply} secretAdmin={secretAdmin} />
      {snapshot.status !== "load-error" && (
        <>
          <ExclusionsSection snapshot={snapshot} apply={apply} />
          <EquipmentSection snapshot={snapshot} apply={apply} />
        </>
      )}
    </Stack>
  );
}
