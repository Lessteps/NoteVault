// Parser y tipos para las acciones ejecutables del Asesor Nutricional en el chat.
// Extrae bloques ```nutrition-action ... ``` y los desacopla del texto legible.

import type { NutriMealType } from "./nutritionTypes";

export interface AddMealItemAction {
  action: "add_meal_item";
  meal: NutriMealType;
  item: {
    name: string;
    amount?: number;
    unit?: string;
    calories?: number;
    protein?: number;
    carbs?: number;
    fat?: number;
  };
}

export interface SetWaterAction {
  action: "set_water";
  water_ml: number;
}

export interface AddFoodToPantryAction {
  action: "add_food_to_pantry";
  entry: {
    name: string;
    serving_size?: number;
    serving_unit?: string;
    calories?: number;
    protein?: number;
    carbs?: number;
    fat?: number;
    category?: string;
  };
}

export type NutritionAction = AddMealItemAction | SetWaterAction | AddFoodToPantryAction;

export interface ParsedNutritionMessage {
  text: string;
  action: NutritionAction | null;
}

export const NUTRITION_ACTION_RE = /```nutrition-action\s*([\s\S]*?)```/;

const VALID_MEALS: NutriMealType[] = ["desayuno", "almuerzo", "merienda", "cena", "snacks"];

export function splitNutritionAction(content: string): ParsedNutritionMessage {
  if (!content) return { text: "", action: null };

  const match = NUTRITION_ACTION_RE.exec(content);
  if (!match) {
    return { text: content, action: null };
  }

  const rawJson = match[1]?.trim();
  if (!rawJson) {
    return { text: content.replace(NUTRITION_ACTION_RE, "").trim(), action: null };
  }

  try {
    const parsed = JSON.parse(rawJson);
    if (parsed && typeof parsed === "object") {
      if (parsed.action === "add_meal_item" && parsed.item && typeof parsed.item === "object") {
        const meal = String(parsed.meal || "almuerzo").toLowerCase().trim() as NutriMealType;
        const rawItem = parsed.item as Record<string, unknown>;
        const name = String(rawItem.name || "").trim();
        if (name && VALID_MEALS.includes(meal)) {
          const textWithoutBlock = content.replace(NUTRITION_ACTION_RE, "").trim();
          return {
            text: textWithoutBlock,
            action: {
              action: "add_meal_item",
              meal,
              item: {
                name,
                amount: Math.max(0, Number(rawItem.amount) || 1),
                unit: String(rawItem.unit || "porción").trim(),
                calories: Math.max(0, Math.round(Number(rawItem.calories) || 0)),
                protein: Math.max(0, Number(Number(rawItem.protein || 0).toFixed(1))),
                carbs: Math.max(0, Number(Number(rawItem.carbs || 0).toFixed(1))),
                fat: Math.max(0, Number(Number(rawItem.fat || 0).toFixed(1))),
              },
            },
          };
        }
      } else if (parsed.action === "set_water" && parsed.water_ml !== undefined) {
        const water_ml = Math.max(0, Math.round(Number(parsed.water_ml) || 0));
        const textWithoutBlock = content.replace(NUTRITION_ACTION_RE, "").trim();
        return {
          text: textWithoutBlock,
          action: {
            action: "set_water",
            water_ml,
          },
        };
      } else if (parsed.action === "add_food_to_pantry" && parsed.entry && typeof parsed.entry === "object") {
        const rawE = parsed.entry as Record<string, unknown>;
        const name = String(rawE.name || "").trim();
        if (name) {
          const textWithoutBlock = content.replace(NUTRITION_ACTION_RE, "").trim();
          return {
            text: textWithoutBlock,
            action: {
              action: "add_food_to_pantry",
              entry: {
                name,
                serving_size: Math.max(1, Number(rawE.serving_size) || 100),
                serving_unit: String(rawE.serving_unit || "g").trim(),
                calories: Math.max(0, Math.round(Number(rawE.calories) || 0)),
                protein: Math.max(0, Number(Number(rawE.protein || 0).toFixed(1))),
                carbs: Math.max(0, Number(Number(rawE.carbs || 0).toFixed(1))),
                fat: Math.max(0, Number(Number(rawE.fat || 0).toFixed(1))),
                category: rawE.category ? String(rawE.category).trim() : undefined,
              },
            },
          };
        }
      }
    }
  } catch {
    /* JSON malformado durante streaming; se muestra como texto regular */
  }

  return { text: content, action: null };
}
