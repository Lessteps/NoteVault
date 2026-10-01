/**
 * Métricas musculares de un periodo: cuántas sesiones entrenaron cada músculo
 * y cuántas reps se movieron. Sale de los mismos logs que la rejilla pinta,
 * así que marcar una casilla cambia los números sin vuelta extra.
 *
 * Función pura: la usa el mapa grande de Progreso y podría usar el modal.
 */

import type { Exercise } from "./types";

export type ProgressPeriod = "semana" | "mes" | "anio";

/** The slice of an `ExerciseDay` the metrics need. */
export interface MetricDay {
  date: string;
  exercises: Array<{ id: string; name: string }>;
  log: Record<string, { done?: boolean; reps?: number; weight?: number } | undefined>;
}

export interface MuscleMetric {
  /** Días del periodo en los que el músculo se trabajó. */
  sessions: number;
  /** Repeticiones sumadas de todo lo marcado. */
  reps: number;
  /** Ejercicios distintos que lo trabajan en el periodo. */
  exercises: number;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** `[desde, hasta]` inclusive del periodo que contiene `iso`. */
export function periodRange(period: ProgressPeriod, iso: string): [string, string] {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  if (period === "anio") return [`${y}-01-01`, `${y}-12-31`];
  if (period === "mes") {
    const last = new Date(y, m, 0).getDate();
    return [`${y}-${pad(m)}-01`, `${y}-${pad(m)}-${pad(last)}`];
  }
  // Semana de lunes a domingo, como el resto del módulo.
  const date = new Date(y, m - 1, d);
  const monday = new Date(date);
  monday.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const iso2 = (x: Date) => `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
  return [iso2(monday), iso2(sunday)];
}

/**
 * `muscleId` → sesiones, reps y ejercicios. Un músculo trained por dos vías
 * del mismo ejercicio (principal y secundario) cuenta una sola vez.
 */
export function muscleMetrics(
  list: Pick<Exercise, "id" | "muscles">[],
  days: MetricDay[],
): Map<string, MuscleMetric> {
  const byId = new Map(list.map((e) => [e.id, e.muscles ?? { primary: [], secondary: [] }]));
  const out = new Map<string, MuscleMetric>();
  const exercisedPerMuscle = new Map<string, Set<string>>();

  const touch = (id: string) => {
    let m = out.get(id);
    if (!m) {
      m = { sessions: 0, reps: 0, exercises: 0 };
      out.set(id, m);
    }
    return m;
  };

  for (const day of days) {
    // Un mismo día no cuenta dos veces para el mismo músculo.
    const today = new Set<string>();
    for (const ex of day.exercises) {
      if (!day.log[ex.id]?.done) continue;
      const reps = day.log[ex.id]?.reps ?? 0;
      const m = byId.get(ex.id);
      if (!m) continue;
      for (const id of new Set([...m.primary, ...m.secondary])) {
        const metric = touch(id);
        if (!today.has(id)) {
          metric.sessions += 1;
          today.add(id);
        }
        metric.reps += reps;
        let seen = exercisedPerMuscle.get(id);
        if (!seen) {
          seen = new Set();
          exercisedPerMuscle.set(id, seen);
        }
        seen.add(ex.id);
      }
    }
  }

  for (const [id, seen] of exercisedPerMuscle) {
    const m = out.get(id);
    if (m) m.exercises = seen.size;
  }
  return out;
}