// Tareas state: the task list, filters, the open task, and writes that
// show up at once (optimistic) and roll back if Python refuses them.

import { create } from "zustand";
import { api } from "../lib/bridge";
import type { Task, TaskFields, TasksMeta } from "../lib/types";
import { useApp } from "./app";

export type TasksView = "tabla" | "calendario" | "recordatorios";

export interface TaskFilters {
  query: string;
  status: string;
  subject: string;
  priority: number;
  hideDone: boolean;
}

export const EMPTY_FILTERS: TaskFilters = { query: "", status: "", subject: "", priority: 0, hideDone: false };

interface TasksState {
  view: TasksView;
  tasks: Task[];
  meta: TasksMeta | null;
  loaded: boolean;
  filters: TaskFilters;
  openId: string | null;
  /** Bumped after every write so the calendar re-reads its range. */
  version: number;

  setView: (v: TasksView) => void;
  setFilters: (f: Partial<TaskFilters>) => void;
  clearFilters: () => void;
  open: (id: string | null) => void;
  load: () => Promise<void>;
  create: (fields?: TaskFields) => Promise<Task | null>;
  update: (id: string, fields: TaskFields) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

function fail(e: unknown) {
  useApp.getState().toast("error", (e as Error).message);
}

export const useTasks = create<TasksState>((set, get) => ({
  view: "tabla",
  tasks: [],
  meta: null,
  loaded: false,
  filters: EMPTY_FILTERS,
  openId: null,
  version: 0,

  setView: (view) => set({ view }),
  setFilters: (f) => set((s) => ({ filters: { ...s.filters, ...f } })),
  clearFilters: () => set({ filters: EMPTY_FILTERS }),
  open: (openId) => set({ openId }),

  load: async () => {
    try {
      const [tasks, meta] = await Promise.all([api.tasksList(), api.tasksMeta()]);
      set((s) => ({ tasks, meta, loaded: true, version: s.version + 1 }));
    } catch (e) {
      fail(e);
    }
  },

  create: async (fields = {}) => {
    try {
      const t = await api.tasksCreate({ name: "Nueva tarea", ...fields });
      set((s) => ({ tasks: [...s.tasks, t], openId: t.id, version: s.version + 1 }));
      void api.tasksMeta().then((meta) => set({ meta })).catch(() => undefined);
      return t;
    } catch (e) {
      fail(e);
      return null;
    }
  },

  update: async (id, fields) => {
    const before = get().tasks.find((t) => t.id === id);
    if (!before) return;
    // Show the change right away (derived flags included, or a ticked
    // checkbox would bounce back); Python's answer then replaces it.
    const doneStatus = get().meta?.done_status ?? "Completado";
    const optimistic = (t: Task): Task => {
      const next = { ...t, ...fields } as Task;
      next.done = next.status === doneStatus;
      next.overdue = Boolean(next.due && !next.done && next.due < new Date().toISOString().slice(0, 10));
      return next;
    };
    set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? optimistic(t) : t)) }));
    try {
      const saved = await api.tasksUpdate(id, fields);
      set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? saved : t)), version: s.version + 1 }));
      if ("subject" in fields) void api.tasksMeta().then((meta) => set({ meta })).catch(() => undefined);
    } catch (e) {
      set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? before : t)) }));
      fail(e);
    }
  },

  remove: async (id) => {
    const before = get().tasks;
    set((s) => ({
      tasks: s.tasks.filter((t) => t.id !== id),
      openId: s.openId === id ? null : s.openId,
    }));
    try {
      await api.tasksDelete(id);
      set((s) => ({ version: s.version + 1 }));
    } catch (e) {
      set({ tasks: before });
      fail(e);
    }
  },
}));

export function applyFilters(tasks: Task[], f: TaskFilters): Task[] {
  const q = f.query.trim().toLowerCase();
  return tasks.filter((t) => {
    if (q && ![t.name, t.subject, t.status, t.body].join(" ").toLowerCase().includes(q)) return false;
    if (f.status && t.status !== f.status) return false;
    if (f.subject && t.subject !== f.subject) return false;
    if (f.priority && t.priority !== f.priority) return false;
    if (f.hideDone && t.done) return false;
    return true;
  });
}
