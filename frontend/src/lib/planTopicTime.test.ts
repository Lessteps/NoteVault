import { describe, expect, it } from "vitest";
import { kataAttemptVerified, kataSkipRule } from "./areaPracticeDerive";
import { routeStarted, timeTagOf, topicTimes } from "./planTopicTime";

const days = [
  { date: "2026-10-12", topics: [{ folder: "A", done: false }, { folder: "B", done: true }] },
  { date: "2026-10-13", topics: [{ folder: "A", done: false }] },
  { date: "2026-10-20", topics: [{ folder: "C", done: false }] },
];

describe("etiqueta de tiempo de un tema", () => {
  it("la ventana de un tema va de su primer a su último día de reparto; los hechos no entran", () => {
    const t = topicTimes(days);
    expect(t.get("A")).toEqual({ first: "2026-10-12", last: "2026-10-13" });
    expect(t.get("C")).toEqual({ first: "2026-10-20", last: "2026-10-20" });
    expect(t.has("B")).toBe(false);
  });

  it("programado → en su tiempo → pendiente al pasar su tiempo, y hecho nunca es pendiente", () => {
    const a = topicTimes(days).get("A");
    expect(timeTagOf(a, false, "2026-10-10", true)).toMatchObject({ status: "scheduled", text: "Programado" });
    expect(timeTagOf(a, false, "2026-10-13", true)).toMatchObject({ status: "current" });
    expect(timeTagOf(a, false, "2026-10-14", true)).toMatchObject({ status: "pending", text: "Pendiente", label: "12 oct – 13 oct" });
    expect(timeTagOf(a, true, "2026-10-14", true)).toMatchObject({ status: "done" });
  });

  it("sin haber empezado la ruta nada pasa a pendiente; un tema sin reparto no tiene etiqueta", () => {
    const a = topicTimes(days).get("A");
    expect(timeTagOf(a, false, "2026-10-30", false)).toMatchObject({ status: "scheduled" });
    expect(timeTagOf(undefined, false, "2026-10-30", true)).toBeUndefined();
    expect(routeStarted(["sin_tratar", "sin_tratar"])).toBe(false);
    expect(routeStarted(["sin_tratar", "practicando"])).toBe(true);
    expect(routeStarted(["sin_tratar"], true)).toBe(true);
  });
});

describe("verificación de katas", () => {
  it("solo cuenta un intento calificado con nota de 75 o más, sin solución vista ni rendición", () => {
    expect(kataAttemptVerified({ verdict: "correct", score: 90 })).toBe(true);
    expect(kataAttemptVerified({ verdict: "correct", score: 75 })).toBe(true);
    expect(kataAttemptVerified({ verdict: "partial", score: 60 })).toBe(false);
    expect(kataAttemptVerified({ score: 95 })).toBe(false);
    expect(kataAttemptVerified({ verdict: "ungraded", score: 95 })).toBe(false);
    expect(kataAttemptVerified({ verdict: "correct", score: 95, solution_seen: true })).toBe(false);
    expect(kataAttemptVerified({ verdict: "correct", score: 95, gave_up: true })).toBe(false);
    expect(kataAttemptVerified(undefined)).toBe(false);
  });

  it("saltar un kata exige el 70 % de los que tocaban hasta hoy", () => {
    expect(kataSkipRule(6, 10)).toEqual({ allowed: false, pct: 60, neededPct: 70 });
    expect(kataSkipRule(7, 10)).toEqual({ allowed: true, pct: 70, neededPct: 70 });
    expect(kataSkipRule(0, 0).allowed).toBe(true);
  });
});
