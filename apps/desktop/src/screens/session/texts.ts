import { printable } from "core";
import type { SessionFailure } from "core";

export function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many;
}

// Vrai quand la phrase renvoie aux Réglages : clé absente, clé refusée ou modèle introuvable.
export function opensSettings(text: string): boolean {
  return text.includes("Réglages");
}

export function pendingText(attempt: number): string {
  return attempt === 1
    ? "Essai 1 sur 3 : Claude compose le menu, puis l'app le vérifie."
    : `Essai ${String(attempt)} sur 3 : Claude corrige les constats de l'essai précédent.`;
}

const kept = " Le menu courant est gardé.";

function quoted(names: readonly string[]): string {
  const items = names.map((name) => `« ${printable(name)} »`);
  const last = items.at(-1) ?? "";
  return items.length < 2 ? last : `${items.slice(0, -1).join(", ")} et ${last}`;
}

export function failureTitle(failure: SessionFailure): string {
  switch (failure.stop) {
    case "technical-error":
      return "L'appel à Claude a échoué";
    case "pinned-removed":
      return "Menu inchangé : la réponse retirait un plat épinglé";
    case "refusal":
      return "Claude a refusé la demande";
    case "truncated":
      return "Réponse coupée";
    default:
      return "Menu inutilisable";
  }
}

export function failureText(failure: SessionFailure): string {
  const { stop, pinnedRemoved, revision } = failure;
  const alsoRemoved =
    stop !== "pinned-removed" && pinnedRemoved.length > 0
      ? ` Un essai retirait aussi un plat épinglé : ${quoted(pinnedRemoved)}.`
      : "";
  switch (stop) {
    case "technical-error":
      return `${printable(failure.technicalError ?? "Erreur inconnue.")} Votre message est gardé dans le champ : renvoyez-le quand le problème est réglé.${alsoRemoved}`;
    case "pinned-removed":
      return `La réponse de Claude retirait ${quoted(pinnedRemoved)}. Pour retirer ce plat, décochez d'abord « Épinglé », puis renvoyez votre message. L'appel a quand même été compté par Mammouth.`;
    case "refusal":
      return `Reformulez votre message.${revision ? kept : ""}${alsoRemoved}`;
    case "truncated":
      return `La réponse de Claude était trop longue : aucun menu lisible. Renvoyez le message, ou demandez moins de plats.${alsoRemoved}`;
    default:
      return `Claude n'a pas rendu de menu lisible en ${String(failure.attempts)} ${plural(failure.attempts, "essai", "essais")}.${revision ? kept : ""} Votre message est gardé : renvoyez-le ou reformulez-le.${alsoRemoved}`;
  }
}

export const TEXTS = {
  title: "Nouvelle session",
  intro:
    "Décrivez le menu de la semaine : Claude le compose, puis l'app le vérifie (conservation, équilibre, saison, durée de la session). Demandez ensuite des modifications, une à la fois.",
  lost: "La session (conversation, menu et épingles) n'est pas enregistrée : elle est perdue quand vous quittez l'app.",
  restart: "Recommencer",
  restartAsk:
    "Recommencer la session ? La conversation, le menu courant et les épingles seront effacés. Les réglages ne changent pas.",
  erase: "Effacer",
  cancel: "Annuler",
  dayLabel: "Jour de la session de cuisine",
  dayChanged: "Jour changé : pris en compte au prochain message.",
  dinnersLabel: "Nombre de dîners",
  dinnersHint:
    "Seul ce champ fixe le nombre de dîners (1 à 5) ; un nombre écrit dans la demande ne compte pas.",
  dinnersChanged: "Nombre changé : pris en compte au prochain message.",
  settingsUnavailable: "Réglages indisponibles",
  settingsNeeded: "La composition a besoin des réglages (modèle, aliments à éviter, équipement).",
  openSettings: "Ouvrir les réglages",
  requestTitle: "Votre demande",
  reviseTitle: "Modifier le menu",
  requestLabel: "Demande",
  reviseLabel: "Modification",
  requestPlaceholder: "ex. : un bœuf bourguignon, un plat végétarien, pas de poisson",
  revisePlaceholder: "ex. : remplace le plat c par un plat de poisson",
  requestEmpty: "Écrivez votre demande.",
  reviseEmpty: "Écrivez votre modification.",
  tooLong: "Le message est trop long : 2 000 caractères au plus.",
  compose: "Composer le menu",
  send: "Envoyer la modification",
  duration:
    "Un cycle peut durer plusieurs minutes : jusqu'à 3 essais d'environ 2 minutes chacun, sans annulation possible.",
  checking: "Vérification en cours",
  patience:
    "Cela peut prendre plusieurs minutes. Vous pouvez changer d'écran : le résultat s'affichera ici.",
  exchanges: "Échanges",
  exchangesOrder: "Du plus récent au plus ancien.",
  you: "Vous",
  claude: "Claude",
  firstNote: "Menu proposé.",
  nextNote: "Menu modifié.",
  menuTitle: "Menu courant",
  menuEmpty: "Le menu proposé s'affichera ici, avec ses constats.",
  menuSettings: "Les aliments à éviter et l'équipement des Réglages servent à chaque composition.",
  noDish: "Aucun plat dans ce menu : demandez une modification.",
  pinHelp:
    "Un plat épinglé ne peut pas être retiré par Claude. Quand Claude reconnaît un plat nommé dans votre demande, il l'épingle ; vérifiez les cases. Décochez « Épinglé » pour pouvoir retirer un plat.",
  avoidHelp: "Cliquez sur un ingrédient pour l'ajouter aux aliments à éviter.",
  sameDay: "Le soir même :",
  findings: "Constats",
  noFinding: "Aucun constat détecté.",
  interrupted: "Cycle interrompu",
  interruptedText: "Le cycle s'est arrêté avant la fin : voici le meilleur menu obtenu.",
  footer:
    "La validation du menu (détail des étapes, fiche PDF, historique) arrive dans la prochaine version.",
  reasonLabel: "Raison (facultative)",
  reasonPlaceholder: "ex. : n'aime pas",
  avoid: "Éviter",
} as const;
