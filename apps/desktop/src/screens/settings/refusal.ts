import type { SettingsIssue } from "core";

// Règle de l'écran Réglages : un refus d'`apply` provoqué par l'utilisateur s'affiche toujours près de l'action,
// même quand son chemin ne vise aucun champ (« 200 aliments au plus. » porte sur la liste entière). Chaque
// action cherche d'abord le message de son champ avec `messageAt`, puis affiche `refusalMessage` sous le premier
// champ de sa section.

// Sans constat, le refus vient du propriétaire du document : il n'est pas encore prêt.
const NOT_READY = "Les réglages ne sont pas encore chargés : réessayez dans un instant.";

function samePath(path: SettingsIssue["path"], expected: readonly (string | number)[]): boolean {
  return path.length === expected.length && path.every((part, index) => part === expected[index]);
}

// Message du constat dont le chemin vaut exactement `path`.
export function messageAt(
  issues: readonly SettingsIssue[],
  path: readonly (string | number)[],
): string | undefined {
  return issues.find((issue) => samePath(issue.path, path))?.message;
}

// Les constats qui ne visent pas `path`.
export function issuesOutside(
  issues: readonly SettingsIssue[],
  path: readonly (string | number)[],
): SettingsIssue[] {
  return issues.filter((issue) => !samePath(issue.path, path));
}

// Message d'un refus dont aucun champ ne porte le constat : le premier constat, quel que soit son chemin.
export function refusalMessage(issues: readonly SettingsIssue[]): string {
  return issues[0]?.message ?? NOT_READY;
}
