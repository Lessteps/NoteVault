import { describe, expect, it } from "vitest";
import { parseEstimatedDishResponse } from "./nutritionMealEstimator";

describe("nutritionMealEstimator", () => {
  it("parsea un JSON directo y calcula los totales correctamente", () => {
    const raw = JSON.stringify({
      dish_name: "Milanesa con puré y huevo",
      confidence: "alta",
      summary: "Porción de restaurante estándar",
      total_calories: 680,
      total_protein: 42,
      total_carbs: 58,
      total_fat: 26,
      ingredients: [
        { name: "Milanesa de pollo", amount: 180, unit: "g", calories: 340, protein: 32, carbs: 16, fat: 14 },
        { name: "Puré de papas", amount: 200, unit: "g", calories: 240, protein: 4, carbs: 41, fat: 5 },
        { name: "Huevo frito", amount: 1, unit: "unidad", calories: 100, protein: 6, carbs: 1, fat: 7 },
      ],
    });

    const res = parseEstimatedDishResponse(raw);
    expect(res.dish_name).toBe("Milanesa con puré y huevo");
    expect(res.confidence).toBe("alta");
    expect(res.total_calories).toBe(680);
    expect(res.ingredients).toHaveLength(3);
    expect(res.ingredients[0]!.name).toBe("Milanesa de pollo");
  });

  it("extrae el JSON incluso si la IA responde con bloques markdown ```json ... ```", () => {
    const markdown =
      "Aquí tienes la estimación para tu plato:\n\n```json\n" +
      JSON.stringify({
        dish_name: "Sushi variado (12 piezas)",
        confidence: "media",
        summary: "Rolls de salmón y palta",
        total_calories: 480,
        total_protein: 20,
        total_carbs: 75,
        total_fat: 9,
        ingredients: [
          { name: "Rolls de salmón", amount: 8, unit: "piezas", calories: 320, protein: 15, carbs: 50, fat: 6 },
          { name: "Nigiris de salmón", amount: 4, unit: "piezas", calories: 160, protein: 5, carbs: 25, fat: 3 },
        ],
      }) +
      "\n```\nBuen provecho!";

    const res = parseEstimatedDishResponse(markdown);
    expect(res.dish_name).toBe("Sushi variado (12 piezas)");
    expect(res.total_calories).toBe(480);
    expect(res.ingredients).toHaveLength(2);
  });

  it("calcula totales sumando ingredientes si el JSON no incluía totales explícitos", () => {
    const raw = JSON.stringify({
      dish_name: "Tostadas con palta y huevo",
      ingredients: [
        { name: "Pan integral", amount: 2, unit: "rebanadas", calories: 160, protein: 6, carbs: 28, fat: 2 },
        { name: "Palta pisada", amount: 80, unit: "g", calories: 130, protein: 1.5, carbs: 7, fat: 12 },
        { name: "Huevo poché", amount: 1, unit: "unidad", calories: 75, protein: 6.5, carbs: 0.5, fat: 5 },
      ],
    });

    const res = parseEstimatedDishResponse(raw);
    expect(res.dish_name).toBe("Tostadas con palta y huevo");
    // 160 + 130 + 75 = 365
    expect(res.total_calories).toBe(365);
    expect(res.total_protein).toBe(14); // 6 + 1.5 + 6.5
    expect(res.total_fat).toBe(19); // 2 + 12 + 5
  });

  it("lanza un error claro si la respuesta no contiene JSON válido", () => {
    expect(() => parseEstimatedDishResponse("Disculpa, no entendí qué comida mencionaste.")).toThrow(
      /No se pudo interpretar la respuesta de la IA como JSON válido/,
    );
  });
});
