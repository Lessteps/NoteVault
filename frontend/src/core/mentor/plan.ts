/**
 * Plan del Mentor sobre un PERIODO LIBRE `[start, end]` (1 semana, 2 meses, fechas a medida…): subplanes por
 * área/objetivo con temas elegidos, reparto semanal según la capacidad real y registro de temas completados.
 *
 * Datos en `.notevault/mentor/plans/<id>.json` (opcional y aditivo, ver docs/VAULT_FORMAT.md). Los planes
 * mensuales antiguos (`<YYYY-MM>.json`, con `month`) se leen como un plan de periodo (día 1 – último día).
 * La IA solo propone (ver `planDraft.ts` / `planSpec.ts`); aquí todo es determinista:
 *  - `distributeTopics` / `buildPlan`: reparto semana a semana según la capacidad (horas por semana, o
 *    tiempo diario × días de estudio × ritmo).
 *  - `topicState` / `deriveView`: el estado de práctica y el % se DERIVAN en vivo del motor de
 *    práctica; en el archivo solo se guarda lo que no se puede derivar (`completedAt`, entregable).
 *  - `refreshPlanProgress`: anota la fecha la primera vez que se observa un tema completo (nunca la pisa).
 *  - `planItemsFor`: de dónde sale el plan diario: lo que los planes activos dicen que toca esta semana.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import {
  addDays,
  daysBetween,
  dayMinutes,
  eachDay,
  isDate,
  MAX_PERIOD_DAYS,
  monthBounds,
  sanitizePreconditions,
  weekIndex,
  weekRangesOf,
  type PlanPace,
  type PlanPreconditions,
} from "../../lib/planTime.js";
import { sanitizePracticeTrack, type PracticeTrack } from "../../lib/practiceTrack.js";
import * as store from "../store.js";
import { formatLayout, isSyncConflict, LAYOUT } from "../vaultFormat.js";
import type { TopicProgressSnap } from "./topics.js";

// ── Tipos ────────────────────────────────────────────────────────────────

export const DELIVERABLE_STATUSES = ["idea", "en_curso", "hecho"] as const;
export type DeliverableStatus = (typeof DELIVERABLE_STATUSES)[number];

export interface PlannedTopic {
  /** carpeta del tema (id estable, POSIX relativa a la vault) */
  folder: string;
  title: string;
  skills?: string[];
  /** semana del plan (1..) en que toca terminarlo */
  targetWeek: number;
  estMinutes: number;
  /** AAAA-MM-DD: la primera vez que se observó el tema completo (registro de temas completados) */
  completedAt?: string;
  /** primer tema de una materia de nivel «no sé»: empieza con un diagnóstico corto para calibrar */
  diagnostic?: boolean;
}

export interface WeekSlice {
  week: number;
  start: string;
  end: string;
  /** carpetas de los temas de esta semana, en orden */
  topics: string[];
  minutes: number;
  /** minutos disponibles esa semana para este subplan */
  capacityMinutes: number;
}

export interface RequiredGoal {
  goalId: string;
  itemId?: string;
  note: string;
}

export interface Deliverable {
  title: string;
  description: string;
  criteria: string[];
  /** proyecto existente enlazado */
  projectId?: string;
  status: DeliverableStatus;
}

export interface Subplan {
  id: string;
  /** materia o área de vida */
  area: string;
  /** meta enlazada (texto) o texto libre */
  objective: string;
  goalId?: string;
  goalItemIds?: string[];
  topics: PlannedTopic[];
  weeks: WeekSlice[];
  requiredGoals: RequiredGoal[];
  deliverable?: Deliverable;
  notes?: string;
}

/**
 * Pregunta pendiente de decidir al armar el plan (aditivo, sin subir FORMAT_VERSION). Hoy solo `deliverables`: «¿Quieres un
 * entregable para <subplan>?» cuando las precondiciones dicen «a discutir». Es el punto de extensión de la construcción
 * progresiva con preguntas: cada pregunta se responde con `mentor_plan_draft_answer` (hoy: Sí / No / Después).
 */
export interface OpenQuestion {
  id: string;
  /** subplan al que se refiere */
  subplanId?: string;
  text: string;
  options: string[];
}
export const DELIVERABLE_QUESTION_ID = "deliverables";
export const DELIVERABLE_QUESTION_OPTIONS = ["Sí", "No", "Después"] as const;

export function deliverableQuestion(sub: Pick<Subplan, "id" | "area" | "objective">): OpenQuestion {
  return { id: DELIVERABLE_QUESTION_ID, subplanId: sub.id, text: `¿Quieres un entregable (proyecto de demostración) para ${subplanLabel(sub)}?`, options: [...DELIVERABLE_QUESTION_OPTIONS] };
}

/** Preguntas válidas: de un subplan que existe y que aún no tiene entregable (si ya lo tiene, la pregunta está respondida). */
export function sanitizeOpenQuestions(raw: unknown, subplans: readonly Subplan[]): OpenQuestion[] {
  const out: OpenQuestion[] = [];
  const seen = new Set<string>();
  for (const q of Array.isArray(raw) ? raw : []) {
    const id = oneLine(q?.id, 40);
    const sub = subplans.find((s) => s.id === String(q?.subplanId ?? ""));
    if (!id || (q?.subplanId !== undefined && !sub)) continue;
    if (id === DELIVERABLE_QUESTION_ID && (!sub || sub.deliverable)) continue;
    const key = `${id}:${sub?.id ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const options = (Array.isArray(q?.options) ? q.options : []).map((o: unknown) => oneLine(o, 40)).filter(Boolean).slice(0, 6);
    out.push({ id, ...(sub ? { subplanId: sub.id } : {}), text: oneLine(q?.text, 300) || (sub ? deliverableQuestion(sub).text : id), options: options.length ? options : [...DELIVERABLE_QUESTION_OPTIONS] });
  }
  return out;
}

export interface Plan {
  /** nombre del archivo sin `.json`: `<AAAA-MM>` (plan mensual heredado) o `<inicio>_<fin>` */
  id: string;
  /** primer y último día del plan (AAAA-MM-DD, ambos incluidos) */
  start: string;
  end: string;
  /** AAAA-MM: solo en los planes mensuales heredados (id = mes) */
  month?: string;
  createdAt: string;
  updatedAt: string;
  /** horas efectivas por semana (media del periodo) */
  hoursPerWeek?: number;
  /** las precondiciones con las que se armó (tiempo diario, días de estudio…) */
  preconditions?: PlanPreconditions;
  /** nombre editable; si falta se autogenera (`planName`) */
  name?: string;
  /** terminado/archivado a mano: deja de estar activo aunque su periodo no haya acabado */
  archived?: boolean;
  /** generado sin IA (plan automático determinista) */
  auto?: boolean;
  rationale?: string;
  /** pista «Programming practice»: kata diario + proyecto semanal full stack (+ mensual); ver `lib/practiceTrack.ts` */
  programmingPractice?: PracticeTrack;
  /** decisiones que quedaron pendientes al armar el plan (p. ej. entregables «a discutir») */
  openQuestions?: OpenQuestion[];
  subplans: Subplan[];
}
/** Nombre histórico: un plan mensual es un plan de periodo. */
export type MonthlyPlan = Plan;

export type TopicState = "sin_tratar" | "practicando" | "consolidado" | "completo" | "examen_pendiente" | "no_encontrado";

/** Lo mínimo de un tema de la vault para derivar su estado (cumple `TopicSnap`). */
export interface TopicLite {
  progress: TopicProgressSnap;
  attemptCount: number;
  lastAttemptAt?: string | null;
}
export type TopicLiteLookup = (folder: string) => TopicLite | null | undefined;

// ── Fechas y semanas ─────────────────────────────────────────────────────

export const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
export const PLAN_ID_RE = /^[A-Za-z0-9_-]{1,40}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const two = (n: number): string => String(n).padStart(2, "0");

export const monthOf = (isoDate: string): string => isoDate.slice(0, 7);

export function daysInMonth(month: string): number {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y!, m!, 0)).getUTCDate();
}

export function addMonths(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y!, m! - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${two(d.getUTCMonth() + 1)}`;
}

/** Semanas del mes: trozos de 7 días desde el día 1 (la última puede ser más corta). */
export function weekRanges(month: string): Array<{ week: number; start: string; end: string; days: number }> {
  const b = monthBounds(month);
  return weekRangesOf(b.start, b.end);
}

/** Semana (1..) a la que pertenece `date`: de un mes (AAAA-MM) o de un periodo `{start,end}`; 0 si es anterior, última+1 si posterior. */
export function weekOf(date: string, period: string | { start: string; end: string }): number {
  const p = typeof period === "string" ? monthBounds(period) : period;
  return weekIndex(date, p.start, p.end);
}

export type PlanStatus = "activo" | "futuro" | "terminado";
export function planStatus(plan: Pick<Plan, "start" | "end" | "archived">, today: string): PlanStatus {
  if (plan.archived) return "terminado";
  return today < plan.start ? "futuro" : today > plan.end ? "terminado" : "activo";
}

const MONTHS_ES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const dmShort = (iso: string): string => `${Number(iso.slice(8))} ${MONTHS_ES[Number(iso.slice(5, 7)) - 1]}`;

/** Nombre autogenerado: «Backend · 6 oct–6 nov» (el objetivo del primer subplan, o su área, y el periodo). */
export function defaultPlanName(subplans: ReadonlyArray<Pick<Subplan, "area" | "objective">>, start: string, end: string): string {
  const first = subplans[0];
  const topic = first ? (first.objective.trim() || first.area).slice(0, 40) : "Plan";
  const extra = subplans.length > 1 ? ` +${subplans.length - 1}` : "";
  return `${topic}${extra} · ${dmShort(start)}–${dmShort(end)}`;
}
/** El nombre del plan: el editado o el autogenerado. */
export const planName = (p: Pick<Plan, "name" | "subplans" | "start" | "end" | "month">): string => {
  if (p.name?.trim()) return p.name.trim();
  if (p.month) {
    const [y, m] = p.month.split("-").map(Number);
    const t = new Date(y!, m! - 1, 1).toLocaleDateString("es", { month: "long", year: "numeric" });
    return `Plan de ${t}`;
  }
  return defaultPlanName(p.subplans, p.start, p.end);
};

// ── Estado derivado de un tema ───────────────────────────────────────────

/** Estado de práctica de un tema (derivado en vivo; nunca se guarda). */
export function topicState(t: TopicLite | null | undefined): TopicState {
  if (!t) return "no_encontrado";
  const p = t.progress;
  const pct = p.completenessPct;
  const skills = Object.values(p.skills);
  const allMastered = skills.length > 0 && skills.every((s) => s.mastered);
  const examMissing = p.topic.mastery.exam === "required" && !p.examPassed;
  if (t.attemptCount === 0 && pct <= 0) return "sin_tratar";
  if ((pct >= 100 || allMastered) && examMissing) return "examen_pendiente";
  if (pct >= 100) return "completo";
  if (pct >= 70) return "consolidado";
  return "practicando";
}

export const TOPIC_STATE_LABEL: Record<TopicState, string> = {
  sin_tratar: "Sin tratar",
  practicando: "Practicando",
  consolidado: "Consolidado",
  completo: "Completo",
  examen_pendiente: "Examen pendiente",
  no_encontrado: "No encontrado",
};

// ── Reparto semanal ──────────────────────────────────────────────────────

export interface Capacity {
  /** horas por semana (cada día vale lo mismo) */
  hoursPerWeek?: number;
  /** o bien: tiempo diario × días de estudio × ritmo, menos fechas bloqueadas */
  minutesPerDay?: number;
  studyDays?: number[];
  blockedDates?: string[];
  pace?: PlanPace;
  /** minutos de cada día reservados a otra cosa (la práctica): se restan de lo que da el día antes de repartir temas */
  reservedMinutes?: (date: string) => number;
}

export interface DistributeInput extends Capacity {
  /** AAAA-MM: el periodo es ese mes (plan mensual heredado) */
  month?: string;
  /** o un periodo libre */
  start?: string;
  end?: string;
  topics: ReadonlyArray<{ folder: string; title: string; skills?: string[]; estMinutes: number }>;
  /** primer día disponible (AAAA-MM-DD); por defecto, el inicio del periodo */
  from?: string;
  /** si todo cabe, reparte los temas a partes iguales por las semanas aprovechables (en vez de llenar las primeras) */
  spread?: boolean;
}

export interface Distribution {
  topics: PlannedTopic[];
  weeks: WeekSlice[];
  totalMinutes: number;
  availableMinutes: number;
  fits: boolean;
  requiredHoursPerWeek: number | null;
  warnings: string[];
}

const r1 = (n: number): number => Math.round(n * 10) / 10;

function periodOf(i: { month?: string; start?: string; end?: string }): { start: string; end: string } {
  if (i.start !== undefined || i.end !== undefined) {
    if (!isDate(i.start) || !isDate(i.end) || i.end < i.start) throw new Error("Periodo inválido (inicio y fin AAAA-MM-DD).");
    if (daysBetween(i.start, i.end) + 1 > MAX_PERIOD_DAYS) throw new Error(`El periodo no puede pasar de ${MAX_PERIOD_DAYS} días.`);
    return { start: i.start, end: i.end };
  }
  if (!i.month || !MONTH_RE.test(i.month)) throw new Error("Mes inválido (AAAA-MM).");
  return monthBounds(i.month);
}

/** Minutos que da cada día según la capacidad; lanza si no hay capacidad positiva. */
function dayMinutesOf(c: Capacity): (date: string) => number {
  if (c.minutesPerDay !== undefined) {
    if (!(c.minutesPerDay > 0)) throw new Error("El tiempo diario debe ser mayor que 0.");
    const base = dayMinutes({ minutesPerDay: c.minutesPerDay, studyDays: c.studyDays ?? [1, 2, 3, 4, 5, 6, 7], blockedDates: c.blockedDates, pace: c.pace ?? "intenso" });
    const reserved = c.reservedMinutes;
    return reserved ? (date) => (base(date) > 0 ? Math.max(0, base(date) - reserved(date)) : 0) : base;
  }
  if (!(Number(c.hoursPerWeek) > 0)) throw new Error("Las horas por semana deben ser mayores que 0.");
  const perDay = (Number(c.hoursPerWeek) * 60) / 7;
  return () => perDay;
}

/**
 * Reparte los temas EN ORDEN por las semanas del periodo. Cada semana tiene la capacidad de sus días
 * aprovechables (desde `from`; solo días de estudio no bloqueados). Un tema entra en la semana actual si
 * cabe al menos la mitad de sus minutos (o la semana está vacía); si no se avanza. Lo que sobrepasa el
 * periodo se queda en la última semana y se avisa de cuántas horas por semana harían falta.
 */
export function distributeTopics(input: DistributeInput): Distribution {
  const period = periodOf(input);
  const dm = dayMinutesOf(input);
  const ranges = weekRangesOf(period.start, period.end);
  const from = input.from && DATE_RE.test(input.from) && input.from > period.start ? (input.from > period.end ? addDays(period.end, 1) : input.from) : period.start;
  const weeks: WeekSlice[] = ranges.map((r) => {
    const days = eachDay(from > r.start ? from : r.start, r.end);
    return { week: r.week, start: r.start, end: r.end, topics: [], minutes: 0, capacityMinutes: Math.round(days.reduce((n, d) => n + dm(d), 0)) };
  });
  const usable = weeks.filter((w) => w.capacityMinutes > 0);
  const availableMinutes = usable.reduce((n, w) => n + w.capacityMinutes, 0);
  const topics = input.topics.filter((t) => t.estMinutes > 0);

  const totalNeed = topics.reduce((n, t) => n + t.estMinutes, 0);
  // con holgura, cada semana aprovechable se llena solo hasta lo que le toca de forma pareja
  const target = input.spread && usable.length > 1 && totalNeed <= availableMinutes ? Math.ceil(totalNeed / usable.length) : Infinity;
  const budget = (w: WeekSlice): number => Math.min(w.capacityMinutes, target);
  let idx = Math.max(0, weeks.findIndex((w) => w.capacityMinutes > 0));
  let remaining = budget(weeks[idx]!);
  const planned: PlannedTopic[] = [];
  for (const t of topics) {
    while (idx < weeks.length - 1 && weeks[idx]!.topics.length > 0 && remaining < t.estMinutes * 0.5) {
      idx++;
      remaining = budget(weeks[idx]!);
    }
    const w = weeks[idx]!;
    w.topics.push(t.folder);
    w.minutes += t.estMinutes;
    remaining -= t.estMinutes;
    planned.push({ folder: t.folder, title: t.title, ...(t.skills?.length ? { skills: t.skills } : {}), targetWeek: w.week, estMinutes: t.estMinutes });
  }

  const totalMinutes = topics.reduce((n, t) => n + t.estMinutes, 0);
  const fits = totalMinutes <= availableMinutes;
  const fromDays = Math.max(0, daysBetween(from, period.end) + 1);
  const nominal = input.minutesPerDay === undefined ? Number(input.hoursPerWeek) : fromDays > 0 ? availableMinutes / 60 / (fromDays / 7) : 0;
  const requiredHoursPerWeek = availableMinutes > 0 ? r1((totalMinutes / availableMinutes) * nominal) : null;
  const warnings: string[] = [];
  if (!topics.length) warnings.push("No hay temas que repartir.");
  else if (!fits) {
    warnings.push(
      `No cabe en el periodo: harían falta unas ${requiredHoursPerWeek ?? "?"} h/semana (tienes ${r1(nominal)}) o quitar temas. Lo que sobra queda en la última semana.`,
    );
  }
  return { topics: planned, weeks, totalMinutes, availableMinutes, fits, requiredHoursPerWeek, warnings };
}

// ── Subplanes y plan completo ────────────────────────────────────────────

export interface SubplanSeed {
  id?: string;
  area: string;
  objective: string;
  goalId?: string;
  goalItemIds?: string[];
  topics: Array<{ folder: string; title: string; skills?: string[]; estMinutes: number; diagnostic?: boolean }>;
  requiredGoals?: RequiredGoal[];
  deliverable?: Partial<Deliverable> & { title: string };
  notes?: string;
}

const fold = (s: string): string => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const oneLine = (v: unknown, max: number): string => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

export function subplanKey(s: Pick<Subplan, "area" | "objective">): string {
  return `${fold(s.area)}|${fold(s.objective)}`;
}

function slugOf(s: string): string {
  return fold(s).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24) || "x";
}

function cleanDeliverable(d: SubplanSeed["deliverable"]): Deliverable | undefined {
  if (!d) return undefined;
  const title = oneLine(d.title, 140);
  if (!title) return undefined;
  const status = (DELIVERABLE_STATUSES as readonly string[]).includes(String(d.status)) ? (d.status as DeliverableStatus) : "idea";
  const criteria = (Array.isArray(d.criteria) ? d.criteria : []).map((c) => oneLine(c, 200)).filter(Boolean).slice(0, 8);
  return {
    title,
    description: oneLine(d.description, 600),
    criteria,
    ...(d.projectId ? { projectId: String(d.projectId) } : {}),
    status,
  };
}

export interface BuiltPlan {
  plan: Plan;
  warnings: string[];
  fits: boolean;
  totalMinutes: number;
  availableMinutes: number;
  requiredHoursPerWeek: number | null;
}

export interface BuildOpts extends Capacity {
  /** AAAA-MM (plan mensual heredado: id = mes) o un periodo libre `start`/`end` */
  month?: string;
  start?: string;
  end?: string;
  id?: string;
  name?: string;
  from?: string;
  now?: string;
  createdAt?: string;
  preconditions?: PlanPreconditions;
  auto?: boolean;
  rationale?: string;
  programmingPractice?: PracticeTrack;
  openQuestions?: OpenQuestion[];
}

/**
 * Plan desde las semillas de los subplanes. La capacidad (horas por semana, o tiempo diario) se reparte
 * entre los subplanes en proporción a sus minutos; el plan "cabe" si la suma de minutos cabe en el periodo.
 */
export function buildPlan(seeds: readonly SubplanSeed[], opts: BuildOpts): BuiltPlan {
  const now = opts.now ?? new Date().toISOString();
  const period = periodOf(opts);
  const total = seeds.reduce((n, s) => n + s.topics.reduce((m, t) => m + t.estMinutes, 0), 0);
  const warnings: string[] = [];
  const used = new Set<string>();
  const subplans: Subplan[] = [];
  let totalMinutes = 0;
  let availableMinutes = 0;
  const perDayMode = opts.minutesPerDay !== undefined;
  seeds.forEach((seed, i) => {
    const minutes = seed.topics.reduce((n, t) => n + t.estMinutes, 0);
    const share = total > 0 ? minutes / total : 1 / Math.max(1, seeds.length);
    // un subplan sin temas (solo entregable) no consume horas: se le da un mínimo simbólico para poder calcular
    const cap: Capacity = perDayMode
      ? {
          minutesPerDay: Math.max(0.5, opts.minutesPerDay! * share),
          studyDays: opts.studyDays,
          blockedDates: opts.blockedDates,
          pace: opts.pace,
          ...(opts.reservedMinutes ? { reservedMinutes: (d: string) => opts.reservedMinutes!(d) * share } : {}),
        }
      : { hoursPerWeek: Math.max(0.1, Number(opts.hoursPerWeek) * share) };
    const dist = distributeTopics({ ...cap, start: period.start, end: period.end, topics: seed.topics, from: opts.from, spread: perDayMode });
    totalMinutes += dist.totalMinutes;
    availableMinutes += total > 0 ? dist.availableMinutes : 0;
    let id = seed.id && /^[A-Za-z0-9_-]{1,40}$/.test(seed.id) ? seed.id : `s${i + 1}-${slugOf(seed.area)}`;
    while (used.has(id)) id += "x";
    used.add(id);
    const deliverable = cleanDeliverable(seed.deliverable);
    const diag = new Set(seed.topics.filter((t) => t.diagnostic).map((t) => t.folder));
    subplans.push({
      id,
      area: oneLine(seed.area, 80) || "General",
      objective: oneLine(seed.objective, 200),
      ...(seed.goalId ? { goalId: seed.goalId } : {}),
      ...(seed.goalItemIds?.length ? { goalItemIds: seed.goalItemIds } : {}),
      topics: dist.topics.map((t) => (diag.has(t.folder) ? { ...t, diagnostic: true } : t)),
      weeks: dist.weeks,
      requiredGoals: (seed.requiredGoals ?? []).map((g) => ({ goalId: g.goalId, ...(g.itemId ? { itemId: g.itemId } : {}), note: oneLine(g.note, 200) })),
      ...(deliverable ? { deliverable } : {}),
      ...(seed.notes ? { notes: oneLine(seed.notes, 400) } : {}),
    });
  });
  const fits = totalMinutes <= availableMinutes || total === 0;
  // horas por semana efectivas del periodo entero (media) y lo que haría falta si no cabe
  const dm = dayMinutesOf(perDayMode ? opts : { hoursPerWeek: opts.hoursPerWeek });
  const periodMinutes = eachDay(period.start, period.end).reduce((n, d) => n + dm(d), 0);
  const weeksCount = (daysBetween(period.start, period.end) + 1) / 7;
  const hoursPerWeek = r1(periodMinutes / 60 / weeksCount);
  const requiredHoursPerWeek = availableMinutes > 0 ? r1((totalMinutes / availableMinutes) * hoursPerWeek) : null;
  if (!fits) {
    warnings.push(
      `No cabe en el periodo: harían falta unas ${requiredHoursPerWeek ?? "?"} h/semana (tienes ${hoursPerWeek}) o quitar temas. Lo que sobra queda en la última semana de cada subplan.`,
    );
  } else if (total > 0 && totalMinutes < availableMinutes * 0.4) {
    warnings.push(`Te sobra tiempo: a ${hoursPerWeek} h/semana solo usas ${Math.round((totalMinutes / availableMinutes) * 100)}% del periodo.`);
  }
  if (!subplans.length) warnings.push("El plan no tiene subplanes.");
  const legacyMonth = opts.start === undefined && opts.month && MONTH_RE.test(opts.month) ? opts.month : undefined;
  return {
    plan: {
      id: opts.id && PLAN_ID_RE.test(opts.id) ? opts.id : legacyMonth ?? `${period.start}_${period.end}`,
      name: oneLine(opts.name, 80) || defaultPlanName(subplans, period.start, period.end),
      start: period.start,
      end: period.end,
      ...(legacyMonth ? { month: legacyMonth } : {}),
      createdAt: opts.createdAt ?? now,
      updatedAt: now,
      hoursPerWeek,
      ...(opts.preconditions ? { preconditions: opts.preconditions } : {}),
      ...(opts.auto ? { auto: true } : {}),
      ...(opts.rationale ? { rationale: oneLine(opts.rationale, 600) } : {}),
      ...(opts.programmingPractice ? { programmingPractice: opts.programmingPractice } : {}),
      subplans,
      ...(sanitizeOpenQuestions(opts.openQuestions, subplans).length ? { openQuestions: sanitizeOpenQuestions(opts.openQuestions, subplans) } : {}),
    },
    warnings,
    fits,
    totalMinutes,
    availableMinutes,
    requiredHoursPerWeek,
  };
}

/**
 * Fusiona lo aceptado en un plan del mismo periodo. Un subplan con el mismo área+objetivo SUSTITUYE al anterior
 * conservando lo que no se puede recalcular (`completedAt` por tema, estado/proyecto del entregable);
 * los demás subplanes se mantienen.
 */
export function mergePlans(existing: Plan | null, incoming: Plan, now: string = new Date().toISOString()): Plan {
  if (!existing) return incoming;
  const byKey = new Map(existing.subplans.map((s) => [subplanKey(s), s]));
  const taken = new Set<string>();
  const merged: Subplan[] = [];
  const ids = new Set<string>();
  const remap = new Map<string, string>();
  for (const s of incoming.subplans) {
    const old = byKey.get(subplanKey(s));
    if (old) taken.add(subplanKey(old));
    const done = new Map((old?.topics ?? []).filter((t) => t.completedAt).map((t) => [t.folder, t.completedAt!]));
    let id = old?.id ?? s.id;
    while (ids.has(id)) id += "x";
    ids.add(id);
    remap.set(s.id, id);
    merged.push({
      ...s,
      id,
      topics: s.topics.map((t) => (done.has(t.folder) ? { ...t, completedAt: done.get(t.folder)! } : t)),
      ...(s.deliverable
        ? { deliverable: { ...s.deliverable, status: old?.deliverable?.status ?? s.deliverable.status, ...((old?.deliverable?.projectId ?? s.deliverable.projectId) ? { projectId: old?.deliverable?.projectId ?? s.deliverable.projectId } : {}) } }
        : {}),
    });
  }
  for (const s of existing.subplans) {
    if (taken.has(subplanKey(s))) continue;
    let id = s.id;
    while (ids.has(id)) id += "x";
    ids.add(id);
    merged.push({ ...s, id });
  }
  const { auto: _auto, openQuestions: _oq, programmingPractice: _pp, ...rest } = existing;
  const practice = incoming.programmingPractice ?? existing.programmingPractice;
  const questions = sanitizeOpenQuestions(
    [...(incoming.openQuestions ?? []).map((q) => ({ ...q, subplanId: remap.get(String(q.subplanId)) ?? q.subplanId })), ...(existing.openQuestions ?? [])],
    merged,
  );
  return {
    ...rest,
    ...(practice ? { programmingPractice: practice } : {}),
    ...(questions.length ? { openQuestions: questions } : {}),
    hoursPerWeek: incoming.hoursPerWeek ?? existing.hoursPerWeek,
    ...((incoming.preconditions ?? existing.preconditions) ? { preconditions: incoming.preconditions ?? existing.preconditions } : {}),
    ...(incoming.auto ? { auto: true } : {}),
    updatedAt: now,
    subplans: merged,
  };
}

// ── Estado en vivo y registro de temas completados ───────────────────────

export interface TopicView extends PlannedTopic {
  state: TopicState;
  /** 0..100 */
  pct: number;
  found: boolean;
}

export interface SubplanView {
  id: string;
  topics: TopicView[];
  total: number;
  done: number;
  /** % medio de los temas, 0..100 */
  pct: number;
  /** semana (1..) del plan a la que apunta `today`, acotada al rango del plan */
  currentWeek: number;
}

export interface PlanSummary {
  subplans: number;
  topics: number;
  done: number;
  pct: number;
  currentWeek: number;
  weeks: number;
}

export interface PlanDerived {
  subplans: SubplanView[];
  summary: PlanSummary;
}

export function deriveView(plan: Plan, lookup: TopicLiteLookup, today: string): PlanDerived {
  const weeks = weekRangesOf(plan.start, plan.end).length;
  const cur = Math.min(weeks, Math.max(1, weekIndex(today, plan.start, plan.end) || 1));
  const subplans: SubplanView[] = plan.subplans.map((s) => {
    const topics: TopicView[] = s.topics.map((t) => {
      const snap = lookup(t.folder) ?? null;
      const state = topicState(snap);
      const pct = snap ? Math.max(0, Math.min(100, Math.round(snap.progress.completenessPct))) : 0;
      return { ...t, state, pct: state === "completo" ? 100 : pct, found: !!snap };
    });
    const done = topics.filter((t) => t.state === "completo" || !!t.completedAt).length;
    const pct = topics.length ? Math.round(topics.reduce((n, t) => n + (t.completedAt && t.state !== "completo" ? Math.max(t.pct, 100) : t.pct), 0) / topics.length) : 0;
    return { id: s.id, topics, total: topics.length, done, pct, currentWeek: cur };
  });
  const total = subplans.reduce((n, s) => n + s.total, 0);
  const done = subplans.reduce((n, s) => n + s.done, 0);
  const pct = total ? Math.round(subplans.reduce((n, s) => n + s.pct * s.total, 0) / total) : 0;
  return { subplans, summary: { subplans: subplans.length, topics: total, done, pct, currentWeek: cur, weeks } };
}

/**
 * Registro de temas completados: anota `completedAt` (fecha local) la PRIMERA vez que un tema del plan
 * se observa completo. No pisa fechas ya registradas ni las borra si luego baja el avance.
 */
export function refreshPlanProgress(
  plan: Plan,
  lookup: TopicLiteLookup,
  todayIso: string,
): { plan: Plan; changed: boolean; completed: string[] } {
  let changed = false;
  const completed: string[] = [];
  const subplans = plan.subplans.map((s) => ({
    ...s,
    topics: s.topics.map((t) => {
      if (t.completedAt) return t;
      if (topicState(lookup(t.folder) ?? null) !== "completo") return t;
      changed = true;
      completed.push(t.folder);
      return { ...t, completedAt: todayIso };
    }),
  }));
  return { plan: changed ? { ...plan, updatedAt: new Date().toISOString(), subplans } : plan, changed, completed };
}

// ── Del plan al plan diario ──────────────────────────────────────────────

export interface PlanItem {
  kind: "topic" | "deliverable";
  /** id del plan del que viene (varios planes pueden estar activos a la vez) */
  planId: string;
  subplanId: string;
  /** texto corto del subplan, para el chip "Plan: …" */
  label: string;
  area: string;
  title: string;
  folder?: string;
  skills?: string[];
  estMinutes: number;
  targetWeek: number;
  /** la semana objetivo ya pasó */
  overdue: boolean;
}

export const DELIVERABLE_MINUTES = 45;

export function subplanLabel(s: Pick<Subplan, "area" | "objective">): string {
  const o = s.objective.trim();
  const base = o && fold(o) !== fold(s.area) ? `${s.area}: ${o}` : s.area;
  return base.length > 48 ? `${base.slice(0, 47).trim()}…` : base;
}

/**
 * Lo que los planes activos dicen que toca el día `date`: los temas aún sin completar cuya semana objetivo
 * es esta semana o una anterior (atrasados primero), y el entregable en la última semana (o cuando ya no
 * quedan temas) si no está hecho. Con planes solapados se combinan sin repetir un mismo tema.
 * `isDone` permite descartar temas ya completos en vivo.
 */
export function planItemsFor(date: string, plans: readonly Plan[], isDone?: (folder: string) => boolean): PlanItem[] {
  const out: PlanItem[] = [];
  const seenTopics = new Set<string>();
  const ordered = [...plans].sort((a, b) => a.start.localeCompare(b.start) || a.createdAt.localeCompare(b.createdAt));
  for (const plan of ordered) {
    if (plan.archived || date < plan.start || date > plan.end) continue;
    const weeks = weekRangesOf(plan.start, plan.end).length;
    const cur = weekIndex(date, plan.start, plan.end);
    if (cur < 1) continue;
    for (const s of plan.subplans) {
      const label = subplanLabel(s);
      let pending = 0;
      for (const t of s.topics) {
        if (t.completedAt || isDone?.(t.folder)) continue;
        pending++;
        if (t.targetWeek > cur) continue;
        if (seenTopics.has(t.folder)) continue;
        seenTopics.add(t.folder);
        out.push({
          kind: "topic",
          planId: plan.id,
          subplanId: s.id,
          label,
          area: s.area,
          title: t.title,
          folder: t.folder,
          ...(t.skills?.length ? { skills: t.skills } : {}),
          estMinutes: t.estMinutes,
          targetWeek: t.targetWeek,
          overdue: t.targetWeek < cur,
        });
      }
      const d = s.deliverable;
      if (d && d.status !== "hecho" && (cur >= weeks || (pending === 0 && s.topics.length > 0))) {
        out.push({ kind: "deliverable", planId: plan.id, subplanId: s.id, label, area: s.area, title: d.title, estMinutes: DELIVERABLE_MINUTES, targetWeek: weeks, overdue: false });
      }
    }
  }
  return out.sort((a, b) => Number(b.overdue) - Number(a.overdue) || a.targetWeek - b.targetWeek);
}

// ── Persistencia ─────────────────────────────────────────────────────────

function cleanTopic(raw: any): PlannedTopic | null {
  const folder = String(raw?.folder ?? "").replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  if (!folder) return null;
  const skills = Array.isArray(raw.skills) ? [...new Set(raw.skills.map((s: unknown) => String(s).trim().toLowerCase()).filter(Boolean))] as string[] : [];
  const t: PlannedTopic = {
    folder,
    title: oneLine(raw.title, 160) || folder.split("/").pop()!,
    targetWeek: Math.max(1, Math.round(Number(raw.targetWeek) || 1)),
    estMinutes: Math.max(0, Math.round(Number(raw.estMinutes) || 0)),
  };
  if (skills.length) t.skills = skills;
  if (DATE_RE.test(String(raw.completedAt ?? ""))) t.completedAt = String(raw.completedAt);
  if (raw.diagnostic === true) t.diagnostic = true;
  return t;
}

/**
 * Normaliza un plan leído de disco; null si no es utilizable. Acepta el formato de periodo (`start`/`end`) y
 * el mensual heredado (`month`: el periodo es el mes entero y el id es el mes). `fileId` = nombre del archivo.
 */
export function sanitizePlan(raw: any, fileId?: string): Plan | null {
  if (!raw || typeof raw !== "object") return null;
  let start: string;
  let end: string;
  if (isDate(raw.start) && isDate(raw.end) && raw.end >= raw.start && daysBetween(raw.start, raw.end) + 1 <= MAX_PERIOD_DAYS) {
    start = raw.start;
    end = raw.end;
  } else if (MONTH_RE.test(String(raw.month ?? ""))) {
    ({ start, end } = monthBounds(String(raw.month)));
  } else return null;
  const bounds = MONTH_RE.test(String(raw.month ?? "")) ? monthBounds(String(raw.month)) : null;
  const month = bounds && bounds.start === start && bounds.end === end ? String(raw.month) : undefined;
  const idCandidates = [fileId, raw.id].map((v) => String(v ?? "")).filter((v) => PLAN_ID_RE.test(v));
  const id = idCandidates[0] ?? month ?? `${start}_${end}`;

  const ranges = weekRangesOf(start, end);
  const subplans: Subplan[] = [];
  const ids = new Set<string>();
  for (const [i, s] of (Array.isArray(raw.subplans) ? raw.subplans : []).entries()) {
    if (!s || typeof s !== "object") continue;
    let sid = /^[A-Za-z0-9_-]{1,40}$/.test(String(s.id ?? "")) ? String(s.id) : `s${i + 1}`;
    while (ids.has(sid)) sid += "x";
    ids.add(sid);
    const topics: PlannedTopic[] = (Array.isArray(s.topics) ? s.topics : []).map(cleanTopic).filter((t: PlannedTopic | null): t is PlannedTopic => t !== null);
    const weeks: WeekSlice[] = ranges.map((r) => {
      const inWeek = topics.filter((t) => Math.min(ranges.length, t.targetWeek) === r.week);
      const saved = (Array.isArray(s.weeks) ? s.weeks : []).find((w: any) => Number(w?.week) === r.week);
      return {
        week: r.week,
        start: r.start,
        end: r.end,
        topics: inWeek.map((t) => t.folder),
        minutes: inWeek.reduce((n, t) => n + t.estMinutes, 0),
        capacityMinutes: Math.max(0, Math.round(Number(saved?.capacityMinutes) || 0)),
      };
    });
    const deliverable = s.deliverable && typeof s.deliverable === "object" ? cleanDeliverable(s.deliverable) : undefined;
    subplans.push({
      id: sid,
      area: oneLine(s.area, 80) || "General",
      objective: oneLine(s.objective, 200),
      ...(s.goalId ? { goalId: String(s.goalId) } : {}),
      ...(Array.isArray(s.goalItemIds) && s.goalItemIds.length ? { goalItemIds: s.goalItemIds.map(String) } : {}),
      topics: topics.map((t) => ({ ...t, targetWeek: Math.min(ranges.length, t.targetWeek) })),
      weeks,
      requiredGoals: (Array.isArray(s.requiredGoals) ? s.requiredGoals : [])
        .filter((g: any) => g && g.goalId)
        .map((g: any) => ({ goalId: String(g.goalId), ...(g.itemId ? { itemId: String(g.itemId) } : {}), note: oneLine(g.note, 200) })),
      ...(deliverable ? { deliverable } : {}),
      ...(s.notes ? { notes: oneLine(s.notes, 400) } : {}),
    });
  }
  const hours = Number(raw.hoursPerWeek);
  const practice = sanitizePracticeTrack(raw.programmingPractice, start, end);
  const questions = sanitizeOpenQuestions(raw.openQuestions, subplans);
  const pre = raw.preconditions && typeof raw.preconditions === "object" ? sanitizePreconditions({ ...raw.preconditions, start, end }, start) : undefined;
  return {
    id,
    start,
    end,
    ...(month ? { month } : {}),
    createdAt: String(raw.createdAt || new Date().toISOString()),
    updatedAt: String(raw.updatedAt || raw.createdAt || new Date().toISOString()),
    ...(hours > 0 ? { hoursPerWeek: hours } : {}),
    ...(pre ? { preconditions: pre } : {}),
    ...(oneLine(raw.name, 80) ? { name: oneLine(raw.name, 80) } : {}),
    ...(raw.archived === true ? { archived: true } : {}),
    ...(raw.auto === true ? { auto: true } : {}),
    ...(raw.rationale ? { rationale: oneLine(raw.rationale, 600) } : {}),
    ...(practice ? { programmingPractice: practice } : {}),
    ...(questions.length ? { openQuestions: questions } : {}),
    subplans,
  };
}

/** Un archivo por plan en `.notevault/mentor/plans/<id>.json` (los mensuales heredados: `<AAAA-MM>.json`). */
export class PlanStore {
  readonly vaultRoot: string;
  readonly dir: string;

  constructor(vaultRoot: string) {
    this.vaultRoot = path.resolve(vaultRoot);
    this.dir = path.join(this.vaultRoot, LAYOUT.mentor_plans_dir);
  }

  private _path(id: string): string {
    return path.join(this.vaultRoot, formatLayout(LAYOUT.mentor_plan, { id }));
  }

  load(id: string): Plan | null {
    if (!PLAN_ID_RE.test(id)) return null;
    return sanitizePlan(store.loadJson(this._path(id)), id);
  }

  save(plan: Plan): Plan {
    const clean = sanitizePlan(plan, plan.id);
    if (!clean) throw new Error("Plan inválido: falta el periodo (inicio y fin AAAA-MM-DD).");
    store.writeJson(this._path(clean.id), clean);
    return clean;
  }

  /** Ids de los planes guardados (nombre de archivo sin `.json`), orden alfabético. */
  ids(): string[] {
    if (!fs.existsSync(this.dir)) return [];
    return fs
      .readdirSync(this.dir)
      .filter((f) => !isSyncConflict(f) && f.endsWith(".json") && PLAN_ID_RE.test(f.slice(0, -5)))
      .map((f) => f.slice(0, -5))
      .sort();
  }

  /** Manda el archivo del plan a la papelera de la vault (`mentor-plans`); false si no existía. */
  trash(id: string): boolean {
    if (!PLAN_ID_RE.test(id)) return false;
    return store.toTrash(this.vaultRoot, this._path(id), "mentor-plans") !== null;
  }

  /** Todos los planes legibles, por fecha de inicio (y de creación). */
  list(): Plan[] {
    return this.ids()
      .map((id) => this.load(id))
      .filter((p): p is Plan => p !== null)
      .sort((a, b) => a.start.localeCompare(b.start) || a.createdAt.localeCompare(b.createdAt));
  }

  /** Meses con plan mensual heredado, el más reciente primero. */
  months(): string[] {
    return this.ids().filter((id) => MONTH_RE.test(id) && this.load(id)).sort().reverse();
  }
}
