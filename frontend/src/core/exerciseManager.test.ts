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

  it("loads 50 default exercises and organizes by day", () => {
    const all = em.exercises();
    expect(all.length).toBe(50);

    const lunes = em.exercises_for_day("lunes");
    expect(lunes.length).toBe(10);
    expect(lunes[0]?.name).toBe("Calentamiento (Bench + OHP)");

    const domingo = em.exercises_for_day("domingo");
    expect(domingo.length).toBe(3);
  });

  it("logs workouts and computes day completion percentage", () => {
    const d = new Date(2026, 8, 14); // lunes
    const lunes = em.exercises_for_day("lunes");
    expect(em.day_pct(d)).toBe(0.0);

    em.set_entry(d, lunes[0]!.id, { done: true, reps: 10, weight: 80 });
    const log = em.day(d);
    expect(log[lunes[0]!.id]?.done).toBe(true);
    expect(log[lunes[0]!.id]?.weight).toBe(80);
    expect(em.day_pct(d)).toBeCloseTo(1 / 10, 5);
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
