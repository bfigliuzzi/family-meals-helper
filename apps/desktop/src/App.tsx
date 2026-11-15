import { AppShell, Container, Group, NavLink, Title } from "@mantine/core";
import { useState } from "react";
import type { Services } from "./platform/services.ts";
import { SaveFailure, SaveSuccess } from "./SaveStatus.tsx";
import { PlaceholderScreen } from "./screens/PlaceholderScreen.tsx";
import { SettingsScreen } from "./screens/SettingsScreen.tsx";

type ScreenId = "new-session" | "ingredients" | "history" | "settings";

const SCREENS: readonly { id: ScreenId; label: string }[] = [
  { id: "new-session", label: "Nouvelle session" },
  { id: "ingredients", label: "Ingrédients" },
  { id: "history", label: "Historique" },
  { id: "settings", label: "Réglages" },
];

const COMING_SOON = "Cet écran arrive dans une prochaine version.";

export function App({ services }: { services: Pick<Services, "settings" | "secretAdmin"> }) {
  // Pas de routeur : pas d'URL, pas de lien profond, pas de retour arrière. Seul l'écran actif est monté.
  const [screen, setScreen] = useState<ScreenId>("new-session");

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
                onClick={() => {
                  setScreen(id);
                }}
              />
            );
          })}
        </AppShell.Navbar>
        <AppShell.Main pb={64}>
          <Container size="md">
            {screen === "new-session" && (
              <PlaceholderScreen
                title="Nouvelle session"
                text={`Ici, vous composerez le menu de la semaine en discutant avec Claude. ${COMING_SOON}`}
                hint="En attendant, vous pouvez préparer vos réglages : clé d'API, aliments à éviter et équipement."
                action={{
                  label: "Ouvrir les réglages",
                  onClick: () => {
                    setScreen("settings");
                  },
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
              <PlaceholderScreen
                title="Historique"
                text={`Ici s'afficheront les cinq derniers menus validés, avec leur fiche PDF. ${COMING_SOON}`}
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
