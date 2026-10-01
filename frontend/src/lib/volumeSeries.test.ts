import { describe, expect, test } from "vitest";
import { volumeSeries, type VolumeDay, type VolumeExercise } from "./volumeSeries";

/** Pecho el lunes, espalda el martes: dos grupos, dos días. */
const list = [
  { id: "e1", name: "Press banca", muscles: { primary: ["pectoral"], secondary: ["triceps"] } },
  { id: "e2", name: "Remo", muscles: { primary: ["lats"], secondary: ["biceps"] } },
] as unknown as VolumeExercise[];

const days: VolumeDay[] = [
  {
    date: "2026-09-28",
    exercises: [{ id: "e1", name: "Press banca" }],
    log: { e1: { done: true, reps: 20 } },
  },
  {
    date: "2026-09-29",
    exercises: [{ id: "e2", name: "Remo" }],
    log: { e2: { done: true, reps: 12 } },
  },
];

describe("volumeSeries", () => {
  test("reparte las reps del día entre los grupos que toca", () => {
    const s = volumeSeries(list, days, ["Pecho", "Espalda", "Brazos"]);
    // El press banca reparte sus 20 reps entre Pecho (principal) y Brazos
    // (tríceps); el remo el martes alimenta Espalda y también Brazos.
    expect(s.values.Pecho).toEqual([20, null]);
    expect(s.values.Espalda).toEqual([null, 12]);
    expect(s.values.Brazos).toEqual([20, 12]);
  });

  test("un día sin entrenar es un hueco, no un cero", () => {
    const s = volumeSeries(list, [
      days[0]!,
      { date: "2026-09-29", exercises: [], log: {} },
    ], ["Pecho"]);
    expect(s.values.Pecho).toEqual([20, null]);
  });

  test("lo marcado sin reps cuenta como una serie", () => {
    const s = volumeSeries(list, [
      {
        date: "2026-09-28",
        exercises: [{ id: "e1", name: "Press banca" }],
        log: { e1: { done: true, reps: 0 } },
      },
    ], ["Pecho"]);
    expect(s.values.Pecho).toEqual([1]);
  });

  test("lo no marcado no cuenta: el grupo no llega a la gráfica", () => {
    const s = volumeSeries(list, [
      {
        date: "2026-09-28",
        exercises: [{ id: "e1", name: "Press banca" }],
        log: { e1: { done: false, reps: 50 } },
      },
    ], ["Pecho"]);
    expect(s.values.Pecho).toBeUndefined();
  });

  test("las etiquetas son las fechas, en orden", () => {
    const s = volumeSeries(list, days, ["Pecho"]);
    expect(s.labels).toEqual(["2026-09-28", "2026-09-29"]);
  });

  test("un grupo sin trabajo en el periodo no aparece", () => {
    const s = volumeSeries(list, days, ["Pecho", "Piernas"]);
    expect(s.labels.length).toBe(2);
    expect(Object.keys(s.values)).toEqual(["Pecho"]);
  });

  test("sin días, las etiquetas van vacías", () => {
    const s = volumeSeries(list, [], ["Pecho"]);
    expect(s.labels).toEqual([]);
    expect(Object.keys(s.values)).toEqual([]);
  });
});