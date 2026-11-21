import { invoke } from "@tauri-apps/api/core";
import { createCheckKeeper, createPriceKeeper, createSession, createSettingsKeeper } from "core";
import type {
  CheckKeeper,
  HistoryStore,
  PriceKeeper,
  SecretAdmin,
  Session,
  SettingsKeeper,
} from "core";
import { createKeychainSecretAdmin } from "./keychain-secret-admin.ts";
import { buildFromStore, buildReport } from "./open-prices-build.ts";
import { createTauriOpenPricesStore } from "./tauri-open-prices-store.ts";
import { createTauriHistoryStore } from "./tauri-history-store.ts";
import { createTauriPriceStore } from "./tauri-price-store.ts";
import { createTauriSettingsStore } from "./tauri-settings-store.ts";

export interface Services {
  settings: SettingsKeeper;
  secretAdmin: SecretAdmin;
  session: Session;
  history: HistoryStore;
  checks: CheckKeeper;
  prices: PriceKeeper;
}

// À appeler une seule fois, hors de tout composant : le propriétaire du document et la file du trousseau vivent
// aussi longtemps que l'app.
export function createServices(): Services {
  const settings = createSettingsKeeper(createTauriSettingsStore(invoke), {
    onListenerError: (error) => {
      console.error("Abonné des réglages en erreur", error);
    },
  });
  const history = createTauriHistoryStore(invoke);
  const clock = { now: () => new Date() };
  const openPricesStore = createTauriOpenPricesStore(invoke);
  const prices = createPriceKeeper(createTauriPriceStore(invoke), {
    clock,
    onListenerError: (error) => {
      console.error("Abonné des prix en erreur", error);
    },
    // Pas de téléchargement dans la version d'essai (`__FMH_FIXTURE_MODEL__`, retiré du build normal par Vite).
    ...(__FMH_FIXTURE_MODEL__
      ? {}
      : {
          openPrices: {
            store: openPricesStore,
            build: async (today: string) => {
              const started = performance.now();
              const built = await buildFromStore(
                openPricesStore,
                today,
                // `core` n'a pas de minuterie : il rend la main par cette pause entre deux paquets de lignes.
                () => new Promise<void>((resolve) => setTimeout(resolve, 0)),
              );
              console.info(buildReport(performance.now() - started, built.summary));
              return built;
            },
          },
        }),
  });
  return {
    settings,
    secretAdmin: createKeychainSecretAdmin(invoke),
    history,
    checks: createCheckKeeper(history, {
      onListenerError: (error) => {
        console.error("Abonné des cases en erreur", error);
      },
    }),
    prices,
    session: createSession({
      settings,
      clock,
      history,
      // Chargé au premier appel : le SDK n'est pas dans le paquet principal.
      // Dans le build normal, `__FMH_FIXTURE_MODEL__` vaut `false` à la compilation : Vite retire la branche et
      // son `import()`, le modèle d'exemple n'est pas dans le build livré.
      createModel: async (current, schema) => {
        if (__FMH_FIXTURE_MODEL__) {
          const { createFixtureModel } = await import("./fixture-model.ts");
          return createFixtureModel(schema);
        }
        const { createAppModel } = await import("./ai-model.ts");
        return createAppModel(invoke, current, schema);
      },
      // pdfmake et ses polices sont chargés au premier rendu, dans des morceaux à part.
      renderPdf: async (doc, at) => (await import("./pdf-renderer.ts")).renderSheetPdf(doc, at),
      newToken: () => crypto.randomUUID(),
      // Lu une seule fois, au clic « Valider ce menu » : le coût de la fiche vient de cet instant. `null` tant que la
      // table de prix de l'utilisateur et le résumé Open Prices de la base ne sont pas lus (une table illisible ou un
      // résumé absent n'empêchent pas la validation).
      priceLookups: () => {
        const snapshot = prices.snapshot();
        return snapshot.ready ? snapshot.lookups : null;
      },
      onListenerError: (error) => {
        console.error("Abonné de la session en erreur", error);
      },
    }),
  };
}
