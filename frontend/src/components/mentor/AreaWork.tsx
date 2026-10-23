// Mentor — Ejecución: el TRABAJO de un área (o de las Bases), con cuatro vistas en vez de una lista larga:
//   · Hoy: los temas que tocan hoy (con su parte y sus minutos).
//   · Semana: todos los temas repartidos esta semana (los de hoy llevan el aviso «Hoy»).
//   · Pendientes: lo que tocaba hasta hoy y no se terminó («Atrasado» si es de un día anterior).
//   · Repasos: el repaso espaciado de los temas del área — vencidos u hoy, esta semana, la próxima y después — con el acceso directo a la práctica
//     de repaso de cada tema. Es el MISMO calendario de repasos del módulo de estudio (`Repaso/<tema>.md`): practicar un tema lo reprograma.
// Debajo va la práctica diaria del área (katas). Solo lectura sobre el plan.

import { CalendarClock, Play } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { AreaPracticeView } from "../../lib/areaPracticeView";
import { api } from "../../lib/bridge";
import { bucketReviews, dueText, type ReviewRow } from "../../lib/planReviews";
import { dateLabel } from "../../lib/planSchedule";
import type { AreaSets } from "../../lib/planAreaLists";
import { useMentor } from "../../store/mentor";
import { usePomodoro } from "../../store/pomodoro";
import { cn } from "../ui";
import { Chip, GhostButton, PrimaryButton } from "../common/forms";
import { AreaPracticeBlock } from "./AreaPracticeBlock";
import { openTopic } from "./openTopic";
import { ProgressBar } from "./parts";
import { TopicRow, type BoardPractice, type BoardRow } from "./PlanBoard";

export type WorkView = "hoy" | "semana" | "pendientes" | "repasos";
const VIEWS: ReadonlyArray<{ id: WorkView; label: string }> = [
  { id: "hoy", label: "Temas de hoy" },
  { id: "semana", label: "Temas de la semana" },
  { id: "pendientes", label: "Pendientes" },
  { id: "repasos", label: "Por repasar" },
];

/** Los repasos del módulo de estudio, leídos una vez y recargados cuando cambia el plan. */
export function useReviewItems() {
  const planVersion = useMentor((s) => s.planVersion);
  const [data, setData] = useState<{ today: string; items: import("../../lib/types").ReviewItem[] } | null>(null);
  const load = useCallback(() => {
    void api.studyReviewsList().then((r) => setData(r && Array.isArray(r.items) ? r : { today: "", items: [] })).catch(() => setData({ today: "", items: [] }));
  }, []);
  useEffect(() => {
    load();
  }, [load, planVersion]);
  return { data, reload: load };
}

const dueColour = (inDays: number): string => (inDays < 0 ? "var(--nv-danger)" : inDays === 0 ? "var(--nv-warn)" : "var(--nv-accent)");

function ReviewList({ title, rows, colour }: { title: string; rows: ReviewRow[]; colour: string }) {
  if (!rows.length) return null;
  return (
    <section aria-label={title} data-testid="review-bucket">
      <h4 className="mb-1.5 flex items-center gap-2 px-1 text-[13px] font-semibold uppercase tracking-wider text-faint">
        {title} <span className="rounded-md bg-hover px-1.5 text-[12px] normal-case tracking-normal text-dim">{rows.length}</span>
      </h4>
      <ul className="space-y-1">
        {rows.map((r) => (
          <li key={r.path} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-line bg-surface px-3 py-2" data-testid="review-row" data-in-days={r.inDays}>
            <span className="min-w-0 flex-1 basis-56">
              <span className="block text-[15px] leading-snug">{r.title}</span>
              <span className="block text-[13px] text-dim">Repaso {r.level + 1} · {r.skills.slice(0, 3).join(", ") || "sin skills todavía"}</span>
            </span>
            <Chip colour={dueColour(r.inDays)}>{dueText(r.inDays)}</Chip>
            <GhostButton onClick={() => void openTopic(r.folder)} aria-label={`Ir a la práctica de repaso de ${r.title}`} data-testid="review-go">
              <Play size={13} aria-hidden style={{ color: colour }} /> Ir al repaso
            </GhostButton>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Un día de la semana de un área, con sus temas. */
export interface WeekDayView {
  date: string;
  /** «Lunes 12 oct» */
  label: string;
  rows: BoardRow[];
}

/** Una semana futura del plan (proyección), día a día. */
export interface UpcomingWeekView {
  week: number;
  start: string;
  end: string;
  days: WeekDayView[];
}

const UPCOMING_STEP = 4;

/** «Lo que viene»: los temas de las semanas siguientes, con su etiqueta de tiempo. Es la proyección del plan: se ve aunque la ruta sólida aún no los desbloquee. */
function UpcomingWeeks({ weeks, colour }: { weeks: UpcomingWeekView[]; colour: string }) {
  const [shown, setShown] = useState(UPCOMING_STEP);
  if (!weeks.length) return null;
  return (
    <section aria-label="Lo que viene" className="space-y-3" data-testid="work-upcoming">
      <h3 className="px-1 text-[13px] font-semibold uppercase tracking-wider text-faint">
        Lo que viene <span className="font-normal normal-case tracking-normal text-dim">· proyección de las próximas semanas</span>
      </h3>
      {weeks.slice(0, shown).map((w) => (
        <section key={w.week} aria-label={`Semana ${w.week}`} className="rounded-2xl border border-line bg-card p-3" data-testid="upcoming-week" data-week={w.week}>
          <h4 className="mb-1.5 flex flex-wrap items-center gap-2 px-1 text-[14px] font-semibold">
            Semana {w.week}
            <span className="font-mono text-[12.5px] font-normal text-dim">{dateLabel(w.start)} – {dateLabel(w.end)}</span>
          </h4>
          {w.days.map((d) => (
            <div key={d.date} data-date={d.date}>
              <p className="px-1 pt-1 text-[12.5px] font-medium text-dim first-letter:uppercase">{d.label}</p>
              <ul className="space-y-0.5" aria-label={`Temas de ${d.label}`}>
                {d.rows.map((r) => <TopicRow key={`${r.folder}:${r.meta ?? ""}`} r={r} colour={colour} />)}
              </ul>
            </div>
          ))}
        </section>
      ))}
      {shown < weeks.length && (
        <GhostButton large="md" onClick={() => setShown((n) => n + UPCOMING_STEP)} data-testid="upcoming-more">Ver {Math.min(UPCOMING_STEP, weeks.length - shown)} semanas más</GhostButton>
      )}
    </section>
  );
}

/** La semana en curso: un cajón por día, lo completado y el nivel de avance (media del avance de cada tema; un tema hecho cuenta 100 %). */
function WeekView({ days, today, colour, upcoming }: { days: WeekDayView[]; today: string; colour: string; upcoming?: UpcomingWeekView[] }) {
  const unique = new Map<string, BoardRow>();
  for (const d of days) for (const r of d.rows) if (!unique.has(r.folder) || r.done) unique.set(r.folder, r);
  const all = [...unique.values()];
  const done = all.filter((r) => r.done).length;
  const level = all.length ? Math.round(all.reduce((n, r) => n + (r.done ? 100 : r.pct ?? 0), 0) / all.length) : 0;
  return (
    <div className="space-y-4" data-testid="work-week">
      <div className="rounded-2xl border border-line bg-card p-4" data-testid="week-summary">
        <p className="flex flex-wrap items-baseline gap-x-3 text-[15px]">
          <strong className="text-[18px]">{done} de {all.length}</strong> temas completados esta semana
          <span className="flex-1" />
          <span className="text-dim">Nivel de avance <strong className="text-text">{level} %</strong></span>
        </p>
        <div className="mt-2"><ProgressBar pct={level} thick label="Nivel de avance de la semana" /></div>
      </div>
      {days.map((d) => {
        const isToday = d.date === today;
        const doneN = d.rows.filter((r) => r.done).length;
        const rows = d.rows.map((r) => ({
          ...r,
          tag: r.done ? { text: "Hecho", colour: "var(--nv-mint)" } : isToday ? { text: "Hoy", colour } : d.date < today ? { text: "Atrasado", colour: "var(--nv-warn)" } : undefined,
        }));
        return (
          <section key={d.date} aria-label={d.label} className={cn("rounded-2xl border bg-card p-3", isToday ? "border-accent/60" : "border-line")} data-testid="week-day" data-date={d.date}>
            <h4 className="mb-1.5 flex flex-wrap items-center gap-2 px-1 text-[14px] font-semibold">
              <span className="first-letter:uppercase">{d.label}</span>
              {isToday && <Chip colour={colour}>Hoy</Chip>}
              <span className="flex-1" />
              <span className="font-mono text-[12.5px] font-normal text-dim">{doneN}/{d.rows.length} hechos</span>
            </h4>
            {rows.length === 0 ? (
              <p className="px-2 py-1.5 text-[13.5px] text-faint">Sin temas de esta ruta este día.</p>
            ) : (
              <ul className="space-y-0.5" aria-label={`Temas de ${d.label}`}>
                {rows.map((r) => <TopicRow key={`${r.folder}:${r.meta ?? ""}`} r={r} colour={colour} />)}
              </ul>
            )}
          </section>
        );
      })}
      {upcoming && <UpcomingWeeks weeks={upcoming} colour={colour} />}
    </div>
  );
}

export function AreaWork({ planId, areaName, areaId, subtitle, loggedMinutes = 0, rows, todayRows, weekDays, upcoming, sets, today, colour, practice, reviews, plannedMinutes, onStartBlock }: {
  planId: string;
  areaName: string;
  areaId?: string;
  /** el objetivo del área, bajo el título */
  subtitle?: string;
  /** minutos ya registrados hoy en esta área */
  loggedMinutes?: number;
  /** todos los temas de la ruta (sin Bases en un área) */
  rows: BoardRow[];
  /** los temas de hoy, con su parte y sus minutos */
  todayRows: BoardRow[];
  /** la semana en curso día a día (lunes a domingo) */
  weekDays?: WeekDayView[];
  /** las semanas siguientes (proyección), debajo de la semana en curso */
  upcoming?: UpcomingWeekView[];
  sets: AreaSets;
  today: string;
  colour: string;
  practice?: BoardPractice;
  /** los repasos de los temas de esta área (ya unidos con el plan) */
  reviews: ReviewRow[];
  plannedMinutes: number;
  onStartBlock?: () => void;
}) {
  const buckets = useMemo(() => bucketReviews(reviews, today), [reviews, today]);
  const todayTag = { text: "Hoy", colour };
  const lists = useMemo(() => {
    const todayKeys = new Set(todayRows.map((r) => r.folder));
    // La ruta es sólida: el tiempo no la hace avanzar. «Hoy» = lo que se puede trabajar ahora, en orden de ruta: primero lo atrasado que sigue
    // abierto (los primeros temas sin terminar) y luego lo de hoy. Lo bloqueado no se ofrece aquí: espera en «Semana» y «Pendientes».
    const openLate = rows
      .filter((r) => sets.available.has(r.folder) && !r.done && !r.unlockOn && !todayKeys.has(r.folder))
      // «Atrasado» solo si su tiempo ya pasó con la ruta empezada; si no, es simplemente lo que toca ahora en el orden de la ruta
      .map((r) => ({ ...r, tag: r.time?.status === "pending" ? { text: "Atrasado", colour: "var(--nv-warn)" } : { text: "Toca ahora", colour } }));
    const openToday = todayRows.filter((r) => r.done || !r.unlockOn).map((r) => ({ ...r, tag: todayTag }));
    const todayList = [...openLate, ...openToday];
    const week = rows.filter((r) => sets.week.has(r.folder)).map((r) => ({ ...r, tag: r.done ? { text: "Hecho", colour: "var(--nv-mint)" } : sets.today.has(r.folder) ? todayTag : undefined }));
    const pending = rows
      .filter((r) => sets.pending.has(r.folder) && !r.done)
      .map((r) => ({ ...r, tag: { text: "Atrasado", colour: "var(--nv-warn)" } }));
    return { hoy: todayList, semana: week, pendientes: pending };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, todayRows, sets, colour]);

  const weekCount = weekDays ? new Set(weekDays.flatMap((d) => d.rows.map((r) => r.folder))).size : lists.semana.length;
  const counts: Record<WorkView, number> = { hoy: lists.hoy.length, semana: weekCount, pendientes: lists.pendientes.length, repasos: reviews.length };
  const [sel, setSel] = useState<WorkView>("hoy");
  const view = sel;
  const pa = practice?.areas.find((x) => x.areaId === areaId);
  const reviewsDue = buckets.today.length;
  const pendingToday = todayRows.filter((r) => !r.done).length;

  return (
    <section aria-label={`Trabajo de ${areaName}`} data-testid="area-work" className="min-w-0 space-y-4">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-3" data-testid="area-header">
        <span aria-hidden className="grid h-11 w-11 flex-none place-items-center rounded-xl text-[18px] font-bold text-white" style={{ background: colour }}>{areaName.slice(0, 1).toUpperCase()}</span>
        <div className="min-w-0 flex-1 basis-60">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[22px] font-bold leading-tight">{areaName}</h2>
            <Chip colour={pendingToday > 0 ? colour : "var(--nv-mint)"}>{pendingToday > 0 ? "En curso" : todayRows.length ? "Al día" : "Sin temas hoy"}</Chip>
            {reviewsDue > 0 && (
              <button type="button" onClick={() => setSel("repasos")} className="inline-flex min-h-7 items-center gap-1.5 rounded-md border border-warn/60 bg-warn-soft px-2 text-[12.5px] font-semibold text-warn" data-testid="reviews-due-chip">
                <CalendarClock size={13} aria-hidden /> {reviewsDue} {reviewsDue === 1 ? "repaso" : "repasos"} para hoy
              </button>
            )}
          </div>
          {subtitle && <p className="mt-0.5 line-clamp-2 text-[14px] text-dim" data-testid="area-subtitle">{subtitle}</p>}
        </div>
        {plannedMinutes > 0 && (
          <div className="min-w-44 rounded-xl border border-line bg-card px-3.5 py-2" data-testid="area-today-progress">
            <p className="text-[12px] text-dim">Progreso de hoy</p>
            <p className="font-mono text-[15px] font-bold">{loggedMinutes} / {plannedMinutes} min</p>
            <div className="mt-1"><ProgressBar pct={Math.min(100, Math.round((loggedMinutes / plannedMinutes) * 100))} label="Tiempo registrado hoy frente al previsto" /></div>
          </div>
        )}
        {onStartBlock && <PrimaryButton large onClick={onStartBlock} data-testid="start-block"><Play size={14} aria-hidden /> Iniciar bloque</PrimaryButton>}
      </header>

      <div role="group" aria-label="Qué ver" className="inline-flex max-w-full flex-wrap gap-1 rounded-xl border border-line bg-card p-1" data-testid="work-views">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            type="button"
            aria-pressed={view === v.id}
            onClick={() => setSel(v.id)}
            data-testid={`work-view-${v.id}`}
            className={cn("inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-[14px] font-medium", view === v.id ? "bg-accent text-white" : "text-dim hover:bg-hover hover:text-text")}
          >
            {v.label}
            <span className={cn("rounded-md px-1.5 text-[12px]", view === v.id ? "bg-white/20" : "bg-hover text-dim")}>{counts[v.id]}</span>
          </button>
        ))}
      </div>

      {view === "semana" && weekDays ? (
        weekCount === 0 ? (
          <div className="space-y-4">
            <p className="rounded-2xl border border-dashed border-line p-5 text-[14.5px] text-dim" data-testid="work-empty">Esta semana no hay temas repartidos en esta ruta.</p>
            {upcoming && <UpcomingWeeks weeks={upcoming} colour={colour} />}
          </div>
        ) : (
          <WeekView days={weekDays} today={today} colour={colour} {...(upcoming ? { upcoming } : {})} />
        )
      ) : view !== "repasos" ? (
        lists[view].length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line p-5 text-[14.5px] text-dim" data-testid="work-empty">
            {view === "hoy" ? "Hoy no toca ningún tema de esta ruta." : view === "semana" ? "Esta semana no hay temas repartidos en esta ruta." : "No tienes nada pendiente: un tema pasa aquí solo cuando se acaba su tiempo previsto sin completarlo."}
          </p>
        ) : (
          <div className="rounded-2xl border border-line bg-card p-3">
            {view === "hoy" && (
              <p className="mb-1.5 flex items-center gap-2 px-1.5 pt-0.5 font-mono text-[12px] font-semibold uppercase tracking-wider text-dim" data-testid="session-plan-header">
                <span aria-hidden className="inline-block h-2 w-2 rounded-full" style={{ background: colour }} /> Plan de sesión de hoy
                <span className="flex-1" />
                {plannedMinutes > 0 && <span className="normal-case tracking-normal">{plannedMinutes} min en total</span>}
              </p>
            )}
            <ul className="space-y-1" aria-label={VIEWS.find((v) => v.id === view)!.label} data-testid="work-list">
              {lists[view].map((r) => <TopicRow key={`${r.folder}:${r.meta ?? ""}`} r={r} colour={colour} />)}
            </ul>
          </div>
        )
      ) : reviews.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line p-5 text-[14.5px] text-dim" data-testid="work-empty">
          Aún no hay repasos programados en esta ruta. Cada tema que practiques programa su primer repaso a los 3 días y los siguientes a los 7, 14, 30, 60 y 120.
        </p>
      ) : (
        <div className="space-y-4 rounded-2xl border border-line bg-card p-4" data-testid="work-reviews">
          <ReviewList title="Vencidos y de hoy" rows={buckets.today} colour={colour} />
          <ReviewList title="Esta semana" rows={buckets.week} colour={colour} />
          <ReviewList title="La próxima semana" rows={buckets.nextWeek} colour={colour} />
          <ReviewList title="Más adelante" rows={buckets.later} colour={colour} />
          <p className="px-1 text-[13px] text-faint">Son los mismos repasos del módulo de estudio: practicar un tema lo reprograma solo.</p>
        </div>
      )}

      {pa && practice && <AreaPracticeBlock planId={planId} area={pa as AreaPracticeView} mark={practice.mark} />}
    </section>
  );
}

/** Empieza un foco del Pomodoro en un área (el atajo «Iniciar bloque»); si ya hay uno en marcha, no hace nada. */
export function startAreaBlock(planId: string, areaKey: string): boolean {
  const st = usePomodoro.getState();
  if (st.p.phase !== "idle") return false;
  st.start(planId, areaKey);
  return true;
}
