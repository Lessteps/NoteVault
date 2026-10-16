import { beforeEach, describe, expect, it, vi } from "vitest";

const mockApi = vi.hoisted(() => ({
  nutriDaySummary: vi.fn(),
  nutriItemAdd: vi.fn(),
  nutriItemUpdate: vi.fn(),
  nutriItemDelete: vi.fn(),
  nutriWaterSet: vi.fn(),
  nutriFoodsList: vi.fn(),
  nutriFoodSave: vi.fn(),
  nutriFoodDelete: vi.fn(),
  nutriSettingsGet: vi.fn(),
  nutriSettingsSave: vi.fn(),
  nutriSuggestTargets: vi.fn(),
  nutriProfileGet: vi.fn(),
  nutriProfileSave: vi.fn(),
  nutriMealCopy: vi.fn(),
  nutriDayCopy: vi.fn(),
  nutriTrends: vi.fn(),
  nutriRecipesList: vi.fn(),
  nutriRecipeSave: vi.fn(),
  nutriRecipeDelete: vi.fn(),
  nutriRecipeConsume: vi.fn(),
  nutriEstimateDish: vi.fn(),
  nutriScanLabel: vi.fn(),
}));

vi.mock("../lib/bridge", () => ({
  api: mockApi,
}));

import { useNutrition } from "./nutrition";
import type { NutriDaySummary } from "../lib/nutritionTypes";

function sampleSummary(date = "2026-10-16"): NutriDaySummary {
  return {
    date,
    log: {
      date,
      meals: {
        desayuno: [],
        almuerzo: [],
        merienda: [],
        cena: [],
        snacks: [],
      },
      water_ml: 1000,
    },
    targets: {
      calories: 2200,
      protein_g: 150,
      carbs_g: 240,
      fat_g: 65,
      water_ml: 2500,
    },
    totals: {
      calories: 450,
      protein: 35,
      carbs: 45,
      fat: 12,
      water_ml: 1000,
    },
    byMeal: {
      desayuno: { calories: 450, protein: 35, carbs: 45, fat: 12, itemsCount: 1 },
      almuerzo: { calories: 0, protein: 0, carbs: 0, fat: 0, itemsCount: 0 },
      merienda: { calories: 0, protein: 0, carbs: 0, fat: 0, itemsCount: 0 },
      cena: { calories: 0, protein: 0, carbs: 0, fat: 0, itemsCount: 0 },
      snacks: { calories: 0, protein: 0, carbs: 0, fat: 0, itemsCount: 0 },
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  useNutrition.setState({
    selectedDate: "2026-10-16",
    summary: null,
    foods: [],
    targets: null,
    activeTab: "diario",
    loading: false,
    error: null,
    addingMeal: null,
    settingsOpen: false,
    editingFood: null,
  });
});

describe("useNutrition store", () => {
  it("inicia con fecha seleccionada y pestaña diario", () => {
    const s = useNutrition.getState();
    expect(s.selectedDate).toBe("2026-10-16");
    expect(s.activeTab).toBe("diario");
    expect(s.summary).toBeNull();
  });

  it("navega días adelante y atrás", async () => {
    mockApi.nutriDaySummary.mockResolvedValue(sampleSummary("2026-10-17"));

    await useNutrition.getState().nextDay();
    expect(useNutrition.getState().selectedDate).toBe("2026-10-17");

    mockApi.nutriDaySummary.mockResolvedValue(sampleSummary("2026-10-16"));
    await useNutrition.getState().prevDay();
    expect(useNutrition.getState().selectedDate).toBe("2026-10-16");
  });

  it("carga el resumen del día llamando a la API", async () => {
    const mockData = sampleSummary("2026-10-16");
    mockApi.nutriDaySummary.mockResolvedValue(mockData);

    await useNutrition.getState().loadDay("2026-10-16");

    const s = useNutrition.getState();
    expect(s.summary).toEqual(mockData);
    expect(s.targets).toEqual(mockData.targets);
    expect(s.loading).toBe(false);
  });

  it("añade, actualiza y elimina alimentos de una comida", async () => {
    const updated = sampleSummary("2026-10-16");
    mockApi.nutriItemAdd.mockResolvedValue(updated);
    mockApi.nutriItemUpdate.mockResolvedValue(updated);
    mockApi.nutriItemDelete.mockResolvedValue(updated);

    await useNutrition.getState().addFoodToMeal("desayuno", { name: "Avena", calories: 150 });
    expect(mockApi.nutriItemAdd).toHaveBeenCalledWith("2026-10-16", "desayuno", { name: "Avena", calories: 150 });
    expect(useNutrition.getState().summary).toEqual(updated);

    await useNutrition.getState().updateFoodInMeal("desayuno", "item1", { calories: 200 });
    expect(mockApi.nutriItemUpdate).toHaveBeenCalledWith("2026-10-16", "desayuno", "item1", { calories: 200 });

    await useNutrition.getState().removeFoodFromMeal("desayuno", "item1");
    expect(mockApi.nutriItemDelete).toHaveBeenCalledWith("2026-10-16", "desayuno", "item1");
  });

  it("actualiza el agua del día", async () => {
    const updated = sampleSummary("2026-10-16");
    updated.totals.water_ml = 2000;
    mockApi.nutriWaterSet.mockResolvedValue(updated);

    await useNutrition.getState().setWater(2000);
    expect(mockApi.nutriWaterSet).toHaveBeenCalledWith("2026-10-16", 2000);
    expect(useNutrition.getState().summary?.totals.water_ml).toBe(2000);
  });

  it("gestiona la despensa de alimentos", async () => {
    mockApi.nutriFoodSave.mockResolvedValue({ id: "f1", name: "Pollo" });
    mockApi.nutriFoodsList.mockResolvedValue({ foods: [{ id: "f1", name: "Pollo" }] });
    mockApi.nutriFoodDelete.mockResolvedValue({ ok: true });

    await useNutrition.getState().saveFoodToLibrary({ name: "Pollo" });
    expect(mockApi.nutriFoodSave).toHaveBeenCalled();
    expect(useNutrition.getState().foods).toEqual([{ id: "f1", name: "Pollo" }]);

    await useNutrition.getState().deleteFoodFromLibrary("f1");
    expect(mockApi.nutriFoodDelete).toHaveBeenCalledWith("f1");
  });

  it("guarda metas nutricionales y aplica sugerencias fisiológicas de Ejercicio", async () => {
    const newTargets = { calories: 2400, protein_g: 170, carbs_g: 260, fat_g: 70, water_ml: 2800 };
    mockApi.nutriSettingsSave.mockResolvedValue(newTargets);

    await useNutrition.getState().saveTargets(newTargets);
    expect(useNutrition.getState().targets).toEqual(newTargets);

    mockApi.nutriSuggestTargets.mockResolvedValue({
      suggested: newTargets,
      profileData: { weight: 80, goal: "hipertrofia", gender: "hombre", age: 25 },
    });

    const res = await useNutrition.getState().applySuggestedTargets();
    expect(res).toEqual({ weight: 80, goal: "hipertrofia" });
  });

  it("carga y guarda el perfil nutricional (peso, objetivo, restricciones)", async () => {
    const mockProfile = {
      weight: 79.2,
      goal: "definicion",
      goal_note: "Mantener masa muscular",
      dietary_restrictions: "Lactosa, picante",
      gender: "hombre" as const,
      age: 28,
    };

    mockApi.nutriProfileGet.mockResolvedValueOnce(mockProfile);
    mockApi.nutriProfileSave.mockResolvedValueOnce(mockProfile);

    await useNutrition.getState().loadProfile();
    expect(mockApi.nutriProfileGet).toHaveBeenCalled();
    expect(useNutrition.getState().profile).toEqual(mockProfile);

    await useNutrition.getState().saveProfile({ weight: 79.2, goal: "definicion" });
    expect(mockApi.nutriProfileSave).toHaveBeenCalledWith({ weight: 79.2, goal: "definicion" });
    expect(useNutrition.getState().profile?.weight).toBe(79.2);
  });

  it("controla apertura y cierre de modales auxiliares", () => {
    const s = useNutrition.getState();
    s.openAddMeal("cena");
    expect(useNutrition.getState().addingMeal).toBe("cena");

    s.closeAddMeal();
    expect(useNutrition.getState().addingMeal).toBeNull();

    s.setSettingsOpen(true);
    expect(useNutrition.getState().settingsOpen).toBe(true);
  });

  it("permite copiar un turno de comida o el día completo desde ayer", async () => {
    const updated = sampleSummary("2026-10-16");
    updated.log.meals.desayuno.push({
      id: "c1",
      name: "Tostadas con queso",
      amount: 2,
      unit: "rebanadas",
      calories: 180,
      protein: 8,
      carbs: 25,
      fat: 5,
    });
    mockApi.nutriMealCopy.mockResolvedValue(updated);
    mockApi.nutriDayCopy.mockResolvedValue(updated);

    const resMeal = await useNutrition.getState().copyMealFromYesterday("desayuno");
    expect(mockApi.nutriMealCopy).toHaveBeenCalledWith("2026-10-15", "2026-10-16", "desayuno");
    expect(resMeal).toBe(true);

    const resDay = await useNutrition.getState().copyEntireDayFromYesterday();
    expect(mockApi.nutriDayCopy).toHaveBeenCalledWith("2026-10-15", "2026-10-16");
    expect(resDay).toBe(true);
  });

  it("quickConsumeFood añade una porción directamente desde la despensa", async () => {
    const updated = sampleSummary("2026-10-16");
    mockApi.nutriItemAdd.mockResolvedValue(updated);

    const food = {
      id: "fd1",
      name: "Yogur Griego",
      serving_size: 150,
      serving_unit: "g",
      calories: 140,
      protein: 15,
      carbs: 6,
      fat: 5,
    };

    await useNutrition.getState().quickConsumeFood(food, "merienda", 1);
    expect(mockApi.nutriItemAdd).toHaveBeenCalledWith("2026-10-16", "merienda", expect.objectContaining({
      name: "Yogur Griego",
      amount: 150,
      unit: "g",
      calories: 140,
      protein: 15,
    }));
  });

  it("carga tendencias semanales y ajusta el rango de días", async () => {
    const mockTrends = {
      daysCount: 7,
      startDate: "2026-10-10",
      endDate: "2026-10-16",
      days: [],
      averages: { caloriesPerDay: 2180, proteinPerDay: 145, carbsPerDay: 240, fatPerDay: 65, waterMlPerDay: 2200 },
      targets: { calories: 2200, protein_g: 150, carbs_g: 240, fat_g: 65, water_ml: 2500 },
      adherence: { loggedDays: 5, compliantDays: 4, totalDays: 7, compliancePct: 80 },
      topFoods: [{ name: "Pechuga de pollo", count: 5, totalAmount: 1000, totalCalories: 1650, totalProtein: 310, unit: "g" }],
    };

    mockApi.nutriTrends.mockResolvedValueOnce(mockTrends);

    await useNutrition.getState().loadTrends(7);
    expect(mockApi.nutriTrends).toHaveBeenCalledWith(7, "2026-10-16");
    expect(useNutrition.getState().trends).toEqual(mockTrends);
    expect(useNutrition.getState().trendsDays).toBe(7);

    mockApi.nutriTrends.mockResolvedValueOnce({ ...mockTrends, daysCount: 14 });
    await useNutrition.getState().setTrendsDays(14);
    expect(mockApi.nutriTrends).toHaveBeenCalledWith(14, "2026-10-16");
    expect(useNutrition.getState().trendsDays).toBe(14);
  });

  it("gestiona recetas en el store (loadRecipes, saveRecipe, deleteRecipe y quickConsumeRecipe)", async () => {
    const mockRecipes = [
      {
        id: "rcp1",
        name: "Bowl Avena y Whey",
        servings: 1,
        ingredients: [],
        total_calories: 350,
        total_protein: 30,
        total_carbs: 40,
        total_fat: 5,
        per_serving: { calories: 350, protein: 30, carbs: 40, fat: 5 },
      },
    ];

    mockApi.nutriRecipesList.mockResolvedValue({ recipes: mockRecipes });
    await useNutrition.getState().loadRecipes();
    expect(useNutrition.getState().recipes).toHaveLength(1);

    mockApi.nutriRecipeSave.mockResolvedValue(mockRecipes[0]);
    await useNutrition.getState().saveRecipe({ name: "Bowl Avena y Whey" });
    expect(mockApi.nutriRecipeSave).toHaveBeenCalled();

    const updatedSummary = sampleSummary("2026-10-16");
    mockApi.nutriRecipeConsume.mockResolvedValue(updatedSummary);
    await useNutrition.getState().quickConsumeRecipe("rcp1", "desayuno", 1.5);
    expect(mockApi.nutriRecipeConsume).toHaveBeenCalledWith("2026-10-16", "desayuno", "rcp1", 1.5);
    expect(useNutrition.getState().summary).toEqual(updatedSummary);

    mockApi.nutriRecipeDelete.mockResolvedValue({ ok: true });
    await useNutrition.getState().deleteRecipe("rcp1");
    expect(mockApi.nutriRecipeDelete).toHaveBeenCalledWith("rcp1");
  });

  it("estimateDish delega la llamada a api.nutriEstimateDish", async () => {
    const mockRes = {
      dish_name: "Milanesa de pollo con puré",
      confidence: "alta" as const,
      summary: "Porción estándar",
      total_calories: 650,
      total_protein: 38,
      total_carbs: 55,
      total_fat: 24,
      ingredients: [],
    };
    mockApi.nutriEstimateDish.mockResolvedValue(mockRes);

    const res = await useNutrition.getState().estimateDish("Milanesa de pollo con puré");
    expect(mockApi.nutriEstimateDish).toHaveBeenCalledWith("Milanesa de pollo con puré");
    expect(res.total_calories).toBe(650);
  });

  it("scanNutritionLabel delega la llamada a api.nutriScanLabel", async () => {
    const mockLabel = {
      product_name: "Yogur Griego",
      serving_size: 150,
      serving_unit: "g",
      calories: 130,
      protein: 15,
      carbs: 6,
      fat: 5,
    };
    mockApi.nutriScanLabel.mockResolvedValue(mockLabel);

    const res = await useNutrition.getState().scanNutritionLabel("data:image/jpeg;base64,1234");
    expect(mockApi.nutriScanLabel).toHaveBeenCalledWith("data:image/jpeg;base64,1234");
    expect(res.product_name).toBe("Yogur Griego");
    expect(res.calories).toBe(130);
  });
});
