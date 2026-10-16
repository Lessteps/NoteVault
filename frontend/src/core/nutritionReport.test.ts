import { describe, expect, it } from "vitest";
import { generateNutritionMarkdownReport, generateNutritionCsvData } from "./nutritionReport";
import type { NutriTrendsData, NutriProfile } from "../lib/nutritionTypes";

describe("nutritionReport", () => {
  const sampleTrends: NutriTrendsData = {
    daysCount: 7,
    startDate: "2026-10-10",
    endDate: "2026-10-16",
    days: [
      {
        date: "2026-10-16",
        dayLabel: "Vie 16",
        calories: 2150,
        protein: 155,
        carbs: 230,
        fat: 60,
        water_ml: 2500,
        targetCalories: 2200,
        targetProtein: 150,
        adherence: "compliant",
        itemsCount: 4,
      },
    ],
    averages: {
      caloriesPerDay: 2150,
      proteinPerDay: 155,
      carbsPerDay: 230,
      fatPerDay: 60,
      waterMlPerDay: 2500,
    },
    targets: {
      calories: 2200,
      protein_g: 150,
      carbs_g: 240,
      fat_g: 65,
      water_ml: 2500,
      meal_distribution: {
        desayuno: 25,
        almuerzo: 35,
        merienda: 15,
        cena: 20,
        snacks: 5,
      },
    },
    adherence: {
      loggedDays: 1,
      compliantDays: 1,
      totalDays: 7,
      compliancePct: 100,
    },
    topFoods: [
      { name: "Pechuga de pollo", count: 3, totalAmount: 600, totalCalories: 990, totalProtein: 186, unit: "g" },
    ],
  };

  const sampleProfile: NutriProfile = {
    weight: 78.5,
    goal: "perdida_grasa",
    goal_note: "Déficit calórico",
    dietary_restrictions: "Intolerancia a la lactosa",
  };

  it("genera un reporte en Markdown con tablas y métricas completas", () => {
    const md = generateNutritionMarkdownReport(sampleTrends, sampleProfile);
    expect(md).toContain("# Reporte Nutricional — NoteVault");
    expect(md).toContain("78.5 kg");
    expect(md).toContain("Intolerancia a la lactosa");
    expect(md).toContain("2150 kcal");
    expect(md).toContain("Pechuga de pollo");
    expect(md).toContain("Distribución por Turnos");
    expect(md).toContain("Almuerzo | 35%");
  });

  it("genera las filas y encabezados CSV para hojas de cálculo", () => {
    const csv = generateNutritionCsvData(sampleTrends);
    expect(csv.header).toContain("Calorias");
    expect(csv.header).toContain("Proteinas_g");
    expect(csv.rows).toHaveLength(1);
    expect(csv.rows[0]![0]).toBe("2026-10-16");
    expect(csv.rows[0]![2]).toBe(2150);
  });
});
