import { describe, expect, it } from "vitest";
import { parseScannedLabelResponse } from "./nutritionLabelScanner";

describe("nutritionLabelScanner", () => {
  it("parsea correctamente un JSON de etiqueta nutricional", () => {
    const raw = JSON.stringify({
      product_name: "Yogur Griego Natural",
      serving_size: 150,
      serving_unit: "g",
      calories: 135,
      protein: 15,
      carbs: 6,
      fat: 5.5,
      category: "Lácteos",
      brand: "Danone",
    });

    const res = parseScannedLabelResponse(raw);
    expect(res.product_name).toBe("Yogur Griego Natural");
    expect(res.serving_size).toBe(150);
    expect(res.serving_unit).toBe("g");
    expect(res.calories).toBe(135);
    expect(res.protein).toBe(15);
    expect(res.carbs).toBe(6);
    expect(res.fat).toBe(5.5);
    expect(res.category).toBe("Lácteos");
  });

  it("extrae el JSON incluso con bloques markdown y explicaciones adyacentes", () => {
    const markdown =
      "He analizado la fotografía de la tabla nutricional:\n\n```json\n" +
      JSON.stringify({
        product_name: "Proteína Whey Vainilla",
        serving_size: 30,
        serving_unit: "g (1 scoop)",
        calories: 120,
        protein: 24,
        carbs: 2.5,
        fat: 1.5,
        category: "Proteínas",
      }) +
      "\n```\nLos datos fueron extraídos de la columna 'Por porción'.";

    const res = parseScannedLabelResponse(markdown);
    expect(res.product_name).toBe("Proteína Whey Vainilla");
    expect(res.serving_size).toBe(30);
    expect(res.calories).toBe(120);
    expect(res.protein).toBe(24);
  });

  it("lanza un error claro si la respuesta no contiene un formato compatible", () => {
    expect(() => parseScannedLabelResponse("La imagen está demasiado borrosa para leer la tabla.")).toThrow(
      /No se pudo interpretar la respuesta visual/,
    );
  });
});
