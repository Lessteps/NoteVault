// Mentor — Plan, Agenda: los tableros de las vistas SEMANA y MES. Todo sale del reparto (`m.byWeekArea`, que es `topicsByWeekArea`, el mismo
// cálculo que usa la Ejecución): aquí solo se presenta, SEGMENTADO POR CATEGORÍA (área) y con cada categoría claramente separada.
//
//  · `WeekStats`: tarjetas de CUMPLIMIENTO (temas hechos · teoría · práctica · katas · proyecto diario): cuentan cosas hechas, nunca horas.
//  · `RegisteredTime`: el único tiempo que se enseña es el que se REGISTRÓ con el Pomodoro («Tiempo registrado»); sin registro no pinta nada.
//  · `WeekDayStrip`: tira L…D con los temas de cada día y el marcador de hoy (pulsar abre el día; un día pasado vacío no se abre).
//  · `WeekCategories`: los temas de la semana EN EL ORDEN DE LA RUTA, con un conmutador «Por día | Por categoría»: filas alineadas con número,
//    código y título, tipo, estado (Hecho · Hoy · Pendiente) y día asignado.
//  · `MonthStats` / `MonthLegend` / `MonthWeekBlock`: el mes por semanas, cada semana con una fila por área y los temas como chips.

import { Check } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { BASES_KEY } from "../../lib/planAreaTopics";
import { dateLabel, type ScheduleDay, type WeekSummary } from "../../lib/planSchedule";
import { areaRouteTopics, basesRouteTopics, type TopicsByWeekArea, type WeekAreaCell, type WeekAreaTopic, type WeekAreas } from "../../lib/planTopicsByArea";
import { minutesBetween } from "../../lib/timeLog";
import { usePersistedNav } from "../../store/navState";
import { Chip, GhostButton } from "../common/forms";
import { cn } from "../ui";
import { AreaDot, areaColour } from "./AreaViews";
import { plural, type AgendaModel } from "./agendaKit";
import { useTimeLog } from "./AreaSession";
import { LoggedTime } from "./LoggedTime";
import { dayViewable, topicKindsByFolder, weekCompletion, weekTopicDone, type Fraction, type TopicKind } from "./mentorAreas";
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

/** Una tarjeta de cumplimiento: «3/8» con su barra. */
function CompletionCard({ id, label, f, hint }: { id: string; label: string; f: Fraction; hint: string }) {
  const pct = f.total ? Math.round((f.done / f.total) * 100) : 0;
  return (
    <div className="min-w-0 rounded-xl border border-line bg-card px-4 py-3.5" data-testid={`week-stat-${id}`}>
      <dt className="mb-1 text-[12.5px] font-semibold uppercase tracking-wider text-faint">{label}</dt>
      <dd className="text-[22px] font-semibold leading-snug" data-testid={`week-stat-${id}-value`}>{f.done}/{f.total}</dd>
      <dd className="mt-0.5 text-[13.5px] text-dim">{hint}</dd>
      <dd className="mt-2"><ProgressBar pct={pct} label={`${label}: ${f.done} de ${f.total}`} /></dd>
    </div>
  );
}

/**
 * Las cifras de CUMPLIMIENTO de una semana (no de horas): temas hechos, teoría, práctica, katas y proyecto diario, cada una «hechos/total» con su
 * barra. Katas y proyecto diario solo aparecen si la página los tiene esa semana. `only` = filtro del alcance (null = todo el plan).
 */
export function WeekStats({ m, week, only = null }: { m: AgendaModel; week: number; only?: string | null }) {
  const c = weekCompletion(m, only, week);
  return (
    <dl className="grid grid-cols-2 gap-3 @3xl:grid-cols-5" data-testid="agenda-week-stats">
      <CompletionCard id="done" label="Temas hechos" f={c.topics} hint={c.topics.total ? `${c.topics.total - c.topics.done} pendientes` : "sin temas esta semana"} />
      <CompletionCard id="theory" label="Teoría" f={c.theory} hint="temas" />
      <CompletionCard id="practice" label="Práctica" f={c.practice} hint="temas" />
      {c.katas.total > 0 && <CompletionCard id="katas" label="Katas" f={c.katas} hint={c.katas.total === 1 ? "kata de la semana" : "katas de la semana"} />}
      {c.projects.total > 0 && <CompletionCard id="projects" label="Proyecto diario" f={c.projects} hint={c.projects.total === 1 ? "proyecto de la semana" : "proyectos de la semana"} />}
    </dl>
  );
}

/** «Tiempo registrado: 1 h 20 min»: SOLO el tiempo que se registró con el Pomodoro (o a mano) en esa semana; sin registro no pinta nada. */
export function RegisteredTime({ planId, from, to, areaKey }: { planId: string; from: string; to: string; areaKey?: string }) {
  const { entries } = useTimeLog(planId);
  if (minutesBetween(entries, from, to, areaKey) <= 0) return null;
  return (
    <div data-testid="week-registered-time">
      <LoggedTime entries={entries} from={from} to={to} {...(areaKey ? { areaKey } : {})} className="text-[14px] text-dim" />
    </div>
  );
}

// ── Semana: tira de días ────────────────────────────────────────────────

/** Cuántos temas distintos toca cada día (los de las áreas y las Bases), contados desde el MISMO reparto por área que enseñan las tarjetas. */
export function topicsPerDay(w: WeekAreas): Map<string, number> {
  const out = new Map<string, number>();
  for (const list of [...w.cells.map((c) => c.topics), w.bases]) for (const t of list) for (const d of t.dates) out.set(d, (out.get(d) ?? 0) + 1);
  return out;
}

export function WeekDayStrip({ m, days, counts, onPick, only = null }: { m: AgendaModel; days: readonly ScheduleDay[]; counts: Map<string, number>; onPick: (date: string) => void; only?: string | null }) {
  return (
    <ol className="grid grid-cols-7 gap-1.5 @xl:gap-2" aria-label="Días de la semana" data-testid="agenda-week-strip">
      {days.map((d) => {
        const n = counts.get(d.date) ?? 0;
        const today = d.date === m.today;
        const long = `${DAY_LONG[d.dow - 1]} ${dayNum(d.date)}`;
        // un día pasado en que no se hizo nada no se abre (no hay nada que ver)
        const viewable = dayViewable(m, d, only);
        return (
          <li key={d.date} className="min-w-0">
            <button
              type="button"
              onClick={() => onPick(d.date)}
              disabled={!viewable}
              aria-current={today ? "date" : undefined}
              aria-label={`${long}: ${plural(n, "tema", "temas")}${today ? " (hoy)" : ""}${d.study ? "" : d.blocked ? " (bloqueado)" : " (descanso)"}.${viewable ? " Abrir el día" : " Sin actividad: no se abre"}`}
              data-testid="agenda-week-strip-day"
              data-date={d.date}
              data-count={n}
              className={cn("flex min-h-[4.25rem] w-full flex-col items-center justify-center gap-0.5 rounded-xl border px-1 py-2 transition-colors enabled:hover:bg-hover disabled:cursor-default focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent", today ? "border-accent bg-accent-soft" : "border-line bg-card", (!d.study || !viewable) && "opacity-70")}
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

// ── Semana: temas en el orden de la ruta ────────────────────────────────

/** «4.1», «T01»…: el código del tema, si su carpeta lo trae (y el título no lo repite). */
export function topicCode(folder: string, title: string): string | undefined {
  const last = folder.split("/").pop() ?? "";
  const code = /^(\d+(?:\.\d+)*)[\s._-]/.exec(last)?.[1] ?? /^(T\d+)$/i.exec(last)?.[1];
  return code && !title.startsWith(code) ? code : undefined;
}

/**
 * Los temas de una celda EN EL ORDEN DE LA RUTA del área (no por fecha): el tema 3 de la ruta va antes que el 4 aunque se hiciera otro día. Los que
 * la ruta no conoce (extras) van al final, en su orden de llegada.
 */
export function inRouteOrder(topics: readonly WeekAreaTopic[], route: ReadonlyArray<{ folder: string }>): WeekAreaTopic[] {
  const idx = new Map(route.map((r, i) => [r.folder, i] as const));
  return topics
    .map((t, i) => ({ t, i }))
    .sort((a, b) => (idx.get(a.t.folder) ?? Number.MAX_SAFE_INTEGER) - (idx.get(b.t.folder) ?? Number.MAX_SAFE_INTEGER) || a.i - b.i)
    .map((x) => x.t);
}

type Estado = "hecho" | "hoy" | "pendiente";
const ESTADO: Record<Estado, { label: string; colour: string }> = {
  hecho: { label: "Hecho", colour: "var(--nv-mint)" },
  hoy: { label: "Hoy", colour: "var(--nv-accent)" },
  pendiente: { label: "Pendiente", colour: "var(--nv-faint)" },
};
const estadoOf = (m: AgendaModel, t: WeekAreaTopic): Estado => (weekTopicDone(m, t) ? "hecho" : t.dates.includes(m.today) ? "hoy" : "pendiente");

interface WeekRow {
  t: WeekAreaTopic;
  estado: Estado;
  kinds: Array<TopicKind | "project">;
  area: string;
  areaId?: string;
}
interface WeekSection {
  key: string;
  /** la celda del área, o null para Bases */
  cell: WeekAreaCell | null;
  name: string;
  areaId?: string;
  rows: WeekRow[];
}

/** Las secciones de la semana (un área cada una, y Bases) con sus filas YA en el orden de la ruta. */
function weekSections(m: AgendaModel, w: WeekAreas, week: number, only: string | null): WeekSection[] {
  const kinds = topicKindsByFolder(m, week);
  const projects = new Set(m.schedule.days.filter((d) => d.week === week).flatMap((d) => (d.topicProjects ?? []).map((p) => p.folder)));
  const row = (t: WeekAreaTopic, area: string, areaId?: string): WeekRow => {
    const ks = kinds.get(t.folder);
    const list: Array<TopicKind | "project"> = ks && ks.size ? (["theory", "practice"] as TopicKind[]).filter((k) => ks.has(k)) : ["theory"];
    if (projects.has(t.folder)) list.push("project");
    return { t, estado: estadoOf(m, t), kinds: list, area, ...(areaId ? { areaId } : {}) };
  };
  const out: WeekSection[] = [];
  for (const c of w.cells) {
    if ((only !== null && c.subplanId !== only) || c.topics.length === 0) continue;
    out.push({ key: c.subplanId, cell: c, name: c.area, ...(c.areaId ? { areaId: c.areaId } : {}), rows: inRouteOrder(c.topics, areaRouteTopics(m.plan, c.subplanId)).map((t) => row(t, c.area, c.areaId)) });
  }
  if ((only === null || only === BASES_KEY) && w.bases.length > 0) out.push({ key: BASES_KEY, cell: null, name: "Bases", rows: inRouteOrder(w.bases, basesRouteTopics(m.plan)).map((t) => row(t, "Bases")) });
  return out;
}

const KIND_CHIP: Record<TopicKind | "project", { label: string; colour: string }> = {
  theory: { label: "Teoría", colour: "var(--nv-accent)" },
  practice: { label: "Práctica", colour: "var(--nv-practice, #c58be0)" },
  project: { label: "Proyecto", colour: "var(--nv-warn)" },
};
const dayShort = (iso: string): string => `${DAY_SHORT[dowOf(iso)]} ${dayNum(iso)}`;

/** Una fila de la lista de la semana, con columnas de ancho fijo: nº · código · título · tipo · estado · día · enlaces. */
function TopicRow({ m, r, seq, showArea }: { m: AgendaModel; r: WeekRow; seq: number; showArea: boolean }) {
  const { t } = r;
  const live = m.topicByFolder.get(t.folder);
  const est = ESTADO[r.estado];
  const code = topicCode(t.folder, t.title);
  const done = r.estado === "hecho";
  const dates = `${dayShort(t.dates[0] ?? "")}${t.dates.length > 1 ? ` +${t.dates.length - 1}` : ""}`;
  return (
    <li className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-[14px]", done && "text-dim")} data-testid="area-topic" data-folder={t.folder} data-estado={r.estado}>
      <span className="w-6 flex-none text-right tabular-nums text-faint" data-testid="area-topic-seq">{seq}</span>
      <span className="w-12 flex-none">{code && <span className="rounded bg-hover px-1.5 py-px font-mono text-[12px] text-dim" data-testid="area-topic-code">{code}</span>}</span>
      <span className="flex min-w-0 flex-1 basis-52 flex-wrap items-baseline gap-x-2" title={t.folder}>
        <TopicMenu folder={t.folder} title={t.title} trigger={<span className={cn("break-words", done ? "font-normal" : "font-medium")}>{t.title}</span>} className="hover:text-accent-text hover:underline" />
        {showArea && <span className="text-[12.5px] text-faint" data-testid="area-topic-area">{r.area}</span>}
        {t.minutes > 0 && <span className="whitespace-nowrap text-[12px] text-faint" data-testid="area-topic-minutes">est. {hm(t.minutes)}</span>}
      </span>
      <span className="inline-flex w-44 flex-none flex-wrap gap-1" data-testid="area-topic-kinds">
        {r.kinds.map((k) => <Chip key={k} large colour={KIND_CHIP[k].colour}>{KIND_CHIP[k].label}</Chip>)}
      </span>
      <span className="w-28 flex-none" data-testid="area-topic-state">
        <Chip large colour={est.colour}>{done && <Check size={13} aria-hidden />}{est.label}</Chip>
      </span>
      <span className="w-16 flex-none whitespace-nowrap text-dim" role="img" aria-label={`Día asignado: ${t.dates.map((d) => `${DAY_LONG[dowOf(d)]} ${dayNum(d)}`).join(", ")}`} data-testid="area-topic-days">{t.dates.length ? dates : "—"}</span>
      <span className="inline-flex w-28 flex-none items-center justify-end">
        {live?.found && (
          <>
            <button type="button" onClick={() => void openTopic(t.folder)} className="inline-flex min-h-8 items-center px-1.5 text-[12.5px] font-medium text-accent-text underline-offset-2 hover:underline" aria-label={`Ver tema ${t.title}`}>Ver tema</button>
            <TopicNoteLinks folder={t.folder} title={t.title} />
          </>
        )}
      </span>
    </li>
  );
}

function CategoryCard({ m, s, total, lost }: { m: AgendaModel; s: WeekSection; total?: { topics: number; minutes: number; done: number }; lost?: ReadonlyArray<unknown> }) {
  const uid = useId();
  const cell = s.cell!;
  const colour = areaColour(cell.areaId);
  const done = s.rows.filter((r) => r.estado === "hecho").length;
  const pct = s.rows.length ? Math.round((done / s.rows.length) * 100) : 0;
  return (
    <li className="min-w-0 overflow-hidden rounded-2xl border border-line bg-card" style={{ borderTop: `3px solid ${colour}` }} data-testid="week-area" data-area={cell.areaId ?? cell.subplanId} aria-labelledby={`${uid}-h`}>
      <div className="px-4 pb-3 pt-3" style={{ background: tint(colour) }}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h4 id={`${uid}-h`} className="inline-flex min-w-0 flex-1 basis-36 items-center gap-2 text-[17px] font-bold"><AreaDot {...(cell.areaId ? { areaId: cell.areaId } : {})} /> <span className="break-words">{cell.area}</span></h4>
          <span className="whitespace-nowrap text-[14px] font-medium" data-testid="week-area-count">{plural(s.rows.length, "tema", "temas")}</span>
        </div>
        <div className="mt-2 flex items-center gap-3">
          <div className="flex-1"><ProgressBar pct={pct} colour={colour} label={`Avance de ${cell.area} esta semana`} /></div>
          <span className="whitespace-nowrap text-[13px] text-dim" data-testid="week-area-progress">{done}/{s.rows.length} hechos</span>
        </div>
      </div>
      <ol className="divide-y divide-line px-4" aria-label={`Temas de ${cell.area} esta semana, en el orden de la ruta`}>
        {s.rows.map((r, i) => <TopicRow key={r.t.folder} m={m} r={r} seq={i + 1} showArea={false} />)}
      </ol>
      {total && <p className="border-t border-line px-4 py-2 text-[13px] text-dim" data-testid="week-area-total">En todo el plan: {plural(total.topics, "tema", "temas")} ({total.done} hechos){lost && lost.length > 0 ? ` · ${plural(lost.length, "tema sin día", "temas sin día")} en el reparto` : ""}</p>}
    </li>
  );
}

/** Los dos modos de la lista: por día (cada día con sus temas) o por categoría (cada área con su ruta). */
function ModeToggle({ mode, onChange }: { mode: "dia" | "categoria"; onChange: (m: "dia" | "categoria") => void }) {
  return (
    <div role="group" aria-label="Cómo se agrupan los temas" className="inline-flex rounded-lg border border-line bg-card p-0.5" data-testid="week-mode">
      {([["dia", "Por día"], ["categoria", "Por categoría"]] as const).map(([id, label]) => (
        <button key={id} type="button" aria-pressed={mode === id} onClick={() => onChange(id)} data-testid={`week-mode-${id}`} className={cn("min-h-8 rounded-md px-2.5 text-[13px] font-medium", mode === id ? "bg-accent text-white" : "text-dim hover:bg-hover hover:text-text")}>
          {label}
        </button>
      ))}
    </div>
  );
}

/**
 * Los temas de UNA semana, SIEMPRE en el orden de la ruta. Por categoría (por omisión): una sección por área (y Bases) con su numeración 1…n. Por día: cada
 * día de la semana («Lunes 20 · 4 temas») con los temas que le tocan, áreas en su orden fijo y cada una en el orden de la ruta.
 */
export function WeekCategories({ m, week, headingId, only = null }: { m: AgendaModel; week: number; headingId: string; only?: string | null }) {
  const [storedMode, setMode] = usePersistedNav<string>(`mentor.weekListMode.${m.plan.id}`, "categoria");
  const mode: "dia" | "categoria" = storedMode === "dia" ? "dia" : "categoria";
  const data: TopicsByWeekArea = m.byWeekArea;
  const w = data.weeks[week - 1];
  const sections = useMemo(() => (w ? weekSections(m, w, week, only) : []), [m, w, week, only]);
  if (!w) return null;
  const empty = w.cells.filter((c) => (only === null || c.subplanId === only) && c.topics.length === 0);
  const areaSections = sections.filter((s) => s.cell);
  const bases = sections.find((s) => !s.cell);
  const total = sections.reduce((n, s) => n + s.rows.length, 0);
  const days = m.schedule.days.filter((d) => d.week === week);
  return (
    <section aria-labelledby={headingId} data-testid="agenda-week-areas" className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h3 id={headingId} className={cn(SECTION, "flex-1")}>
          {mode === "dia" ? "Temas de la semana por día" : "Temas de la semana por categoría"} <span className="font-normal normal-case tracking-normal text-dim">({plural(total, "tema", "temas")} esta semana)</span>
        </h3>
        <ModeToggle mode={mode} onChange={setMode} />
      </div>
      {total === 0 && <p className="text-[14px] text-dim">Esta semana no tiene temas repartidos.</p>}
      {total > 0 && mode === "categoria" && (
        <>
          {areaSections.length > 0 && (
            <ul className="space-y-4" aria-label="Temas de la semana por área">
              {areaSections.map((s) => <CategoryCard key={s.key} m={m} s={s} total={data.totals[s.cell!.subplanId]!} lost={data.unscheduled[s.cell!.subplanId]} />)}
            </ul>
          )}
          {bases && (
            <section className="overflow-hidden rounded-2xl border border-line bg-card" style={{ borderTop: "3px solid var(--nv-accent)" }} data-testid="week-bases" aria-label="Bases de la semana">
              <div className="px-4 pb-3 pt-3" style={{ background: tint("var(--nv-accent)") }}>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <h4 className="min-w-0 flex-1 basis-36 text-[17px] font-bold">Bases · lógica aplicada</h4>
                  <span className="whitespace-nowrap text-[14px] font-medium" data-testid="week-bases-count">{plural(bases.rows.length, "fundamento", "fundamentos")}</span>
                </div>
                <p className="mt-1 text-[13px] text-dim">No son de ningún área: se intercalan en todas. {bases.rows.filter((r) => r.estado === "hecho").length}/{bases.rows.length} hechos.</p>
              </div>
              <ol className="divide-y divide-line px-4" aria-label="Temas de Bases esta semana, en el orden de la ruta">
                {bases.rows.map((r, i) => <TopicRow key={r.t.folder} m={m} r={r} seq={i + 1} showArea={false} />)}
              </ol>
            </section>
          )}
        </>
      )}
      {total > 0 && mode === "dia" && (
        <ol className="space-y-4" aria-label="Temas de la semana por día" data-testid="week-by-day">
          {days.map((d) => {
            const rows = sections.flatMap((s) => s.rows.filter((r) => r.t.dates.includes(d.date)));
            if (rows.length === 0) return null;
            const today = d.date === m.today;
            return (
              <li key={d.date} className={cn("overflow-hidden rounded-2xl border bg-card", today ? "border-accent" : "border-line")} data-testid="week-day-group" data-date={d.date}>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 bg-hover px-4 py-2.5">
                  <h4 className="text-[16px] font-bold capitalize">{DAY_LONG[d.dow - 1]} {dayNum(d.date)} <span className="font-medium normal-case text-dim">· {plural(rows.length, "tema", "temas")}</span></h4>
                  {today && <Chip large colour="var(--nv-accent)">Hoy</Chip>}
                </div>
                <ol className="divide-y divide-line px-4" aria-label={`Temas del ${DAY_LONG[d.dow - 1]} ${dayNum(d.date)}`}>
                  {rows.map((r, i) => <TopicRow key={`${r.t.folder}:${d.date}`} m={m} r={r} seq={i + 1} showArea={only === null} />)}
                </ol>
              </li>
            );
          })}
        </ol>
      )}
      {empty.length > 0 && total > 0 && (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13.5px] text-dim" data-testid="week-areas-empty">
          <span>Sin temas esta semana:</span>
          {empty.map((c) => <span key={c.subplanId} className="inline-flex items-center gap-1.5" data-area={c.areaId ?? c.subplanId}><AreaDot {...(c.areaId ? { areaId: c.areaId } : {})} />{c.area}<span className="text-faint">({c.review ? "repaso" : c.active ? "sin temas nuevos" : "fuera de su fase"})</span></span>)}
        </p>
      )}
    </section>
  );
}

// ── Mes ─────────────────────────────────────────────────────────────────

/** Cifras del mes, de CUMPLIMIENTO: temas del mes y temas hechos (temas distintos hechos de las semanas del mes), sin horas. */
export function MonthStats({ weeks, data, topics }: { weeks: readonly number[]; data: TopicsByWeekArea; topics: number }) {
  const all = new Map<string, boolean>();
  for (const wk of weeks) {
    const w = data.weeks[wk - 1];
    if (!w) continue;
    for (const t of [...w.cells.flatMap((c) => c.topics), ...w.bases]) all.set(t.folder, (all.get(t.folder) ?? true) && t.done);
  }
  const done = [...all.values()].filter(Boolean).length;
  const pct = all.size ? Math.round((done / all.size) * 100) : 0;
  return (
    <dl className="grid grid-cols-2 gap-3" data-testid="agenda-month-stats">
      <div className="min-w-0 rounded-xl border border-line bg-card px-4 py-3.5" data-testid="month-stat-topics">
        <dt className="mb-1 text-[12.5px] font-semibold uppercase tracking-wider text-faint">Temas del mes</dt>
        <dd className="text-[22px] font-semibold leading-snug">{topics}</dd>
        <dd className="mt-0.5 text-[13.5px] text-dim">{plural(weeks.length, "semana", "semanas")}</dd>
      </div>
      <div className="min-w-0 rounded-xl border border-line bg-card px-4 py-3.5" data-testid="month-stat-progress">
        <dt className="mb-1 text-[12.5px] font-semibold uppercase tracking-wider text-faint">Temas hechos</dt>
        <dd className="text-[22px] font-semibold leading-snug">{done}/{all.size}</dd>
        <dd className="mt-0.5 text-[13.5px] text-dim">{pct} % del mes</dd>
        <dd className="mt-2"><ProgressBar pct={pct} label={`Temas hechos del mes: ${done} de ${all.size}`} /></dd>
      </div>
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

function MonthAreaRow({ name, areaId, colour, topics, testid }: { name: string; areaId?: string; colour: string; topics: WeekAreaTopic[]; testid: string }) {
  const [open, setOpen] = useState(false);
  const shown = open ? topics : topics.slice(0, CHIPS_SHOWN);
  const rest = topics.length - CHIPS_SHOWN;
  return (
    <li className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 rounded-lg px-2.5 py-2" style={{ background: tint(colour), borderLeft: `3px solid ${colour}` }} data-testid={testid} data-area={areaId ?? name}>
      <span className="inline-flex flex-none basis-40 items-center gap-1.5 text-[14.5px]">
        <AreaDot {...(areaId ? { areaId } : {})} />
        <span className="font-semibold">{name}</span> <span className="whitespace-nowrap text-dim">{plural(topics.length, "tema", "temas")}</span>
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
          {cells.map((c) => <MonthAreaRow key={c.subplanId} name={c.area} {...(c.areaId ? { areaId: c.areaId } : {})} colour={areaColour(c.areaId)} topics={c.topics} testid="month-week-area" />)}
          {bases.length > 0 && <MonthAreaRow name="Bases" colour="var(--nv-accent)" topics={bases} testid="month-week-bases" />}
        </ul>
      )}
    </li>
  );
}

