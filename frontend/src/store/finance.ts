// Finanzas state: the view, catalogues (categories, goals) and dialogs.

import { create } from "zustand";
import { persistField } from "./navState";
import { api } from "../lib/bridge";
import type { FinCategory, FinGoal, FinMeta, FinSidebar, Movement, MovementType } from "../lib/types";
import { useApp } from "./app";

export type FinView = "diario" | "periodo" | "metas" | "categorias" | "recurrentes";

/** Vistas 2A: semanal/mensual/anual se fundieron en "periodo". */
const LEGACY_VIEWS = new Set(["semanal", "mensual", "anual"]);

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
  recurringEditing: { id: string } | null;    // {} = new

  setView: (v: FinView) => void;
  load: () => Promise<void>;
  changed: () => Promise<void>;
  edit: (e: MovementEdit | null) => void;
  openGoal: (id: string | null) => void;
  setGoalEditing: (id: string | null) => void;
  setCategoryEditing: (c: FinState["categoryEditing"]) => void;
  setRecurringEditing: (r: FinState["recurringEditing"]) => void;
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
  recurringEditing: null,

  setView: (view) => set({ view, goalId: null }),
  load: async () => {
    try {
      const [meta, sidebar] = await Promise.all([api.finMeta(), api.finSidebar()]);
      // Materializa recurrentes vencidos antes de pintar: el Diario los ve ya creados.
      let auto = 0;
      try {
        const { todayIso } = await import("../lib/tasks");
        auto = (await api.finRecurringRun(todayIso()))?.created ?? 0;
      } catch {
        /* sin recurrentes no se rompe nada */
      }
      if (auto > 0) {
        useApp.getState().toast("info", auto === 1
          ? "Se creó 1 movimiento automático (recurrente)."
          : `Se crearon ${auto} movimientos automáticos (recurrentes).`);
      }
      // Migra la vista guardada por versiones viejas (semanal/mensual/anual).
      set((s) => ({ meta, sidebar, loaded: true, version: s.version + 1, view: LEGACY_VIEWS.has(s.view as string) ? "periodo" : s.view }));
    } catch (e) {
      useApp.getState().toast("error", (e as Error).message);
    }
  },
  changed: () => get().load(),
  edit: (editing) => set({ editing }),
  openGoal: (goalId) => set({ goalId, view: "metas" }),
  setGoalEditing: (goalEditing) => set({ goalEditing }),
  setCategoryEditing: (categoryEditing) => set({ categoryEditing }),
  setRecurringEditing: (recurringEditing) => set({ recurringEditing }),
}));

export function categoryOf(meta: FinMeta | null, id: string | undefined): FinCategory | undefined {
  return id ? meta?.categories.find((c) => c.id === id) : undefined;
}

export function goalOf(meta: FinMeta | null, id: string | undefined): FinGoal | undefined {
  return id ? meta?.goals.find((g) => g.id === id) : undefined;
}

// La vista interna del módulo se recuerda entre reinicios.
persistField(useFinance, "view", "finance.view");
