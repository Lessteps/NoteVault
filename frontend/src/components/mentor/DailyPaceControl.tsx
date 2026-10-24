// Mentor — «Ritmo diario»: cuántos TEMAS estudiar cada día de estudio («Temas por día») y un «Mínimo diario», para todo el plan o con un ritmo propio
// por área. Sin ritmo manda el reparto automático por minutos. Muestra el efecto en la fecha de fin (el aviso de constancia) y guarda con
// `mentor_plan_pace_set` de forma optimista. Pieza reutilizable por props: quien la monte (cabecera de un área, Ejecución…) pasa el plan y recoge el
// plan nuevo en `onChanged` (y sube `planVersion`).

import { Minus, Plus } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { api } from "../../lib/bridge";
import { PACE_MAX, parsePace, paceFor, type DailyPace, type PaceSetting } from "../../lib/planPace";
import { paceImpact, paceImpactText } from "../../lib/planPaceImpact";
import type { MentorPlan } from "../../lib/types";
import { useApp } from "../../store/app";
import { GhostButton } from "../common/forms";
import { cn } from "../ui";

export interface DailyPaceControlProps {
  planId: string;
  plan: MentorPlan;
  /** el área (id de subplan) de la página: ofrece «Ritmo propio para esta área»; sin él se edita el ritmo general del plan */
  subplanId?: string;
  /** «hoy» (AAAA-MM-DD) para medir el efecto; por defecto, la fecha local */
  today?: string;
  /** avance real (temas completos en vivo) para medir el efecto */
  isDone?: (folder: string) => boolean;
  onChanged: (plan: MentorPlan) => void;
  className?: string;
}

const localToday = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

function Stepper({ label, value, zeroText, onStep }: { label: string; value: number; zeroText: string; onStep: (delta: number) => void }) {
  const id = useId();
  return (
    <div role="group" aria-labelledby={id} className="flex flex-wrap items-center gap-2" data-testid={`pace-stepper-${label}`}>
      <span id={id} className="min-w-32 text-[14px] font-medium text-text">{label}</span>
      <button type="button" aria-label={`Menos: ${label}`} disabled={value <= 0} onClick={() => onStep(-1)} className="grid h-9 w-9 place-items-center rounded-lg border border-line text-dim hover:bg-hover hover:text-text disabled:opacity-40">
        <Minus size={15} aria-hidden />
      </button>
      <output aria-live="polite" aria-label={`${label}: ${value > 0 ? value : zeroText}`} className="min-w-20 text-center text-[15px] font-semibold tabular-nums text-text">{value > 0 ? value : zeroText}</output>
      <button type="button" aria-label={`Más: ${label}`} disabled={value >= PACE_MAX} onClick={() => onStep(1)} className="grid h-9 w-9 place-items-center rounded-lg border border-line text-dim hover:bg-hover hover:text-text disabled:opacity-40">
        <Plus size={15} aria-hidden />
      </button>
    </div>
  );
}

export function DailyPaceControl({ planId, plan, subplanId, today, isDone, onChanged, className }: DailyPaceControlProps) {
  const toast = useApp((s) => s.toast);
  const uid = useId();
  const [pace, setPace] = useState<DailyPace>(plan.pace ?? {});
  const pending = useRef(0);
  const serverKey = JSON.stringify(plan.pace ?? {});
  // la copia del plan manda cuando no hay guardados en vuelo
  useEffect(() => {
    if (pending.current === 0) setPace(plan.pace ?? {});
  }, [serverKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const own = !!subplanId && !!pace.areas?.[subplanId];
  const target: PaceSetting = own ? pace.areas![subplanId!]! : { perDay: pace.perDay, minPerDay: pace.minPerDay };
  const perDay = target.perDay ?? 0;
  const minPerDay = target.minPerDay ?? 0;
  const areaName = plan.subplans.find((s) => s.id === subplanId)?.area;

  const save = async (next: DailyPace | undefined): Promise<void> => {
    const prev = pace;
    setPace(next ?? {});
    pending.current++;
    try {
      onChanged(await api.mentorPlanPaceSet({ id: planId, pace: next ?? null }));
    } catch (e) {
      setPace(prev);
      toast("error", (e as Error).message);
    } finally {
      pending.current--;
    }
  };
  const commit = (next: DailyPace): void => {
    try {
      const ok = parsePace(next, plan.subplans.map((s) => s.id));
      void save(ok);
    } catch (e) {
      toast("error", (e as Error).message);
    }
  };
  const withTarget = (s: PaceSetting): DailyPace => {
    if (own) return { ...pace, areas: { ...pace.areas, [subplanId!]: { perDay: s.perDay ?? 0, minPerDay: s.minPerDay ?? 0 } } };
    return { ...pace, perDay: s.perDay ?? 0, minPerDay: s.minPerDay ?? 0 };
  };
  const step = (field: "perDay" | "minPerDay", delta: number): void => {
    const cur = { perDay, minPerDay };
    const v = Math.max(0, Math.min(PACE_MAX, cur[field] + delta));
    const next = { ...cur, [field]: v };
    // el mínimo nunca pasa de los temas por día: se arrastran el uno al otro
    if (field === "minPerDay" && next.perDay > 0 && v > next.perDay) next.perDay = v;
    if (field === "perDay" && v > 0 && next.minPerDay > v) next.minPerDay = v;
    commit(withTarget(next));
  };
  const toggleOwn = (on: boolean): void => {
    if (!subplanId) return;
    if (on) {
      const eff = paceFor(pace, subplanId);
      commit({ ...pace, areas: { ...pace.areas, [subplanId]: { perDay: eff.perDay ?? 0, minPerDay: eff.minPerDay ?? 0 } } });
    } else {
      const { [subplanId]: _gone, ...rest } = pace.areas ?? {};
      const { areas: _a, ...global } = pace;
      commit({ ...global, ...(Object.keys(rest).length ? { areas: rest } : {}) });
    }
  };
  const reset = (): void => {
    if (own) return toggleOwn(false);
    commit(pace.areas ? { areas: pace.areas } : {});
  };

  const day = today ?? localToday();
  const impact = useMemo(() => {
    const eff = subplanId ? paceFor(pace, subplanId) : { perDay: pace.perDay, minPerDay: pace.minPerDay };
    if (!eff.perDay && !eff.minPerDay) return null;
    return paceImpact(plan, pace.perDay || pace.minPerDay || pace.areas ? pace : undefined, { today: day, ...(subplanId ? { subplanId } : {}), ...(isDone ? { isDone } : {}) });
  }, [plan, pace, subplanId, day, isDone]);
  const manual = !!(perDay || minPerDay);

  return (
    <section aria-labelledby={`${uid}-h`} className={cn("rounded-xl border border-line bg-surface px-3.5 py-3", className)} data-testid="daily-pace">
      <h3 id={`${uid}-h`} className="text-[13px] font-semibold uppercase tracking-wider text-faint">Ritmo diario{own && areaName ? ` · ${areaName}` : ""}</h3>
      <p className="mt-1 text-[14px] text-dim">
        {manual ? "Cada día de estudio recibes exactamente esos temas de la ruta, en orden." : "Automático: los temas de cada día salen del tiempo que tienes."}
      </p>
      {subplanId && (
        <label className="mt-2 flex min-h-9 items-center gap-2 text-[14px] text-text">
          <input type="checkbox" checked={own} onChange={(e) => toggleOwn(e.target.checked)} />
          Ritmo propio para {areaName ?? "esta área"}
        </label>
      )}
      <div className="mt-2 space-y-2">
        <Stepper label="Temas por día" value={perDay} zeroText="Automático" onStep={(d) => step("perDay", d)} />
        <Stepper label="Mínimo diario" value={minPerDay} zeroText="Sin mínimo" onStep={(d) => step("minPerDay", d)} />
      </div>
      {manual && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <GhostButton onClick={reset}>{own ? "Quitar el ritmo propio de esta área" : "Volver al reparto automático"}</GhostButton>
        </div>
      )}
      {impact && (
        <p role="status" aria-live="polite" className={cn("mt-2 text-[14px]", impact.fits ? "text-dim" : "text-warn")} data-testid="pace-impact">
          {paceImpactText(impact, plan.end)}
        </p>
      )}
    </section>
  );
}
