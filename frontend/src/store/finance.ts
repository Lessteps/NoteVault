// Finanzas state: the view, catalogues (categories, goals) and dialogs.

import { create } from "zustand";
import { api } from "../lib/bridge";
import type { FinCategory, FinGoal, FinMeta, FinSidebar, Movement, MovementType } from "../lib/types";
import { useApp } from "./app";

export type FinView = "diario" | "semanal" | "mensual" | "anual" | "metas" | "categorias";

export interface MovementEdit {
  day: string;
  kind: MovementType;
  movement?: Movement;
  preset?: Partial<Movement>;
  /** Called after a successful save (e.g. a savings check). */
  onSaved?: () => void;
  onCancel?: () => void;
}

interface FinState {
  view: FinView;
  meta: FinMeta | null;
  sidebar: FinSidebar | null;
  loaded: boolean;
  version: number;
  editing: MovementEdit | null;
  goalId: string | null;
  goalEditing: string | null;    // "" = new
  categoryEditing: { id: string; kind: "gasto" | "ingreso" } | null;

  setView: (v: FinView) => void;
  load: () => Promise<void>;
  changed: () => Promise<void>;
  edit: (e: MovementEdit | null) => void;
  openGoal: (id: string | null) => void;
  setGoalEditing: (id: string | null) => void;
  setCategoryEditing: (c: FinState["categoryEditing"]) => void;
}

export const useFinance = create<FinState>((set, get) => ({
  view: "diario",
  meta: null,
  sidebar: null,
  loaded: false,
  version: 0,
  editing: null,
  goalId: null,
  goalEditing: null,
  categoryEditing: null,

  setView: (view) => set({ view, goalId: null }),
  load: async () => {
    try {
      const [meta, sidebar] = await Promise.all([api.finMeta(), api.finSidebar()]);
      set((s) => ({ meta, sidebar, loaded: true, version: s.version + 1 }));
    } catch (e) {
      useApp.getState().toast("error", (e as Error).message);
    }
  },
  changed: () => get().load(),
  edit: (editing) => set({ editing }),
  openGoal: (goalId) => set({ goalId, view: "metas" }),
  setGoalEditing: (goalEditing) => set({ goalEditing }),
  setCategoryEditing: (categoryEditing) => set({ categoryEditing }),
}));

export function categoryOf(meta: FinMeta | null, id: string | undefined): FinCategory | undefined {
  return id ? meta?.categories.find((c) => c.id === id) : undefined;
}

export function goalOf(meta: FinMeta | null, id: string | undefined): FinGoal | undefined {
  return id ? meta?.goals.find((g) => g.id === id) : undefined;
}
