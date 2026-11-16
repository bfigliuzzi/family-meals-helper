import {
  AppShell,
  Badge,
  Container,
  Group,
  Loader,
  NavLink,
  Title,
  VisuallyHidden,
} from "@mantine/core";
import { useState } from "react";
import type { Services } from "./platform/services.ts";
import { SaveFailure, SaveSuccess } from "./SaveStatus.tsx";
import { HistoryScreen } from "./screens/HistoryScreen.tsx";
import { NewSessionScreen } from "./screens/NewSessionScreen.tsx";
import { PlaceholderScreen } from "./screens/PlaceholderScreen.tsx";
import { SettingsScreen } from "./screens/SettingsScreen.tsx";
import { useSessionSnapshot } from "./useSessionSnapshot.ts";

type ScreenId = "new-session" | "ingredients" | "history" | "settings";

const SCREENS: readonly { id: ScreenId; label: string }[] = [
  { id: "new-session", label: "Nouvelle session" },
  { id: "ingredients", label: "Ingrédients" },
  { id: "history", label: "Historique" },
  { id: "settings", label: "Réglages" },
];

const COMING_SOON = "Cet écran arrive dans une prochaine version.";

export function App({
  services,
}: {
  services: Pick<Services, "settings" | "secretAdmin" | "session" | "history">;
}) {
  // Pas de routeur : pas d'URL, pas de lien profond, pas de retour arrière. Seul l'écran actif est monté.
  const [screen, setScreen] = useState<ScreenId>("new-session");
  const session = useSessionSnapshot(services.session);
  // Opérations terminées déjà vues : un clic de navigation qui quitte « Nouvelle session » ou y arrive les compte
  // toutes comme vues.
  const [seen, setSeen] = useState(0);
  const unseen = screen !== "new-session" && session.outcomes > seen;

  function go(id: ScreenId) {
    if (id === "new-session" || screen === "new-session") setSeen(session.outcomes);
    setScreen(id);
  }

  // Appel en cours : un chargement. Résultat arrivé pendant qu'un autre écran était affiché : « Nouveau ».
  function sessionIndicator() {
    if (session.pending !== null) {
      return (
        <Group gap={4}>
          <Loader size="xs" />
          <VisuallyHidden>Appel en cours</VisuallyHidden>
        </Group>
      );
    }
    if (unseen) {
      return (
        <Badge size="xs" variant="light">
          Nouveau
        </Badge>
      );
    }
    return undefined;
  }

  return (
    <>
      <AppShell header={{ height: 52 }} navbar={{ width: 210, breakpoint: 0 }} padding="lg">
        <AppShell.Header>
          <Group h="100%" px="md">
            <Title order={4}>Family Meals Helper</Title>
          </Group>
        </AppShell.Header>
        <AppShell.Navbar p="sm">
          {SCREENS.map(({ id, label }) => {
            const active = screen === id;
            return (
              <NavLink
                key={id}
                component="button"
                type="button"
                label={label}
                active={active}
                aria-current={active ? "page" : undefined}
                rightSection={id === "new-session" ? sessionIndicator() : undefined}
                onClick={() => {
                  go(id);
                }}
              />
            );
          })}
        </AppShell.Navbar>
        <AppShell.Main pb={64}>
          <Container size="md">
            {screen === "new-session" && (
              <NewSessionScreen
                session={services.session}
                settings={services.settings}
                onOpenSettings={() => {
                  go("settings");
                }}
              />
            )}
            {screen === "ingredients" && (
              <PlaceholderScreen
                title="Ingrédients"
                text={`Ici s'affichera la liste de courses du menu validé, avec une case à cocher par ingrédient. ${COMING_SOON}`}
              />
            )}
            {screen === "history" && (
              <HistoryScreen
                history={services.history}
                refresh={session.outcomes}
                onNewSession={() => {
                  go("new-session");
                }}
              />
            )}
            {screen === "settings" && (
              <SettingsScreen settings={services.settings} secretAdmin={services.secretAdmin} />
            )}
            <SaveFailure keeper={services.settings} />
          </Container>
        </AppShell.Main>
      </AppShell>
      <SaveSuccess keeper={services.settings} visible={screen === "settings"} />
    </>
  );
}
