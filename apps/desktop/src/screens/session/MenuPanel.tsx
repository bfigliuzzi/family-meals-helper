import {
  Alert,
  Badge,
  Box,
  Button,
  Checkbox,
  Divider,
  Group,
  List,
  Paper,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import {
  APPLIANCE_LABELS,
  CATEGORY_LABELS,
  DAY_LABELS,
  MAX_SESSION_MINUTES,
  RULE_LABELS,
  SESSION_DAY_LABELS,
  MENU_COST_HINT,
  REFERENTIAL,
  THAW_INSTRUCTION_FR,
  budgetRespectedText,
  buildIngredientIndex,
  checkBudget,
  dishKey,
  dishLetter,
  durationText,
  isSessionBusy,
  menuCost,
  monthName,
  printable,
  sourcesNotice,
  totalText,
} from "core";
import type {
  CurrentMenu,
  Dish,
  DishKeeping,
  Finding,
  IngredientIndex,
  MenuIngredient,
  PriceKeeper,
  Session,
  SessionSnapshot,
  SettingsKeeper,
} from "core";
import { useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import { usePriceSnapshot } from "../../usePriceSnapshot.ts";
import { INGREDIENTS_TEXTS } from "../ingredients/texts.ts";
import { AvoidIngredient } from "./AvoidIngredient.tsx";
import { plural, TEXTS, VALIDATE_TEXTS } from "./texts.ts";

// Le référentiel ne change pas pendant que l'app tourne : l'index est construit une fois, au premier menu affiché.
let referentialIndex: IngredientIndex | null = null;
function indexOf(): IngredientIndex {
  referentialIndex ??= buildIngredientIndex(REFERENTIAL);
  return referentialIndex;
}

function capitalized(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function countOf(findings: readonly Finding[], level: Finding["level"]): number {
  return findings.filter((finding) => finding.level === level).length;
}

function CountBadge({ findings }: { findings: readonly Finding[] }) {
  const errors = countOf(findings, "error");
  const warnings = countOf(findings, "warning");
  if (errors > 0) {
    return (
      <Badge variant="light" color="red">
        {errors} {plural(errors, "erreur", "erreurs")}
      </Badge>
    );
  }
  if (warnings > 0) {
    return (
      <Badge variant="light" color="yellow">
        {warnings} {plural(warnings, "avertissement", "avertissements")}
      </Badge>
    );
  }
  return (
    <Badge variant="light" color="teal">
      Aucun constat détecté
    </Badge>
  );
}

function appliancesOf(dish: Dish): string {
  const ids = new Set(dish.phases.map((phase) => phase.appliance));
  ids.delete("none");
  return ids.size === 0 ? "aucun" : [...ids].map((id) => APPLIANCE_LABELS[id]).join(", ");
}

function DishCard({
  dish,
  index,
  keeping,
  pinned,
  locked,
  session,
  settings,
  onAvoided,
}: {
  dish: Dish;
  index: number;
  keeping: DishKeeping | undefined;
  pinned: boolean;
  locked: boolean;
  session: Session;
  settings: SettingsKeeper;
  onAvoided: (term: string) => void;
}) {
  const name = `${dishLetter(index)}. ${printable(dish.name)}`;
  const main = dish.ingredients.filter((ingredient) => !ingredient.sameDay);
  const sameDay = dish.ingredients.filter((ingredient) => ingredient.sameDay);
  // Le plat ne change pas (il est gelé) : la position est une clé correcte.
  const renderIngredient = (item: MenuIngredient, position: number) => (
    <AvoidIngredient key={position} ingredient={item} settings={settings} onAvoided={onAvoided} />
  );
  return (
    <Paper withBorder p="sm">
      <Stack gap={6}>
        <Group justify="space-between" wrap="nowrap" align="flex-start">
          <Text fw={600} style={{ overflowWrap: "anywhere" }}>
            {name}
          </Text>
          <Checkbox
            label="Épinglé"
            aria-label={`Épinglé : ${name}`}
            checked={pinned}
            disabled={locked}
            onChange={() => {
              session.togglePin(dish.name);
            }}
          />
        </Group>
        <Group gap="xs">
          <Badge variant="light" color="gray">
            {capitalized(DAY_LABELS[dish.day])}
          </Badge>
          {keeping?.fridgeDays != null && (
            <Badge variant="light" color="gray">
              Se garde {keeping.fridgeDays} j au frigo
            </Badge>
          )}
          {keeping?.toFreeze === true && (
            <Badge variant="light" color="blue">
              À congeler
            </Badge>
          )}
        </Group>
        {keeping?.toFreeze === true && (
          <Text size="xs" c="dimmed">
            {THAW_INSTRUCTION_FR}
          </Text>
        )}
        <Text size="xs">Appareils : {appliancesOf(dish)}</Text>
        <Group gap={4} wrap="wrap">
          {main.map(renderIngredient)}
        </Group>
        {sameDay.length > 0 && (
          <Group gap={4} wrap="wrap">
            <Text size="xs" c="dimmed">
              {TEXTS.sameDay}
            </Text>
            {sameDay.map(renderIngredient)}
          </Group>
        )}
      </Stack>
    </Paper>
  );
}

function FindingList({
  current,
  findings,
}: {
  current: CurrentMenu;
  findings: readonly Finding[];
}) {
  const sorted = [
    ...findings.filter((finding) => finding.level === "error"),
    ...findings.filter((finding) => finding.level !== "error"),
  ];
  return (
    <Stack gap="xs">
      <Title order={4}>{TEXTS.findings}</Title>
      {sorted.length === 0 ? (
        <Text size="sm" c="dimmed">
          {TEXTS.noFinding}
        </Text>
      ) : (
        <List spacing="xs" size="sm">
          {sorted.map((finding, position) => {
            const dish = finding.dish === null ? undefined : current.menu.dishes[finding.dish];
            const where =
              finding.dish === null || dish === undefined
                ? ""
                : ` · plat ${dishLetter(finding.dish)} « ${printable(dish.name)} »`;
            return (
              <List.Item key={position}>
                <Badge
                  size="xs"
                  variant="light"
                  color={finding.level === "error" ? "red" : "yellow"}
                  mr={6}
                >
                  {finding.level === "error" ? "erreur" : "avertissement"}
                </Badge>
                <span style={{ overflowWrap: "anywhere" }}>
                  {RULE_LABELS[finding.rule]}
                  {where} : {printable(finding.message)}
                </span>
              </List.Item>
            );
          })}
        </List>
      )}
    </Stack>
  );
}

function sessionLine(current: CurrentMenu): string {
  const { session } = current.check;
  if (session === null) return "Durée non calculée : phases à corriger (voir les constats).";
  const extras =
    session.extras.length === 0
      ? "aucun"
      : session.extras.map((id) => APPLIANCE_LABELS[id]).join(", ");
  return `Durée calculée : ${durationText(session.minutes)} (objectif 2 h à 2 h 30, ${durationText(MAX_SESSION_MINUTES)} au plus) · appareil d'appoint : ${extras}`;
}

// Bloc de validation, au pied du menu. Le contrôle est local et gratuit ; un blocage se corrige souvent sans appel.
function ValidateBlock({
  snapshot,
  current,
  session,
  prices,
  field,
  onOpenSettings,
}: {
  snapshot: SessionSnapshot;
  current: CurrentMenu;
  session: Session;
  prices: PriceKeeper;
  field: RefObject<HTMLTextAreaElement | null>;
  onOpenSettings: () => void;
}) {
  // Ferme la fenêtre entre un clic et le rendu qui désactive le bouton ; rouverte quand `validate` répond.
  const validating = useRef(false);
  const [notice, setNotice] = useState<string | null>(null);
  const busy = isSessionBusy(snapshot);
  const { blocked } = snapshot;
  // La fiche garde le coût du clic : la validation attend la première lecture de la table de prix de l'utilisateur.
  const pricesLoading = usePriceSnapshot(prices).manual.status === "loading";

  async function validate() {
    if (validating.current) return;
    validating.current = true;
    setNotice(null);
    try {
      const outcome = await session.validate();
      if (!outcome.ok && outcome.reason === "settings") setNotice(VALIDATE_TEXTS.settingsNotReady);
      if (!outcome.ok && outcome.reason === "prices") setNotice(VALIDATE_TEXTS.pricesNotReady);
    } finally {
      validating.current = false;
    }
  }

  return (
    <Stack gap="xs">
      <Divider />
      {blocked !== null && (
        <Alert color="red" variant="light" title={VALIDATE_TEXTS.blockedTitle}>
          <Stack gap="xs">
            <Text size="sm">{VALIDATE_TEXTS.blockedIntro}</Text>
            <List size="sm">
              {blocked.map((finding, position) => {
                const dish = finding.dish === null ? undefined : current.menu.dishes[finding.dish];
                const where =
                  finding.dish === null || dish === undefined
                    ? ""
                    : ` · plat ${dishLetter(finding.dish)} « ${printable(dish.name)} »`;
                return (
                  <List.Item key={position}>
                    <span style={{ overflowWrap: "anywhere" }}>
                      {RULE_LABELS[finding.rule]}
                      {where} : {printable(finding.message)}
                    </span>
                  </List.Item>
                );
              })}
            </List>
            <Text size="sm">{VALIDATE_TEXTS.blockedFix}</Text>
            <Group gap="xs">
              <Button
                variant="light"
                size="xs"
                onClick={() => {
                  field.current?.focus();
                }}
              >
                {VALIDATE_TEXTS.writeChange}
              </Button>
              <Button variant="subtle" size="xs" onClick={onOpenSettings}>
                {TEXTS.openSettings}
              </Button>
            </Group>
          </Stack>
        </Alert>
      )}
      {notice !== null && (
        <Alert color="yellow" variant="light">
          {notice}
        </Alert>
      )}
      <Box>
        <Button
          variant="filled"
          disabled={busy || pricesLoading}
          onClick={(event) => {
            // Le second clic d'un double clic ne relance pas la validation.
            if (event.detail > 1) return;
            void validate();
          }}
        >
          {VALIDATE_TEXTS.button}
        </Button>
      </Box>
      {pricesLoading && (
        <Text size="xs" c="dimmed">
          {VALIDATE_TEXTS.pricesReading}
        </Text>
      )}
      <Text size="xs" c="dimmed">
        {VALIDATE_TEXTS.help}
      </Text>
    </Stack>
  );
}

// Monté seulement quand un menu existe : la confirmation « éviter » disparaît avec lui.
function CurrentMenuView({
  snapshot,
  current,
  session,
  settings,
  prices,
  field,
  onOpenSettings,
}: {
  snapshot: SessionSnapshot;
  current: CurrentMenu;
  session: Session;
  settings: SettingsKeeper;
  prices: PriceKeeper;
  field: RefObject<HTMLTextAreaElement | null>;
  onOpenSettings: () => void;
}) {
  const [avoided, setAvoided] = useState<string | null>(null);
  const { check } = current;
  const priceSnapshot = usePriceSnapshot(prices);
  // Le coût suit les prix et le budget tout de suite, sans appel. Le constat `budget` est calculé ici, à part : il
  // s'affiche mais n'entre jamais dans `check.findings`, qui part à l'IA à la modification suivante.
  const cost = useMemo(
    () => menuCost(current.menu, indexOf(), priceSnapshot.lookups),
    [current.menu, priceSnapshot.lookups],
  );
  // Un brouillon illisible (`20000`) n'est pas un plafond : ni « respecté » ni constat tant qu'il n'est pas corrigé.
  const shownBudget = snapshot.budgetInvalid ? null : snapshot.budget;
  const budgetFinding = checkBudget(cost, shownBudget);
  const shownFindings =
    budgetFinding === null ? check.findings : [...check.findings, budgetFinding];
  const sources = sourcesNotice(cost);
  const errors = countOf(check.findings, "error");
  const interrupted =
    current.stop === "technical-error" ||
    current.stop === "truncated" ||
    current.stop === "refusal";
  return (
    <>
      <Group justify="space-between">
        <Title order={3}>{TEXTS.menuTitle}</Title>
        <CountBadge findings={shownFindings} />
      </Group>
      <Text size="sm">
        Session le {SESSION_DAY_LABELS[current.sessionDay]} · saison : {monthName(current.month)}
      </Text>
      <Text size="sm">{sessionLine(current)}</Text>
      <Text size="sm">
        {totalText(cost)}
        {budgetRespectedText(cost, shownBudget)}
      </Text>
      {priceSnapshot.manual.status === "error" && (
        <Alert color="yellow" variant="light">
          <Stack gap="xs" align="flex-start">
            <Text size="sm">
              {INGREDIENTS_TEXTS.manualUnreadable}
              {priceSnapshot.manual.error === null
                ? ""
                : ` ${printable(priceSnapshot.manual.error)}`}
            </Text>
            <Button
              variant="light"
              size="xs"
              onClick={() => {
                void prices.load();
              }}
            >
              {INGREDIENTS_TEXTS.retry}
            </Button>
          </Stack>
        </Alert>
      )}
      <Text size="xs" c="dimmed">
        {MENU_COST_HINT}
      </Text>
      {sources !== "" && (
        <Text size="xs" c="dimmed">
          {sources}
        </Text>
      )}
      {errors > 0 && (
        <Alert color="red" variant="light">
          Des erreurs restent après {current.attempts} {plural(current.attempts, "essai", "essais")}{" "}
          : demandez une modification pour les corriger.
        </Alert>
      )}
      {interrupted && (
        <Alert color="yellow" variant="light" title={TEXTS.interrupted}>
          {TEXTS.interruptedText}
          {current.technicalError !== null && ` ${printable(current.technicalError)}`}
        </Alert>
      )}
      <Text size="sm" role="status">
        {avoided !== null &&
          `« ${printable(avoided)} » ajouté aux aliments à éviter. Il compte à partir du prochain message : demandez une modification pour le retirer de ce menu.`}
      </Text>
      <Text size="xs" c="dimmed">
        {TEXTS.pinHelp}
      </Text>
      <Text size="xs" c="dimmed">
        {TEXTS.avoidHelp}
      </Text>
      {current.menu.dishes.length === 0 ? (
        <Text size="sm">{TEXTS.noDish}</Text>
      ) : (
        <Stack gap="xs">
          {/* Le menu affiché ne change pas (il est gelé) : la position est une clé correcte. */}
          {current.menu.dishes.map((dish, index) => (
            <DishCard
              key={index}
              dish={dish}
              index={index}
              keeping={check.keeping[index]}
              pinned={snapshot.pinned.some((pin) => dishKey(pin) === dishKey(dish.name))}
              locked={isSessionBusy(snapshot)}
              session={session}
              settings={settings}
              onAvoided={setAvoided}
            />
          ))}
        </Stack>
      )}
      <FindingList current={current} findings={shownFindings} />
      {check.seasonUnchecked.length > 0 && (
        <Text size="xs" c="dimmed">
          Saison non vérifiée pour : {check.seasonUnchecked.map(printable).join(", ")}.
        </Text>
      )}
      {check.toConfirm.length > 0 && (
        <Text size="xs" c="dimmed">
          Absents du référentiel, à confirmer :{" "}
          {check.toConfirm
            .map((entry) => `${printable(entry.name)} (${CATEGORY_LABELS[entry.category]})`)
            .join(", ")}
          .
        </Text>
      )}
      <ValidateBlock
        snapshot={snapshot}
        current={current}
        session={session}
        prices={prices}
        field={field}
        onOpenSettings={onOpenSettings}
      />
    </>
  );
}

export function MenuPanel({
  snapshot,
  session,
  settings,
  prices,
  field,
  onOpenSettings,
}: {
  snapshot: SessionSnapshot;
  session: Session;
  settings: SettingsKeeper;
  prices: PriceKeeper;
  // Le champ de la demande, pour « Écrire une modification ».
  field: RefObject<HTMLTextAreaElement | null>;
  onOpenSettings: () => void;
}) {
  const { current } = snapshot;
  return (
    <Paper withBorder p="lg">
      <Stack gap="sm">
        {current === null ? (
          <>
            <Title order={3}>{TEXTS.menuTitle}</Title>
            <Text c="dimmed">{TEXTS.menuEmpty}</Text>
            <Text size="sm" c="dimmed">
              {TEXTS.menuSettings}
            </Text>
            <Box>
              <Button variant="light" onClick={onOpenSettings}>
                {TEXTS.openSettings}
              </Button>
            </Box>
          </>
        ) : (
          // Un nouveau résultat remplace le menu : tout l'affichage est remonté (fenêtre « éviter » ouverte, raison
          // tapée, confirmation), pour qu'aucun état ne passe à un autre plat ou ingrédient de même position.
          <CurrentMenuView
            key={snapshot.exchanges.length}
            snapshot={snapshot}
            current={current}
            session={session}
            settings={settings}
            prices={prices}
            field={field}
            onOpenSettings={onOpenSettings}
          />
        )}
      </Stack>
    </Paper>
  );
}
