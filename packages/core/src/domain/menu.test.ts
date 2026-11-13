import { describe, expect, it } from "vitest";
import {
  AISLES,
  AISLE_LABELS,
  CATEGORIES,
  CATEGORY_LABELS,
  FORMS,
  FORM_LABELS,
} from "./ingredient.ts";
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
    for (const aisle of AISLES) expect(AISLE_LABELS[aisle]).toBeTruthy();
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
