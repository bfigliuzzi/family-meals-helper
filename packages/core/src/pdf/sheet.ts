import type {
  Column,
  Content,
  CustomTableLayout,
  TableCell,
  TDocumentDefinitions,
} from "pdfmake/interfaces.js";
import { printable } from "../ai/printable.ts";
import type { Detail } from "../domain/detail.ts";
import type { Finding } from "../domain/finding.ts";
import { DAYS, DAY_LABELS, SESSION_DAY_LABELS, dishLetter } from "../domain/menu.ts";
import type { Dish, Menu, SessionDay } from "../domain/menu.ts";
import { APPLIANCE_LABELS, HOUSEHOLD_EQUIPMENT, phaseUseText } from "../equipment/household.ts";
import type { IngredientIndex } from "../ingredients/index-lookup.ts";
import { ADULT_PORTIONS } from "../rules/balance-table.ts";
import type { DishKeeping } from "../rules/check-conservation.ts";
import { SAFETY_NOTE_FR } from "../rules/conservation-table.ts";
import { isVegetarian } from "../rules/dish-profile.ts";
import { isEveningDish, lastDish } from "../scheduling/check-session.ts";
import { MAX_SESSION_MINUTES, durationText } from "../scheduling/plan-session.ts";
import type { ScheduledPhase, SessionPlan } from "../scheduling/plan-session.ts";
import { buildShoppingList, pantryLineText, shoppingLineText } from "../shopping/shopping-list.ts";
import { renderStepText } from "./step-text.ts";
import type { TextRun } from "./step-text.ts";

// Ce que le déroulé imprime : le détail s'il est admissible, sinon les grandes phases de la composition.
export type SheetSteps =
  | { kind: "detail"; detail: Detail; plan: SessionPlan; findings: readonly Finding[] }
  | { kind: "phases"; plan: SessionPlan; reason: string };

export interface SheetInput {
  sessionDay: SessionDay;
  menu: Menu;
  keeping: readonly DishKeeping[];
  steps: SheetSteps;
  index: IngredientIndex;
}

// Fiche A4 portrait, une colonne, à la densité des fiches cuisine-addict (9 pt, marges de 10 mm, titres en
// `#b4532a`) : 1 à 2 feuilles, à imprimer une page par feuille.
const ACCENT = "#b4532a";
const HEADER_FILL = "#f0efec";
const GRID = "#cccccc";
const ROW_LINE = "#dddddd";
const GREY = "#6f6f6f";
const MARGIN = 28; // 10 mm

const FREEZE_SHORT = { yes: "oui", poor: "mal", no: "non" } as const;
const FREEZE_AFTER = { yes: ", congelable", poor: ", se congèle mal", no: ", pas de congélation" };
const FALLBACK_PHASE = "Grandes phases de la session (détail non validé)";
const READY = "au frais dès que prêt (2 h max à température ambiante)";
// Une préparation reprise au moins 60 min après sa fin reçoit « au frais jusqu'à l'étape N » : une marge nette sous la
// règle des 2 h à température ambiante, sans charger la fiche pour une attente courte.
const WAIT_BEFORE_FRIDGE = 60;
// Une durée déjà écrite dans le texte (« 20 min », « 2 h ») : pas de « ≈ 25 min » en double. « émincer » et
// « cumin » ne comptent pas.
const DURATION = /\b\d+([.,]\d+)?\s?(min|h)\b/i;

// Texte venu de l'IA ou de l'utilisateur : sans caractère de contrôle ni invisible. « → » n'existe pas dans Roboto :
// il devient un tiret cadratin, qui y est.
function clean(text: string): string {
  return printable(text).replaceAll("→", "—");
}

function capitalized(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function heading(text: string, style: "heading" | "phase" = "heading"): Content {
  // Repère pour `pageBreakBefore` : un titre ne reste jamais seul en bas de page. Jamais de bloc `unbreakable` :
  // pdfmake perd ce qui dépasse une page entière.
  return { text: clean(text), style, headlineLevel: 1 };
}

// Un objet neuf par tableau : pdfmake modifie les dispositions qu'il reçoit, et une disposition partagée entre deux
// tableaux fait échouer un second rendu du même document.
const gridLayout = (): CustomTableLayout => ({
  hLineWidth: () => 0.4,
  vLineWidth: () => 0.4,
  hLineColor: () => GRID,
  vLineColor: () => GRID,
  paddingLeft: () => 3,
  paddingRight: () => 3,
  paddingTop: () => 1.5,
  paddingBottom: () => 1.5,
  fillColor: (row) => (row === 0 ? HEADER_FILL : null),
});

const stepsLayout = (): CustomTableLayout => ({
  hLineWidth: (i, node) => (i === 0 || i === node.table.body.length ? 0 : 0.3),
  vLineWidth: () => 0,
  hLineColor: () => ROW_LINE,
  paddingLeft: () => 1,
  paddingRight: () => 2,
  paddingTop: () => 2,
  paddingBottom: () => 2,
});

// Case à cocher dessinée : Roboto n'a pas de glyphe « ☐ ». Un objet neuf par ligne, pdfmake modifie ses nœuds.
function checkbox(): Content {
  return { canvas: [{ type: "rect", x: 1, y: 1.5, w: 7, h: 7, lineWidth: 0.6 }] };
}

function runsContent(runs: readonly TextRun[]): Content[] {
  return runs.map((run) => (run.bold ? { text: run.text, bold: true } : run.text));
}

function warningBox(text: string): Content {
  return {
    table: { widths: ["*"], body: [[{ text: clean(text), bold: true, margin: [4, 2, 4, 2] }]] },
    layout: { hLineColor: () => ACCENT, vLineColor: () => ACCENT },
    margin: [0, 4, 0, 4],
  };
}

function warning(steps: SheetSteps, menu: Menu): Content | null {
  if (steps.kind === "phases") {
    return warningBox(
      `Attention : le détail des étapes n'a pas pu être validé : ${steps.reason}. Cette fiche donne les grandes phases du menu, validées à la composition, sans quantités à chaque étape ni consigne du soir rédigée.`,
    );
  }
  const tooLong = steps.findings.some(
    (finding) => finding.level === "error" && finding.rule === "session-length",
  );
  if (!tooLong) return null;
  // Le message du constat s'adresse à l'IA : la fiche, elle, parle au cuisinier.
  const last = lastDish(steps.plan, menu);
  return warningBox(
    `Attention : la session calculée dure ${durationText(steps.plan.minutes)}, au-delà de ${durationText(MAX_SESSION_MINUTES)}. Le plat qui finit le plus tard est « ${last.name} » (fin à ${durationText(last.end)}). Prévois plus de temps, ou fais tourner des cuissons en même temps.`,
  );
}

// Une ligne du déroulé, commune au détail et au repli.
interface SheetStep {
  entry: ScheduledPhase;
  phase: string;
  letters: string[];
  body: TextRun[];
}

// Ordre imprimé : par début, puis ce qui tourne seul d'abord (on lance le four avant de couper), puis l'ordre du
// planning. Une dépendance finit avant que son successeur commence, et toute durée vaut au moins 1 min : deux
// étapes qui commencent ensemble ne dépendent jamais l'une de l'autre, et l'ordre respecte donc les dépendances.
function printOrder(plan: SessionPlan): ScheduledPhase[] {
  return plan.phases
    .map((entry, position) => ({ entry, position }))
    .sort(
      (a, b) =>
        a.entry.start - b.entry.start ||
        Number(a.entry.phase.attended) - Number(b.entry.phase.attended) ||
        a.position - b.position,
    )
    .map(({ entry }) => entry);
}

function sheetSteps(input: SheetInput): SheetStep[] {
  const { steps, menu, index } = input;
  if (steps.kind === "phases") {
    return printOrder(steps.plan).map((entry) => ({
      entry,
      phase: FALLBACK_PHASE,
      letters: [dishLetter(entry.dish)],
      body: [{ text: clean(entry.phase.description), bold: false }],
    }));
  }
  const byId = new Map(steps.detail.steps.map((step) => [step.id, step]));
  return printOrder(steps.plan).map((entry) => {
    const step = byId.get(entry.phase.id);
    return {
      entry,
      phase: step?.phase ?? "",
      letters: step === undefined ? [dishLetter(entry.dish)] : [...new Set(step.dishes)],
      body:
        step === undefined
          ? [{ text: clean(entry.phase.description), bold: false }]
          : renderStepText(step.text, menu, index).map((run) => ({
              ...run,
              text: clean(run.text),
            })),
    };
  });
}

function fridgeText(keeping: DishKeeping | undefined): string {
  if (keeping?.toFreeze === true) return "congeler dès qu'il est froid";
  const days = keeping?.fridgeDays ?? null;
  const freeze = keeping?.freeze == null ? "" : FREEZE_AFTER[keeping.freeze];
  return `${days === null ? "frigo" : `frigo ${days} j`}${freeze}`;
}

// Conservation, calculée par tas : ce que chaque étape laisse pour chacun de ses plats. Toutes les étapes sont
// concernées : le code ne devine pas si une étape touche un aliment (un repère peut manquer). Limite acceptée : une
// étape de matériel, comme un préchauffage, peut recevoir une consigne de trop ; c'est le côté prudent.
// - L'étape qui finit le plus tard un plat (toutes ses branches sont faites) : « dès que c'est prêt : refroidir vite…
//   puis frigo 3 j ».
// - Sinon, le tas du plat L est repris par les étapes qui dépendent de celle-ci et portent L : « au frais dès que
//   prêt » si aucune ne le reprend ; « au frais jusqu'à l'étape N » si la dernière à le reprendre commence au moins
//   60 min après la fin ; rien sinon.
// Une étape à plusieurs plats précède chaque consigne de ses lettres ; les consignes identiques sont regroupées.
function keepingNotes(input: SheetInput, rows: readonly SheetStep[]): Map<SheetStep, string> {
  const notes = new Map<SheetStep, string>();
  const finals = new Map<string, SheetStep>();
  for (const [dish, plate] of input.menu.dishes.entries()) {
    if (isEveningDish(plate)) continue;
    const letter = dishLetter(dish);
    let last: SheetStep | undefined;
    for (const row of rows) {
      if (!row.letters.includes(letter)) continue;
      if (last === undefined || row.entry.end >= last.entry.end) last = row;
    }
    if (last !== undefined) finals.set(letter, last);
  }
  for (const row of rows) {
    const byNote = new Map<string, string[]>();
    for (const letter of row.letters) {
      const note =
        finals.get(letter) === row
          ? `dès que c'est prêt : refroidir vite, 2 h max à température ambiante, puis ${fridgeText(
              input.keeping.find((entry) => dishLetter(entry.dish) === letter),
            )}`
          : heapNote(rows, row, letter);
      if (note !== null) byNote.set(note, [...(byNote.get(note) ?? []), letter]);
    }
    if (byNote.size === 0) continue;
    const texts = [...byNote].map(([note, letters]) =>
      row.letters.length > 1 ? `(${letters.join("/")}) ${note}` : note,
    );
    notes.set(row, texts.join(" ; "));
  }
  return notes;
}

// Ce que devient le tas du plat `letter` laissé par l'étape `row`, selon les étapes qui le reprennent.
function heapNote(rows: readonly SheetStep[], row: SheetStep, letter: string): string | null {
  let last = -1;
  for (const [i, other] of rows.entries()) {
    if (!other.letters.includes(letter) || !other.entry.phase.after.includes(row.entry.phase.id)) {
      continue;
    }
    if (last === -1 || other.entry.start >= rows[last]!.entry.start) last = i;
  }
  if (last === -1) return READY;
  return rows[last]!.entry.start - row.entry.end >= WAIT_BEFORE_FRIDGE
    ? `au frais jusqu'à l'étape ${last + 1}`
    : null;
}

// La cuisson qui couvre une étape : celle qui tourne seule, est encore en cours quand l'étape commence, et a commencé
// le plus récemment. -1 s'il n'y en a pas.
function coverOf(rows: readonly SheetStep[], position: number): number {
  const { start } = rows[position]!.entry;
  let cover = -1;
  for (let i = 0; i < position; i++) {
    const { entry } = rows[i]!;
    if (entry.phase.attended || entry.end <= start) continue;
    if (cover === -1 || entry.start >= rows[cover]!.entry.start) cover = i;
  }
  return cover;
}

// Ce qui a fixé le début de l'étape dans le planning : une étape imprimée avant, qui finit exactement à ce début et
// qui la bloque, par ordre de priorité : une dépendance (`after`), puis le même appareil (le planificateur attendait
// une place). `planSession` ne fait commencer une étape qu'à 0, à la fin d'une dépendance ou à la fin d'une étape déjà
// placée. Une personne occupée ne compte pas : lire la fiche dans l'ordre suffit à finir une tâche à la main avant la
// suivante. À priorité égale, une étape qui tourne seule (c'est son attente qu'il faut dire), puis la dernière
// imprimée. -1 s'il n'y en a pas.
function blockerOf(rows: readonly SheetStep[], position: number): number {
  const { phase, start } = rows[position]!.entry;
  const reasons = [
    (other: ScheduledPhase): boolean => phase.after.includes(other.phase.id),
    (other: ScheduledPhase): boolean =>
      phase.appliance !== "none" && other.phase.appliance === phase.appliance,
  ];
  for (const blocks of reasons) {
    let found = -1;
    for (let i = position - 1; i >= 0; i--) {
      const other = rows[i]!.entry;
      if (other.end !== start || !blocks(other)) continue;
      if (!other.phase.attended) return i;
      if (found === -1) found = i;
    }
    if (found !== -1) return found;
  }
  return -1;
}

// Sans horaires, l'étape dit quand elle se fait, la première règle qui s'applique :
// 1. ce qui l'a bloquée est une étape faite à la main, et rien d'imprimé entre les deux ne commence plus tôt qu'elle
//    (on enchaîne) : rien ;
// 2. ce qui l'a bloquée est une autre étape, ou une étape qui tourne seule (il faut attendre la fin de la cuisson) :
//    « Après l'étape N : » ;
// 3. rien ne l'a bloquée et elle se fait pendant une cuisson qui tourne seule : « Pendant ce temps : » si c'est
//    l'étape d'avant, sinon « Pendant l'étape N : » ; rien si l'étape d'avant se faisait déjà pendant la même cuisson.
function lead(rows: readonly SheetStep[], position: number): string {
  const { start } = rows[position]!.entry;
  const blocker = blockerOf(rows, position);
  if (blocker !== -1) {
    const chained =
      rows[blocker]!.entry.phase.attended &&
      rows.slice(blocker + 1, position).every((row) => row.entry.start === start);
    return chained ? "" : `Après l'étape ${blocker + 1} : `;
  }
  const cover = coverOf(rows, position);
  if (cover === -1 || (position > 0 && coverOf(rows, position - 1) === cover)) return "";
  return cover === position - 1 ? "Pendant ce temps : " : `Pendant l'étape ${cover + 1} : `;
}

// Le rangement final se fait quand l'étape qui finit le plus tard dans le planning est finie.
function finalStep(input: SheetInput, rows: readonly SheetStep[]): TextRun[] {
  const frozen = input.keeping
    .filter((entry) => entry.toFreeze)
    .map((entry) => `${dishLetter(entry.dish)}. ${input.menu.dishes[entry.dish]?.name ?? ""}`);
  let last = -1;
  for (const [i, row] of rows.entries()) {
    if (last === -1 || row.entry.end >= rows[last]!.entry.end) last = i;
  }
  return [
    {
      text:
        last === -1
          ? "Quand tout est fini : "
          : `Quand tout est fini (après l'étape ${last + 1}) : `,
      bold: true,
    },
    {
      text: clean(
        `vérifier que tout est rangé : jamais un plat chaud au frigo (le refroidir sur une grille ou la casserole dans l'eau froide), fermer hermétiquement.${frozen.length === 0 ? "" : ` Au congélateur : ${frozen.join(", ")}.`}`,
      ),
      bold: false,
    },
  ];
}

function stepRow(number: number, cell: Content[]): TableCell[] {
  return [{ text: String(number), bold: true, alignment: "right" }, checkbox(), { text: cell }];
}

function stepsTable(rows: TableCell[][]): Content {
  return {
    table: { widths: [14, 11, "*"], body: rows },
    layout: stepsLayout(),
    margin: [0, 0, 0, 2],
  };
}

function stepsPart(input: SheetInput): Content[] {
  const rows = sheetSteps(input);
  const notes = keepingNotes(input, rows);
  const content: Content[] = [];
  let group = 0;
  let body: TableCell[][] = [];
  const flush = (): void => {
    if (body.length > 0) content.push(stepsTable(body));
    body = [];
  };
  for (const [i, row] of rows.entries()) {
    if (i === 0 || row.phase !== rows[i - 1]!.phase) {
      flush();
      group++;
      content.push(heading(`${group}. ${row.phase}`, "phase"));
    }
    const prefix = lead(rows, i);
    const { phase } = row.entry;
    const timed = row.body.some((run) => DURATION.test(run.text));
    const use = `${phaseUseText(phase)}${timed ? "" : `, ≈ ${durationText(phase.minutes)}`}`;
    const note = notes.get(row);
    body.push(
      stepRow(i + 1, [
        ...(prefix === "" ? [] : [{ text: prefix, bold: true }]),
        { text: `(${row.letters.join("/")}) `, bold: true },
        ...runsContent(row.body),
        ` (${use})`,
        ...(note === undefined ? [] : [" — ", { text: note, italics: true }]),
      ]),
    );
  }
  body.push(stepRow(rows.length + 1, runsContent(finalStep(input, rows))));
  flush();
  return content;
}

function appliancesOf(rows: readonly SheetStep[], letter: string): string {
  const used = new Set(
    rows.filter((row) => row.letters.includes(letter)).map((row) => row.entry.phase.appliance),
  );
  const labels = HOUSEHOLD_EQUIPMENT.filter((spec) => used.has(spec.id)).map(
    (spec) => APPLIANCE_LABELS[spec.id],
  );
  return labels.length === 0 ? "à la main" : labels.join(" + ");
}

function menuPart(input: SheetInput, rows: readonly SheetStep[]): Content[] {
  const { menu, keeping, index } = input;
  const header = ["", "Plat", "Jour", "Cuisson", "Frigo", "Congél."].map((text) => ({
    text,
    bold: true,
  }));
  const body: TableCell[][] = menu.dishes.map((dish, i): TableCell[] => {
    const keep = keeping.find((entry) => entry.dish === i);
    const evening = isEveningDish(dish);
    const freeze: TableCell = evening
      ? "—"
      : keep?.toFreeze === true
        ? { text: "à congeler", bold: true }
        : keep?.freeze == null
          ? "—"
          : FREEZE_SHORT[keep.freeze];
    return [
      { text: dishLetter(i), bold: true },
      clean(`${dish.name}${isVegetarian(dish, index) ? " (V)" : ""}`),
      DAY_LABELS[dish.day],
      evening ? "soir" : appliancesOf(rows, dishLetter(i)),
      evening ? "—" : keep?.fridgeDays == null ? "non calculé" : `${keep.fridgeDays} j`,
      freeze,
    ];
  });
  return [
    heading("Menu"),
    {
      table: { headerRows: 1, widths: [9, "*", 46, 90, 38, 46], body: [header, ...body] },
      layout: gridLayout(),
    },
    {
      text: "(V) : végétarien. Frigo : durée comptée depuis le jour de session, pour la partie préparée d'avance.",
      style: "small",
    },
  ];
}

function ingredientsPart(input: SheetInput): Content[] {
  const list = buildShoppingList(input.menu, input.index);
  const texts = list.lines.map((line) => clean(shoppingLineText(line)));
  const half = Math.ceil(texts.length / 2);
  const column = (lines: readonly string[]): Column => ({
    width: "*",
    stack: lines.map((text) => ({ text, margin: [0, 0, 0, 1] })),
  });
  const used = new Set(input.steps.plan.phases.map((entry) => entry.phase.appliance));
  const appliances = HOUSEHOLD_EQUIPMENT.filter((spec) => used.has(spec.id)).map(
    (spec) => `${APPLIANCE_LABELS[spec.id]}${spec.extra ? " (appoint)" : ""}`,
  );
  const pantry =
    list.pantry.length === 0
      ? "aucun ingrédient de placard dans ce menu."
      : list.pantry.map((line) => clean(pantryLineText(line))).join(" · ");
  const content: Content[] = [
    heading("Ingrédients"),
    { columns: [column(texts.slice(0, half)), column(texts.slice(half))], columnGap: 12 },
    { text: [{ text: "Placard", bold: true }, ` (vérifie) : ${pantry}`], margin: [0, 2, 0, 0] },
    {
      text: [
        { text: "Appareils", bold: true },
        ` : ${appliances.length === 0 ? "à la main seulement" : appliances.join(" · ")}`,
      ],
      margin: [0, 1, 0, 0],
    },
  ];
  if ([...list.lines, ...list.pantry].some((line) => line.toConfirm)) {
    content.push({
      text: "à confirmer : absent du référentiel, à vérifier avant de commander.",
      style: "small",
    });
  }
  return content;
}

function weekCell(input: SheetInput, dish: Dish, i: number): Content[] {
  const { steps, keeping, menu, index } = input;
  const runs: Content[] = [{ text: `${capitalized(DAY_LABELS[dish.day])}. `, bold: true }];
  if (keeping.find((entry) => entry.dish === i)?.toFreeze === true) {
    runs.push("La veille : passer du congélateur au frigo. ");
  }
  const sameDay = dish.ingredients.flatMap((ingredient, position) =>
    ingredient.sameDay ? [`${dishLetter(i)}.${position + 1}`] : [],
  );
  if (sameDay.length > 0) {
    // Le rendu des repères donne la quantité et la forme : « 600 g de cabillaud (surgelé) + 300 g de riz complet ».
    const added = renderStepText(`{${sameDay.join("/")}}`, menu, index).map((run) => ({
      ...run,
      text: clean(run.text),
    }));
    runs.push("À ajouter : ", ...runsContent(added), ". ");
  }
  if (steps.kind === "detail") {
    const evening = steps.detail.evenings.find((line) => line.dish === dishLetter(i));
    if (evening !== undefined) runs.push(clean(evening.text));
  } else {
    runs.push(
      isEveningDish(dish)
        ? "Préparer le plat le soir même."
        : sameDay.length > 0
          ? "Réchauffer le plat, puis ajouter les ingrédients du soir."
          : "Réchauffer le plat.",
    );
  }
  return runs;
}

function weekPart(input: SheetInput): Content[] {
  const order = input.menu.dishes
    .map((dish, i) => ({ dish, i }))
    .sort((a, b) => DAYS.indexOf(a.dish.day) - DAYS.indexOf(b.dish.day) || a.i - b.i);
  const body: TableCell[][] = [
    [
      { text: "", bold: true },
      { text: "Le jour J", bold: true },
    ],
    ...order.map(({ dish, i }): TableCell[] => [
      { text: dishLetter(i), bold: true },
      { text: weekCell(input, dish, i) },
    ]),
  ];
  return [
    heading("Dans la semaine"),
    { table: { headerRows: 1, widths: [9, "*"], body }, layout: gridLayout() },
  ];
}

// Les avertissements du détail (ingrédient non cité, quantité écrite à la main), tels quels.
function checksPart(steps: SheetSteps): Content[] {
  if (steps.kind !== "detail") return [];
  const messages = [
    ...new Set(
      steps.findings
        .filter((finding) => finding.level === "warning" && finding.rule === "detail")
        .map((finding) => finding.message),
    ),
  ];
  return messages.length === 0
    ? []
    : [{ text: clean(`À vérifier : ${messages.join(" · ")}`), style: "note" }];
}

// La fiche est décrite ici, sans effet de bord ; le rendu en octets est dans `src/node/render-pdf.ts`.
export function buildSheetDocument(input: SheetInput): TDocumentDefinitions {
  const { steps, menu, sessionDay } = input;
  const dishes = menu.dishes.length;
  const box = warning(steps, menu);
  const rows = sheetSteps(input);
  const quantities =
    steps.kind === "detail"
      ? "quantités indiquées au moment où on s'en sert"
      : "quantités dans « Ingrédients »";
  return {
    pageSize: "A4",
    pageOrientation: "portrait",
    pageMargins: [MARGIN, MARGIN, MARGIN, MARGIN],
    defaultStyle: { font: "Roboto", fontSize: 9, lineHeight: 1.08 },
    styles: {
      title: { fontSize: 13, bold: true, margin: [0, 0, 0, 1] },
      subtitle: { fontSize: 7.5, color: GREY, margin: [0, 0, 0, 2] },
      heading: { fontSize: 11, bold: true, color: ACCENT, margin: [0, 6, 0, 2] },
      phase: { fontSize: 11, bold: true, color: ACCENT, margin: [0, 4, 0, 1] },
      note: { italics: true, fontSize: 8.5, margin: [0, 3, 0, 0] },
      small: { fontSize: 7.5, color: GREY, margin: [0, 1, 0, 0] },
    },
    footer: (currentPage, pageCount) => ({
      text: `page ${currentPage} / ${pageCount}`,
      alignment: "center",
      fontSize: 7,
      color: GREY,
      margin: [0, 10, 0, 0],
    }),
    // Un titre ne reste pas en bas de page : on passe à la page suivante s'il n'est suivi, sur la page, que d'autres
    // titres.
    pageBreakBefore: (current, queries) =>
      current.headlineLevel !== undefined &&
      queries.getFollowingNodesOnPage().every((node) => node.headlineLevel !== undefined),
    content: [
      { text: "Batch cooking — fiche cuisine", style: "title" },
      // L'encadré vient juste après le titre.
      ...(box === null ? [] : [box]),
      {
        text: `Session du ${SESSION_DAY_LABELS[sessionDay]} · ${dishes} ${dishes > 1 ? "plats" : "plat"} · ${dishes * ADULT_PORTIONS} portions (${ADULT_PORTIONS} pers.) · environ ${durationText(steps.plan.minutes)} (durée calculée) · ${quantities}`,
        style: "subtitle",
      },
      ...menuPart(input, rows),
      ...ingredientsPart(input),
      ...stepsPart(input),
      ...checksPart(steps),
      { text: SAFETY_NOTE_FR, style: "note" },
      ...weekPart(input),
    ],
  };
}
