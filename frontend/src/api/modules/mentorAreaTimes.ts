// API del horario por área de un plan (ver `lib/areaTimes.ts`): la hora a la que se estudia cada área. La leen el calendario general y la página
// del área; los dos la cambian con `mentor_area_time_set`, así que siempre coinciden.

import { ApiError } from "../../core/errors.js";
import { AreaTimesStore } from "../../core/mentor/areaTimesStore.js";
import { PLAN_ID_RE, PlanStore } from "../../core/mentor/plan.js";
import { isTime, MAX_DURATION, MIN_DURATION, setAreaTime, type AreaTimes } from "../../lib/areaTimes.js";
import type { AppState } from "../appState.js";

export function mentorAreaTimesApi(app: AppState) {
  const st = (): AreaTimesStore => new AreaTimesStore(app.root);
  const planOf = (opts: unknown): { id: string; areas: Set<string> } => {
    const o = (opts && typeof opts === "object" ? opts : {}) as Record<string, unknown>;
    const id = String(o.planId ?? o.id ?? "");
    if (!PLAN_ID_RE.test(id)) throw new ApiError("Plan inválido.");
    const plan = new PlanStore(app.root).load(id);
    if (!plan) throw new ApiError("Ese plan ya no existe.");
    return { id, areas: new Set(plan.subplans.map((s) => s.id)) };
  };

  return {
    /** Horario de cada área del plan: `{ [subplanId]: { start, durationMin? } }` (solo las que tienen hora). */
    mentor_area_times_get(opts: unknown): { times: AreaTimes } {
      const { id } = planOf(opts);
      return { times: st().load(id) };
    },

    /** Pone la hora (y, si se da, la duración) de un área; `start: null` la quita y vuelve al reparto automático. */
    mentor_area_time_set(opts: unknown): { times: AreaTimes } {
      const { id, areas } = planOf(opts);
      const o = (opts && typeof opts === "object" ? opts : {}) as Record<string, unknown>;
      const subplanId = String(o.subplanId ?? "");
      if (!areas.has(subplanId)) throw new ApiError("Esa área no está en el plan.");
      const store = st();
      const cur = store.load(id);
      if (o.start === null || o.start === "") return { times: store.save(id, setAreaTime(cur, subplanId, null)) };
      if (!isTime(o.start)) throw new ApiError("La hora debe tener la forma HH:MM (por ejemplo 18:30).");
      let durationMin: number | undefined;
      if (o.durationMin !== undefined && o.durationMin !== null && o.durationMin !== "") {
        const d = Math.round(Number(o.durationMin));
        if (!Number.isFinite(d) || d < MIN_DURATION || d > MAX_DURATION) throw new ApiError(`La duración debe estar entre ${MIN_DURATION} y ${MAX_DURATION} minutos.`);
        durationMin = d;
      }
      return { times: store.save(id, setAreaTime(cur, subplanId, { start: o.start, ...(durationMin !== undefined ? { durationMin } : {}) })) };
    },
  };
}
