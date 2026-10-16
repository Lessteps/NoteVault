/**
 * Escáner y Parser de Etiquetas Nutricionales por Visión IA
 *
 * Recibe una imagen (data URL o base64) de una tabla de información nutricional,
 * emite un prompt especializado y extrae de forma tolerante los valores por porción.
 */

import type { ScannedNutritionLabel } from "../lib/nutritionTypes";

export const SCAN_LABEL_SYSTEM_PROMPT =
  "Eres un experto en lectura óptica y análisis de tablas de información nutricional para NoteVault.\n" +
  "Tu tarea es leer con extrema precisión los datos nutricionales que aparecen en la fotografía de la etiqueta o envase.\n\n" +
  "INSTRUCCIONES CLAVE:\n" +
  "1. Prioriza los valores 'Por porción' o 'Por 100g' si la porción no está claramente indicada.\n" +
  "2. Extrae: Nombre del producto (si se ve), Tamaño de porción, Unidad (g, ml, unidad), Valor energético (kcal), Proteínas (g), Carbohidratos totales (g) y Grasas totales (g).\n" +
  "3. Devuelve ÚNICAMENTE un bloque JSON válido con el formato exacto especificado a continuación, sin texto antes ni después.\n\n" +
  "FORMATO JSON REQUERIDO:\n" +
  "{\n" +
  '  "product_name": "Nombre o tipo de producto deducido",\n' +
  '  "serving_size": 30,\n' +
  '  "serving_unit": "g",\n' +
  '  "calories": 140,\n' +
  '  "protein": 24,\n' +
  '  "carbs": 3,\n' +
  '  "fat": 2,\n' +
  '  "category": "Proteínas" | "Carbohidratos" | "Lácteos" | "Snacks" | "Grasas" | "General",\n' +
  '  "brand": "Marca (si se lee)",\n' +
  '  "notes": "Información complementaria relevante de la porción"\n' +
  "}";

export function parseScannedLabelResponse(rawText: string): ScannedNutritionLabel {
  const text = String(rawText || "").trim();

  let jsonString = text;
  const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (match && match[1]) {
    jsonString = match[1].trim();
  } else {
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
    throw new Error(`No se pudo interpretar la respuesta visual de la IA como JSON: ${(err as Error).message}`);
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("El resultado visual no contiene un objeto válido.");
  }

  return {
    product_name: String(parsed.product_name || "Alimento escaneado").trim() || "Alimento escaneado",
    serving_size: Math.max(0.1, Number(parsed.serving_size) || 100),
    serving_unit: String(parsed.serving_unit || "g").trim() || "g",
    calories: Math.max(0, Math.round(Number(parsed.calories) || 0)),
    protein: Math.max(0, Number(Number(parsed.protein || 0).toFixed(1))),
    carbs: Math.max(0, Number(Number(parsed.carbs || 0).toFixed(1))),
    fat: Math.max(0, Number(Number(parsed.fat || 0).toFixed(1))),
    category: parsed.category ? String(parsed.category).trim() : undefined,
    brand: parsed.brand ? String(parsed.brand).trim() : undefined,
    notes: parsed.notes ? String(parsed.notes).trim() : undefined,
  };
}
