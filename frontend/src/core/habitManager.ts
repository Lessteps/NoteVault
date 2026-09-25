/**
 * NoteVault Habit Manager
 * Data layer: reads and writes one .md file per day inside {vault}/habits/.
 * Ported from notevault_app/core/habit_manager.py.
 *
 * Habit schema (v3)
 * -----------------
 * {
 *   "id": "...", "name": "...", "icon": "...",
 *   "days": [0..6],                 # weekdays the habit is active (0 = Monday)
 *   "subtasks": [{"id": "...", "name": "..."}],
 *
 *   # Optional, all written only when set:
 *   "repeat": "every:2",            # recurrence.py rule; wins over "days"
 *   "start_date": "2026-09-14",     # first day it counts (anchor for every:N)
 *   "end_date": "2026-12-31",       # last day it counts
 *   "paused_from": "2026-10-01",    # inactive from this day on, history kept
 *   "time": "07:30",                # shown at this hour in Calendario
 *   "duration_min": 30,
 *   "in_calendar": true,            # own block in Calendario
 *   "reminder_min": 10,             # desktop notification before "time"
 *   "colour": "#33b679",
 *   "notes": "free text"
 * }
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { addDays, parseIsoDate, todayIso, weekday } from "./dates";
import { Recurrence } from "./recurrence";
import { HABIT_OPTIONAL_KEYS, LAYOUT } from "./vaultFormat";

export const CONFIG_VERSION = 3;
export const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6] as const;
export const MON_WED_FRI = [0, 2, 4] as const;
export const TUESDAY = [1] as const;

export interface HabitSubtask {
  id: string;
  name: string;
}

export interface HabitConfig {
  id: string;
  name: string;
  icon: string;
  days: number[];
  subtasks: HabitSubtask[];
  repeat?: string;
  start_date?: string;
  end_date?: string;
  paused_from?: string;
  time?: string;
  duration_min?: number;
  in_calendar?: boolean;
  reminder_min?: number;
  colour?: string;
  notes?: string;
  [key: string]: unknown;
}

export const DEFAULT_HABITS: readonly HabitConfig[] = [
  { id: "nophone", name: "Sin celular 30 min al despertar", icon: "📵", days: [...ALL_DAYS], subtasks: [] },
  { id: "bed", name: "Preparar la cama", icon: "🛏", days: [...ALL_DAYS], subtasks: [] },
  { id: "water", name: "Tomar un vaso de agua", icon: "💧", days: [...ALL_DAYS], subtasks: [] },
  { id: "teeth", name: "Cepillarme", icon: "🪥", days: [...ALL_DAYS], subtasks: [] },
  { id: "food", name: "Comida", icon: "🍽", days: [...ALL_DAYS], subtasks: [] },
  { id: "shower", name: "Ducha", icon: "🚿", days: [...ALL_DAYS], subtasks: [] },
  { id: "gym", name: "Ir al gimnasio", icon: "🏋", days: [...ALL_DAYS], subtasks: [] },
  { id: "nofa", name: "Nofa", icon: "🚫", days: [...ALL_DAYS], subtasks: [] },
  { id: "nomusic", name: "Nomusic", icon: "🎵", days: [...ALL_DAYS], subtasks: [] },
  { id: "reading", name: "Lectura", icon: "📖", days: [...ALL_DAYS], subtasks: [] },
  { id: "hairwash", name: "Lavarme el cabello", icon: "🧴", days: [...MON_WED_FRI], subtasks: [] },
  { id: "haircare", name: "Aplicarme productos del cabello", icon: "💆", days: [...TUESDAY], subtasks: [] },
  {
    id: "coding",
    name: "Programar",
    icon: "💻",
    days: [...ALL_DAYS],
    subtasks: [
      { id: "theory", name: "Estudiar teoría" },
      { id: "practice", name: "Practicar código" },
      { id: "review", name: "Repasar lo aprendido" },
    ],
  },
  { id: "math", name: "Matemáticas", icon: "🧮", days: [...ALL_DAYS], subtasks: [] },
  { id: "language", name: "Lenguaje", icon: "🗣", days: [...ALL_DAYS], subtasks: [] },
];

export const MONTH_NAMES = [
  "", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

export const DAY_INITIALS = ["L", "M", "X", "J", "V", "S", "D"];
export const DAY_NAMES_ES = [
  "Lunes", "Martes", "Miércoles", "Jueves",
  "Viernes", "Sábado", "Domingo",
];

const pad = (n: number, w = 2) => String(n).padStart(w, "0");

export function habitDays(habit: Record<string, any>): number[] {
  const days = habit.days;
  if (!Array.isArray(days) || days.length === 0) {
    return [...ALL_DAYS];
  }
  const out: number[] = [];
  for (const d of days) {
    const v = typeof d === "number" ? d : parseInt(String(d), 10);
    if (!Number.isNaN(v) && v >= 0 && v <= 6) {
      out.push(v);
    }
  }
  return out.length ? out : [...ALL_DAYS];
}

export function habitRule(habit: Record<string, any>): Recurrence {
  const rule = Recurrence.parse(habit.repeat);
  return rule.repeats ? rule : Recurrence.fromWeekdays(habitDays(habit));
}

export function habitActiveOn(habit: Record<string, any>, d: Date | string): boolean {
  const target = typeof d === "string" ? parseIsoDate(d) : d;
  if (!target) return false;
  const targetIso = todayIso(target);

  const pausedStr = habit.paused_from ? String(habit.paused_from).trim() : null;
  if (pausedStr && targetIso >= pausedStr) {
    return false;
  }
  const start = habit.start_date ? parseIsoDate(habit.start_date) : null;
  const end = habit.end_date ? parseIsoDate(habit.end_date) : null;
  return habitRule(habit).occursOn(target, start, end);
}

export function habitScheduleText(habit: Record<string, any>): string {
  const parts = [habitRule(habit).describe()];
  if (habit.time) parts.push(habit.time);
  if (habit.paused_from) parts.push("en pausa");
  return parts.join(" · ");
}
export const habit_active_on = habitActiveOn;
export const habit_schedule_text = habitScheduleText;

export const OPTIONAL_KEYS = HABIT_OPTIONAL_KEYS;

export function _applyOptions(habit: Record<string, any>, options: Record<string, any>): void {
  for (const [key, value] of Object.entries(options)) {
    if (!(OPTIONAL_KEYS as readonly string[]).includes(key)) {
      continue;
    }
    if (
      (value === null || value === "" || value === false) &&
      !((key === "duration_min" || key === "reminder_min") && value === 0)
    ) {
      delete habit[key];
    } else {
      habit[key] = value;
    }
  }
  if ("repeat" in options) {
    const rule = Recurrence.parse(habit.repeat);
    if (rule.repeats) {
      habit.days = rule.weekdaysMask();
      if (rule.freq === "daily" || rule.freq === "weekly") {
        delete habit.repeat;
      }
    } else {
      delete habit.repeat;
    }
  }
}

function pyJsonDumps(val: unknown): string {
  if (val === null) return "null";
  if (typeof val === "boolean") return val ? "true" : "false";
  if (typeof val === "number") return String(val);
  if (typeof val === "string") return JSON.stringify(val);
  if (Array.isArray(val)) {
    return "[" + val.map(pyJsonDumps).join(", ") + "]";
  }
  if (typeof val === "object") {
    const entries = Object.entries(val as Record<string, unknown>);
    return "{" + entries.map(([k, v]) => `${JSON.stringify(k)}: ${pyJsonDumps(v)}`).join(", ") + "}";
  }
  return JSON.stringify(val);
}

export class HabitDay {
  date: string;
  completed: Record<string, boolean>;
  notes: string;
  journal: string;
  subtasks: Record<string, Record<string, boolean>>;

  constructor(
    day: Date | string,
    completed: Record<string, boolean> = {},
    notes = "",
    journal = "",
    subtasks?: Record<string, Record<string, boolean>>,
  ) {
    this.date = typeof day === "string" ? day : todayIso(day);
    this.completed = { ...completed };
    this.notes = notes;
    this.journal = journal;
    this.subtasks = subtasks ? JSON.parse(JSON.stringify(subtasks)) : {};
  }

  active_habits(habits: HabitConfig[]): HabitConfig[] {
    return habits.filter((h) => habitActiveOn(h, this.date));
  }

  activeHabits(habits: HabitConfig[]): HabitConfig[] {
    return this.active_habits(habits);
  }

  subtask_done(habitId: string, subtaskId: string): boolean {
    return Boolean(this.subtasks[habitId]?.[subtaskId]);
  }

  subtaskDone(habitId: string, subtaskId: string): boolean {
    return this.subtask_done(habitId, subtaskId);
  }

  set_subtask(habitId: string, subtaskId: string, value: boolean): void {
    if (!this.subtasks[habitId]) {
      this.subtasks[habitId] = {};
    }
    this.subtasks[habitId]![subtaskId] = value;
  }

  setSubtask(habitId: string, subtaskId: string, value: boolean): void {
    this.set_subtask(habitId, subtaskId, value);
  }

  subtask_progress(habit: HabitConfig): [number, number] {
    const subs = habit.subtasks || [];
    if (!Array.isArray(subs) || subs.length === 0) {
      return [0, 0];
    }
    let done = 0;
    for (const s of subs) {
      if (this.subtask_done(habit.id, s.id)) {
        done++;
      }
    }
    return [done, subs.length];
  }

  subtaskProgress(habit: HabitConfig): [number, number] {
    return this.subtask_progress(habit);
  }

  completion_pct(habits: HabitConfig[]): number {
    const active = this.active_habits(habits);
    if (active.length === 0) return 0.0;
    const done = active.filter((h) => Boolean(this.completed[h.id])).length;
    return done / active.length;
  }

  completionPct(habits: HabitConfig[]): number {
    return this.completion_pct(habits);
  }

  completed_count(habits: HabitConfig[]): number {
    return this.active_habits(habits).filter((h) => Boolean(this.completed[h.id])).length;
  }

  completedCount(habits: HabitConfig[]): number {
    return this.completed_count(habits);
  }
}

export class HabitManager {
  vaultRoot: string;
  habitsDir: string;
  _configPath: string;
  _habits: HabitConfig[] | null = null;
  _dayCache: Map<string, HabitDay> = new Map();

  constructor(vaultRoot: string) {
    this.vaultRoot = path.resolve(vaultRoot);
    this.habitsDir = path.join(this.vaultRoot, LAYOUT.habits_dir);
    this._configPath = path.join(this.vaultRoot, LAYOUT.habits_config);
  }

  habits(): HabitConfig[] {
    if (this._habits === null) {
      this._habits = this._loadConfig();
    }
    return this._habits;
  }

  habits_for_day(d: Date | string): HabitConfig[] {
    return this.habitsForDay(d);
  }

  habitsForDay(d: Date | string): HabitConfig[] {
    return this.habits().filter((h) => habitActiveOn(h, d));
  }

  get_habit(habitId: string): HabitConfig | null {
    return this.getHabit(habitId);
  }

  getHabit(habitId: string): HabitConfig | null {
    return this.habits().find((h) => h.id === habitId) ?? null;
  }

  reload(): void {
    this._habits = null;
    this._dayCache.clear();
  }

  set_done(d: Date | string, habitId: string, done: boolean): void {
    this.setDone(d, habitId, done);
  }

  setDone(d: Date | string, habitId: string, done: boolean): void {
    const day = this.getDay(d);
    day.completed[habitId] = done;
    this.saveDay(day);
  }

  private _loadConfig(): HabitConfig[] {
    let raw: any = null;
    if (fs.existsSync(this._configPath)) {
      try {
        raw = JSON.parse(fs.readFileSync(this._configPath, "utf-8"));
      } catch {
        raw = null;
      }
    }

    if (raw && typeof raw === "object" && typeof raw.version === "number" && raw.version >= 2) {
      const habits = Array.isArray(raw.habits) ? (raw.habits as HabitConfig[]) : [];
      for (const h of habits) {
        if (!h.days) h.days = [...ALL_DAYS];
        if (!h.subtasks) h.subtasks = [];
      }
      if (habits.length === 0) {
        // User removed every habit on purpose: keep empty list!
        return habits;
      }
      if (raw.version < CONFIG_VERSION) {
        const known = new Set(habits.map((h) => h.id));
        for (const d of DEFAULT_HABITS) {
          if (!known.has(d.id)) {
            habits.push({
              ...d,
              days: [...d.days],
              subtasks: d.subtasks.map((s) => ({ ...s })),
            });
          }
        }
        this._habits = habits;
        this.saveConfig();
      }
      return habits;
    }

    // No config or v1 -> install defaults
    const habits: HabitConfig[] = DEFAULT_HABITS.map((h) => ({
      ...h,
      days: [...h.days],
      subtasks: h.subtasks.map((s) => ({ ...s })),
    }));
    this._habits = habits;
    this.saveConfig();
    return habits;
  }

  save_config(): void {
    this.saveConfig();
  }

  saveConfig(): void {
    fs.mkdirSync(this.habitsDir, { recursive: true });
    const payload = { version: CONFIG_VERSION, habits: this._habits || [] };
    fs.writeFileSync(this._configPath, JSON.stringify(payload, null, 2), "utf-8");
  }

  private _dayPath(d: Date | string): string {
    const dStr = typeof d === "string" ? d : todayIso(d);
    const [year, month] = dStr.split("-");
    return path.join(this.habitsDir, year!, month!, `${dStr}.md`);
  }

  get_day(d: Date | string): HabitDay {
    return this.getDay(d);
  }

  getDay(d: Date | string): HabitDay {
    const dStr = typeof d === "string" ? d : todayIso(d);
    const cached = this._dayCache.get(dStr);
    if (cached) {
      return cached;
    }
    const p = this._dayPath(dStr);
    const day = fs.existsSync(p) ? this._parse(p, dStr) : new HabitDay(dStr, {}, "");
    this._dayCache.set(dStr, day);
    return day;
  }

  save_day(day: HabitDay): void {
    this.saveDay(day);
  }

  saveDay(day: HabitDay): void {
    this._dayCache.set(day.date, day);
    const p = this._dayPath(day.date);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    const lines = [
      "---",
      `date: ${day.date}`,
      "completed:",
    ];
    for (const h of this.habits()) {
      const val = day.completed[h.id] ? "true" : "false";
      lines.push(`  ${h.id}: ${val}`);
    }
    lines.push(`notes: "${day.notes}"`);
    if (day.subtasks && Object.keys(day.subtasks).length > 0) {
      lines.push("subtasks: " + pyJsonDumps(day.subtasks));
    }
    lines.push("---");
    const body = day.journal.trim();
    if (body) {
      lines.push("");
      lines.push(body);
    }
    fs.writeFileSync(p, lines.join("\n") + "\n", "utf-8");
  }

  private _parse(filePath: string, d: Date | string): HabitDay {
    let text = "";
    try {
      text = fs.readFileSync(filePath, "utf-8");
    } catch {
      return new HabitDay(d, {}, "");
    }

    const completed: Record<string, boolean> = {};
    let notes = "";
    let subtasks: Record<string, Record<string, boolean>> = {};
    const journalLines: string[] = [];
    let fmCount = 0;
    let inCompleted = false;

    for (const line of text.split(/\r?\n/)) {
      if (line.trim() === "---") {
        fmCount += 1;
        inCompleted = false;
        continue;
      }
      if (fmCount < 2) {
        if (line.trim().startsWith("completed:")) {
          inCompleted = true;
          continue;
        }
        if (inCompleted && /^\s+\w/.test(line)) {
          const m = /^\s+([a-zA-Z0-9_\-]+):\s*(true|false)/.exec(line);
          if (m) {
            completed[m[1]!] = m[2] === "true";
          }
        } else {
          if (inCompleted) inCompleted = false;
          const mNotes = /^notes:\s*"?(.*?)"?\s*$/.exec(line);
          if (mNotes) {
            notes = mNotes[1]!;
          }
          const mSub = /^subtasks:\s*(\{.*\})\s*$/.exec(line);
          if (mSub) {
            try {
              subtasks = JSON.parse(mSub[1]!);
            } catch {
              subtasks = {};
            }
          }
        }
      } else {
        journalLines.push(line);
      }
    }
    const journal = journalLines.join("\n").trim();
    return new HabitDay(d, completed, notes, journal, subtasks);
  }

  get_week(ref: Date | string): HabitDay[] {
    return this.getWeek(ref);
  }

  getWeek(ref: Date | string): HabitDay[] {
    const d = typeof ref === "string" ? parseIsoDate(ref) || new Date() : ref;
    const dayOfWeek = weekday(d);
    const monday = addDays(d, -dayOfWeek);
    return Array.from({ length: 7 }, (_, i) => this.getDay(addDays(monday, i)));
  }

  get_month(year: number, month: number): HabitDay[] {
    return this.getMonth(year, month);
  }

  getMonth(year: number, month: number): HabitDay[] {
    const daysIn = new Date(year, month, 0).getDate();
    return Array.from({ length: daysIn }, (_, i) =>
      this.getDay(`${year}-${pad(month)}-${pad(i + 1)}`),
    );
  }

  get_year_summary(year: number): [number, number][] {
    return this.getYearSummary(year);
  }

  getYearSummary(year: number): [number, number][] {
    const habits = this.habits();
    const todayStr = todayIso();
    const result: [number, number][] = [];
    for (let m = 1; m <= 12; m++) {
      const days = this.getMonth(year, m).filter((d) => d.date <= todayStr);
      let avg = 0.0;
      if (days.length > 0) {
        const sum = days.reduce((acc, d) => acc + d.completionPct(habits), 0);
        avg = sum / days.length;
      }
      result.push([m, avg]);
    }
    return result;
  }

  day_pct(d: Date | string): number {
    return this.dayPct(d);
  }

  dayPct(d: Date | string): number {
    return this.getDay(d).completionPct(this.habits());
  }

  week_pct(ref: Date | string): number {
    return this.weekPct(ref);
  }

  weekPct(ref: Date | string): number {
    const todayStr = todayIso();
    const days = this.getWeek(ref).filter((d) => d.date <= todayStr);
    if (days.length === 0) return 0.0;
    const sum = days.reduce((acc, d) => acc + d.completionPct(this.habits()), 0);
    return sum / days.length;
  }

  month_pct(year: number, month: number): number {
    return this.monthPct(year, month);
  }

  monthPct(year: number, month: number): number {
    const todayStr = todayIso();
    const days = this.getMonth(year, month).filter((d) => d.date <= todayStr);
    if (days.length === 0) return 0.0;
    const sum = days.reduce((acc, d) => acc + d.completionPct(this.habits()), 0);
    return sum / days.length;
  }

  year_pct(year: number): number {
    return this.yearPct(year);
  }

  yearPct(year: number): number {
    const pcts = this.getYearSummary(year)
      .map(([, p]) => p)
      .filter((p) => p > 0);
    if (pcts.length === 0) return 0.0;
    return pcts.reduce((acc, p) => acc + p, 0) / pcts.length;
  }

  private _uniqueId(base: string, existing: Set<string>): string {
    let hid = base;
    let counter = 2;
    while (existing.has(hid)) {
      hid = `${base}${counter}`;
      counter += 1;
    }
    return hid;
  }

  add_habit(
    name: string,
    icon: string,
    days?: number[] | null,
    options: Record<string, any> = {},
  ): HabitConfig {
    return this.addHabit(name, icon, days, options);
  }

  addHabit(
    name: string,
    icon: string,
    days?: number[] | null,
    options: Record<string, any> = {},
  ): HabitConfig {
    const habits = this.habits();
    const baseId = name.toLowerCase().replace(/[^a-z0-9]/g, "") || "habit";
    const hid = this._uniqueId(baseId, new Set(habits.map((h) => h.id)));
    const h: HabitConfig = {
      id: hid,
      name,
      icon,
      days: days && days.length ? [...days] : [...ALL_DAYS],
      subtasks: [],
    };
    _applyOptions(h, options);
    habits.push(h);
    this._habits = habits;
    this.saveConfig();
    return h;
  }

  remove_habit(habitId: string): void {
    this.removeHabit(habitId);
  }

  removeHabit(habitId: string): void {
    const habits = this.habits();
    this._habits = habits.filter((h) => h.id !== habitId);
    this.saveConfig();
  }

  update_habit(habitId: string, fields: Record<string, any>): void {
    this.updateHabit(habitId, fields);
  }

  updateHabit(habitId: string, fields: Record<string, any>): void {
    const options: Record<string, any> = {};
    const remaining: Record<string, any> = {};
    for (const [k, v] of Object.entries(fields)) {
      if ((OPTIONAL_KEYS as readonly string[]).includes(k)) {
        options[k] = v;
      } else {
        remaining[k] = v;
      }
    }
    for (const h of this.habits()) {
      if (h.id === habitId) {
        Object.assign(h, remaining);
        _applyOptions(h, options);
        break;
      }
    }
    this.saveConfig();
  }

  set_habit_days(habitId: string, days: (number | string)[]): void {
    this.setHabitDays(habitId, days);
  }

  setHabitDays(habitId: string, days: (number | string)[]): void {
    const uniqueDays = Array.from(new Set(days.map((d) => Number(d)))).sort((a, b) => a - b);
    this.updateHabit(habitId, { days: uniqueDays });
  }

  add_subtask(habitId: string, name: string): HabitSubtask | null {
    return this.addSubtask(habitId, name);
  }

  addSubtask(habitId: string, name: string): HabitSubtask | null {
    for (const h of this.habits()) {
      if (h.id === habitId) {
        if (!Array.isArray(h.subtasks)) {
          h.subtasks = [];
        }
        const base = name.toLowerCase().replace(/[^a-z0-9]/g, "") || "sub";
        const sid = this._uniqueId(base, new Set(h.subtasks.map((s) => s.id)));
        const s = { id: sid, name };
        h.subtasks.push(s);
        this.saveConfig();
        return s;
      }
    }
    return null;
  }

  remove_subtask(habitId: string, subtaskId: string): void {
    this.removeSubtask(habitId, subtaskId);
  }

  removeSubtask(habitId: string, subtaskId: string): void {
    for (const h of this.habits()) {
      if (h.id === habitId) {
        h.subtasks = (h.subtasks || []).filter((s) => s.id !== subtaskId);
        this.saveConfig();
        return;
      }
    }
  }
}
