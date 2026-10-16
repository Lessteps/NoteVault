// Tipos para el módulo de Alimentación (Nutrición, Macros y Diario de Comidas)

export type NutriMealType = "desayuno" | "almuerzo" | "merienda" | "cena" | "snacks";

export const NUTRI_MEALS: Array<{ id: NutriMealType; label: string; iconName: string }> = [
  { id: "desayuno", label: "Desayuno", iconName: "Coffee" },
  { id: "almuerzo", label: "Almuerzo", iconName: "Utensils" },
  { id: "merienda", label: "Merienda", iconName: "Cookie" },
  { id: "cena", label: "Cena", iconName: "Moon" },
  { id: "snacks", label: "Snacks y Suplementos", iconName: "Apple" },
];

export interface NutriFoodItem {
  id: string;
  name: string;
  amount: number;       // Cantidad consumida (ej: 150)
  unit: string;         // "g", "ml", "porción", "unidad"
  calories: number;     // kcal
  protein: number;      // gramos
  carbs: number;        // gramos
  fat: number;          // gramos
  food_id?: string;     // ID de alimento de biblioteca (si proviene de allí)
  created_at?: string;
}

export interface NutriDayLog {
  date: string;         // "YYYY-MM-DD"
  meals: Record<NutriMealType, NutriFoodItem[]>;
  water_ml: number;     // Consumo de agua en mililitros (ej: 2500)
  notes?: string;
  updated_at?: string;
}

export type NutriGoal =
  | "perdida_grasa"
  | "aumento_masa"
  | "mantenimiento"
  | "salud_general"
  | "energia_vitalidad"
  | "hipertrofia"
  | "definicion"
  | "salud"
  | string;

export interface NutriProfile {
  weight: number | null; // en kg (ej: 78.5)
  goal: NutriGoal;
  goal_note: string;
  dietary_restrictions: string; // Alimentos que hacen daño, intolerancias, alergias o "Ninguno"
  allergies?: string[];
  gender?: "hombre" | "mujer" | "";
  age?: number | null;
  height_cm?: number | null;
  updated_at?: string;
}

export const DEFAULT_NUTRI_PROFILE: NutriProfile = {
  weight: null,
  goal: "salud_general",
  goal_note: "",
  dietary_restrictions: "Ninguno",
  gender: "",
  age: null,
  height_cm: null,
};

export interface NutriTargets {
  calories: number;     // Meta diaria de calorías (ej: 2200)
  protein_g: number;    // Meta diaria de proteínas (ej: 150)
  carbs_g: number;      // Meta diaria de carbohidratos (ej: 250)
  fat_g: number;        // Meta diaria de grasas (ej: 65)
  water_ml: number;     // Meta diaria de agua (ej: 2500)
  auto_calculate?: boolean; // Si deriva sugerencias del peso y objetivo de Ejercicio
  // Distribución del timing nutricional por turnos (porcentajes que suman ~100)
  meal_distribution?: Record<NutriMealType, number>;
}

export interface NutriFoodLibraryEntry {
  id: string;
  name: string;
  serving_size: number; // Tamaño de porción base (ej: 100)
  serving_unit: string; // "g", "ml", "unidad", "porción"
  calories: number;     // kcal por porción base
  protein: number;      // g por porción base
  carbs: number;        // g por porción base
  fat: number;          // g por porción base
  category?: string;    // "Proteínas", "Carbohidratos", "Frutas y Verduras", "Lácteos", "Grasas", "Snacks"
  created_at?: string;
}

// ── Recetas y Platos Compuestos ──────────────────────────────────────────

export interface NutriRecipeIngredient {
  food_id?: string;     // ID de alimento en la despensa (si existe)
  name: string;         // Nombre del ingrediente
  amount: number;       // Cantidad utilizada en la receta
  unit: string;         // "g", "ml", "unidad", etc.
  calories: number;     // kcal aportadas por esta cantidad
  protein: number;      // g aportados
  carbs: number;        // g aportados
  fat: number;          // g aportados
}

export interface NutriRecipe {
  id: string;
  name: string;
  description?: string;
  servings: number;     // Raciones que rinde la preparación (por defecto 1 o ej: 2, 4)
  ingredients: NutriRecipeIngredient[];
  // Totales de la preparación completa
  total_calories: number;
  total_protein: number;
  total_carbs: number;
  total_fat: number;
  // Valores por 1 ración (totales / servings)
  per_serving: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  };
  created_at?: string;
  updated_at?: string;
}

export interface NutriDaySummary {
  date: string;
  log: NutriDayLog;
  targets: NutriTargets;
  totals: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    water_ml: number;
  };
  byMeal: Record<NutriMealType, {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    itemsCount: number;
  }>;
}

// ── Tendencias, Promedios Semanales y Adherencia ────────────────────────────

export interface NutriTrendDay {
  date: string;
  dayLabel: string; // ej: "Lun 12", "Mar 13"
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  water_ml: number;
  targetCalories: number;
  targetProtein: number;
  adherence: "compliant" | "over" | "under" | "empty";
  itemsCount: number;
}

export interface TopFoodStat {
  name: string;
  count: number; // Veces consumido en el período
  totalAmount: number; // Suma de porciones o gramos
  totalCalories: number; // Calorías totales aportadas
  totalProtein: number; // Proteínas totales aportadas
  unit: string;
}

export interface NutriTrendsData {
  daysCount: number; // 7, 14, 30
  startDate: string;
  endDate: string;
  days: NutriTrendDay[];
  averages: {
    caloriesPerDay: number;
    proteinPerDay: number;
    carbsPerDay: number;
    fatPerDay: number;
    waterMlPerDay: number;
  };
  targets: NutriTargets;
  adherence: {
    loggedDays: number;
    compliantDays: number;
    totalDays: number;
    compliancePct: number;
  };
  topFoods: TopFoodStat[];
}

// ── Estimador Inteligente de Platos y Macros por IA ──────────────────────

export interface EstimatedIngredient {
  name: string;
  amount: number;
  unit: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface EstimatedDishResult {
  dish_name: string;
  confidence: "alta" | "media" | "estimada";
  summary: string;
  total_calories: number;
  total_protein: number;
  total_carbs: number;
  total_fat: number;
  ingredients: EstimatedIngredient[];
}
