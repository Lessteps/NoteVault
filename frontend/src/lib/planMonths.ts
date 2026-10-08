// Plan del Mentor MES A MES: las fases de las áreas (semanas activas `phase` y semana objetivo de cada tema `targetWeek`) agregadas por
// mes de calendario, para la tabla «Fases del plan» de «Mi plan». También los resúmenes por GRUPO interno de un área (Bases · Lenguaje ·
// Conocimientos) y el aviso de «demasiadas Bases al principio».
//
// Módulo PURO y compartido (renderer y pruebas): sin node:* ni DOM. Determinista: solo depende del plan y de lo que se le pase.
// Una semana del plan pertenece al mes de su día central (en una semana completa, el 4.º día), así cada semana cae en UN solo mes.

import type { AreaGroup, AreaPhase } from "./planAreas.js";
import { addDays, daysBetween, weekRangesOf } from "./planTime.js";

/** Lo mínimo de un plan que hace falta (cumple `MentorPlan` y el `Plan` del núcleo). */
export interface MonthsPlanLike {
  start: string;
  end: string;
  subplans: ReadonlyArray<{
    id: string;
    area: string;
    areaId?: string;
    phase?: AreaPhase;
    groups?: readonly AreaGroup[];
    topics: ReadonlyArray<{ folder: string; title: string; targetWeek: number; estMinutes: number; completedAt?: string; group?: string; route?: string }>;
  }>;
  /** cómo se combinan las áreas, ya decidido (`together` = todas a la vez todo el periodo) */
  areaMode?: "together" | "phased";
  areaModeWhy?: string;
}

export interface PlanMonth {
  /** AAAA-MM */
  key: string;
  /** «oct 2026» */
  label: string;
  /** primer y último día del mes DENTRO del plan */
  start: string;
  end: string;
  /** semanas del plan que caen en este mes */
  weeks: number[];
  current: boolean;
}

export interface MonthCell {
  month: string;
  topics: number;
  done: number;
  minutes: number;
  /** semanas de ese mes en que el área está activa (su fase; sin fase, las semanas con temas) */
  weeks: number[];
  /** grupos internos que se trabajan ese mes (en el orden del área) con cuántos temas */
  groups: Array<{ id: string; title: string; count: number }>;
  /** los primeros títulos del mes, para dar una idea concreta */
  titles: string[];
  /** ni temas ni semanas activas */
  empty: boolean;
}

export interface MonthRow {
  subplanId: string;
  areaId?: string;
  area: string;
  phase?: AreaPhase;
  total: number;
  /** temas fuera de ruta (no cuentan; la nota sigue en la vault) */
  skipped: number;
  cells: MonthCell[];
}

export interface MonthTotal {
  month: string;
  topics: number;
  done: number;
  minutes: number;
  /** entregables que vencen ese mes (null si no se pasaron) */
  deliverables: number | null;
  /** áreas activas ese mes */
  areas: number;
  /** nombres de esas áreas (en el orden del plan): con varias a la vez, el mes es «simultáneo» */
  areaNames: string[];
}

export interface PlanByMonth {
  months: PlanMonth[];
  rows: MonthRow[];
  totals: MonthTotal[];
  /** mes actual (AAAA-MM) si hoy cae dentro del plan */
  current: string | null;
}

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const MONTHS_LONG = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/** «oct 2026» */
export const monthShort = (key: string): string => `${MONTHS[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`;
/** «octubre de 2026» */
export const monthLong = (key: string): string => `${MONTHS_LONG[Number(key.slice(5, 7)) - 1]} de ${key.slice(0, 4)}`;

/** Mes (AAAA-MM) al que pertenece cada semana del plan: el de su día central. */
export function weekMonths(start: string, end: string): Map<number, string> {
  const out = new Map<number, string>();
  for (const w of weekRangesOf(start, end)) out.set(w.week, addDays(w.start, Math.floor((w.days - 1) / 2)).slice(0, 7));
  return out;
}

/** [1,2,3,4] → «1–4»; [1,2,5] → «1–2, 5». */
export function weeksText(weeks: readonly number[]): string {
  const s = [...new Set(weeks)].sort((a, b) => a - b);
  const parts: string[] = [];
  for (let i = 0; i < s.length; ) {
    let j = i;
    while (j + 1 < s.length && s[j + 1] === s[j]! + 1) j++;
    parts.push(i === j ? `${s[i]}` : `${s[i]}–${s[j]}`);
    i = j + 1;
  }
  return parts.join(", ");
}

const groupOrder = (groups: readonly AreaGroup[] | undefined, id: string): number => groups?.find((g) => g.id === id)?.order ?? 1000;
const groupTitle = (groups: readonly AreaGroup[] | undefined, id: string): string => groups?.find((g) => g.id === id)?.title ?? (id ? id : "Temas");

/**
 * Las fases del plan mes a mes: una fila por área, una columna por mes del periodo y una fila de totales. `done` dice si un tema ya está
 * completo (además de `completedAt`); `deliverables` son los entregables del plan con su fecha (para contarlos por mes); `today` marca el
 * mes actual.
 */
export function phasesByMonth(
  plan: MonthsPlanLike,
  opts: { today?: string; done?: (folder: string) => boolean; deliverables?: ReadonlyArray<{ dueDate: string }>; titles?: number } = {},
): PlanByMonth {
  const ranges = weekRangesOf(plan.start, plan.end);
  const wm = weekMonths(plan.start, plan.end);
  const keys: string[] = [];
  for (const w of ranges) {
    const k = wm.get(w.week)!;
    if (!keys.includes(k)) keys.push(k);
  }
  const today = opts.today ?? "";
  const current = today && today >= plan.start && today <= plan.end ? wm.get(Math.floor(daysBetween(plan.start, today) / 7) + 1) ?? null : null;
  const months: PlanMonth[] = keys.map((key) => {
    const weeks = ranges.filter((w) => wm.get(w.week) === key);
    return { key, label: monthShort(key), start: weeks[0]!.start, end: weeks[weeks.length - 1]!.end, weeks: weeks.map((w) => w.week), current: key === current };
  });
  const maxTitles = Math.max(0, opts.titles ?? 3);
  const isDone = (t: { folder: string; completedAt?: string }): boolean => !!t.completedAt || !!opts.done?.(t.folder);
  const clampWeek = (n: number): number => Math.min(ranges.length, Math.max(1, Math.round(n) || 1));

  const rows: MonthRow[] = plan.subplans.map((s) => {
    // los temas fuera de ruta no cuentan en la tabla (se conservan en el plan y en la vault)
    const live = s.topics.filter((t) => t.route !== "skipped");
    const cells = months.map((m): MonthCell => {
      const list = live.filter((t) => wm.get(clampWeek(t.targetWeek)) === m.key);
      const phaseWeeks = s.phase ? m.weeks.filter((w) => w >= s.phase!.fromWeek && w <= s.phase!.toWeek) : [...new Set(list.map((t) => clampWeek(t.targetWeek)))];
      const counts = new Map<string, number>();
      for (const t of list) counts.set(t.group ?? "", (counts.get(t.group ?? "") ?? 0) + 1);
      const groups = [...counts.entries()]
        .sort((a, b) => groupOrder(s.groups, a[0]) - groupOrder(s.groups, b[0]))
        .map(([id, count]) => ({ id, title: groupTitle(s.groups, id), count }));
      return {
        month: m.key,
        topics: list.length,
        done: list.filter(isDone).length,
        minutes: list.reduce((n, t) => n + (t.estMinutes || 0), 0),
        weeks: phaseWeeks.sort((a, b) => a - b),
        groups,
        titles: list.slice(0, maxTitles).map((t) => t.title),
        empty: list.length === 0 && phaseWeeks.length === 0,
      };
    });
    return { subplanId: s.id, ...(s.areaId ? { areaId: s.areaId } : {}), area: s.area, ...(s.phase ? { phase: s.phase } : {}), total: live.length, skipped: s.topics.length - live.length, cells };
  });

  const due = opts.deliverables;
  const totals: MonthTotal[] = months.map((m, i) => ({
    month: m.key,
    topics: rows.reduce((n, r) => n + r.cells[i]!.topics, 0),
    done: rows.reduce((n, r) => n + r.cells[i]!.done, 0),
    minutes: rows.reduce((n, r) => n + r.cells[i]!.minutes, 0),
    deliverables: due ? due.filter((d) => d.dueDate >= m.start && d.dueDate <= m.end).length : null,
    areas: rows.filter((r) => !r.cells[i]!.empty).length,
    areaNames: rows.filter((r) => !r.cells[i]!.empty).map((r) => r.area),
  }));
  return { months, rows, totals, current };
}

// ── Grupos internos de un área ──────────────────────────────────────────

export interface GroupSummary {
  id: string;
  title: string;
  kind: AreaGroup["kind"] | "other";
  total: number;
  done: number;
  minutes: number;
  /** primera y última semana objetivo de sus temas */
  fromWeek: number | null;
  toWeek: number | null;
  /** meses (AAAA-MM) en que caen sus temas */
  months: string[];
}

/** Resumen por grupo interno (en el orden del área). Los temas sin grupo conocido van a «Otros temas». */
export function groupSummaries(
  plan: Pick<MonthsPlanLike, "start" | "end">,
  sub: MonthsPlanLike["subplans"][number],
  done?: (folder: string) => boolean,
): GroupSummary[] {
  const wm = weekMonths(plan.start, plan.end);
  const known = new Set((sub.groups ?? []).map((g) => g.id));
  const defs: Array<{ id: string; title: string; kind: GroupSummary["kind"] }> = [...(sub.groups ?? [])].sort((a, b) => a.order - b.order).map((g) => ({ id: g.id, title: g.title, kind: g.kind }));
  if (sub.topics.some((t) => !known.has(t.group ?? ""))) defs.push({ id: "", title: defs.length ? "Otros temas" : "Temas", kind: "other" });
  return defs
    .map((g) => {
      const list = sub.topics.filter((t) => (g.id ? t.group === g.id : !known.has(t.group ?? "")));
      const weeks = list.map((t) => t.targetWeek);
      return {
        ...g,
        total: list.length,
        done: list.filter((t) => !!t.completedAt || !!done?.(t.folder)).length,
        minutes: list.reduce((n, t) => n + (t.estMinutes || 0), 0),
        fromWeek: weeks.length ? Math.min(...weeks) : null,
        toWeek: weeks.length ? Math.max(...weeks) : null,
        months: [...new Set(list.map((t) => wm.get(t.targetWeek)).filter((m): m is string => !!m))].sort(),
      };
    })
    .filter((g) => g.total > 0);
}

// ── Aviso: demasiadas Bases al principio ────────────────────────────────

/** Más temas de Bases que esto en un área ya es un bloque de fundamentos demasiado largo. */
export const BASES_LIMIT = 30;
/** Texto que se propone pedir al Mentor (no se aplica solo). */
export const BASES_REQUEST = "Reduce Bases a lo esencial y aplícalas junto al lenguaje";

export interface BasesWarning {
  count: number;
  fromWeek: number;
  toWeek: number;
  /** fracción (0..1) de los temas del área en sus primeras 4 semanas activas que son de Bases */
  earlyShare: number;
  text: string;
  request: string;
}

/**
 * ¿El grupo Bases de un área es demasiado grande o acapara el arranque? Avisa si tiene más de `BASES_LIMIT` temas, o si (con 12 o más)
 * ocupa 4 semanas o más y es al menos el 80 % de lo que el área hace en sus primeras 4 semanas. Solo informa: la acción es pedir cambios.
 */
export function basesWarning(sub: MonthsPlanLike["subplans"][number], limit = BASES_LIMIT): BasesWarning | null {
  const basesIds = new Set((sub.groups ?? []).filter((g) => g.kind === "bases").map((g) => g.id));
  if (!basesIds.size) basesIds.add("bases");
  // los temas fuera de ruta ya no cuentan: tras «Reducir a lo esencial» el aviso desaparece
  const liveTopics = sub.topics.filter((t) => t.route !== "skipped");
  const bases = liveTopics.filter((t) => basesIds.has(t.group ?? ""));
  if (!bases.length) return null;
  const weeks = bases.map((t) => t.targetWeek);
  const fromWeek = Math.min(...weeks);
  const toWeek = Math.max(...weeks);
  const first = Math.min(...liveTopics.map((t) => t.targetWeek));
  const early = liveTopics.filter((t) => t.targetWeek < first + 4);
  const earlyShare = early.length ? early.filter((t) => basesIds.has(t.group ?? "")).length / early.length : 0;
  const tooMany = bases.length > limit;
  const hogs = bases.length >= 12 && toWeek - fromWeek + 1 >= 4 && earlyShare >= 0.8;
  if (!tooMany && !hogs) return null;
  const span = fromWeek === toWeek ? `la semana ${fromWeek}` : `las semanas ${fromWeek}–${toWeek}`;
  const text = tooMany
    ? `Bases tiene ${bases.length} temas (más de ${limit}) y ocupa ${span}: son muchos fundamentos antes de aplicar nada.`
    : `Bases ocupa ${span} y es el ${Math.round(earlyShare * 100)} % del arranque del área: los fundamentos se estudian aislados del lenguaje.`;
  return { count: bases.length, fromWeek, toWeek, earlyShare, text, request: BASES_REQUEST };
}
