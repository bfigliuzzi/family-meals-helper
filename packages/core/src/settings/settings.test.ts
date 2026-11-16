import { describe, expect, it } from "vitest";
import { HOUSEHOLD_EQUIPMENT } from "../equipment/household.ts";
import type { ApplianceSpec } from "../equipment/household.ts";
import type { SettingsStore } from "../ports/settings-store.ts";
import { balancedMenu, phase } from "../rules/fixtures/menus.ts";
import { checkSession } from "../scheduling/check-session.ts";
import {
  applyEquipmentSettings,
  checkApiKey,
  compositionSettings,
  defaultSettings,
  loadSettings,
  MAX_DOCUMENT_BYTES,
  MAX_EXCLUSIONS,
  removeExclusion,
  validateSettings,
} from "./settings.ts";
import type { Settings } from "./settings.ts";

function withEquipment(
  change: (equipment: Settings["equipment"][number][]) => void,
): Record<string, unknown> {
  const settings = structuredClone(defaultSettings());
  const equipment = [...settings.equipment];
  change(equipment);
  return { ...settings, equipment };
}

function withExclusions(...exclusions: { term: string; reason: string }[]): unknown {
  return { ...defaultSettings(), exclusions };
}

function issuesOf(candidate: unknown) {
  const result = validateSettings(candidate);
  if (result.ok) throw new Error("document accepté");
  return result.issues;
}

function storeOf(text: string | null): SettingsStore {
  return { read: () => Promise.resolve(text), write: () => Promise.resolve() };
}

describe("defaultSettings", () => {
  it("reprend les 7 appareils et leurs capacités, sans exclusion, avec le modèle par défaut", () => {
    const settings = defaultSettings();
    expect(settings.version).toBe(1);
    expect(settings.exclusions).toEqual([]);
    expect(settings.model).toBe("claude-sonnet-5-5");
    expect(settings.equipment).toEqual(
      HOUSEHOLD_EQUIPMENT.map((spec) => ({ id: spec.id, available: true, slots: spec.slots })),
    );
    expect(settings.equipment).toHaveLength(7);
  });
  it("rend un objet neuf à chaque appel", () => {
    expect(defaultSettings()).not.toBe(defaultSettings());
    expect(defaultSettings().equipment).not.toBe(defaultSettings().equipment);
  });
  it("est un document valide", () => {
    expect(validateSettings(defaultSettings())).toEqual({ ok: true, settings: defaultSettings() });
  });
});

describe("capacité des appareils", () => {
  const slotsOf = (value: unknown) =>
    validateSettings(
      withEquipment((equipment) => {
        equipment[0] = { id: "oven", available: true, slots: value as number };
      }),
    );
  it.each([0, 1.5, 11, "2", null, -1])("refuse %j", (value) => {
    const result = slotsOf(value);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues[0]).toEqual({
        path: ["equipment", 0, "slots"],
        message: "Un nombre entier de 1 à 10.",
      });
    }
  });
  it.each([1, 10])("accepte %j", (value) => {
    expect(slotsOf(value).ok).toBe(true);
  });
  it("refuse l'id `none`, un id inconnu et un id en double", () => {
    const none = issuesOf(
      withEquipment((equipment) => {
        equipment[0] = { id: "none" as "oven", available: true, slots: 1 };
      }),
    );
    expect(none[0]).toEqual({ path: ["equipment", 0, "id"], message: "Appareil inconnu." });
    const unknown = issuesOf(
      withEquipment((equipment) => {
        equipment[1] = { id: "grille-pain" as "oven", available: true, slots: 1 };
      }),
    );
    expect(unknown[0]).toEqual({ path: ["equipment", 1, "id"], message: "Appareil inconnu." });
    const duplicate = issuesOf(
      withEquipment((equipment) => {
        equipment.push({ id: "oven", available: true, slots: 2 });
      }),
    );
    expect(duplicate).toEqual([
      { path: ["equipment", 7, "id"], message: "Appareil en double : four." },
    ]);
  });
});

describe("documents abîmés : messages en français", () => {
  const broken: Record<string, unknown> = {
    "slots absent": withEquipment((equipment) => {
      equipment[0] = { id: "oven", available: true } as never;
    }),
    'slots: "2"': withEquipment((equipment) => {
      equipment[0] = { id: "oven", available: true, slots: "2" as never };
    }),
    'exclusions: "x"': { ...defaultSettings(), exclusions: "x" },
    "equipment absent": { version: 1, exclusions: [], model: "claude-sonnet-5-5" },
    'available: "oui"': withEquipment((equipment) => {
      equipment[0] = { id: "oven", available: "oui" as never, slots: 2 };
    }),
    "exclusions absent": { version: 1, equipment: [], model: "claude-sonnet-5-5" },
    "texte à la place du document": "réglages",
    null: null,
    "term absent": { ...defaultSettings(), exclusions: [{ reason: "" }] },
  };
  it.each(Object.keys(broken))("%s", (name) => {
    const issues = issuesOf(broken[name]);
    expect(issues.length).toBeGreaterThan(0);
    for (const issue of issues) {
      expect(issue.message).not.toContain("Invalid");
      expect(issue.message).not.toContain("expected");
      expect(issue.message).not.toMatch(/Invalid|expected|Required|received/i);
      expect(issue.message.trim()).not.toBe("");
    }
  });
});

describe("version", () => {
  it("refuse un document sans version", () => {
    const { exclusions, equipment, model } = defaultSettings();
    const issues = issuesOf({ exclusions, equipment, model });
    expect(issues[0]?.path).toEqual(["version"]);
  });
  it("refuse la version 2 avec un message dédié à la lecture", async () => {
    const result = await loadSettings(
      storeOf(JSON.stringify({ ...defaultSettings(), version: 2 })),
    );
    expect(result).toEqual({
      ok: false,
      error: "Ces réglages viennent d'une version plus récente de l'app.",
      detail: null,
    });
  });
  it("lit une version future même si le reste du document a changé de forme", async () => {
    const result = await loadSettings(storeOf(JSON.stringify({ version: 3, reglages: {} })));
    expect(result).toEqual({
      ok: false,
      error: "Ces réglages viennent d'une version plus récente de l'app.",
      detail: null,
    });
  });
  it("vaut 1 par défaut", () => {
    expect(defaultSettings().version).toBe(1);
  });
});

describe("exclusions", () => {
  const termIssues = (term: string) => issuesOf(withExclusions({ term, reason: "" }));
  it("refuse un terme vide, avec un seul message", () => {
    expect(termIssues("")).toEqual([
      { path: ["exclusions", 0, "term"], message: "Écrivez le nom d'un aliment." },
    ]);
    expect(termIssues("   ")[0]?.message).toBe("Écrivez le nom d'un aliment.");
  });
  it.each(["!!!", "123", "豆腐", "ß"])(
    "refuse « %s » : aucune lettre après normalisation",
    (term) => {
      expect(termIssues(term)).toEqual([
        {
          path: ["exclusions", 0, "term"],
          message: "Écrivez le nom avec des lettres de l'alphabet latin.",
        },
      ]);
    },
  );
  it("refuse un terme de 61 caractères, accepte 60", () => {
    expect(termIssues("a".repeat(61))).toEqual([
      { path: ["exclusions", 0, "term"], message: "60 caractères au plus." },
    ]);
    expect(validateSettings(withExclusions({ term: "a".repeat(60), reason: "" })).ok).toBe(true);
  });
  it("refuse une raison de 121 caractères, accepte 120 et le vide", () => {
    expect(issuesOf(withExclusions({ term: "noix", reason: "r".repeat(121) }))).toEqual([
      { path: ["exclusions", 0, "reason"], message: "120 caractères au plus." },
    ]);
    expect(validateSettings(withExclusions({ term: "noix", reason: "r".repeat(120) })).ok).toBe(
      true,
    );
    expect(validateSettings(withExclusions({ term: "noix", reason: "" })).ok).toBe(true);
  });
  it("refuse un doublon comparé par normalizeName, sur le terme écrit en second", () => {
    expect(
      issuesOf(withExclusions({ term: "Noix", reason: "" }, { term: "noix  ", reason: "" })),
    ).toEqual([{ path: ["exclusions", 1, "term"], message: "« noix » est déjà dans la liste." }]);
    expect(
      issuesOf(withExclusions({ term: "céleri", reason: "" }, { term: "Céleri", reason: "" })),
    ).toEqual([{ path: ["exclusions", 1, "term"], message: "« Céleri » est déjà dans la liste." }]);
  });
  it('refuse un 201e aliment, sur le chemin ["exclusions"], et accepte 200', () => {
    const many = (count: number) =>
      withExclusions(
        ...Array.from({ length: count }, (_, index) => ({
          term: `a${"b".repeat(index % 20)}${String.fromCharCode(97 + (index % 26))}${index}x`,
          reason: "",
        })),
      );
    expect(validateSettings(many(200)).ok).toBe(true);
    expect(issuesOf(many(201))).toEqual([
      { path: ["exclusions"], message: "200 aliments au plus." },
    ]);
  });
  it("tient sous la limite du document côté Rust, même dans le pire cas valide", () => {
    // Des caractères de contrôle de part et d'autre de lettres : 6 octets chacun une fois en JSON. Les termes
    // restent distincts après normalisation (trois lettres qui encodent le rang).
    const control = "\u0001";
    const letters = (index: number) =>
      [Math.floor(index / 676), Math.floor(index / 26) % 26, index % 26]
        .map((digit) => String.fromCharCode(97 + digit))
        .join("");
    const exclusions = Array.from({ length: MAX_EXCLUSIONS }, (_, index) => ({
      term: `${control.repeat(28)}${letters(index)}${control.repeat(29)}`,
      reason: `${control.repeat(59)}r${control.repeat(60)}`,
    }));
    expect(exclusions[0]?.term).toHaveLength(60);
    expect(exclusions[0]?.reason).toHaveLength(120);
    const result = validateSettings({ ...defaultSettings(), model: "m".repeat(100), exclusions });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const bytes = new TextEncoder().encode(JSON.stringify(result.settings)).length;
    expect(bytes).toBeLessThanOrEqual(MAX_DOCUMENT_BYTES);
    expect(bytes).toBeGreaterThan(200 * 180 * 6);
  });
  it("réduit les espaces autour du terme et de la raison", () => {
    const result = validateSettings(withExclusions({ term: "  noix ", reason: "  allergie " }));
    expect(result.ok && result.settings.exclusions).toEqual([{ term: "noix", reason: "allergie" }]);
  });
});

describe("modèle", () => {
  const modelIssues = (model: string) => issuesOf({ ...defaultSettings(), model });
  it("refuse un modèle vide, avec espace ou accentué", () => {
    expect(modelIssues("")[0]).toEqual({
      path: ["model"],
      message: "Écrivez l'identifiant d'un modèle.",
    });
    expect(modelIssues("claude sonnet")[0]?.message).toContain("Lettres sans accent");
    expect(modelIssues("modèle")[0]?.message).toContain("Lettres sans accent");
  });
  it("refuse plus de 100 caractères", () => {
    expect(modelIssues("m".repeat(101))[0]?.message).toBe("100 caractères au plus.");
  });
  it.each(["claude-sonnet-5-5", "anthropic.claude-x:0"])("accepte %s", (model) => {
    expect(validateSettings({ ...defaultSettings(), model }).ok).toBe(true);
  });
});

describe("validateSettings : document complété", () => {
  it("ajoute les appareils absents, dans l'ordre de la table du code", () => {
    const partial = {
      ...defaultSettings(),
      equipment: [
        { id: "induction", available: false, slots: 3 },
        { id: "oven", available: true, slots: 1 },
      ],
    };
    const result = validateSettings(partial);
    expect(result.ok && result.settings.equipment.map((appliance) => appliance.id)).toEqual([
      "induction",
      "oven",
      "thermomix",
      "kenwood",
      "cookeo",
      "steamer",
      "airfryer",
    ]);
  });
});

describe("loadSettings", () => {
  it("rend les défauts quand rien n'est enregistré", async () => {
    expect(await loadSettings(storeOf(null))).toEqual({ ok: true, settings: defaultSettings() });
  });
  it("relit à l'identique un document valide (aller-retour par JSON.stringify)", async () => {
    const settings: Settings = {
      ...defaultSettings(),
      model: "claude-opus-5-5",
      exclusions: [{ term: "céleri", reason: "n'aime pas" }],
      equipment: defaultSettings().equipment.map((appliance) =>
        appliance.id === "airfryer" ? { ...appliance, available: false } : appliance,
      ),
    };
    expect(await loadSettings(storeOf(JSON.stringify(settings)))).toEqual({ ok: true, settings });
  });
  it.each(["{", '{"model": 3}', "null", "[]"])("document illisible %s", async (text) => {
    const result = await loadSettings(storeOf(text));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("Les réglages enregistrés sont illisibles.");
      expect(result.detail).not.toBeNull();
    }
  });
  it("sépare la phrase et le détail : erreur de syntaxe pour du JSON invalide, message de schéma sinon", async () => {
    const syntax = await loadSettings(storeOf("{"));
    expect(syntax.ok === false && syntax.detail).toMatch(/JSON|Expected|Unexpected|end of/i);
    const schema = await loadSettings(
      storeOf('{"version":1,"exclusions":"x","equipment":[],"model":"a"}'),
    );
    expect(schema.ok === false && schema.detail).toContain(
      "La liste des aliments à éviter est illisible.",
    );
    expect(schema.ok === false && schema.error).toBe("Les réglages enregistrés sont illisibles.");
  });
  it("ajoute l'airfryer absent du document, avec ses valeurs du code", async () => {
    const withoutAirfryer = {
      ...defaultSettings(),
      equipment: defaultSettings().equipment.filter((appliance) => appliance.id !== "airfryer"),
    };
    const result = await loadSettings(storeOf(JSON.stringify(withoutAirfryer)));
    expect(result.ok && result.settings.equipment.at(-1)).toEqual({
      id: "airfryer",
      available: true,
      slots: 1,
    });
  });
  it("laisse remonter l'erreur du store", async () => {
    const store: SettingsStore = {
      read: () => Promise.reject(new Error("disque absent")),
      write: () => Promise.resolve(),
    };
    await expect(loadSettings(store)).rejects.toThrow("disque absent");
  });
});

describe("applyEquipmentSettings", () => {
  const setting = (id: ApplianceSpec["id"], available: boolean, slots: number) => ({
    id,
    available,
    slots,
  });
  it("retire un appareil indisponible", () => {
    const result = applyEquipmentSettings(HOUSEHOLD_EQUIPMENT, [setting("airfryer", false, 1)]);
    expect(result.map((spec) => spec.id)).not.toContain("airfryer");
    expect(result).toHaveLength(6);
  });
  it("remplace la capacité et garde `extra` et `uses` du code", () => {
    const result = applyEquipmentSettings(HOUSEHOLD_EQUIPMENT, [setting("oven", true, 1)]);
    const oven = result.find((spec) => spec.id === "oven");
    const original = HOUSEHOLD_EQUIPMENT.find((spec) => spec.id === "oven");
    expect(oven).toEqual({ ...original, slots: 1 });
  });
  it("garde l'ordre du code, même si les réglages sont dans un autre ordre", () => {
    const result = applyEquipmentSettings(HOUSEHOLD_EQUIPMENT, [
      setting("airfryer", true, 3),
      setting("oven", true, 1),
    ]);
    expect(result.map((spec) => spec.id)).toEqual(HOUSEHOLD_EQUIPMENT.map((spec) => spec.id));
  });
  it("garde tel quel un appareil absent des réglages", () => {
    const result = applyEquipmentSettings(HOUSEHOLD_EQUIPMENT, []);
    expect(result).toEqual(HOUSEHOLD_EQUIPMENT);
  });
  it("rend un résultat gelé, tableau et éléments", () => {
    const result = applyEquipmentSettings(HOUSEHOLD_EQUIPMENT, [setting("oven", true, 3)]);
    expect(Object.isFrozen(result)).toBe(true);
    for (const spec of result) expect(Object.isFrozen(spec)).toBe(true);
  });
  it("se branche sur le contrôle de session : un airfryer indisponible donne un constat `equipment`", () => {
    const menu = balancedMenu();
    const first = menu.dishes[0];
    if (first === undefined) throw new Error("menu vide");
    first.phases.push(phase("z1", 10, "airfryer", false));
    const available = checkSession(menu, applyEquipmentSettings(HOUSEHOLD_EQUIPMENT, []));
    expect(available.findings.some((finding) => finding.rule === "equipment")).toBe(false);
    const unavailable = checkSession(
      menu,
      applyEquipmentSettings(HOUSEHOLD_EQUIPMENT, [setting("airfryer", false, 1)]),
    );
    expect(unavailable.findings).toContainEqual(
      expect.objectContaining({ rule: "equipment", level: "error" }),
    );
  });
});

describe("checkApiKey", () => {
  it.each([
    ["", "Collez la clé avant d'enregistrer."],
    ["   ", "Collez la clé avant d'enregistrer."],
    [
      "sk ab",
      "La clé ne contient que des lettres sans accent, des chiffres et des signes, sans espace.",
    ],
    [
      "clé-é",
      "La clé ne contient que des lettres sans accent, des chiffres et des signes, sans espace.",
    ],
    ["a".repeat(501), "Clé trop longue (500 caractères au plus)."],
  ])("refuse %j", (raw, error) => {
    expect(checkApiKey(raw)).toEqual({ ok: false, error });
  });
  it("accepte 500 caractères et rend la clé sans les espaces autour", () => {
    expect(checkApiKey("a".repeat(500)).ok).toBe(true);
    expect(checkApiKey("  sk-test-factice \n")).toEqual({ ok: true, key: "sk-test-factice" });
  });
});

describe("compositionSettings", () => {
  it("retire l'appareil indisponible et remplace la capacité", () => {
    const settings: Settings = {
      ...defaultSettings(),
      equipment: defaultSettings().equipment.map((item) =>
        item.id === "airfryer"
          ? { ...item, available: false }
          : item.id === "oven"
            ? { ...item, slots: 1 }
            : item,
      ),
    };
    const { equipment } = compositionSettings(settings);
    expect(equipment.map((spec) => spec.id)).not.toContain("airfryer");
    expect(equipment.find((spec) => spec.id === "oven")?.slots).toBe(1);
    expect(equipment).toEqual(applyEquipmentSettings(HOUSEHOLD_EQUIPMENT, settings.equipment));
  });
  it("donne les termes dans l'ordre du document, et une liste vide sans aliment", () => {
    expect(compositionSettings(defaultSettings()).exclusions).toEqual([]);
    const settings: Settings = {
      ...defaultSettings(),
      exclusions: [
        { term: "fenouil", reason: "" },
        { term: "Céleri", reason: "n'aime pas" },
        { term: "noix", reason: "" },
      ],
    };
    expect(compositionSettings(settings).exclusions).toEqual(["fenouil", "Céleri", "noix"]);
  });
});

describe("removeExclusion", () => {
  const settings: Settings = {
    ...defaultSettings(),
    exclusions: [
      { term: "fenouil", reason: "a" },
      { term: "Céleri", reason: "b" },
      { term: "noix", reason: "c" },
    ],
  };
  it("« celeri » retire « Céleri » (comparaison normalisée) et garde l'ordre des autres", () => {
    const result = removeExclusion(settings, "celeri");
    expect(result.exclusions).toEqual([
      { term: "fenouil", reason: "a" },
      { term: "noix", reason: "c" },
    ]);
    expect(result).not.toBe(settings);
  });
  it("un terme absent rend un document égal", () => {
    expect(removeExclusion(settings, "poireau")).toEqual(settings);
  });
});
