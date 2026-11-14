import type { Detail, DetailStep } from "../../domain/detail.ts";
import type { ApplianceId } from "../../domain/menu.ts";

function step(
  id: string,
  phase: string,
  dishes: string[],
  text: string,
  minutes: number,
  appliance: ApplianceId,
  attended: boolean,
  after: string[] = [],
): DetailStep {
  return { id, phase, dishes, text, minutes, appliance, attended, after };
}

// Détail du menu de `balancedMenu()` : 13 étapes, une préparation partagée par d et e, un préchauffage, un appareil
// par cuisson, aucun appareil d'appoint. Il cite chaque ingrédient préparé d'avance par un repère, passe `checkDetail`
// sans constat et tient en 2 h 15. Données seulement, utilisées par les tests de contrôle.
export function balancedDetail(): Detail {
  const long = "Cuissons longues";
  const cuts = "Découpes";
  const cook = "Cuissons";
  return {
    steps: [
      step("s1", long, ["c"], "Préchauffer le four", 15, "oven", false),
      step("s2", long, ["c"], "Couper {c.1} et {c.2}", 15, "none", true),
      step("s3", long, ["c"], "Braiser au four", 120, "oven", false, ["s1", "s2"]),
      step("s4", cuts, ["d", "e"], "Éplucher et couper {d.2/e.1}", 20, "none", true),
      step("s5", cook, ["d"], "Cuire le dal avec {d.1}", 25, "thermomix", false, ["s4"]),
      step("s6", cuts, ["e"], "Couper {e.2}", 10, "none", true),
      step("s7", cook, ["e"], "Cuire la soupe", 30, "kenwood", false, ["s4", "s6"]),
      step("s8", cook, ["e"], "Mixer la soupe", 5, "none", true, ["s7"]),
      step("s9", cuts, ["b"], "Éplucher et couper {b.2} et {b.3}", 20, "none", true),
      step("s10", cook, ["b"], "Saisir {b.1}", 10, "induction", true, ["s9"]),
      step("s11", cook, ["b"], "Mijoter le poulet et les carottes", 40, "induction", false, [
        "s10",
      ]),
      step("s12", cuts, ["a"], "Laver et émincer {a.1}", 15, "none", true),
      step("s13", cook, ["a"], "Cuire la fondue de poireaux", 25, "induction", false, ["s12"]),
    ],
    evenings: [
      {
        dish: "a",
        text: "Cuire le riz et poêler le cabillaud encore surgelé, puis réchauffer la fondue de poireaux.",
      },
      { dish: "b", text: "Réchauffer à feu doux, avec un peu d'eau si la sauce a trop réduit." },
      { dish: "c", text: "Réchauffer au four ou à la casserole, à couvert." },
      { dish: "d", text: "Réchauffer le dal et servir avec un filet de citron." },
      {
        dish: "e",
        text: "Réchauffer la soupe en remuant, et la mixer à nouveau si elle a épaissi.",
      },
    ],
  };
}

// `balancedDetail()` avec une session de `total` minutes : la braise (étape s3) est sur le chemin le plus long,
// et le détail de référence dure 135 minutes.
export function balancedDetailLasting(total: number): Detail {
  const detail = balancedDetail();
  return {
    ...detail,
    steps: detail.steps.map((step) => (step.id === "s3" ? { ...step, minutes: total - 15 } : step)),
  };
}

// `balancedDetail()` avec une dépendance circulaire (s1 attend s3, qui attend s1) : aucun planning.
export function cyclicDetail(): Detail {
  const detail = balancedDetail();
  return {
    ...detail,
    steps: detail.steps.map((step) => (step.id === "s1" ? { ...step, after: ["s3"] } : step)),
  };
}

// Détail du menu de `autumnMenu()`, rédigé comme les fiches cuisine-addict : découpes et tailles, récipient, matière
// grasse par repère, feu, signe de cuisson, tas partagés ({b.2/c.2}, {d.1/e.1}), une chose à garder, 4 phases dont
// les étapes se suivent dans le planning (2 h 30). Il passe `checkDetail` sans constat. Données seulement, utilisées
// par les tests et par `pdf:fixture`.
export function autumnDetail(): Detail {
  const launch = "Lancer les cuissons longues";
  const chicken = "Poulet et découpes pendant la cuisson";
  const stews = "Plats en sauce et soupe";
  const finish = "Finitions et mixages";
  return {
    steps: [
      step(
        "s1",
        launch,
        ["c"],
        "**Préchauffer le four à 160 °C**, chaleur tournante.",
        15,
        "oven",
        false,
      ),
      step(
        "s2",
        launch,
        ["b", "c"],
        "Éplucher {b.2/c.2}, couper en rondelles de 1 cm, en 2 tas.",
        15,
        "none",
        true,
      ),
      step(
        "s3",
        launch,
        ["c"],
        "Couper {c.1} en cubes de 4 cm. Cocotte en fonte, {c.3}, feu vif : dorer la viande sur toutes les faces en remuant. Ajouter les carottes (c), de l'eau à hauteur, sel, poivre.",
        15,
        "induction",
        true,
        ["s2"],
      ),
      step(
        "s4",
        launch,
        ["c"],
        "Couvrir et enfourner : **four 160 °C, 2 h**, sans y toucher, jusqu'à ce que la viande soit fondante.",
        120,
        "oven",
        false,
        ["s1", "s3"],
      ),
      step(
        "s5",
        chicken,
        ["d", "e"],
        "Couper {d.1/e.1} en quartiers, épépiner, peler, puis tailler en cubes de 2 cm, en 2 tas.",
        20,
        "none",
        true,
      ),
      step("s6", stews, ["e"], "Éplucher {e.2}, couper en cubes de 2 cm.", 10, "none", true),
      step("s7", chicken, ["b"], "Ciseler {b.3}.", 5, "none", true),
      step(
        "s8",
        stews,
        ["a"],
        "Fendre {a.1} en deux, laver sous l'eau entre les feuilles, émincer finement.",
        15,
        "none",
        true,
      ),
      step(
        "s9",
        stews,
        ["e"],
        "Bol du Thermomix : les cubes de potiron (e) et le navet, eau à hauteur, sel. **Cuire 25 min, 100 °C, vitesse 1.**",
        25,
        "thermomix",
        false,
        ["s5", "s6"],
      ),
      step(
        "s10",
        stews,
        ["d"],
        "Cocotte, {d.3}, feu moyen : faire revenir les cubes de potiron (d) 5 min. Ajouter {d.2} rincées, 2 fois leur volume d'eau, {d.4}, sel. **Feu doux 20 min** en remuant de temps en temps, jusqu'à ce que les lentilles soient fondantes.",
        25,
        "induction",
        false,
        ["s5"],
      ),
      step(
        "s11",
        chicken,
        ["b"],
        "Sauteuse, {b.4}, feu vif : dorer {b.1} 5 min de chaque côté.",
        10,
        "induction",
        true,
        ["s7"],
      ),
      step(
        "s12",
        chicken,
        ["b"],
        "Ajouter l'oignon et les carottes (b), un verre d'eau, sel, poivre. Couvrir, **feu doux 40 min**, en remuant de temps en temps.",
        40,
        "induction",
        false,
        ["s2", "s11"],
      ),
      step(
        "s13",
        stews,
        ["a"],
        "Poêle, {a.4}, feu moyen : faire fondre les poireaux en remuant, puis couvrir, **feu doux 20 min**, jusqu'à ce qu'ils soient tendres.",
        25,
        "induction",
        false,
        ["s8"],
      ),
      step(
        "s14",
        finish,
        ["e"],
        "Prélever 1 louche du bouillon de la soupe : **la garder pour le dal (d)**, à ajouter au réchauffage. Mixer la soupe 1 min en montant à vitesse 10, rectifier le sel.",
        2,
        "thermomix",
        true,
        ["s9"],
      ),
    ],
    evenings: [
      {
        dish: "a",
        text: "Cuire le riz 20 min à l'eau bouillante salée. Poêler le cabillaud encore surgelé, feu moyen, 6 min de chaque côté. Réchauffer la fondue à feu doux.",
      },
      { dish: "b", text: "Casserole à feu doux, 10 min, avec un peu d'eau si la sauce a réduit." },
      { dish: "c", text: "Four 160 °C, 20 min, à couvert. Servir avec du pain." },
      {
        dish: "d",
        text: "Casserole à feu doux avec la louche de bouillon gardée ; un filet de citron.",
      },
      { dish: "e", text: "Réchauffer à feu doux en remuant ; mixer à nouveau si elle a épaissi." },
    ],
  };
}

// `autumnDetail()` avec une session de `total` minutes : la braise (étape s4) est sur le chemin le plus long, qui
// dure 150 minutes dans le détail d'automne.
export function autumnDetailLasting(total: number): Detail {
  const detail = autumnDetail();
  return {
    ...detail,
    steps: detail.steps.map((step) => (step.id === "s4" ? { ...step, minutes: total - 30 } : step)),
  };
}

// `autumnDetail()` avec une dépendance circulaire (s1 attend s4, qui attend s1) : aucun planning.
export function autumnCyclicDetail(): Detail {
  const detail = autumnDetail();
  return {
    ...detail,
    steps: detail.steps.map((step) => (step.id === "s1" ? { ...step, after: ["s4"] } : step)),
  };
}
