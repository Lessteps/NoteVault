import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NutritionManager, DEFAULT_TARGETS } from "./nutritionManager";

describe("NutritionManager", () => {
  let tempDir: string;
  let nm: NutritionManager;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "nv-nutrition-test-"));
    nm = new NutritionManager(tempDir);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe("Ajustes y Metas", () => {
    it("retorna las metas por defecto si no hay archivo de ajustes", () => {
      const s = nm.settings();
      expect(s.calories).toBe(DEFAULT_TARGETS.calories);
      expect(s.protein_g).toBe(DEFAULT_TARGETS.protein_g);
      expect(s.carbs_g).toBe(DEFAULT_TARGETS.carbs_g);
      expect(s.fat_g).toBe(DEFAULT_TARGETS.fat_g);
      expect(s.water_ml).toBe(DEFAULT_TARGETS.water_ml);
    });

    it("guarda y recupera metas personalizadas", () => {
      nm.saveSettings({
        calories: 2500,
        protein_g: 180,
        carbs_g: 280,
        fat_g: 70,
        water_ml: 3000,
      });

      const s = nm.settings();
      expect(s.calories).toBe(2500);
      expect(s.protein_g).toBe(180);
      expect(s.carbs_g).toBe(280);
      expect(s.fat_g).toBe(70);
      expect(s.water_ml).toBe(3000);
    });

    it("calcula metas sugeridas coherentes con el peso y objetivo atlético", () => {
      // 80kg hombre para hipertrofia
      const bulk = nm.calculateSuggestedTargets(80, "hipertrofia", "hombre", 25, 180);
      expect(bulk.calories).toBeGreaterThan(2400);
      expect(bulk.protein_g).toBe(160); // 2.0g/kg * 80kg
      expect(bulk.water_ml).toBeGreaterThanOrEqual(2500);

      // 80kg hombre para definición
      const cut = nm.calculateSuggestedTargets(80, "definición", "hombre", 25, 180);
      expect(cut.calories).toBeLessThan(bulk.calories);
      expect(cut.protein_g).toBe(176); // 2.2g/kg * 80kg
    });
  });

  describe("Perfil Nutricional del Usuario", () => {
    it("retorna perfil por defecto cuando no existe archivo", () => {
      const p = nm.getProfile();
      expect(p.weight).toBeNull();
      expect(p.goal).toBe("salud_general");
      expect(p.dietary_restrictions).toBe("Ninguno");
    });

    it("guarda y recupera peso, objetivo y alimentos contraindicados", () => {
      nm.saveProfile({
        weight: 78.5,
        goal: "hipertrofia",
        goal_note: "Prioridad brazos y hombros",
        dietary_restrictions: "Lactosa, picante, mariscos",
        gender: "hombre",
        age: 26,
      });

      const p = nm.getProfile();
      expect(p.weight).toBe(78.5);
      expect(p.goal).toBe("hipertrofia");
      expect(p.goal_note).toBe("Prioridad brazos y hombros");
      expect(p.dietary_restrictions).toBe("Lactosa, picante, mariscos");
      expect(p.gender).toBe("hombre");
      expect(p.age).toBe(26);
    });
  });

  describe("Despensa / Biblioteca de Alimentos", () => {
    it("autosemilla la despensa con alimentos básicos si está vacía", () => {
      const foods = nm.foods();
      expect(foods.length).toBeGreaterThan(5);
      expect(foods.some((f) => f.name.includes("Pechuga de pollo"))).toBe(true);
      expect(foods.some((f) => f.name.includes("Huevo"))).toBe(true);
    });

    it("permite añadir, actualizar y eliminar alimentos de la despensa", () => {
      const added = nm.saveFood({
        name: "Yogur Griego Natural",
        serving_size: 150,
        serving_unit: "pote (150g)",
        calories: 140,
        protein: 15,
        carbs: 6,
        fat: 5,
        category: "Lácteos",
      });

      expect(added.id).toBeTruthy();
      expect(added.name).toBe("Yogur Griego Natural");

      // Actualizar alimento
      nm.saveFood({
        id: added.id,
        name: "Yogur Griego Descremado",
        calories: 95,
        protein: 16,
      });

      const foods = nm.foods();
      const updated = foods.find((f) => f.id === added.id);
      expect(updated?.name).toBe("Yogur Griego Descremado");
      expect(updated?.calories).toBe(95);

      // Eliminar alimento
      const deleted = nm.deleteFood(added.id);
      expect(deleted).toBe(true);
      expect(nm.foods().some((f) => f.id === added.id)).toBe(false);
    });

    it("lanza error si se intenta guardar un alimento sin nombre", () => {
      expect(() => nm.saveFood({ name: "" })).toThrow();
    });
  });

  describe("Diario de Comidas", () => {
    it("inicia un día vacío con turnos estructurados", () => {
      const day = nm.day("2026-10-16");
      expect(day.date).toBe("2026-10-16");
      expect(day.meals.desayuno).toEqual([]);
      expect(day.meals.almuerzo).toEqual([]);
      expect(day.meals.cena).toEqual([]);
      expect(day.water_ml).toBe(0);
    });

    it("añade alimentos a un turno de comida y recalcula", () => {
      nm.addMealItem("2026-10-16", "desayuno", {
        name: "Huevos revueltos",
        amount: 2,
        unit: "huevos",
        calories: 144,
        protein: 12.6,
        carbs: 0.8,
        fat: 9.6,
      });

      nm.addMealItem("2026-10-16", "desayuno", {
        name: "Tostadas integrales",
        amount: 2,
        unit: "rebanadas",
        calories: 160,
        protein: 6,
        carbs: 30,
        fat: 2,
      });

      const day = nm.day("2026-10-16");
      expect(day.meals.desayuno).toHaveLength(2);
      expect(day.meals.desayuno[0]!.name).toBe("Huevos revueltos");

      // Resumen del día
      const summary = nm.daySummary("2026-10-16");
      expect(summary.totals.calories).toBe(304); // 144 + 160
      expect(summary.totals.protein).toBe(18.6);
      expect(summary.byMeal.desayuno.calories).toBe(304);
      expect(summary.byMeal.desayuno.itemsCount).toBe(2);
      expect(summary.byMeal.almuerzo.itemsCount).toBe(0);
    });

    it("permite actualizar un alimento de una comida", () => {
      nm.addMealItem("2026-10-16", "almuerzo", {
        name: "Arroz con pollo",
        amount: 1,
        calories: 450,
        protein: 40,
        carbs: 50,
        fat: 8,
      });

      const day = nm.day("2026-10-16");
      const itemId = day.meals.almuerzo[0]!.id;

      nm.updateMealItem("2026-10-16", "almuerzo", itemId, {
        calories: 500,
        protein: 45,
      });

      const updatedDay = nm.day("2026-10-16");
      expect(updatedDay.meals.almuerzo[0]!.calories).toBe(500);
      expect(updatedDay.meals.almuerzo[0]!.protein).toBe(45);
    });

    it("permite eliminar un alimento de una comida", () => {
      nm.addMealItem("2026-10-16", "cena", {
        name: "Ensalada César",
        calories: 300,
        protein: 15,
      });

      const day = nm.day("2026-10-16");
      const itemId = day.meals.cena[0]!.id;

      nm.removeMealItem("2026-10-16", "cena", itemId);
      expect(nm.day("2026-10-16").meals.cena).toHaveLength(0);
    });

    it("registra y actualiza el consumo de agua", () => {
      nm.setWater("2026-10-16", 1500);
      expect(nm.day("2026-10-16").water_ml).toBe(1500);

      const summary = nm.daySummary("2026-10-16");
      expect(summary.totals.water_ml).toBe(1500);
    });

    it("copia un turno de comida de otro día con nuevos identificadores", () => {
      nm.addMealItem("2026-10-15", "desayuno", {
        name: "Avena con leche y frutos secos",
        amount: 1,
        calories: 380,
        protein: 16,
      });

      const res = nm.copyMealFromDay("2026-10-15", "2026-10-16", "desayuno");
      expect(res.meals.desayuno).toHaveLength(1);
      expect(res.meals.desayuno[0]!.name).toBe("Avena con leche y frutos secos");
      expect(res.meals.desayuno[0]!.calories).toBe(380);
      expect(res.meals.desayuno[0]!.id).not.toBe(nm.day("2026-10-15").meals.desayuno[0]!.id);
    });

    it("copia todas las comidas de un día completo", () => {
      nm.addMealItem("2026-10-15", "desayuno", { name: "Café con tostadas", calories: 200 });
      nm.addMealItem("2026-10-15", "almuerzo", { name: "Pollo con arroz", calories: 500 });
      nm.setWater("2026-10-15", 2000);

      const target = nm.copyEntireDay("2026-10-15", "2026-10-16");
      expect(target.meals.desayuno).toHaveLength(1);
      expect(target.meals.almuerzo).toHaveLength(1);
      expect(target.water_ml).toBe(2000);
    });

    it("calcula tendencias, promedios semanales y ranking de alimentos más consumidos", () => {
      // Día 1: 2026-10-14 (en meta: 2150 kcal, 150g P)
      nm.addMealItem("2026-10-14", "desayuno", { name: "Huevos revueltos", amount: 3, calories: 250, protein: 20 });
      nm.addMealItem("2026-10-14", "almuerzo", { name: "Pechuga de pollo", amount: 200, calories: 330, protein: 62 });
      nm.addMealItem("2026-10-14", "cena", { name: "Arroz con atún", amount: 1, calories: 1570, protein: 68 });
      nm.setWater("2026-10-14", 2500);

      // Día 2: 2026-10-15 (superávit / over: 2600 kcal)
      nm.addMealItem("2026-10-15", "almuerzo", { name: "Pechuga de pollo", amount: 250, calories: 400, protein: 75 });
      nm.addMealItem("2026-10-15", "cena", { name: "Pizza casera", amount: 1, calories: 2200, protein: 60 });
      nm.setWater("2026-10-15", 2000);

      const trends = nm.trends(7, "2026-10-16");
      expect(trends.daysCount).toBe(7);
      expect(trends.days).toHaveLength(7);
      expect(trends.adherence.loggedDays).toBe(2);
      expect(trends.adherence.compliantDays).toBe(1);

      // Promedio calórico de los días registrados
      // (2150 + 2600) / 2 = 2375
      expect(trends.averages.caloriesPerDay).toBe(2375);
      expect(trends.averages.proteinPerDay).toBe(142.5); // (150 + 135) / 2

      // Ranking de alimentos: Pechuga de pollo aparece 2 veces
      expect(trends.topFoods.length).toBeGreaterThan(0);
      expect(trends.topFoods[0]!.name).toBe("Pechuga de pollo");
      expect(trends.topFoods[0]!.count).toBe(2);
      expect(trends.topFoods[0]!.totalProtein).toBe(137);
    });
  });

  describe("Recetas y Platos Compuestos", () => {
    it("crea, calcula totales y guarda una receta con ingredientes", () => {
      const r = nm.saveRecipe({
        name: "Ensalada Proteica con Pollo",
        description: "Almuerzo rápido y fresco",
        servings: 2,
        ingredients: [
          { name: "Pechuga de pollo", amount: 200, unit: "g", calories: 330, protein: 62, carbs: 0, fat: 7.2 },
          { name: "Arroz cocido", amount: 150, unit: "g", calories: 195, protein: 4, carbs: 42, fat: 0.5 },
          { name: "Aceite de oliva", amount: 10, unit: "ml", calories: 88, protein: 0, carbs: 0, fat: 10 },
        ],
      });

      expect(r.id).toBeDefined();
      expect(r.name).toBe("Ensalada Proteica con Pollo");
      expect(r.servings).toBe(2);
      expect(r.ingredients).toHaveLength(3);

      // Totales: 330 + 195 + 88 = 613 kcal
      expect(r.total_calories).toBe(613);
      expect(r.total_protein).toBe(66);
      expect(r.total_carbs).toBe(42);
      expect(r.total_fat).toBe(17.7);

      // Porción individual (dividido entre 2 raciones)
      // 613 / 2 = ~307 kcal, 66 / 2 = 33g P
      expect(r.per_serving.calories).toBe(307);
      expect(r.per_serving.protein).toBe(33);

      // Persistencia en lista de recetas
      const all = nm.recipes();
      expect(all).toHaveLength(1);
      expect(all[0]!.id).toBe(r.id);
    });

    it("consume una receta entera o fraccionada en un turno de comida", () => {
      const r = nm.saveRecipe({
        name: "Bowl de Avena con Proteína",
        servings: 1,
        ingredients: [
          { name: "Avena", amount: 60, unit: "g", calories: 226, protein: 8, carbs: 40, fat: 4 },
          { name: "Proteína Whey", amount: 30, unit: "g", calories: 120, protein: 24, carbs: 2, fat: 1 },
        ],
      });

      // Consumir 1 ración en el desayuno
      const item = nm.consumeRecipe("2026-10-16", "desayuno", r.id, 1);
      expect(item.name).toBe("Bowl de Avena con Proteína");
      expect(item.calories).toBe(346); // 226 + 120
      expect(item.protein).toBe(32);

      const day = nm.day("2026-10-16");
      expect(day.meals.desayuno).toHaveLength(1);
      expect(day.meals.desayuno[0]!.calories).toBe(346);

      // Consumir media ración (0.5) en la merienda
      const halfItem = nm.consumeRecipe("2026-10-16", "merienda", r.id, 0.5);
      expect(halfItem.calories).toBe(173); // 346 * 0.5
      expect(halfItem.protein).toBe(16);
      expect(nm.day("2026-10-16").meals.merienda).toHaveLength(1);
    });

    it("elimina una receta", () => {
      const r = nm.saveRecipe({ name: "Tortilla francesa", servings: 1, ingredients: [] });
      expect(nm.recipes()).toHaveLength(1);
      expect(nm.deleteRecipe(r.id)).toBe(true);
      expect(nm.recipes()).toHaveLength(0);
    });
  });
});
