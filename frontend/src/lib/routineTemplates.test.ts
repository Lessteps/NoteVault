import { describe, expect, it } from "vitest";
import { ROUTINE_TEMPLATES } from "./routineTemplates";

describe("ROUTINE_TEMPLATES", () => {
  it("contiene 3 plantillas clásicas bien formadas", () => {
    expect(ROUTINE_TEMPLATES).toHaveLength(3);
    const ids = ROUTINE_TEMPLATES.map((t) => t.id);
    expect(ids).toEqual(["ppl", "upper-lower", "fullbody"]);
  });

  it("cada plantilla tiene días con ejercicios válidos", () => {
    for (const t of ROUTINE_TEMPLATES) {
      expect(t.name).toBeTruthy();
      expect(t.description).toBeTruthy();
      const days = Object.keys(t.days);
      expect(days.length).toBeGreaterThanOrEqual(3);

      for (const day of days) {
        const exs = t.days[day]!;
        expect(exs.length).toBeGreaterThan(0);
        for (const ex of exs) {
          expect(ex.name).toBeTruthy();
          expect(ex.slug).toBeTruthy();
          expect(ex.series_reps).toBeTruthy();
          expect(ex.rest).toBeTruthy();
        }
      }
    }
  });
});
