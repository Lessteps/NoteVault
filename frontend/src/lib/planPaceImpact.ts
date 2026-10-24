// Mentor — Ritmo diario: cuánto cambia el final del plan con un ritmo dado (vista previa del control «Ritmo diario»). Módulo PURO.

import { catchUpOf } from "./planCatchUp.js";
import { dateLabel, buildSchedule, progressPlan, type SchedulePlan } from "./planSchedule.js";
import type { DailyPace } from "./planPace.js";

export interface PaceImpact {
  /** último día en que cae un tema pendiente dentro del plan (sin el desbordado); undefined si no queda nada */
  finishDate?: string;
  /** temas que no caben antes del fin del plan y se amontonan en el último día */
  overflow: number;
  /** temas pendientes en total (del área o de todo el plan) */
  remaining: number;
  /** días de estudio que quedan hasta el fin (hoy incluido) */
  daysLeft: number;
  /** temas por día de estudio que hacen falta para terminar a tiempo */
  neededPerDay: number;
  fits: boolean;
}

/**
 * El efecto de aplicar `pace` al plan: se rehace el reparto por avance desde `today` (con `isDone` como avance real) y se mide, para un área
 * (`subplanId`) o para todo el plan, cuándo terminan los temas pendientes y cuántos no caben antes del fin (el aviso de constancia).
 */
export function paceImpact(plan: SchedulePlan, pace: DailyPace | undefined, o: { today: string; subplanId?: string; isDone?: (folder: string) => boolean }): PaceImpact {
  const { pace: _old, ...rest } = plan;
  const withPace: SchedulePlan = { ...rest, ...(pace ? { pace } : {}) };
  const sch = buildSchedule(progressPlan(withPace, { today: o.today, ...(o.isDone ? { isDone: o.isDone } : {}) }));
  const mine = (t: { subplanId: string }): boolean => !o.subplanId || t.subplanId === o.subplanId;
  let finishDate: string | undefined;
  const over = new Set<string>();
  for (const d of sch.days) {
    for (const t of d.topics) {
      if (t.done || !mine(t) || t.extra) continue;
      if (t.overflow) over.add(t.folder);
      else if (!finishDate || d.date > finishDate) finishDate = d.date;
    }
  }
  const cu = catchUpOf(
    sch.days.map((d) => ({ date: d.date, study: d.study, topics: d.topics.filter(mine).map((t) => ({ folder: t.folder, title: t.title, minutes: t.minutes, done: t.done, area: t.area })) })),
    o.today,
    plan.end,
    o.isDone,
  );
  return { ...(finishDate ? { finishDate } : {}), overflow: over.size, remaining: cu.remaining, daysLeft: cu.daysLeft, neededPerDay: cu.perDay, fits: over.size === 0 };
}

/** «Terminas el 14 nov, a tiempo» / «No caben 6 temas: hacen falta 4,5 temas al día». */
export function paceImpactText(i: PaceImpact, end: string): string {
  if (!i.remaining) return "No queda nada pendiente.";
  const per = String(i.neededPerDay).replace(".", ",");
  if (!i.fits) return `No caben ${i.overflow} ${i.overflow === 1 ? "tema" : "temas"} antes del ${dateLabel(end)}: harían falta ${per} temas al día.`;
  return `Terminas el ${i.finishDate ? dateLabel(i.finishDate) : dateLabel(end)}, a tiempo (${per} temas al día bastan).`;
}
