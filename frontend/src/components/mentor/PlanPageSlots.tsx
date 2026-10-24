// Mentor — Planeación: controles con nombre de las páginas del plan (Vista general, un área, Bases):
//
//  · `PaceSlot`      — «Ritmo diario» de la página: botón en la cabecera, junto a «Preguntar o ajustar» (una vez por página). Abre un panel con
//                      `DailyPaceControl` (el ritmo propio del área en una página de área; el general en la Vista general).
//  · `AddTopicSlot`  — «+ Tema» al final de cada fila de «Días de la semana (plan diario)»: abre `AddExtraTopic` para ese día.
//
// Ambos suben `planVersion` al cambiar, para que el resto de vistas (Ejecución incluida) recarguen el plan.

import { Gauge } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { paceFor, type PaceSetting } from "../../lib/planPace";
import type { MentorPlan } from "../../lib/types";
import { GhostButton } from "../common/forms";
import { AddExtraTopic } from "./AddExtraTopic";
import { DailyPaceControl } from "./DailyPaceControl";
import { bumpPlanVersion } from "./extraKit";
import type { PageScope } from "./mentorAreas";

export interface PageSlotCtx {
  plan: MentorPlan;
  scope: PageScope;
  /** el plan cambió (propósitos, ritmo, temas extra…): sustituye el plan cargado */
  onChanged: (p: MentorPlan) => void;
  announce?: (msg: string) => void;
  /** «hoy» (AAAA-MM-DD) y el avance real en vivo, para medir el efecto del ritmo */
  today?: string;
  isDone?: (folder: string) => boolean;
}
export interface DaySlotCtx extends PageSlotCtx {
  /** AAAA-MM-DD del día de la fila */
  date: string;
}

/** «3 temas/día · mín. 2» / «Automático». */
export function paceButtonText(s: PaceSetting): string {
  if (!s.perDay && !s.minPerDay) return "Automático";
  const per = s.perDay ? `${s.perDay} ${s.perDay === 1 ? "tema" : "temas"}/día` : "Automático";
  return s.minPerDay ? `${per} · mín. ${s.minPerDay}` : per;
}

const subplanOf = (scope: PageScope): string | undefined => (scope.kind === "area" ? scope.subplanId : undefined);

/** El ritmo que rige la página: el del área (con el general detrás) o el general. */
export function pagePace(plan: MentorPlan, scope: PageScope): PaceSetting {
  const sid = subplanOf(scope);
  return sid ? paceFor(plan.pace, sid) : { perDay: plan.pace?.perDay, minPerDay: plan.pace?.minPerDay };
}

/** Cabecera de la página: el botón «Ritmo diario» y su panel. */
export function PaceSlot({ plan, scope, onChanged, announce, today, isDone }: PageSlotCtx): ReactNode {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent): void => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", down);
    return () => document.removeEventListener("mousedown", down);
  }, [open]);
  const sid = subplanOf(scope);
  const text = paceButtonText(pagePace(plan, scope));
  return (
    <div ref={box} className="relative" data-testid="pace-slot" onKeyDown={(e) => { if (e.key === "Escape" && open) { e.stopPropagation(); setOpen(false); } }}>
      <GhostButton large onClick={() => setOpen((v) => !v)} aria-expanded={open} title="Cuántos temas estudiar cada día y el mínimo diario" data-testid="pace-button">
        <Gauge size={16} aria-hidden /> Ritmo diario: {text}
      </GhostButton>
      {open && (
        <div role="dialog" aria-label="Ritmo diario" className="absolute right-0 z-30 mt-1 w-[min(92vw,26rem)] rounded-2xl border border-line-strong bg-card p-1 shadow-xl" data-testid="pace-panel">
          <DailyPaceControl
            planId={plan.id}
            plan={plan}
            {...(sid ? { subplanId: sid } : {})}
            {...(today ? { today } : {})}
            {...(isDone ? { isDone } : {})}
            onChanged={(p) => {
              onChanged(p);
              bumpPlanVersion();
              announce?.("Ritmo diario actualizado.");
            }}
            className="border-0"
          />
        </div>
      )}
    </div>
  );
}

/** Fila de un día: «+ Tema» (un tema extra de la ruta o de la vault). */
export function AddTopicSlot({ plan, scope, date, onChanged, announce }: DaySlotCtx): ReactNode {
  const area = subplanOf(scope);
  return (
    <AddExtraTopic
      planId={plan.id}
      date={date}
      {...(area ? { area } : {})}
      minDate={plan.start}
      maxDate={plan.end}
      label="Adelantar tema"
      onChanged={(p) => {
        onChanged(p);
        bumpPlanVersion();
        announce?.("Tema adelantado.");
      }}
    />
  );
}
