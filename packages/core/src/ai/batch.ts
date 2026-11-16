import type { TDocumentDefinitions } from "pdfmake/interfaces.js";
import type { RuleId } from "../domain/finding.ts";
import type { IngredientRef } from "../domain/ingredient.ts";
import type { Menu, SessionDay } from "../domain/menu.ts";
import type { Equipment } from "../equipment/household.ts";
import { buildIngredientIndex } from "../ingredients/index-lookup.ts";
import type { IngredientIndex } from "../ingredients/index-lookup.ts";
import { isAdmissible } from "../scheduling/check-detail.ts";
import type { SessionPlan } from "../scheduling/plan-session.ts";
import type { SeasonRow } from "../season/months.ts";
import { buildSheetDocument } from "../pdf/sheet.ts";
import type { SheetSteps } from "../pdf/sheet.ts";
import { composeMenu } from "./compose.ts";
import type { ComposeInput, ComposeResult } from "./compose.ts";
import { detailMenu } from "./detail.ts";
import type { DetailAttempt, DetailResult } from "./detail.ts";
import type { Model } from "./model.ts";

export interface BatchResult {
  compose: ComposeResult;
  // null : arrêt avant le détail.
  detail: DetailResult | null;
  // null : pas de PDF.
  sheet: TDocumentDefinitions | null;
  // Pas de menu utilisable : pas de PDF.
  stoppedBecause: "no-menu" | "menu-errors" | null;
  // PDF de repli avec les grandes phases du menu, quand le détail n'est pas utilisable.
  fallback: "no-detail" | "detail-errors" | null;
  // La raison du repli, en français : la même sur le PDF et dans le terminal. null sans repli.
  fallbackReason: string | null;
}

// Causes d'un détail incohérent, en mots simples : cette raison est imprimée sur la fiche.
const CAUSE_LABELS: Partial<Record<RuleId, string>> = {
  phases: "enchaînement des étapes",
  equipment: "appareil absent",
  "extra-appliance": "plus d'un appareil d'appoint",
  detail: "plats ou ingrédients mal cités",
  exclusion: "ingrédient exclu",
  "session-length": "plus de 3 h",
};

function fallbackReason(detail: DetailResult): string {
  const chosen = detail.best;
  if (chosen === null) {
    switch (detail.stop) {
      case "technical-error":
        return "le service d'IA n'a pas répondu (erreur technique)";
      case "refusal":
        return "l'IA a refusé de rédiger le détail";
      case "truncated":
        return "la réponse de l'IA a été coupée";
      default:
        return "l'IA n'a pas rendu de détail lisible";
    }
  }
  const causes = [
    ...new Set(
      chosen.findings
        .filter((finding) => finding.level === "error")
        .flatMap((finding) => CAUSE_LABELS[finding.rule] ?? []),
    ),
  ];
  return `les étapes détaillées restent incohérentes après ${detail.calls} ${detail.calls > 1 ? "appels" : "appel"} (${causes.join(", ")})`;
}

export interface SheetPlan {
  detail: DetailResult;
  steps: SheetSteps;
  fallback: "no-detail" | "detail-errors" | null;
  fallbackReason: string | null;
}

// Détail court, puis choix des étapes de la fiche : le détail s'il est admissible, sinon les grandes phases.
// `plan` est le planning du menu composé (la base de durée du détail et le repli). Ne rejette jamais à cause de l'IA.
export async function detailForSheet(
  input: {
    menu: Menu;
    plan: SessionPlan;
    sessionDay: SessionDay;
    maxAttempts: 1 | 2 | 3;
    exclusions: readonly string[];
  },
  deps: {
    model: Model;
    equipment: Equipment;
    index: IngredientIndex;
    onAttempt?: (attempt: DetailAttempt) => void;
  },
): Promise<SheetPlan> {
  const detail = await detailMenu(
    {
      menu: input.menu,
      sessionDay: input.sessionDay,
      maxAttempts: input.maxAttempts,
      composedMinutes: input.plan.minutes,
      exclusions: input.exclusions,
    },
    deps,
  );
  const chosen = detail.best;
  if (chosen !== null && chosen.detail !== null && chosen.plan !== null && isAdmissible(chosen)) {
    return {
      detail,
      steps: {
        kind: "detail",
        detail: chosen.detail,
        plan: chosen.plan,
        findings: chosen.findings,
      },
      fallback: null,
      fallbackReason: null,
    };
  }
  const reason = fallbackReason(detail);
  return {
    detail,
    steps: { kind: "phases", plan: input.plan, reason },
    fallback: chosen === null ? "no-detail" : "detail-errors",
    fallbackReason: reason,
  };
}

// Composition, puis détail court, puis fiche. Ne rejette jamais à cause de l'IA : les erreurs du modèle sont dans
// `compose.technicalError` et `detail.technicalError`.
export async function batchMenu(
  input: ComposeInput,
  deps: {
    models: { compose: Model; detail: Model };
    refs: readonly IngredientRef[];
    seasonTable: Readonly<Record<string, SeasonRow>>;
    equipment: Equipment;
    onAttempt?: (stage: "compose" | "detail", number: number) => void;
  },
): Promise<BatchResult> {
  const compose = await composeMenu(input, {
    model: deps.models.compose,
    refs: deps.refs,
    seasonTable: deps.seasonTable,
    equipment: deps.equipment,
    onAttempt: (attempt) => deps.onAttempt?.("compose", attempt.number),
  });
  const best = compose.best;
  if (best === null || best.menu === null) {
    return {
      compose,
      detail: null,
      sheet: null,
      stoppedBecause: "no-menu",
      fallback: null,
      fallbackReason: null,
    };
  }
  // Un menu sans `error` a forcément son planning : `checkSession` ne le refuse qu'avec une `error`.
  const menuPlan = best.check.session;
  if (best.check.findings.some((finding) => finding.level === "error") || menuPlan === null) {
    return {
      compose,
      detail: null,
      sheet: null,
      stoppedBecause: "menu-errors",
      fallback: null,
      fallbackReason: null,
    };
  }

  // Le même index sert au contrôle du détail et à la fiche.
  const index = buildIngredientIndex(deps.refs);
  const {
    detail,
    steps,
    fallback,
    fallbackReason: reason,
  } = await detailForSheet(
    {
      menu: best.menu,
      plan: menuPlan,
      sessionDay: input.sessionDay,
      maxAttempts: input.maxAttempts,
      exclusions: input.exclusions,
    },
    {
      model: deps.models.detail,
      equipment: deps.equipment,
      index,
      onAttempt: (attempt) => deps.onAttempt?.("detail", attempt.number),
    },
  );
  const sheet = buildSheetDocument({
    sessionDay: input.sessionDay,
    menu: best.menu,
    keeping: best.check.keeping,
    steps,
    index,
    equipment: deps.equipment,
  });
  return { compose, detail, sheet, stoppedBecause: null, fallback, fallbackReason: reason };
}

// 0 : PDF écrit, étapes détaillées, aucune `error`. 1 : PDF écrit avec un encadré d'avertissement (session de plus
// de 3 h, ou repli sur les grandes phases). 2 : pas de PDF.
export function batchExitCode(result: BatchResult): 0 | 1 | 2 {
  if (result.sheet === null) return 2;
  if (result.fallback !== null) return 1;
  const best = result.detail?.best;
  return best != null && best.findings.some((finding) => finding.level === "error") ? 1 : 0;
}
