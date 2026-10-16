import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ApiError } from "../../core/errors.js";
import { AppState } from "../appState.js";
import { nutritionApi } from "./nutrition.js";

describe("nutritionApi", () => {
  let tmpDir: string;
  let app: AppState;
  let api: ReturnType<typeof nutritionApi>;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "nv-nutrition-api-test-"));
    app = new AppState(tmpDir);
    api = nutritionApi(app);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("nutri_day y nutri_day_summary devuelven estructura limpia para un día nuevo", () => {
    const day = api.nutri_day("2026-10-16");
    expect(day.date).toBe("2026-10-16");
    expect(day.meals.desayuno).toEqual([]);
    expect(day.water_ml).toBe(0);

    const summary = api.nutri_day_summary("2026-10-16");
    expect(summary.date).toBe("2026-10-16");
    expect(summary.totals.calories).toBe(0);
    expect(summary.targets.calories).toBeGreaterThan(1500);
  });

  it("nutri_item_add agrega un alimento y recalcula los totales inmediatamente", () => {
    const s1 = api.nutri_item_add("2026-10-16", "desayuno", {
      name: "Omelette de claras",
      amount: 1,
      unit: "porción",
      calories: 120,
      protein: 24,
      carbs: 2,
      fat: 1,
    });

    expect(s1.totals.calories).toBe(120);
    expect(s1.totals.protein).toBe(24);
    expect(s1.byMeal.desayuno.itemsCount).toBe(1);

    // Validación de errores
    expect(() => api.nutri_item_add("2026-10-16", "desayuno", { name: "" })).toThrow(ApiError);
    expect(() => api.nutri_item_add("2026-10-16", "comida_invalida" as any, { name: "Pan" })).toThrow(ApiError);
  });

  it("nutri_item_update y nutri_item_delete gestionan los alimentos de cada turno", () => {
    const s1 = api.nutri_item_add("2026-10-16", "almuerzo", {
      name: "Bowl de atún",
      amount: 1,
      calories: 350,
      protein: 30,
      carbs: 40,
      fat: 5,
    });

    const item = s1.log.meals.almuerzo[0]!;

    const s2 = api.nutri_item_update("2026-10-16", "almuerzo", item.id, {
      calories: 400,
      protein: 35,
    });
    expect(s2.totals.calories).toBe(400);
    expect(s2.totals.protein).toBe(35);

    const s3 = api.nutri_item_delete("2026-10-16", "almuerzo", item.id);
    expect(s3.totals.calories).toBe(0);
    expect(s3.byMeal.almuerzo.itemsCount).toBe(0);
  });

  it("nutri_water_set actualiza los mililitros de agua", () => {
    const s = api.nutri_water_set("2026-10-16", 2000);
    expect(s.totals.water_ml).toBe(2000);
  });

  it("nutri_foods_list, nutri_food_save y nutri_food_delete manejan la despensa", () => {
    const initial = api.nutri_foods_list();
    expect(initial.foods.length).toBeGreaterThan(0);

    const saved = api.nutri_food_save({
      name: "Barra de cereal proteica",
      serving_size: 45,
      serving_unit: "barra (45g)",
      calories: 180,
      protein: 15,
      carbs: 20,
      fat: 4,
      category: "Snacks",
    });

    expect(saved.id).toBeTruthy();
    expect(saved.name).toBe("Barra de cereal proteica");

    const del = api.nutri_food_delete(saved.id);
    expect(del.ok).toBe(true);
    expect(() => api.nutri_food_delete("no-existe")).toThrow(ApiError);
  });

  it("nutri_settings_get y nutri_settings_save gestionan las metas diarias", () => {
    const initial = api.nutri_settings_get();
    expect(initial.calories).toBeDefined();

    const updated = api.nutri_settings_save({
      calories: 2600,
      protein_g: 175,
      carbs_g: 300,
      fat_g: 75,
      water_ml: 3200,
      auto_calculate: true,
    });

    expect(updated.calories).toBe(2600);
    expect(updated.protein_g).toBe(175);
    expect(updated.auto_calculate).toBe(true);
  });

  it("nutri_suggest_targets deriva metas recomendadas a partir del perfil de Ejercicio", () => {
    // Simulamos un perfil con peso en Ejercicio
    const exMgr = app.mgrs().exercise;
    exMgr.saveProfile({ goal: "hipertrofia", age: 26, gender: "hombre" });
    exMgr.addWeightEntry("2026-10-10", 82.5);

    const res = api.nutri_suggest_targets();
    expect(res.profileData.weight).toBe(82.5);
    expect(res.profileData.goal).toBe("hipertrofia");
    expect(res.suggested.calories).toBeGreaterThan(2400);
    expect(res.suggested.protein_g).toBe(165); // 82.5 * 2.0 = 165
  });

  it("nutri_meal_copy copia los alimentos de un turno de otro día", () => {
    api.nutri_item_add("2026-10-15", "desayuno", {
      name: "Tostadas con palta y huevo",
      calories: 320,
      protein: 14,
    });

    const targetSummary = api.nutri_meal_copy("2026-10-15", "2026-10-16", "desayuno");
    expect(targetSummary.log.meals.desayuno).toHaveLength(1);
    expect(targetSummary.log.meals.desayuno[0]!.name).toBe("Tostadas con palta y huevo");
    expect(targetSummary.totals.calories).toBe(320);
  });

  it("nutri_day_copy copia el día completo y agua", () => {
    api.nutri_item_add("2026-10-15", "almuerzo", { name: "Bife con ensalada", calories: 450 });
    api.nutri_water_set("2026-10-15", 2500);

    const targetSummary = api.nutri_day_copy("2026-10-15", "2026-10-16");
    expect(targetSummary.log.meals.almuerzo).toHaveLength(1);
    expect(targetSummary.totals.water_ml).toBe(2500);
  });

  it("nutri_trends devuelve promedios, días y ranking de alimentos", () => {
    api.nutri_item_add("2026-10-15", "almuerzo", { name: "Pechuga de pollo", amount: 200, calories: 330, protein: 62 });
    api.nutri_item_add("2026-10-16", "almuerzo", { name: "Pechuga de pollo", amount: 250, calories: 400, protein: 75 });

    const trends = api.nutri_trends(7, "2026-10-16");
    expect(trends.daysCount).toBe(7);
    expect(trends.days).toHaveLength(7);
    expect(trends.averages.caloriesPerDay).toBeGreaterThan(300);
    expect(trends.topFoods.length).toBeGreaterThan(0);
    expect(trends.topFoods[0]!.name).toBe("Pechuga de pollo");
    expect(trends.topFoods[0]!.count).toBe(2);
  });

  it("gestiona recetas y platos compuestos (guardar, listar, consumir y eliminar)", () => {
    // 1. Guardar receta
    const r = api.nutri_recipe_save({
      name: "Bowl Energético",
      description: "Avena con Whey y Fruta",
      servings: 2,
      ingredients: [
        { name: "Avena", amount: 100, unit: "g", calories: 378, protein: 13, carbs: 66, fat: 7 },
        { name: "Proteína", amount: 60, unit: "g", calories: 240, protein: 48, carbs: 4, fat: 2 },
      ],
    });

    expect(r.id).toBeDefined();
    expect(r.total_calories).toBe(618);
    expect(r.per_serving.calories).toBe(309); // 618 / 2

    // 2. Listar recetas
    const list = api.nutri_recipes_list();
    expect(list.recipes).toHaveLength(1);
    expect(list.recipes[0]!.name).toBe("Bowl Energético");

    // 3. Consumir 1 ración en desayuno
    const s1 = api.nutri_recipe_consume("2026-10-16", "desayuno", r.id, 1);
    expect(s1.log.meals.desayuno).toHaveLength(1);
    expect(s1.log.meals.desayuno[0]!.name).toBe("Bowl Energético");
    expect(s1.log.meals.desayuno[0]!.calories).toBe(309);
    expect(s1.totals.calories).toBe(309);

    // 4. Eliminar receta
    const delRes = api.nutri_recipe_delete(r.id);
    expect(delRes.ok).toBe(true);
    expect(api.nutri_recipes_list().recipes).toHaveLength(0);
  });
});
