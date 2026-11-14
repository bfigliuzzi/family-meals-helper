import { describe, expect, it } from "vitest";
import { CATEGORIES, CATEGORY_LABELS, FORMS, FORM_LABELS } from "./ingredient.ts";
import {
  DAYS,
  DAY_LABELS,
  MenuSchema,
  SESSION_DAYS,
  SESSION_DAY_LABELS,
  daysAfterSession,
} from "./menu.ts";

const validMenu = {
  dishes: [
    {
      name: "Bœuf bourguignon",
      day: "mon",
      ingredients: [
        {
          name: "bœuf à braiser",
          qty: 800,
          unit: "g",
          form: "fresh",
          category: null,
          sameDay: false,
        },
        {
          name: "romanesco",
          qty: 1,
          unit: "piece",
          form: "fresh",
          category: "vegetable",
          sameDay: true,
        },
      ],
      phases: [
        {
          id: "a1",
          description: "Faire revenir les oignons",
          minutes: 15,
          appliance: "induction",
          attended: true,
          after: [],
        },
        {
          id: "a2",
          description: "Mijoter",
          minutes: 120,
          appliance: "oven",
          attended: false,
          after: ["a1"],
        },
      ],
    },
  ],
};

describe("MenuSchema", () => {
  it("accepte un menu valide, avec une catégorie nulle", () => {
    expect(MenuSchema.safeParse(validMenu).success).toBe(true);
  });

  it("refuse un jour hors liste", () => {
    const menu = structuredClone(validMenu);
    menu.dishes[0]!.day = "sat";
    expect(MenuSchema.safeParse(menu).success).toBe(false);
  });

  it("refuse une unité inconnue", () => {
    const menu = structuredClone(validMenu);
    menu.dishes[0]!.ingredients[0]!.unit = "kg";
    expect(MenuSchema.safeParse(menu).success).toBe(false);
  });

  it("accepte un plat avec des phases", () => {
    const parsed = MenuSchema.safeParse(validMenu);
    expect(parsed.success && parsed.data.dishes[0]?.phases).toHaveLength(2);
  });

  it("refuse un appareil hors de la liste", () => {
    const menu = structuredClone(validMenu);
    menu.dishes[0]!.phases[0]!.appliance = "microwave";
    expect(MenuSchema.safeParse(menu).success).toBe(false);
  });

  it("refuse un plat sans phases", () => {
    const dish: Partial<(typeof validMenu.dishes)[number]> = structuredClone(validMenu.dishes[0]!);
    delete dish.phases;
    expect(MenuSchema.safeParse({ dishes: [dish] }).success).toBe(false);
  });

  it("accepte une durée décimale : la borne est dans le contrôle métier", () => {
    const menu = structuredClone(validMenu);
    menu.dishes[0]!.phases[0]!.minutes = 2.5;
    expect(MenuSchema.safeParse(menu).success).toBe(true);
  });

  it("refuse une catégorie hors liste", () => {
    const menu = structuredClone(validMenu);
    menu.dishes[0]!.ingredients[1]!.category = "legume";
    expect(MenuSchema.safeParse(menu).success).toBe(false);
  });
});

describe("libellés", () => {
  it("couvrent toutes les valeurs", () => {
    for (const category of CATEGORIES) expect(CATEGORY_LABELS[category]).toBeTruthy();
    for (const form of FORMS) expect(FORM_LABELS[form]).toBeTruthy();
    for (const day of DAYS) expect(DAY_LABELS[day]).toBeTruthy();
    for (const day of SESSION_DAYS) expect(SESSION_DAY_LABELS[day]).toBeTruthy();
  });
});

describe("daysAfterSession", () => {
  it.each([
    ["sun", 1, 5],
    ["sat", 2, 6],
    ["fri", 3, 7],
    ["mon", 0, 4],
  ] as const)("session %s : lundi %i, vendredi %i", (session, monday, friday) => {
    expect(daysAfterSession(session, "mon")).toBe(monday);
    expect(daysAfterSession(session, "fri")).toBe(friday);
  });
});
