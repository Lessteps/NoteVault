/**
 * Repetition rules shared by habits, tasks and calendar routines.
 * Ported from notevault_app/core/recurrence.py.
 */

import { addDays, weekday } from "./dates";

export const NONE = "none";
export const DAILY = "daily";
export const WEEKLY = "weekly";
export const EVERY = "every";
export const MONTHLY = "monthly";
export const FREQS = [NONE, DAILY, WEEKLY, EVERY, MONTHLY] as const;

export const WORKDAYS = [0, 1, 2, 3, 4] as const;
export const WEEKEND = [5, 6] as const;
export const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6] as const;

const WEEKDAY_SHORT = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"] as const;
const WEEKDAY_LONG = [
  "lunes", "martes", "miércoles", "jueves",
  "viernes", "sábado", "domingo",
] as const;

function parseInts(text: string, low: number, high: number): number[] {
  const out = new Set<number>();
  for (const part of text.split(",")) {
    const val = parseInt(part.trim(), 10);
    if (!Number.isNaN(val) && val >= low && val <= high) {
      out.add(val);
    }
  }
  return Array.from(out).sort((a, b) => a - b);
}

export function parseDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value).trim());
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export class Recurrence {
  freq: string;
  weekdays: number[];
  every: number;
  monthDays: number[];

  constructor(
    freq: string = NONE,
    weekdays: number[] = [],
    every: number = 1,
    monthDays: number[] = [],
  ) {
    this.freq = freq;
    this.weekdays = weekdays;
    this.every = every;
    this.monthDays = monthDays;
  }

  // ── Parsing ───────────────────────────────────────────────────────────

  static parse(text: string | null | undefined): Recurrence {
    const s = typeof text === "string" ? text.trim().toLowerCase() : "";
    if (!s || s === NONE) {
      return new Recurrence();
    }
    const idx = s.indexOf(":");
    const kind = idx >= 0 ? s.slice(0, idx) : s;
    const args = idx >= 0 ? s.slice(idx + 1) : "";

    if (kind === DAILY) {
      return new Recurrence(DAILY);
    }
    if (kind === WEEKLY) {
      const days = parseInts(args, 0, 6);
      if (days.length === 7) {
        return new Recurrence(DAILY);
      }
      return days.length ? new Recurrence(WEEKLY, days) : new Recurrence();
    }
    if (kind === EVERY) {
      const n = parseInt(args, 10);
      if (Number.isNaN(n)) return new Recurrence();
      if (n === 1) return new Recurrence(DAILY);
      return new Recurrence(EVERY, [], Math.max(2, Math.min(365, n)));
    }
    if (kind === MONTHLY) {
      const days = parseInts(args, 1, 31);
      return days.length ? new Recurrence(MONTHLY, [], 1, days) : new Recurrence();
    }
    return new Recurrence();
  }

  static fromWeekdays(days: Iterable<number>): Recurrence {
    const unique = Array.from(
      new Set(Array.from(days).map(Number).filter((d) => d >= 0 && d <= 6)),
    ).sort((a, b) => a - b);
    if (unique.length === 7) return new Recurrence(DAILY);
    return unique.length ? new Recurrence(WEEKLY, unique) : new Recurrence();
  }

  toString(): string {
    if (this.freq === DAILY) return DAILY;
    if (this.freq === WEEKLY && this.weekdays.length) {
      return `${WEEKLY}:${[...this.weekdays].sort((a, b) => a - b).join(",")}`;
    }
    if (this.freq === EVERY && this.every > 1) {
      return `${EVERY}:${this.every}`;
    }
    if (this.freq === MONTHLY && this.monthDays.length) {
      return `${MONTHLY}:${[...this.monthDays].sort((a, b) => a - b).join(",")}`;
    }
    return "";
  }

  get repeats(): boolean {
    return this.toString() !== "";
  }

  // ── Matching ──────────────────────────────────────────────────────────

  /** True when the rule lands on d. anchor is the first possible day. */
  occursOn(
    d: Date | string,
    anchor?: Date | string | null,
    until?: Date | string | null,
  ): boolean {
    const target = parseDate(d);
    if (!target) return false;

    const anc = anchor ? parseDate(anchor) : null;
    const unt = until ? parseDate(until) : null;

    if (anc && target.getTime() < anc.getTime()) {
      return false;
    }
    if (unt && target.getTime() > unt.getTime()) {
      return false;
    }

    if (this.freq === NONE || !this.repeats) {
      return anc !== null && sameDay(target, anc);
    }
    if (this.freq === DAILY) {
      return true;
    }
    if (this.freq === WEEKLY) {
      return this.weekdays.includes(weekday(target));
    }
    if (this.freq === EVERY) {
      const start = anc || target;
      const msPerDay = 86400000;
      const daysDiff = Math.round((target.getTime() - start.getTime()) / msPerDay);
      return daysDiff >= 0 && daysDiff % this.every === 0;
    }
    if (this.freq === MONTHLY) {
      const dayOfMonth = target.getDate();
      const lastDayOfMonth = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
      return this.monthDays.some((day) => Math.min(day, lastDayOfMonth) === dayOfMonth);
    }
    return false;
  }

  /** The first day after d the rule lands on, or null. */
  nextAfter(
    d: Date | string,
    anchor?: Date | string | null,
    until?: Date | string | null,
  ): Date | null {
    if (!this.repeats) {
      return null;
    }
    const current = parseDate(d);
    if (!current) return null;

    const anc = anchor ? parseDate(anchor) : null;
    const unt = until ? parseDate(until) : null;

    let probe = addDays(current, 1);
    for (let i = 0; i < 800; i++) {
      if (unt && probe.getTime() > unt.getTime()) {
        return null;
      }
      if (this.occursOn(probe, anc, unt)) {
        return probe;
      }
      probe = addDays(probe, 1);
    }
    return null;
  }

  /** Weekdays for clients that only understand a weekday list. */
  weekdaysMask(): number[] {
    if (this.freq === WEEKLY) {
      return [...this.weekdays];
    }
    return [...ALL_DAYS];
  }

  // ── Wording ───────────────────────────────────────────────────────────

  describe(): string {
    if (this.freq === DAILY) {
      return "Todos los días";
    }
    if (this.freq === WEEKLY) {
      const days = [...this.weekdays].sort((a, b) => a - b);
      if (days.length === WORKDAYS.length && days.every((v, i) => v === WORKDAYS[i])) {
        return "Días laborables (lun a vie)";
      }
      if (days.length === WEEKEND.length && days.every((v, i) => v === WEEKEND[i])) {
        return "Fines de semana";
      }
      if (days.length === 1) {
        return `Cada ${WEEKDAY_LONG[days[0]!]}`;
      }
      return "Cada " + days.map((i) => WEEKDAY_SHORT[i] ?? "").join(", ");
    }
    if (this.freq === EVERY) {
      return `Cada ${this.every} días`;
    }
    if (this.freq === MONTHLY) {
      const days = [...this.monthDays].sort((a, b) => a - b);
      if (days.length === 1) {
        return `Cada mes el día ${days[0]}`;
      }
      return "Cada mes los días " + days.join(", ");
    }
    return "No se repite";
  }
}

export function* datesBetween(
  rule: Recurrence,
  first: Date | string,
  last: Date | string,
  anchor?: Date | string | null,
  until?: Date | string | null,
): IterableIterator<Date> {
  const start = parseDate(first);
  const end = parseDate(last);
  if (!start || !end) return;

  let d = start;
  while (d.getTime() <= end.getTime()) {
    if (rule.occursOn(d, anchor, until)) {
      yield new Date(d);
    }
    d = addDays(d, 1);
  }
}
