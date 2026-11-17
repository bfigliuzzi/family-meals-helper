import { DetailSchema } from "core";
import { fixtureReplies } from "core/fixtures";
import type { Model, SessionDeps } from "core";

type Schema = Parameters<SessionDeps["createModel"]>[1];

// Modèle de la version d'essai : répond le menu et le détail d'exemple, sans réseau ni clé. N'est chargé que si
// `__FMH_FIXTURE_MODEL__` est vrai (build `essai`).
export function createFixtureModel(schema: Schema): Model {
  return {
    complete() {
      const replies = fixtureReplies();
      return Promise.resolve({
        text: schema === DetailSchema ? replies.detail : replies.menu,
        stopReason: "end_turn",
        usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      });
    },
  };
}
