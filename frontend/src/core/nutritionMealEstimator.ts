/**
 * Estimador Inteligente de Platos y Macros por Lenguaje Natural
 *
 * Transforma una descripción informal del usuario (ej: "Milanesa de pollo con puré de papas y un huevo frito")
 * en una estimación estructurada y realista de alimentos, calorías y macronutrientes.
 */

import type { EstimatedDishResult, EstimatedIngredient } from "../lib/nutritionTypes";

export const ESTIMATE_DISH_SYSTEM_PROMPT =
  "Eres un experto en nutrición y composición de alimentos para NoteVault. " +
  "Tu objetivo es estimar de forma realista y precisa las calorías y macronutrientes de un plato o comida " +
  "a partir de una descripción en lenguaje natural que te brinde el usuario.\n\n" +
  "REGLAS OBLIGATORIAS:\n" +
  "1. Devuelve ÚNICAMENTE un bloque JSON válido con el formato exacto especificado más abajo, sin explicaciones, sin texto antes ni después.\n" +
  "2. Desglosa los ingredientes principales con cantidades razonables de una porción estándar de restaurante / comida casera.\n" +
  "3. Los números de calorías y macros deben ser coherentes (1g P = 4 kcal, 1g C = 4 kcal, 1g G = 9 kcal aprox).\n\n" +
  "FORMATO JSON REQUERIDO:\n" +
  "{\n" +
  '  "dish_name": "Nombre conciso y claro del plato",\n' +
  '  "confidence": "alta" | "media" | "estimada",\n' +
  '  "summary": "Breve nota sobre la porción o método de cocción estimado",\n' +
  '  "total_calories": 650,\n' +
  '  "total_protein": 38,\n' +
  '  "total_carbs": 55,\n' +
  '  "total_fat": 24,\n' +
  '  "ingredients": [\n' +
  '    { "name": "Milanesa de pollo al horno", "amount": 180, "unit": "g", "calories": 320, "protein": 32, "carbs": 14, "fat": 12 },\n' +
  '    { "name": "Puré de papas con manteca y leche", "amount": 200, "unit": "g", "calories": 240, "protein": 4, "carbs": 39, "fat": 7 },\n' +
  '    { "name": "Huevo frito", "amount": 1, "unit": "unidad", "calories": 90, "protein": 6, "carbs": 0.5, "fat": 7 }\n' +
  "  ]\n" +
  "}";

/**
 * Parsea y sanitiza la respuesta de la IA extrayendo el JSON del plato estimado
 */
export function parseEstimatedDishResponse(rawText: string, fallbackName = "Plato estimado"): EstimatedDishResult {
  const text = String(rawText || "").trim();

  // Intentar extraer bloque JSON si viene envuelto en markdown ```json ... ```
  let jsonString = text;
  const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (match && match[1]) {
    jsonString = match[1].trim();
  } else {
    // Si no tiene bloques de código, buscar la primera llave { y la última }
    const firstBrace = text.indexOf("{");
    const lastBrace = text.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      jsonString = text.slice(firstBrace, lastBrace + 1);
    }
  }

  let parsed: any;
  try {
    parsed = JSON.parse(jsonString);
  } catch (err) {
    throw new Error(`No se pudo interpretar la respuesta de la IA como JSON válido: ${(err as Error).message}`);
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("El resultado de la IA no es un objeto válido.");
  }

  const rawIngredients = Array.isArray(parsed.ingredients) ? parsed.ingredients : [];
  const ingredients: EstimatedIngredient[] = rawIngredients.map((i: any) => ({
    name: String(i.name || "Ingrediente").trim(),
    amount: Math.max(0.1, Number(i.amount) || 1),
    unit: String(i.unit || "porción").trim(),
    calories: Math.max(0, Math.round(Number(i.calories) || 0)),
    protein: Math.max(0, Number(Number(i.protein || 0).toFixed(1))),
    carbs: Math.max(0, Number(Number(i.carbs || 0).toFixed(1))),
    fat: Math.max(0, Number(Number(i.fat || 0).toFixed(1))),
  }));

  // Calcular totales sumando ingredientes si no vinieran
  let sumCal = ingredients.reduce((s, i) => s + i.calories, 0);
  let sumProt = Number(ingredients.reduce((s, i) => s + i.protein, 0).toFixed(1));
  let sumCarbs = Number(ingredients.reduce((s, i) => s + i.carbs, 0).toFixed(1));
  let sumFat = Number(ingredients.reduce((s, i) => s + i.fat, 0).toFixed(1));

  const total_calories = parsed.total_calories !== undefined ? Math.max(0, Math.round(Number(parsed.total_calories) || sumCal)) : sumCal;
  const total_protein = parsed.total_protein !== undefined ? Math.max(0, Number(Number(parsed.total_protein || sumProt).toFixed(1))) : sumProt;
  const total_carbs = parsed.total_carbs !== undefined ? Math.max(0, Number(Number(parsed.total_carbs || sumCarbs).toFixed(1))) : sumCarbs;
  const total_fat = parsed.total_fat !== undefined ? Math.max(0, Number(Number(parsed.total_fat || sumFat).toFixed(1))) : sumFat;

  return {
    dish_name: String(parsed.dish_name || fallbackName).trim() || fallbackName,
    confidence: parsed.confidence === "alta" || parsed.confidence === "media" ? parsed.confidence : "estimada",
    summary: String(parsed.summary || "").trim(),
    total_calories,
    total_protein,
    total_carbs,
    total_fat,
    ingredients,
  };
}
