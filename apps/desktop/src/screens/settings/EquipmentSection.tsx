import { Checkbox, NumberInput, Paper, Table, Text, Title } from "@mantine/core";
import { APPLIANCE_LABELS, HOUSEHOLD_EQUIPMENT } from "core";
import type { ApplianceSetting, ApplianceSpec, SettingsKeeper, SettingsSnapshot } from "core";
import { useState } from "react";
import { messageAt, refusalMessage } from "./refusal.ts";
import { SettingsLoading } from "./SettingsLoading.tsx";

function displayName(id: ApplianceSpec["id"]): string {
  const label = APPLIANCE_LABELS[id];
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function ApplianceRow({
  setting,
  spec,
  apply,
}: {
  setting: ApplianceSetting;
  spec: ApplianceSpec;
  apply: SettingsKeeper["apply"];
}) {
  const name = displayName(setting.id);
  const [draft, setDraft] = useState<number | string>(setting.slots);
  const [error, setError] = useState<string | undefined>(undefined);
  const [availableError, setAvailableError] = useState<string | undefined>(undefined);

  // Les actions passent un calcul sur le document courant, pas une copie lue au rendu : deux actions rapprochées
  // s'ajoutent au lieu de s'écraser. Un refus rend le message du champ visé (`field`), sinon le premier constat :
  // aucun refus ne reste muet.
  function change(
    field: "available" | "slots",
    update: (current: ApplianceSetting) => ApplianceSetting,
  ): string | undefined {
    let index = -1;
    const result = apply((settings) => {
      index = settings.equipment.findIndex((item) => item.id === setting.id);
      return {
        ...settings,
        equipment: settings.equipment.map((item) => (item.id === setting.id ? update(item) : item)),
      };
    });
    if (result.ok) return undefined;
    return messageAt(result.issues, ["equipment", index, field]) ?? refusalMessage(result.issues);
  }

  function commitSlots() {
    if (draft === "") {
      setDraft(setting.slots);
      setError(undefined);
      return;
    }
    if (typeof draft !== "number" || !Number.isInteger(draft) || draft === setting.slots) return;
    setError(change("slots", (item) => ({ ...item, slots: draft })));
  }

  return (
    <Table.Tr>
      <Table.Td>
        {name}
        <Text size="xs" c="dimmed">
          {spec.uses}
        </Text>
      </Table.Td>
      <Table.Td>
        <Checkbox
          aria-label={`${name} disponible`}
          checked={setting.available}
          error={availableError}
          onChange={(event) => {
            const available = event.currentTarget.checked;
            setAvailableError(change("available", (item) => ({ ...item, available })));
          }}
        />
      </Table.Td>
      <Table.Td>
        <NumberInput
          aria-label={`Cuissons en même temps : ${name}`}
          w={90}
          min={1}
          max={10}
          allowDecimal={false}
          allowNegative={false}
          clampBehavior="strict"
          disabled={!setting.available}
          value={draft}
          error={error}
          onChange={setDraft}
          onBlur={commitSlots}
          onKeyDown={(event) => {
            // Entrée quitte le champ : l'enregistrement se fait au `blur`, une seule fois.
            if (event.key === "Enter") event.currentTarget.blur();
          }}
        />
      </Table.Td>
    </Table.Tr>
  );
}

function ApplianceTable({
  title,
  rows,
  apply,
}: {
  title: string;
  rows: { setting: ApplianceSetting; spec: ApplianceSpec }[];
  apply: SettingsKeeper["apply"];
}) {
  return (
    <>
      <Text fw={600} mt="md">
        {title}
      </Text>
      <Table layout="fixed">
        <Table.Thead>
          <Table.Tr>
            <Table.Th w="55%">Appareil</Table.Th>
            <Table.Th w="20%">Disponible</Table.Th>
            <Table.Th w="25%">Cuissons en même temps</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {rows.map(({ setting, spec }) => (
            <ApplianceRow key={setting.id} setting={setting} spec={spec} apply={apply} />
          ))}
        </Table.Tbody>
      </Table>
    </>
  );
}

export function EquipmentSection({
  snapshot,
  apply,
}: {
  snapshot: SettingsSnapshot;
  apply: SettingsKeeper["apply"];
}) {
  // Dans l'ordre de la table du code, quel que soit l'ordre du document.
  const rows =
    snapshot.status === "ready"
      ? HOUSEHOLD_EQUIPMENT.flatMap((spec) => {
          const setting = snapshot.settings.equipment.find((candidate) => candidate.id === spec.id);
          return setting === undefined ? [] : [{ setting, spec }];
        })
      : [];
  return (
    <Paper withBorder p="lg">
      <Title order={3}>Équipement</Title>
      <Text c="dimmed" size="sm">
        Cochez les appareils disponibles et indiquez combien de cuissons chacun peut mener en même
        temps. Une session utilise au plus un appareil d'appoint.
      </Text>
      {snapshot.status !== "ready" ? (
        <SettingsLoading />
      ) : (
        <>
          <ApplianceTable
            title="Appareils de base"
            rows={rows.filter(({ spec }) => !spec.extra)}
            apply={apply}
          />
          <ApplianceTable
            title="Appareils d'appoint (un par session au plus)"
            rows={rows.filter(({ spec }) => spec.extra)}
            apply={apply}
          />
        </>
      )}
    </Paper>
  );
}
