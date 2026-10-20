// Etiqueta de tiempo de cada tema del plan: cuándo toca trabajarlo (primer y último día de su reparto) y en qué estado está frente a esa fecha.
//
//  · «Programado»: aún no le toca (o la ruta no ha empezado: sin trabajo hecho nada está pendiente, solo programado).
//  · «En su tiempo»: hoy cae dentro de su ventana de trabajo.
//  · «Pendiente»: su ventana ya pasó y sigue sin completarse. Es automático: la app lo detecta con la fecha, nadie lo marca.
//  · «Hecho»: completado.
//
// Módulo PURO y compartido: sin node:* ni DOM.

import { dateLabel } from "./planSchedule.js";

export interface TopicTime {
  first: string;
  last: string;
}

export type TimeStatus = "done" | "scheduled" | "current" | "pending";

export interface TopicTimeTag {
  status: TimeStatus;
  /** «20 oct» o «20 – 22 oct» */
  label: string;
  /** texto corto del estado, para la etiqueta */
  text: string;
}

/** Los días de reparto de cada tema todavía por hacer (primer y último día). Los completados no entran: su día es el de la finalización. */
export function topicTimes(days: ReadonlyArray<{ date: string; topics: ReadonlyArray<{ folder: string; done: boolean }> }>): Map<string, TopicTime> {
  const out = new Map<string, TopicTime>();
  for (const d of days) {
    for (const t of d.topics) {
      if (t.done) continue;
      const cur = out.get(t.folder);
      if (!cur) out.set(t.folder, { first: d.date, last: d.date });
      else {
        if (d.date < cur.first) cur.first = d.date;
        if (d.date > cur.last) cur.last = d.date;
      }
    }
  }
  return out;
}

/** ¿Ha empezado la ruta? Sí en cuanto hay algún tema tocado (en curso o completo). Antes de eso nada puede estar pendiente. */
export function routeStarted(states: Iterable<string>, anyCompletedAt = false): boolean {
  if (anyCompletedAt) return true;
  for (const s of states) if (s && s !== "sin_tratar") return true;
  return false;
}

const rangeLabel = (t: TopicTime): string => (t.first === t.last ? dateLabel(t.first) : `${dateLabel(t.first)} – ${dateLabel(t.last)}`);

/** La etiqueta de un tema: su ventana de tiempo y su estado frente a hoy. `undefined` si el tema no está repartido en el plan. */
export function timeTagOf(time: TopicTime | undefined, done: boolean, today: string, started: boolean): TopicTimeTag | undefined {
  if (done) return { status: "done", label: "", text: "Hecho" };
  if (!time) return undefined;
  const label = rangeLabel(time);
  if (!started || today < time.first) return { status: "scheduled", label, text: "Programado" };
  if (today <= time.last) return { status: "current", label, text: "En su tiempo" };
  return { status: "pending", label, text: "Pendiente" };
}
