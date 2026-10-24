// Mentor — registro de horas de estudio por área (y por día). Módulo PURO y compartido (API y renderer): las entradas llegan de
// `.notevault/mentor/timelog/<plan>.json`; aquí solo se limpian y se suman. Una entrada es un bloque de estudio ya hecho: lo guarda el
// Pomodoro al terminar (o al detenerlo) o la persona a mano.

export const TIMELOG_MAX_MINUTES = 720;

export interface TimeEntry {
  id: string;
  /** clave del área (la del alcance de «Ejecutar plan») */
  areaKey: string;
  /** día del bloque, `YYYY-MM-DD` */
  date: string;
  minutes: number;
  kind: "pomodoro" | "manual";
  note?: string;
  /** QUÉ tipo de trabajo fue (Teoría / Práctica / Proyecto / Repaso); sin él la entrada es «sin clasificar» (entradas antiguas) */
  work?: WorkKind;
  /** carpetas de los temas trabajados en el bloque (opcional) */
  topics?: string[];
  /** cuándo se guardó (ISO) */
  at: string;
}

/** Qué se hizo en un bloque de estudio. */
export const WORK_KINDS = ["theory", "practice", "project", "review"] as const;
export type WorkKind = (typeof WORK_KINDS)[number];
export const WORK_LABEL: Record<WorkKind, string> = { theory: "Teoría", practice: "Práctica", project: "Proyecto", review: "Repaso" };
export const isWorkKind = (v: unknown): v is WorkKind => typeof v === "string" && (WORK_KINDS as readonly string[]).includes(v);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Una entrada válida o `null` (descarta lo que no cumple: minutos fuera de 1–720, fecha rara, sin área). */
export function sanitizeEntry(raw: unknown): TimeEntry | null {
  const o = (raw && typeof raw === "object" ? raw : null) as Record<string, unknown> | null;
  if (!o) return null;
  const minutes = Math.round(Number(o.minutes));
  const date = String(o.date ?? "");
  const areaKey = String(o.areaKey ?? "").replace(/\s+/g, " ").trim().slice(0, 60);
  const id = String(o.id ?? "").slice(0, 60);
  if (!id || !areaKey || !DATE_RE.test(date) || !Number.isFinite(minutes) || minutes < 1 || minutes > TIMELOG_MAX_MINUTES) return null;
  const note = String(o.note ?? "").replace(/\s+/g, " ").trim().slice(0, 200);
  const topics = Array.isArray(o.topics) ? o.topics.map((t) => String(t ?? "").replace(/\s+/g, " ").trim().slice(0, 200)).filter(Boolean).slice(0, 12) : [];
  return { id, areaKey, date, minutes, kind: o.kind === "pomodoro" ? "pomodoro" : "manual", ...(note ? { note } : {}), ...(isWorkKind(o.work) ? { work: o.work } : {}), ...(topics.length ? { topics } : {}), at: String(o.at ?? "").slice(0, 40) };
}

/** Resumen de tiempo REAL registrado (nunca estimado): minutos por área y por tipo de trabajo en un rango de fechas. */
export interface TimeLogSummary {
  totalMinutes: number;
  sessions: number;
  byArea: Record<string, number>;
  byKind: Record<WorkKind | "unclassified", number>;
  /** ¿hay algún bloque registrado en el rango? */
  hasAny: boolean;
}

/** Suma los bloques registrados entre `from` y `to` (ambas incluidas; sin rango, todos), de un área o de todas. */
export function summarizeTimeLog(entries: ReadonlyArray<TimeEntry>, opts: { from?: string; to?: string; areaKey?: string } = {}): TimeLogSummary {
  const out: TimeLogSummary = { totalMinutes: 0, sessions: 0, byArea: {}, byKind: { theory: 0, practice: 0, project: 0, review: 0, unclassified: 0 }, hasAny: false };
  for (const e of entries) {
    if ((opts.from && e.date < opts.from) || (opts.to && e.date > opts.to) || (opts.areaKey && e.areaKey !== opts.areaKey)) continue;
    out.totalMinutes += e.minutes;
    out.sessions += 1;
    out.byArea[e.areaKey] = (out.byArea[e.areaKey] ?? 0) + e.minutes;
    out.byKind[e.work ?? "unclassified"] += e.minutes;
  }
  out.hasAny = out.sessions > 0;
  return out;
}

/** Minutos de un día, en total o de un área. */
export const minutesOn = (entries: ReadonlyArray<TimeEntry>, date: string, areaKey?: string): number =>
  entries.filter((e) => e.date === date && (!areaKey || e.areaKey === areaKey)).reduce((n, e) => n + e.minutes, 0);

/** Minutos de un área entre dos fechas (ambas incluidas). */
export const minutesBetween = (entries: ReadonlyArray<TimeEntry>, from: string, to: string, areaKey?: string): number =>
  entries.filter((e) => e.date >= from && e.date <= to && (!areaKey || e.areaKey === areaKey)).reduce((n, e) => n + e.minutes, 0);

/** «1 h 20 min», «45 min», «0 min». */
export function minutesText(min: number): string {
  const m = Math.max(0, Math.round(min));
  const h = Math.floor(m / 60);
  const r = m % 60;
  return h ? (r ? `${h} h ${r} min` : `${h} h`) : `${m} min`;
}

/** El día local de hoy (`YYYY-MM-DD`): NO el de UTC, que de noche en América ya es «mañana». */
export function localDay(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** La evaluación obligatoria al acabar un bloque de foco: qué se aprendió, qué duda queda y cómo de bien se entendió (1–5). */
export interface Assessment {
  id: string;
  areaKey: string;
  date: string;
  /** minutos del bloque evaluado */
  minutes: number;
  /** títulos de los temas asignados al bloque (vacío = sesión libre) */
  topics: string[];
  understanding: number;
  /** concentración durante el bloque (1–5); 0 en las evaluaciones antiguas */
  focus: number;
  /** cómo quedó cada tema, proyecto o tarea asignados al bloque */
  outcomes: Array<{ title: string; status: "done" | "partial" | "none" }>;
  /** ¿hubo ejercicios o un problema práctico en el bloque? */
  practiced: boolean;
  learned: string;
  doubt: string;
  /** errores o problemas concretos que se tuvieron (opcional): es lo que más sirve para repensar el plan */
  errors: string;
  /** tipo de trabajo del bloque (opcional; las evaluaciones antiguas no lo tienen) */
  work?: WorkKind;
  at: string;
}

const oneLine = (v: unknown, max: number): string => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

/** Una evaluación válida o `null`: necesita área, día, las dos respuestas y una comprensión de 1 a 5. */
export function sanitizeAssessment(raw: unknown): Assessment | null {
  const o = (raw && typeof raw === "object" ? raw : null) as Record<string, unknown> | null;
  if (!o) return null;
  const id = oneLine(o.id, 60);
  const areaKey = oneLine(o.areaKey, 60);
  const date = String(o.date ?? "");
  const understanding = Math.round(Number(o.understanding));
  const learned = oneLine(o.learned, 600);
  const doubt = oneLine(o.doubt, 600);
  const minutes = Math.max(0, Math.min(TIMELOG_MAX_MINUTES, Math.round(Number(o.minutes) || 0)));
  if (!id || !areaKey || !DATE_RE.test(date) || !learned || !doubt || !(understanding >= 1 && understanding <= 5)) return null;
  const topics = Array.isArray(o.topics) ? o.topics.map((t) => oneLine(t, 200)).filter(Boolean).slice(0, 12) : [];
  const focus = Math.round(Number(o.focus));
  const outcomes = (Array.isArray(o.outcomes) ? o.outcomes : [])
    .map((x) => {
      const r = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
      const status = r.status === "done" || r.status === "none" ? r.status : "partial";
      return { title: oneLine(r.title, 200), status } as Assessment["outcomes"][number];
    })
    .filter((x) => x.title)
    .slice(0, 12);
  return { id, areaKey, date, minutes, topics, understanding, focus: focus >= 1 && focus <= 5 ? focus : 0, outcomes, practiced: o.practiced === true, learned, doubt, errors: oneLine(o.errors, 600), ...(isWorkKind(o.work) ? { work: o.work } : {}), at: oneLine(o.at, 40) };
}

