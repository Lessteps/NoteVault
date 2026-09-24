// Date helpers for Hábitos (all dates are local "YYYY-MM-DD").

import { isoDate } from "./tasks";

export function parseIso(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

export function addDays(iso: string, n: number): string {
  const d = parseIso(iso);
  d.setDate(d.getDate() + n);
  return isoDate(d);
}

/** Monday of the week that contains `iso`. */
export function weekStart(iso: string): string {
  const d = parseIso(iso);
  return addDays(iso, -((d.getDay() + 6) % 7));
}

export function daysBetween(first: string, last: string): string[] {
  const out: string[] = [];
  for (let d = first; d <= last && out.length < 400; d = addDays(d, 1)) out.push(d);
  return out;
}

export function monthBounds(year: number, month0: number): [string, string] {
  return [isoDate(new Date(year, month0, 1)), isoDate(new Date(year, month0 + 1, 0))];
}

export function pct(v: number | null | undefined): string {
  return v === null || v === undefined ? "—" : `${Math.round(v * 100)}%`;
}

/** 0..4 intensity for the streak grid. */
export function level(p: number, active: boolean): number {
  if (!active || p <= 0) return 0;
  if (p < 0.34) return 1;
  if (p < 0.67) return 2;
  if (p < 1) return 3;
  return 4;
}
