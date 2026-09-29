import { describe, expect, it } from "vitest";
import { MUSCLES as CORE_MUSCLES, MUSCLE_GROUPS as CORE_GROUPS } from "../core/exerciseMuscles";
import {
  MUSCLES, MUSCLE_GROUPS, bestView, muscleMapData, musclesOfExercise, type MuscleExercise,
} from "./muscles";

const ex = (id: string, primary: string[], secondary: string[] = [], done = false): MuscleExercise =>
  ({ id, name: id, primary, secondary, done });

describe("catálogo de músculos", () => {
  it("el espejo del renderer coincide con el catálogo de core", () => {
    // If this fails, the ids on disk and the ones the map paints have drifted.
    expect(MUSCLES).toEqual(CORE_MUSCLES);
    expect(MUSCLE_GROUPS).toEqual(CORE_GROUPS);
  });

  it("18 músculos, ids únicos y 9 por vista", () => {
    expect(MUSCLES).toHaveLength(18);
    expect(new Set(MUSCLES.map((m) => m.id)).size).toBe(18);
    expect(MUSCLES.filter((m) => m.view === "front")).toHaveLength(9);
    expect(MUSCLES.filter((m) => m.view === "back")).toHaveLength(9);
    for (const m of MUSCLES) {
      expect(m.name_es).toBeTruthy();
      expect(MUSCLE_GROUPS).toContain(m.group);
    }
  });

  it("los ids son los del brief", () => {
    expect(MUSCLES.map((m) => m.id)).toEqual([
      "pectoral", "deltoid-front", "biceps", "forearm", "abs", "obliques", "neck", "quads", "adductors",
      "trapezius", "deltoid-rear", "triceps", "lats", "lower-back", "glutes", "hamstrings", "abductors", "calves",
    ]);
  });
});

describe("musclesOfExercise", () => {
  it("junta primarios y secundarios sin repetir", () => {
    expect(musclesOfExercise({ primary: ["quads"], secondary: ["quads", "glutes"] })).toEqual(["quads", "glutes"]);
  });

  it("aguanta un ejercicio sin músculos", () => {
    expect(musclesOfExercise({})).toEqual([]);
  });
});

describe("muscleMapData", () => {
  it("pendiente con primario, verde cuando todos los primarios están hechos", () => {
    const a = muscleMapData([ex("squat", ["quads"], [], false)]);
    expect(a.states.quads).toBe("primary");
    const b = muscleMapData([ex("squat", ["quads"], [], true)]);
    expect(b.states.quads).toBe("done");
  });

  it("el secundario va en tono bajo y también verde al terminar", () => {
    const a = muscleMapData([ex("squat", ["quads"], ["glutes"], false)]);
    expect(a.states.glutes).toBe("secondary");
    const b = muscleMapData([ex("squat", ["quads"], ["glutes"], true)]);
    expect(b.states.glutes).toBe("done");
  });

  it("en cuanto un ejercicio lo entrena, el músculo está en verde", () => {
    const data = muscleMapData([ex("a", ["quads"], [], true), ex("b", ["quads"], [], false)]);
    expect(data.states.quads).toBe("done");
    const none = muscleMapData([ex("a", ["quads"], [], false), ex("b", ["quads"], [], false)]);
    expect(none.states.quads).toBe("primary");
  });

  it("primario gana a secundario para el mismo músculo", () => {
    const data = muscleMapData([ex("a", ["quads"], [], false), ex("b", [], ["quads"], true)]);
    expect(data.states.quads).toBe("primary");
  });

  it("un músculo que nadie toca queda apagado", () => {
    const data = muscleMapData([ex("squat", ["quads"])]);
    expect(data.states.biceps).toBe("idle");
    expect(data.states.calves).toBe("idle");
  });

  it("los ejercicios sin músculos van a la lista de sin asignar, nunca se pierden", () => {
    const data = muscleMapData([ex("squat", ["quads"]), ex("calentamiento", [], [])]);
    expect(data.unassigned.map((e) => e.id)).toEqual(["calentamiento"]);
  });

  it("por músculo, primero los primarios", () => {
    const data = muscleMapData([ex("b", [], ["quads"]), ex("a", ["quads"])]);
    expect(data.byMuscle.quads.map((e) => e.id)).toEqual(["a", "b"]);
  });

  it("cuenta activos por vista y elige la que más tiene", () => {
    const data = muscleMapData([ex("squat", ["quads"], ["glutes", "hamstrings", "calves"])]);
    expect(data.active).toEqual({ front: 1, back: 3 });
    expect(bestView(data)).toBe("back");
    expect(bestView(muscleMapData([ex("bench", ["pectoral"])]))).toBe("front");
  });
});
