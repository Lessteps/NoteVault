// Mentor — Planeación: las PÁGINAS del plan (Vista general, una por área y Bases). Módulo PURO (sin React): el alcance de
// una página y las cifras de su semana, calculadas con los MISMOS selectores que la Agenda y la Ejecución (`byWeekArea`, `dayByArea`,
// `dayBases`, `areaRouteTopics`), de modo que los números de una página coinciden con los de los demás sitios.

import { BASES_KEY } from "../../lib/planAreaTopics";
import { deliverableInArea, deliverablesText, topicsText, type ScheduleDay, type WeekSummary } from "../../lib/planSchedule";
import { addDays } from "../../lib/planTime";
import { areaRouteTopics, basesClassifier, basesRouteTopics, dayBases, dayByArea, orderedAreas, type DayAreaEntry, type DayBasesItem } from "../../lib/planTopicsByArea";
import type { PlanDeliverable } from "../../lib/planAreas";
import type { MentorPlan } from "../../lib/types";
import type { AgendaModel } from "./agendaKit";

/** De qué trata una página: todo el plan, un área (por su subplan) o los fundamentos (Bases). */
export type PageScope = { kind: "all" } | { kind: "area"; subplanId: string } | { kind: "bases" };
export const SCOPE_ALL: PageScope = { kind: "all" };
export const SCOPE_BASES: PageScope = { kind: "bases" };
/** La clave corta del alcance (la de `pageTabKey`). */
export const scopeKey = (s: PageScope): string => (s.kind === "all" ? "all" : s.kind === "bases" ? BASES_KEY : s.subplanId);
/** El subplan filtrado por el alcance (null = todas las áreas; para Bases, su propio marcador). */
export const scopeOnly = (s: PageScope): string | null => (s.kind === "all" ? null : s.kind === "bases" ? BASES_KEY : s.subplanId);

/** Las pestañas de una página de área / Bases y las de la Vista general. */
export const AREA_TAB_IDS = ["semana", "calendario", "temas", "proyectos"] as const;
export const OVERVIEW_TAB_IDS = ["semana", "calendario", "area", "proyectos", "detalles"] as const;
export type AreaTabId = (typeof AREA_TAB_IDS)[number];
export type OverviewTabId = (typeof OVERVIEW_TAB_IDS)[number];
export const tabIdsOf = (s: PageScope): readonly string[] => (s.kind === "all" ? OVERVIEW_TAB_IDS : AREA_TAB_IDS);
/** La pestaña a enseñar: la guardada si existe en esa página; si no, la semana. */
export const normalizePageTab = (stored: string, s: PageScope): string => (tabIdsOf(s).includes(stored) ? stored : "semana");

/** El alcance de una página a partir del filtro guardado (subplan, «__bases» o vacío); un área que ya no existe vuelve a la Vista general. */
export function scopeFromStored(stored: string, plan: Pick<MentorPlan, "subplans">): PageScope {
  if (stored === BASES_KEY) return SCOPE_BASES;
  return stored && plan.subplans.some((s) => s.id === stored) ? { kind: "area", subplanId: stored } : SCOPE_ALL;
}

export interface ScopeInfo {
  title: string;
  areaId?: string;
  /** nombre corto para «Temas Backend», «Práctica de Backend»… */
  name: string;
}
export function scopeInfo(plan: Pick<MentorPlan, "subplans" | "name">, s: PageScope, planName?: string): ScopeInfo {
  if (s.kind === "bases") return { title: "Bases", name: "Bases" };
  if (s.kind === "area") {
    const sub = plan.subplans.find((x) => x.id === s.subplanId);
    return { title: sub?.area ?? "Área", ...(sub?.areaId ? { areaId: sub.areaId } : {}), name: sub?.area ?? "Área" };
  }
  return { title: planName ?? plan.name ?? "Plan de estudio", name: "Plan" };
}

/** Los temas de la ruta del alcance (para el plan entero no se usa: solo áreas y Bases). */
export function scopeRoute(plan: Pick<MentorPlan, "subplans">, s: PageScope) {
  return s.kind === "area" ? areaRouteTopics(plan, s.subplanId) : s.kind === "bases" ? basesRouteTopics(plan) : [];
}

/** Un tema está hecho si el plan lo anota o la práctica lo da por completo (la misma regla que la barra de la Ejecución). */
export const topicDone = (m: Pick<AgendaModel, "topicByFolder">, t: { folder: string; completedAt?: string }): boolean => !!t.completedAt || m.topicByFolder.get(t.folder)?.state === "completo";

export interface ScopeProgress {
  total: number;
  done: number;
  pending: number;
  pct: number;
}
/** Avance de una página: temas hechos / de su ruta (para el plan entero, los de todas las áreas y Bases sin repetirse). */
export function scopeProgress(plan: Pick<MentorPlan, "subplans">, m: Pick<AgendaModel, "topicByFolder">, s: PageScope): ScopeProgress {
  let topics: Array<{ folder: string; completedAt?: string }>;
  if (s.kind === "all") {
    const seen = new Map<string, { folder: string; completedAt?: string }>();
    for (const a of orderedAreas(plan)) for (const t of areaRouteTopics(plan, a.subplanId)) seen.set(t.folder, t);
    for (const t of basesRouteTopics(plan)) seen.set(t.folder, t);
    topics = [...seen.values()];
  } else topics = scopeRoute(plan, s);
  const done = topics.filter((t) => topicDone(m, t)).length;
  return { total: topics.length, done, pending: topics.length - done, pct: topics.length ? Math.round((done / topics.length) * 100) : 0 };
}

/** «Activo» · «Próximo» · «Completo» de un área según su fase y su avance. */
export function areaState(plan: Pick<MentorPlan, "subplans">, s: PageScope, progress: ScopeProgress, currentWeek: number): "activo" | "proximo" | "completo" {
  if (progress.total > 0 && progress.done === progress.total) return "completo";
  if (s.kind === "area") {
    const ph = plan.subplans.find((x) => x.id === s.subplanId)?.phase;
    if (ph && currentWeek < ph.fromWeek) return "proximo";
  }
  return "activo";
}

/** Las fechas de un área: su fase (semanas) dentro del plan; sin fase, las del plan. */
export function scopeDates(plan: Pick<MentorPlan, "subplans" | "start" | "end">, s: PageScope): { start: string; end: string } {
  if (s.kind === "area") {
    const ph = plan.subplans.find((x) => x.id === s.subplanId)?.phase;
    if (ph) {
      const start = addDays(plan.start, (ph.fromWeek - 1) * 7);
      const end = addDays(plan.start, ph.toWeek * 7 - 1);
      return { start, end: end > plan.end ? plan.end : end };
    }
  }
  return { start: plan.start, end: plan.end };
}

/**
 * Cuándo termina de verdad la ruta de un área según el reparto por avance: el último día en que aún tiene un tema por hacer. null si no le queda
 * nada (completa), si no tiene fase propia que comparar o si es la Vista general / Bases. Se compara con el final del PLAN para decidir si se enseña.
 */
export function scopeRouteEnd(m: Pick<AgendaModel, "schedule">, s: PageScope): string | null {
  if (s.kind !== "area") return null;
  let last: string | null = null;
  for (const d of m.schedule.days) if (d.topics.some((t) => t.subplanId === s.subplanId && !t.done) && (!last || d.date > last)) last = d.date;
  return last;
}

/** Las áreas «activas» del plan en la semana actual (su fase la incluye; sin fases, todas): son los chips de la Vista general. */
export function activeAreas(plan: Pick<MentorPlan, "subplans">, currentWeek: number) {
  const all = orderedAreas(plan);
  const live = all.filter((a) => {
    const ph = plan.subplans.find((x) => x.id === a.subplanId)?.phase;
    return !ph || (currentWeek >= ph.fromWeek && currentWeek <= ph.toWeek);
  });
  return live.length ? live : all;
}

// ── Cifras de una semana ────────────────────────────────────────────────

/**
 * ¿El entregable es PROPIO del área? Más estricto que `deliverableInArea`: un integrador (`areaId: "all"`) solo cuenta si nombra el área en
 * `areaIds`; uno sin lista es del plan entero y no se le atribuye a ninguna área en concreto.
 */
export const deliverableOfArea = (d: PlanDeliverable, areaId: string): boolean => d.areaId === areaId || (d.areaId === "all" && !!d.areaIds?.includes(areaId));

/** Los entregables de una lista que pertenecen al alcance de la página (todos para la Vista general; ninguno para Bases). */
export function scopeDeliverables(plan: Pick<MentorPlan, "subplans">, s: PageScope, list: readonly PlanDeliverable[]): PlanDeliverable[] {
  if (s.kind === "all") return [...list];
  if (s.kind === "bases") return [];
  const areaId = plan.subplans.find((x) => x.id === s.subplanId)?.areaId;
  return areaId ? list.filter((d) => deliverableOfArea(d, areaId)) : [];
}

export interface ScopeWeekStats {
  /** temas de la semana en esta página y cuántos están hechos */
  topics: number;
  done: number;
  pending: number;
  /** minutos de estudio teórico (los de sus temas esa semana) */
  theoryMinutes: number;
  /** minutos de práctica propia del área (sin la práctica diaria de lenguaje) y bloques */
  practiceMinutes: number;
  practiceBlocks: number;
  /** días de la semana con un proyecto propio del área */
  projectDays: number;
  /** entregables de la semana que son del área */
  deliverables: PlanDeliverable[];
}

/** Lo que un área tiene un día (undefined si ese día no toca nada del área). */
export function dayAreaEntry(m: AgendaModel, day: ScheduleDay, subplanId: string): DayAreaEntry | undefined {
  return dayByArea(m.plan, day, m.dueByDate.get(day.date) ?? []).find((e) => e.subplanId === subplanId);
}

/** Las cifras de la semana `week` de un área o de Bases, salidas del reparto por área (`m.byWeekArea`) y de `dayByArea`. */
export function scopeWeekStats(m: AgendaModel, s: PageScope, week: number, w: WeekSummary | null): ScopeWeekStats {
  const cells = m.byWeekArea.weeks[week - 1];
  const days = m.schedule.days.filter((d) => d.week === week);
  const empty: ScopeWeekStats = { topics: 0, done: 0, pending: 0, theoryMinutes: 0, practiceMinutes: 0, practiceBlocks: 0, projectDays: 0, deliverables: [] };
  if (!cells || s.kind === "all") return empty;
  if (s.kind === "bases") {
    const list = cells.bases;
    const done = list.filter((t) => t.done).length;
    return { ...empty, topics: list.length, done, pending: list.length - done, theoryMinutes: list.reduce((n, t) => n + t.minutes, 0) };
  }
  const cell = cells.cells.find((c) => c.subplanId === s.subplanId);
  const areaId = m.plan.subplans.find((x) => x.id === s.subplanId)?.areaId;
  let practiceMinutes = 0;
  let practiceBlocks = 0;
  let projectDays = 0;
  for (const d of days) {
    const e = dayAreaEntry(m, d, s.subplanId);
    if (!e) continue;
    practiceMinutes += e.practiceMinutes;
    practiceBlocks += e.practiceBlocks;
    if (e.project) projectDays++;
  }
  return {
    topics: cell?.topics.length ?? 0,
    done: cell?.done ?? 0,
    pending: (cell?.topics.length ?? 0) - (cell?.done ?? 0),
    theoryMinutes: cell?.minutes ?? 0,
    practiceMinutes,
    practiceBlocks,
    projectDays,
    deliverables: areaId && w ? w.deliverables.filter((d) => d.kind !== "kata" && deliverableOfArea(d, areaId)) : [],
  };
}

const shortTopic = (t: string): string => t.replace(/^[\d.\s_-]+/, "").trim() || t;

/**
 * El propósito AUTOMÁTICO de la semana de un área o de Bases, hecho solo con SUS temas y SUS entregables:
 * «Semana 3 · 4 temas de Backend: de HTTP a REST; entrega: Proyecto…».
 */
export function scopeWeekPurpose(m: AgendaModel, s: PageScope, week: number, w: WeekSummary | null): string {
  if (s.kind === "all") return w?.autoPurpose ?? "";
  const stats = scopeWeekStats(m, s, week, w);
  const name = scopeInfo(m.plan, s).name;
  const cells = m.byWeekArea.weeks[week - 1];
  const list = !cells ? [] : s.kind === "bases" ? cells.bases : cells.cells.find((c) => c.subplanId === s.subplanId)?.topics ?? [];
  const pend = list.filter((t) => !t.done);
  const seq = pend.length ? pend : list;
  const del = stats.deliverables.map((d) => d.title);
  const range = seq.length > 1 ? `: de ${shortTopic(seq[0]!.title)} a ${shortTopic(seq[seq.length - 1]!.title)}` : seq.length === 1 ? `: ${shortTopic(seq[0]!.title)}` : ": práctica y repaso";
  return `Semana ${week} · ${stats.topics > 0 ? `${topicsText(stats.topics)} de ${name}` : name}${range}${del.length ? `; entrega: ${del.join(", ")}` : ""}.`;
}

/** «4 temas, 2 entregables» de un día, un mes o una semana de un área / Bases (para el resumen de la página). */
export function scopePeriodSummary(m: AgendaModel, s: PageScope, from: string, to: string, defined: boolean): string {
  const isBases = basesClassifier(m.plan);
  const folders = new Set<string>();
  for (const d of m.schedule.days) {
    if (d.date < from || d.date > to) continue;
    for (const t of d.topics) {
      const bases = isBases(t);
      if (s.kind === "bases" ? bases : s.kind === "area" ? !bases && t.subplanId === s.subplanId : true) folders.add(t.folder);
    }
  }
  const due: PlanDeliverable[] = [];
  for (const [date, list] of m.dueByDate) if (date >= from && date <= to) due.push(...list.filter((d) => d.kind !== "kata"));
  return `${topicsText(folders.size)}, ${defined ? deliverablesText(scopeDeliverables(m.plan, s, due).length) : "entregables por definir"}`;
}

export interface ScopeDayRowData {
  date: string;
  count: number;
  /** títulos de los temas de ese día en esta página (únicos, en orden) */
  titles: string[];
  theoryMinutes: number;
  practiceMinutes: number;
  project: boolean;
}
/** La fila de un día para un área o Bases: sus temas, cuántos y qué tipos de bloque. */
export function scopeDayRow(m: AgendaModel, s: PageScope, day: ScheduleDay): ScopeDayRowData {
  if (s.kind === "bases") {
    const items: DayBasesItem[] = dayBases(m.plan, day);
    const titles = [...new Set(items.map((i) => i.title))];
    return {
      date: day.date,
      count: new Set(items.map((i) => i.folder)).size,
      titles,
      theoryMinutes: items.reduce((n, i) => n + (i.kinds.includes("theory") ? i.minutes : 0), 0),
      practiceMinutes: items.reduce((n, i) => n + (i.kinds.includes("practice") ? i.minutes : 0), 0),
      project: false,
    };
  }
  const e = s.kind === "area" ? dayAreaEntry(m, day, s.subplanId) : undefined;
  if (!e) return { date: day.date, count: 0, titles: [], theoryMinutes: 0, practiceMinutes: 0, project: false };
  const titles = [...new Set((e.blocks ?? []).flatMap((b) => b.items.map((i) => i.title)))];
  return { date: day.date, count: e.topics, titles, theoryMinutes: e.theoryMinutes, practiceMinutes: e.practiceMinutes, project: e.project };
}

// ── Días con actividad y cifras de CUMPLIMIENTO (no de horas) ───────────

/**
 * ¿Pasó algo hecho ese día? Un tema completado ese día, el kata del día hecho o un entregable (proyecto) entregado. `only` es el filtro del
 * alcance (`scopeOnly`): null = todo el plan, un subplan, o `BASES_KEY`.
 */
export function dayHasDone(m: AgendaModel, day: ScheduleDay, only: string | null = null): boolean {
  const isBases = basesClassifier(m.plan);
  for (const t of day.topics) {
    if (!t.done) continue;
    const bases = isBases(t);
    if (only === null || (only === BASES_KEY ? bases : !bases && t.subplanId === only)) return true;
  }
  if (only === null && (m.practiceStatus?.kataDoneDates ?? []).includes(day.date)) return true;
  const areaId = only && only !== BASES_KEY ? m.plan.subplans.find((s) => s.id === only)?.areaId : undefined;
  for (const d of m.dueByDate.get(day.date) ?? []) {
    if (d.status !== "hecho") continue;
    if (only === null || (areaId ? deliverableInArea(d, areaId) : false)) return true;
  }
  return false;
}

/** «Ver día» solo existe para hoy, los días futuros y los pasados en que se hizo algo: un día pasado vacío no tiene nada que ver. */
export const dayViewable = (m: AgendaModel, day: ScheduleDay, only: string | null = null): boolean => day.date >= m.today || dayHasDone(m, day, only);

export type TopicKind = "theory" | "practice";
/** Qué tipos de trabajo (teoría, práctica) tiene cada tema de la semana, según los bloques del reparto (sin bloques: teoría). */
export function topicKindsByFolder(m: Pick<AgendaModel, "schedule">, week: number): Map<string, Set<TopicKind>> {
  const out = new Map<string, Set<TopicKind>>();
  for (const d of m.schedule.days) {
    if (d.week !== week) continue;
    for (const b of d.blocks ?? []) for (const i of b.items) (out.get(i.folder) ?? out.set(i.folder, new Set()).get(i.folder)!).add(b.kind === "practice" ? "practice" : "theory");
  }
  return out;
}

export interface Fraction {
  done: number;
  total: number;
}
export interface WeekCompletion {
  topics: Fraction;
  theory: Fraction;
  practice: Fraction;
  katas: Fraction;
  /** proyectos diarios (entregables de ese tipo de la semana) */
  projects: Fraction;
}

/** El tema cuenta como hecho si el reparto lo da por hecho o la práctica lo marca completo (la misma regla que la lista de la semana). */
export const weekTopicDone = (m: Pick<AgendaModel, "topicByFolder">, t: { folder: string; done: boolean }): boolean => t.done || m.topicByFolder.get(t.folder)?.state === "completo";

/**
 * Las cifras de CUMPLIMIENTO de una semana: cuántos temas están hechos (en total, con teoría y con práctica), katas hechos y proyectos diarios
 * entregados. Salen del reparto compartido (`byWeekArea`) y de los entregables; nunca de horas planeadas. `only` = `scopeOnly` del alcance.
 */
export function weekCompletion(m: AgendaModel, only: string | null, week: number): WeekCompletion {
  const w = m.byWeekArea.weeks[week - 1];
  const empty: WeekCompletion = { topics: { done: 0, total: 0 }, theory: { done: 0, total: 0 }, practice: { done: 0, total: 0 }, katas: { done: 0, total: 0 }, projects: { done: 0, total: 0 } };
  if (!w) return empty;
  const list = [...(only === BASES_KEY ? [] : w.cells.filter((c) => only === null || c.subplanId === only).flatMap((c) => c.topics)), ...(only === null || only === BASES_KEY ? w.bases : [])];
  const kinds = topicKindsByFolder(m, week);
  const count = (pick: (t: (typeof list)[number]) => boolean): Fraction => {
    const sel = list.filter(pick);
    return { total: sel.length, done: sel.filter((t) => weekTopicDone(m, t)).length };
  };
  const has = (k: TopicKind) => (t: { folder: string }): boolean => {
    const ks = kinds.get(t.folder);
    return k === "theory" ? !ks || ks.size === 0 || ks.has("theory") : !!ks?.has("practice");
  };
  const days = m.schedule.days.filter((d) => d.week === week);
  const katas: Fraction = { done: 0, total: 0 };
  if (only === null) {
    for (const d of days) {
      if (!d.practice.kata) continue;
      katas.total++;
      if ((m.practiceStatus?.kataDoneDates ?? []).includes(d.date)) katas.done++;
    }
  }
  const projects: Fraction = { done: 0, total: 0 };
  if (m.deliverablesDefined && days.length && only !== BASES_KEY) {
    const from = days[0]!.date;
    const to = days[days.length - 1]!.date;
    const areaId = only ? m.plan.subplans.find((s) => s.id === only)?.areaId : undefined;
    for (const d of m.deliverables) {
      if (d.kind !== "daily_project" || d.dueDate < from || d.dueDate > to) continue;
      if (only !== null && !(areaId && deliverableInArea(d, areaId))) continue;
      projects.total++;
      if (d.status === "hecho") projects.done++;
    }
  }
  return { topics: count(() => true), theory: count(has("theory")), practice: count(has("practice")), katas, projects };
}
