import { describe, expect, it } from "vitest";
import { splitNutritionAction } from "./nutritionCoachActions";

describe("splitNutritionAction", () => {
  it("retorna texto limpio cuando no hay bloque de acción", () => {
    const res = splitNutritionAction("Hola, ¿cómo estás?");
    expect(res.text).toBe("Hola, ¿cómo estás?");
    expect(res.action).toBeNull();
  });

  it("parsea correctamente una acción add_meal_item", () => {
    const raw = `Te calculé el almuerzo:
\`\`\`nutrition-action
{
  "action": "add_meal_item",
  "meal": "almuerzo",
  "item": {
    "name": "Pechuga con arroz",
    "amount": 250,
    "unit": "g",
    "calories": 420,
    "protein": 45.5,
    "carbs": 48.2,
    "fat": 5.1
  }
}
\`\`\`
¡Podés agregarlo con un clic!`;

    const res = splitNutritionAction(raw);
    expect(res.text).toContain("Te calculé el almuerzo:");
    expect(res.text).toContain("¡Podés agregarlo con un clic!");
    expect(res.text).not.toContain("nutrition-action");
    expect(res.action).toEqual({
      action: "add_meal_item",
      meal: "almuerzo",
      item: {
        name: "Pechuga con arroz",
        amount: 250,
        unit: "g",
        calories: 420,
        protein: 45.5,
        carbs: 48.2,
        fat: 5.1,
      },
    });
  });

  it("parsea correctamente una acción set_water", () => {
    const raw = `Actualicé tu consumo de agua:
\`\`\`nutrition-action
{
  "action": "set_water",
  "water_ml": 2250
}
\`\`\``;

    const res = splitNutritionAction(raw);
    expect(res.action).toEqual({
      action: "set_water",
      water_ml: 2250,
    });
  });

  it("parsea correctamente una acción add_food_to_pantry", () => {
    const raw = `Te guardo esta receta en la despensa:
\`\`\`nutrition-action
{
  "action": "add_food_to_pantry",
  "entry": {
    "name": "Pudding de chía proteico",
    "serving_size": 1,
    "serving_unit": "vaso",
    "calories": 210,
    "protein": 18,
    "carbs": 15,
    "fat": 8,
    "category": "Snacks"
  }
}
\`\`\``;

    const res = splitNutritionAction(raw);
    expect(res.action).toEqual({
      action: "add_food_to_pantry",
      entry: {
        name: "Pudding de chía proteico",
        serving_size: 1,
        serving_unit: "vaso",
        calories: 210,
        protein: 18,
        carbs: 15,
        fat: 8,
        category: "Snacks",
      },
    });
  });

  it("tolera JSON malformado o incompleto sin romper", () => {
    const raw = "Respuesta en streaming: ```nutrition-action {\"action\": \"add_meal_item\"";
    const res = splitNutritionAction(raw);
    expect(res.action).toBeNull();
  });
});
