import { describe, expect, it } from "vitest";
import { normalizeCoachDay, splitCoachAction } from "./exerciseCoachActions.js";

describe("exerciseCoachActions", () => {
  it("normaliza nombres de días con tildes y mayúsculas", () => {
    expect(normalizeCoachDay("Miércoles")).toBe("miercoles");
    expect(normalizeCoachDay("SÁBADO")).toBe("sabado");
    expect(normalizeCoachDay("viernes")).toBe("viernes");
    expect(normalizeCoachDay("invalid")).toBeNull();
  });

  it("extrae una acción coach-action válida de un mensaje", () => {
    const raw = `Te preparé estos ejercicios para el viernes:

\`\`\`coach-action
{
  "action": "add_exercise",
  "day": "Viernes",
  "exercises": [
    {
      "name": "Sentadilla búlgara",
      "series_reps": "3x10",
      "rest": "90s",
      "how_to": "Torso inclinado a 45 grados."
    },
    {
      "name": "Extensiones de cuádriceps",
      "series_reps": "3x12",
      "rest": "60s"
    }
  ]
}
\`\`\`

¡A darle duro a esas piernas!`;

    const res = splitCoachAction(raw);
    expect(res.action).not.toBeNull();
    expect(res.action?.action).toBe("add_exercise");
    expect(res.action?.day).toBe("viernes");
    expect(res.action?.exercises.length).toBe(2);
    expect(res.action?.exercises[0]?.name).toBe("Sentadilla búlgara");
    // El texto resultante no contiene el bloque JSON crudo
    expect(res.text).toContain("Te preparé estos ejercicios para el viernes:");
    expect(res.text).toContain("¡A darle duro a esas piernas!");
    expect(res.text).not.toContain("```coach-action");
  });

  it("devuelve null cuando no hay bloque de acción", () => {
    const raw = "Solo una consulta sobre nutrición y descanso.";
    const res = splitCoachAction(raw);
    expect(res.action).toBeNull();
    expect(res.text).toBe(raw);
  });

  it("extrae una acción add_to_library válida de un mensaje", () => {
    const raw = `Te sugiero guardar esta variante en tu biblioteca:

\`\`\`coach-action
{
  "action": "add_to_library",
  "exercise": {
    "name": "Press Svend",
    "equipment": "dumbbell",
    "muscles": { "primary": ["pecho"], "secondary": ["tríceps", "hombros"] },
    "how_to": "Presionar dos mancuernas contra el pecho y empujar hacia el frente."
  }
}
\`\`\`

Es excelente para congestión isométrica.`;

    const res = splitCoachAction(raw);
    expect(res.action).not.toBeNull();
    expect(res.action?.action).toBe("add_to_library");
    if (res.action?.action === "add_to_library") {
      expect(res.action.exercise.name).toBe("Press Svend");
      expect(res.action.exercise.equipment).toBe("dumbbell");
      expect(res.action.exercise.muscles?.primary).toEqual(["pecho"]);
    }
    expect(res.text).toContain("Te sugiero guardar esta variante en tu biblioteca:");
    expect(res.text).toContain("Es excelente para congestión isométrica.");
    expect(res.text).not.toContain("```coach-action");
  });

  it("extrae una acción remove_exercise válida de un mensaje", () => {
    const raw = `El ejercicio que debes quitar de inmediato es el Romanian Deadlift.

\`\`\`coach-action
{
  "action": "remove_exercise",
  "day": "martes",
  "exercise_name": "Romanian Deadlift"
}
\`\`\`

Haz clic para actualizar tu rutina.`;

    const res = splitCoachAction(raw);
    expect(res.action).not.toBeNull();
    expect(res.action?.action).toBe("remove_exercise");
    if (res.action?.action === "remove_exercise") {
      expect(res.action.day).toBe("martes");
      expect(res.action.exercise_name).toBe("Romanian Deadlift");
    }
    expect(res.text).toContain("El ejercicio que debes quitar de inmediato");
    expect(res.text).not.toContain("```coach-action");
  });

  it("extrae una acción remove_from_library válida de un mensaje", () => {
    const raw = `Te sugiero eliminar esa variante obsoleta de tu biblioteca:

\`\`\`coach-action
{
  "action": "remove_from_library",
  "exercise_name": "Press Svend",
  "slug": "mia-press-svend"
}
\`\`\`

Haz clic para confirmar el borrado.`;

    const res = splitCoachAction(raw);
    expect(res.action).not.toBeNull();
    expect(res.action?.action).toBe("remove_from_library");
    if (res.action?.action === "remove_library" || res.action?.action === "remove_from_library") {
      expect(res.action.exercise_name).toBe("Press Svend");
      expect(res.action.slug).toBe("mia-press-svend");
    }
    expect(res.text).toContain("Te sugiero eliminar esa variante");
    expect(res.text).not.toContain("```coach-action");
  });

  it("extrae una acción record_weight válida de un mensaje", () => {
    const raw = `Anotemos tu pesaje de hoy:

\`\`\`coach-action
{
  "action": "record_weight",
  "weight": 76.5,
  "date": "2026-10-13"
}
\`\`\`

¡Excelente constancia!`;

    const res = splitCoachAction(raw);
    expect(res.action).not.toBeNull();
    expect(res.action?.action).toBe("record_weight");
    if (res.action?.action === "record_weight") {
      expect(res.action.weight).toBe(76.5);
      expect(res.action.date).toBe("2026-10-13");
    }
    expect(res.text).toContain("Anotemos tu pesaje de hoy:");
    expect(res.text).not.toContain("```coach-action");
  });
});
