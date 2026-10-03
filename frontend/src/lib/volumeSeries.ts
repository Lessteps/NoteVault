/**
 * La serie temporal que pinta la gráfica de Progreso: una línea por grupo
 * muscular, con el eje X en los días del periodo.
 *
 * Tres reglas que hacen legible la gráfica:
 *
 * - Un día sin entrenar es un **hueco** (`null`), no un cero. Una línea con
 *   ceros parece una caída de rendimiento; un hueco dice "no entrené".
 * - Las reps de un ejercicio se reparten entre los grupos que toca. El press
 *   de banca alimenta Pecho (principal) y Brazos (tríceps), así que ambas
 *   líneas suben ese día.
 * - Marcar sin escribir reps cuenta como **una** serie. Si no, la actividad
 *   desaparecería de la gráfica solo por no haber apuntado el número.
 */

import { granularGroup, muscleById } from "./muscles";

/**
 * El grupo grande de un músculo, venga granular (`biceps-brachialis`) o grueso
 * (`pectoral`, que es como los guarda la rutina).
 */
export function groupOf(id: string): string {
  return granularGroup(id) || muscleById(id)?.group || "";
}

export interface VolumeExercise {
  id: string;
  name: string;
  muscles: { primary: string[]; secondary: string[] };
}

export interface VolumeDay {
  date: string;
  exercises: Array<{ id: string; name: string }>;
  log: Record<string, { done?: boolean; reps?: number } | undefined>;
}

export interface VolumeSeries {
  /** Fechas, en orden: el eje X. */
  labels: string[];
  /** Grupo → valor por día. Solo los grupos que/spring algo en el periodo. */
  values: Record<string, Array<number | null>>;
}

export function volumeSeries(
  list: VolumeExercise[],
  days: VolumeDay[],
  groups: string[],
): VolumeSeries {
  const wanted = new Set(groups);
  const byId = new Map(list.map((e) => [e.id, e]));
  const values: Record<string, Array<number | null>> = {};
  for (const g of groups) values[g] = days.map(() => null);
  const labels = days.map((d) => d.date);

  days.forEach((day, i) => {
    for (const done of day.exercises) {
      const entry = day.log[done.id];
      if (!entry?.done) continue;
      const ex = byId.get(done.id);
      if (!ex) continue;
      // Sin reps apuntadas, la marca pesa como una serie.
      const share = entry.reps && entry.reps > 0 ? entry.reps : 1;
      for (const id of [...ex.muscles.primary, ...ex.muscles.secondary]) {
        const group = groupOf(id);
        if (!group || !wanted.has(group)) continue;
        values[group]![i] = (values[group]![i] ?? 0) + share;
      }
    }
  });

  // Fuera los grupos sin nada en el periodo: una línea plana en cero solo hace
  // ruido. Con días, se conservan vacíos; sin días, no hay nada que enseñar.
  for (const g of Object.keys(values)) {
    if (!values[g]!.some((v) => v !== null)) delete values[g];
  }

  return { labels, values };
}