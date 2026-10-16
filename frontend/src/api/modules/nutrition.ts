import { ApiError } from "../../core/errors.js";
import { todayIso } from "../../core/dates.js";
import type { AppState } from "../appState.js";
import { oneLine, optDate } from "../common.js";
import type {
  NutriDaySummary,
  NutriMealType,
} from "../../lib/nutritionTypes.js";

const VALID_MEALS: NutriMealType[] = ["desayuno", "almuerzo", "merienda", "cena", "snacks"];

export function nutritionApi(app: AppState) {
  const mgr = () => app.mgrs().nutrition;
  const exMgr = () => app.mgrs().exercise;

  function parseDay(value: unknown): string {
    if (!value) return todayIso();
    const str = String(value).trim();
    const d = optDate(str);
    if (!d) {
      throw new ApiError(`Fecha inválida: ${value}`);
    }
    return todayIso(d);
  }

  function parseMeal(value: unknown): NutriMealType {
    const m = String(value || "").toLowerCase().trim() as NutriMealType;
    if (!VALID_MEALS.includes(m)) {
      throw new ApiError(`Turno de comida inválido: ${value}`);
    }
    return m;
  }

  return {
    nutri_day(date: unknown) {
      const d = parseDay(date);
      return mgr().day(d);
    },

    nutri_day_summary(date: unknown): NutriDaySummary {
      const d = parseDay(date);
      return mgr().daySummary(d);
    },

    nutri_item_add(date: unknown, meal: unknown, item: unknown) {
      const d = parseDay(date);
      const m = parseMeal(meal);
      if (!item || typeof item !== "object") {
        throw new ApiError("Datos del alimento requeridos.");
      }
      const raw = item as Record<string, unknown>;
      const name = oneLine(raw.name, 120);
      if (!name) {
        throw new ApiError("El nombre del alimento es obligatorio.");
      }

      mgr().addMealItem(d, m, {
        name,
        amount: Math.max(0, Number(raw.amount) || 1),
        unit: oneLine(raw.unit, 40) || "porción",
        calories: Math.max(0, Math.round(Number(raw.calories) || 0)),
        protein: Math.max(0, Number((Number(raw.protein) || 0).toFixed(1))),
        carbs: Math.max(0, Number((Number(raw.carbs) || 0).toFixed(1))),
        fat: Math.max(0, Number((Number(raw.fat) || 0).toFixed(1))),
        food_id: raw.food_id ? String(raw.food_id) : undefined,
      });

      return mgr().daySummary(d);
    },

    nutri_item_update(date: unknown, meal: unknown, itemId: unknown, updates: unknown) {
      const d = parseDay(date);
      const m = parseMeal(meal);
      const id = String(itemId || "").trim();
      if (!id) {
        throw new ApiError("ID de alimento requerido.");
      }
      if (!updates || typeof updates !== "object") {
        throw new ApiError("Datos de actualización requeridos.");
      }
      const raw = updates as Record<string, unknown>;

      mgr().updateMealItem(d, m, id, {
        name: raw.name !== undefined ? oneLine(raw.name, 120) : undefined,
        amount: raw.amount !== undefined ? Math.max(0, Number(raw.amount)) : undefined,
        unit: raw.unit !== undefined ? oneLine(raw.unit, 40) : undefined,
        calories: raw.calories !== undefined ? Math.max(0, Math.round(Number(raw.calories))) : undefined,
        protein: raw.protein !== undefined ? Math.max(0, Number(Number(raw.protein).toFixed(1))) : undefined,
        carbs: raw.carbs !== undefined ? Math.max(0, Number(Number(raw.carbs).toFixed(1))) : undefined,
        fat: raw.fat !== undefined ? Math.max(0, Number(Number(raw.fat).toFixed(1))) : undefined,
      });

      return mgr().daySummary(d);
    },

    nutri_item_delete(date: unknown, meal: unknown, itemId: unknown) {
      const d = parseDay(date);
      const m = parseMeal(meal);
      const id = String(itemId || "").trim();
      if (!id) {
        throw new ApiError("ID de alimento requerido.");
      }
      mgr().removeMealItem(d, m, id);
      return mgr().daySummary(d);
    },

    nutri_water_set(date: unknown, ml: unknown) {
      const d = parseDay(date);
      const amount = Math.max(0, Math.round(Number(ml) || 0));
      mgr().setWater(d, amount);
      return mgr().daySummary(d);
    },

    nutri_notes_set(date: unknown, notes: unknown) {
      const d = parseDay(date);
      const str = String(notes ?? "");
      mgr().saveDay(d, { notes: str });
      return mgr().daySummary(d);
    },

    nutri_meal_copy(fromDate: unknown, toDate: unknown, meal: unknown) {
      const fDate = parseDay(fromDate);
      const tDate = parseDay(toDate);
      const m = parseMeal(meal);
      mgr().copyMealFromDay(fDate, tDate, m);
      return mgr().daySummary(tDate);
    },

    nutri_day_copy(fromDate: unknown, toDate: unknown) {
      const fDate = parseDay(fromDate);
      const tDate = parseDay(toDate);
      mgr().copyEntireDay(fDate, tDate);
      return mgr().daySummary(tDate);
    },

    nutri_trends(days: unknown, endDate: unknown) {
      const daysCount = Math.max(1, Math.min(90, Number(days) || 7));
      const endD = endDate ? parseDay(endDate) : todayIso();
      return mgr().trends(daysCount, endD);
    },

    nutri_foods_list() {
      return { foods: mgr().foods() };
    },

    nutri_food_save(entry: unknown) {
      if (!entry || typeof entry !== "object") {
        throw new ApiError("Datos de alimento requeridos.");
      }
      const raw = entry as Record<string, unknown>;
      const name = oneLine(raw.name, 120);
      if (!name) {
        throw new ApiError("El nombre del alimento es obligatorio.");
      }

      return mgr().saveFood({
        id: raw.id ? String(raw.id) : undefined,
        name,
        serving_size: Math.max(1, Number(raw.serving_size) || 100),
        serving_unit: oneLine(raw.serving_unit, 40) || "g",
        calories: Math.max(0, Math.round(Number(raw.calories) || 0)),
        protein: Math.max(0, Number((Number(raw.protein) || 0).toFixed(1))),
        carbs: Math.max(0, Number((Number(raw.carbs) || 0).toFixed(1))),
        fat: Math.max(0, Number((Number(raw.fat) || 0).toFixed(1))),
        category: raw.category ? oneLine(raw.category, 60) : undefined,
      });
    },

    nutri_food_delete(id: unknown) {
      const foodId = String(id || "").trim();
      if (!foodId) {
        throw new ApiError("ID de alimento requerido.");
      }
      const ok = mgr().deleteFood(foodId);
      if (!ok) {
        throw new ApiError("Ese alimento ya no existe.");
      }
      return { ok: true };
    },

    // ── Recetas y Platos Compuestos ────────────────────────────────────────

    nutri_recipes_list() {
      return { recipes: mgr().recipes() };
    },

    nutri_recipe_save(entry: unknown) {
      if (!entry || typeof entry !== "object") {
        throw new ApiError("Datos de receta requeridos.");
      }
      const raw = entry as Record<string, unknown>;
      const name = oneLine(raw.name, 120);
      if (!name) {
        throw new ApiError("El nombre de la receta es obligatorio.");
      }

      const rawIngredients = Array.isArray(raw.ingredients) ? raw.ingredients : [];
      const ingredients = rawIngredients.map((ing: any) => ({
        food_id: ing.food_id ? String(ing.food_id).trim() : undefined,
        name: oneLine(ing.name, 120) || "Ingrediente",
        amount: Math.max(0, Number(ing.amount) || 1),
        unit: oneLine(ing.unit, 40) || "g",
        calories: Math.max(0, Math.round(Number(ing.calories) || 0)),
        protein: Math.max(0, Number((Number(ing.protein) || 0).toFixed(1))),
        carbs: Math.max(0, Number((Number(ing.carbs) || 0).toFixed(1))),
        fat: Math.max(0, Number((Number(ing.fat) || 0).toFixed(1))),
      }));

      return mgr().saveRecipe({
        id: raw.id ? String(raw.id).trim() : undefined,
        name,
        description: raw.description ? oneLine(raw.description, 300) : undefined,
        servings: Math.max(0.1, Number(raw.servings) || 1),
        ingredients,
      });
    },

    nutri_recipe_delete(id: unknown) {
      const recipeId = String(id || "").trim();
      if (!recipeId) {
        throw new ApiError("ID de receta requerido.");
      }
      const ok = mgr().deleteRecipe(recipeId);
      if (!ok) {
        throw new ApiError("Esa receta ya no existe.");
      }
      return { ok: true };
    },

    nutri_recipe_consume(date: unknown, meal: unknown, recipeId: unknown, servings: unknown) {
      const d = parseDay(date);
      const m = parseMeal(meal);
      const rId = String(recipeId || "").trim();
      if (!rId) {
        throw new ApiError("ID de receta requerido.");
      }
      const s = Math.max(0.1, Number(servings) || 1);
      mgr().consumeRecipe(d, m, rId, s);
      return mgr().daySummary(d);
    },

    nutri_settings_get() {
      return mgr().settings();
    },

    nutri_settings_save(settings: unknown) {
      if (!settings || typeof settings !== "object") {
        throw new ApiError("Ajustes requeridos.");
      }
      const raw = settings as Record<string, unknown>;
      return mgr().saveSettings({
        calories: raw.calories !== undefined ? Number(raw.calories) : undefined,
        protein_g: raw.protein_g !== undefined ? Number(raw.protein_g) : undefined,
        carbs_g: raw.carbs_g !== undefined ? Number(raw.carbs_g) : undefined,
        fat_g: raw.fat_g !== undefined ? Number(raw.fat_g) : undefined,
        water_ml: raw.water_ml !== undefined ? Number(raw.water_ml) : undefined,
        auto_calculate: raw.auto_calculate !== undefined ? Boolean(raw.auto_calculate) : undefined,
      });
    },

    nutri_profile_get() {
      return mgr().getProfile();
    },

    nutri_profile_save(fields: unknown) {
      if (!fields || typeof fields !== "object") {
        throw new ApiError("Datos de perfil requeridos.");
      }
      const raw = fields as Record<string, unknown>;
      const weight =
        raw.weight !== undefined && raw.weight !== null
          ? Number(raw.weight) > 0
            ? Number(raw.weight)
            : null
          : undefined;

      const saved = mgr().saveProfile({
        weight,
        goal: raw.goal !== undefined ? oneLine(raw.goal, 60) : undefined,
        goal_note: raw.goal_note !== undefined ? oneLine(raw.goal_note, 200) : undefined,
        dietary_restrictions:
          raw.dietary_restrictions !== undefined
            ? oneLine(raw.dietary_restrictions, 300) || "Ninguno"
            : undefined,
        gender:
          raw.gender === "hombre" || raw.gender === "mujer"
            ? raw.gender
            : raw.gender === ""
              ? ""
              : undefined,
        age: raw.age !== undefined && raw.age !== null ? Math.round(Number(raw.age)) : undefined,
        height_cm:
          raw.height_cm !== undefined && raw.height_cm !== null
            ? Math.round(Number(raw.height_cm))
            : undefined,
      });

      // Si se cargó un peso válido, también lo sincronizamos con el historial de peso en Ejercicio
      if (typeof weight === "number" && weight > 0) {
        try {
          exMgr().addWeightEntry(todayIso(), weight);
        } catch {
          /* best effort */
        }
      }

      return saved;
    },

    /**
     * Calcula sugerencias fisiológicas leyendo peso y objetivo del perfil nutricional o de Ejercicio.
     */
    nutri_suggest_targets() {
      const nutriProfile = mgr().getProfile();
      const exProfile = exMgr().getProfile();
      const weightHistory = exProfile.weight_history || [];
      const exWeight = weightHistory.length > 0 ? weightHistory[weightHistory.length - 1]!.weight : 75;

      const currentWeight = (nutriProfile.updated_at && nutriProfile.weight) ? nutriProfile.weight : exWeight;
      const goal = (nutriProfile.updated_at && nutriProfile.goal) ? nutriProfile.goal : (exProfile.goal || "mantenimiento");
      const gender = ((nutriProfile.updated_at && nutriProfile.gender) ? nutriProfile.gender : (exProfile.gender || "hombre")) as "hombre" | "mujer";
      const age = (nutriProfile.updated_at && nutriProfile.age) ? nutriProfile.age : (exProfile.age || 28);
      const height = (nutriProfile.updated_at && nutriProfile.height_cm) ? nutriProfile.height_cm : 175;

      const suggested = mgr().calculateSuggestedTargets(currentWeight, goal, gender, age, height);
      return {
        suggested,
        profileData: {
          weight: currentWeight,
          goal,
          gender,
          age,
        },
      };
    },
  };
}
