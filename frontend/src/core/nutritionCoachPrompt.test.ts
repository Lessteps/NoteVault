import { describe, expect, it } from "vitest";
import { buildNutritionCoachSystemPrompt } from "./nutritionCoachPrompt";

describe("buildNutritionCoachSystemPrompt", () => {
  it("construye un system prompt completo con contexto de macros, comidas y ejercicio", () => {
    const prompt = buildNutritionCoachSystemPrompt({
      date: "2026-10-16",
      summary: {
        date: "2026-10-16",
        log: {
          date: "2026-10-16",
          meals: {
            desayuno: [
              {
                id: "i1",
                name: "Huevos revueltos",
                amount: 3,
                unit: "huevos",
                calories: 216,
                protein: 18.9,
                carbs: 1.2,
                fat: 14.4,
              },
            ],
            almuerzo: [],
            merienda: [],
            cena: [],
            snacks: [],
          },
          water_ml: 1500,
        },
        targets: {
          calories: 2200,
          protein_g: 150,
          carbs_g: 240,
          fat_g: 65,
          water_ml: 2500,
        },
        totals: {
          calories: 216,
          protein: 18.9,
          carbs: 1.2,
          fat: 14.4,
          water_ml: 1500,
        },
        byMeal: {
          desayuno: { calories: 216, protein: 18.9, carbs: 1.2, fat: 14.4, itemsCount: 1 },
          almuerzo: { calories: 0, protein: 0, carbs: 0, fat: 0, itemsCount: 0 },
          merienda: { calories: 0, protein: 0, carbs: 0, fat: 0, itemsCount: 0 },
          cena: { calories: 0, protein: 0, carbs: 0, fat: 0, itemsCount: 0 },
          snacks: { calories: 0, protein: 0, carbs: 0, fat: 0, itemsCount: 0 },
        },
      },
      targets: {
        calories: 2200,
        protein_g: 150,
        carbs_g: 240,
        fat_g: 65,
        water_ml: 2500,
      },
      foodsSummary: ["Pechuga de pollo (100g = 165 kcal, 31g P)", "Arroz blanco (100g = 130 kcal)"],
      exerciseProfile: {
        goal: "hipertrofia",
        goal_note: "Prioridad torso",
        weight: 81.5,
        gender: "hombre",
        age: 27,
      },
    });

    expect(prompt).toContain("Asesor Nutricional IA de NoteVault");
    expect(prompt).toContain("2200 kcal");
    expect(prompt).toContain("150g");
    expect(prompt).toContain("Huevos revueltos");
    expect(prompt).toContain("Pechuga de pollo");
    expect(prompt).toContain("81.5 kg");
    expect(prompt).toContain("hipertrofia");
    expect(prompt).toContain("nutrition-action");
  });
});
