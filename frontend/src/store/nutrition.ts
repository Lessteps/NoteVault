// Store reactivo Zustand para el módulo de Alimentación
// Maneja el diario por fecha, resumen calórico, macronutrientes, agua, biblioteca y metas.

import { create } from "zustand";
import { api } from "../lib/bridge";
import type {
  NutriDaySummary,
  NutriFoodItem,
  NutriFoodLibraryEntry,
  NutriMealType,
  NutriProfile,
  NutriRecipe,
  NutriTargets,
  NutriTrendsData,
} from "../lib/nutritionTypes";

export type NutritionTab = "diario" | "tendencias" | "alimentos" | "perfil" | "metas";

export interface NutritionState {
  selectedDate: string;
  summary: NutriDaySummary | null;
  foods: NutriFoodLibraryEntry[];
  recipes: NutriRecipe[];
  targets: NutriTargets | null;
  profile: NutriProfile | null;
  trends: NutriTrendsData | null;
  trendsDays: number;
  activeTab: NutritionTab;
  loading: boolean;
  error: string | null;

  // Modales y estados transitorios
  addingMeal: NutriMealType | null;
  settingsOpen: boolean;
  editingFood: NutriFoodLibraryEntry | null;
  recipeModalOpen: boolean;
  editingRecipe: NutriRecipe | null;

  // Acciones de navegación y carga
  setSelectedDate: (date: string) => Promise<void>;
  prevDay: () => Promise<void>;
  nextDay: () => Promise<void>;
  goToday: () => Promise<void>;
  setActiveTab: (tab: NutritionTab) => void;
  loadDay: (date?: string) => Promise<void>;
  loadFoods: () => Promise<void>;
  loadRecipes: () => Promise<void>;
  loadSettings: () => Promise<void>;
  loadProfile: () => Promise<void>;
  saveProfile: (updates: Partial<NutriProfile>) => Promise<NutriProfile>;
  loadTrends: (days?: number) => Promise<void>;
  setTrendsDays: (days: number) => Promise<void>;

  // Operaciones de comidas
  addFoodToMeal: (meal: NutriMealType, item: Partial<NutriFoodItem>) => Promise<void>;
  updateFoodInMeal: (meal: NutriMealType, itemId: string, updates: Partial<NutriFoodItem>) => Promise<void>;
  removeFoodFromMeal: (meal: NutriMealType, itemId: string) => Promise<void>;
  setWater: (ml: number) => Promise<void>;
  setNotes: (notes: string) => Promise<void>;
  copyMealFromYesterday: (meal: NutriMealType) => Promise<boolean>;
  copyEntireDayFromYesterday: () => Promise<boolean>;
  quickConsumeFood: (food: NutriFoodLibraryEntry, meal: NutriMealType, amountMultiplier?: number) => Promise<void>;
  quickConsumeRecipe: (recipeId: string, meal: NutriMealType, servings?: number) => Promise<void>;

  // Operaciones de despensa / biblioteca
  saveFoodToLibrary: (entry: Partial<NutriFoodLibraryEntry>) => Promise<NutriFoodLibraryEntry>;
  deleteFoodFromLibrary: (id: string) => Promise<void>;

  // Operaciones de recetas
  saveRecipe: (entry: Partial<NutriRecipe>) => Promise<NutriRecipe>;
  deleteRecipe: (id: string) => Promise<void>;

  // Metas
  saveTargets: (targets: Partial<NutriTargets>) => Promise<void>;
  applySuggestedTargets: () => Promise<{ weight: number; goal: string } | null>;

  // Control de UI
  openAddMeal: (meal: NutriMealType) => void;
  closeAddMeal: () => void;
  setSettingsOpen: (open: boolean) => void;
  setEditingFood: (food: NutriFoodLibraryEntry | null) => void;
  setRecipeModalOpen: (open: boolean) => void;
  setEditingRecipe: (recipe: NutriRecipe | null) => void;
}

function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function shiftDate(iso: string, days: number): string {
  const parts = iso.split("-").map(Number);
  const d = new Date(parts[0]!, parts[1]! - 1, parts[2]!);
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export const useNutrition = create<NutritionState>((set, get) => ({
  selectedDate: todayIso(),
  summary: null,
  foods: [],
  recipes: [],
  targets: null,
  profile: null,
  trends: null,
  trendsDays: 7,
  activeTab: "diario",
  loading: false,
  error: null,
  addingMeal: null,
  settingsOpen: false,
  editingFood: null,
  recipeModalOpen: false,
  editingRecipe: null,

  setSelectedDate: async (date: string) => {
    set({ selectedDate: date });
    await get().loadDay(date);
  },

  prevDay: async () => {
    const prev = shiftDate(get().selectedDate, -1);
    await get().setSelectedDate(prev);
  },

  nextDay: async () => {
    const next = shiftDate(get().selectedDate, 1);
    await get().setSelectedDate(next);
  },

  goToday: async () => {
    const today = todayIso();
    await get().setSelectedDate(today);
  },

  setActiveTab: (tab: NutritionTab) => {
    set({ activeTab: tab });
    if (tab === "alimentos") {
      if (get().foods.length === 0) void get().loadFoods();
      if (get().recipes.length === 0) void get().loadRecipes();
    } else if (tab === "metas" && !get().targets) {
      void get().loadSettings();
    } else if (tab === "perfil" && !get().profile) {
      void get().loadProfile();
    } else if (tab === "tendencias" && !get().trends) {
      void get().loadTrends();
    }
  },

  loadDay: async (date?: string) => {
    const d = date || get().selectedDate;
    set({ loading: true, error: null });
    try {
      const summary = await api.nutriDaySummary(d);
      set({ summary, targets: summary.targets, loading: false });
    } catch (e) {
      set({ loading: false, error: (e as Error).message });
    }
  },

  loadFoods: async () => {
    try {
      const res = await api.nutriFoodsList();
      set({ foods: res.foods || [] });
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  loadRecipes: async () => {
    try {
      const res = await api.nutriRecipesList();
      set({ recipes: res.recipes || [] });
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  loadSettings: async () => {
    try {
      const targets = await api.nutriSettingsGet();
      set({ targets });
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  loadProfile: async () => {
    try {
      const profile = await api.nutriProfileGet();
      set({ profile });
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  loadTrends: async (days?: number) => {
    const d = days || get().trendsDays;
    const endDate = get().selectedDate;
    try {
      const data = await api.nutriTrends(d, endDate);
      set({ trends: data, trendsDays: d });
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  setTrendsDays: async (days: number) => {
    set({ trendsDays: days });
    await get().loadTrends(days);
  },

  saveProfile: async (updates: Partial<NutriProfile>) => {
    try {
      const saved = await api.nutriProfileSave(updates);
      set({ profile: saved, error: null });
      return saved;
    } catch (e) {
      set({ error: (e as Error).message });
      throw e;
    }
  },

  addFoodToMeal: async (meal: NutriMealType, item: Partial<NutriFoodItem>) => {
    const d = get().selectedDate;
    try {
      const updated = await api.nutriItemAdd(d, meal, item);
      set({ summary: updated, error: null });
    } catch (e) {
      set({ error: (e as Error).message });
      throw e;
    }
  },

  updateFoodInMeal: async (meal: NutriMealType, itemId: string, updates: Partial<NutriFoodItem>) => {
    const d = get().selectedDate;
    try {
      const updated = await api.nutriItemUpdate(d, meal, itemId, updates);
      set({ summary: updated, error: null });
    } catch (e) {
      set({ error: (e as Error).message });
      throw e;
    }
  },

  removeFoodFromMeal: async (meal: NutriMealType, itemId: string) => {
    const d = get().selectedDate;
    try {
      const updated = await api.nutriItemDelete(d, meal, itemId);
      set({ summary: updated, error: null });
    } catch (e) {
      set({ error: (e as Error).message });
      throw e;
    }
  },

  setWater: async (ml: number) => {
    const d = get().selectedDate;
    try {
      const updated = await api.nutriWaterSet(d, ml);
      set({ summary: updated, error: null });
    } catch (e) {
      set({ error: (e as Error).message });
      throw e;
    }
  },

  setNotes: async (notes: string) => {
    const d = get().selectedDate;
    try {
      const updated = await api.nutriNotesSet(d, notes);
      set({ summary: updated, error: null });
    } catch (e) {
      set({ error: (e as Error).message });
      throw e;
    }
  },

  copyMealFromYesterday: async (meal: NutriMealType) => {
    const d = get().selectedDate;
    const yesterday = shiftDate(d, -1);
    const currentItemsCount = get().summary?.log.meals[meal]?.length || 0;
    try {
      const updated = await api.nutriMealCopy(yesterday, d, meal);
      set({ summary: updated, error: null });
      const newItemsCount = updated.log.meals[meal]?.length || 0;
      return newItemsCount > currentItemsCount;
    } catch (e) {
      set({ error: (e as Error).message });
      throw e;
    }
  },

  copyEntireDayFromYesterday: async () => {
    const d = get().selectedDate;
    const yesterday = shiftDate(d, -1);
    try {
      const updated = await api.nutriDayCopy(yesterday, d);
      set({ summary: updated, error: null });
      return true;
    } catch (e) {
      set({ error: (e as Error).message });
      throw e;
    }
  },

  quickConsumeFood: async (food: NutriFoodLibraryEntry, meal: NutriMealType, amountMultiplier = 1) => {
    const mult = Math.max(0.1, amountMultiplier);
    const item: Partial<NutriFoodItem> = {
      name: food.name,
      amount: Math.round(food.serving_size * mult),
      unit: food.serving_unit,
      calories: Math.round(food.calories * mult),
      protein: Number((food.protein * mult).toFixed(1)),
      carbs: Number((food.carbs * mult).toFixed(1)),
      fat: Number((food.fat * mult).toFixed(1)),
      food_id: food.id,
    };
    await get().addFoodToMeal(meal, item);
  },

  quickConsumeRecipe: async (recipeId: string, meal: NutriMealType, servings = 1) => {
    const d = get().selectedDate;
    try {
      const updated = await api.nutriRecipeConsume(d, meal, recipeId, servings);
      set({ summary: updated, error: null });
    } catch (e) {
      set({ error: (e as Error).message });
      throw e;
    }
  },

  saveFoodToLibrary: async (entry: Partial<NutriFoodLibraryEntry>) => {
    try {
      const saved = await api.nutriFoodSave(entry);
      await get().loadFoods();
      return saved;
    } catch (e) {
      set({ error: (e as Error).message });
      throw e;
    }
  },

  deleteFoodFromLibrary: async (id: string) => {
    try {
      await api.nutriFoodDelete(id);
      await get().loadFoods();
    } catch (e) {
      set({ error: (e as Error).message });
      throw e;
    }
  },

  saveRecipe: async (entry: Partial<NutriRecipe>) => {
    try {
      const saved = await api.nutriRecipeSave(entry);
      await get().loadRecipes();
      return saved;
    } catch (e) {
      set({ error: (e as Error).message });
      throw e;
    }
  },

  deleteRecipe: async (id: string) => {
    try {
      await api.nutriRecipeDelete(id);
      await get().loadRecipes();
    } catch (e) {
      set({ error: (e as Error).message });
      throw e;
    }
  },

  saveTargets: async (targets: Partial<NutriTargets>) => {
    try {
      const saved = await api.nutriSettingsSave(targets);
      set({ targets: saved });
      if (get().summary) {
        set((s) => (s.summary ? { summary: { ...s.summary, targets: saved } } : s));
      }
    } catch (e) {
      set({ error: (e as Error).message });
      throw e;
    }
  },

  applySuggestedTargets: async () => {
    try {
      const res = await api.nutriSuggestTargets();
      if (res?.suggested) {
        await get().saveTargets(res.suggested);
        return {
          weight: res.profileData.weight,
          goal: res.profileData.goal,
        };
      }
      return null;
    } catch (e) {
      set({ error: (e as Error).message });
      return null;
    }
  },

  openAddMeal: (meal: NutriMealType) => set({ addingMeal: meal }),
  closeAddMeal: () => set({ addingMeal: null }),
  setSettingsOpen: (settingsOpen: boolean) => set({ settingsOpen }),
  setEditingFood: (editingFood: NutriFoodLibraryEntry | null) => set({ editingFood }),
  setRecipeModalOpen: (recipeModalOpen: boolean) => set({ recipeModalOpen }),
  setEditingRecipe: (editingRecipe: NutriRecipe | null) => set({ editingRecipe }),
}));
