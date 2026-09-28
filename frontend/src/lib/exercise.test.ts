import { describe, expect, it } from "vitest";
import {
  appliesOn,
  dayCounts,
  dayPct,
  periodDays,
  periodPct,
  periodRange,
  streakOf,
  trained,
  weekdayKeyOf,
  type LoggedDay,
} from "./exercise";

/** A day with `total` exercises of which `done` are ticked. */
function day(date: string, total: number, done: number, dayKey = weekdayKeyOf(date)): LoggedDay {
  return {
    date,
    exercises: Array.from({ length: total }, (_, i) => ({ id: `e${i}`, day: dayKey })),
    log: Object.fromEntries(Array.from({ length: total }, (_, i) => [`e${i}`, { done: i < done }])),
  };
}

const rest = (date: string): LoggedDay => ({ date, exercises: [], log: {} });

describe("weekdays", () => {
  it("maps a date to its Spanish weekday key", () => {
    expect(weekdayKeyOf("2026-09-28")).toBe("lunes"); // Monday
    expect(weekdayKeyOf("2026-09-27")).toBe("domingo");
    expect(weekdayKeyOf("2026-10-03")).toBe("sabado");
  });

  it("knows which dates a routine entry is due", () => {
    expect(appliesOn("lunes", "2026-09-28")).toBe(true);
    expect(appliesOn("lunes", "2026-09-29")).toBe(false);
  });
});

describe("counts", () => {
  it("counts a day and its percentage, a rest day being zero", () => {
    expect(dayCounts(day("2026-09-28", 4, 3))).toEqual({ done: 3, total: 4 });
    expect(dayCounts(undefined)).toEqual({ done: 0, total: 0 });
    expect(dayPct(day("2026-09-28", 4, 3))).toBeCloseTo(0.75);
    expect(dayPct(rest("2026-09-29"))).toBe(0);
  });

  it("calls a day trained as soon as one exercise is ticked", () => {
    expect(trained(day("2026-09-28", 4, 1))).toBe(true);
    expect(trained(day("2026-09-28", 4, 0))).toBe(false);
    expect(trained(rest("2026-09-29"))).toBe(false);
  });
});

describe("periods", () => {
  const week = [
    day("2026-09-28", 4, 4),
    day("2026-09-29", 2, 1),
    day("2026-09-30", 2, 0),
    rest("2026-10-01"),
  ];

  it("averages the days of the period, as Hábitos does", () => {
    // 100%, 50% and 0% on three days with a routine: 50%.
    expect(periodPct(week, "2026-09-30")).toBeCloseTo(0.5);
  });

  it("does not let a long day outvote a short one", () => {
    const heavy = [day("2026-09-28", 10, 0), day("2026-09-29", 1, 1)];
    // The short day counts as much as the long one: 0% and 100% → 50%.
    expect(periodPct(heavy, "2026-09-29")).toBeCloseTo(0.5);
  });

  it("ignores the days still to come", () => {
    expect(periodPct(week, "2026-09-28")).toBe(1);
  });

  it("counts trained days against the days that had a routine", () => {
    expect(periodDays(week, "2026-09-30")).toEqual({ trained: 2, due: 3 });
  });

  it("returns the dates of a period", () => {
    const w = periodRange("semanal", "2026-09-30");
    expect([w.from, w.to]).toEqual(["2026-09-28", "2026-10-04"]);
    expect(w.days).toHaveLength(7);
    const m = periodRange("mensual", "2026-09-15");
    expect([m.from, m.to]).toEqual(["2026-09-01", "2026-09-30"]);
    const y = periodRange("anual", "2026-09-15");
    expect([y.from, y.to]).toEqual(["2026-01-01", "2026-12-31"]);
    const d = periodRange("diaria", "2026-09-15");
    expect(d.days).toEqual(["2026-09-15"]);
  });
});

describe("streak", () => {
  it("counts the run of days ending today", () => {
    const days = [
      day("2026-09-26", 2, 2),
      day("2026-09-27", 2, 1),
      day("2026-09-28", 2, 2),
    ];
    expect(streakOf(days, "2026-09-28")).toEqual({ current: 3, best: 3 });
  });

  it("stops at the first day with nothing done", () => {
    const days = [
      day("2026-09-25", 2, 2),
      day("2026-09-26", 2, 0),
      day("2026-09-27", 2, 1),
      day("2026-09-28", 2, 1),
    ];
    expect(streakOf(days, "2026-09-28")).toEqual({ current: 2, best: 2 });
  });

  it("keeps a rest day from breaking the run", () => {
    const days = [
      day("2026-09-26", 2, 2),
      rest("2026-09-27"),
      day("2026-09-28", 2, 1),
    ];
    expect(streakOf(days, "2026-09-28").current).toBe(2);
  });

  it("remembers the best run even when it is not the current one", () => {
    const days = [
      day("2026-09-21", 1, 1),
      day("2026-09-22", 1, 1),
      day("2026-09-23", 1, 1),
      day("2026-09-24", 1, 0),
      day("2026-09-25", 1, 1),
      day("2026-09-26", 1, 0),
      day("2026-09-27", 1, 0),
      day("2026-09-28", 1, 1),
    ];
    expect(streakOf(days, "2026-09-28")).toEqual({ current: 1, best: 3 });
  });

  it("is zero when today was not touched", () => {
    expect(streakOf([day("2026-09-28", 2, 0)], "2026-09-28").current).toBe(0);
  });
});
