import { describe, expect, it } from "vitest";
import {
  calculateWeeklyVolume,
  classifyVolumeLevel,
  inferMuscleGroups,
  parseExerciseSets,
} from "./volumeCalculator";
import type { Exercise, ExerciseDay } from "./types";

describe("volumeCalculator", () => {
  describe("parseExerciseSets", () => {
    it("parses 4x10 and 3 x 8-12 formats", () => {
      expect(parseExerciseSets("4x10")).toBe(4);
      expect(parseExerciseSets("3 x 8-12")).toBe(3);
      expect(parseExerciseSets("5*5")).toBe(5);
      expect(parseExerciseSets("4 × 12")).toBe(4);
    });

    it("parses single integer", () => {
      expect(parseExerciseSets("4")).toBe(4);
      expect(parseExerciseSets("5 series")).toBe(5);
    });

    it("falls back to 3 on missing or unparseable input", () => {
      expect(parseExerciseSets("")).toBe(3);
      expect(parseExerciseSets("al fallo")).toBe(3);
    });
  });

  describe("inferMuscleGroups", () => {
    it("maps explicit muscle IDs", () => {
      expect(inferMuscleGroups({ name: "Cualquier ejercicio", muscles: ["pectoral"] })).toEqual(["Pecho"]);
      expect(inferMuscleGroups({ name: "Cualquier ejercicio", muscles: ["lats", "biceps"] }).sort()).toEqual(["Brazos", "Espalda"]);
      expect(inferMuscleGroups({ name: "Cualquier ejercicio", muscles: ["quads", "glutes"] })).toEqual(["Piernas"]);
    });

    it("infers from common exercise keywords when muscles are not specified", () => {
      expect(inferMuscleGroups({ name: "Press de banca plano" })).toEqual(["Pecho"]);
      expect(inferMuscleGroups({ name: "Dominadas pronas" })).toEqual(["Espalda"]);
      expect(inferMuscleGroups({ name: "Sentadilla trasera con barra" })).toEqual(["Piernas"]);
      expect(inferMuscleGroups({ name: "Press militar con mancuernas" })).toEqual(["Hombros"]);
      expect(inferMuscleGroups({ name: "Curl de bíceps en banco Scott" })).toEqual(["Brazos"]);
      expect(inferMuscleGroups({ name: "Plancha abdominal isométrica" })).toEqual(["Core"]);
    });
  });

  describe("classifyVolumeLevel", () => {
    it("classifies under 6 sets as mantenimiento", () => {
      expect(classifyVolumeLevel(4).level).toBe("mantenimiento");
      expect(classifyVolumeLevel(5).levelLabel).toBe("Mantenimiento");
    });

    it("classifies 6 to 9 sets as minimo", () => {
      expect(classifyVolumeLevel(8).level).toBe("minimo");
      expect(classifyVolumeLevel(6).levelLabel).toBe("Estímulo base");
    });

    it("classifies 10 to 20 sets as optimo hipertrofia", () => {
      expect(classifyVolumeLevel(12).level).toBe("optimo");
      expect(classifyVolumeLevel(18).levelLabel).toBe("Óptimo hipertrofia");
    });

    it("classifies above 20 sets as alto", () => {
      expect(classifyVolumeLevel(22).level).toBe("alto");
      expect(classifyVolumeLevel(25).levelLabel).toBe("Volumen alto");
    });
  });

  describe("calculateWeeklyVolume", () => {
    const mockExercises: Exercise[] = [
      {
        id: "ex1",
        day: "lu",
        name: "Press de banca plano",
        video: "",
        video_path: "",
        series_reps: "4x10",
        rest: "90s",
        how_to: "",
        has_video: false,
        video_name: "",
        muscles: { primary: ["pectoral"], secondary: [] },
      },
      {
        id: "ex2",
        day: "lu",
        name: "Fondos en paralelas",
        video: "",
        video_path: "",
        series_reps: "3x12",
        rest: "90s",
        how_to: "",
        has_video: false,
        video_name: "",
        muscles: { primary: ["pectoral"], secondary: ["triceps"] },
      },
      {
        id: "ex3",
        day: "mi",
        name: "Sentadilla libre",
        video: "",
        video_path: "",
        series_reps: "4x8",
        rest: "120s",
        how_to: "",
        has_video: false,
        video_name: "",
        muscles: { primary: ["quads"], secondary: [] },
      },
    ];

    const mockWeekDays: ExerciseDay[] = [
      {
        date: "2026-10-12",
        day: "lu",
        exercises: [],
        pct: 50,
        log: {
          ex1: { done: true, weight: 80, reps: 10, notes: "" },
          ex2: { done: false, weight: 0, reps: 0, notes: "" },
        },
      },
      {
        date: "2026-10-14",
        day: "mi",
        exercises: [],
        pct: 100,
        log: {
          ex3: { done: true, weight: 100, reps: 8, notes: "" },
        },
      },
    ];

    it("calculates weekly planned and completed sets accurately", () => {
      const vol = calculateWeeklyVolume(mockExercises, mockWeekDays);

      // ex1 (4 sets Pecho) + ex2 (3 sets Pecho + 3 sets Brazos) + ex3 (4 sets Piernas) = 14 sets
      expect(vol.totalPlannedSets).toBe(14);
      expect(vol.totalCompletedSets).toBe(8); // ex1 (4) + ex3 (4)

      const chest = vol.groups.find((g) => g.group === "Pecho")!;
      expect(chest.plannedSets).toBe(7); // 4 + 3
      expect(chest.completedSets).toBe(4); // ex1 done, ex2 not done
      expect(chest.level).toBe("minimo");

      const arms = vol.groups.find((g) => g.group === "Brazos")!;
      expect(arms.plannedSets).toBe(3); // ex2 secondary triceps

      const legs = vol.groups.find((g) => g.group === "Piernas")!;
      expect(legs.plannedSets).toBe(4);
      expect(legs.completedSets).toBe(4);

      expect(vol.topFocusedGroup).toBe("Pecho");
    });
  });
});
