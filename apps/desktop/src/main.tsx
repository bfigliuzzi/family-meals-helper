import "@mantine/core/styles.css";
import { MantineProvider } from "@mantine/core";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { createServices } from "./platform/services.ts";
import { theme } from "./theme.ts";

const root = document.getElementById("root");
if (!root) {
  throw new Error("Élément #root introuvable");
}

// Une seule fois, hors de tout composant : le propriétaire du document et la file du trousseau vivent aussi
// longtemps que l'app.
const services = createServices();

createRoot(root).render(
  <StrictMode>
    <MantineProvider theme={theme} defaultColorScheme="auto">
      <App services={services} />
    </MantineProvider>
  </StrictMode>,
);
