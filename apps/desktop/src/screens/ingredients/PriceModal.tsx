import {
  Alert,
  Button,
  Group,
  Input,
  Modal,
  NumberInput,
  SegmentedControl,
  Stack,
  Text,
} from "@mantine/core";
import { MAX_MANUAL_EUROS, printable, readEuroInput, unitPriceText } from "core";
import type { ChecklistLine, ManualPriceRow, PriceKeeper, PriceUnit } from "core";
import { useState } from "react";
import {
  INGREDIENTS_TEXTS as TEXTS,
  PRICE_UNIT_LABELS,
  otherUnitPriceText,
  priceModalTitle,
  singlePriceUnitText,
} from "./texts.ts";

// Le champ de départ : le prix déjà saisi, seulement s'il est dans l'unité choisie. Un prix dans une autre unité
// n'est jamais réinterprété.
function startValue(existing: ManualPriceRow | undefined, unit: PriceUnit): number | string {
  return existing?.unit === unit ? existing.cents / 100 : "";
}

// La fenêtre de saisie du prix d'une ligne. Montée à l'ouverture et démontée à la fermeture : son état repart de
// zéro pour chaque ligne.
export function PriceModal({
  line,
  existing,
  prices,
  onClose,
}: {
  line: ChecklistLine;
  existing: ManualPriceRow | undefined;
  prices: PriceKeeper;
  onClose: () => void;
}) {
  const firstUnit = line.units[0];
  const [unit, setUnit] = useState<PriceUnit>(
    existing !== undefined && line.units.includes(existing.unit)
      ? existing.unit
      : (firstUnit ?? "kg"),
  );
  const [value, setValue] = useState<number | string>(() => startValue(existing, unit));
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const euros = readEuroInput(value, MAX_MANUAL_EUROS);
  const invalid = typeof euros !== "number";
  const foreignUnit = existing !== undefined && !line.units.includes(existing.unit);

  function changeUnit(next: string): void {
    const chosen = line.units.find((candidate) => candidate === next);
    if (chosen === undefined) return;
    setUnit(chosen);
    setValue(startValue(existing, chosen));
  }

  async function run(action: () => Promise<void>): Promise<void> {
    setBusy(true);
    setFailure(null);
    try {
      await action();
      onClose();
    } catch (reason) {
      setFailure(reason instanceof Error ? reason.message : "Erreur inconnue de la table de prix.");
      setBusy(false);
    }
  }

  function save(): void {
    setTouched(true);
    if (typeof euros !== "number") return;
    void run(() => prices.set(line.key, unit, euros));
  }

  return (
    <Modal
      opened
      onClose={() => {
        // Aucune fermeture pendant une écriture, par aucun moyen : l'échec doit se voir, et la fin de l'écriture
        // ne doit pas fermer une fenêtre rouverte entre-temps pour un autre produit.
        if (!busy) onClose();
      }}
      title={priceModalTitle(line.name)}
      closeOnEscape={!busy}
      closeOnClickOutside={!busy}
      withCloseButton={!busy}
    >
      <Stack gap="sm">
        <Text size="sm" c="dimmed">
          {TEXTS.priceModalIntro}
        </Text>
        {line.units.length > 1 ? (
          <Input.Wrapper label={TEXTS.priceUnitLabel}>
            <SegmentedControl
              fullWidth
              value={unit}
              onChange={changeUnit}
              data={line.units.map((candidate) => ({
                value: candidate,
                label: PRICE_UNIT_LABELS[candidate],
              }))}
            />
          </Input.Wrapper>
        ) : (
          <Text size="sm">{singlePriceUnitText(unit)}</Text>
        )}
        {foreignUnit && (
          <Text size="sm">
            {otherUnitPriceText(unitPriceText(existing.unit, existing.cents / 100), line.units)}
          </Text>
        )}
        <NumberInput
          label={TEXTS.priceFieldLabel}
          data-autofocus
          value={value}
          onChange={setValue}
          onBlur={() => {
            setTouched(true);
          }}
          decimalScale={2}
          decimalSeparator=","
          allowNegative={false}
          hideControls
          clampBehavior="none"
          error={touched && invalid ? TEXTS.priceFieldError : undefined}
        />
        {failure !== null && (
          <Alert color="red" variant="light" title={TEXTS.priceWriteErrorTitle}>
            {printable(failure)}
          </Alert>
        )}
        <Group justify="space-between">
          <Group gap="xs">
            <Button variant="filled" loading={busy} onClick={save}>
              {TEXTS.priceSave}
            </Button>
            <Button variant="default" disabled={busy} onClick={onClose}>
              {TEXTS.priceCancel}
            </Button>
          </Group>
          {existing !== undefined && (
            <Button
              variant="subtle"
              color="red"
              disabled={busy}
              onClick={() => {
                void run(() => prices.remove(line.key));
              }}
            >
              {TEXTS.priceRemove}
            </Button>
          )}
        </Group>
      </Stack>
    </Modal>
  );
}
