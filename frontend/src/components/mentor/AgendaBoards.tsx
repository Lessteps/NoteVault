// Mentor — Plan, Agenda: los tableros de las vistas SEMANA y MES. Todo sale del reparto (`m.byWeekArea`, que es `topicsByWeekArea`, el mismo
// cálculo que usa la Ejecución): aquí solo se presenta, SEGMENTADO POR CATEGORÍA (área) y con cada categoría claramente separada.
//
//  · `WeekStats`: 4 tarjetas (temas pendientes · estudio teórico · práctica y katas · proyectos diarios).
//  · `WeekDayStrip`: tira L…D con los temas de cada día y el marcador de hoy (pulsar abre el día).
//  · `WeekCategories`: una tarjeta por ÁREA con sus temas (código y título, tipo, minutos, días, estado y enlaces) y Bases aparte.
//  · `MonthStats` / `MonthLegend` / `MonthWeekBlock`: el mes por semanas, cada semana con una fila por área y los temas como chips.

import { useId, useState } from "react";
import { dateLabel, type ScheduleDay, type WeekSummary } from "../../lib/planSchedule";
import type { TopicsByWeekArea, WeekAreaCell, WeekAreaTopic, WeekAreas } from "../../lib/planTopicsByArea";
import { Chip, GhostButton } from "../common/forms";
import { cn } from "../ui";
import { AreaDot, areaColour } from "./AreaViews";
import { plural, type AgendaModel } from "./agendaKit";
import { openTopic } from "./openTopic";
import { hm, ProgressBar } from "./parts";
import { TopicMenu } from "./PlanBoard";
import { DAY_LONG, DAY_SHORT } from "./planShared";
import { TopicNoteLinks } from "./TopicNoteLinks";

const SECTION = "text-[13px] font-semibold uppercase tracking-wider text-faint";
/** Una banda suave con el color del área (el nombre siempre va escrito: el color solo no basta). */
const tint = (colour: string): string => `color-mix(in srgb, ${colour} 9%, transparent)`;

const dowOf = (iso: string): number => (new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7;
const dayNum = (iso: string): number => Number(iso.slice(8));

// ── Semana: tarjetas de cifras ──────────────────────────────────────────

export function WeekStats({ w, days }: { w: WeekSummary; days: readonly ScheduleDay[] }) {
  const project = w.focus ? w.focus.projectMinutes : days.reduce((n, d) => n + (d.projectMinutes ?? 0), 0);
  const practice = w.focus ? Math.max(0, w.focus.practiceMinutes - w.focus.projectMinutes) : w.practiceMinutes;
  const theory = w.focus ? w.focus.theoryMinutes : w.topicMinutes;
  const pending = w.topics - w.topicsDone;
  const cards = [
    { id: "pending", l: "Temas pendientes", v: String(pending), h: w.topicsDone ? `${w.topicsDone} de ${w.topics} hechos` : `de ${plural(w.topics, "tema", "temas")} esta semana` },
    { id: "theory", l: "Estudio teórico", v: theory ? hm(theory) : "—", h: w.capacityMinutes ? `de ${hm(w.capacityMinutes)} disponibles` : "sin capacidad" },
    { id: "practice", l: "Práctica & katas", v: practice ? hm(practice) : "—", h: plural(w.katas, "kata", "katas") },
    { id: "projects", l: "Proyectos diarios", v: project ? hm(project) : "—", h: plural(w.projectSessions || days.filter((d) => (d.projectMinutes ?? 0) > 0).length, "sesión", "sesiones") },
  ];
  return (
    <dl className="grid grid-cols-2 gap-3 @3xl:grid-cols-4" data-testid="agenda-week-stats">
      {cards.map((x) => (
        <div key={x.id} className="min-w-0 rounded-xl border border-line bg-card px-4 py-3.5" data-testid={`week-stat-${x.id}`}>
          <dt className="mb-1 text-[12.5px] font-semibold uppercase tracking-wider text-faint">{x.l}</dt>
          <dd className="text-[22px] font-semibold leading-snug" data-testid={`week-stat-${x.id}-value`}>{x.v}</dd>
          <dd className="mt-0.5 text-[13.5px] text-dim">{x.h}</dd>
        </div>
      ))}
    </dl>
  );
}

// ── Semana: tira de días ────────────────────────────────────────────────

/** Cuántos temas distintos toca cada día (los de las áreas y las Bases), contados desde el MISMO reparto por área que enseñan las tarjetas. */
export function topicsPerDay(w: WeekAreas): Map<string, number> {
  const out = new Map<string, number>();
  for (const list of [...w.cells.map((c) => c.topics), w.bases]) for (const t of list) for (const d of t.dates) out.set(d, (out.get(d) ?? 0) + 1);
  return out;
}

export function WeekDayStrip({ m, days, counts, onPick }: { m: AgendaModel; days: readonly ScheduleDay[]; counts: Map<string, number>; onPick: (date: string) => void }) {
  return (
    <ol className="grid grid-cols-7 gap-1.5 @xl:gap-2" aria-label="Días de la semana" data-testid="agenda-week-strip">
      {days.map((d) => {
        const n = counts.get(d.date) ?? 0;
        const today = d.date === m.today;
        const long = `${DAY_LONG[d.dow - 1]} ${dayNum(d.date)}`;
        return (
          <li key={d.date} className="min-w-0">
            <button
              type="button"
              onClick={() => onPick(d.date)}
              aria-current={today ? "date" : undefined}
              aria-label={`${long}: ${plural(n, "tema", "temas")}${today ? " (hoy)" : ""}${d.study ? "" : d.blocked ? " (bloqueado)" : " (descanso)"}. Abrir el día`}
              data-testid="agenda-week-strip-day"
              data-date={d.date}
              data-count={n}
              className={cn("flex min-h-[4.25rem] w-full flex-col items-center justify-center gap-0.5 rounded-xl border px-1 py-2 transition-colors hover:bg-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent", today ? "border-accent bg-accent-soft" : "border-line bg-card", !d.study && "opacity-70")}
            >
              <span aria-hidden className="text-[12px] font-semibold uppercase tracking-wide text-faint">{DAY_SHORT[d.dow - 1]}</span>
              <span aria-hidden className="text-[17px] font-semibold leading-none">{dayNum(d.date)}</span>
              <span aria-hidden className={cn("text-[12.5px]", n ? "font-medium text-text" : "text-faint")}>{d.study ? (n ? `${n} ${n === 1 ? "tema" : "temas"}` : "—") : "descanso"}</span>
              {today && <span aria-hidden className="mt-0.5 h-1.5 w-1.5 rounded-full bg-accent" data-testid="agenda-week-strip-today" />}
            </button>
          </li>
        );
      })}
    </ol>
  );
}

// ── Semana: temas por categoría ─────────────────────────────────────────

/** «4.1», «T01»…: el código del tema, si su carpeta lo trae (y el título no lo repite). */
export function topicCode(folder: string, title: string): string | undefined {
  const last = folder.split("/").pop() ?? "";
  const code = /^(\d+(?:\.\d+)*)[\s._-]/.exec(last)?.[1] ?? /^(T\d+)$/i.exec(last)?.[1];
  return code && !title.startsWith(code) ? code : undefined;
}

type Kind = "theory" | "practice";
/** Qué tipos de trabajo (teoría, práctica) tiene cada tema en la semana, según los bloques del reparto (sin bloques: teoría). */
function kindsOf(m: AgendaModel, week: number): Map<string, Set<Kind>> {
  const out = new Map<string, Set<Kind>>();
  for (const d of m.schedule.days) {
    if (d.week !== week) continue;
    for (const b of d.blocks ?? []) for (const i of b.items) (out.get(i.folder) ?? out.set(i.folder, new Set()).get(i.folder)!).add(b.kind === "practice" ? "practice" : "theory");
  }
  return out;
}

type Estado = "sin" | "curso" | "hecho";
const ESTADO: Record<Estado, { label: string; glyph: string; colour: string }> = {
  sin: { label: "Sin tratar", glyph: "○", colour: "var(--nv-faint)" },
  curso: { label: "En curso", glyph: "◐", colour: "var(--nv-accent)" },
  hecho: { label: "Hecho", glyph: "●", colour: "var(--nv-mint)" },
};
const estadoOf = (m: AgendaModel, t: WeekAreaTopic): Estado => {
  const s = m.topicByFolder.get(t.folder)?.state;
  if (t.done || s === "completo") return "hecho";
  return !s || s === "sin_tratar" || s === "no_encontrado" ? "sin" : "curso";
};

/** Los 7 días de la semana (L M X J V S D) con los asignados al tema marcados. */
function DayChips({ dates, week, colour }: { dates: readonly string[]; week: WeekAreas; colour: string }) {
  const start = dowOf(week.start);
  const on = new Set(dates.map(dowOf));
  const ordered = Array.from({ length: 7 }, (_, i) => (start + i) % 7);
  return (
    <span className="inline-flex gap-0.5" role="img" aria-label={`Día asignado: ${dates.map((d) => `${DAY_LONG[dowOf(d)]} ${dayNum(d)}`).join(", ")}`} data-testid="area-topic-days">
      {ordered.map((i) => (
        <span key={i} aria-hidden data-on={on.has(i) ? "1" : "0"} className={cn("inline-flex h-[22px] w-[22px] items-center justify-center rounded text-[11.5px] font-semibold", on.has(i) ? "text-white" : "border border-line text-faint")} style={on.has(i) ? { background: colour } : undefined}>
          {DAY_SHORT[i]}
        </span>
      ))}
    </span>
  );
}

function TopicRow({ m, t, kinds, week, colour }: { m: AgendaModel; t: WeekAreaTopic; kinds: Set<Kind> | undefined; week: WeekAreas; colour: string }) {
  const live = m.topicByFolder.get(t.folder);
  const est = ESTADO[estadoOf(m, t)];
  const code = topicCode(t.folder, t.title);
  const ks: Kind[] = kinds && kinds.size ? (["theory", "practice"] as Kind[]).filter((k) => kinds.has(k)) : ["theory"];
  return (
    <li className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 py-2 text-[14px]" data-testid="area-topic" data-folder={t.folder}>
      <span className="flex min-w-0 flex-1 basis-52 items-baseline gap-1.5" title={t.folder}>
        {code && <span className="flex-none rounded bg-hover px-1.5 py-px font-mono text-[12px] text-dim" data-testid="area-topic-code">{code}</span>}
        <TopicMenu folder={t.folder} title={t.title} trigger={<span className="break-words font-medium">{t.title}</span>} className="hover:text-accent-text hover:underline" />
      </span>
      <span className="inline-flex gap-1" data-testid="area-topic-kinds">
        {ks.map((k) => <Chip key={k} large colour={k === "theory" ? "var(--nv-accent)" : "var(--nv-practice, #c58be0)"}>{k === "theory" ? "Teoría" : "Práctica"}</Chip>)}
      </span>
      <span className="whitespace-nowrap text-dim" data-testid="area-topic-minutes">{hm(t.minutes)}</span>
      <DayChips dates={t.dates} week={week} colour={colour} />
      <Chip large colour={est.colour}><span aria-hidden>{est.glyph}</span> {est.label}</Chip>
      {live?.found && (
        <span className="inline-flex flex-none items-center">
          <button type="button" onClick={() => void openTopic(t.folder)} className="inline-flex min-h-8 items-center px-1.5 text-[12.5px] font-medium text-accent-text underline-offset-2 hover:underline" aria-label={`Ver tema ${t.title}`}>Ver tema</button>
          <TopicNoteLinks folder={t.folder} title={t.title} />
        </span>
      )}
    </li>
  );
}

function CategoryCard({ m, cell, week, kinds, total, lost }: { m: AgendaModel; cell: WeekAreaCell; week: WeekAreas; kinds: Map<string, Set<Kind>>; total?: { topics: number; minutes: number; done: number }; lost?: ReadonlyArray<unknown> }) {
  const uid = useId();
  const colour = areaColour(cell.areaId);
  const done = cell.topics.filter((t) => estadoOf(m, t) === "hecho").length;
  const pct = cell.topics.length ? Math.round((done / cell.topics.length) * 100) : 0;
  return (
    <li className="min-w-0 overflow-hidden rounded-2xl border border-line bg-card" style={{ borderTop: `3px solid ${colour}` }} data-testid="week-area" data-area={cell.areaId ?? cell.subplanId} aria-labelledby={`${uid}-h`}>
      <div className="px-4 pb-3 pt-3" style={{ background: tint(colour) }}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h4 id={`${uid}-h`} className="inline-flex min-w-0 flex-1 basis-36 items-center gap-2 text-[17px] font-bold"><AreaDot {...(cell.areaId ? { areaId: cell.areaId } : {})} /> <span className="break-words">{cell.area}</span></h4>
          <span className="whitespace-nowrap text-[14px] font-medium" data-testid="week-area-count">{plural(cell.topics.length, "tema", "temas")}</span>
          <span className="whitespace-nowrap text-[14px] text-dim" data-testid="week-area-hours">{cell.minutes ? hm(cell.minutes) : "—"}</span>
        </div>
        <div className="mt-2 flex items-center gap-3">
          <div className="flex-1"><ProgressBar pct={pct} colour={colour} label={`Avance de ${cell.area} esta semana`} /></div>
          <span className="whitespace-nowrap text-[13px] text-dim" data-testid="week-area-progress">{done}/{cell.topics.length} hechos</span>
        </div>
      </div>
      <ul className="divide-y divide-line px-4" aria-label={`Temas de ${cell.area} esta semana`}>
        {cell.topics.map((t) => <TopicRow key={t.folder} m={m} t={t} kinds={kinds.get(t.folder)} week={week} colour={colour} />)}
      </ul>
      {total && <p className="border-t border-line px-4 py-2 text-[13px] text-dim" data-testid="week-area-total">En todo el plan: {plural(total.topics, "tema", "temas")} · {hm(total.minutes)} ({total.done} hechos){lost && lost.length > 0 ? ` · ${plural(lost.length, "tema sin día", "temas sin día")} en el reparto` : ""}</p>}
    </li>
  );
}

/** Los temas de UNA semana por categoría (área): una tarjeta separada por área con temas, las áreas vacías en una sola línea y Bases aparte. */
export function WeekCategories({ m, week, headingId, only = null }: { m: AgendaModel; week: number; headingId: string; only?: string | null }) {
  const data: TopicsByWeekArea = m.byWeekArea;
  const w = data.weeks[week - 1];
  if (!w) return null;
  const cells = w.cells.filter((c) => only === null || c.subplanId === only);
  const withTopics = cells.filter((c) => c.topics.length > 0);
  const empty = cells.filter((c) => c.topics.length === 0);
  const kinds = kindsOf(m, week);
  const showBases = only === null && w.bases.length > 0;
  const basesDone = w.bases.filter((t) => estadoOf(m, t) === "hecho").length;
  return (
    <section aria-labelledby={headingId} data-testid="agenda-week-areas" className="space-y-3">
      <h3 id={headingId} className={SECTION}>Temas de la semana por categoría <span className="font-normal normal-case tracking-normal text-dim">({plural(w.topics, "tema", "temas")} esta semana)</span></h3>
      {withTopics.length === 0 && !showBases && <p className="text-[14px] text-dim">Esta semana no tiene temas repartidos.</p>}
      {withTopics.length > 0 && (
        <ul className="grid items-start gap-4 @4xl:grid-cols-2" aria-label="Temas de la semana por área">
          {withTopics.map((c) => <CategoryCard key={c.subplanId} m={m} cell={c} week={w} kinds={kinds} total={data.totals[c.subplanId]!} lost={data.unscheduled[c.subplanId]} />)}
        </ul>
      )}
      {showBases && (
        <section className="overflow-hidden rounded-2xl border border-line bg-card" style={{ borderTop: "3px solid var(--nv-accent)" }} data-testid="week-bases" aria-label="Bases de la semana">
          <div className="px-4 pb-3 pt-3" style={{ background: tint("var(--nv-accent)") }}>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h4 className="min-w-0 flex-1 basis-36 text-[17px] font-bold">Bases · lógica aplicada</h4>
              <span className="whitespace-nowrap text-[14px] font-medium" data-testid="week-bases-count">{plural(w.bases.length, "fundamento", "fundamentos")}</span>
              <span className="whitespace-nowrap text-[14px] text-dim">{hm(w.bases.reduce((n, t) => n + t.minutes, 0))}</span>
            </div>
            <p className="mt-1 text-[13px] text-dim">No son de ningún área: se intercalan en todas. {basesDone}/{w.bases.length} hechos.</p>
          </div>
          <ul className="divide-y divide-line px-4" aria-label="Temas de Bases esta semana">
            {w.bases.map((t) => <TopicRow key={t.folder} m={m} t={t} kinds={kinds.get(t.folder)} week={w} colour="var(--nv-accent)" />)}
          </ul>
        </section>
      )}
      {empty.length > 0 && withTopics.length + (showBases ? 1 : 0) > 0 && (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13.5px] text-dim" data-testid="week-areas-empty">
          <span>Sin temas esta semana:</span>
          {empty.map((c) => <span key={c.subplanId} className="inline-flex items-center gap-1.5" data-area={c.areaId ?? c.subplanId}><AreaDot {...(c.areaId ? { areaId: c.areaId } : {})} />{c.area}<span className="text-faint">({c.review ? "repaso" : c.active ? "sin temas nuevos" : "fuera de su fase"})</span></span>)}
        </p>
      )}
    </section>
  );
}

// ── Mes ─────────────────────────────────────────────────────────────────

/** Cifras del mes: temas, horas y avance (temas distintos hechos de las semanas del mes). */
export function MonthStats({ weeks, data, topicMinutes, topics }: { weeks: readonly number[]; data: TopicsByWeekArea; topicMinutes: number; topics: number }) {
  const all = new Map<string, boolean>();
  for (const wk of weeks) {
    const w = data.weeks[wk - 1];
    if (!w) continue;
    for (const t of [...w.cells.flatMap((c) => c.topics), ...w.bases]) all.set(t.folder, (all.get(t.folder) ?? true) && t.done);
  }
  const done = [...all.values()].filter(Boolean).length;
  const pct = all.size ? Math.round((done / all.size) * 100) : 0;
  const cards = [
    { id: "topics", l: "Temas del mes", v: String(topics), h: plural(weeks.length, "semana", "semanas") },
    { id: "hours", l: "Horas de estudio", v: topicMinutes ? hm(topicMinutes) : "—", h: "teoría y práctica de los temas" },
    { id: "progress", l: "Avance", v: `${pct} %`, h: `${done} de ${all.size} hechos` },
  ];
  return (
    <dl className="grid grid-cols-2 gap-3 @3xl:grid-cols-3" data-testid="agenda-month-stats">
      {cards.map((x) => (
        <div key={x.id} className="min-w-0 rounded-xl border border-line bg-card px-4 py-3.5" data-testid={`month-stat-${x.id}`}>
          <dt className="mb-1 text-[12.5px] font-semibold uppercase tracking-wider text-faint">{x.l}</dt>
          <dd className="text-[22px] font-semibold leading-snug">{x.v}</dd>
          <dd className="mt-0.5 text-[13.5px] text-dim">{x.h}</dd>
        </div>
      ))}
    </dl>
  );
}

/** La leyenda de colores de las áreas (más Bases). */
export function MonthLegend({ data, only = null, bases }: { data: TopicsByWeekArea; only?: string | null; bases: boolean }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13.5px]" aria-label="Leyenda de colores de las áreas" data-testid="month-legend">
      {data.areas.filter((a) => only === null || a.subplanId === only).map((a) => (
        <li key={a.subplanId} className="inline-flex items-center gap-1.5" data-area={a.areaId ?? a.subplanId}><AreaDot {...(a.areaId ? { areaId: a.areaId } : {})} />{a.area}</li>
      ))}
      {bases && only === null && <li className="inline-flex items-center gap-1.5"><span aria-hidden className="inline-block h-2.5 w-2.5 rounded-sm bg-accent" />Bases</li>}
    </ul>
  );
}

const CHIPS_SHOWN = 3;

function MonthAreaRow({ name, areaId, colour, topics, minutes, testid }: { name: string; areaId?: string; colour: string; topics: WeekAreaTopic[]; minutes: number; testid: string }) {
  const [open, setOpen] = useState(false);
  const shown = open ? topics : topics.slice(0, CHIPS_SHOWN);
  const rest = topics.length - CHIPS_SHOWN;
  return (
    <li className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 rounded-lg px-2.5 py-2" style={{ background: tint(colour), borderLeft: `3px solid ${colour}` }} data-testid={testid} data-area={areaId ?? name}>
      <span className="inline-flex flex-none basis-40 items-center gap-1.5 text-[14.5px]">
        <AreaDot {...(areaId ? { areaId } : {})} />
        <span className="font-semibold">{name}</span> <span className="whitespace-nowrap text-dim">{plural(topics.length, "tema", "temas")} · {hm(minutes)}</span>
      </span>
      <span className="flex min-w-0 flex-1 basis-60 flex-wrap items-center gap-1.5" data-testid="month-week-area-topics">
        {shown.map((t) => <span key={t.folder} className="max-w-full break-words rounded-md border border-line bg-card px-2 py-0.5 text-[13px]" title={t.folder}>{t.title}</span>)}
        {rest > 0 && (
          <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="inline-flex min-h-7 items-center rounded-md px-1.5 text-[13px] font-medium text-accent-text underline-offset-2 hover:underline" data-testid="month-week-area-more">
            {open ? "Ver menos" : `+${rest} más`}
          </button>
        )}
      </span>
    </li>
  );
}

/** Una semana del mes: fechas, marcador «Esta semana», una fila por área con sus temas como chips y Bases aparte. */
export function MonthWeekBlock({ m, week, summary, onPickWeek, only = null, deliverablesText }: { m: AgendaModel; week: number; summary: WeekSummary; onPickWeek: (date: string) => void; only?: string | null; deliverablesText?: string }) {
  const w = m.byWeekArea.weeks[week - 1];
  const current = m.today >= summary.start && m.today <= summary.end;
  const cells = (w?.cells ?? []).filter((c) => (only === null || c.subplanId === only) && c.topics.length > 0);
  const bases = only === null ? (w?.bases ?? []) : [];
  const none = cells.length === 0 && bases.length === 0;
  return (
    <li className={cn("rounded-2xl border bg-card p-3.5", current ? "border-accent" : "border-line")} data-testid="agenda-month-week" data-week={week} aria-current={current ? "date" : undefined}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-[16px] font-semibold">Semana {week} <span className="font-normal text-dim">· {dateLabel(summary.start)} – {dateLabel(summary.end)}</span></span>
        {current && <Chip large colour="var(--nv-mint)">Esta semana</Chip>}
        <span className="text-[14px] text-dim">{plural(summary.topics, "tema", "temas")}{deliverablesText ? ` · ${deliverablesText}` : ""}</span>
        <span className="flex-1" />
        <GhostButton aria-label={`Ver la semana ${week}`} onClick={() => onPickWeek(summary.start)}>Ver semana</GhostButton>
      </div>
      {none ? (
        <p className="mt-2 text-[13.5px] text-dim" data-testid="month-week-empty">Sin temas esta semana: repaso y práctica.</p>
      ) : (
        <ul className="mt-2 space-y-1.5" aria-label={`Temas de la semana ${week} por área`} data-testid="month-week-areas">
          {cells.map((c) => <MonthAreaRow key={c.subplanId} name={c.area} {...(c.areaId ? { areaId: c.areaId } : {})} colour={areaColour(c.areaId)} topics={c.topics} minutes={c.minutes} testid="month-week-area" />)}
          {bases.length > 0 && <MonthAreaRow name="Bases" colour="var(--nv-accent)" topics={bases} minutes={bases.reduce((n, t) => n + t.minutes, 0)} testid="month-week-bases" />}
        </ul>
      )}
    </li>
  );
}

