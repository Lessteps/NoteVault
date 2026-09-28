// Pure helpers of the Ejercicio module.
//
// The routine is written per weekday (an exercise belongs to "lunes"), so every
// period view is the same question: for each date, which exercises were due and
// how many were done. Kept out of the components and free of React so the rings,
// the grids and the streak all agree on one definition.

import { addDays, daysBetween, monthBounds, weekStart } from "./habits";

export const DAY_KEYS = [
  "lunes",
  "martes",
  "miercoles",
  "jueves",
  "viernes",
  "sabado",
  "domingo",
] as const;

export type DayKey = (typeof DAY_KEYS)[number];

/** The periods the module shows, in the order of the sidebar. */
export type Period = "diaria" | "semanal" | "mensual" | "anual";

export const PERIODS: Array<{ id: Period; label: string; ring: string }> = [
  { id: "diaria", label: "Diaria", ring: "Hoy" },
  { id: "semanal", label: "Semanal", ring: "Esta semana" },
  { id: "mensual", label: "Mensual", ring: "Este mes" },
  { id: "anual", label: "Anual", ring: "Este año" },
];

/** `2026-09-28` → `lunes`. Built from the parts, so no UTC drift. */
export function weekdayKeyOf(iso: string): DayKey {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  const date = new Date(y, m - 1, d);
  return DAY_KEYS[(date.getDay() + 6) % 7]!;
}

/** An exercise of the `dayKey` routine is due on `date`. */
export function appliesOn(dayKey: string, date: string): boolean {
  return weekdayKeyOf(date) === dayKey;
}

/** The shape the module reads: a date, its routine and what was logged. */
export interface LoggedDay {
  date: string;
  exercises: Array<{ id: string; day?: string }>;
  log: Record<string, { done?: boolean } | undefined>;
}

/** How much of a day's routine is done. Rest days count as nothing due. */
export function dayCounts(day: LoggedDay | undefined): { done: number; total: number } {
  if (!day) return { done: 0, total: 0 };
  let done = 0;
  for (const ex of day.exercises) {
    if (day.log[ex.id]?.done) done += 1;
  }
  return { done, total: day.exercises.length };
}

/** 0..1 for a single day; 0 when the day had nothing due. */
export function dayPct(day: LoggedDay | undefined): number {
  const { done, total } = dayCounts(day);
  return total ? done / total : 0;
}

/** A day counts as trained when at least one exercise of its routine is done. */
export function trained(day: LoggedDay | undefined): boolean {
  return dayCounts(day).done > 0;
}

/**
 * Completion of a period: the mean of the daily percentages of the days that had
 * a routine, up to `today` (a future day is not a failure, a rest day is not a
 * day at all).
 *
 * Hábitos uses this same denominator — every day weighs the same — so a day with
 * one exercise cannot outvote a day with ten.
 */
export function periodPct(days: LoggedDay[], today: string): number {
  const vals = days
    .filter((day) => day.date <= today && day.exercises.length > 0)
    .map((day) => dayPct(day));
  if (!vals.length) return 0;
  return vals.reduce((a, v) => a + v, 0) / vals.length;
}

/** Days trained inside a period, which is what the statistics panel counts. */
export function periodDays(days: LoggedDay[], today: string): { trained: number; due: number } {
  let t = 0;
  let due = 0;
  for (const day of days) {
    if (day.date > today) continue;
    if (!day.exercises.length) continue;
    due += 1;
    if (trained(day)) t += 1;
  }
  return { trained: t, due };
}

/**
 * The streak, same rule as Hábitos: walking back from today, the run of days with
 * something done — a day with nothing done (or a rest day) ends it. `best` is the
 * longest run inside the window it was handed.
 */
export function streakOf(days: LoggedDay[], today: string): { current: number; best: number } {
  const past = days.filter((d) => d.date <= today).sort((a, b) => (a.date < b.date ? -1 : 1));
  let best = 0;
  let run = 0;
  for (const day of past) {
    // A rest day neither breaks nor adds: the routine had nothing to do.
    if (!day.exercises.length) continue;
    if (trained(day)) {
      run += 1;
      best = Math.max(best, run);
    } else {
      run = 0;
    }
  }
  let current = 0;
  for (let i = past.length - 1; i >= 0; i -= 1) {
    const day = past[i]!;
    if (!day.exercises.length) continue;
    if (trained(day)) current += 1;
    else break;
  }
  return { current, best };
}

/** The dates a period covers, and the label the header shows. */
export function periodRange(
  period: Period,
  anchor: string,
  month0?: number,
): { from: string; to: string; days: string[] } {
  if (period === "diaria") return { from: anchor, to: anchor, days: [anchor] };
  if (period === "semanal") {
    const from = weekStart(anchor);
    return { from, to: addDays(from, 6), days: daysBetween(from, addDays(from, 6)) };
  }
  if (period === "mensual") {
    const m = month0 ?? Number(anchor.slice(5, 7)) - 1;
    const [from, to] = monthBounds(Number(anchor.slice(0, 4)), m);
    return { from, to, days: daysBetween(from, to) };
  }
  const year = Number(anchor.slice(0, 4));
  const from = `${year}-01-01`;
  const to = `${year}-12-31`;
  return { from, to, days: daysBetween(from, to) };
}
