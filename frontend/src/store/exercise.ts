// Ejercicio: the routine, the day list and the statistics every view reads.
//
// One store for the whole module so the rings in the sidebar, the grids and the
// daily rows are always the same numbers: anything that ticks an exercise asks
// for a reload and every view updates.

import { create } from "zustand";
import { api } from "../lib/bridge";
import type { Exercise, ExerciseStats } from "../lib/types";
import type { BodyProfile } from "../core/exerciseManager";

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
  profile: BodyProfile | null;
  loaded: boolean;
  error: string | null;
  load: () => Promise<void>;
  /** Routine + statistics, after anything that changes what is done. */
  refresh: () => Promise<void>;
  refreshStats: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  saveProfile: (updates: Partial<BodyProfile>) => Promise<void>;
  addWeight: (date: string, weight: number) => Promise<void>;
  removeWeight: (date: string) => Promise<void>;
}

export const useExercise = create<ExerciseState>((set, get) => ({
  days: [],
  list: [],
  stats: null,
  profile: null,
  loaded: false,
  error: null,

  load: async () => {
    try {
      const [meta, list, stats, profile] = await Promise.all([
        api.exMeta(),
        api.exList(),
        api.exStats(),
        api.exProfile(),
      ]);
      set({ days: meta.days, list, stats, profile, loaded: true, error: null });
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

  refreshProfile: async () => {
    try {
      set({ profile: await api.exProfile() });
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  saveProfile: async (updates) => {
    try {
      const updated = await api.exProfileSave(updates);
      set({ profile: updated, error: null });
    } catch (e) {
      set({ error: (e as Error).message });
      throw e;
    }
  },

  addWeight: async (date, weight) => {
    try {
      const updated = await api.exWeightAdd(date, weight);
      set({ profile: updated, error: null });
    } catch (e) {
      set({ error: (e as Error).message });
      throw e;
    }
  },

  removeWeight: async (date) => {
    try {
      const updated = await api.exWeightRemove(date);
      set({ profile: updated, error: null });
    } catch (e) {
      set({ error: (e as Error).message });
      throw e;
    }
  },
}));

/** The routine entry of a day key, or undefined on a rest day. */
export function useExercisesOfDay(key: string): Exercise[] {
  return useExercise((s) => s.list).filter((e) => e.day === key);
}
