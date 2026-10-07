import { describe, expect, test } from "vitest";
import { summarizeHistory } from "./exerciseHistory";

describe("summarizeHistory", () => {
  test("ordena por fecha y calcula volumen kg×reps", () => {
    const out = summarizeHistory([
      { date: "2026-02-02", weight: 60, reps: 8 },
      { date: "2026-01-01", weight: 50, reps: 10 },
    ]);
    expect(out.sessions.map((s) => s.date)).toEqual(["2026-01-01", "2026-02-02"]);
    expect(out.sessions[0]!.volume).toBe(500);
    expect(out.sessions[1]!.volume).toBe(480);
  });

  test("sin peso cuentan reps, sin reps cuenta una serie", () => {
    const out = summarizeHistory([
      { date: "2026-01-01", weight: 0, reps: 12 },
      { date: "2026-01-02", weight: 0, reps: 0 },
    ]);
    expect(out.sessions[0]!.volume).toBe(12);
    expect(out.sessions[1]!.volume).toBe(1);
  });

  test("el PR es el mayor 1RM con su fecha", () => {
    const out = summarizeHistory([
      { date: "2026-01-01", weight: 60, reps: 8 },
      { date: "2026-02-02", weight: 70, reps: 5 },
    ]);
    expect(out.pr?.date).toBe("2026-02-02");
    expect(out.pr?.e1rm).toBeCloseTo(70 * (1 + 5 / 30), 6);
  });

  test("sin sesiones no hay PR", () => {
    expect(summarizeHistory([])).toEqual({ sessions: [], pr: null });
  });
});
