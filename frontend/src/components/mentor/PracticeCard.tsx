// Mentor — Plan: la pestaña «Práctica» (Programming practice), organizada como una página web por ÁREA.
//
// Arriba, el resumen de Programming practice (qué es, qué incluye este plan y «Abrir práctica»). Debajo, un selector por área (Todas las áreas ·
// Backend · Frontend · Databases · Tooling and Quality · Automation…) y, para el área elegida, SU sistema de práctica: el kata diario del área
// (seguimiento de lunes a domingo, racha, el kata de hoy con su enunciado y «Abrir kata»), sus habilidades clave con su progreso, el proyecto de
// la semana, los proyectos por semana y el proyecto mensual. «Todas las áreas» muestra una tarjeta compacta por área (kata de hoy y estado) y la
// pista general del plan (kata de lógica, proyecto semanal full stack, semanas y proyecto mensual).
//
// Todo son datos REALES: el estado se DERIVA del módulo `programming_practice` (intentos de los katas, proyectos `.pp.json`) y de las marcas que
// la persona hace aquí o en «Hoy»; nada se inventa. Lo único que escribe es la marca «hecho / saltado» de un kata (datos de la app, no notas).
// «Abrir práctica» abre el diálogo de práctica de programación que ya existe; las carpetas de las áreas se crean al «Ejecutar plan».

import { Check, ExternalLink, FolderOpen, SkipForward, Undo2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactElement } from "react";
import { api } from "../../lib/bridge";
import type { AreaPracticeView } from "../../lib/areaPracticeView";
import { KATA_LEVEL_LABEL } from "../../lib/areaPracticeSystem";
import { isoDow, shortWeekLabel } from "../../lib/planTime";
import {
  FOCUS_LABEL,
  PHASE_LABEL,
  PRACTICE_BLURB,
  PRACTICE_NAME,
  PRACTICE_PHASES,
  phasesText,
  weekTitle,
  type PhaseStatus,
  type PracticePhase,
  type PracticeTrack,
  type PracticeWeek,
} from "../../lib/practiceTrack";
import type { MentorAreaPractice, MentorPracticeStatus } from "../../lib/types";
import { useApp } from "../../store/app";
import { useMentor } from "../../store/mentor";
import { usePersistedNav } from "../../store/navState";
import { Chip, GhostButton, PrimaryButton } from "../common/forms";
import { cn } from "../ui";
import { usePracticeDialog } from "../practice/PracticeProjectDialog";
import { ProgressBar, hm } from "./parts";
import { Tabs, TabPanel } from "./planKit";
import { DAY_LONG, DAY_SHORT } from "./planShared";

export const PHASE_STATUS_LABEL: Record<PhaseStatus, string> = { pendiente: "Pendiente", en_curso: "En curso", hecho: "Hecho", saltado: "Saltado" };
export const PHASE_STATUS_COLOUR: Record<PhaseStatus, string> = { pendiente: "var(--nv-faint)", en_curso: "var(--nv-accent)", hecho: "var(--nv-mint)", saltado: "var(--nv-warn)" };
const PHASE_GLYPH: Record<PhaseStatus, string> = { pendiente: "○", en_curso: "◐", hecho: "●", saltado: "⤼" };
const PROJECT_STATE: Record<string, string> = { spec: "especificado", building: "en construcción", defended: "defendido", done: "cerrado" };
const PRACTICE_COLOUR = "var(--nv-practice, #c58be0)";

export const openPractice = (): void => usePracticeDialog.getState().show();

const dayLabel = (iso: string): string => `${DAY_SHORT[isoDow(iso) - 1]} ${Number(iso.slice(8))}`;
const dateLabel = (iso: string): string => `${DAY_LONG[isoDow(iso) - 1]} ${Number(iso.slice(8))}/${Number(iso.slice(5, 7))}`;

/** Resumen corto de la pista, para el borrador y la cabecera del plan. */
export function practiceSummary(track: PracticeTrack): string {
  const parts: string[] = [];
  if (track.kata) parts.push(`kata diario de ${hm(track.kata.minutesPerDay)}`);
  const wp = track.weeklyProject;
  if (wp) parts.push(`proyecto semanal full stack (${wp.sessionsPerWeek} ${wp.sessionsPerWeek === 1 ? "sesión" : "sesiones"} de ${hm(wp.minutesPerSession)}, foco ${wp.focusMode === "rotate" ? "rotativo" : FOCUS_LABEL[wp.focusMode]})`);
  if (track.monthlyProject) parts.push(`${track.monthlyProject.blocks.length} ${track.monthlyProject.blocks.length === 1 ? "proyecto mensual" : "proyectos mensuales"}`);
  return parts.join(" · ");
}

// ── Datos del sistema por área ──────────────────────────────────────────

export interface AreaPracticeState {
  data: MentorAreaPractice | null;
  loading: boolean;
  error: string;
  reload: () => void;
  mark: (areaId: string, date: string, status: "done" | "skipped" | null) => Promise<void>;
}

/** Carga el sistema de práctica por área del plan; se recarga cuando cambia el plan. */
export function usePlanAreaPractice(planId: string | undefined): AreaPracticeState {
  const planVersion = useMentor((s) => s.planVersion);
  const [data, setData] = useState<MentorAreaPractice | null>(null);
  const [loading, setLoading] = useState(!!planId);
  const [error, setError] = useState("");
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const load = useCallback(async () => {
    if (!planId) return;
    setLoading(true);
    setError("");
    try {
      const r = await api.mentorAreaPractice(planId);
      if (alive.current) setData(r && Array.isArray(r.areas) ? r : { today: "", ppReady: false, ppBase: "", areas: [] });
    } catch (e) {
      if (alive.current) setError((e as Error).message || "No se pudo leer la práctica por área.");
    } finally {
      if (alive.current) setLoading(false);
    }
  }, [planId]);
  useEffect(() => {
    void load();
  }, [load, planVersion]);
  const mark = useCallback(
    async (areaId: string, date: string, status: "done" | "skipped" | null) => {
      if (!planId) return;
      try {
        const r = await api.mentorAreaKataMark(planId, areaId, date, status);
        if (alive.current && r && Array.isArray(r.areas)) setData(r);
      } catch (e) {
        useApp.getState().toast("error", (e as Error).message);
      }
    },
    [planId],
  );
  return { data, loading, error, reload: () => void load(), mark };
}

// ── Piezas ──────────────────────────────────────────────────────────────

const CARD = "min-w-0 rounded-xl border border-line bg-card p-4";
const EYEBROW = "text-[13px] font-medium uppercase tracking-wide text-faint";

function PhaseChips({ week, status }: { week: PracticeWeek; status?: Record<PracticePhase, PhaseStatus> }) {
  return (
    <ul className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,13rem),1fr))] gap-1.5" aria-label={`Fases de la semana ${week.week}`}>
      {PRACTICE_PHASES.map((ph) => {
        const st: PhaseStatus = status?.[ph] ?? "pendiente";
        return (
          <li key={ph} className="flex min-w-0 flex-wrap items-center justify-between gap-x-2 gap-y-1 rounded-lg border border-line px-2.5 py-1.5 text-[14px]">
            <span className="font-medium">{PHASE_LABEL[ph]}</span>
            <Chip large colour={PHASE_STATUS_COLOUR[st]}>
              <span aria-hidden>{PHASE_GLYPH[st]}</span> {PHASE_STATUS_LABEL[st]}
            </Chip>
          </li>
        );
      })}
    </ul>
  );
}

const PAGE_CARD_STYLE = { borderTop: `3px solid ${PRACTICE_COLOUR}` } as const;

/** La pista GENERAL del plan: kata de lógica, proyecto de esta semana, semanas y proyecto mensual (como antes de separar por áreas). */
export function GeneralCards({ track, status, today, only }: { track: PracticeTrack; status: MentorPracticeStatus | null | undefined; today: string; /** solo estas tarjetas (por defecto, todas) */ only?: ReadonlyArray<"kata" | "project" | "weeks" | "monthly"> }) {
  const wp = track.weeklyProject;
  const weeks = wp?.weeks ?? [];
  const thisWeek = weeks.find((w) => today >= w.start && today <= w.end) ?? weeks.find((w) => w.start > today) ?? weeks[weeks.length - 1];
  const wStatus = status?.weeks.find((w) => w.week === thisWeek?.week);
  const kata = status?.kata;
  const cards: ReactElement[] = [];
  const todayDow = isoDow(today);

  if (track.kata) {
    cards.push(
      <section key="kata" className={CARD} style={PAGE_CARD_STYLE} data-testid="practice-kata" aria-labelledby="pc-kata">
        <div className={EYEBROW}>Reto diario</div>
        <h3 id="pc-kata" className="text-[16px] font-semibold leading-snug">Kata de lógica · {hm(track.kata.minutesPerDay)}</h3>
        <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Días del kata (semana de lunes a domingo)">
          {DAY_SHORT.map((d, i) => {
            const planned = track.kata!.days.includes(i + 1);
            const isToday = i + 1 === todayDow;
            return (
              <li key={d} className={`grid h-10 w-10 place-items-center rounded-lg border text-[14px] font-semibold ${planned ? "border-accent bg-accent-soft text-accent-text" : "border-line text-faint"} ${isToday ? "ring-2 ring-text ring-offset-2 ring-offset-card" : ""}`}>
                <span aria-hidden>{d}</span>
                <span className="sr-only">{DAY_LONG[i]}{planned ? ", día de kata" : ", sin kata"}{isToday ? ", hoy" : ""}</span>
              </li>
            );
          })}
        </ul>
        {kata && (
          <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[14px] text-dim">
            <span>{kata.doneDays}/{kata.plannedDays} días hechos</span>
            <span>· racha {kata.streak}</span>
            {kata.todayPlanned && <Chip large colour={kata.todayDone ? "var(--nv-mint)" : "var(--nv-warn)"}>Hoy: {kata.todayDone ? "hecho" : "pendiente"}</Chip>}
          </p>
        )}
        <p className="mt-2 text-[13.5px] text-faint">
          {status?.ppReady === false
            ? "No se encontró la carpeta programming_practice: el estado se anota a mano en los bloques de «Hoy»."
            : "Hecho = hay un intento calificado del kata (nota de 75 o más, sin ver la solución)."}
        </p>
      </section>,
    );
  }

  if (wp && thisWeek) {
    cards.push(
      <section key="project" className={CARD} style={PAGE_CARD_STYLE} data-testid="practice-project" aria-labelledby="pc-project">
        <div className={EYEBROW}>Proyecto de la semana {thisWeek.week} · {shortWeekLabel(thisWeek.start, thisWeek.end)}</div>
        <h3 id="pc-project" className="text-[16px] font-semibold leading-snug">{weekTitle(thisWeek)}</h3>
        <p className="mt-0.5 text-[14px] text-dim">Full stack: frontend + backend + base de datos · foco {FOCUS_LABEL[thisWeek.focus]}</p>
        {wStatus?.project && (
          <p className="mt-1 text-[14px] text-dim" data-testid="practice-project-linked">
            En tu práctica: «{wStatus.project.title}» ({PROJECT_STATE[wStatus.project.state]}{wStatus.project.score !== undefined ? ` · ${wStatus.project.score}/100` : ""})
          </p>
        )}
        <div className="mt-3">
          <PhaseChips week={thisWeek} status={wStatus?.phases} />
        </div>
        <ul className="mt-3 space-y-1 text-[14px] text-dim" aria-label="Sesiones de la semana">
          {thisWeek.sessions.map((s) => (
            <li key={s.date} className={s.date === today ? "font-semibold text-text" : ""}>
              {dayLabel(s.date)} · {hm(s.minutes)} · {phasesText(s.phases)}{s.date === today ? " · hoy" : ""}
            </li>
          ))}
          {!thisWeek.sessions.length && <li className="text-faint">Esta semana no tiene sesiones (días bloqueados o ya pasados).</li>}
        </ul>
        {wStatus && wStatus.source !== "none" && (
          <p className="mt-2 text-[13.5px] text-faint">{wStatus.source === "pp" ? "Estado derivado de tu práctica." : wStatus.source === "manual" ? "Estado anotado a mano en «Hoy»." : "Estado de tu práctica y de lo anotado en «Hoy»."}</p>
        )}
      </section>,
    );
  }

  if (wp && weeks.length > 1) {
    cards.push(
      <section key="weeks" className={CARD} style={PAGE_CARD_STYLE} data-testid="practice-weeks" aria-labelledby="pc-weeks">
        <div className={EYEBROW}>Planificación</div>
        <h3 id="pc-weeks" className="text-[16px] font-semibold leading-snug">Proyectos por semana <span className="text-[14px] font-normal text-dim">{weeks.length}</span></h3>
        <ol className="mt-2 max-h-96 space-y-1 overflow-y-auto pr-1 text-[14px]" aria-label="Proyectos semanales">
          {weeks.map((w) => {
            const st = status?.weeks.find((x) => x.week === w.week);
            const done = st ? PRACTICE_PHASES.filter((p) => st.phases[p] === "hecho").length : 0;
            return (
              <li key={w.week} className={w === thisWeek ? "rounded-lg border border-accent bg-accent-soft px-2.5 py-1.5" : "px-2.5 py-1.5"}>
                <span className="font-medium">Sem. {w.week}</span> <span className="text-faint">{shortWeekLabel(w.start, w.end)}</span>
                {w === thisWeek && <span className="ml-2 text-[13px] font-semibold text-accent-text">· esta semana</span>}
                <div className="text-dim">
                  {w.theme ? `${w.theme} · ` : ""}foco {FOCUS_LABEL[w.focus]}
                  {w.sessions.length ? ` · ${done}/4 fases` : " · sin sesiones"}
                </div>
              </li>
            );
          })}
        </ol>
      </section>,
    );
  }

  if (track.monthlyProject?.blocks.length) {
    cards.push(
      <section key="monthly" className={CARD} style={PAGE_CARD_STYLE} data-testid="practice-monthly" aria-labelledby="pc-monthly">
        <div className={EYEBROW}>Integración mayor</div>
        <h3 id="pc-monthly" className="text-[16px] font-semibold leading-snug">Proyecto mensual</h3>
        <ul className="mt-2 space-y-2 text-[14px]">
          {track.monthlyProject.blocks.map((b) => (
            <li key={b.fromWeek}>
              <span className="font-medium">Semanas {b.fromWeek}–{b.toWeek}</span>
              <div className="text-dim">{b.theme ?? "Un proyecto mayor que integra los semanales (por definir)"}</div>
            </li>
          ))}
        </ul>
      </section>,
    );
  }
  const shown = only ? cards.filter((c) => only.includes(String(c.key) as "kata")) : cards;
  if (!shown.length) return null;
  return <div className="grid items-start gap-4 @3xl:grid-cols-2 @6xl:grid-cols-3" data-testid="practice-general">{shown}</div>;
}

/** La semana de lunes a domingo de un área: cada día con su estado (hecho, saltado, pendiente, sin kata) y SIEMPRE con texto para lector de pantalla. */
function AreaWeekStrip({ area }: { area: AreaPracticeView }) {
  return (
    <ul className="mt-3 flex flex-wrap gap-1.5" aria-label={`Días del kata de ${area.label} (semana de lunes a domingo)`} data-testid="area-kata-week">
      {area.kata.week.map((d) => {
        const mark = d.state === "done" ? "●" : d.state === "skipped" ? "⤼" : d.planned ? "○" : "";
        return (
          <li
            key={d.date}
            className={cn(
              "grid h-11 w-11 place-items-center rounded-lg border text-[14px] font-semibold leading-none",
              d.state === "done" ? "border-mint bg-mint-soft text-text" : d.planned ? "border-accent bg-accent-soft text-accent-text" : "border-line text-faint",
              d.today && "ring-2 ring-text ring-offset-2 ring-offset-card",
            )}
          >
            <span aria-hidden>{DAY_SHORT[d.dow - 1]}</span>
            <span aria-hidden className="text-[12px]">{mark}</span>
            <span className="sr-only">
              {DAY_LONG[d.dow - 1]}
              {d.planned ? `, kata ${d.index}: ${d.state === "done" ? "hecho" : d.state === "skipped" ? "saltado" : "pendiente"}` : ", sin kata"}
              {d.today ? ", hoy" : ""}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

const FOLDER_MISSING = "Carpeta aún no creada: se crea al ejecutar el plan.";

/** El aviso de que la carpeta del área aún no existe (y dónde se crea). */
function FolderNotice({ area, ppReady, onExecute }: { area: AreaPracticeView; ppReady: boolean; onExecute?: () => void }) {
  if (area.folderReady) return <p className="text-[13.5px] text-faint" data-testid="area-folder-ready">Carpeta: <span className="font-mono">programming_practice/{area.folder}/</span></p>;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-warn/60 bg-surface px-3 py-2 text-[14px]" data-testid="area-folder-missing">
      <FolderOpen size={16} aria-hidden className="flex-none text-warn" />
      <span className="min-w-0 flex-1 basis-56">
        {FOLDER_MISSING} <span className="text-dim">{ppReady ? `Se creará en programming_practice/${area.folder}/ sin tocar nada de lo que ya existe.` : "Antes se instala el módulo programming_practice."}</span>
      </span>
      {onExecute && (
        <GhostButton onClick={onExecute} data-testid="area-open-execution">Ver «Ejecutar plan»</GhostButton>
      )}
    </div>
  );
}

export function KataToday({ area, ppBase, today, mark, onExecute, ppReady }: { area: AreaPracticeView; ppBase: string; today: string; mark: AreaPracticeState["mark"]; onExecute?: () => void; ppReady: boolean }) {
  const toast = useApp((s) => s.toast);
  const next = area.kata.next;
  const isToday = !!next && next.date === today;
  const todayState = area.kata.week.find((d) => d.today)?.state;
  const open = async () => {
    if (!next) return;
    try {
      await useApp.getState().openNote(`${ppBase}/${next.rel}`);
    } catch (e) {
      toast("error", (e as Error).message);
    }
  };
  return (
    <section className={CARD} style={PAGE_CARD_STYLE} data-testid="area-kata" aria-labelledby={`ak-${area.areaId}`}>
      <div className={EYEBROW}>Reto diario · {area.label}</div>
      <h3 id={`ak-${area.areaId}`} className="text-[16px] font-semibold leading-snug">
        {next ? `Kata ${isToday ? "de hoy" : "siguiente"} · ${next.kata.minutes} min` : "Sin katas en este plan"}
      </h3>
      <AreaWeekStrip area={area} />
      <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[14px] text-dim">
        <span data-testid="area-kata-count">{area.kata.doneDays}/{area.kata.plannedDays} días hechos</span>
        <span>· racha {area.kata.streak}</span>
        {area.kata.todayPlanned && <Chip large colour={area.kata.todayDone ? "var(--nv-mint)" : "var(--nv-warn)"}>Hoy: {area.kata.todayDone ? "hecho" : "pendiente"}</Chip>}
        {!area.kata.todayPlanned && <Chip large>Hoy no toca kata</Chip>}
      </p>
      {next && (
        <div className="mt-3 min-w-0 rounded-lg border border-line bg-surface/50 p-3" data-testid="area-kata-today">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="min-w-0 break-words text-[15px] font-semibold">{next.kata.title}</span>
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-1.5">
            <Chip large colour={PRACTICE_COLOUR}>{next.kata.skillName}</Chip>
            <Chip large>{KATA_LEVEL_LABEL[next.kata.level]}</Chip>
            <span className="text-[13.5px] text-dim">kata {area.kata.todayIndex || "·"} · {isToday ? "hoy" : dateLabel(next.date)}</span>
          </p>
          <p className="mt-2 break-words text-[14px] text-dim" data-testid="area-kata-summary">{next.summary}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {next.fileReady ? (
              <PrimaryButton onClick={() => void open()} data-testid="area-kata-open"><ExternalLink size={15} aria-hidden /> Abrir kata</PrimaryButton>
            ) : (
              <span className="text-[13.5px] text-faint" data-testid="area-kata-nofile">El archivo del kata aún no existe: {ppReady ? "se crea al ejecutar el plan." : "se crea al ejecutar el plan."}</span>
            )}
            {isToday && todayState !== "done" && (
              <GhostButton onClick={() => void mark(area.areaId, today, "done")} data-testid="area-kata-done"><Check size={15} aria-hidden /> Verificar y marcar hecho</GhostButton>
            )}
            {isToday && todayState === "pending" && (
              <GhostButton onClick={() => void mark(area.areaId, today, "skipped")} disabled={!area.kata.skip.allowed} title={area.kata.skip.allowed ? undefined : `Para saltar hace falta el ${area.kata.skip.neededPct} % de los katas hechos; llevas el ${area.kata.skip.pct} %`} data-testid="area-kata-skip"><SkipForward size={15} aria-hidden /> Saltar hoy</GhostButton>
            )}
            {isToday && (todayState === "done" || todayState === "skipped") && (
              <GhostButton onClick={() => void mark(area.areaId, today, null)}><Undo2 size={15} aria-hidden /> Quitar marca</GhostButton>
            )}
          </div>
        </div>
      )}
      <div className="mt-3">
        <FolderNotice area={area} ppReady={ppReady} onExecute={onExecute} />
      </div>
      <p className="mt-2 text-[13.5px] text-faint">Hecho = hay un intento calificado del kata (nota de 75 o más, sin ver la solución). No se puede marcar a mano sin esa verificación.</p>
    </section>
  );
}

function AreaSkills({ area }: { area: AreaPracticeView }) {
  return (
    <section className={CARD} style={PAGE_CARD_STYLE} data-testid="area-skills" aria-labelledby={`as-${area.areaId}`}>
      <div className={EYEBROW}>Habilidades clave</div>
      <h3 id={`as-${area.areaId}`} className="text-[16px] font-semibold leading-snug">
        {area.label} <span className="text-[14px] font-normal text-dim">{area.skills.length}</span>
      </h3>
      <p className="mt-0.5 text-[14px] text-dim">Cada kata trabaja una de estas habilidades, en orden. Nivel actual: <strong className="font-semibold text-text">{KATA_LEVEL_LABEL[area.level]}</strong>{area.levelSource === "measured" ? " (medido por tu práctica)" : " (declarado)"}.</p>
      <ul className="mt-3 space-y-2.5" aria-label={`Habilidades de ${area.label}`}>
        {area.skills.map((s) => (
          <li key={s.id} className="min-w-0 text-[14px]" data-testid="area-skill">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
              <span className="min-w-0 break-words font-medium">{s.name}</span>
              <span className="text-[13.5px] text-dim">{s.planned ? `${s.done}/${s.planned} katas` : "aún sin katas"}</span>
            </div>
            <ProgressBar pct={s.pct} colour={PRACTICE_COLOUR} label={`${s.name}: ${s.done} de ${s.planned} katas hechos`} />
            <details className="mt-0.5">
              <summary className="inline-flex min-h-8 cursor-pointer items-center text-[13.5px] text-accent-text">Cómo se mide y qué pide cada nivel</summary>
              <p className="mt-1 text-[13.5px] text-dim">{s.measure}</p>
              <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-[13.5px] text-dim">
                {s.levels.map((l) => <li key={l}>{l}</li>)}
              </ol>
            </details>
          </li>
        ))}
      </ul>
    </section>
  );
}

function AreaWeeklyProject({ area, track, status, today }: { area: AreaPracticeView; track: PracticeTrack; status: MentorPracticeStatus | null | undefined; today: string }) {
  const w = area.weeks.find((x) => x.week === area.weekly.week);
  const trackWeek = track.weeklyProject?.weeks.find((x) => x.week === area.weekly.week);
  const wStatus = status?.weeks.find((x) => x.week === area.weekly.week);
  if (!w) return null;
  return (
    <section className={CARD} style={PAGE_CARD_STYLE} data-testid="area-project" aria-labelledby={`ap-${area.areaId}`}>
      <div className={EYEBROW}>Proyecto de la semana {w.week} · {shortWeekLabel(w.start, w.end)}</div>
      <h3 id={`ap-${area.areaId}`} className="text-[16px] font-semibold leading-snug">{area.weekly.title}</h3>
      <p className="mt-0.5 break-words text-[14px] text-dim">{area.weekly.description}</p>
      <p className="mt-2 text-[14px] text-dim">{w.doneKatas}/{w.katas} katas de la semana</p>
      {w.skills.length > 0 && <p className="break-words text-[14px] text-dim">Habilidades de la semana: {w.skills.join(", ")}.</p>}
      {trackWeek && (
        <>
          <p className="mt-3 flex flex-wrap items-center gap-1.5 text-[14px]">
            <span className="font-medium">Proyecto full stack de la semana</span>
            <Chip large colour={w.focus ? PRACTICE_COLOUR : undefined}>foco {FOCUS_LABEL[trackWeek.focus]}</Chip>
            {w.focus && <span className="text-[13.5px] text-dim">esta semana el foco es {area.label}</span>}
          </p>
          {wStatus?.project && <p className="mt-1 text-[14px] text-dim">En tu práctica: «{wStatus.project.title}» ({PROJECT_STATE[wStatus.project.state]}{wStatus.project.score !== undefined ? ` · ${wStatus.project.score}/100` : ""})</p>}
          <div className="mt-2 grid items-start gap-3 @4xl:grid-cols-2 [&>*]:min-w-0">
            <div>
              <h4 className="text-[13.5px] font-semibold text-dim">Fases requeridas</h4>
              <div className="mt-1"><PhaseChips week={trackWeek} status={wStatus?.phases} /></div>
            </div>
            <div>
              <h4 className="text-[13.5px] font-semibold text-dim">Agenda de sesiones</h4>
              <ul className="mt-1 space-y-1 text-[14px] text-dim" aria-label="Sesiones de la semana">
                {trackWeek.sessions.map((s) => (
                  <li key={s.date} className={s.date === today ? "font-semibold text-text" : ""}>{dayLabel(s.date)} · {hm(s.minutes)} · {phasesText(s.phases)}{s.date === today ? " · hoy" : ""}</li>
                ))}
                {!trackWeek.sessions.length && <li className="text-faint">Esta semana no tiene sesiones.</li>}
              </ul>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

function AreaWeeks({ area }: { area: AreaPracticeView }) {
  return (
    <section className={CARD} style={PAGE_CARD_STYLE} data-testid="area-weeks" aria-labelledby={`aw-${area.areaId}`}>
      <div className={EYEBROW}>Planificación</div>
      <h3 id={`aw-${area.areaId}`} className="text-[16px] font-semibold leading-snug">Proyectos por semana <span className="text-[14px] font-normal text-dim">{area.weeks.length}</span></h3>
      <ol className="mt-2 max-h-96 space-y-1 overflow-y-auto pr-1 text-[14px]" aria-label={`Proyectos semanales de ${area.label}`}>
        {area.weeks.map((w) => (
          <li key={w.week} className={cn("px-2.5 py-1.5", w.current && "rounded-lg border border-accent bg-accent-soft")}>
            <span className="font-medium">Sem. {w.week}</span> <span className="text-faint">{shortWeekLabel(w.start, w.end)}</span>
            {w.current && <span className="ml-2 text-[13px] font-semibold text-accent-text">· esta semana</span>}
            {w.focus && <span className="ml-2 text-[13px] font-semibold">· foco {area.label}</span>}
            <div className="break-words text-dim">{w.title}{w.katas ? ` · ${w.doneKatas}/${w.katas} katas` : " · sin katas"}</div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function AreaMonthly({ area }: { area: AreaPracticeView }) {
  return (
    <section className={CARD} style={PAGE_CARD_STYLE} data-testid="area-monthly" aria-labelledby={`am-${area.areaId}`}>
      <div className={EYEBROW}>Integración mayor</div>
      <h3 id={`am-${area.areaId}`} className="text-[16px] font-semibold leading-snug">Proyecto mensual · {area.monthly.title}</h3>
      <p className="mt-0.5 break-words text-[14px] text-dim">{area.monthly.description}</p>
      {area.monthly.blocks.length > 0 && (
        <ol className="mt-3 space-y-2 text-[14px]" aria-label="Hitos del proyecto mensual">
          {area.monthly.blocks.map((b, i) => (
            <li key={b.fromWeek} className="flex min-w-0 items-start gap-2.5 rounded-lg border border-line px-3 py-2">
              <span aria-hidden className="grid h-6 w-6 flex-none place-items-center rounded-md bg-hover text-[13px] font-semibold">{i + 1}</span>
              <span className="min-w-0">
                <span className="font-medium">Semanas {b.fromWeek}–{b.toWeek}</span>
                <span className="block break-words text-dim">{b.theme ?? `Integra los proyectos semanales de ${area.label} (por definir)`}</span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/** La vista de UN área: su sistema de práctica completo. */
function AreaView({ area, data, track, status, today, mark, onExecute }: { area: AreaPracticeView; data: MentorAreaPractice; track: PracticeTrack; status: MentorPracticeStatus | null | undefined; today: string; mark: AreaPracticeState["mark"]; onExecute?: () => void }) {
  return (
    <div className="space-y-4" data-testid="practice-area-view">
      <p className="break-words text-[14px] text-dim">
        <span className="font-medium text-text">{area.name}.</span> {area.purpose}
        {area.languages.length > 0 && <> Lenguajes: {area.languages.join(", ")}.</>}
      </p>
      <div className="grid items-start gap-4 @3xl:grid-cols-2 [&>*]:min-w-0">
        <KataToday area={area} ppBase={data.ppBase} today={today} mark={mark} onExecute={onExecute} ppReady={data.ppReady} />
        <AreaSkills area={area} />
      </div>
      <AreaWeeklyProject area={area} track={track} status={status} today={today} />
      <div className="grid items-start gap-4 @3xl:grid-cols-2 [&>*]:min-w-0">
        <AreaWeeks area={area} />
        <AreaMonthly area={area} />
      </div>
    </div>
  );
}

/** La tarjeta compacta de un área en «Todas las áreas»: kata de hoy y estado. */
function AreaCompactCard({ area, today, onOpen }: { area: AreaPracticeView; today: string; onOpen: () => void }) {
  const next = area.kata.next;
  const isToday = !!next && next.date === today;
  return (
    <li className={CARD} style={PAGE_CARD_STYLE} data-testid="area-compact">
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <h4 className="min-w-0 break-words text-[16px] font-semibold">{area.label}</h4>
        <Chip large>{KATA_LEVEL_LABEL[area.level]}</Chip>
      </div>
      {next ? (
        <>
          <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[13.5px] text-dim">
            <span>{isToday ? "Kata de hoy" : `Siguiente: ${dateLabel(next.date)}`}</span>
            {area.kata.todayPlanned && <Chip large colour={area.kata.todayDone ? "var(--nv-mint)" : "var(--nv-warn)"}>Hoy: {area.kata.todayDone ? "hecho" : "pendiente"}</Chip>}
          </p>
          <p className="mt-1 break-words text-[14px] font-medium">{next.kata.title}</p>
          <p className="break-words text-[13.5px] text-dim">{next.kata.skillName} · {next.kata.minutes} min</p>
        </>
      ) : (
        <p className="mt-1 text-[14px] text-dim">Este plan no tiene días de kata.</p>
      )}
      <p className="mt-1.5 text-[13.5px] text-dim">{area.kata.doneDays}/{area.kata.plannedDays} días hechos · racha {area.kata.streak}</p>
      <p className="mt-1 text-[13px] text-faint">{area.folderReady ? `Carpeta creada: programming_practice/${area.folder}/` : FOLDER_MISSING}</p>
      <GhostButton className="mt-2" onClick={onOpen} aria-label={`Ver la práctica de ${area.label}`}>Ver {area.label}</GhostButton>
    </li>
  );
}

const ALL = "all";
export const practiceAreaKey = (planId: string): string => `mentor.practiceArea.${planId}`;

/** La pestaña «Práctica» del plan. `planId` activa el sistema por área; sin él (o sin áreas) se muestra solo la pista general. */
export function PracticeRow({ track, status, today, planId, onExecute }: { track: PracticeTrack; status: MentorPracticeStatus | null | undefined; today: string; planId?: string; onExecute?: () => void }) {
  const area = usePlanAreaPractice(planId);
  const [sel, setSel] = usePersistedNav<string>(practiceAreaKey(planId ?? "none"), ALL);
  const areas = area.data?.areas ?? [];
  const hasAreas = areas.length > 0;
  const current = sel !== ALL ? areas.find((a) => a.areaId === sel) : undefined;
  const active = current ? current.areaId : ALL;
  const tabs = hasAreas ? [{ id: ALL, label: "Todas las áreas" }, ...areas.map((a) => ({ id: a.areaId, label: a.label }))] : [];
  const general = <GeneralCards track={track} status={status} today={today} />;
  if (!track.kata && !track.weeklyProject && !track.monthlyProject && !hasAreas) return null;
  const done = areas.reduce((n, a) => n + a.kata.doneDays, 0);
  const planned = areas.reduce((n, a) => n + a.kata.plannedDays, 0);
  return (
    <section className="space-y-4" data-testid="practice-row" aria-labelledby="pr-title">
      <div className="rounded-2xl border border-line bg-card p-4 @3xl:p-5" data-testid="practice-header">
        <div className="flex flex-wrap items-start gap-x-4 gap-y-3">
          <div className="min-w-0 flex-1 basis-80">
            <h2 id="pr-title" className="text-[22px] font-bold leading-tight tracking-tight @3xl:text-[26px]">{PRACTICE_NAME}</h2>
            <p className="mt-1.5 max-w-3xl break-words text-[15px] leading-relaxed text-dim" data-testid="practice-blurb">
              {PRACTICE_BLURB}{hasAreas ? " Cada área del plan tiene además su propia práctica diaria, con sus katas y sus habilidades clave." : ""}
            </p>
            <ul className="mt-3 flex flex-wrap gap-2" aria-label="Qué incluye la práctica de este plan">
              {practiceSummary(track).split(" · ").filter(Boolean).map((p) => (
                <li key={p} className="max-w-full break-words rounded-md border border-line px-2.5 py-1 text-[13.5px] text-dim">{p}</li>
              ))}
              {hasAreas && <li className="max-w-full break-words rounded-md border border-line px-2.5 py-1 text-[13.5px] text-dim">{areas.length} áreas con katas propios</li>}
            </ul>
          </div>
          <PrimaryButton large onClick={openPractice}>
            <ExternalLink size={16} aria-hidden /> Abrir práctica
          </PrimaryButton>
        </div>
      </div>

      {area.loading && !area.data && planId && <p role="status" className="text-[14px] text-dim">Leyendo la práctica de cada área…</p>}
      {area.error && (
        <p role="alert" className="text-[14px] text-danger">{area.error} <button type="button" className="inline-flex min-h-8 items-center underline" onClick={area.reload}>Reintentar</button></p>
      )}

      {hasAreas && (
        <div data-testid="practice-areas">
          <nav aria-label="Áreas de la práctica" className="border-b border-line">
            <Tabs tabs={tabs} active={active} onChange={setSel} prefix="pr-area" label="Área de la práctica" />
          </nav>
          {tabs.map((t) => (
            <TabPanel key={t.id} prefix="pr-area" id={t.id} active={t.id === active}>
              {t.id === active && t.id === ALL && (
                <div className="space-y-4" data-testid="practice-all">
                  <div>
                    <h3 className="text-[16px] font-semibold">Hoy en cada área <span className="text-[14px] font-normal text-dim">{done}/{planned} días de kata hechos</span></h3>
                    <ul className="mt-2 grid items-start gap-3 @xl:grid-cols-2 @4xl:grid-cols-3 [&>*]:min-w-0" aria-label="Katas de hoy por área">
                      {areas.map((a) => <AreaCompactCard key={a.areaId} area={a} today={area.data!.today || today} onOpen={() => setSel(a.areaId)} />)}
                    </ul>
                  </div>
                  <div>
                    <h3 className="text-[16px] font-semibold">Pista general del plan</h3>
                    <p className="mb-2 text-[14px] text-dim">El reto de lógica general y el proyecto full stack de la semana, que no pertenecen a un área en concreto.</p>
                    {general}
                  </div>
                </div>
              )}
              {t.id === active && t.id !== ALL && current && <AreaView area={current} data={area.data!} track={track} status={status} today={area.data!.today || today} mark={area.mark} onExecute={onExecute} />}
            </TabPanel>
          ))}
        </div>
      )}
      {!hasAreas && general}
      <p className="text-[14px] text-dim">
        Los proyectos de práctica complementan al kata diario y son siempre full stack (frontend + backend + base de datos); el foco solo añade criterios. Se trabajan en el módulo de práctica de programación («Abrir práctica»).
      </p>
    </section>
  );
}

/** El borrador: lo que la pista tiene en cada semana (se ve dentro del calendario semanal). */
export function PracticeWeekLines({ track, week }: { track: PracticeTrack | undefined; week: number }) {
  const w = track?.weeklyProject?.weeks.find((x) => x.week === week);
  if (!track || !w?.sessions.length) return null;
  return (
    <li data-testid="draft-practice-week">
      <span className="text-text">{weekTitle(w)}</span> · {PRACTICE_NAME} · {w.sessions.map((s) => `${dayLabel(s.date)} (${phasesText(s.phases)})`).join(" · ")}
    </li>
  );
}
