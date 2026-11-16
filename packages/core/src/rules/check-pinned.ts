import { printable } from "../ai/printable.ts";
import type { Finding } from "../domain/finding.ts";
import type { Menu } from "../domain/menu.ts";
import { normalizeName } from "../ingredients/normalize.ts";

// Clé de comparaison d'un nom de plat : `normalizeName`, ou, quand il ne reste rien (« 🍲 », nom sans lettre
// latine), le nom imprimable lui-même, pour que « 🥘 » et « 🍲 » restent deux plats. Sert à comparer, jamais à afficher.
export function dishKey(name: string): string {
  const key = normalizeName(name);
  return key === "" ? printable(name).trim() : key;
}

// Un plat épinglé ne peut pas disparaître du menu : un constat `error` par nom épinglé qu'aucun plat ne porte
// (comparaison par `dishKey`). Un plat renommé vers une autre clé compte comme retiré.
export function checkPinned(menu: Menu, pinned: readonly string[]): Finding[] {
  const present = new Set(menu.dishes.map((dish) => dishKey(dish.name)));
  return pinned
    .filter((name) => !present.has(dishKey(name)))
    .map((name): Finding => ({
      level: "error",
      rule: "pinned",
      dish: null,
      ingredient: null,
      message: `Le plat épinglé « ${printable(name)} » a disparu : remets-le, sous ce nom.`,
    }));
}
