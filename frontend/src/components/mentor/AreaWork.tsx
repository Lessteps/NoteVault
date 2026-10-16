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
import type { AreaSets } from "../../lib/planAreaLists";
import { useMentor } from "../../store/mentor";
import { usePomodoro } from "../../store/pomodoro";
import { cn } from "../ui";
import { Chip, GhostButton } from "../common/forms";
import { AreaPracticeBlock } from "./AreaPracticeBlock";
import { openTopic } from "./openTopic";
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

export function AreaWork({ planId, areaName, areaId, rows, todayRows, sets, today, colour, practice, reviews, plannedMinutes, onStartBlock }: {
  planId: string;
  areaName: string;
  areaId?: string;
  /** todos los temas de la ruta (sin Bases en un área) */
  rows: BoardRow[];
  /** los temas de hoy, con su parte y sus minutos */
  todayRows: BoardRow[];
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
    const todayList = todayRows.map((r) => ({ ...r, tag: todayTag }));
    const week = rows.filter((r) => sets.week.has(r.folder)).map((r) => ({ ...r, tag: sets.today.has(r.folder) ? todayTag : undefined }));
    const pending = rows
      .filter((r) => sets.pending.has(r.folder) && !r.done)
      .map((r) => ({ ...r, tag: sets.today.has(r.folder) ? todayTag : { text: "Atrasado", colour: "var(--nv-warn)" } }));
    return { hoy: todayList, semana: week, pendientes: pending };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, todayRows, sets, colour]);
  const counts: Record<WorkView, number> = { hoy: lists.hoy.length, semana: lists.semana.length, pendientes: lists.pendientes.length, repasos: reviews.length };
  const [sel, setSel] = useState<WorkView>("hoy");
  const view = sel;
  const pa = practice?.areas.find((x) => x.areaId === areaId);
  const reviewsDue = buckets.today.length;

  return (
    <section aria-label={`Trabajo de ${areaName}`} data-testid="area-work" className="min-w-0 space-y-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 className="text-[19px] font-bold">{areaName}</h2>
        {plannedMinutes > 0 && <span className="text-[14px] text-dim">{plannedMinutes} min previstos hoy</span>}
        <span className="flex-1" />
        {reviewsDue > 0 && (
          <button type="button" onClick={() => setSel("repasos")} className="inline-flex min-h-8 items-center gap-1.5 rounded-md border border-warn/60 bg-warn-soft px-2.5 text-[13px] font-semibold text-warn" data-testid="reviews-due-chip">
            <CalendarClock size={14} aria-hidden /> {reviewsDue} {reviewsDue === 1 ? "repaso" : "repasos"} para hoy
          </button>
        )}
        {onStartBlock && <GhostButton large onClick={onStartBlock} data-testid="start-block"><Play size={14} aria-hidden /> Iniciar bloque</GhostButton>}
      </div>

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

      {view !== "repasos" ? (
        lists[view].length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line p-5 text-[14.5px] text-dim" data-testid="work-empty">
            {view === "hoy" ? "Hoy no toca ningún tema de esta ruta." : view === "semana" ? "Esta semana no hay temas repartidos en esta ruta." : "No tienes nada pendiente: lo que tocaba hasta hoy está hecho."}
          </p>
        ) : (
          <ul className="space-y-1 rounded-2xl border border-line bg-card p-3" aria-label={VIEWS.find((v) => v.id === view)!.label} data-testid="work-list">
            {lists[view].map((r) => <TopicRow key={`${r.folder}:${r.meta ?? ""}`} r={r} colour={colour} />)}
          </ul>
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
