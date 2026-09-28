// Ejercicio: the routine, the day list and the statistics every view reads.
//
// One store for the whole module so the rings in the sidebar, the grids and the
// daily rows are always the same numbers: anything that ticks an exercise asks
// for a reload and every view updates.

import { create } from "zustand";
import { api } from "../lib/bridge";
import type { Exercise, ExerciseStats } from "../lib/types";

export interface ExerciseDayMeta {
  key: string;
  name: string;
  subtitle: string;
  glyph: string;
}

interface ExerciseState {
  days: ExerciseDayMeta[];
  list: Exercise[];
  stats: ExerciseStats | null;
  loaded: boolean;
  error: string | null;
  load: () => Promise<void>;
  /** Routine + statistics, after anything that changes what is done. */
  refresh: () => Promise<void>;
  refreshStats: () => Promise<void>;
}

export const useExercise = create<ExerciseState>((set) => ({
  days: [],
  list: [],
  stats: null,
  loaded: false,
  error: null,

  load: async () => {
    try {
      const [meta, list, stats] = await Promise.all([
        api.exMeta(),
        api.exList(),
        api.exStats(),
      ]);
      set({ days: meta.days, list, stats, loaded: true, error: null });
    } catch (e) {
      set({ loaded: true, error: (e as Error).message });
    }
  },

  refresh: async () => {
    try {
      const [list, stats] = await Promise.all([api.exList(), api.exStats()]);
      set({ list, stats, error: null });
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  refreshStats: async () => {
    try {
      set({ stats: await api.exStats() });
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },
}));

/** The routine entry of a day key, or undefined on a rest day. */
export function useExercisesOfDay(key: string): Exercise[] {
  return useExercise((s) => s.list).filter((e) => e.day === key);
}
