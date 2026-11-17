import { describe, expect, it } from "vitest";
import { endSentence, savedOpenErrorText } from "./texts.ts";

describe("endSentence", () => {
  it.each([
    ["…", "…"],
    ["« Service indisponible. »", "« Service indisponible. »"],
    ["", ""],
    ["   ", ""],
    ["!", "!"],
    ["?", "?"],
    [".", "."],
    ["Fini.  ", "Fini."],
    ["Fini (voir Réglages.)", "Fini (voir Réglages.)"],
    ["Service indisponible", "Service indisponible."],
  ])("%j devient %j", (text, expected) => {
    expect(endSentence(text)).toBe(expected);
  });
});

describe("savedOpenErrorText", () => {
  it("un message vide ou invisible n'affiche ni « : » seul ni point doublé", () => {
    const text = savedOpenErrorText("​ ");
    expect(text).toBe(
      "Menu enregistré dans l'historique, mais Aperçu n'a pas ouvert la fiche. « Ouvrir la fiche » réessaie, sans nouvel appel.",
    );
  });
  it("un message avec point final n'en reçoit pas un second", () => {
    expect(savedOpenErrorText("Impossible.")).toContain(
      "ouvert la fiche : Impossible. « Ouvrir la fiche » réessaie",
    );
  });
});
