import { Affix, Alert, Box, Button, Group, Paper, ScrollArea, Text } from "@mantine/core";
import type { SettingsKeeper } from "core";
import { useId, useState } from "react";
import { useSettingsSnapshot } from "./useSettingsSnapshot.ts";

// Échec d'enregistrement : un résumé collant en bas de la fenêtre, dans le flux de la page, après l'écran actif et
// sur tous les écrans. Il est placé après le contenu : quand il apparaît ou disparaît, rien au-dessus ne bouge,
// donc un second clic ne tombe pas sur une autre ligne. Collé en bas, il laisse défiler le contenu derrière lui, et
// en bas de page il occupe sa propre place : aucune ligne n'est cachée. Sa hauteur est bornée : le détail
// technique est replié, et déplié il défile dans une zone de 120 px au plus.
export function SaveFailure({ keeper }: { keeper: SettingsKeeper }) {
  const snapshot = useSettingsSnapshot(keeper);
  if (snapshot.status !== "ready" || typeof snapshot.save !== "object") return null;
  return (
    <FailureAlert keeper={keeper} failed={snapshot.save.failed} retrying={snapshot.save.retrying} />
  );
}

// Monté seulement tant que l'état est « échec » : le détail reste déplié d'un échec au suivant tant qu'aucune
// écriture n'a réussi, et il se replie après un succès.
function FailureAlert({
  keeper,
  failed,
  retrying,
}: {
  keeper: SettingsKeeper;
  failed: string;
  retrying: boolean;
}) {
  const [detailOpen, setDetailOpen] = useState(false);
  const detailId = useId();
  return (
    <Box pos="sticky" bottom={0} bg="var(--mantine-color-body)" mt="md" style={{ zIndex: 2 }}>
      <Alert color="red" variant="light" title="Échec de l'enregistrement des réglages">
        <Text size="sm">
          Les derniers changements ne sont pas encore enregistrés ; ils seront perdus si vous
          quittez l'app.
        </Text>
        <Group gap="xs" mt="xs">
          <Button
            variant="light"
            size="xs"
            loading={retrying}
            onClick={() => {
              keeper.retrySave();
            }}
          >
            Réessayer
          </Button>
          <Button
            variant="subtle"
            size="xs"
            aria-expanded={detailOpen}
            aria-controls={detailId}
            onClick={() => {
              setDetailOpen((open) => !open);
            }}
          >
            {detailOpen ? "Masquer le détail" : "Afficher le détail"}
          </Button>
        </Group>
        {detailOpen && (
          <ScrollArea.Autosize mah={120} mt="xs">
            <Text id={detailId} size="xs" c="dimmed" style={{ overflowWrap: "anywhere" }}>
              Détail : {failed}
            </Text>
          </ScrollArea.Autosize>
        )}
      </Alert>
    </Box>
  );
}

// Succès : une seule ligne, en bas à droite, sur l'écran Réglages seulement (`AppShell.Main` garde de quoi la
// laisser passer sous les dernières lignes).
export function SaveSuccess({ keeper, visible }: { keeper: SettingsKeeper; visible: boolean }) {
  const snapshot = useSettingsSnapshot(keeper);
  if (!visible || snapshot.status !== "ready" || snapshot.save !== "saved") return null;
  return (
    <Affix position={{ bottom: 20, right: 20 }}>
      <Paper withBorder shadow="sm" p="xs">
        <Text size="sm" c="teal" role="status">
          Réglages enregistrés.
        </Text>
      </Paper>
    </Affix>
  );
}
