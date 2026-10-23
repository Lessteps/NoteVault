// Vistas de planificación POR ÁREA del Plan del Mentor: temas de cada semana separados por área, orden fijo de las áreas, estado de los
// entregables («por definir» hasta que se ejecuta el plan) y vista previa de «todas las áreas desde el día 1».
//
// Módulo PURO y compartido (núcleo, API y renderer): sin node:* ni DOM. Todo sale del reparto diario de `planSchedule.ts`, así que el «día
// asignado» de cada tema es exactamente el que enseña la Agenda.

import { planTogetherPhases, type AreaPhase } from "./planAreas.js";
import { buildSchedule, type PlanSchedule, type SchedulePlan, type ScheduleDay, type ScheduleTopic } from "./planSchedule.js";
import type { PlanDeliverable } from "./planAreas.js";
import type { BlockItem, BlockKind } from "./planDayFocus.js";
import { isLive } from "./planRoute.js";
import { weekRangesOf } from "./planTime.js";

/** Orden fijo de las áreas en todas las vistas por área: Backend · Frontend · Databases · Tooling and Quality · Automation (y luego las demás). */
export const AREA_DISPLAY_ORDER: readonly string[] = ["backend", "frontend", "databases", "logic", "tooling", "automation", "desktop", "mobile"];

/** Posición de un área en el orden fijo (las propias del usuario van después, en el orden del plan). */
export const areaRank = (areaId: string | undefined): number => {
  const i = AREA_DISPLAY_ORDER.indexOf(areaId ?? "");
  return i >= 0 ? i : AREA_DISPLAY_ORDER.length;
};

export interface OrderedArea {
  subplanId: string;
  areaId?: string;
  area: string;
}

/** Las áreas del plan en el orden fijo (estable: las que no tienen orden conservan el del plan). */
export function orderedAreas(plan: Pick<SchedulePlan, "subplans">): OrderedArea[] {
  return plan.subplans
    .map((s, i) => ({ s, i }))
    .sort((a, b) => areaRank(a.s.areaId) - areaRank(b.s.areaId) || a.i - b.i)
    .map(({ s }) => ({ subplanId: s.id, ...(s.areaId ? { areaId: s.areaId } : {}), area: s.area }));
}

// ── Atribución de temas: UNA sola regla para la Agenda y la Ejecución ───

/**
 * LA REGLA (la deciden estas funciones y nadie más): los temas de un ÁREA son los de su propio subplan (`subplanId` de origen) SIN los
 * fundamentos; los fundamentos («Bases»: temas de un grupo de tipo `bases`, que el reparto marca `applied`) forman un cubo aparte y se intercalan
 * en todas las áreas sin ser de ninguna. La Agenda (Día, Semana, Mes, Calendario) y la Ejecución (Hoy, Temas de hoy/semana, Bases) usan esto.
 *
 * Canónico: el REPARTO manda en las FECHAS (qué día toca cada tema) y la RUTA (`areaRouteTopics`) en la PERTENENCIA (qué temas son del área).
 * Todo tema de la ruta aparece en el reparto (los completados, el día en que se completaron; los que no caben, apilados al final del plan);
 * `unscheduled` recoge los que, aun así, no tienen ningún día. Lo único propio de la Ejecución es «Toca ahora»: temas YA repartidos en días
 * anteriores que siguen abiertos (la Agenda los enseña en su día original).
 */
export interface TopicRef {
  subplanId: string;
  group?: string;
  applied?: boolean;
}

/** ¿Es un tema de fundamentos (Bases)? Marcado por el reparto (`applied`) o por su grupo en el plan (así vale también sin agenda por enfoque). */
export function basesClassifier(plan: Pick<SchedulePlan, "subplans">): (t: TopicRef) => boolean {
  const bases = new Set(plan.subplans.flatMap((s) => (s.groups ?? []).filter((g) => g.kind === "bases").map((g) => `${s.id}|${g.id}`)));
  return (t) => !!t.applied || (!!t.group && bases.has(`${t.subplanId}|${t.group}`));
}

/** La ruta de un área: sus temas vivos (no omitidos) sin los fundamentos, en el orden guardado. */
export function areaRouteTopics(plan: Pick<SchedulePlan, "subplans">, subplanId: string): ScheduleTopic[] {
  const sub = plan.subplans.find((x) => x.id === subplanId);
  if (!sub) return [];
  const isBases = basesClassifier(plan);
  return sub.topics.filter((t) => isLive(t) && !isBases({ subplanId, ...(t.group ? { group: t.group } : {}) }));
}

/** La ruta de los fundamentos (Bases): los temas vivos de los grupos `bases` de todos los subplans, sin repetirse. */
export function basesRouteTopics(plan: Pick<SchedulePlan, "subplans">): ScheduleTopic[] {
  const isBases = basesClassifier(plan);
  const seen = new Set<string>();
  const out: ScheduleTopic[] = [];
  for (const s of plan.subplans) {
    for (const t of s.topics) {
      if (!isLive(t) || seen.has(t.folder) || !isBases({ subplanId: s.id, ...(t.group ? { group: t.group } : {}) })) continue;
      seen.add(t.folder);
      out.push(t);
    }
  }
  return out;
}

// ── Temas por semana y área ─────────────────────────────────────────────

export interface WeekAreaTopic {
  folder: string;
  title: string;
  /** minutos de este tema en ESA semana */
  minutes: number;
  done: boolean;
  /** días (AAAA-MM-DD) de la semana en que se trabaja, en orden */
  dates: string[];
  group?: string;
  groupTitle?: string;
}

export interface WeekAreaCell extends OrderedArea {
  topics: WeekAreaTopic[];
  minutes: number;
  done: number;
  /** el área está dentro de su fase en esa semana (aunque no tenga temas nuevos: repaso o mantenimiento) */
  active: boolean;
  /** sin temas nuevos pero con repaso y práctica de mantenimiento esos días (el área ya terminó y Automation, al final, sigue activa) */
  review: boolean;
}

export interface WeekAreas {
  week: number;
  start: string;
  end: string;
  cells: WeekAreaCell[];
  /** los fundamentos (Bases) de la semana: cubo aparte, no cuentan en ningún área */
  bases: WeekAreaTopic[];
  /** temas distintos de la semana (suma de las celdas) */
  topics: number;
  minutes: number;
}

export interface TopicsByWeekArea {
  areas: OrderedArea[];
  weeks: WeekAreas[];
  /** totales por área (subplanId): temas distintos del plan y minutos repartidos */
  totals: Record<string, { topics: number; minutes: number; done: number }>;
  /** totales de los fundamentos (Bases) del plan */
  basesTotal: { topics: number; minutes: number; done: number };
  /** temas de la ruta de cada área (y de `bases`) que el reparto no coloca en ningún día (normalmente vacío) */
  unscheduled: Record<string, Array<{ folder: string; title: string }>>;
}

/**
 * Los temas de cada semana SEPARADOS POR ÁREA: una celda por área (en el orden fijo) con su lista de temas (estado y días asignados), nº de
 * temas y horas, y totales por área. Un tema que abarca varias semanas aparece en cada una de ellas (cuenta una vez por semana y una vez en
 * el total del área). Determinista: sale del reparto diario del plan.
 */
export function topicsByWeekArea(plan: SchedulePlan, schedule?: PlanSchedule): TopicsByWeekArea {
  const sch = schedule ?? buildSchedule(plan);
  const areas = orderedAreas(plan);
  const ranges = weekRangesOf(plan.start, plan.end);
  const phaseOf = new Map(plan.subplans.map((s) => [s.id, s.phase] as const));
  const isBases = basesClassifier(plan);
  /** los temas distintos de los días de una semana que cumplen `pick` (un tema que abarca varios días suma sus minutos) */
  const collect = (days: ScheduleDay[], pick: (t: ScheduleDay["topics"][number]) => boolean): WeekAreaTopic[] => {
    const byFolder = new Map<string, WeekAreaTopic>();
    for (const d of days) {
      for (const t of d.topics) {
        if (!pick(t)) continue;
        const e = byFolder.get(t.folder) ?? { folder: t.folder, title: t.title, minutes: 0, done: t.done, dates: [], ...(t.group ? { group: t.group, groupTitle: t.groupTitle ?? t.group } : {}) };
        e.minutes += t.minutes;
        e.done = e.done && t.done;
        if (!e.dates.includes(d.date)) e.dates.push(d.date);
        byFolder.set(t.folder, e);
      }
    }
    return [...byFolder.values()].sort((x, y) => (x.dates[0] ?? "").localeCompare(y.dates[0] ?? ""));
  };
  const weeks: WeekAreas[] = ranges.map((r, wi) => {
    const week = wi + 1;
    const days = sch.days.filter((d) => d.week === week);
    const cells: WeekAreaCell[] = areas.map((a) => {
      const topics = collect(days, (t) => t.subplanId === a.subplanId && !isBases(t));
      const ph = phaseOf.get(a.subplanId);
      const review = topics.length === 0 && days.some((d) => (d.blocks ?? []).some((b) => b.subplanId === a.subplanId && b.status === "review" && b.minutes > 0));
      return { ...a, review, topics, minutes: topics.reduce((n, t) => n + t.minutes, 0), done: topics.filter((t) => t.done).length, active: !ph || (week >= ph.fromWeek && week <= ph.toWeek) };
    });
    return { week, start: r.start, end: r.end, cells, bases: collect(days, isBases), topics: cells.reduce((n, c) => n + c.topics.length, 0), minutes: cells.reduce((n, c) => n + c.minutes, 0) };
  });
  const totals: TopicsByWeekArea["totals"] = {};
  for (const a of areas) {
    const folders = new Map<string, boolean>();
    let minutes = 0;
    for (const w of weeks) {
      const c = w.cells.find((x) => x.subplanId === a.subplanId)!;
      minutes += c.minutes;
      for (const t of c.topics) folders.set(t.folder, (folders.get(t.folder) ?? true) && t.done);
    }
    totals[a.subplanId] = { topics: folders.size, minutes, done: [...folders.values()].filter(Boolean).length };
  }
  const baseFolders = new Map<string, boolean>();
  let baseMinutes = 0;
  for (const w of weeks) {
    for (const t of w.bases) {
      baseMinutes += t.minutes;
      baseFolders.set(t.folder, (baseFolders.get(t.folder) ?? true) && t.done);
    }
  }
  // pertenencia por la ruta: todo tema de la ruta debe tener algún día en el reparto
  const placed = new Set(sch.days.flatMap((d) => d.topics.map((t) => t.folder)));
  const lost = (list: ScheduleTopic[]): Array<{ folder: string; title: string }> => list.filter((t) => !placed.has(t.folder)).map((t) => ({ folder: t.folder, title: t.title }));
  const unscheduled: TopicsByWeekArea["unscheduled"] = { bases: lost(basesRouteTopics(plan)) };
  for (const a of areas) unscheduled[a.subplanId] = lost(areaRouteTopics(plan, a.subplanId));
  return { areas, weeks, totals, basesTotal: { topics: baseFolders.size, minutes: baseMinutes, done: [...baseFolders.values()].filter(Boolean).length }, unscheduled };
}

/** Los temas de UNA semana separados por área (atajo de `topicsByWeekArea` para las vistas Semana y Mes). */
export function weekAreas(plan: SchedulePlan, week: number, schedule?: PlanSchedule): WeekAreas | undefined {
  return topicsByWeekArea(plan, schedule).weeks[week - 1];
}

// ── Entregables por definir ─────────────────────────────────────────────

/** Lo mínimo del plan que hace falta para saber si hay entregables definidos (cumplen `Plan` y `MentorPlan`). */
export interface DeliverableStateInput {
  deliverables?: ReadonlyArray<unknown>;
  subplans: ReadonlyArray<{ deliverable?: unknown }>;
  practiceCurriculum?: unknown;
}

/**
 * ¿Hay entregables DEFINIDOS? Los entregables dependen del sistema de práctica y de los proyectos que se definen al ejecutar el plan, así
 * que mientras no haya ninguno definido se muestran «por definir». Están definidos cuando hay entregables manuales o extra
 * (`Plan.deliverables`), proyectos de área (`Subplan.deliverable`), un currículo de práctica generado, o cuando la ejecución del plan los
 * dejó definidos (`deliverablesDefinedAt`, `executedAt` o un sistema de práctica por área: campos opcionales del otro flujo, leídos con
 * tolerancia).
 */
export function deliverablesDefined(plan: DeliverableStateInput): boolean {
  const p = plan as DeliverableStateInput & { deliverablesDefinedAt?: unknown; executedAt?: unknown; areaPractice?: unknown; practiceSystem?: unknown };
  if ((p.deliverables?.length ?? 0) > 0) return true;
  if (p.subplans.some((s) => !!s.deliverable)) return true;
  if (p.practiceCurriculum) return true;
  return !!(p.deliverablesDefinedAt || p.executedAt || p.areaPractice || p.practiceSystem);
}

export const DELIVERABLES_PENDING_TEXT = "Aún sin definir: se definen al ejecutar el plan (o puedes pedirlos en «Preguntas y ajustes»).";

// ── «Todas las áreas desde el día 1»: vista previa ──────────────────────

export interface AreaWeeksRow {
  subplanId: string;
  areaId?: string;
  area: string;
  fromWeek: number;
  toWeek: number;
  weeks: number;
  /** modo juntas: el área sigue ACTIVA (repaso y práctica de mantenimiento) hasta esta semana aunque sus temas nuevos acaben en `toWeek` */
  activeToWeek?: number;
}

/** Semanas activas de cada área hoy (su fase; sin fase, el rango de sus semanas objetivo), en el orden fijo. */
export function areaWeeksOf(plan: SchedulePlan): AreaWeeksRow[] {
  const W = weekRangesOf(plan.start, plan.end).length;
  return orderedAreas(plan).map((a) => {
    const s = plan.subplans.find((x) => x.id === a.subplanId)!;
    const ws = s.topics.map((t) => t.targetWeek);
    const from = s.phase?.fromWeek ?? (ws.length ? Math.min(...ws) : 1);
    const to = s.phase?.toWeek ?? (ws.length ? Math.max(...ws) : W);
    return { ...a, fromWeek: from, toWeek: to, weeks: Math.max(1, to - from + 1) };
  });
}

/**
 * Las fases que tendría el plan con TODAS las áreas desde el día 1 (Automation al final), calculadas con la misma regla y la capacidad
 * semanal real del reparto actual. Es una estimación para la confirmación: la operación real (`set_area_mode`) recalcula todo el plan.
 */
export function previewTogether(plan: SchedulePlan, schedule?: PlanSchedule): AreaWeeksRow[] {
  const sch = schedule ?? buildSchedule(plan);
  const W = weekRangesOf(plan.start, plan.end).length;
  const caps = Array.from({ length: W }, () => 0);
  for (const d of sch.days) caps[d.week - 1] = (caps[d.week - 1] ?? 0) + d.capacityMinutes;
  const weight = (id: string): number => plan.subplans.find((s) => s.id === id)!.topics.filter((t) => isLive(t) && !t.completedAt).reduce((n, t) => n + t.estMinutes, 0);
  const result = planTogetherPhases(plan.subplans.map((s) => ({ key: s.id, weight: Math.max(1, weight(s.id)), ...(s.areaId ? { areaId: s.areaId } : {}) })), caps);
  return orderedAreas(plan).map((a) => {
    const ph: AreaPhase = result[a.subplanId] ?? { fromWeek: 1, toWeek: W };
    const maintained = a.areaId !== "automation" && ph.toWeek < W && plan.subplans.some((s) => s.areaId === "automation");
    return { ...a, fromWeek: ph.fromWeek, toWeek: ph.toWeek, weeks: ph.toWeek - ph.fromWeek + 1, ...(maintained ? { activeToWeek: W } : {}) };
  });
}

/** ¿El plan estudia las áreas por fases y tiene 2 o más áreas? (entonces se ofrece «Poner todas las áreas desde el día 1»). */
export function offersTogether(plan: Pick<SchedulePlan, "structure" | "subplans" | "areaMode" | "preconditions">): boolean {
  if (plan.structure !== "areas" || plan.subplans.filter((s) => s.areaId).length < 2) return false;
  return (plan.areaMode ?? (plan.preconditions?.areaMode === "together" ? "together" : "phased")) !== "together";
}

/** Texto de un rango de semanas: «semanas 1–17 (17)» / «semana 24». */
export const weeksRangeText = (r: Pick<AreaWeeksRow, "fromWeek" | "toWeek">): string => (r.fromWeek === r.toWeek ? `semana ${r.fromWeek}` : `semanas ${r.fromWeek}–${r.toWeek}`);

// ── El día por área ─────────────────────────────────────────────────────

/** Nombre corto de un área para las celdas del calendario («Back», «Front», «BD»…): el texto siempre acompaña al color. */
export const AREA_SHORT: Readonly<Record<string, string>> = { backend: "Back", frontend: "Front", databases: "BD", logic: "Lóg", tooling: "Tool", automation: "Auto", desktop: "Desk", mobile: "Móvil" };
export const areaShort = (areaId: string | undefined, name: string): string => (areaId && AREA_SHORT[areaId]) || name.replace(/^[\d.\s_-]+/, "").slice(0, 5);

/** Lo que un área tiene en UN día: teoría, práctica del área y proyecto del área (los proyectos integradores van aparte, al final). */
export interface DayAreaEntry extends OrderedArea {
  /** temas distintos de teoría y minutos de teoría */
  theoryTopics: number;
  theoryMinutes: number;
  /** bloques de práctica propios del área (sin la práctica diaria de lenguaje) y sus minutos */
  practiceBlocks: number;
  practiceMinutes: number;
  /** temas distintos del área ese día (teoría y práctica) */
  topics: number;
  /** hay un proyecto propio del área ese día (proyecto del tema o entregable de área) */
  project: boolean;
  /** los bloques del área (teoría y práctica), en el orden de la plantilla */
  blocks: ScheduleDay["blocks"];
}

/**
 * El día separado POR ÁREA, en el orden fijo (Backend · Frontend · Databases · Tooling and Quality · Automation): cada área con su teoría, su
 * práctica y su proyecto. Las áreas sin bloques con contenido (todos omitidos) no aparecen. La práctica diaria de lenguaje no es de ningún
 * área: se muestra aparte. Sin agenda por enfoque (planes antiguos) se agrupa por los temas del día.
 */
export function dayByArea(plan: Pick<SchedulePlan, "subplans">, day: ScheduleDay, due: readonly PlanDeliverable[] = []): DayAreaEntry[] {
  const areas = orderedAreas(plan);
  const bySub = new Map(areas.map((a) => [a.subplanId, a] as const));
  const byAreaId = new Map(areas.filter((a) => a.areaId).map((a) => [a.areaId!, a] as const));
  const ownerOf = (b: { subplanId?: string; areaId?: string }): OrderedArea | undefined => (b.subplanId ? bySub.get(b.subplanId) : undefined) ?? (b.areaId ? byAreaId.get(b.areaId) : undefined);
  const isBases = basesClassifier(plan);
  const out: DayAreaEntry[] = [];
  for (const a of areas) {
    // los bloques del área llevan SOLO temas del área: los fundamentos intercalados en ellos van al cubo de `dayBases` (un bloque que solo
    // llevaba fundamentos desaparece del área y sus minutos se descuentan)
    const blocks = (day.blocks ?? [])
      .filter((b) => !b.daily && b.status !== "omitted" && ownerOf(b)?.subplanId === a.subplanId)
      .map((b) => {
        const items = b.items.filter((i) => !isBases(i));
        return items.length === b.items.length ? b : { ...b, items, minutes: items.reduce((n, i) => n + i.minutes, 0) };
      })
      .filter((b) => b.items.length > 0 || b.status !== "topic");
    const topicsOnly = !day.blocks?.length ? day.topics.filter((t) => t.subplanId === a.subplanId && !t.done && !isBases(t)) : [];
    if (!blocks.length && !topicsOnly.length) continue;
    const theory = blocks.filter((b) => b.kind === "theory");
    const practice = blocks.filter((b) => b.kind === "practice");
    const folders = new Set(blocks.flatMap((b) => b.items.map((i) => i.folder)));
    for (const t of topicsOnly) folders.add(t.folder);
    const theoryFolders = new Set(theory.flatMap((b) => b.items.map((i) => i.folder)));
    out.push({
      ...a,
      theoryTopics: theoryFolders.size || (topicsOnly.length ? topicsOnly.length : 0),
      theoryMinutes: theory.reduce((n, b) => n + b.minutes, 0),
      practiceBlocks: practice.length,
      practiceMinutes: practice.reduce((n, b) => n + b.minutes, 0),
      topics: folders.size,
      project: (day.topicProjects ?? []).some((tp) => tp.subplanId === a.subplanId) || due.some((d) => d.kind === "area_project" && d.areaId === a.areaId),
      blocks,
    });
  }
  return out;
}

/** Un fundamento (Bases) de un día: el tema (una vez por parte) y el tipo de bloque en que se trabaja (teoría, práctica o ambos). */
export interface DayBasesItem extends BlockItem {
  kinds: BlockKind[];
}

/**
 * Los fundamentos (Bases) de UN día, sin repetirse: el cubo aparte de `dayByArea` (que los saca de los bloques de cada área). Sin agenda por
 * enfoque (planes antiguos) salen de los temas del día.
 */
export function dayBases(plan: Pick<SchedulePlan, "subplans">, day: ScheduleDay): DayBasesItem[] {
  const isBases = basesClassifier(plan);
  const out = new Map<string, DayBasesItem>();
  if (day.blocks?.length) {
    for (const b of day.blocks) {
      if (b.daily || b.status === "omitted") continue;
      for (const i of b.items) {
        if (!isBases(i)) continue;
        const key = `${i.folder}:${i.part}`;
        const e = out.get(key) ?? { ...i, kinds: [] };
        if (!e.kinds.includes(b.kind)) e.kinds.push(b.kind);
        out.set(key, e);
      }
    }
  } else {
    for (const t of day.topics) {
      if (!isBases(t) || t.done) continue;
      out.set(`${t.folder}:${t.part}`, { subplanId: t.subplanId, area: t.area, ...(t.areaId ? { areaId: t.areaId } : {}), folder: t.folder, title: t.title, minutes: t.minutes, part: t.part, parts: t.parts, ...(t.group ? { group: t.group } : {}), applied: true, kinds: [] });
    }
  }
  return [...out.values()];
}

const plural1 =(n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/** «Backend 2 temas y práctica; Frontend 1 tema y práctica» (etiqueta accesible de un día: el desglose por área). */
export function dayAreasText(entries: readonly DayAreaEntry[]): string {
  return entries
    .map((e) => {
      const bits = [e.theoryTopics > 0 ? plural1(e.theoryTopics, "tema", "temas") : e.topics > 0 ? plural1(e.topics, "tema", "temas") : "repaso", ...(e.practiceBlocks > 0 ? ["práctica"] : []), ...(e.project ? ["proyecto"] : [])];
      return `${e.area} ${bits.join(" y ")}`;
    })
    .join("; ");
}
