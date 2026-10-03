import { describe, expect, test } from "vitest";
import {
  muscleMetrics,
  periodRange,
  type MetricDay,
} from "./muscleMetrics";

/** Un pecho entrenado dos veces y un dorsal una, para leer los números. */
const list = [
  { id: "e1", name: "Press banca", muscles: { primary: ["pectoral"], secondary: ["triceps"] } },
  { id: "e2", name: "Curl", muscles: { primary: ["biceps"], secondary: [] } },
  { id: "e3", name: "Dominadas", muscles: { primary: ["lats"], secondary: ["biceps"] } },
] as unknown as Parameters<typeof muscleMetrics>[0];

const days: MetricDay[] = [
  {
    date: "2026-09-28",
    exercises: [{ id: "e1", name: "Press banca" }],
    log: { e1: { done: true, reps: 10, weight: 80 } },
  },
  {
    date: "2026-09-29",
    exercises: [{ id: "e1", name: "Press banca" }],
    log: { e1: { done: true, reps: 8, weight: 80 } },
  },
  {
    date: "2026-09-30",
    exercises: [{ id: "e3", name: "Dominadas" }],
    log: { e3: { done: true, reps: 5 } },
  },
];

describe("periodRange", () => {
  test("la semana va de lunes a domingo", () => {
    expect(periodRange("semana", "2026-09-30")).toEqual(["2026-09-28", "2026-10-04"]);
  });

  test("el mes va de día 1 a día 31", () => {
    expect(periodRange("mes", "2026-02-15")).toEqual(["2026-02-01", "2026-02-28"]);
  });

  test("el año va de enero a diciembre del año pedido", () => {
    expect(periodRange("anio", "2026-09-30")).toEqual(["2026-01-01", "2026-12-31"]);
  });
});

describe("muscleMetrics", () => {
  test("cuenta las sesiones en las que se worked cada músculo", () => {
    const m = muscleMetrics(list, days);
    expect(m.get("pectoral")?.sessions).toBe(2);
    expect(m.get("biceps")?.sessions).toBe(1);
    expect(m.get("triceps")?.sessions).toBe(2);
  });

  test("suma las reps de lo hecho, por músculo", () => {
    const m = muscleMetrics(list, days);
    expect(m.get("pectoral")?.reps).toBe(18);
    expect(m.get("lats")?.reps).toBe(5);
    // El bíceps es secundario de las dominadas: cuenta una vez, 5 reps.
    expect(m.get("biceps")?.reps).toBe(5);
  });

  test("un músculo sin trabajar no aparece", () => {
    const m = muscleMetrics(list, days);
    expect(m.has("calves")).toBe(false);
  });

  test("lo no marcado no cuenta", () => {
    const m = muscleMetrics(list, [
      {
        date: "2026-09-28",
        exercises: [{ id: "e1", name: "Press banca" }],
        log: { e1: { done: false, reps: 99, weight: 99 } },
      },
    ]);
    expect(m.size).toBe(0);
  });

  test("no se cuenta dos veces el mismo músculo en un ejercicio", () => {
    const same = [
      { id: "x", name: "Rare", muscles: { primary: ["pectoral"], secondary: ["pectoral"] } },
    ] as unknown as Parameters<typeof muscleMetrics>[0];
    const m = muscleMetrics(same, [
      {
        date: "2026-09-28",
        exercises: [{ id: "x", name: "Rare" }],
        log: { x: { done: true, reps: 10 } },
      },
    ]);
    expect(m.get("pectoral")?.reps).toBe(10);
  });
});