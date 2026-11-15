import { Button, Group, Paper, Table, Text, TextInput, Title } from "@mantine/core";
import { REFERENTIAL, buildIngredientIndex, unknownExclusionTerms } from "core";
import type { SettingsKeeper, SettingsSnapshot } from "core";
import { useRef, useState } from "react";
import type { SyntheticEvent } from "react";
import { issuesOutside, messageAt, refusalMessage } from "./refusal.ts";
import { SettingsLoading } from "./SettingsLoading.tsx";

// Calculé une fois : le référentiel ne change pas pendant que l'app tourne.
const INGREDIENT_INDEX = buildIngredientIndex(REFERENTIAL);

export function ExclusionsSection({
  snapshot,
  apply,
}: {
  snapshot: SettingsSnapshot;
  apply: SettingsKeeper["apply"];
}) {
  const [term, setTerm] = useState("");
  const [reason, setReason] = useState("");
  const [termError, setTermError] = useState<string | undefined>(undefined);
  const [reasonError, setReasonError] = useState<string | undefined>(undefined);
  const termInput = useRef<HTMLInputElement>(null);

  const exclusions = snapshot.status === "ready" ? snapshot.settings.exclusions : [];
  const unknown = new Set(
    unknownExclusionTerms(
      exclusions.map((exclusion) => exclusion.term),
      INGREDIENT_INDEX,
    ),
  );

  function clearErrors() {
    setTermError(undefined);
    setReasonError(undefined);
  }

  function add(event: SyntheticEvent) {
    event.preventDefault();
    // Position de la nouvelle ligne dans le document que le propriétaire valide, pas dans celui du rendu.
    let index = -1;
    const result = apply((settings) => {
      index = settings.exclusions.length;
      return { ...settings, exclusions: [...settings.exclusions, { term, reason }] };
    });
    if (result.ok) {
      setTerm("");
      setReason("");
      clearErrors();
      termInput.current?.focus();
      return;
    }
    // La raison n'affiche que son propre constat. Tout autre constat va sous « Aliment » : celui du terme, sinon
    // celui de la liste (« 200 aliments au plus. ») ou de la ligne, pour qu'aucun refus ne reste muet.
    const reasonPath = ["exclusions", index, "reason"];
    const nextReasonError = messageAt(result.issues, reasonPath);
    const others = issuesOutside(result.issues, reasonPath);
    setReasonError(nextReasonError);
    setTermError(
      messageAt(others, ["exclusions", index, "term"]) ??
        (others.length > 0 || nextReasonError === undefined ? refusalMessage(others) : undefined),
    );
  }

  function remove(index: number) {
    const result = apply((settings) => ({
      ...settings,
      exclusions: settings.exclusions.filter((_, position) => position !== index),
    }));
    // Après un retrait, les messages du dernier ajout refusé (doublon, liste pleine) ne valent plus.
    if (result.ok) {
      clearErrors();
      return;
    }
    setReasonError(undefined);
    setTermError(refusalMessage(result.issues));
  }

  return (
    <Paper withBorder p="lg">
      <Title order={3}>Aliments à éviter</Title>
      <Text c="dimmed" size="sm" mb="md">
        Ces aliments ne seront jamais proposés, ni dans les plats ni dans les accompagnements.
      </Text>
      {snapshot.status !== "ready" ? (
        <SettingsLoading />
      ) : (
        <>
          <form onSubmit={add}>
            <Group align="flex-start">
              <TextInput
                ref={termInput}
                label="Aliment"
                placeholder="ex. : céleri"
                value={term}
                error={termError}
                onChange={(event) => {
                  setTerm(event.currentTarget.value);
                }}
              />
              <TextInput
                label="Raison (facultative)"
                placeholder="ex. : n'aime pas"
                value={reason}
                error={reasonError}
                onChange={(event) => {
                  setReason(event.currentTarget.value);
                }}
              />
              <Button type="submit" mt={25}>
                Ajouter
              </Button>
            </Group>
          </form>
          {exclusions.length === 0 ? (
            <Text c="dimmed" size="sm" mt="md">
              Aucun aliment à éviter pour l'instant.
            </Text>
          ) : (
            <Table mt="md">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Aliment</Table.Th>
                  <Table.Th>Raison</Table.Th>
                  <Table.Th />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {exclusions.map((exclusion, index) => (
                  <Table.Tr key={exclusion.term}>
                    <Table.Td>
                      {exclusion.term}
                      {unknown.has(exclusion.term) && (
                        <Text size="xs" c="orange">
                          Inconnu du référentiel : seuls les noms de plats et d'ingrédients inconnus
                          seront contrôlés.
                        </Text>
                      )}
                    </Table.Td>
                    <Table.Td>
                      {exclusion.reason === "" ? <Text c="dimmed">—</Text> : exclusion.reason}
                    </Table.Td>
                    <Table.Td>
                      <Button
                        variant="subtle"
                        color="red"
                        size="xs"
                        aria-label={`Retirer ${exclusion.term}`}
                        onClick={() => {
                          remove(index);
                        }}
                      >
                        Retirer
                      </Button>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          )}
        </>
      )}
    </Paper>
  );
}
