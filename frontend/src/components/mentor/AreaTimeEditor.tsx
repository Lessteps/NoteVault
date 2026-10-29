// Mentor — hora de estudio de cada área («Backend 09:00, 60 min») que se ve en el módulo Calendario. Un solo dato por plan y área (API
// `mentor_area_time_set`): el panel de la Vista general (colapsado) y el de la página del área leen y escriben lo mismo, así que lo que cambies en
// uno aparece en el otro y en el Calendario. Sin hora fija, el bloque se apila solo desde las 09:00.

import { Clock, X } from "lucide-react";
import { useEffect } from "react";
import { create } from "zustand";
import { api } from "../../lib/bridge";
import { isTime, MAX_DURATION, MIN_DURATION, type AreaTime, type AreaTimes } from "../../lib/areaTimes";
import type { MentorPlan } from "../../lib/types";
import { useApp } from "../../store/app";
import { AreaDot } from "./AreaViews";
import { input } from "../common/forms";
import { cn } from "../ui";

interface TimesStore {
  planId: string;
  times: AreaTimes;
  load: (planId: string) => Promise<void>;
  set: (planId: string, subplanId: string, start: string | null, durationMin?: number | null) => Promise<void>;
}

export const useAreaTimes = create<TimesStore>((set, get) => ({
  planId: "",
  times: {},
  load: async (planId) => {
    try {
      const r = await api.mentorAreaTimesGet({ planId });
      set({ planId, times: r.times ?? {} });
    } catch {
      set({ planId, times: {} });
    }
  },
  set: async (planId, subplanId, start, durationMin) => {
    const r = await api.mentorAreaTimeSet({ planId, subplanId, start, ...(durationMin !== undefined ? { durationMin } : {}) });
    if (get().planId === planId || !get().planId) set({ planId, times: r.times ?? {} });
  },
}));

function useLoaded(planId: string): AreaTimes {
  const times = useAreaTimes((s) => s.times);
  const cur = useAreaTimes((s) => s.planId);
  useEffect(() => {
    if (cur !== planId) void useAreaTimes.getState().load(planId);
  }, [planId, cur]);
  return cur === planId ? times : {};
}

function Row({ planId, id, name, areaId, time }: { planId: string; id: string; name: string; areaId?: string; time: AreaTime | undefined }) {
  const toast = useApp((s) => s.toast);
  const save = (start: string | null, durationMin?: number | null): void => {
    useAreaTimes.getState().set(planId, id, start, durationMin).catch((e: Error) => toast("error", e.message));
  };
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-line px-3 py-2" data-testid="area-time-row" data-area={areaId ?? id}>
      <span className="inline-flex min-w-0 flex-1 basis-32 items-center gap-2 text-[14.5px] font-semibold">
        <AreaDot {...(areaId ? { areaId } : {})} /> <span className="break-words">{name}</span>
      </span>
      <label className="inline-flex items-center gap-1.5 text-[13.5px] text-dim">
        Hora
        <input
          type="time"
          className={cn(input, "w-28")}
          value={time?.start ?? ""}
          aria-label={`Hora de estudio de ${name}`}
          data-testid="area-time-start"
          onChange={(e) => (isTime(e.target.value) ? save(e.target.value, time?.durationMin ?? null) : e.target.value === "" ? save(null) : undefined)}
        />
      </label>
      <label className="inline-flex items-center gap-1.5 text-[13.5px] text-dim">
        Duración
        <input
          type="number"
          min={MIN_DURATION}
          max={MAX_DURATION}
          step={15}
          className={cn(input, "w-20")}
          defaultValue={time?.durationMin ?? ""}
          key={`${id}:${time?.durationMin ?? ""}`}
          placeholder="auto"
          disabled={!time}
          aria-label={`Duración en minutos del bloque de ${name}`}
          data-testid="area-time-duration"
          onBlur={(e) => {
            if (!time) return;
            const v = e.target.value.trim();
            if (v === String(time.durationMin ?? "")) return;
            save(time.start, v === "" ? null : Number(v));
          }}
        />
        min
      </label>
      {time ? (
        <button type="button" onClick={() => save(null)} className="inline-flex min-h-8 items-center gap-1 rounded px-2 text-[13px] text-dim hover:bg-hover hover:text-text" data-testid="area-time-clear" title="Quitar la hora fija: vuelve al reparto automático">
          <X size={13} aria-hidden /> Quitar
        </button>
      ) : (
        <span className="text-[12.5px] text-faint">automática desde las 09:00</span>
      )}
    </li>
  );
}

/** Vista general: TODAS las áreas, plegadas por omisión en una sola línea; al abrir, una fila por área. */
export function AreaTimesPanel({ plan }: { plan: MentorPlan }) {
  const times = useLoaded(plan.id);
  const fixed = plan.subplans.filter((s) => times[s.id]).length;
  return (
    <details className="mb-3 rounded-2xl border border-line bg-card px-4 py-2.5" data-testid="area-times-panel">
      <summary className="inline-flex min-h-9 cursor-pointer items-center gap-2 text-[15px] font-semibold">
        <Clock size={16} aria-hidden className="text-accent-text" /> Horario por área
        <span className="text-[13.5px] font-normal text-dim">· {fixed === 0 ? "todas automáticas" : `${fixed} con hora fija`} · se ve en el Calendario</span>
      </summary>
      <p className="mb-2 mt-1 text-[13.5px] text-dim">Pon a cada área la hora a la que la estudias. Aparece en el módulo Calendario y, si la cambias desde la página del área, se cambia aquí también.</p>
      <ul className="space-y-2" aria-label="Hora de estudio de cada área">
        {plan.subplans.map((s) => <Row key={s.id} planId={plan.id} id={s.id} name={s.area} {...(s.areaId ? { areaId: s.areaId } : {})} time={times[s.id]} />)}
      </ul>
    </details>
  );
}

/** Página de UN área: solo su fila. */
export function AreaTimeInline({ plan, subplanId }: { plan: MentorPlan; subplanId: string }) {
  const times = useLoaded(plan.id);
  const s = plan.subplans.find((x) => x.id === subplanId);
  if (!s) return null;
  return (
    <section className="mb-3" aria-label={`Hora de estudio de ${s.area}`} data-testid="area-time-inline">
      <ul><Row planId={plan.id} id={s.id} name={s.area} {...(s.areaId ? { areaId: s.areaId } : {})} time={times[s.id]} /></ul>
    </section>
  );
}
