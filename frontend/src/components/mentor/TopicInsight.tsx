// Mentor — detalle de UN tema, desplegable bajo su fila (Ejecución «Temas de hoy» y Planeación «Temas <Área>»).
// Responde a lo que el resto del Mentor no enseña: ¿trabajé la teoría?, ¿cuántos ejercicios llevo?, ¿cuándo fue la última práctica y el último repaso?
//
// Fuentes (todas ya existentes; no se añade ningún escaneo de la vault):
//   · `study_topic_get` (por carpeta): el mismo progreso que el panel de temas de Estudio — notas de teoría, ejercicios, intentos y aprobados por skill.
//   · `study_reviews_list`: el calendario de repasos de Estudio — última práctica, repaso siguiente y nivel.
//   · `mentor_timelog_get` (por plan, solo si se da `planId`): los bloques registrados con su tipo de trabajo — así se sabe si la teoría se trabajó.
// El panel solo se monta al desplegar (no lee nada antes) y guarda lo leído por carpeta unos segundos.

import { BookOpen, ChevronDown, ChevronRight, Dumbbell } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { api } from "../../lib/bridge";
import { dueText } from "../../lib/planReviews";
import type { ReviewItem, TopicData, TopicProgress } from "../../lib/types";
import { cn } from "../ui";
import { Chip } from "../common/forms";
import { openTopic, openTopicNote } from "./openTopic";
import { dayText, hm, ProgressBar } from "./parts";

// ── datos ────────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface WorkSummary {
  sessions: number;
  minutes: number;
  /** último día registrado (`YYYY-MM-DD`) */
  last: string;
}

export interface InsightData {
  /** `null`: no se pudo leer el tema */
  topic: TopicData | null;
  review: ReviewItem | null;
  theory: WorkSummary | null;
  practice: WorkSummary | null;
}

const TTL_MS = 30_000;
const cache = new Map<string, { at: number; p: Promise<InsightData> }>();
let reviewsCache: { at: number; p: Promise<ReviewItem[]> } | null = null;
const logCache = new Map<string, { at: number; p: Promise<import("../../lib/timeLog").TimeEntry[]> }>();

/** Olvida lo leído (tras practicar o generar algo, y en las pruebas). */
export function clearTopicInsightCache(): void {
  cache.clear();
  logCache.clear();
  reviewsCache = null;
}

function readReviews(): Promise<ReviewItem[]> {
  if (!reviewsCache || Date.now() - reviewsCache.at > TTL_MS) {
    reviewsCache = { at: Date.now(), p: api.studyReviewsList().then((r) => (r && Array.isArray(r.items) ? r.items : [])).catch(() => []) };
  }
  return reviewsCache.p;
}

function readLog(planId: string): Promise<import("../../lib/timeLog").TimeEntry[]> {
  const hit = logCache.get(planId);
  if (hit && Date.now() - hit.at <= TTL_MS) return hit.p;
  const p = api.mentorTimeLogGet(planId).then((r) => (r && Array.isArray(r.entries) ? r.entries : [])).catch(() => []);
  logCache.set(planId, { at: Date.now(), p });
  return p;
}

const summarize = (entries: ReadonlyArray<import("../../lib/timeLog").TimeEntry>, folder: string, work: "theory" | "practice"): WorkSummary | null => {
  const mine = entries.filter((e) => e.work === work && e.topics?.includes(folder));
  if (!mine.length) return null;
  return { sessions: mine.length, minutes: mine.reduce((n, e) => n + e.minutes, 0), last: mine.map((e) => e.date).sort().at(-1)! };
};

function loadInsight(folder: string, planId?: string): Promise<InsightData> {
  const key = `${planId ?? ""}::${folder}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at <= TTL_MS) return hit.p;
  const p = Promise.all([
    api.studyTopicGet(folder).catch(() => null),
    readReviews(),
    planId ? readLog(planId) : Promise.resolve([]),
  ]).then(([topic, reviews, log]): InsightData => ({
    topic: topic ?? null,
    review: reviews.find((it) => it.kind !== "vocab" && (it.topicPath === folder || it.topicPath.startsWith(`${folder}/`))) ?? null,
    theory: summarize(log, folder, "theory"),
    practice: summarize(log, folder, "practice"),
  }));
  cache.set(key, { at: Date.now(), p });
  return p;
}

/** Lee el detalle del tema; solo se pide al montarse (el panel se monta al desplegar). */
export function useTopicInsight(folder: string, planId?: string): { data: InsightData | null; loading: boolean } {
  const [state, setState] = useState<{ key: string; data: InsightData } | null>(null);
  const key = `${planId ?? ""}::${folder}`;
  useEffect(() => {
    let alive = true;
    void loadInsight(folder, planId).then((d) => alive && setState({ key, data: d }));
    return () => {
      alive = false;
    };
  }, [folder, planId, key]);
  const data = state && state.key === key ? state.data : null;
  return { data, loading: !data };
}

// ── resumen ──────────────────────────────────────────────────────────────────────────────────────────────────────────

export type InsightState = "completo" | "en_curso" | "sin_tratar";

export interface ExerciseSummary {
  attempts: number;
  passed: number;
  /** aprobados que pide el plan del tema (0 si no hay plan) */
  required: number;
  /** ejercicios que existen en la carpeta */
  total: number;
  best: number | null;
  skills: Array<{ skill: string; label: string; attempts: number; passed: number; required: number; best: number | null }>;
}

export function summarizeExercises(progress: TopicProgress | undefined, total: number): ExerciseSummary {
  const skills = Object.values(progress?.skills ?? {}).map((s) => {
    const cells = Object.values(s.cells ?? {});
    return { skill: s.skill, label: s.label || s.skill, attempts: s.totalAttempts, passed: s.totalPasses, required: cells.reduce((n, c) => n + (c.required ?? 0), 0), best: s.bestScore };
  });
  const bests = skills.map((s) => s.best).filter((b): b is number => typeof b === "number");
  return {
    attempts: skills.reduce((n, s) => n + s.attempts, 0),
    passed: skills.reduce((n, s) => n + s.passed, 0),
    required: skills.reduce((n, s) => n + s.required, 0),
    total,
    best: bests.length ? Math.max(...bests) : null,
    skills,
  };
}

export function insightState(d: InsightData, ex: ExerciseSummary): InsightState {
  const p = d.topic?.progress;
  if (p?.isComplete || (p?.completenessPct ?? 0) >= 100) return "completo";
  if (ex.attempts > 0 || d.theory || d.practice || d.review) return "en_curso";
  return "sin_tratar";
}

const STATE_TEXT: Record<InsightState, { label: string; colour: string }> = {
  completo: { label: "Completo", colour: "var(--nv-mint)" },
  en_curso: { label: "En curso", colour: "var(--nv-accent)" },
  sin_tratar: { label: "Sin tratar", colour: "var(--nv-dim)" },
};

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

// ── vista ────────────────────────────────────────────────────────────────────────────────────────────────────────────

function Item({ label, children, testid }: { label: string; children: React.ReactNode; testid: string }) {
  return (
    <div className="min-w-0" data-testid={testid}>
      <dt className="font-mono text-[11.5px] font-semibold uppercase tracking-wider text-faint">{label}</dt>
      <dd className="mt-0.5 text-[14px] leading-snug">{children}</dd>
    </div>
  );
}

const LINK = "inline-flex min-h-8 items-center gap-1.5 rounded-md border border-line px-2.5 text-[13px] font-medium text-accent-text hover:bg-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent";

export function TopicInsight({ folder, planId, compact, title }: { folder: string; planId?: string; /** una columna y sin barras por skill (filas estrechas) */ compact?: boolean; title?: string }) {
  const { data, loading } = useTopicInsight(folder, planId);
  const name = title ?? folder.split("/").pop() ?? folder;
  const uid = useId();
  const shell = "rounded-xl border border-line bg-card px-3.5 py-3 text-text";
  if (loading) {
    return <section aria-label={`Detalle de ${name}`} aria-busy="true" className={shell} data-testid="topic-insight" data-loading="true"><p className="text-[13.5px] text-dim">Cargando el detalle del tema...</p></section>;
  }
  const d = data!;
  const topic = d.topic;
  const known = !!topic?.is_topic;
  const ex = summarizeExercises(topic?.progress, topic?.exercises?.length ?? topic?.progress?.exerciseNotesCount ?? 0);
  const theoryNotes = topic?.progress?.theoryNotesCount ?? topic?.theory_notes?.length ?? 0;
  const st = insightState(d, ex);
  const den = ex.required > 0 ? ex.required : ex.total;
  const done = den > 0 ? Math.min(ex.passed, den) : ex.passed;
  const pct = topic?.progress ? Math.round(topic.progress.completenessPct) : 0;

  return (
    <section aria-labelledby={`${uid}-h`} className={shell} data-testid="topic-insight" data-state={st}>
      <header className="mb-2.5 flex flex-wrap items-center gap-2">
        <h4 id={`${uid}-h`} className="text-[14px] font-semibold">Detalle de {name}</h4>
        <Chip large colour={STATE_TEXT[st].colour}>{STATE_TEXT[st].label}</Chip>
        {known && <span className="font-mono text-[12.5px] text-dim" data-testid="insight-pct">{pct} % de avance</span>}
      </header>

      {!topic && <p className="text-[13.5px] text-warn" data-testid="insight-error">No se pudo leer este tema. Comprueba que su carpeta existe en la vault.</p>}
      {topic && !known && <p className="mb-2 text-[13.5px] text-dim" data-testid="insight-nomanifest">Este tema todavía no tiene su archivo de práctica (_tema.md), así que no hay intentos que contar.</p>}

      <dl className={cn("grid gap-x-6 gap-y-3", compact ? "grid-cols-1" : "sm:grid-cols-2 lg:grid-cols-4")}>
        <Item label="Teoría" testid="insight-theory">
          {d.theory ? (
            <>
              <strong>Trabajada</strong>: {plural(d.theory.sessions, "bloque", "bloques")} · {hm(d.theory.minutes)}
              <span className="block text-[13px] text-dim">Último: {dayText(d.theory.last)}</span>
            </>
          ) : theoryNotes > 0 ? (
            <>
              <span className="text-warn">Sin trabajar todavía</span>
              <span className="block text-[13px] text-dim">{plural(theoryNotes, "apunte creado", "apuntes creados")}{planId ? ", sin bloques de teoría registrados" : ""}</span>
            </>
          ) : (
            <span className="text-warn">Aún no hay apunte de teoría</span>
          )}
        </Item>

        <Item label="Ejercicios" testid="insight-exercises">
          {den > 0 || ex.attempts > 0 ? (
            <>
              <strong data-testid="insight-exercises-count">{done} de {den}</strong> aprobados
              <span className="block text-[13px] text-dim">{plural(ex.attempts, "intento", "intentos")}{ex.best !== null ? ` · mejor nota ${Math.round(ex.best)}` : ""}</span>
              {den > 0 && <span className="mt-1 block"><ProgressBar pct={(done / den) * 100} label={`Ejercicios aprobados de ${name}`} /></span>}
            </>
          ) : (
            <span className="text-warn">Sin ejercicios todavía</span>
          )}
        </Item>

        <Item label="Última práctica" testid="insight-last">
          {d.review?.last ? (
            <>
              {dayText(d.review.last)}
              {d.practice && <span className="block text-[13px] text-dim">{plural(d.practice.sessions, "bloque", "bloques")} de práctica · {hm(d.practice.minutes)}</span>}
            </>
          ) : d.practice ? (
            <>
              {dayText(d.practice.last)}
              <span className="block text-[13px] text-dim">{plural(d.practice.sessions, "bloque", "bloques")} de práctica · {hm(d.practice.minutes)}</span>
            </>
          ) : (
            <span className="text-dim">Aún no has practicado este tema</span>
          )}
        </Item>

        <Item label="Repaso" testid="insight-review">
          {d.review ? (
            <>
              {dayText(d.review.next)} <span className={cn("text-[13px]", d.review.inDays <= 0 ? "font-semibold text-warn" : "text-dim")}>({dueText(d.review.inDays).toLowerCase()})</span>
              <span className="block text-[13px] text-dim">Repaso {d.review.level + 1} · último {d.review.last ? dayText(d.review.last) : "sin fecha"}</span>
            </>
          ) : (
            <span className="text-dim">Sin repaso programado: se programa al practicar</span>
          )}
        </Item>
      </dl>

      {!compact && ex.skills.length > 0 && (
        <ul className="mt-3 grid gap-x-6 gap-y-1.5 sm:grid-cols-2" aria-label="Ejercicios por skill" data-testid="insight-skills">
          {ex.skills.map((s) => (
            <li key={s.skill} className="min-w-0 text-[13px]" data-testid="insight-skill">
              <span className="flex items-baseline gap-2">
                <span className="min-w-0 flex-1 truncate" title={s.label}>{s.label}</span>
                <span className="flex-none font-mono text-dim">{s.required > 0 ? `${Math.min(s.passed, s.required)}/${s.required}` : `${s.attempts} int.`}</span>
              </span>
              {s.required > 0 && <ProgressBar pct={(Math.min(s.passed, s.required) / s.required) * 100} label={`${s.label}: aprobados`} />}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2" role="group" aria-label={`Abrir ${name}`}>
        <button type="button" className={LINK} onClick={() => void openTopicNote(folder)} data-testid="insight-open-theory"><BookOpen size={14} aria-hidden /> Abrir teoría</button>
        <button type="button" className={LINK} onClick={() => void openTopic(folder)} data-testid="insight-open-practice"><Dumbbell size={14} aria-hidden /> Abrir ejercicios</button>
      </div>
    </section>
  );
}

/** El botón (flecha) que abre/cierra el detalle de un tema. */
export function InsightToggle({ open, onToggle, title, controls, className }: { open: boolean; onToggle: () => void; title: string; controls?: string; className?: string }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      {...(controls ? { "aria-controls": controls } : {})}
      aria-label={`${open ? "Ocultar" : "Ver"} el detalle de ${title}`}
      title="Teoría, ejercicios hechos, última práctica y repaso"
      data-testid="insight-toggle"
      className={cn("inline-grid h-7 w-7 flex-none place-items-center rounded-md text-dim hover:bg-hover hover:text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent", className)}
    >
      {open ? <ChevronDown size={15} aria-hidden /> : <ChevronRight size={15} aria-hidden />}
    </button>
  );
}
