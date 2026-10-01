import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ExerciseManager } from "./exerciseManager";

describe("ExerciseManager", () => {
  let tempDir: string;
  let em: ExerciseManager;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "nv-exercise-test-"));
    em = new ExerciseManager(tempDir);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("starts with an empty program and organizes by day", () => {
    // Antes venían 50 ejercicios por defecto en el código. El programa lo
    // monta quien lo usa, a partir de la Biblioteca.
    expect(em.exercises().length).toBe(0);
    expect(em.exercises_for_day("lunes")).toEqual([]);
    expect(em.exercises_for_day("domingo")).toEqual([]);

    // Y al añadir uno, ya solo él.
    const ex = em.add_exercise("Press banca", "lunes", "", "4x5", "", "");
    expect(em.exercises_for_day("lunes").map((e) => e.name)).toEqual(["Press banca"]);
    expect(em.exercises_for_day("martes")).toEqual([]);
    expect(ex.id).toBeTruthy();
  });

  it("logs workouts and computes day completion percentage", () => {
    const d = new Date(2026, 8, 14); // lunes
    // El programa arranca vacío, así que el día se monta en el test.
    const a = em.add_exercise("Press banca", "lunes", "", "", "", "");
    const b = em.add_exercise("Pull-ups", "lunes", "", "", "", "");
    em.add_exercise("Trote", "martes", "", "", "", "");
    expect(em.day_pct(d)).toBe(0.0);

    em.set_entry(d, a.id, { done: true, reps: 10, weight: 80 });
    const log = em.day(d);
    expect(log[a.id]?.done).toBe(true);
    expect(log[a.id]?.weight).toBe(80);
    expect(em.day_pct(d)).toBeCloseTo(0.5, 5);

    em.set_entry(d, b.id, { done: true, reps: 5, weight: 0 });
    expect(em.day_pct(d)).toBeCloseTo(1.0, 5);
  });

  it("adds, updates and removes exercises", () => {
    const ex = em.add_exercise("Nuevo ejercicio", "lunes", "", "4 series x 12", "", "Usar mancuernas");
    expect(em.get_exercise(ex.id)?.name).toBe("Nuevo ejercicio");

    em.update_exercise(ex.id, { how_to: "Nueva instrucción" });
    expect(em.get_exercise(ex.id)?.how_to).toBe("Nueva instrucción");

    expect(em.delete_exercise(ex.id)).toBe(true);
    expect(em.get_exercise(ex.id)).toBeNull();
  });

  describe("Golden byte conformance", () => {
    it("matches golden exercise day JSON byte-for-byte", () => {
      const goldenPath = path.resolve(
        __dirname,
        "__golden__/.notevault/ejercicio/2026/09/2026-09-12.json",
      );
      if (!fs.existsSync(goldenPath)) return;

      const goldenBuf = fs.readFileSync(goldenPath);
      const d = new Date(2026, 8, 12);

      em.set_entry(d, "lunes_0", {
        done: true,
        weight: 60.0,
        reps: 5,
        notes: "fácil",
      });

      const generatedBuf = fs.readFileSync(em.day_path(d));
      expect(generatedBuf.equals(goldenBuf)).toBe(true);
    });
  });
});
