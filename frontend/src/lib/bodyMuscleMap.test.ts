import { describe, expect, it } from "vitest";
import { BODY_BACK_SHAPES, BODY_FRONT_SHAPES } from "./bodyAsset";
import { LEGACY_TO_GRANULAR } from "./muscles";
import {
  MUSCLE_ALIAS, NON_INTERACTIVE, SHAPE_MUSCLE, mappingProblems, musclesWithShapes,
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

  // Un músculo de la lista revisada está «cubierto» si el asset dibuja su forma, o
  // si algún puente lo manda a una forma que sí se dibuja. Hay dos puentes y
  // ambos cuentan: `MUSCLE_ALIAS` para el vocabulario del catálogo y
  // `LEGACY_TO_GRANULAR` para el tuyo, que es el que usa el mapa de verdad.
  const cubiertos = (id: string, drawn: Set<string>) =>
    drawn.has(id) ||
    Boolean(MUSCLE_ALIAS[id]) ||
    Boolean(LEGACY_TO_GRANULAR[id]);

  it("cada músculo de la lista revisada se puede pintar: forma propia o alias declarado", () => {
    const drawn = new Set(musclesWithShapes().map((m) => m.id));
    const missing = REVIEW_IDS.filter((id) => !cubiertos(id, drawn));
    expect(missing).toEqual([]);
    // Y el alias apunta siempre a algo que sí existe.
    for (const [gap, target] of Object.entries(MUSCLE_ALIAS)) {
      expect(REVIEW_IDS).toContain(gap);
      expect(drawn.has(target)).toBe(true);
    }
  });

  it("estos siete músculos no tienen forma propia, y todos están cubiertos", () => {
    // La lista de los que no se dibujan tal cual. El test de arriba comprueba que
    // no queda ninguno sin cubrir; este fija cuáles son, para que un cambio en el
    // asset se note.
    //
    // `abductors` está en la lista porque el asset no tiene forma de abductor, y
    // eso **no** es un hueco: se pinta con el glúteo medio desde
    // `LEGACY_TO_GRANULAR`. Antes estaba además en `MUSCLE_ALIAS`, que era una
    // segunda fuente de verdad, y `resolveMuscle()` —la única función que leía
    // esa tabla— no la usaba nadie.
    const drawn = new Set(musclesWithShapes().map((m) => m.id));
    expect(REVIEW_IDS.filter((id) => !drawn.has(id)).sort()).toEqual([
      "abductors", "brachialis", "calves-front", "quads-vastus-lateralis",
      "quads-vastus-medialis", "rotator-cuff", "teres",
    ]);
    for (const id of REVIEW_IDS.filter((x) => !drawn.has(x))) {
      expect(cubiertos(id, drawn)).toBe(true);
    }
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

  it("cada alias apunta a un músculo que el asset dibuja", () => {
    // La tabla en sí no enciende nada —eso lo hace `expandMuscles` en
    // `muscles.ts`. Lo que sí tiene que cumplirse es que ningún alias apunte al
    // vacío: apuntaría a un músculo que nadie dibujaría.
    const huerfanos = Object.entries(MUSCLE_ALIAS).filter(
      ([, target]) => !shapesForMuscle(target).length,
    );
    expect(huerfanos).toEqual([]);
  });
});
