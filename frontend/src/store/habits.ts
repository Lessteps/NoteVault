// Hábitos state. Check-ins show up at once and roll back if Python refuses
// them; the stats are re-read after every write.

import { create } from "zustand";
import { persistField } from "./navState";
import { api } from "../lib/bridge";
import type { Habit, HabitDayLog, HabitFields, HabitRangeDay, HabitStats } from "../lib/types";
import { todayIso } from "../lib/tasks";
import { useApp } from "./app";

export type HabitsView = "general" | "diaria" | "semanal" | "mensual" | "anual" | "gestionar";

interface HabitsState {
  view: HabitsView;
  habits: Habit[];
  stats: HabitStats | null;
  loaded: boolean;
  /** The day the Diaria view shows. */
  day: string;
  log: HabitDayLog | null;
  /** Day rows by date, for the week / month / year / streak views. */
  rows: Record<string, HabitRangeDay>;
  editingId: string | null;

  setView: (v: HabitsView) => void;
  setDay: (iso: string) => Promise<void>;
  edit: (id: string | null) => void;
  load: () => Promise<void>;
  loadRange: (first: string, last: string) => Promise<void>;
  refreshStats: () => Promise<void>;
  setDone: (date: string, id: string, done: boolean) => Promise<void>;
  setSubtask: (date: string, id: string, sub: string, done: boolean) => Promise<void>;
  setDayText: (date: string, notes: string, journal: string) => Promise<void>;
  add: (fields?: HabitFields) => Promise<Habit | null>;
  update: (id: string, fields: HabitFields) => Promise<void>;
  remove: (id: string) => Promise<void>;
  move: (id: string, delta: number) => Promise<void>;
  addSubtask: (id: string, name: string) => Promise<void>;
  removeSubtask: (id: string, sub: string) => Promise<void>;
}

function fail(e: unknown) {
  useApp.getState().toast("error", (e as Error).message);
}

function withDone(row: HabitRangeDay, id: string, done: boolean): HabitRangeDay {
  const set = new Set(row.done);
  if (done && row.active.includes(id)) set.add(id);
  else set.delete(id);
  const doneList = row.active.filter((h) => set.has(h));
  return { ...row, done: doneList, pct: row.active.length ? doneList.length / row.active.length : 0 };
}

export const useHabits = create<HabitsState>((set, get) => ({
  view: "general",
  habits: [],
  stats: null,
  loaded: false,
  day: todayIso(),
  log: null,
  rows: {},
  editingId: null,

  setView: (view) => set({ view }),
  edit: (editingId) => set({ editingId }),

  setDay: async (day) => {
    set({ day });
    try {
      const log = await api.habitsDay(day);
      if (get().day === day) set({ log });
    } catch (e) {
      fail(e);
    }
  },

  load: async () => {
    try {
      const [habits, stats, log] = await Promise.all([
        api.habitsList(), api.habitsStats(), api.habitsDay(get().day)]);
      set({ habits, stats, log, loaded: true });
    } catch (e) {
      fail(e);
    }
  },

  loadRange: async (first, last) => {
    try {
      const list = await api.habitsRange(first, last);
      set((s) => {
        const rows = { ...s.rows };
        for (const r of list) rows[r.date] = r;
        return { rows };
      });
    } catch (e) {
      fail(e);
    }
  },

  refreshStats: async () => {
    try {
      set({ stats: await api.habitsStats() });
    } catch (e) {
      fail(e);
    }
  },

  setDone: async (date, id, done) => {
    const { rows, log } = get();
    const beforeRow = rows[date];
    const beforeLog = log;
    set((s) => ({
      rows: beforeRow ? { ...s.rows, [date]: withDone(beforeRow, id, done) } : s.rows,
      log: s.log && s.log.date === date ? { ...s.log, completed: { ...s.log.completed, [id]: done } } : s.log,
    }));
    try {
      await api.habitsSetDone(date, id, done);
      void get().refreshStats();
    } catch (e) {
      set((s) => ({
        rows: beforeRow ? { ...s.rows, [date]: beforeRow } : s.rows,
        log: beforeLog,
      }));
      fail(e);
    }
  },

  setSubtask: async (date, id, sub, done) => {
    const before = get().log;
    if (before && before.date === date) {
      set({
        log: {
          ...before,
          subtasks: { ...before.subtasks, [id]: { ...(before.subtasks[id] ?? {}), [sub]: done } },
        },
      });
    }
    try {
      await api.habitsSetSubtask(date, id, sub, done);
    } catch (e) {
      set({ log: before });
      fail(e);
    }
  },

  setDayText: async (date, notes, journal) => {
    const log = get().log;
    if (log && log.date === date) set({ log: { ...log, notes, journal } });
    try {
      await api.habitsSetDayText(date, notes, journal);
    } catch (e) {
      fail(e);
    }
  },

  add: async (fields = {}) => {
    try {
      const h = await api.habitsAdd({ name: "Nuevo hábito", ...fields });
      set((s) => ({ habits: [...s.habits, h], editingId: h.id, rows: {} }));
      void get().refreshStats();
      return h;
    } catch (e) {
      fail(e);
      return null;
    }
  },

  update: async (id, fields) => {
    const before = get().habits;
    set((s) => ({ habits: s.habits.map((h) => (h.id === id ? { ...h, ...fields } as Habit : h)) }));
    try {
      const saved = await api.habitsUpdate(id, fields);
      // Schedule changes alter which days count: drop the cached rows.
      set((s) => ({ habits: s.habits.map((h) => (h.id === id ? saved : h)), rows: {} }));
      void get().refreshStats();
      void get().setDay(get().day);
    } catch (e) {
      set({ habits: before });
      fail(e);
    }
  },

  remove: async (id) => {
    const before = get().habits;
    set((s) => ({
      habits: s.habits.filter((h) => h.id !== id),
      editingId: s.editingId === id ? null : s.editingId,
    }));
    try {
      await api.habitsRemove(id);
      set({ rows: {} });
      void get().refreshStats();
      void get().setDay(get().day);
    } catch (e) {
      set({ habits: before });
      fail(e);
    }
  },

  move: async (id, delta) => {
    const before = get().habits;
    const i = before.findIndex((h) => h.id === id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= before.length) return;
    const next = [...before];
    [next[i], next[j]] = [next[j]!, next[i]!];
    set({ habits: next });
    try {
      await api.habitsReorder(next.map((h) => h.id));
    } catch (e) {
      set({ habits: before });
      fail(e);
    }
  },

  addSubtask: async (id, name) => {
    try {
      const sub = await api.habitsAddSubtask(id, name);
      set((s) => ({
        habits: s.habits.map((h) => (h.id === id ? { ...h, subtasks: [...h.subtasks, sub] } : h)),
      }));
    } catch (e) {
      fail(e);
    }
  },

  removeSubtask: async (id, sub) => {
    const before = get().habits;
    set((s) => ({
      habits: s.habits.map((h) => (h.id === id ? { ...h, subtasks: h.subtasks.filter((x) => x.id !== sub) } : h)),
    }));
    try {
      await api.habitsRemoveSubtask(id, sub);
    } catch (e) {
      set({ habits: before });
      fail(e);
    }
  },
}));

// La vista interna del módulo se recuerda entre reinicios.
persistField(useHabits, "view", "habits.view");
