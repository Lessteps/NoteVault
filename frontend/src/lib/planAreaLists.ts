// Mentor — Ejecución: los conjuntos de temas con los que se filtra la ruta de un área: los de HOY, los de ESTA SEMANA y los PENDIENTES (los que
// tocaban hasta hoy y no se terminaron). Salen del reparto del plan (`buildSchedule`), no de las semanas objetivo, así que coinciden con la Agenda.
// Módulo PURO.

import type { ScheduleDay } from "./planSchedule.js";

export interface AreaSets {
  today: Set<string>;
  week: Set<string>;
  /** su tiempo previsto ya pasó (días anteriores a hoy) y siguen sin completarse; vacío mientras la ruta no ha empezado */
  pending: Set<string>;
}

/**
 * Los conjuntos de un área (`subplanId`) o, sin él, de todo el plan. Un tema solo queda PENDIENTE cuando pasa su tiempo previsto (un día anterior
 * a hoy) y la ruta ya empezó (`started`): sin haber empezado, nada está pendiente.
 */
export function areaSets(days: ReadonlyArray<ScheduleDay>, subplanId: string | null, today: string, week: number, started = true): AreaSets {
  const out: AreaSets = { today: new Set(), week: new Set(), pending: new Set() };
  const done = new Set<string>();
  for (const d of days) {
    for (const t of d.topics) {
      if (subplanId && t.subplanId !== subplanId) continue;
      if (t.done) done.add(t.folder);
      if (d.date === today) out.today.add(t.folder);
      if (d.week === week) out.week.add(t.folder);
      if (started && d.date < today) out.pending.add(t.folder);
    }
  }
  // un tema ya completado (en cualquier día de su reparto) no queda pendiente
  for (const f of done) out.pending.delete(f);
  return out;
}
