/**
 * NoteVault Nutrition Manager
 * Capa de datos para el módulo de Alimentación (Nutrición, Macros y Diario de Comidas).
 *
 * Almacenamiento:
 * - Diario:    ${vault}/.notevault/alimentacion/YYYY/MM/YYYY-MM-DD.json
 * - Despensa:  ${vault}/.notevault/alimentacion/alimentos.json
 * - Ajustes:   ${vault}/.notevault/alimentacion/ajustes.json
 */

import * as path from "node:path";
import { addDays, parseIsoDate, todayIso } from "./dates";
import { formatLayout, LAYOUT } from "./vaultFormat";
import { loadJson, newId, writeJson } from "./store";
import type {
  NutriDayLog,
  NutriDaySummary,
  NutriFoodItem,
  NutriFoodLibraryEntry,
  NutriMealType,
  NutriProfile,
  NutriTargets,
  NutriTrendsData,
  NutriTrendDay,
  TopFoodStat,
} from "../lib/nutritionTypes";
import { DEFAULT_NUTRI_PROFILE } from "../lib/nutritionTypes";

export const DEFAULT_TARGETS: NutriTargets = {
  calories: 2200,
  protein_g: 150,
  carbs_g: 240,
  fat_g: 65,
  water_ml: 2500,
  auto_calculate: false,
};

export const DEFAULT_FOODS: Array<Omit<NutriFoodLibraryEntry, "id">> = [
  {
    name: "Pechuga de pollo a la plancha",
    serving_size: 100,
    serving_unit: "g",
    calories: 165,
    protein: 31,
    carbs: 0,
    fat: 3.6,
    category: "Proteínas",
  },
  {
    name: "Huevo entero",
    serving_size: 1,
    serving_unit: "unidad (50g)",
    calories: 72,
    protein: 6.3,
    carbs: 0.4,
    fat: 4.8,
    category: "Proteínas",
  },
  {
    name: "Arroz blanco cocido",
    serving_size: 100,
    serving_unit: "g",
    calories: 130,
    protein: 2.7,
    carbs: 28,
    fat: 0.3,
    category: "Carbohidratos",
  },
  {
    name: "Avena en hojuelas",
    serving_size: 50,
    serving_unit: "g",
    calories: 189,
    protein: 6.5,
    carbs: 33,
    fat: 3.5,
    category: "Carbohidratos",
  },
  {
    name: "Banana",
    serving_size: 1,
    serving_unit: "unidad (120g)",
    calories: 105,
    protein: 1.3,
    carbs: 27,
    fat: 0.3,
    category: "Frutas y Verduras",
  },
  {
    name: "Proteína Whey en polvo",
    serving_size: 30,
    serving_unit: "scoop (30g)",
    calories: 120,
    protein: 24,
    carbs: 3,
    fat: 1.5,
    category: "Proteínas",
  },
  {
    name: "Aceite de oliva virgen extra",
    serving_size: 1,
    serving_unit: "cucharada (14g)",
    calories: 119,
    protein: 0,
    carbs: 0,
    fat: 13.5,
    category: "Grasas",
  },
  {
    name: "Palta / Aguacate",
    serving_size: 100,
    serving_unit: "g",
    calories: 160,
    protein: 2,
    carbs: 8.5,
    fat: 14.7,
    category: "Grasas",
  },
];

const VALID_MEALS: NutriMealType[] = ["desayuno", "almuerzo", "merienda", "cena", "snacks"];

function emptyMeals(): Record<NutriMealType, NutriFoodItem[]> {
  return {
    desayuno: [],
    almuerzo: [],
    merienda: [],
    cena: [],
    snacks: [],
  };
}

export class NutritionManager {
  readonly vaultRoot: string;

  constructor(vaultRoot: string) {
    this.vaultRoot = path.resolve(vaultRoot);
  }

  // ── Rutas ───────────────────────────────────────────────────────────────

  dayPath(day: Date | string): string {
    const dStr = typeof day === "string" ? day : todayIso(day);
    const d = parseIsoDate(dStr) || new Date();
    const rel = formatLayout(LAYOUT.nutrition_day, {
      year: d.getFullYear(),
      month: d.getMonth() + 1,
      date: dStr,
    });
    return path.join(this.vaultRoot, rel);
  }

  foodsPath(): string {
    return path.join(this.vaultRoot, LAYOUT.nutrition_foods);
  }

  profilePath(): string {
    return path.join(this.vaultRoot, LAYOUT.nutrition_profile);
  }

  settingsPath(): string {
    return path.join(this.vaultRoot, LAYOUT.nutrition_settings);
  }

  // ── Perfil Nutricional del Usuario ──────────────────────────────────────

  getProfile(): NutriProfile {
    const p = this.profilePath();
    const data = loadJson<Partial<NutriProfile>>(p);
    if (!data) return { ...DEFAULT_NUTRI_PROFILE };
    return {
      weight: typeof data.weight === "number" && data.weight > 0 ? Number(data.weight.toFixed(1)) : null,
      goal: String(data.goal || DEFAULT_NUTRI_PROFILE.goal),
      goal_note: String(data.goal_note || ""),
      dietary_restrictions: String(data.dietary_restrictions || "Ninguno").trim() || "Ninguno",
      allergies: Array.isArray(data.allergies) ? data.allergies.map(String) : [],
      gender: (data.gender === "hombre" || data.gender === "mujer" ? data.gender : "") as NutriProfile["gender"],
      age: typeof data.age === "number" && data.age > 0 ? Math.round(data.age) : null,
      height_cm: typeof data.height_cm === "number" && data.height_cm > 0 ? Math.round(data.height_cm) : null,
      updated_at: data.updated_at,
    };
  }

  saveProfile(updates: Partial<NutriProfile>): NutriProfile {
    const current = this.getProfile();
    const next: NutriProfile = {
      weight:
        updates.weight !== undefined
          ? updates.weight === null || updates.weight <= 0
            ? null
            : Number(Number(updates.weight).toFixed(1))
          : current.weight,
      goal: updates.goal !== undefined ? String(updates.goal).trim() : current.goal,
      goal_note: updates.goal_note !== undefined ? String(updates.goal_note).trim() : current.goal_note,
      dietary_restrictions:
        updates.dietary_restrictions !== undefined
          ? String(updates.dietary_restrictions).trim() || "Ninguno"
          : current.dietary_restrictions,
      allergies: updates.allergies !== undefined ? updates.allergies : current.allergies,
      gender: updates.gender !== undefined ? updates.gender : current.gender,
      age:
        updates.age !== undefined
          ? updates.age === null || updates.age <= 0
            ? null
            : Math.round(updates.age)
          : current.age,
      height_cm:
        updates.height_cm !== undefined
          ? updates.height_cm === null || updates.height_cm <= 0
            ? null
            : Math.round(updates.height_cm)
          : current.height_cm,
      updated_at: todayIso(),
    };
    writeJson(this.profilePath(), next);
    return next;
  }

  // ── Ajustes y Metas ─────────────────────────────────────────────────────

  settings(): NutriTargets {
    const p = this.settingsPath();
    const data = loadJson<Partial<NutriTargets>>(p);
    if (!data) return { ...DEFAULT_TARGETS };
    return {
      calories: Math.max(0, Number(data.calories) || DEFAULT_TARGETS.calories),
      protein_g: Math.max(0, Number(data.protein_g) || DEFAULT_TARGETS.protein_g),
      carbs_g: Math.max(0, Number(data.carbs_g) || DEFAULT_TARGETS.carbs_g),
      fat_g: Math.max(0, Number(data.fat_g) || DEFAULT_TARGETS.fat_g),
      water_ml: Math.max(0, Number(data.water_ml) || DEFAULT_TARGETS.water_ml),
      auto_calculate: Boolean(data.auto_calculate),
    };
  }

  saveSettings(updates: Partial<NutriTargets>): NutriTargets {
    const current = this.settings();
    const next: NutriTargets = {
      calories: updates.calories !== undefined ? Math.max(0, Math.round(Number(updates.calories))) : current.calories,
      protein_g: updates.protein_g !== undefined ? Math.max(0, Math.round(Number(updates.protein_g))) : current.protein_g,
      carbs_g: updates.carbs_g !== undefined ? Math.max(0, Math.round(Number(updates.carbs_g))) : current.carbs_g,
      fat_g: updates.fat_g !== undefined ? Math.max(0, Math.round(Number(updates.fat_g))) : current.fat_g,
      water_ml: updates.water_ml !== undefined ? Math.max(0, Math.round(Number(updates.water_ml))) : current.water_ml,
      auto_calculate: updates.auto_calculate !== undefined ? Boolean(updates.auto_calculate) : current.auto_calculate,
    };
    writeJson(this.settingsPath(), next);
    return next;
  }

  /**
   * Cálculo fisiológico de TDEE y macronutrientes sugeridos
   * según la fórmula Mifflin-St Jeor y evidencia deportiva.
   */
  calculateSuggestedTargets(
    weightKg: number,
    goal: string = "mantenimiento",
    gender: "hombre" | "mujer" = "hombre",
    age: number = 28,
    heightCm: number = 175,
  ): NutriTargets {
    const w = Math.max(30, Math.min(250, weightKg));
    const h = Math.max(120, Math.min(230, heightCm));
    const a = Math.max(14, Math.min(100, age));

    // BMR Mifflin-St Jeor
    let bmr = 10 * w + 6.25 * h - 5 * a;
    bmr += gender === "mujer" ? -161 : 5;

    // Multiplicador de actividad moderada (entrenamiento 3-5 días/semana)
    let tdee = Math.round(bmr * 1.55);

    // Ajuste según objetivo nutricional
    const g = goal.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (g.includes("aumento") || g.includes("hipertrofia") || g.includes("volumen") || g.includes("superavit")) {
      tdee += 300; // Superávit nutricional controlado
    } else if (g.includes("perdida") || g.includes("definicion") || g.includes("grasa") || g.includes("deficit") || g.includes("peso")) {
      tdee -= 400; // Déficit nutricional sostenible
    }

    // Proteína según balance nutricional: 2.2g/kg en pérdida de grasa/déficit para proteger masa muscular, 2.0g/kg en aumento de masa, 1.8g/kg mantenimiento
    const isDeficit = g.includes("perdida") || g.includes("definicion") || g.includes("grasa") || g.includes("deficit");
    const isSurplus = g.includes("aumento") || g.includes("hipertrofia") || g.includes("volumen") || g.includes("fuerza");
    const proteinPerKg = isDeficit ? 2.2 : isSurplus ? 2.0 : 1.8;
    const protein_g = Math.round(w * proteinPerKg);
    const proteinKcal = protein_g * 4;

    // Grasas: ~25% de las calorías totales (9 kcal por gramo)
    const fatKcal = tdee * 0.25;
    const fat_g = Math.round(fatKcal / 9);

    // Carbohidratos: el resto calórico (4 kcal por gramo)
    const carbsKcal = Math.max(0, tdee - proteinKcal - fatKcal);
    const carbs_g = Math.round(carbsKcal / 4);

    // Agua: ~35ml por kg de peso corporal
    const water_ml = Math.round(w * 35 / 250) * 250; // redondeado a vasos de 250ml

    return {
      calories: tdee,
      protein_g,
      carbs_g,
      fat_g,
      water_ml: Math.max(2000, water_ml),
      auto_calculate: true,
    };
  }

  // ── Despensa / Biblioteca de Alimentos ───────────────────────────────────

  foods(): NutriFoodLibraryEntry[] {
    const p = this.foodsPath();
    const data = loadJson<{ foods?: NutriFoodLibraryEntry[] }>(p);
    if (!data || !Array.isArray(data.foods) || data.foods.length === 0) {
      // Seed inicial si es la primera vez que se consulta
      const seeded: NutriFoodLibraryEntry[] = DEFAULT_FOODS.map((f) => ({
        ...f,
        id: newId("fd"),
        created_at: todayIso(),
      }));
      writeJson(p, { foods: seeded });
      return seeded;
    }
    return data.foods.map((f) => ({
      id: String(f.id || newId("fd")),
      name: String(f.name || "").trim(),
      serving_size: Math.max(1, Number(f.serving_size) || 100),
      serving_unit: String(f.serving_unit || "g").trim(),
      calories: Math.max(0, Number(f.calories) || 0),
      protein: Math.max(0, Number(f.protein) || 0),
      carbs: Math.max(0, Number(f.carbs) || 0),
      fat: Math.max(0, Number(f.fat) || 0),
      category: f.category ? String(f.category) : undefined,
      created_at: f.created_at || todayIso(),
    }));
  }

  saveFood(entry: Partial<NutriFoodLibraryEntry>): NutriFoodLibraryEntry {
    const name = String(entry.name || "").trim();
    if (!name) {
      throw new Error("El nombre del alimento es obligatorio.");
    }
    const list = this.foods();
    const id = String(entry.id || "").trim();

    const normalized: NutriFoodLibraryEntry = {
      id: id || newId("fd"),
      name,
      serving_size: Math.max(1, Number(entry.serving_size) || 100),
      serving_unit: String(entry.serving_unit || "g").trim() || "g",
      calories: Math.max(0, Number(entry.calories) || 0),
      protein: Math.max(0, Number(entry.protein) || 0),
      carbs: Math.max(0, Number(entry.carbs) || 0),
      fat: Math.max(0, Number(entry.fat) || 0),
      category: entry.category ? String(entry.category).trim() : undefined,
      created_at: entry.created_at || todayIso(),
    };

    if (id) {
      const idx = list.findIndex((f) => f.id === id);
      if (idx !== -1) {
        list[idx] = normalized;
      } else {
        list.push(normalized);
      }
    } else {
      list.push(normalized);
    }

    writeJson(this.foodsPath(), { foods: list });
    return normalized;
  }

  deleteFood(id: string): boolean {
    const list = this.foods();
    const filtered = list.filter((f) => f.id !== id);
    if (filtered.length === list.length) return false;
    writeJson(this.foodsPath(), { foods: filtered });
    return true;
  }

  // ── Diario de Comidas ───────────────────────────────────────────────────

  day(day: Date | string): NutriDayLog {
    const dStr = typeof day === "string" ? day : todayIso(day);
    const p = this.dayPath(dStr);
    const raw = loadJson<Partial<NutriDayLog>>(p);
    if (!raw) {
      return {
        date: dStr,
        meals: emptyMeals(),
        water_ml: 0,
      };
    }

    const meals = emptyMeals();
    if (raw.meals && typeof raw.meals === "object") {
      for (const mealKey of VALID_MEALS) {
        const arr = (raw.meals as any)[mealKey];
        if (Array.isArray(arr)) {
          meals[mealKey] = arr.map((item: any) => ({
            id: String(item.id || newId("fi")),
            name: String(item.name || "Alimento").trim(),
            amount: Math.max(0, Number(item.amount) || 1),
            unit: String(item.unit || "porción").trim(),
            calories: Math.max(0, Math.round(Number(item.calories) || 0)),
            protein: Math.max(0, Number((Number(item.protein) || 0).toFixed(1))),
            carbs: Math.max(0, Number((Number(item.carbs) || 0).toFixed(1))),
            fat: Math.max(0, Number((Number(item.fat) || 0).toFixed(1))),
            food_id: item.food_id ? String(item.food_id) : undefined,
            created_at: item.created_at,
          }));
        }
      }
    }

    return {
      date: dStr,
      meals,
      water_ml: Math.max(0, Math.round(Number(raw.water_ml) || 0)),
      notes: raw.notes ? String(raw.notes) : undefined,
      updated_at: raw.updated_at,
    };
  }

  saveDay(day: Date | string, updates: Partial<NutriDayLog>): NutriDayLog {
    const current = this.day(day);
    const dStr = current.date;
    const p = this.dayPath(dStr);

    const mergedMeals: Record<NutriMealType, NutriFoodItem[]> = emptyMeals();
    for (const m of VALID_MEALS) {
      if (updates.meals && updates.meals[m]) {
        mergedMeals[m] = updates.meals[m]!;
      } else {
        mergedMeals[m] = current.meals[m];
      }
    }

    const result: NutriDayLog = {
      date: dStr,
      meals: mergedMeals,
      water_ml: updates.water_ml !== undefined ? Math.max(0, Math.round(updates.water_ml)) : current.water_ml,
      notes: updates.notes !== undefined ? String(updates.notes) : current.notes,
      updated_at: todayIso(),
    };

    writeJson(p, result);
    return result;
  }

  addMealItem(day: Date | string, meal: NutriMealType, item: Partial<NutriFoodItem>): NutriDayLog {
    if (!VALID_MEALS.includes(meal)) {
      throw new Error(`Turno de comida inválido: ${meal}`);
    }
    const current = this.day(day);
    const name = String(item.name || "").trim();
    if (!name) {
      throw new Error("El nombre del alimento es obligatorio.");
    }

    const newItem: NutriFoodItem = {
      id: String(item.id || newId("fi")),
      name,
      amount: Math.max(0, Number(item.amount) || 1),
      unit: String(item.unit || "g").trim(),
      calories: Math.max(0, Math.round(Number(item.calories) || 0)),
      protein: Math.max(0, Number((Number(item.protein) || 0).toFixed(1))),
      carbs: Math.max(0, Number((Number(item.carbs) || 0).toFixed(1))),
      fat: Math.max(0, Number((Number(item.fat) || 0).toFixed(1))),
      food_id: item.food_id ? String(item.food_id) : undefined,
      created_at: item.created_at || new Date().toISOString(),
    };

    current.meals[meal].push(newItem);
    return this.saveDay(current.date, current);
  }

  updateMealItem(
    day: Date | string,
    meal: NutriMealType,
    itemId: string,
    updates: Partial<NutriFoodItem>,
  ): NutriDayLog {
    if (!VALID_MEALS.includes(meal)) {
      throw new Error(`Turno de comida inválido: ${meal}`);
    }
    const current = this.day(day);
    const idx = current.meals[meal].findIndex((it) => it.id === itemId);
    if (idx === -1) {
      throw new Error(`Alimento ${itemId} no encontrado en ${meal}`);
    }

    const existing = current.meals[meal][idx]!;
    current.meals[meal][idx] = {
      ...existing,
      name: updates.name !== undefined ? String(updates.name).trim() : existing.name,
      amount: updates.amount !== undefined ? Math.max(0, Number(updates.amount)) : existing.amount,
      unit: updates.unit !== undefined ? String(updates.unit).trim() : existing.unit,
      calories: updates.calories !== undefined ? Math.max(0, Math.round(Number(updates.calories))) : existing.calories,
      protein: updates.protein !== undefined ? Math.max(0, Number((Number(updates.protein)).toFixed(1))) : existing.protein,
      carbs: updates.carbs !== undefined ? Math.max(0, Number((Number(updates.carbs)).toFixed(1))) : existing.carbs,
      fat: updates.fat !== undefined ? Math.max(0, Number((Number(updates.fat)).toFixed(1))) : existing.fat,
    };

    return this.saveDay(current.date, current);
  }

  removeMealItem(day: Date | string, meal: NutriMealType, itemId: string): NutriDayLog {
    if (!VALID_MEALS.includes(meal)) {
      throw new Error(`Turno de comida inválido: ${meal}`);
    }
    const current = this.day(day);
    current.meals[meal] = current.meals[meal].filter((it) => it.id !== itemId);
    return this.saveDay(current.date, current);
  }

  setWater(day: Date | string, ml: number): NutriDayLog {
    const current = this.day(day);
    current.water_ml = Math.max(0, Math.round(ml));
    return this.saveDay(current.date, current);
  }

  // ── Copia de Comidas y Días Anteriores ───────────────────────────────────

  copyMealFromDay(fromDate: Date | string, toDate: Date | string, meal: NutriMealType): NutriDayLog {
    if (!VALID_MEALS.includes(meal)) {
      throw new Error(`Turno de comida inválido: ${meal}`);
    }
    const fromLog = this.day(fromDate);
    const sourceItems = fromLog.meals[meal] || [];
    if (sourceItems.length === 0) {
      return this.day(toDate);
    }

    const targetLog = this.day(toDate);
    const clonedItems: NutriFoodItem[] = sourceItems.map((it) => ({
      ...it,
      id: newId("fi"),
      created_at: new Date().toISOString(),
    }));

    targetLog.meals[meal] = [...targetLog.meals[meal], ...clonedItems];
    return this.saveDay(targetLog.date, targetLog);
  }

  copyEntireDay(fromDate: Date | string, toDate: Date | string): NutriDayLog {
    const fromLog = this.day(fromDate);
    const targetLog = this.day(toDate);

    for (const m of VALID_MEALS) {
      const sourceItems = fromLog.meals[m] || [];
      const clonedItems: NutriFoodItem[] = sourceItems.map((it) => ({
        ...it,
        id: newId("fi"),
        created_at: new Date().toISOString(),
      }));
      targetLog.meals[m] = [...targetLog.meals[m], ...clonedItems];
    }

    if (fromLog.water_ml > 0 && targetLog.water_ml === 0) {
      targetLog.water_ml = fromLog.water_ml;
    }

    return this.saveDay(targetLog.date, targetLog);
  }

  // ── Resumen y Totales ───────────────────────────────────────────────────

  daySummary(day: Date | string): NutriDaySummary {
    const log = this.day(day);
    const targets = this.settings();

    const byMeal = {} as NutriDaySummary["byMeal"];
    let totCal = 0;
    let totProt = 0;
    let totCarbs = 0;
    let totFat = 0;

    for (const m of VALID_MEALS) {
      const items = log.meals[m] || [];
      let mCal = 0;
      let mProt = 0;
      let mCarbs = 0;
      let mFat = 0;

      for (const it of items) {
        mCal += it.calories || 0;
        mProt += it.protein || 0;
        mCarbs += it.carbs || 0;
        mFat += it.fat || 0;
      }

      byMeal[m] = {
        calories: Math.round(mCal),
        protein: Number(mProt.toFixed(1)),
        carbs: Number(mCarbs.toFixed(1)),
        fat: Number(mFat.toFixed(1)),
        itemsCount: items.length,
      };

      totCal += mCal;
      totProt += mProt;
      totCarbs += mCarbs;
      totFat += mFat;
    }

    return {
      date: log.date,
      log,
      targets,
      totals: {
        calories: Math.round(totCal),
        protein: Number(totProt.toFixed(1)),
        carbs: Number(totCarbs.toFixed(1)),
        fat: Number(totFat.toFixed(1)),
        water_ml: log.water_ml || 0,
      },
      byMeal,
    };
  }

  // ── Analítica de Tendencias, Adherencia y Alimentos Frecuentes ──────────

  trends(daysCount: number = 7, endDate?: string): NutriTrendsData {
    const clampedDays = Math.max(1, Math.min(90, Math.round(daysCount)));
    const endStr = endDate || todayIso();
    const endD = parseIsoDate(endStr) || new Date();

    const targets = this.settings();
    const days: NutriTrendDay[] = [];
    const foodMap = new Map<string, TopFoodStat>();

    let sumCal = 0;
    let sumProt = 0;
    let sumCarbs = 0;
    let sumFat = 0;
    let sumWater = 0;
    let loggedDays = 0;
    let compliantDays = 0;

    const WEEKDAY_NAMES = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

    for (let i = clampedDays - 1; i >= 0; i--) {
      const curDate = addDays(endD, -i);
      const dStr = todayIso(curDate);
      const log = this.day(dStr);

      let dayCal = 0;
      let dayProt = 0;
      let dayCarbs = 0;
      let dayFat = 0;
      let itemsCount = 0;

      for (const m of VALID_MEALS) {
        const items = log.meals[m] || [];
        for (const it of items) {
          dayCal += it.calories || 0;
          dayProt += it.protein || 0;
          dayCarbs += it.carbs || 0;
          dayFat += it.fat || 0;
          itemsCount += 1;

          const key = it.name.toLowerCase().trim();
          const existing = foodMap.get(key) || {
            name: it.name,
            count: 0,
            totalAmount: 0,
            totalCalories: 0,
            totalProtein: 0,
            unit: it.unit || "porción",
          };
          existing.count += 1;
          existing.totalAmount += it.amount || 1;
          existing.totalCalories += Math.round(it.calories || 0);
          existing.totalProtein = Number((existing.totalProtein + (it.protein || 0)).toFixed(1));
          foodMap.set(key, existing);
        }
      }

      dayCal = Math.round(dayCal);
      dayProt = Number(dayProt.toFixed(1));
      dayCarbs = Number(dayCarbs.toFixed(1));
      dayFat = Number(dayFat.toFixed(1));

      let adherence: NutriTrendDay["adherence"] = "empty";
      if (itemsCount > 0) {
        loggedDays += 1;
        sumCal += dayCal;
        sumProt += dayProt;
        sumCarbs += dayCarbs;
        sumFat += dayFat;

        const minCompliant = targets.calories * 0.9;
        const maxCompliant = targets.calories * 1.1;
        if (dayCal >= minCompliant && dayCal <= maxCompliant) {
          adherence = "compliant";
          compliantDays += 1;
        } else if (dayCal > maxCompliant) {
          adherence = "over";
        } else {
          adherence = "under";
        }
      }
      sumWater += log.water_ml || 0;

      const dayLabel = `${WEEKDAY_NAMES[curDate.getDay()]} ${curDate.getDate()}`;

      days.push({
        date: dStr,
        dayLabel,
        calories: dayCal,
        protein: dayProt,
        carbs: dayCarbs,
        fat: dayFat,
        water_ml: log.water_ml || 0,
        targetCalories: targets.calories,
        targetProtein: targets.protein_g,
        adherence,
        itemsCount,
      });
    }

    const divisor = Math.max(1, loggedDays);
    const topFoods = Array.from(foodMap.values())
      .sort((a, b) => b.count - a.count || b.totalCalories - a.totalCalories)
      .slice(0, 10);

    return {
      daysCount: clampedDays,
      startDate: days[0]?.date || endStr,
      endDate: endStr,
      days,
      averages: {
        caloriesPerDay: Math.round(sumCal / divisor),
        proteinPerDay: Number((sumProt / divisor).toFixed(1)),
        carbsPerDay: Number((sumCarbs / divisor).toFixed(1)),
        fatPerDay: Number((sumFat / divisor).toFixed(1)),
        waterMlPerDay: Math.round(sumWater / clampedDays),
      },
      targets,
      adherence: {
        loggedDays,
        compliantDays,
        totalDays: clampedDays,
        compliancePct: Math.round((compliantDays / clampedDays) * 100),
      },
      topFoods,
    };
  }
}
