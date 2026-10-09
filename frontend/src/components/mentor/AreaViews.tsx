// Mentor — Plan: vistas POR ÁREA. Todo sale de `lib/planTopicsByArea.ts` y de la Agenda (`lib/planSchedule.ts`): nada se guarda aquí.
//
//  · `AreaFilter`: chips (aria-pressed) «Todas · Backend · Frontend…» en el orden fijo de las áreas.
//  · `WeekAreaColumns`: los temas de UNA semana separados por área (sección por área con su color, nº de temas, horas, lista con estado y día).
//  · `MonthWeekAreas`: el desglose por área de cada semana del mes.
//  · `AreaTopicsTable` («Temas por semana y área», Mi plan): tabla semanas × áreas con totales, expandible a la lista de temas.
//  · `TogetherBar`: aviso y acción «Poner todas las áreas desde el día 1» (con confirmación del antes/después y «Deshacer»).
//  · `DeliverablesPendingNote`: «Entregables: por definir», una sola vez.
//  · `areaPracticeView`: adaptador tolerante al sistema de práctica por área del otro flujo (`lib/areaPracticeSystem.ts`, si existe).

import { Undo2 } from "lucide-react";
import { Fragment, useEffect, useId, useMemo, useRef, useState } from "react";
import { api } from "../../lib/bridge";
import { areaPracticeOf } from "../../lib/planAreaPractice";
import { dateLabel } from "../../lib/planSchedule";
import {
  areaShort,
  areaWeeksOf,
  DELIVERABLES_PENDING_TEXT,
  offersTogether,
  orderedAreas,
  previewTogether,
  topicsByWeekArea,
  weeksRangeText,
  type TopicsByWeekArea,
  type WeekAreaCell,
  type WeekAreaTopic,
} from "../../lib/planTopicsByArea";
import type { MentorPlan } from "../../lib/types";
import { Chip, GhostButton, PrimaryButton } from "../common/forms";
import { cn } from "../ui";
import { focusColour, plural, type AgendaModel } from "./agendaKit";
import { hm } from "./parts";
import { SectionHeading } from "./planKit";
import { DAY_LONG, DAY_SHORT, STATE_COLOUR, STATE_GLYPH, STATE_LABEL } from "./planShared";

const SECTION = "text-[13px] font-semibold uppercase tracking-wider text-faint";

/** El color de un área (marca; el nombre siempre va escrito al lado). */
export const areaColour = (areaId: string | undefined): string => focusColour(areaId);

/** Un cuadradito de color + el texto: el color solo nunca es el único canal. */
export function AreaDot({ areaId }: { areaId?: string }) {
  return <span aria-hidden className="inline-block h-2.5 w-2.5 flex-none rounded-sm" style={{ background: areaColour(areaId) }} />;
}

// ── Práctica del área (adaptador tolerante) ─────────────────────────────

export interface AreaPracticeView {
  name: string;
  daily: string;
  /** el kata propio del área para ese día (sistema de práctica por área), si toca */
  kata?: { title: string; statement: string; minutes: number; skill: string; level: number };
  weekly?: string;
  monthly?: string;
  measure?: string;
  /** de dónde sale: el sistema de práctica propio por área (ejecución del plan) o el de referencia por defecto */
  source: "system" | "default";
}

// El sistema de práctica propio por área lo crea otro flujo (`lib/areaPracticeSystem.ts`). Si el módulo no existe, la UI usa la práctica por
// defecto de `planAreaPractice` y no pasa nada: la carga es opcional y tolerante a otro formato.
const external = import.meta.glob("../../lib/areaPracticeSystem.ts", { eager: true }) as Record<string, Record<string, unknown>>;

const textOf = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : v && typeof v === "object" && typeof (v as { summary?: unknown }).summary === "string" ? String((v as { summary: string }).summary) : undefined);

/**
 * La práctica del área para un día. Si existe el sistema de práctica propio por área (`lib/areaPracticeSystem.ts`: `areaPracticeSystem(areaId)` da su
 * carpeta, su propósito y los resúmenes semanal y mensual; `areaPracticeFor(plan, fecha)` el kata de cada área ese día) se usa; si falta el módulo o
 * devuelve otro formato, se usa la tabla de referencia `AREA_PRACTICE` (la UI degrada con elegancia).
 */
export function areaPracticeView(plan: MentorPlan, areaId: string | undefined, date: string): AreaPracticeView | null {
  if (!areaId) return null;
  for (const mod of Object.values(external)) {
    try {
      const sysFn = mod.areaPracticeSystem;
      const dayFn = mod.areaPracticeFor;
      const info = typeof sysFn === "function" ? ((sysFn as (a: string) => Record<string, unknown> | null)(areaId) ?? undefined) : undefined;
      const days = typeof dayFn === "function" ? (dayFn as (p: unknown, d: string) => unknown)(plan, date) : undefined;
      const hit = (Array.isArray(days) ? days : []).find((x) => x && typeof x === "object" && (x as { areaId?: unknown }).areaId === areaId) as { kata?: Record<string, unknown> } | undefined;
      if (!info && !hit) continue;
      const k = hit?.kata;
      const kata = k && typeof k.title === "string" ? { title: String(k.title), statement: typeof k.statement === "string" ? k.statement : "", minutes: Number(k.minutes) || 0, skill: typeof k.skillName === "string" ? k.skillName : "", level: Number(k.level) || 1 } : undefined;
      const daily = textOf(info?.purpose) ?? (kata ? `Cada día un kata del área: hoy, ${kata.title}.` : undefined);
      if (!daily) continue;
      const name = typeof info?.name === "string" ? info.name : "Sistema de práctica del área";
      return { name, daily, source: "system", ...(kata ? { kata } : {}), ...(textOf(info?.weekly) ? { weekly: textOf(info?.weekly)! } : {}), ...(textOf(info?.monthly) ? { monthly: textOf(info?.monthly)! } : {}) };
    } catch {
      /* formato distinto: se usa la práctica por defecto */
    }
  }
  const d = areaPracticeOf(areaId);
  return d ? { name: d.name, daily: d.daily.summary, weekly: d.weekly.summary, monthly: d.monthly.summary, measure: d.measure, source: "default" } : null;
}

// ── Filtro por área ─────────────────────────────────────────────────────

/** Chips «Todas · Backend · Frontend…» (aria-pressed): `value` null = todas. El orden es el fijo de las áreas. */
export function AreaFilter({ plan, value, onChange, testid = "area-filter" }: { plan: Pick<MentorPlan, "subplans">; value: string | null; onChange: (subplanId: string | null) => void; testid?: string }) {
  const areas = orderedAreas(plan);
  if (areas.length < 2) return null;
  return (
    <div role="group" aria-label="Filtrar por área" className="flex flex-wrap items-center gap-2" data-testid={testid}>
      <span className="text-[14px] text-dim">Ver:</span>
      <GhostButton large="md" aria-pressed={value === null} onClick={() => onChange(null)} className={cn(value === null && "border-accent bg-accent-soft font-semibold text-accent-text")} data-testid="area-filter-all">
        Todas
      </GhostButton>
      {areas.map((a) => (
        <GhostButton key={a.subplanId} large="md" aria-pressed={value === a.subplanId} onClick={() => onChange(value === a.subplanId ? null : a.subplanId)} className={cn(value === a.subplanId && "border-accent bg-accent-soft font-semibold text-accent-text")} data-testid="area-filter-chip" data-area={a.areaId ?? a.subplanId}>
          <AreaDot {...(a.areaId ? { areaId: a.areaId } : {})} /> {a.area}
        </GhostButton>
      ))}
    </div>
  );
}

// ── Temas de una semana, separados por área ─────────────────────────────

const dayWord = (iso: string): string => {
  const dow = (new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7;
  return `${DAY_SHORT[dow] === "X" ? "mié" : DAY_LONG[dow]!.slice(0, 3)} ${Number(iso.slice(8))}`;
};
const dayLong = (iso: string): string => {
  const dow = (new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7;
  return `${DAY_LONG[dow]} ${Number(iso.slice(8))}`;
};

function TopicLine({ m, t }: { m: AgendaModel; t: WeekAreaTopic }) {
  const live = m.topicByFolder.get(t.folder);
  const state = t.done ? "completo" : (live?.state ?? "sin_tratar");
  return (
    <li className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[14px]" data-testid="area-topic">
      <span className="min-w-0 flex-1 basis-44 break-words font-medium" title={t.folder}>{t.title}</span>
      <span className="whitespace-nowrap text-dim" aria-label={`Día asignado: ${t.dates.map(dayLong).join(", ")}`}>{t.dates.map(dayWord).join(", ")}</span>
      <span className="whitespace-nowrap text-dim">{hm(t.minutes)}</span>
      <Chip large colour={STATE_COLOUR[state]}><span aria-hidden>{STATE_GLYPH[state]}</span> {STATE_LABEL[state]}</Chip>
    </li>
  );
}

function AreaCard({ m, cell, planTotal, headingTag: H = "h4" }: { m: AgendaModel; cell: WeekAreaCell; planTotal?: { topics: number; minutes: number; done: number }; headingTag?: "h3" | "h4" }) {
  const uid = useId();
  return (
    <li className="min-w-0 rounded-xl border border-line bg-card p-3.5" style={{ borderTop: `3px solid ${areaColour(cell.areaId)}` }} data-testid="week-area" data-area={cell.areaId ?? cell.subplanId} aria-labelledby={`${uid}-h`}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <H id={`${uid}-h`} className="inline-flex min-w-0 flex-1 basis-32 items-center gap-1.5 text-[15px] font-semibold"><AreaDot {...(cell.areaId ? { areaId: cell.areaId } : {})} /> <span className="break-words">{cell.area}</span></H>
        <span className="whitespace-nowrap text-[14px] font-medium" data-testid="week-area-count">{plural(cell.topics.length, "tema", "temas")}</span>
        <span className="whitespace-nowrap text-[14px] text-dim">{cell.minutes ? hm(cell.minutes) : "—"}</span>
      </div>
      {cell.topics.length === 0 ? (
        <p className="mt-1.5 text-[14px] text-dim">{cell.review ? "Sin temas nuevos: repaso y práctica de mantenimiento cada día." : cell.active ? "Sin temas nuevos esta semana." : "Fuera de su fase esta semana."}</p>
      ) : (
        <ul className="mt-2 space-y-1.5">{cell.topics.map((t) => <TopicLine key={t.folder} m={m} t={t} />)}</ul>
      )}
      {planTotal && <p className="mt-2 border-t border-line pt-1.5 text-[13.5px] text-dim" data-testid="week-area-total">En todo el plan: {plural(planTotal.topics, "tema", "temas")} · {hm(planTotal.minutes)} ({planTotal.done} hechos)</p>}
    </li>
  );
}

/** Los temas de UNA semana, una sección por área (orden fijo), con totales por área. `only` = filtro por área. */
export function WeekAreaColumns({ m, week, headingId, only = null, byWeekArea }: { m: AgendaModel; week: number; headingId: string; only?: string | null; byWeekArea?: TopicsByWeekArea }) {
  const data = useMemo(() => byWeekArea ?? topicsByWeekArea(m.plan, m.schedule), [byWeekArea, m.plan, m.schedule]);
  const w = data.weeks[week - 1];
  if (!w) return null;
  const cells = w.cells.filter((c) => only === null || c.subplanId === only);
  return (
    <section aria-labelledby={headingId} data-testid="agenda-week-areas">
      <h3 id={headingId} className={cn(SECTION, "mb-2")}>Temas por semana, separados por área <span className="font-normal normal-case tracking-normal text-dim">({plural(w.topics, "tema", "temas")} esta semana)</span></h3>
      {cells.every((c) => c.topics.length === 0) && <p className="mb-2 text-[14px] text-dim">Esta semana no tiene temas repartidos.</p>}
      <ul className="grid items-start gap-3 @3xl:grid-cols-2 @6xl:grid-cols-3" aria-label="Temas de la semana por área">
        {cells.map((c) => <AreaCard key={c.subplanId} m={m} cell={c} planTotal={data.totals[c.subplanId]!} />)}
      </ul>
    </section>
  );
}

/** El desglose por área de cada semana de un mes: chips «■ Backend 4 temas · 6 h». */
export function WeekAreaChips({ week, data, only = null }: { week: number; data: TopicsByWeekArea; only?: string | null }) {
  const w = data.weeks[week - 1];
  if (!w) return null;
  const cells = w.cells.filter((c) => (only === null || c.subplanId === only) && c.topics.length > 0);
  if (!cells.length) return null;
  return (
    <ul className="mt-1.5 flex flex-wrap gap-1.5" aria-label={`Temas de la semana ${week} por área`} data-testid="month-week-areas">
      {cells.map((c) => (
        <li key={c.subplanId} className="inline-flex items-center gap-1.5 rounded-md border border-line px-2 py-0.5 text-[13.5px]" data-area={c.areaId ?? c.subplanId}>
          <AreaDot {...(c.areaId ? { areaId: c.areaId } : {})} />
          <span className="font-medium">{c.area}</span> <span className="text-dim">{plural(c.topics.length, "tema", "temas")} · {hm(c.minutes)}</span>
        </li>
      ))}
    </ul>
  );
}

/** El mes por área: totales por área de las semanas del mes (temas distintos y horas). */
export function MonthAreaTotals({ weeks, data, only = null }: { weeks: readonly number[]; data: TopicsByWeekArea; only?: string | null }) {
  const rows = data.areas
    .filter((a) => only === null || a.subplanId === only)
    .map((a) => {
      const folders = new Set<string>();
      let minutes = 0;
      for (const wk of weeks) {
        const c = data.weeks[wk - 1]?.cells.find((x) => x.subplanId === a.subplanId);
        for (const t of c?.topics ?? []) folders.add(t.folder);
        minutes += c?.minutes ?? 0;
      }
      return { ...a, topics: folders.size, minutes };
    });
  return (
    <ul className="grid items-start gap-2 @3xl:grid-cols-2 @6xl:grid-cols-3" aria-label="Totales del mes por área" data-testid="month-area-totals">
      {rows.map((r) => (
        <li key={r.subplanId} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-line px-3.5 py-2.5 text-[14px]" style={{ borderLeft: `4px solid ${areaColour(r.areaId)}` }} data-area={r.areaId ?? r.subplanId}>
          <span className="inline-flex min-w-0 flex-1 basis-28 items-center gap-1.5 text-[15px] font-semibold"><AreaDot {...(r.areaId ? { areaId: r.areaId } : {})} /> <span className="break-words">{r.area}</span></span>
          <span className="font-medium">{r.topics ? plural(r.topics, "tema", "temas") : "sin temas nuevos"}</span>
          <span className="text-dim">{r.minutes ? hm(r.minutes) : "—"}</span>
        </li>
      ))}
    </ul>
  );
}

// ── «Temas por semana y área» en Mi plan ────────────────────────────────

/** Tabla semanas × áreas con el nº de temas y las horas, totales por área y cada semana expandible a la lista de temas por área. */
export function AreaTopicsTable({ m, currentWeek, headingId }: { m: AgendaModel; currentWeek: number; headingId: string }) {
  const data = useMemo(() => topicsByWeekArea(m.plan, m.schedule), [m.plan, m.schedule]);
  const [open, setOpen] = useState<Set<number>>(() => new Set([Math.min(currentWeek, data.weeks.length)]));
  const toggle = (w: number): void => setOpen((cur) => {
    const n = new Set(cur);
    if (n.has(w)) n.delete(w);
    else n.add(w);
    return n;
  });
  const cols = data.areas.length;
  const grand = Object.values(data.totals).reduce((n, t) => ({ topics: n.topics + t.topics, minutes: n.minutes + t.minutes }), { topics: 0, minutes: 0 });
  return (
    <div data-testid="area-topics-table">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <GhostButton large="md" onClick={() => setOpen(new Set(data.weeks.map((w) => w.week)))} data-testid="area-topics-expand">Expandir todas las semanas</GhostButton>
        <GhostButton large="md" onClick={() => setOpen(new Set())} data-testid="area-topics-collapse">Contraer todas</GhostButton>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-line bg-card" tabIndex={0} role="region" aria-label="Tabla de temas por semana y área (se desplaza en horizontal)">
        <table className="w-full min-w-[34rem] border-collapse text-left text-[14px]" aria-labelledby={headingId}>
          <thead>
            <tr className="border-b border-line bg-surface text-[13px] font-semibold uppercase tracking-wide text-faint">
              <th scope="col" className="px-3 py-2">Semana</th>
              {data.areas.map((a) => (
                <th key={a.subplanId} scope="col" className="px-2 py-2 normal-case tracking-normal text-text" data-area={a.areaId ?? a.subplanId}>
                  <span className="inline-flex items-center gap-1.5"><AreaDot {...(a.areaId ? { areaId: a.areaId } : {})} /> {a.area}</span>
                </th>
              ))}
              <th scope="col" className="px-2 py-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {data.weeks.map((w) => {
              const isOpen = open.has(w.week);
              const rowId = `${headingId}-w${w.week}`;
              return (
                <Fragment key={w.week}>
                  <tr className={cn("border-b border-line", w.week === currentWeek && "bg-accent-soft")} data-testid="area-topics-row" data-week={w.week}>
                    <th scope="row" className="px-3 py-1 font-medium">
                      <button
                        type="button"
                        aria-expanded={isOpen}
                        aria-controls={rowId}
                        onClick={() => toggle(w.week)}
                        className="inline-flex min-h-8 items-center gap-1.5 rounded-md px-1 text-left underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                        aria-label={`Semana ${w.week}, ${dateLabel(w.start)} a ${dateLabel(w.end)}: ${plural(w.topics, "tema", "temas")}. ${isOpen ? "Ocultar" : "Ver"} la lista de temas`}
                      >
                        <span aria-hidden>{isOpen ? "▾" : "▸"}</span> {w.week}
                        <span className="hidden text-[13px] font-normal text-dim @3xl:inline">{dateLabel(w.start)}</span>
                      </button>
                    </th>
                    {w.cells.map((c) => (
                      <td key={c.subplanId} className="px-2 py-1" data-testid="area-topics-cell" data-area={c.areaId ?? c.subplanId}>
                        {c.topics.length ? (
                          <>
                            <span className="font-semibold">{c.topics.length}</span> <span className="text-dim">{c.topics.length === 1 ? "tema" : "temas"}</span>
                            <span className="block text-[13px] text-dim">{hm(c.minutes)}</span>
                          </>
                        ) : (
                          <>
                            <span className="text-dim" aria-hidden>{c.review ? "repaso" : "—"}</span>
                            <span className="sr-only">sin temas{c.review ? " nuevos (repaso y mantenimiento)" : ""}</span>
                          </>
                        )}
                      </td>
                    ))}
                    <td className="px-2 py-1 text-right font-medium">{w.topics}<span className="block text-[13px] font-normal text-dim">{hm(w.minutes)}</span></td>
                  </tr>
                  {isOpen && (
                    <tr id={rowId} className="border-b border-line bg-surface/50" data-testid="area-topics-detail">
                      <td colSpan={cols + 2} className="px-3 py-3">
                        <ul className="grid items-start gap-3 @3xl:grid-cols-2 @6xl:grid-cols-3" aria-label={`Temas de la semana ${w.week} por área`}>
                          {w.cells.filter((c) => c.topics.length > 0).map((c) => (
                            <li key={c.subplanId} className="min-w-0 rounded-lg border border-line bg-card p-2.5" style={{ borderTop: `3px solid ${areaColour(c.areaId)}` }} data-area={c.areaId ?? c.subplanId}>
                              <p className="flex flex-wrap items-center gap-x-2 text-[14px] font-semibold"><AreaDot {...(c.areaId ? { areaId: c.areaId } : {})} /> {c.area} <span className="font-normal text-dim">{plural(c.topics.length, "tema", "temas")} · {hm(c.minutes)}</span></p>
                              <ul className="mt-1.5 space-y-1">
                                {c.topics.map((t) => (
                                  <li key={t.folder} className="flex flex-wrap items-baseline gap-x-2 text-[13.5px]">
                                    <span className="min-w-0 flex-1 basis-36 break-words">{t.done ? "● " : "○ "}{t.title}<span className="sr-only">{t.done ? " (hecho)" : " (pendiente)"}</span></span>
                                    <span className="whitespace-nowrap text-dim">{t.dates.map(dayWord).join(", ")}</span>
                                  </li>
                                ))}
                              </ul>
                            </li>
                          ))}
                          {w.topics === 0 && <li className="text-[14px] text-dim">Esta semana no tiene temas repartidos.</li>}
                        </ul>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-surface font-semibold" data-testid="area-topics-totals">
              <th scope="row" className="px-3 py-2">Total del plan</th>
              {data.areas.map((a) => (
                <td key={a.subplanId} className="px-2 py-2" data-area={a.areaId ?? a.subplanId}>
                  {data.totals[a.subplanId]!.topics} <span className="font-normal text-dim">{data.totals[a.subplanId]!.topics === 1 ? "tema" : "temas"}</span>
                  <span className="block text-[13px] font-normal text-dim">{hm(data.totals[a.subplanId]!.minutes)}</span>
                </td>
              ))}
              <td className="px-2 py-2 text-right">{grand.topics}<span className="block text-[13px] font-normal text-dim">{hm(grand.minutes)}</span></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

/** La sección completa de Mi plan: título y tabla. */
export function AreaTopicsSection({ m, currentWeek }: { m: AgendaModel; currentWeek: number }) {
  return (
    <section aria-labelledby="mp-area-topics" data-testid="plan-area-topics">
      <SectionHeading id="mp-area-topics" hint="Los temas de cada semana separados por área: cuántos toca de cada una y cuántas horas. Pulsa una semana para ver la lista con el día asignado. Es el mismo reparto que la Agenda.">
        Temas por semana y área
      </SectionHeading>
      <AreaTopicsTable m={m} currentWeek={currentWeek} headingId="mp-area-topics" />
    </section>
  );
}

// ── Entregables por definir ─────────────────────────────────────────────

/** «Entregables: por definir» — se muestra UNA vez por vista mientras no haya entregables definidos. */
export function DeliverablesPendingNote({ className }: { className?: string }) {
  return (
    <p className={cn("text-[14px] text-dim", className)} data-testid="deliverables-pending-note" title={DELIVERABLES_PENDING_TEXT}>
      <span className="font-medium text-text">Entregables:</span> por definir <span className="text-faint">(se definen al ejecutar el plan)</span>
    </p>
  );
}

// ── «Poner todas las áreas desde el día 1» ──────────────────────────────

export const TOGETHER_LABEL = "Poner todas las áreas desde el día 1";
const COLD_RETRY_MS = 1500;
const COLD_RETRY_MAX = 40;

/**
 * Aviso de «Mi plan» cuando el plan estudia las áreas por fases, con la acción para pasar a «todas desde el día 1» (Automation al final).
 * Pide confirmación con el antes/después de las semanas de cada área y aplica la operación determinista `set_area_mode` (queda en el historial
 * de «Preguntas y ajustes» y se puede deshacer, aquí mismo o allí). No toca nada hasta pulsar «Aplicar».
 */
export function TogetherBar({ plan, onApplied, announce }: { plan: MentorPlan; onApplied: (plan: MentorPlan, changed: string[]) => void; announce: (msg: string) => void }) {
  const uid = useId();
  const offered = offersTogether(plan) && !plan.archived;
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState("");
  const confirmRef = useRef<HTMLDivElement>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  // si el plan vuelve a estudiar por fases (p. ej. se deshizo desde «Preguntas y ajustes»), el aviso de «hecho» ya no vale
  useEffect(() => {
    if (offered) setDone(null);
  }, [offered]);
  const { before, after } = useMemo(() => (offered ? { before: areaWeeksOf(plan), after: previewTogether(plan) } : { before: [], after: [] }), [offered, plan]);
  useEffect(() => {
    if (confirming) setTimeout(() => confirmRef.current?.querySelector<HTMLElement>("button")?.focus(), 0);
  }, [confirming]);

  const apply = async (): Promise<void> => {
    setBusy(true);
    setError("");
    try {
      const body = { id: plan.id, ops: [{ op: "set_area_mode", mode: "together" }], label: `${TOGETHER_LABEL} (Automation al final)` };
      let r = await api.mentorPlanChange(body);
      for (let i = 0; r.loading && i < COLD_RETRY_MAX; i++) {
        await new Promise((ok) => setTimeout(ok, COLD_RETRY_MS));
        r = await api.mentorPlanChange(body);
      }
      if (r.loading) throw new Error("El índice de la vault tarda demasiado en estar listo. Inténtalo de nuevo en un momento.");
      if (!alive.current) return;
      if (!r.applied) {
        setError("No se pudo cambiar el plan: no hubo ningún cambio que aplicar.");
        return;
      }
      setConfirming(false);
      const msg = "Listo: todas las áreas están activas desde el día 1 (Automation, al final). El reparto, la agenda y la tabla mes a mes se recalcularon.";
      setDone(msg);
      onApplied(r.plan, r.entry.changed);
      announce(msg);
    } catch (e) {
      if (alive.current) setError((e as Error).message);
    } finally {
      if (alive.current) setBusy(false);
    }
  };
  const undo = async (): Promise<void> => {
    setBusy(true);
    try {
      const r = await api.mentorPlanChangeUndo(plan.id);
      if (!alive.current) return;
      setDone(null);
      onApplied(r.plan, []);
      announce("Cambio deshecho: el plan vuelve a estudiar las áreas por fases.");
    } catch (e) {
      if (alive.current) setError((e as Error).message);
    } finally {
      if (alive.current) setBusy(false);
    }
  };

  if (!offered && !done) return null;
  return (
    <section aria-labelledby={`${uid}-h`} className="rounded-xl border-2 border-accent/60 bg-card px-4 py-3" data-testid="plan-together-bar">
      {done ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="min-w-0 flex-1 basis-64">
            <h2 id={`${uid}-h`} className="text-[16px] font-semibold">Todas las áreas desde el día 1</h2>
            <p role="status" className="text-[14px] text-dim" data-testid="plan-together-done">{done}</p>
          </div>
          <GhostButton large disabled={busy} onClick={() => void undo()} data-testid="plan-together-undo">
            <Undo2 size={15} aria-hidden /> Deshacer
          </GhostButton>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <div className="min-w-0 flex-1 basis-64">
              <h2 id={`${uid}-h`} className="text-[16px] font-semibold">Tu plan estudia las áreas por fases</h2>
              <p className="text-[14px] text-dim">¿Quieres todas desde el día 1, con Automation al final? Backend, Frontend, Databases y Tooling and Quality se estudiarían a la vez desde la semana 1 y Automation (solo Python) quedaría para las últimas semanas.</p>
            </div>
            <PrimaryButton large disabled={busy || confirming} onClick={() => setConfirming(true)} data-testid="plan-together-open">
              {TOGETHER_LABEL}
            </PrimaryButton>
          </div>
          {confirming && (
            <div
              ref={confirmRef}
              role="group"
              aria-labelledby={`${uid}-c`}
              className="mt-3 rounded-xl border border-line bg-surface p-3.5"
              data-testid="plan-together-confirm"
              onKeyDown={(e) => {
                if (e.key === "Escape") setConfirming(false);
              }}
            >
              <h3 id={`${uid}-c`} className="text-[15px] font-semibold">¿Aplicar «{TOGETHER_LABEL}»?</h3>
              <p className="mt-0.5 text-[14px] text-dim">Esto cambia en qué semanas se estudia cada área. Se conservan los temas completados, las semanas que fijaste, tus comentarios y el avance; el reparto, la agenda y la tabla «Fases del plan, mes a mes» se recalculan. Queda en «Preguntas y ajustes» y se puede deshacer.</p>
              <div className="mt-2 overflow-x-auto" tabIndex={0} role="region" aria-label="Antes y después de las semanas de cada área">
                <table className="w-full min-w-[26rem] border-collapse text-left text-[14px]" data-testid="plan-together-preview">
                  <caption className="sr-only">Semanas activas de cada área, ahora y después del cambio</caption>
                  <thead>
                    <tr className="border-b border-line text-[13px] font-semibold uppercase tracking-wide text-faint">
                      <th scope="col" className="px-2 py-1.5">Área</th>
                      <th scope="col" className="px-2 py-1.5">Ahora</th>
                      <th scope="col" className="px-2 py-1.5">Después</th>
                    </tr>
                  </thead>
                  <tbody>
                    {before.map((b) => {
                      const a = after.find((x) => x.subplanId === b.subplanId)!;
                      return (
                        <tr key={b.subplanId} className="border-b border-line last:border-b-0" data-area={b.areaId ?? b.subplanId}>
                          <th scope="row" className="px-2 py-1.5 font-medium"><span className="inline-flex items-center gap-1.5"><AreaDot {...(b.areaId ? { areaId: b.areaId } : {})} /> {b.area}</span></th>
                          <td className="px-2 py-1.5" data-testid="together-before">{weeksRangeText(b)} <span className="text-dim">({plural(b.weeks, "semana", "semanas")})</span></td>
                          <td className="px-2 py-1.5 font-medium" data-testid="together-after">
                            {a.activeToWeek ? weeksRangeText({ fromWeek: a.fromWeek, toWeek: a.activeToWeek }) : weeksRangeText(a)}{" "}
                            <span className="font-normal text-dim">
                              {a.activeToWeek ? `(temas nuevos hasta la semana ${a.toWeek}; después, repaso y mantenimiento)` : `(${plural(a.weeks, "semana", "semanas")}${b.areaId === "automation" ? ", al final" : ""})`}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="mt-1.5 text-[13.5px] text-dim">Es una estimación con tu capacidad actual; la tabla real aparece al aplicar. Cuando empieza Automation, el resto sigue como práctica y proyectos de mantenimiento.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <PrimaryButton large disabled={busy} onClick={() => void apply()} data-testid="plan-together-apply">Aplicar cambio</PrimaryButton>
                <GhostButton large disabled={busy} onClick={() => setConfirming(false)} data-testid="plan-together-cancel">Cancelar</GhostButton>
              </div>
            </div>
          )}
        </>
      )}
      {error && <p role="alert" className="mt-2 rounded-lg border border-danger/40 bg-danger-soft px-3 py-2 text-[14px] text-danger">{error}</p>}
    </section>
  );
}

export { areaShort, type WeekAreaCell };
