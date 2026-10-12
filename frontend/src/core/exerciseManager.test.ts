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

  describe("perfil y registro de pesos", () => {
    it("devuelve valores por defecto cuando no existe perfil", () => {
      const profile = em.getProfile();
      expect(profile).toEqual({
        goal: "salud",
        goal_note: "",
        weight_history: [],
      });
    });

    it("guarda y actualiza el objetivo del perfil", () => {
      const updated = em.saveProfile({
        goal: "hipertrofia",
        goal_note: "Enfocado en masa muscular y tren superior",
      });
      expect(updated.goal).toBe("hipertrofia");
      expect(updated.goal_note).toBe("Enfocado en masa muscular y tren superior");

      // Verificamos persistencia
      const loaded = em.getProfile();
      expect(loaded.goal).toBe("hipertrofia");
      expect(loaded.goal_note).toBe("Enfocado en masa muscular y tren superior");
    });

    it("registra pesajes, actualiza fecha existente y ordena cronológicamente", () => {
      em.addWeightEntry("2026-05-10", 75.2);
      em.addWeightEntry("2026-05-01", 76.0);
      em.addWeightEntry("2026-05-15", 74.8);

      let profile = em.getProfile();
      expect(profile.weight_history).toEqual([
        { date: "2026-05-01", weight: 76.0 },
        { date: "2026-05-10", weight: 75.2 },
        { date: "2026-05-15", weight: 74.8 },
      ]);

      // Sobreescribir pesaje del mismo día
      em.addWeightEntry("2026-05-10", 75.0);
      profile = em.getProfile();
      expect(profile.weight_history.find((w) => w.date === "2026-05-10")?.weight).toBe(75.0);

      // Eliminar un pesaje
      em.removeWeightEntry("2026-05-01");
      profile = em.getProfile();
      expect(profile.weight_history.length).toBe(2);
      expect(profile.weight_history[0].date).toBe("2026-05-10");
    });
  });
});

