// CADENA DE ENTREGABLES del plan: proyecto DIARIO → SEMANAL → MENSUAL (= el ENTREGABLE del mes). Cada pieza diaria es una parte explícita del
// proyecto de su semana y cada proyecto semanal es una parte explícita del proyecto del mes; hay UN proyecto por mes del plan.
//
//  · DEFINICIÓN (determinista, sin IA): sale del reparto del plan (días de estudio, enfoques, temas de cada día) y de las plantillas del
//    sistema de práctica de cada área (`planAreaPractice.ts`). Misma entrada → misma cadena; nada se guarda aparte.
//  · MES DEL PLAN: ventanas «de aniversario» a partir del inicio (6 oct → 5 nov, 6 nov → 5 dic…). Cada semana pertenece a UN solo mes (el de
//    su día central); una última ventana de menos de dos semanas se une a la anterior.
//  · AVANCE (derivado, NUNCA manual): una pieza diaria está hecha cuando el estudiante completa las casillas de su carpeta de proyecto
//    (`mentor_projects_list`); la semana está hecha cuando lo están todas sus piezas (o sus fases de práctica), y el mes cuando lo están
//    todas sus semanas. Un mes/semana sin empezar queda BLOQUEADO hasta completar el anterior.
//
// Módulo PURO y compartido (núcleo, API y renderer): sin node:* ni DOM.

import { addDays, addMonthsToDate, daysBetween, weekRangesOf } from "./planTime.js";
import type { PlanDeliverableStatus } from "./planAreas.js";
import { areaPracticeOf, integratedMonthly, monthlyPieceOf } from "./planAreaPractice.js";
import { dailyProjectOf, shortOf, weeklyProjectOf, type DayProject } from "./planCurriculum.js";
import type { PlanSchedule, SchedulePlan } from "./planSchedule.js";

/** Lo que el estudiante ha completado (las ÚNICAS entradas del avance). */
export interface ChainSignals {
  /** por fecha (AAAA-MM-DD): áreas cuya carpeta de proyecto diario de ese día está completa (todas sus casillas marcadas) */
  dailyProjectDone?: Readonly<Record<string, readonly string[]>>;
  /** semanas cuyas fases de práctica (especificar, construir, defender, postmortem) están todas hechas */
  weeksDone?: ReadonlySet<number>;
}

export interface ChainPiece {
  id: string;
  date: string;
  /** posición dentro de su semana (1..of) */
  n: number;
  of: number;
  title: string;
  description: string;
  /** «Pieza 2 de 5 del proyecto semanal 3 (API completa)» */
  slice: string;
  areaIds: string[];
  done: boolean;
  status: PlanDeliverableStatus;
  /** la primera pieza sin hacer de todo el plan: la que toca */
  current: boolean;
}

export interface ChainWeek {
  /** `wp:<n>` / `ww:<n>`: el mismo id del entregable semanal */
  id: string;
  week: number;
  /** posición dentro de su mes (1..of) */
  n: number;
  of: number;
  start: string;
  end: string;
  dueDate: string;
  title: string;
  description: string;
  /** «Parte 2 de 4 del proyecto del mes: …» */
  slice: string;
  areaIds: string[];
  pieces: ChainPiece[];
  done: number;
  total: number;
  pct: number;
  status: PlanDeliverableStatus;
  /** sin empezar y con una semana anterior sin completar */
  locked: boolean;
  lockedBy?: number;
}

export interface ChainMonth {
  /** `mm:<AAAA-MM del inicio de la ventana>` */
  id: string;
  /** AAAA-MM del inicio de la ventana (clave del currículo mensual) */
  month: string;
  /** posición en el plan (1..of) */
  n: number;
  of: number;
  start: string;
  end: string;
  /** última fecha de estudio del mes: cuándo se entrega */
  dueDate: string;
  title: string;
  /** el objetivo del entregable, con los temas del mes */
  goal: string;
  /** definición de «hecho» */
  criteria: string[];
  areaIds: string[];
  topics: string[];
  source: "ai" | "template";
  weeks: ChainWeek[];
  done: number;
  total: number;
  pct: number;
  weeksDone: number;
  status: PlanDeliverableStatus;
  locked: boolean;
  lockedBy?: number;
}

export interface PlanChain {
  months: ChainMonth[];
  pieces: number;
  weeks: number;
}

const pctOf = (done: number, total: number): number => (total > 0 ? Math.round((done / total) * 100) : 0);
const statusOf = (done: number, total: number, any: boolean): PlanDeliverableStatus => (total > 0 && done >= total ? "hecho" : done > 0 || any ? "en_curso" : "pendiente");
const list = (xs: readonly string[]): string => (xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} y ${xs[xs.length - 1]}`);

/** ¿Hecha la pieza de un día? Todas las áreas del día con su carpeta completa (sin áreas: cualquiera). */
export function pieceDone(signals: ChainSignals | undefined, date: string, areaIds: readonly string[]): boolean {
  const got = signals?.dailyProjectDone?.[date];
  if (!got?.length) return false;
  return areaIds.length ? areaIds.every((a) => got.includes(a)) : true;
}

/** Ventanas de mes del plan: `[inicio, fin]` de cada mes de aniversario; una cola de menos de 14 días se une a la anterior. */
export function planMonthWindows(plan: Pick<SchedulePlan, "start" | "end">): Array<{ start: string; end: string }> {
  const out: Array<{ start: string; end: string }> = [];
  for (let i = 0; i < 60; i++) {
    const start = addMonthsToDate(plan.start, i);
    if (start > plan.end) break;
    const end = addDays(addMonthsToDate(plan.start, i + 1), -1);
    out.push({ start, end: end > plan.end ? plan.end : end });
  }
  if (out.length > 1 && daysBetween(out[out.length - 1]!.start, plan.end) + 1 < 14) {
    const last = out.pop()!;
    out[out.length - 1] = { start: out[out.length - 1]!.start, end: last.end };
  }
  return out;
}

/** El mes (índice de ventana) al que pertenece una semana del plan: el de su día central. */
function windowOfWeek(w: { start: string; days: number }, windows: ReadonlyArray<{ start: string; end: string }>): number {
  const mid = addDays(w.start, Math.floor((w.days - 1) / 2));
  const i = windows.findIndex((x) => mid >= x.start && mid <= x.end);
  return i >= 0 ? i : mid < windows[0]!.start ? 0 : windows.length - 1;
}

/**
 * La cadena completa del plan. Solo planes por áreas (`structure: "areas"`) tienen proyecto diario; en el resto devuelve una cadena vacía.
 * `signals` es lo único que mueve el avance.
 */
export function planChain(plan: SchedulePlan, sch: PlanSchedule, signals?: ChainSignals): PlanChain {
  if (plan.structure !== "areas") return { months: [], pieces: 0, weeks: 0 };
  const windows = planMonthWindows(plan);
  const ranges = weekRangesOf(plan.start, plan.end);
  const cur = plan.practiceCurriculum?.monthly ?? [];

  // 1 · semanas con sus piezas diarias, agrupadas por mes
  type RawWeek = { range: (typeof ranges)[number]; wp: NonNullable<ReturnType<typeof weeklyProjectOf>>; dailies: DayProject[] };
  const byMonth: RawWeek[][] = windows.map(() => []);
  for (const range of ranges) {
    const wp = weeklyProjectOf(plan, sch, range.week);
    if (!wp) continue;
    const dailies = sch.days.filter((d) => d.week === range.week).map((d) => dailyProjectOf(plan, sch, d)).filter((x): x is DayProject => !!x);
    byMonth[windowOfWeek(range, windows)]!.push({ range, wp, dailies });
  }
  const used = windows.map((w, i) => ({ w, i })).filter((x) => byMonth[x.i]!.length > 0);

  // 2 · definición + avance
  const months: ChainMonth[] = [];
  let currentTaken = false;
  used.forEach(({ w, i }, mi) => {
    const raws = byMonth[i]!;
    const key = w.start.slice(0, 7);
    const dayList = sch.days.filter((d) => raws.some((r) => r.range.week === d.week));
    const focusIds = [...new Set(dayList.map((d) => d.focus?.id).filter((x): x is string => !!x))];
    const focusLabels = [...new Set(dayList.map((d) => d.focus?.label).filter((x): x is string => !!x))];
    const areaIds = [...new Set(raws.flatMap((r) => r.wp.areaIds))];
    const together = dayList.some((d) => d.focus?.together);
    const topics = [...new Set(dayList.flatMap((d) => d.topics.map((t) => shortOf(t.title))))];
    const c = cur.find((x) => x.month === key);
    const sys = together && areaIds.length > 1 ? integratedMonthly(areaIds, key) : focusIds.length === 1 ? monthlyPieceOf(focusIds[0]!, key) : null;
    const baseTitle = c?.title ?? (sys ? sys.title.replace(/ · \d{4}-\d{2}$/, "") : focusLabels.length ? `Integración de ${list(focusLabels.slice(0, 3))}` : "Proyecto integrador");
    const withAreas = !c && sys && focusLabels.length && !sys.title.includes("del mes") ? `${baseTitle} · ${list(focusLabels.slice(0, 3))}` : baseTitle;
    const title = c?.title ? c.title : `Mes ${mi + 1} · ${withAreas}`;
    const nPieces = raws.reduce((n, r) => n + r.dailies.length, 0);
    const baseGoal = c?.description ?? sys?.description ?? "Un proyecto mayor que integra los proyectos semanales del mes.";
    const goal = `${baseGoal}${topics.length ? ` Este mes aplicas: ${topics.slice(0, 5).join(", ")}${topics.length > 5 ? "…" : ""}.` : ""}`.slice(0, 700);
    const measures = [...new Set(areaIds.map((a) => areaPracticeOf(a)?.measure).filter((x): x is string => !!x))].slice(0, 3);

    let monthDone = 0;
    let monthTotal = 0;
    let weeksFinished = 0;
    const weeks: ChainWeek[] = raws.map((r, wi) => {
      const pieces: ChainPiece[] = r.dailies.map((d, pi) => {
        const done = pieceDone(signals, d.date, d.areaIds);
        const current = !done && !currentTaken;
        if (current) currentTaken = true;
        return {
          id: d.id,
          date: d.date,
          n: pi + 1,
          of: r.dailies.length,
          title: d.title,
          description: d.description,
          slice: `Pieza ${pi + 1} de ${r.dailies.length} del proyecto semanal ${r.range.week}: ${d.piece}.`,
          areaIds: d.areaIds,
          done,
          status: done ? "hecho" : "pendiente",
          current,
        };
      });
      const phasesDone = !!signals?.weeksDone?.has(r.range.week);
      const done = phasesDone ? pieces.length : pieces.filter((p) => p.done).length;
      const total = pieces.length;
      const finished = phasesDone || (total > 0 && done >= total);
      if (finished) weeksFinished++;
      monthDone += done;
      monthTotal += total;
      const studyDays = pieces.map((p) => p.date);
      return {
        id: r.wp.id,
        week: r.range.week,
        n: wi + 1,
        of: raws.length,
        start: r.range.start,
        end: r.range.end,
        dueDate: studyDays[studyDays.length - 1] ?? r.range.end,
        title: r.wp.title,
        description: r.wp.description,
        slice: `Parte ${wi + 1} de ${raws.length} del proyecto del mes «${withAreas}»${pieces.length ? `: ${list(r.dailies.map((d) => d.piece).slice(0, 3))}${pieces.length > 3 ? "…" : ""}` : ""}.`,
        areaIds: r.wp.areaIds,
        pieces,
        done,
        total,
        pct: finished ? 100 : pctOf(done, total),
        status: finished ? "hecho" : statusOf(done, total, false),
        locked: false,
      } satisfies ChainWeek;
    });
    months.push({
      id: `mm:${key}`,
      month: key,
      n: mi + 1,
      of: used.length,
      start: w.start,
      end: w.end,
      dueDate: weeks.flatMap((x) => x.pieces.map((p) => p.date)).at(-1) ?? weeks.at(-1)?.end ?? w.end,
      title,
      goal,
      criteria: [
        `Integra los ${weeks.length} proyectos semanales del mes (semanas ${weeks[0]!.week}–${weeks[weeks.length - 1]!.week}) en un solo proyecto que funciona de principio a fin`,
        ...measures,
        `Se completa cuando terminas las ${nPieces} piezas diarias del mes: no se marca a mano`,
        "Puedes ejecutarlo y explicarlo sin ayuda",
      ],
      areaIds,
      topics,
      source: c ? (c.source === "ai" ? "ai" : "template") : "template",
      weeks,
      done: monthDone,
      total: monthTotal,
      pct: weeksFinished === weeks.length ? 100 : pctOf(monthDone, monthTotal),
      weeksDone: weeksFinished,
      status: weeksFinished === weeks.length ? "hecho" : statusOf(monthDone, monthTotal, weeksFinished > 0),
      locked: false,
    });
  });

  // 3 · desbloqueo en orden: una semana / un mes sin empezar queda bloqueado hasta completar el anterior
  let prevWeek: ChainWeek | undefined;
  let prevMonth: ChainMonth | undefined;
  for (const m of months) {
    if (prevMonth && prevMonth.status !== "hecho" && m.done === 0 && m.weeksDone === 0) {
      m.locked = true;
      m.lockedBy = prevMonth.n;
    }
    for (const w of m.weeks) {
      if (prevWeek && prevWeek.status !== "hecho" && w.done === 0) {
        w.locked = true;
        w.lockedBy = prevWeek.week;
      }
      prevWeek = w;
    }
    prevMonth = m;
  }
  return { months, pieces: months.reduce((n, m) => n + m.total, 0), weeks: months.reduce((n, m) => n + m.weeks.length, 0) };
}

/** Las señales de avance a partir del estado de la práctica (fases de cada semana) y de las carpetas de proyecto completas. */
export function chainSignalsOf(practice: { weeks: Array<{ week: number; phases: Record<string, string> }> } | null | undefined, dailyProjectDone?: Record<string, string[]>): ChainSignals {
  return {
    ...(dailyProjectDone ? { dailyProjectDone } : {}),
    weeksDone: new Set((practice?.weeks ?? []).filter((x) => Object.values(x.phases).length > 0 && Object.values(x.phases).every((s) => s === "hecho")).map((x) => x.week)),
  };
}

/** El estado de la práctica más la señal de avance de la cadena (lo único que mueve los entregables), listo para `deliverablesOf`. */
export function practiceWithProgress<P extends { weeks: unknown[] }>(practice: P | null | undefined, dailyProjectDone?: Record<string, string[]>): (P & { dailyProjectDone?: Record<string, string[]> }) | null {
  if (!practice && !dailyProjectDone) return null;
  return { weeks: [], ...(practice ?? {}), ...(dailyProjectDone ? { dailyProjectDone } : {}) } as P & { dailyProjectDone?: Record<string, string[]> };
}

/** Texto de bloqueo: «Bloqueado hasta completar la semana 3». */
export const lockText = (kind: "week" | "month", by: number): string => (kind === "week" ? `Bloqueada hasta completar la semana ${by}` : `Bloqueado hasta completar el mes ${by}`);

/** Etiqueta del avance: «3 de 5 piezas · 60 %». */
export const chainProgressText = (done: number, total: number, noun = "piezas"): string => `${done} de ${total} ${noun}${total ? ` · ${pctOf(done, total)} %` : ""}`;

/** Busca en la cadena por id de entregable (`mm:…`, `wp:`/`ww:` y `dp:`). */
export function chainIndex(chain: PlanChain): { months: Map<string, ChainMonth>; weeks: Map<string, ChainWeek>; pieces: Map<string, ChainPiece> } {
  const months = new Map<string, ChainMonth>();
  const weeks = new Map<string, ChainWeek>();
  const pieces = new Map<string, ChainPiece>();
  for (const m of chain.months) {
    months.set(m.id, m);
    for (const w of m.weeks) {
      weeks.set(w.id, w);
      for (const p of w.pieces) pieces.set(p.id, p);
    }
  }
  return { months, weeks, pieces };
}
