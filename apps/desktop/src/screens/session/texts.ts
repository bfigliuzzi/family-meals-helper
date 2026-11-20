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
  restartAskValidation:
    "Recommencer la session ? La conversation, le menu courant, les épingles et la validation en cours seront effacés. Les réglages et l'historique ne changent pas.",
  erase: "Effacer",
  cancel: "Annuler",
  dayLabel: "Jour de la session de cuisine",
  dayChanged: "Jour changé : pris en compte au prochain message et à la validation.",
  dinnersLabel: "Nombre de dîners",
  dinnersHint:
    "Seul ce champ fixe le nombre de dîners (1 à 5) ; un nombre écrit dans la demande ne compte pas.",
  dinnersChanged: "Nombre changé : pris en compte au prochain message et à la validation.",
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
    "Un cycle peut durer plusieurs minutes : jusqu'à 3 essais d'environ 4 minutes chacun, sans annulation possible.",
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
  reasonLabel: "Raison (facultative)",
  reasonPlaceholder: "ex. : n'aime pas",
  avoid: "Éviter",
} as const;

export const VALIDATE_TEXTS = {
  button: "Valider ce menu",
  help: "La validation contrôle le menu avec vos réglages, le jour et le nombre de dîners affichés. Claude rédige ensuite le détail des étapes (1 à 3 appels, quelques minutes, sans annulation possible), puis l'app prépare la fiche PDF et l'ajoute à l'historique.",
  blockedTitle: "Validation impossible",
  blockedIntro: "Le menu ne passe plus le contrôle :",
  blockedFix:
    "Si vous avez changé le jour, le nombre de dîners ou les Réglages, remettez-les comme pour ce menu et validez à nouveau, sans appel à Claude. Sinon, demandez une modification.",
  writeChange: "Écrire une modification",
  settingsNotReady: "Les réglages ne sont pas encore chargés : réessayez dans un instant.",
  titles: {
    detail: "Validation en cours",
    tooLong: "Session de plus de 3 h",
    fallback: "Détail des étapes inutilisable",
    save: "Préparation de la fiche",
    saveFailed: "Fiche non enregistrée",
    saved: "Menu validé",
  },
  writing: "Rédaction du détail",
  writingFirst:
    "Claude rédige les étapes de la session et ce qu'il reste à faire chaque soir, puis l'app recalcule le planning.",
  writingNext: "Claude corrige les étapes de l'essai précédent.",
  detailPatience:
    "Cela peut prendre plusieurs minutes, sans annulation possible. Vous pouvez changer d'écran : le résultat s'affichera ici.",
  preparing: "Préparation de la fiche PDF…",
  preparingHint: "La fenêtre peut se figer une seconde.",
  keep: "Garder la fiche",
  keepPhases: "Garder la fiche des grandes phases",
  back: "Revenir au menu",
  retry: "Réessayer",
  newSession: "Commencer une nouvelle session",
  keepFree: "gratuit. La fiche porte un avertissement.",
  keepPhasesFree: "gratuit.",
  backTooLong:
    "gratuit tout de suite, pour remplacer ce plat. Le détail rédigé est abandonné, et la prochaine validation le fera rédiger de nouveau (1 à 3 appels payés).",
  backFallback:
    "gratuit tout de suite ; la prochaine validation fera rédiger le détail de nouveau (1 à 3 appels payés).",
  fallbackExplain:
    "La fiche peut quand même être produite avec les grandes phases du menu, sans quantités à chaque étape ni consigne du soir rédigée.",
  saveFailedKept:
    "Le détail rédigé par Claude est gardé : « Réessayer » refait seulement la fiche et son enregistrement, sans nouvel appel.",
  saveFailedBack: "Revenir au menu abandonne le détail rédigé.",
  savedOk: "Menu enregistré dans l'historique. La fiche s'ouvre dans Aperçu.",
  savedBackHelp:
    "Revenir au menu garde la conversation : une nouvelle validation ajoutera un autre menu à l'historique.",
  warningTooLong: "La fiche porte un avertissement : session de plus de 3 h.",
  warningFallback:
    "La fiche porte un avertissement : grandes phases seulement, sans détail des étapes.",
} as const;

export function detailAttemptText(attempt: number): string {
  return `Essai ${String(attempt)} sur 3 : ${attempt === 1 ? VALIDATE_TEXTS.writingFirst : VALIDATE_TEXTS.writingNext}`;
}

// Le texte sans espaces autour, avec un point final s'il n'en a pas déjà un (`.`, `!`, `?` ou `…`, même suivi de
// guillemets ou d'une parenthèse fermante). Vide reste vide : jamais un point seul.
export function endSentence(text: string): string {
  const trimmed = text.trim();
  if (trimmed === "") return "";
  return /[.!?…][»"”)\s]*$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

export function savedOpenErrorText(openError: string): string {
  const base = "Menu enregistré dans l'historique, mais Aperçu n'a pas ouvert la fiche";
  const phrase = endSentence(printable(openError));
  // Sans phrase lisible (message vide après nettoyage) : pas de « : » seul, la consigne reste.
  const reason = phrase === "" ? "." : ` : ${phrase}`;
  return `${base}${reason} « Ouvrir la fiche » réessaie, sans nouvel appel.`;
}
