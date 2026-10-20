/**
 * Escáner y Parser de Etiquetas Nutricionales por Visión IA
 *
 * Recibe una imagen (data URL o base64) de una tabla de información nutricional,
 * emite un prompt especializado y extrae de forma tolerante los valores por porción.
 */

import type { ScannedNutritionLabel } from "../lib/nutritionTypes";

export const SCAN_LABEL_SYSTEM_PROMPT =
  "Eres un experto en lectura óptica y análisis clínico/deportivo de tablas de información nutricional para NoteVault.\n" +
  "Tu tarea es:\n" +
  "1. Leer con extrema precisión los datos nutricionales que aparecen en la fotografía de la etiqueta o envase.\n" +
  "2. Evaluar el producto frente al perfil del usuario (objetivo nutricional, restricciones/alergias y peso) para determinar si se lo recomiendas o no.\n\n" +
  "CRITERIOS DE VEREDICTO:\n" +
  "- 'contraindicado': Si el alimento contiene ingredientes o alérgenos que el usuario tiene prohibidos o le caen mal (ej: lactosa, gluten, mariscos, etc.).\n" +
  "- 'moderacion': Si choca con su objetivo (ej: ultraprocesado alto en azúcares y grasas en déficit calórico) o aporta calorías vacías.\n" +
  "- 'recomendado': Si es nutricionalmente denso, aporta buena proteína/fibra y encaja con su objetivo.\n\n" +
  "FORMATO JSON REQUERIDO (responde ÚNICAMENTE este JSON sin texto adicional):\n" +
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
  '  "verdict": "recomendado" | "moderacion" | "contraindicado",\n' +
  '  "verdict_reason": "Explicación directa de 2 a 3 frases dirigida al usuario indicando por qué se le recomienda, desaconseja o pide moderación para su caso particular.",\n' +
  '  "pros": ["Punto a favor 1", "Punto a favor 2"],\n' +
  '  "cons": ["Punto en contra o precaución 1"]\n' +
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

  const verdict =
    parsed.verdict === "recomendado" || parsed.verdict === "moderacion" || parsed.verdict === "contraindicado"
      ? parsed.verdict
      : undefined;

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
    verdict,
    verdict_reason: parsed.verdict_reason ? String(parsed.verdict_reason).trim() : undefined,
    pros: Array.isArray(parsed.pros) ? parsed.pros.map((p: any) => String(p).trim()).filter(Boolean) : undefined,
    cons: Array.isArray(parsed.cons) ? parsed.cons.map((c: any) => String(c).trim()).filter(Boolean) : undefined,
  };
}
