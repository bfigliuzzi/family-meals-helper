import { z } from "zod";
import { DEFAULT_MODEL } from "../ai/model.ts";
import { APPLIANCES } from "../domain/menu.ts";
import { APPLIANCE_LABELS, HOUSEHOLD_EQUIPMENT } from "../equipment/household.ts";
import type { Equipment } from "../equipment/household.ts";
import { normalizeName } from "../ingredients/normalize.ts";
import type { SettingsStore } from "../ports/settings-store.ts";

export const MAX_SLOTS = 10;
export const MAX_TERM_LENGTH = 60;
export const MAX_REASON_LENGTH = 120;
export const MAX_MODEL_LENGTH = 100;
export const MAX_API_KEY_LENGTH = 500;
export const MAX_EXCLUSIONS = 200;
// Même valeur que MAX_DOCUMENT_BYTES dans apps/desktop/src-tauri/src/settings_db.rs : au-delà, la commande
// d'écriture refuse le document. Le pire document valide reste sous cette limite : un terme et une raison
// remplis de caractères de contrôle (6 octets chacun en JSON, `\u0001`) font au plus (60 + 120) × 6 = 1 080
// octets, soit 200 × 1 120 octets environ pour 200 aliments, bien sous 256 Kio (voir settings.test.ts).
export const MAX_DOCUMENT_BYTES = 256 * 1024;

// Version du document. Tout changement de forme (champ ajouté, renommé ou retypé) la passe à 2 et ajoute
// dans `loadSettings` une transformation explicite de 1 vers 2.
export const SETTINGS_VERSION = 1;

export const FUTURE_VERSION_ERROR = "Ces réglages viennent d'une version plus récente de l'app.";

const SLOTS_ERROR = `Un nombre entier de 1 à ${MAX_SLOTS}.`;

export const ExclusionSettingSchema = z.object(
  {
    // La comparaison de `checkExclusions` se fait sur `normalizeName` : un terme sans lettre après cette
    // normalisation (« !!! », « 豆腐 », « ß ») serait ignoré en silence.
    term: z
      .string({ error: "Écrivez le nom d'un aliment." })
      .trim()
      .min(1, { error: "Écrivez le nom d'un aliment.", abort: true })
      .max(MAX_TERM_LENGTH, { error: `${MAX_TERM_LENGTH} caractères au plus.`, abort: true })
      .refine((term) => /[a-z]/.test(normalizeName(term)), {
        error: "Écrivez le nom avec des lettres de l'alphabet latin.",
      }),
    reason: z
      .string({ error: "La raison est illisible." })
      .trim()
      .max(MAX_REASON_LENGTH, { error: `${MAX_REASON_LENGTH} caractères au plus.` }),
  },
  { error: "Un aliment à éviter est illisible." },
);

export const ApplianceSettingSchema = z.object(
  {
    id: z
      .enum(APPLIANCES, { error: "Appareil inconnu." })
      .exclude(["none"], { error: "Appareil inconnu." }),
    available: z.boolean({ error: "La disponibilité d'un appareil est illisible." }),
    slots: z
      .number({ error: SLOTS_ERROR })
      .int({ error: SLOTS_ERROR })
      .min(1, { error: SLOTS_ERROR })
      .max(MAX_SLOTS, { error: SLOTS_ERROR }),
  },
  { error: "Un appareil est illisible." },
);

const ExclusionsSchema = z
  .array(ExclusionSettingSchema, { error: "La liste des aliments à éviter est illisible." })
  .max(MAX_EXCLUSIONS, { error: `${MAX_EXCLUSIONS} aliments au plus.` })
  .superRefine((exclusions, ctx) => {
    const seen = new Set<string>();
    for (const [index, exclusion] of exclusions.entries()) {
      if (typeof exclusion.term !== "string") continue;
      const key = normalizeName(exclusion.term);
      if (key === "") continue;
      if (seen.has(key)) {
        ctx.addIssue({
          code: "custom",
          message: `« ${exclusion.term} » est déjà dans la liste.`,
          path: [index, "term"],
        });
      }
      seen.add(key);
    }
  });

const EquipmentSchema = z
  .array(ApplianceSettingSchema, { error: "La liste des appareils est illisible." })
  .superRefine((equipment, ctx) => {
    const seen = new Set<string>();
    for (const [index, appliance] of equipment.entries()) {
      if (seen.has(appliance.id)) {
        ctx.addIssue({
          code: "custom",
          message: `Appareil en double : ${APPLIANCE_LABELS[appliance.id]}.`,
          path: [index, "id"],
        });
      }
      seen.add(appliance.id);
    }
  });

export const SettingsSchema = z.object(
  {
    version: z.literal(SETTINGS_VERSION, {
      error: "La version des réglages est absente ou inconnue.",
    }),
    exclusions: ExclusionsSchema,
    equipment: EquipmentSchema,
    model: z
      .string({ error: "Écrivez l'identifiant d'un modèle." })
      .trim()
      .min(1, { error: "Écrivez l'identifiant d'un modèle.", abort: true })
      .max(MAX_MODEL_LENGTH, { error: `${MAX_MODEL_LENGTH} caractères au plus.`, abort: true })
      .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/, {
        error: "Lettres sans accent, chiffres, « . », « - », « _ » ou « : » seulement.",
      }),
  },
  { error: "Le document des réglages est illisible." },
);

export type ExclusionSetting = Readonly<z.infer<typeof ExclusionSettingSchema>>;
export type ApplianceSetting = Readonly<z.infer<typeof ApplianceSettingSchema>>;
export interface Settings {
  readonly version: typeof SETTINGS_VERSION;
  readonly exclusions: readonly ExclusionSetting[];
  readonly equipment: readonly ApplianceSetting[];
  readonly model: string;
}

export interface SettingsIssue {
  readonly path: readonly (string | number)[];
  readonly message: string;
}

// Un objet neuf à chaque appel : l'état de l'écran le modifie par copie.
export function defaultSettings(): Settings {
  return {
    version: SETTINGS_VERSION,
    exclusions: [],
    equipment: HOUSEHOLD_EQUIPMENT.map((spec) => ({
      id: spec.id,
      available: true,
      slots: spec.slots,
    })),
    model: DEFAULT_MODEL,
  };
}

// Ajoute, dans l'ordre de la table du code, les appareils absents du document (appareil ajouté au code après
// l'enregistrement) : l'écran affiche toujours tous les appareils.
function completeEquipment(equipment: readonly ApplianceSetting[]): ApplianceSetting[] {
  const known = new Set(equipment.map((appliance) => appliance.id));
  const missing = defaultSettings().equipment.filter((appliance) => !known.has(appliance.id));
  return [...equipment, ...missing];
}

function completed(data: z.infer<typeof SettingsSchema>): Settings {
  const { version, exclusions, equipment, model } = data;
  return { version, exclusions, equipment: completeEquipment(equipment), model };
}

export function validateSettings(
  candidate: unknown,
): { ok: true; settings: Settings } | { ok: false; issues: SettingsIssue[] } {
  const parsed = SettingsSchema.safeParse(candidate);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.map((part) => (typeof part === "symbol" ? String(part) : part)),
        message: issue.message,
      })),
    };
  }
  return { ok: true, settings: completed(parsed.data) };
}

function futureVersion(candidate: unknown): boolean {
  if (typeof candidate !== "object" || candidate === null || !("version" in candidate))
    return false;
  const { version } = candidate;
  return typeof version === "number" && Number.isInteger(version) && version > SETTINGS_VERSION;
}

const UNREADABLE = "Les réglages enregistrés sont illisibles.";

// En cas d'échec : `error` est la phrase française, `detail` le détail technique (ou null). Une erreur du store
// n'est pas attrapée : elle remonte, et l'écran la distingue d'un document illisible.
export async function loadSettings(
  store: SettingsStore,
): Promise<{ ok: true; settings: Settings } | { ok: false; error: string; detail: string | null }> {
  const text = await store.read();
  if (text === null) return { ok: true, settings: defaultSettings() };
  let candidate: unknown;
  try {
    candidate = JSON.parse(text);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "texte invalide";
    return { ok: false, error: UNREADABLE, detail };
  }
  if (futureVersion(candidate)) return { ok: false, error: FUTURE_VERSION_ERROR, detail: null };
  const parsed = SettingsSchema.safeParse(candidate);
  if (!parsed.success) {
    return { ok: false, error: UNREADABLE, detail: z.prettifyError(parsed.error) };
  }
  return { ok: true, settings: completed(parsed.data) };
}

// Les réglages d'équipement appliqués à la table du code : les appareils indisponibles sont retirés, la capacité
// est remplacée, l'ordre et les autres champs (`extra`, `uses`) viennent de la table. Un appareil absent des
// réglages garde les valeurs du code.
export function applyEquipmentSettings(
  base: Equipment,
  settings: readonly ApplianceSetting[],
): Equipment {
  const byId = new Map(settings.map((setting) => [setting.id, setting]));
  return Object.freeze(
    base.flatMap((spec) => {
      const setting = byId.get(spec.id);
      if (setting === undefined) return [Object.freeze({ ...spec })];
      if (!setting.available) return [];
      return [Object.freeze({ ...spec, slots: setting.slots })];
    }),
  );
}

export function checkApiKey(raw: string): { ok: true; key: string } | { ok: false; error: string } {
  const key = raw.trim();
  if (key === "") return { ok: false, error: "Collez la clé avant d'enregistrer." };
  // ASCII visible seulement : en ASCII, 500 caractères font 500 octets, comme la borne de Rust.
  if (!/^[\x21-\x7E]+$/.test(key)) {
    return {
      ok: false,
      error:
        "La clé ne contient que des lettres sans accent, des chiffres et des signes, sans espace.",
    };
  }
  if (key.length > MAX_API_KEY_LENGTH) {
    return { ok: false, error: `Clé trop longue (${MAX_API_KEY_LENGTH} caractères au plus).` };
  }
  return { ok: true, key };
}
