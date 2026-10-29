// Currículo de referencia — cobertura por área y tareas para el agente externo que están a medias. La cobertura se lee UNA vez y la comparten las
// páginas de espacio/área de Notas, la ruta «Áreas» del Mentor y la vista «Temas por crear». Nada de aquí escribe en la vault: crear temas es cosa del
// agente externo; la app solo escribe el archivo de la tarea (en el backend).

import { useEffect } from "react";
import { create } from "zustand";
import { api } from "../lib/bridge";
import type { AreaCoverage } from "../lib/curriculum";
import type { CurriculumHandoff, MentorAddTopicsResult } from "../lib/types";

export type CurriculumHandoffState = CurriculumHandoff;
export type EntryProgressKey = "folder" | "note" | "manifest" | "exercises" | "map";

/** Las operaciones del backend (nombres acordados). Se accede de forma tolerante: si aún no están, la interfaz se queda sin datos, no se rompe. */
interface CurriculumApi {
  studyCurriculumCoverage?: (o?: { space?: string }) => Promise<{ areas: AreaCoverage[] }>;
  studyCurriculumHandoff?: (o: { areaId: string; entryIds: string[]; withExercises?: boolean; confirm: true }) => Promise<CurriculumHandoffState>;
  studyCurriculumHandoffBatches?: (o: { areaId: string; importance?: string; size?: number; withExercises?: boolean; confirm: true }) => Promise<CurriculumHandoffState[]>;
  studyCurriculumHandoffStatus?: (id: string) => Promise<CurriculumHandoffState>;
  studyCurriculumHandoffValidate?: (id: string) => Promise<CurriculumHandoffState>;
  studyCurriculumHandoffList?: () => Promise<CurriculumHandoffState[]>;
}
export const curriculumApi = (): CurriculumApi => api as unknown as CurriculumApi;

function need<T extends keyof CurriculumApi>(name: T): NonNullable<CurriculumApi[T]> {
  const fn = curriculumApi()[name];
  if (!fn) throw new Error("Esta versión de la app todavía no puede hacerlo.");
  return fn as NonNullable<CurriculumApi[T]>;
}

interface CurriculumStore {
  areas: AreaCoverage[];
  loaded: boolean;
  loading: boolean;
  error: string;
  /** sube al recalcular; las vistas que dependen de la cobertura lo leen para refrescarse */
  version: number;
  pending: CurriculumHandoffState[];
  load: (force?: boolean) => Promise<void>;
  loadPending: () => Promise<void>;
  /** tras crear/validar: recalcula la cobertura y avisa a las vistas */
  refresh: () => Promise<void>;
  create: (o: { areaId: string; entryIds: string[]; withExercises?: boolean }) => Promise<CurriculumHandoffState>;
  /** una tarea por lote con TODO lo que falta (por importancia); el agente las ejecuta en orden */
  createBatches: (o: { areaId: string; importance?: string; size?: number; withExercises?: boolean }) => Promise<CurriculumHandoffState[]>;
  status: (id: string) => Promise<CurriculumHandoffState>;
  validate: (id: string) => Promise<CurriculumHandoffState>;
  /** «Añadir al plan»: lleva al final de la ruta del plan los temas validados (idempotente); no cambia la cobertura */
  addToPlan: (planId: string, folders: string[]) => Promise<MentorAddTopicsResult>;
}

const upsert = (list: CurriculumHandoffState[], h: CurriculumHandoffState): CurriculumHandoffState[] =>
  list.some((x) => x.id === h.id) ? list.map((x) => (x.id === h.id ? h : x)) : [h, ...list];

export const useCurriculum = create<CurriculumStore>((set, get) => ({
  areas: [],
  loaded: false,
  loading: false,
  error: "",
  version: 0,
  pending: [],
  load: async (force = false) => {
    if (get().loading || (get().loaded && !force)) return;
    set({ loading: true });
    try {
      const r = await need("studyCurriculumCoverage")({});
      set((s) => ({ areas: r?.areas ?? [], loaded: true, loading: false, error: "", version: s.version + 1 }));
    } catch (e) {
      set({ loading: false, loaded: true, error: (e as Error).message });
    }
  },
  loadPending: async () => {
    try {
      const list = await need("studyCurriculumHandoffList")();
      set({ pending: (list ?? []).filter((h) => h.status === "waiting" || h.status === "failed") });
    } catch {
      /* sin lista: simplemente no hay tareas que reabrir */
    }
  },
  refresh: async () => {
    await get().load(true);
    await get().loadPending();
  },
  create: async (o) => {
    const h = await need("studyCurriculumHandoff")({ ...o, confirm: true });
    set((s) => ({ pending: upsert(s.pending, h) }));
    return h;
  },
  createBatches: async (o) => {
    const list = await need("studyCurriculumHandoffBatches")({ ...o, confirm: true });
    set((s) => ({ pending: list.reduce((acc, h) => upsert(acc, h), s.pending) }));
    return list;
  },
  status: async (id) => {
    const h = await need("studyCurriculumHandoffStatus")(id);
    set((s) => ({ pending: s.pending.some((x) => x.id === id) ? upsert(s.pending, h) : s.pending }));
    return h;
  },
  validate: async (id) => {
    const h = await need("studyCurriculumHandoffValidate")(id);
    set((s) => ({ pending: h.status === "validated" ? s.pending.filter((x) => x.id !== id) : upsert(s.pending, h) }));
    return h;
  },
  addToPlan: async (planId, folders) => api.mentorPlanAddTopics({ planId, folders }),
}));

/** La cobertura de todas las áreas del currículo (una sola lectura compartida; `refresh()` la recalcula). */
export function useCoverage(): { areas: AreaCoverage[]; loaded: boolean; error: string } {
  const areas = useCurriculum((s) => s.areas);
  const loaded = useCurriculum((s) => s.loaded);
  const error = useCurriculum((s) => s.error);
  const load = useCurriculum((s) => s.load);
  useEffect(() => {
    void load();
  }, [load]);
  return { areas, loaded, error };
}
