// Mentor — Plan: la pista «Programming practice» de un plan (kata diario + proyecto semanal full stack).
//
// Con el mismo lenguaje horizontal de las filas por área (`AreaRow` + tarjetas compactas). SOLO LECTURA: el estado se
// DERIVA del módulo `programming_practice` (intentos del kata `pp_kata`, proyectos `.pp.json` y sus especificaciones) y
// se completa con lo que se marcó a mano en los bloques de «Hoy». «Abrir práctica» abre el diálogo de práctica de
// programación que ya existe; nada de aquí escribe.

import { ExternalLink } from "lucide-react";
import type { ReactElement } from "react";
import { isoDow, shortWeekLabel } from "../../lib/planTime";
import {
  FOCUS_LABEL,
  PHASE_LABEL,
  PRACTICE_NAME,
  PRACTICE_PHASES,
  phasesText,
  weekTitle,
  type PhaseStatus,
  type PracticePhase,
  type PracticeTrack,
  type PracticeWeek,
} from "../../lib/practiceTrack";
import type { MentorPracticeStatus } from "../../lib/types";
import { Chip, GhostButton } from "../common/forms";
import { usePracticeDialog } from "../practice/PracticeProjectDialog";
import { AreaRow, CARD_CLASS, hm } from "./parts";

const DAY_SHORT = ["L", "M", "X", "J", "V", "S", "D"];
export const PHASE_STATUS_LABEL: Record<PhaseStatus, string> = { pendiente: "Pendiente", en_curso: "En curso", hecho: "Hecho", saltado: "Saltado" };
export const PHASE_STATUS_COLOUR: Record<PhaseStatus, string> = { pendiente: "var(--nv-faint)", en_curso: "var(--nv-accent)", hecho: "var(--nv-mint)", saltado: "var(--nv-warn)" };
const PROJECT_STATE: Record<string, string> = { spec: "especificado", building: "en construcción", defended: "defendido", done: "cerrado" };
const COLOUR = "#8e24aa";

export const openPractice = (): void => usePracticeDialog.getState().show();

const dayLabel = (iso: string): string => `${DAY_SHORT[isoDow(iso) - 1]} ${Number(iso.slice(8))}`;

/** Resumen corto de la pista, para el borrador y la cabecera del plan. */
export function practiceSummary(track: PracticeTrack): string {
  const parts: string[] = [];
  if (track.kata) parts.push(`kata diario de ${hm(track.kata.minutesPerDay)}`);
  const wp = track.weeklyProject;
  if (wp) parts.push(`proyecto semanal full stack (${wp.sessionsPerWeek} ${wp.sessionsPerWeek === 1 ? "sesión" : "sesiones"} de ${hm(wp.minutesPerSession)}, foco ${wp.focusMode === "rotate" ? "rotativo" : FOCUS_LABEL[wp.focusMode]})`);
  if (track.monthlyProject) parts.push(`${track.monthlyProject.blocks.length} ${track.monthlyProject.blocks.length === 1 ? "proyecto mensual" : "proyectos mensuales"}`);
  return parts.join(" · ");
}

function PhaseChips({ week, status }: { week: PracticeWeek; status?: Record<PracticePhase, PhaseStatus> }) {
  return (
    <ul className="flex flex-wrap gap-1" aria-label={`Fases de la semana ${week.week}`}>
      {PRACTICE_PHASES.map((ph) => {
        const st: PhaseStatus = status?.[ph] ?? "pendiente";
        return (
          <li key={ph}>
            <Chip colour={PHASE_STATUS_COLOUR[st]}>
              {PHASE_LABEL[ph]}: {PHASE_STATUS_LABEL[st]}
            </Chip>
          </li>
        );
      })}
    </ul>
  );
}

/** La fila «Programming practice» del plan: kata diario, proyecto de esta semana, todas las semanas y proyecto mensual. */
export function PracticeRow({ track, status, today }: { track: PracticeTrack; status: MentorPracticeStatus | null | undefined; today: string }) {
  const wp = track.weeklyProject;
  const weeks = wp?.weeks ?? [];
  const thisWeek = weeks.find((w) => today >= w.start && today <= w.end) ?? weeks.find((w) => w.start > today) ?? weeks[weeks.length - 1];
  const wStatus = status?.weeks.find((w) => w.week === thisWeek?.week);
  const kata = status?.kata;
  const cards: ReactElement[] = [];

  if (track.kata) {
    cards.push(
      <section key="kata" className={CARD_CLASS} style={{ borderTop: `3px solid ${COLOUR}` }} data-testid="practice-kata" aria-label="Reto diario (kata)">
        <div className="text-[11px] font-medium uppercase tracking-wide text-faint">Reto diario</div>
        <div className="text-[14px] font-semibold leading-snug">Kata de lógica · {hm(track.kata.minutesPerDay)}</div>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-dim">
          <span>{DAY_SHORT.filter((_, i) => track.kata!.days.includes(i + 1)).join(" ")}</span>
          {kata && (
            <>
              <span>· {kata.doneDays}/{kata.plannedDays} días hechos</span>
              <span>· racha {kata.streak}</span>
              {kata.todayPlanned && <Chip colour={kata.todayDone ? "var(--nv-mint)" : "var(--nv-accent)"}>Hoy: {kata.todayDone ? "hecho" : "pendiente"}</Chip>}
            </>
          )}
        </div>
        <p className="mt-2 text-[11px] text-faint">
          {status?.ppReady === false
            ? "No se encontró la carpeta programming_practice: el estado se anota a mano en los bloques de «Hoy»."
            : "Hecho = hay un intento del kata ese día en tu práctica, o lo marcaste en «Hoy»."}
        </p>
      </section>,
    );
  }

  if (wp && thisWeek) {
    cards.push(
      <section key="project" className={CARD_CLASS} style={{ borderTop: `3px solid ${COLOUR}` }} data-testid="practice-project" aria-label="Proyecto de la semana">
        <div className="text-[11px] font-medium uppercase tracking-wide text-faint">Proyecto de la semana {thisWeek.week} · {shortWeekLabel(thisWeek.start, thisWeek.end)}</div>
        <div className="text-[14px] font-semibold leading-snug">{weekTitle(thisWeek)}</div>
        <div className="mt-0.5 text-[11px] text-dim">
          Full stack: frontend + backend + base de datos · foco {FOCUS_LABEL[thisWeek.focus]}
        </div>
        {wStatus?.project && (
          <div className="mt-1 text-[11px] text-dim" data-testid="practice-project-linked">
            En tu práctica: «{wStatus.project.title}» ({PROJECT_STATE[wStatus.project.state]}{wStatus.project.score !== undefined ? ` · ${wStatus.project.score}/100` : ""})
          </div>
        )}
        <div className="mt-2">
          <PhaseChips week={thisWeek} status={wStatus?.phases} />
        </div>
        <ul className="mt-2 space-y-0.5 text-[11px] text-dim" aria-label="Sesiones de la semana">
          {thisWeek.sessions.map((s) => (
            <li key={s.date} className={s.date === today ? "font-medium text-text" : ""}>
              {dayLabel(s.date)} · {hm(s.minutes)} · {phasesText(s.phases)}
            </li>
          ))}
          {!thisWeek.sessions.length && <li className="text-faint">Esta semana no tiene sesiones (días bloqueados o ya pasados).</li>}
        </ul>
        {wStatus && wStatus.source !== "none" && (
          <p className="mt-1.5 text-[11px] text-faint">{wStatus.source === "pp" ? "Estado derivado de tu práctica." : wStatus.source === "manual" ? "Estado anotado a mano en «Hoy»." : "Estado de tu práctica y de lo anotado en «Hoy»."}</p>
        )}
        <GhostButton className="mt-2" onClick={openPractice}>
          <ExternalLink size={12} /> Abrir práctica
        </GhostButton>
      </section>,
    );
  }

  if (wp && weeks.length > 1) {
    cards.push(
      <section key="weeks" className={CARD_CLASS} style={{ borderTop: `3px solid ${COLOUR}` }} data-testid="practice-weeks" aria-label="Proyectos por semana">
        <div className="text-[11px] font-medium uppercase tracking-wide text-faint">Proyectos por semana</div>
        <ol className="mt-1.5 space-y-1 text-[11.5px]">
          {weeks.map((w) => {
            const st = status?.weeks.find((x) => x.week === w.week);
            const done = st ? PRACTICE_PHASES.filter((p) => st.phases[p] === "hecho").length : 0;
            return (
              <li key={w.week} className={w === thisWeek ? "rounded-md border border-accent bg-accent-soft px-1.5 py-1" : "px-1.5 py-1"}>
                <span className="font-medium">Sem. {w.week}</span> <span className="text-faint">{shortWeekLabel(w.start, w.end)}</span>
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
      <section key="monthly" className={CARD_CLASS} style={{ borderTop: `3px solid ${COLOUR}` }} data-testid="practice-monthly" aria-label="Proyecto mensual">
        <div className="text-[11px] font-medium uppercase tracking-wide text-faint">Proyecto mensual</div>
        <ul className="mt-1 space-y-1 text-[12px]">
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

  if (!cards.length) return null;
  return (
    <div className="space-y-1.5" data-testid="practice-row">
      <AreaRow title={PRACTICE_NAME} colour={COLOUR} count={cards.length} noun={["tarjeta", "tarjetas"]}>
        {cards}
      </AreaRow>
      <p className="text-[11.5px] text-faint">
        El proyecto semanal es siempre full stack (frontend + backend + base de datos); el foco solo añade criterios. Se trabaja en el módulo de práctica de programación («Abrir práctica»).
      </p>
    </div>
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
