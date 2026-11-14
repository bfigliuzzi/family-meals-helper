import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { DetailSchema } from "../domain/detail.ts";
import { APPLIANCES, MenuSchema } from "../domain/menu.ts";
import type { HttpClient } from "../ports/http-client.ts";
import { createAnthropicModel, describeApiError, redact } from "./anthropic-client.ts";
import type { AnthropicOptions } from "./anthropic-client.ts";
import type { Feature } from "./model.ts";

function fixture(name: string): string {
  return readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
}

function fakeHttp(status: number, body: string) {
  const requests: Request[] = [];
  const http: HttpClient = {
    send(request) {
      requests.push(request.clone());
      return Promise.resolve(
        new Response(body, { status, headers: { "content-type": "application/json" } }),
      );
    },
  };
  return { http, requests };
}

const silentLogger = { debug() {}, info() {}, warn() {}, error() {} };

function options(http: HttpClient, overrides: Partial<AnthropicOptions> = {}): AnthropicOptions {
  return {
    apiKey: "test-key",
    baseURL: "https://api.anthropic.com",
    model: "claude-sonnet-5-5",
    http,
    logger: silentLogger,
    disabled: new Set<Feature>(),
    schema: MenuSchema,
    ...overrides,
  };
}

const prompt = { system: "Système", user: "Utilisateur" };

async function bodyOf(request: Request | undefined): Promise<Record<string, unknown>> {
  return (await request!.json()) as Record<string, unknown>;
}

describe("createAnthropicModel", () => {
  it("appelle /v1/messages avec la clé en Bearer, pour l'URL par défaut et pour Mammouth", async () => {
    for (const baseURL of ["https://api.anthropic.com", "https://api.mammouth.ai"]) {
      const { http, requests } = fakeHttp(200, fixture("messages-ok.json"));
      await createAnthropicModel(options(http, { baseURL })).complete(prompt);
      expect(requests).toHaveLength(1);
      expect(requests[0]?.url).toBe(`${baseURL}/v1/messages`);
      expect(requests[0]?.headers.get("authorization")).toBe("Bearer test-key");
    }
  });

  it("envoie modèle, plafond, cache, effort et format par défaut", async () => {
    const { http, requests } = fakeHttp(200, fixture("messages-ok.json"));
    await createAnthropicModel(options(http)).complete(prompt);
    const body = await bodyOf(requests[0]);
    expect(body["model"]).toBe("claude-sonnet-5-5");
    expect(body["max_tokens"]).toBe(8000);
    const system = body["system"] as { text: string; cache_control?: { type: string } }[];
    expect(system[0]?.text).toBe("Système");
    expect(system[0]?.cache_control).toEqual({ type: "ephemeral" });
    const config = body["output_config"] as { effort?: string; format?: { type: string } };
    expect(config.effort).toBe("low");
    expect(config.format?.type).toBe("json_schema");
    expect(body["messages"]).toEqual([{ role: "user", content: "Utilisateur" }]);
  });

  it("envoie un schéma où chaque plat a des phases à six champs, appareil en enum", async () => {
    const { http, requests } = fakeHttp(200, fixture("messages-ok.json"));
    await createAnthropicModel(options(http)).complete(prompt);
    const body = await bodyOf(requests[0]);
    interface JsonSchema {
      type?: string;
      enum?: unknown[];
      minimum?: number;
      maximum?: number;
      required?: string[];
      properties?: Record<string, JsonSchema>;
      items?: JsonSchema;
    }
    const config = body["output_config"] as { format: { schema: JsonSchema } };
    const dish = config.format.schema.properties?.["dishes"]?.items;
    expect(dish?.required).toContain("phases");
    const phase = dish?.properties?.["phases"]?.items;
    expect([...(phase?.required ?? [])].sort()).toEqual(
      ["after", "appliance", "attended", "description", "id", "minutes"].sort(),
    );
    expect(phase?.properties?.["appliance"]?.enum).toEqual([...APPLIANCES]);
    const minutes = phase?.properties?.["minutes"];
    expect(minutes?.type).toBe("number");
    expect(minutes?.minimum).toBeUndefined();
    expect(minutes?.maximum).toBeUndefined();
  });

  it("envoie le schéma reçu dans output_config.format, et rien sans la fonction format", async () => {
    const schema = z.object({ ok: z.boolean() });
    const { http, requests } = fakeHttp(200, fixture("messages-ok.json"));
    await createAnthropicModel(options(http, { schema })).complete(prompt);
    const config = (await bodyOf(requests[0]))["output_config"] as {
      format: { type: string; schema: { properties?: Record<string, unknown> } };
    };
    expect(config.format.type).toBe("json_schema");
    expect(Object.keys(config.format.schema.properties ?? {})).toEqual(["ok"]);
    const off = fakeHttp(200, fixture("messages-ok.json"));
    const disabled = new Set<Feature>(["format"]);
    await createAnthropicModel(options(off.http, { schema, disabled })).complete(prompt);
    const offConfig = (await bodyOf(off.requests[0]))["output_config"] as { format?: unknown };
    expect(offConfig.format).toBeUndefined();
  });

  it("envoie un schéma du détail fermé, tous champs requis, appareil en enum", async () => {
    const { http, requests } = fakeHttp(200, fixture("messages-ok.json"));
    await createAnthropicModel(options(http, { schema: DetailSchema })).complete(prompt);
    interface JsonSchema {
      type?: string;
      enum?: unknown[];
      additionalProperties?: unknown;
      required?: string[];
      properties?: Record<string, JsonSchema>;
      items?: JsonSchema;
    }
    const config = (await bodyOf(requests[0]))["output_config"] as {
      format: { schema: JsonSchema };
    };
    const root = config.format.schema;
    const step = root.properties?.["steps"]?.items;
    const evening = root.properties?.["evenings"]?.items;
    for (const object of [root, step, evening]) {
      expect(object?.additionalProperties).toBe(false);
      expect([...(object?.required ?? [])].sort()).toEqual(
        Object.keys(object?.properties ?? {}).sort(),
      );
    }
    expect([...(step?.required ?? [])].sort()).toEqual(
      ["after", "appliance", "attended", "dishes", "id", "minutes", "phase", "text"].sort(),
    );
    expect(step?.properties?.["appliance"]?.enum).toEqual([...APPLIANCES]);
    expect(APPLIANCES).toHaveLength(8);
  });

  it("retire chaque fonction désactivée, les autres restant présentes", async () => {
    const cases: [Feature, (body: Record<string, unknown>) => void][] = [
      [
        "cache",
        (body) => {
          const system = body["system"] as { cache_control?: unknown }[];
          expect(system[0]?.cache_control).toBeUndefined();
          const config = body["output_config"] as { effort?: string; format?: unknown };
          expect(config.effort).toBe("low");
          expect(config.format).toBeDefined();
        },
      ],
      [
        "effort",
        (body) => {
          const config = body["output_config"] as { effort?: string; format?: unknown };
          expect(config.effort).toBeUndefined();
          expect(config.format).toBeDefined();
          const system = body["system"] as { cache_control?: unknown }[];
          expect(system[0]?.cache_control).toBeDefined();
        },
      ],
      [
        "format",
        (body) => {
          const config = body["output_config"] as { effort?: string; format?: unknown };
          expect(config.effort).toBe("low");
          expect(config.format).toBeUndefined();
          const system = body["system"] as { cache_control?: unknown }[];
          expect(system[0]?.cache_control).toBeDefined();
        },
      ],
    ];
    for (const [feature, verify] of cases) {
      const { http, requests } = fakeHttp(200, fixture("messages-ok.json"));
      const disabled = new Set<Feature>([feature]);
      await createAnthropicModel(options(http, { disabled })).complete(prompt);
      verify(await bodyOf(requests[0]));
    }
  });

  it("n'envoie pas output_config quand effort et format sont désactivés", async () => {
    const { http, requests } = fakeHttp(200, fixture("messages-ok.json"));
    const disabled = new Set<Feature>(["effort", "format"]);
    await createAnthropicModel(options(http, { disabled })).complete(prompt);
    expect((await bodyOf(requests[0]))["output_config"]).toBeUndefined();
  });

  it("lit le texte, la raison d'arrêt et les jetons", async () => {
    const { http } = fakeHttp(200, fixture("messages-ok.json"));
    const reply = await createAnthropicModel(options(http)).complete(prompt);
    expect(reply).toEqual({
      text: '{"dishes":[]}',
      stopReason: "end_turn",
      usage: { input: 120, output: 15, cacheRead: 0, cacheWrite: 1100 },
    });
  });

  it("n'envoie qu'une requête sur une erreur 500", async () => {
    const { http, requests } = fakeHttp(
      500,
      '{"type":"error","error":{"type":"api_error","message":"boom"}}',
    );
    const error: unknown = await createAnthropicModel(options(http))
      .complete(prompt)
      .catch((e: unknown) => e);
    expect(requests).toHaveLength(1);
    expect(describeApiError(error)).toContain("500");
  });
});

describe("redact", () => {
  it("masque le jeton après Bearer", () => {
    expect(redact("Invalid authorization: Bearer test-key-123", "test-key-123")).toBe(
      "Invalid authorization: Bearer [clé masquée]",
    );
  });
  it("laisse intact un mot ordinaire après Bearer", () => {
    expect(redact("Le jeton Bearer est invalide", "k")).toBe("Le jeton Bearer est invalide");
  });
  it("masque un jeton entre guillemets ou apostrophes", () => {
    expect(redact('Invalid: Bearer "sk-ant-abcdefgh"', "k")).toBe("Invalid: Bearer [clé masquée]");
    expect(redact("Invalid: Bearer 'sk-ant-abcdefgh'", "k")).toBe("Invalid: Bearer [clé masquée]");
  });
  it("masque la clé seule", () => {
    expect(redact("clé test-key-123 refusée", "test-key-123")).toBe("clé [clé masquée] refusée");
  });
});

describe("expurgation de la clé", () => {
  it("ne laisse pas la clé dans l'erreur d'une réponse 400", async () => {
    const body = JSON.stringify({
      type: "error",
      error: {
        type: "invalid_request_error",
        message: "Invalid authorization: Bearer test-key-123",
      },
    });
    const { http } = fakeHttp(400, body);
    const error: unknown = await createAnthropicModel(options(http, { apiKey: "test-key-123" }))
      .complete(prompt)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    const message = (error as Error).message;
    expect(message).toBe(
      "Requête refusée (400) : Invalid authorization: Bearer [clé masquée] Si un paramètre est cité, essaie FMH_DISABLE=format, effort ou cache.",
    );
  });
  it("ne laisse pas un jeton entre guillemets dans l'erreur d'une réponse 400", async () => {
    const body = JSON.stringify({
      type: "error",
      error: { type: "invalid_request_error", message: 'Invalid: Bearer "sk-ant-abcdefgh"' },
    });
    const { http } = fakeHttp(400, body);
    const error: unknown = await createAnthropicModel(options(http))
      .complete(prompt)
      .catch((e: unknown) => e);
    expect((error as Error).message).not.toContain("abcdefgh");
  });
  it("ne laisse pas la clé dans l'erreur d'une réponse 500", async () => {
    const body = JSON.stringify({
      type: "error",
      error: {
        type: "api_error",
        message: "upstream saw key test-key-123 and Bearer test-key-123",
      },
    });
    const { http } = fakeHttp(500, body);
    const error: unknown = await createAnthropicModel(options(http, { apiKey: "test-key-123" }))
      .complete(prompt)
      .catch((e: unknown) => e);
    const message = (error as Error).message;
    expect(message).not.toContain("test-key-123");
    expect(message).toContain("[clé masquée]");
  });
});

describe("describeApiError", () => {
  async function errorFor(status: number, body: string): Promise<string> {
    const { http } = fakeHttp(status, body);
    const error: unknown = await createAnthropicModel(options(http))
      .complete(prompt)
      .catch((e: unknown) => e);
    return describeApiError(error);
  }

  it("traduit le 401", async () => {
    expect(await errorFor(401, "{}")).toContain("Clé refusée");
  });
  it("cite ANTHROPIC_BASE_URL et ANTHROPIC_MODEL pour le 404", async () => {
    const message = await errorFor(404, "{}");
    expect(message).toContain("ANTHROPIC_BASE_URL");
    expect(message).toContain("ANTHROPIC_MODEL");
  });
  it("reprend le texte d'erreur de l'API pour le 400", async () => {
    expect(await errorFor(400, fixture("error-400.json"))).toContain(
      "output_config.format: not supported",
    );
  });
  it("traduit le 429", async () => {
    expect(await errorFor(429, "{}")).toContain("429");
  });
  it("traduit une erreur réseau", async () => {
    const http: HttpClient = { send: () => Promise.reject(new TypeError("fetch failed")) };
    const error: unknown = await createAnthropicModel(options(http))
      .complete(prompt)
      .catch((e: unknown) => e);
    expect(describeApiError(error)).toContain("Connexion impossible");
  });
});
