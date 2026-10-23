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
 * a hoy) y la ruta ya empezó (`started`): sin haber empezado, nada está pendiente. `pick` acota además los temas (la Ejecución pasa la regla de
 * `planTopicsByArea`: un área sin sus fundamentos, y las Bases solo con ellos).
 */
export function areaSets(days: ReadonlyArray<ScheduleDay>, subplanId: string | null, today: string, week: number, started = true, pick?: (t: ScheduleDay["topics"][number]) => boolean): AreaSets {
  const out: AreaSets = { today: new Set(), week: new Set(), pending: new Set() };
  const done = new Set<string>();
  for (const d of days) {
    for (const t of d.topics) {
      if (subplanId && t.subplanId !== subplanId) continue;
      if (pick && !pick(t)) continue;
      if (t.done) done.add(t.folder);
      if (d.date === today) out.today.add(t.folder);
      if (d.week === week) out.week.add(t.folder);
      if (started && d.date < today) out.pending.add(t.folder);
    }
  }
  // un tema ya completado (en cualquier día de su reparto) no queda pendiente
  for (const f of done) {
    out.pending.delete(f);
  }
  return out;
}

/**
 * LA definición de las listas de la Ejecución de un área (o de las Bases), la misma para «Temas de hoy», «Temas de la semana» y «Pendientes»:
 *  · Hoy = EXACTAMENTE los temas que la Agenda (Día) reparte hoy a esa área (`todayRows`, que salen de `dayByArea`/`dayBases`), en su orden. Lo
 *    atrasado NO se mezcla aquí: no hay «Toca ahora» ni se sustituye lo de hoy por la ruta abierta.
 *  · Semana = los temas repartidos esta semana (la Agenda, Semana).
 *  · Pendientes = lo repartido en días ANTERIORES a hoy que sigue abierto (la Agenda lo sigue enseñando en su fecha); vacío mientras la ruta no
 *    ha empezado (`areaSets`).
 */
export function executionLists<R extends { folder: string; done: boolean }>(routeRows: readonly R[], todayRows: readonly R[], sets: AreaSets): { hoy: R[]; semana: R[]; pendientes: R[] } {
  return {
    hoy: [...todayRows],
    semana: routeRows.filter((r) => sets.week.has(r.folder)),
    pendientes: routeRows.filter((r) => sets.pending.has(r.folder) && !r.done),
  };
}
