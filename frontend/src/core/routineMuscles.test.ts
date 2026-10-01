import { describe, expect, test } from "vitest";
import { DEFAULT_EXERCISES } from "./exerciseDefaults";
import { ROUTINE_MUSCLES } from "./routineMuscles";
import { MUSCLE_IDS, MUSCLES } from "./exerciseMuscles.js";

const ids = new Set(MUSCLE_IDS);

describe("routineMuscles", () => {
  test("cubre todos los ejercicios de la rutina por defecto", () => {
    const missing = DEFAULT_EXERCISES.filter((e) => !(e.id in ROUTINE_MUSCLES));
    expect(missing.map((e) => e.id)).toEqual([]);
  });

  test("no inventa ejercicios que la rutina no tiene", () => {
    const extra = Object.keys(ROUTINE_MUSCLES).filter(
      (id) => !DEFAULT_EXERCISES.some((e) => e.id === id),
    );
    expect(extra).toEqual([]);
  });

  test("solo usa ids de músculo que existen en el catálogo", () => {
    const bad: string[] = [];
    for (const m of Object.values(ROUTINE_MUSCLES)) {
      if (!m) continue;
      for (const id of [...m.primary, ...m.secondary]) {
        if (!ids.has(id)) bad.push(id);
      }
    }
    expect([...new Set(bad)]).toEqual([]);
  });

  test("ningún ejercicio repite un músculo entre principal y secundario", () => {
    const dup: string[] = [];
    for (const m of Object.values(ROUTINE_MUSCLES)) {
      if (!m) continue;
      for (const id of m.secondary) if (m.primary.includes(id)) dup.push(id);
    }
    expect(dup).toEqual([]);
  });

  test("cubre los grupos grandes: la gráfica necesita más de un grupo", () => {
    const groups = new Set<string>();
    for (const m of Object.values(ROUTINE_MUSCLES)) {
      for (const id of m?.primary ?? []) {
        groups.add(MUSCLES.find((x) => x.id === id)?.group ?? "");
      }
    }
    // Pecho, Espalda, Piernas, Core y Hombros tienen que tener algo.
    expect([...groups].filter(Boolean).length).toBeGreaterThanOrEqual(5);
  });
});