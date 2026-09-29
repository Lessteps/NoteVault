import { describe, expect, it } from "vitest";
import { BODY_BACK_SHAPES, BODY_FRONT_SHAPES } from "./bodyAsset";
import {
  MUSCLE_ALIAS, NON_INTERACTIVE, SHAPE_MUSCLE, mappingProblems, musclesWithShapes, resolveMuscle,
  shapeMuscle, shapesForMuscle, unassignedShapes,
} from "./bodyMuscleMap";

/** The muscle ids under review: the project's granular list, front + back. */
const REVIEW_FRONT = [
  "neck", "trapezius-upper", "deltoid-front", "deltoid-side", "pectoral-upper", "pectoral-lower",
  "biceps", "brachialis", "forearm-flexors", "forearm-extensors", "serratus", "abs-upper", "abs-lower",
  "obliques", "hip-flexors", "adductors", "quads-rectus-femoris", "quads-vastus-lateralis",
  "quads-vastus-medialis", "tibialis", "calves-front",
];
const REVIEW_BACK = [
  "trapezius-upper", "trapezius-mid", "trapezius-lower", "deltoid-rear", "rotator-cuff", "teres", "lats",
  "triceps", "forearm-extensors", "forearm-flexors", "lower-back", "glutes-max", "glutes-med", "abductors",
  "hamstrings-biceps-femris", "hamstrings-semi", "calves-gastrocnemius", "soleus",
];
const REVIEW_IDS = [...new Set([...REVIEW_FRONT, ...REVIEW_BACK])];

describe("mapa de formas → músculos", () => {
  it("el asset tiene 40 formas frontales y 49 dorsales", () => {
    expect(BODY_FRONT_SHAPES).toHaveLength(40);
    expect(BODY_BACK_SHAPES).toHaveLength(49);
  });

  it("no hay formas sin músculo, ni ids inventados, ni solapamientos", () => {
    expect(mappingProblems()).toEqual([]);
    expect(unassignedShapes()).toEqual([]);
  });

  it("cada forma está o mapeada o declarada no interactiva, nunca las dos cosas", () => {
    const total = BODY_FRONT_SHAPES.length + BODY_BACK_SHAPES.length;
    const nonInteractive = NON_INTERACTIVE.front.length + NON_INTERACTIVE.back.length;
    const mapped = Object.keys(SHAPE_MUSCLE.front).length + Object.keys(SHAPE_MUSCLE.back).length;
    expect(nonInteractive + mapped).toBe(total);
  });

  it("cada músculo de la lista revisada se puede pintar: forma propia o alias declarado", () => {
    const drawn = new Set(musclesWithShapes().map((m) => m.id));
    const missing = REVIEW_IDS.filter((id) => !drawn.has(id) && !MUSCLE_ALIAS[id]);
    expect(missing).toEqual([]);
    // Y el alias apunta siempre a algo que sí existe.
    for (const [gap, target] of Object.entries(MUSCLE_ALIAS)) {
      expect(REVIEW_IDS).toContain(gap);
      expect(drawn.has(target)).toBe(true);
    }
  });

  it("los huecos declarados son exactamente siete, ninguno inventado", () => {
    const drawn = new Set(musclesWithShapes().map((m) => m.id));
    expect(REVIEW_IDS.filter((id) => !drawn.has(id)).sort()).toEqual([
      "abductors", "brachialis", "calves-front", "quads-vastus-lateralis", "quads-vastus-medialis",
      "rotator-cuff", "teres",
    ]);
  });

  it("las piernas están presentes y separables en la vista donde se ven", () => {
    // Frontal: cuádriceps, aductores y tibial, cada uno con sus dos mitades.
    expect(shapesForMuscle("quads-rectus-femoris", "front")).toHaveLength(2);
    expect(shapesForMuscle("adductors", "front")).toHaveLength(2);
    expect(shapesForMuscle("tibialis", "front")).toHaveLength(2);
    // Dorsal: isquios partidos en dos (bíceps femoral / semis), glúteos partidos,
    // gemelos separados del sóleo.
    expect(shapesForMuscle("hamstrings-biceps-femris", "back")).toHaveLength(2);
    expect(shapesForMuscle("hamstrings-semi", "back")).toHaveLength(2);
    expect(shapesForMuscle("glutes-max", "back")).toHaveLength(2);
    expect(shapesForMuscle("glutes-med", "back")).toHaveLength(2);
    expect(shapesForMuscle("calves-gastrocnemius", "back")).toHaveLength(4);
    expect(shapesForMuscle("soleus", "back")).toHaveLength(2);
    // Y lo que no se ve en esa vista, no se ve: nada de aductores en la espalda.
    expect(shapesForMuscle("adductors", "back")).toEqual([]);
    expect(shapesForMuscle("hamstrings-biceps-femris", "front")).toEqual([]);
  });

  it("cabeza, manos, pies y articulaciones son no interactivas", () => {
    expect(shapeMuscle("front", "head")).toBeNull();
    expect(shapeMuscle("front", "hand-left")).toBeNull();
    expect(shapeMuscle("back", "knee-back-right")).toBeNull();
    expect(shapeMuscle("back", "spine")).toBeNull();
    expect(shapeMuscle("front", "chest-upper-left")).toBe("pectoral-upper");
  });

  it("resuelve los alias hacia una forma real", () => {
    expect(resolveMuscle("abductors")).toBe("glutes-med");
    expect(resolveMuscle("quads-vastus-lateralis")).toBe("quads-rectus-femoris");
    expect(resolveMuscle("biceps")).toBe("biceps");
  });
});
