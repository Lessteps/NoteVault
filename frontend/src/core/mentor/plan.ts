/**
 * Plan mensual del Mentor: subplanes por área/objetivo con temas elegidos, reparto semanal y
 * registro de temas completados.
 *
 * Datos en `.notevault/mentor/plans/<YYYY-MM>.json` (opcional y aditivo, ver docs/VAULT_FORMAT.md).
 * La IA solo propone (ver `planDraft.ts`); aquí todo es determinista:
 *  - `distributeTopics` / `buildPlan`: reparto semana a semana según las horas por semana.
 *  - `topicState` / `deriveView`: el estado de práctica y el % se DERIVAN en vivo del motor de
 *    práctica; en el archivo solo se guarda lo que no se puede derivar (`completedAt`, entregable).
 *  - `refreshPlanProgress`: anota la fecha la primera vez que se observa un tema completo (nunca la pisa).
 *  - `planItemsFor`: de dónde sale el plan diario: lo que el plan del mes dice que toca esta semana.
 */

import * as fs from "node:fs";
import * as path from "node:path";
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
  /** semana del mes (1..) en que toca terminarlo */
  targetWeek: number;
  estMinutes: number;
  /** AAAA-MM-DD: la primera vez que se observó el tema completo (registro de temas completados) */
  completedAt?: string;
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

export interface MonthlyPlan {
  /** AAAA-MM */
  month: string;
  createdAt: string;
  updatedAt: string;
  hoursPerWeek?: number;
  subplans: Subplan[];
}

export type TopicState = "sin_tratar" | "practicando" | "consolidado" | "completo" | "examen_pendiente" | "no_encontrado";

/** Lo mínimo de un tema de la vault para derivar su estado (cumple `TopicSnap`). */
export interface TopicLite {
  progress: TopicProgressSnap;
  attemptCount: number;
  lastAttemptAt?: string | null;
}
export type TopicLiteLookup = (folder: string) => TopicLite | null | undefined;

// ── Fechas y semanas del mes ─────────────────────────────────────────────

export const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
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
  const n = daysInMonth(month);
  const out: Array<{ week: number; start: string; end: string; days: number }> = [];
  for (let d = 1, w = 1; d <= n; d += 7, w++) {
    const e = Math.min(n, d + 6);
    out.push({ week: w, start: `${month}-${two(d)}`, end: `${month}-${two(e)}`, days: e - d + 1 });
  }
  return out;
}

/** Semana (1..) del mes a la que pertenece `date`; 0 si es anterior al mes, la última+1 si es posterior. */
export function weekOf(date: string, month: string): number {
  const m = monthOf(date);
  if (m < month) return 0;
  const weeks = weekRanges(month).length;
  if (m > month) return weeks + 1;
  return Math.floor((Number(date.slice(8, 10)) - 1) / 7) + 1;
}

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

export interface DistributeInput {
  month: string;
  hoursPerWeek: number;
  topics: ReadonlyArray<{ folder: string; title: string; skills?: string[]; estMinutes: number }>;
  /** primer día disponible (AAAA-MM-DD); por defecto, el día 1 del mes */
  from?: string;
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

/**
 * Reparte los temas EN ORDEN por las semanas del mes. Cada semana tiene `hoursPerWeek` (prorrateado por
 * los días que quedan desde `from`). Un tema entra en la semana actual si cabe al menos la mitad de sus
 * minutos (o la semana está vacía); si no se avanza. Lo que sobrepasa el mes se queda en la última
 * semana y se avisa de cuántas horas por semana harían falta.
 */
export function distributeTopics(input: DistributeInput): Distribution {
  if (!MONTH_RE.test(input.month)) throw new Error("Mes inválido (AAAA-MM).");
  if (!(input.hoursPerWeek > 0)) throw new Error("Las horas por semana deben ser mayores que 0.");
  const ranges = weekRanges(input.month);
  const from = input.from && DATE_RE.test(input.from) && monthOf(input.from) === input.month ? input.from : `${input.month}-01`;
  const perDay = (input.hoursPerWeek * 60) / 7;
  const weeks: WeekSlice[] = ranges.map((r) => {
    const firstDay = from > r.start ? from : r.start;
    const days = firstDay > r.end ? 0 : Number(r.end.slice(8, 10)) - Number(firstDay.slice(8, 10)) + 1;
    return { week: r.week, start: r.start, end: r.end, topics: [], minutes: 0, capacityMinutes: Math.round(perDay * days) };
  });
  const usable = weeks.filter((w) => w.capacityMinutes > 0);
  const availableMinutes = usable.reduce((n, w) => n + w.capacityMinutes, 0);
  const topics = input.topics.filter((t) => t.estMinutes > 0);

  let idx = Math.max(0, weeks.findIndex((w) => w.capacityMinutes > 0));
  let remaining = weeks[idx]!.capacityMinutes;
  const planned: PlannedTopic[] = [];
  for (const t of topics) {
    while (idx < weeks.length - 1 && weeks[idx]!.topics.length > 0 && remaining < t.estMinutes * 0.5) {
      idx++;
      remaining = weeks[idx]!.capacityMinutes;
    }
    const w = weeks[idx]!;
    w.topics.push(t.folder);
    w.minutes += t.estMinutes;
    remaining -= t.estMinutes;
    planned.push({ folder: t.folder, title: t.title, ...(t.skills?.length ? { skills: t.skills } : {}), targetWeek: w.week, estMinutes: t.estMinutes });
  }

  const totalMinutes = topics.reduce((n, t) => n + t.estMinutes, 0);
  const fits = totalMinutes <= availableMinutes;
  const requiredHoursPerWeek = availableMinutes > 0 ? r1((totalMinutes / availableMinutes) * input.hoursPerWeek) : null;
  const warnings: string[] = [];
  if (!topics.length) warnings.push("No hay temas que repartir.");
  else if (!fits) {
    warnings.push(
      `No cabe en el mes: harían falta unas ${requiredHoursPerWeek ?? "?"} h/semana (tienes ${r1(input.hoursPerWeek)}) o quitar temas. Lo que sobra queda en la última semana.`,
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
  topics: Array<{ folder: string; title: string; skills?: string[]; estMinutes: number }>;
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
  plan: MonthlyPlan;
  warnings: string[];
  fits: boolean;
  totalMinutes: number;
  availableMinutes: number;
  requiredHoursPerWeek: number | null;
}

/**
 * Plan del mes desde las semillas de los subplanes. Las horas por semana se reparten entre los
 * subplanes en proporción a sus minutos; el plan "cabe" si la suma de minutos cabe en el mes.
 */
export function buildPlan(
  seeds: readonly SubplanSeed[],
  opts: { month: string; hoursPerWeek: number; from?: string; now?: string; createdAt?: string },
): BuiltPlan {
  const now = opts.now ?? new Date().toISOString();
  const total = seeds.reduce((n, s) => n + s.topics.reduce((m, t) => m + t.estMinutes, 0), 0);
  const warnings: string[] = [];
  const used = new Set<string>();
  const subplans: Subplan[] = [];
  let totalMinutes = 0;
  let availableMinutes = 0;
  seeds.forEach((seed, i) => {
    const minutes = seed.topics.reduce((n, t) => n + t.estMinutes, 0);
    const share = total > 0 ? minutes / total : 1 / Math.max(1, seeds.length);
    // un subplan sin temas (solo entregable) no consume horas: se le da un mínimo simbólico para poder calcular
    const hours = Math.max(0.1, opts.hoursPerWeek * share);
    const dist = distributeTopics({ month: opts.month, hoursPerWeek: hours, topics: seed.topics, from: opts.from });
    totalMinutes += dist.totalMinutes;
    availableMinutes += total > 0 ? dist.availableMinutes : 0;
    let id = seed.id && /^[A-Za-z0-9_-]{1,40}$/.test(seed.id) ? seed.id : `s${i + 1}-${slugOf(seed.area)}`;
    while (used.has(id)) id += "x";
    used.add(id);
    const deliverable = cleanDeliverable(seed.deliverable);
    subplans.push({
      id,
      area: oneLine(seed.area, 80) || "General",
      objective: oneLine(seed.objective, 200),
      ...(seed.goalId ? { goalId: seed.goalId } : {}),
      ...(seed.goalItemIds?.length ? { goalItemIds: seed.goalItemIds } : {}),
      topics: dist.topics,
      weeks: dist.weeks,
      requiredGoals: (seed.requiredGoals ?? []).map((g) => ({ goalId: g.goalId, ...(g.itemId ? { itemId: g.itemId } : {}), note: oneLine(g.note, 200) })),
      ...(deliverable ? { deliverable } : {}),
      ...(seed.notes ? { notes: oneLine(seed.notes, 400) } : {}),
    });
  });
  const fits = totalMinutes <= availableMinutes || total === 0;
  // hours/semana totales que harían falta = proporcional a lo que falta de capacidad
  const requiredHoursPerWeek = availableMinutes > 0 ? r1((totalMinutes / availableMinutes) * opts.hoursPerWeek) : null;
  if (!fits) {
    warnings.push(
      `No cabe en el mes: harían falta unas ${requiredHoursPerWeek ?? "?"} h/semana (tienes ${r1(opts.hoursPerWeek)}) o quitar temas. Lo que sobra queda en la última semana de cada subplan.`,
    );
  } else if (total > 0 && totalMinutes < availableMinutes * 0.4) {
    warnings.push(`Te sobra tiempo: a ${r1(opts.hoursPerWeek)} h/semana solo usas ${Math.round((totalMinutes / availableMinutes) * 100)}% del mes.`);
  }
  if (!subplans.length) warnings.push("El plan no tiene subplanes.");
  return {
    plan: { month: opts.month, createdAt: opts.createdAt ?? now, updatedAt: now, hoursPerWeek: opts.hoursPerWeek, subplans },
    warnings,
    fits,
    totalMinutes,
    availableMinutes,
    requiredHoursPerWeek,
  };
}

/**
 * Fusiona lo aceptado en el plan del mes. Un subplan con el mismo área+objetivo SUSTITUYE al anterior
 * conservando lo que no se puede recalcular (`completedAt` por tema, estado/proyecto del entregable);
 * los demás subplanes del mes se mantienen.
 */
export function mergePlans(existing: MonthlyPlan | null, incoming: MonthlyPlan, now: string = new Date().toISOString()): MonthlyPlan {
  if (!existing) return incoming;
  const byKey = new Map(existing.subplans.map((s) => [subplanKey(s), s]));
  const taken = new Set<string>();
  const merged: Subplan[] = [];
  const ids = new Set<string>();
  for (const s of incoming.subplans) {
    const old = byKey.get(subplanKey(s));
    if (old) taken.add(subplanKey(old));
    const done = new Map((old?.topics ?? []).filter((t) => t.completedAt).map((t) => [t.folder, t.completedAt!]));
    let id = old?.id ?? s.id;
    while (ids.has(id)) id += "x";
    ids.add(id);
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
  return { ...existing, hoursPerWeek: incoming.hoursPerWeek ?? existing.hoursPerWeek, updatedAt: now, subplans: merged };
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
  /** semana (1..) del mes a la que apunta `today`, acotada al rango del plan */
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

export function deriveView(plan: MonthlyPlan, lookup: TopicLiteLookup, today: string): PlanDerived {
  const weeks = weekRanges(plan.month).length;
  const cur = Math.min(weeks, Math.max(1, weekOf(today, plan.month) || 1));
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
  plan: MonthlyPlan,
  lookup: TopicLiteLookup,
  todayIso: string,
): { plan: MonthlyPlan; changed: boolean; completed: string[] } {
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

// ── Del plan mensual al plan diario ──────────────────────────────────────

export interface PlanItem {
  kind: "topic" | "deliverable";
  month: string;
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
 * Lo que el plan del mes dice que toca el día `date`: los temas aún sin completar cuya semana objetivo es
 * esta semana o una anterior (atrasados primero), y el entregable en la última semana (o cuando ya no
 * quedan temas) si no está hecho. `isDone` permite descartar temas ya completos en vivo.
 */
export function planItemsFor(date: string, plans: readonly MonthlyPlan[], isDone?: (folder: string) => boolean): PlanItem[] {
  const out: PlanItem[] = [];
  for (const plan of plans) {
    if (plan.month !== monthOf(date)) continue;
    const weeks = weekRanges(plan.month).length;
    const cur = weekOf(date, plan.month);
    if (cur < 1) continue;
    for (const s of plan.subplans) {
      const label = subplanLabel(s);
      let pending = 0;
      for (const t of s.topics) {
        if (t.completedAt || isDone?.(t.folder)) continue;
        pending++;
        if (t.targetWeek > cur) continue;
        out.push({
          kind: "topic",
          month: plan.month,
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
        out.push({ kind: "deliverable", month: plan.month, subplanId: s.id, label, area: s.area, title: d.title, estMinutes: DELIVERABLE_MINUTES, targetWeek: weeks, overdue: false });
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
  return t;
}

/** Normaliza un plan leído de disco; null si no es utilizable. */
export function sanitizePlan(raw: any): MonthlyPlan | null {
  if (!raw || typeof raw !== "object" || !MONTH_RE.test(String(raw.month ?? ""))) return null;
  const month = String(raw.month);
  const ranges = weekRanges(month);
  const subplans: Subplan[] = [];
  const ids = new Set<string>();
  for (const [i, s] of (Array.isArray(raw.subplans) ? raw.subplans : []).entries()) {
    if (!s || typeof s !== "object") continue;
    let id = /^[A-Za-z0-9_-]{1,40}$/.test(String(s.id ?? "")) ? String(s.id) : `s${i + 1}`;
    while (ids.has(id)) id += "x";
    ids.add(id);
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
      id,
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
  return {
    month,
    createdAt: String(raw.createdAt || new Date().toISOString()),
    updatedAt: String(raw.updatedAt || raw.createdAt || new Date().toISOString()),
    ...(hours > 0 ? { hoursPerWeek: hours } : {}),
    subplans,
  };
}

/** Un archivo por mes en `.notevault/mentor/plans/<YYYY-MM>.json`. */
export class PlanStore {
  readonly vaultRoot: string;
  readonly dir: string;

  constructor(vaultRoot: string) {
    this.vaultRoot = path.resolve(vaultRoot);
    this.dir = path.join(this.vaultRoot, LAYOUT.mentor_plans_dir);
  }

  private _path(month: string): string {
    return path.join(this.vaultRoot, formatLayout(LAYOUT.mentor_plan, { month }));
  }

  load(month: string): MonthlyPlan | null {
    if (!MONTH_RE.test(month)) return null;
    return sanitizePlan(store.loadJson(this._path(month)));
  }

  save(plan: MonthlyPlan): MonthlyPlan {
    const clean = sanitizePlan(plan);
    if (!clean) throw new Error("Plan inválido: falta el mes (AAAA-MM).");
    store.writeJson(this._path(clean.month), clean);
    return clean;
  }

  /** Meses con plan, el más reciente primero. */
  months(): string[] {
    if (!fs.existsSync(this.dir)) return [];
    return fs
      .readdirSync(this.dir)
      .filter((f) => !isSyncConflict(f) && /^\d{4}-\d{2}\.json$/.test(f) && MONTH_RE.test(f.slice(0, 7)))
      .map((f) => f.slice(0, 7))
      .sort()
      .reverse();
  }
}
