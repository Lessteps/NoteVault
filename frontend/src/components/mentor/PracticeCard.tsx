// Mentor — Plan: la pista «Programming practice» de un plan (kata diario + proyecto semanal full stack), pestaña «Práctica diaria».
//
// Una rejilla de tarjetas legibles (kata con su semana L–D, proyecto de esta semana con sus 4 fases, proyectos por semana y
// proyecto mensual). SOLO LECTURA: el estado se DERIVA del módulo `programming_practice` (intentos del kata `pp_kata`,
// proyectos `.pp.json` y sus especificaciones) y se completa con lo que se marcó a mano en los bloques de «Hoy».
// «Abrir práctica» abre el diálogo de práctica de programación que ya existe; nada de aquí escribe.

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
import { Chip, PrimaryButton } from "../common/forms";
import { usePracticeDialog } from "../practice/PracticeProjectDialog";
import { hm } from "./parts";
import { SectionHeading } from "./planKit";
import { DAY_LONG, DAY_SHORT } from "./planShared";

export const PHASE_STATUS_LABEL: Record<PhaseStatus, string> = { pendiente: "Pendiente", en_curso: "En curso", hecho: "Hecho", saltado: "Saltado" };
export const PHASE_STATUS_COLOUR: Record<PhaseStatus, string> = { pendiente: "var(--nv-faint)", en_curso: "var(--nv-accent)", hecho: "var(--nv-mint)", saltado: "var(--nv-warn)" };
const PHASE_GLYPH: Record<PhaseStatus, string> = { pendiente: "○", en_curso: "◐", hecho: "●", saltado: "⤼" };
const PROJECT_STATE: Record<string, string> = { spec: "especificado", building: "en construcción", defended: "defendido", done: "cerrado" };
const PRACTICE_COLOUR = "var(--nv-practice, #c58be0)";

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
    <ul className="grid gap-1.5 @xl:grid-cols-2" aria-label={`Fases de la semana ${week.week}`}>
      {PRACTICE_PHASES.map((ph) => {
        const st: PhaseStatus = status?.[ph] ?? "pendiente";
        return (
          <li key={ph} className="flex items-center justify-between gap-2 rounded-lg border border-line px-2.5 py-1.5 text-[14px]">
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

const CARD = "min-w-0 rounded-xl border border-line bg-card p-4";
const EYEBROW = "text-[13px] font-medium uppercase tracking-wide text-faint";

/** La pestaña «Práctica diaria» del plan: kata diario, proyecto de esta semana, todas las semanas y proyecto mensual. */
export function PracticeRow({ track, status, today }: { track: PracticeTrack; status: MentorPracticeStatus | null | undefined; today: string }) {
  const wp = track.weeklyProject;
  const weeks = wp?.weeks ?? [];
  const thisWeek = weeks.find((w) => today >= w.start && today <= w.end) ?? weeks.find((w) => w.start > today) ?? weeks[weeks.length - 1];
  const wStatus = status?.weeks.find((w) => w.week === thisWeek?.week);
  const kata = status?.kata;
  const cards: ReactElement[] = [];
  const todayDow = isoDow(today);

  if (track.kata) {
    cards.push(
      <section key="kata" className={CARD} style={{ borderTop: `3px solid ${PRACTICE_COLOUR}` }} data-testid="practice-kata" aria-labelledby="pc-kata">
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
            : "Hecho = hay un intento del kata ese día en tu práctica, o lo marcaste en «Hoy»."}
        </p>
      </section>,
    );
  }

  if (wp && thisWeek) {
    cards.push(
      <section key="project" className={CARD} style={{ borderTop: `3px solid ${PRACTICE_COLOUR}` }} data-testid="practice-project" aria-labelledby="pc-project">
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
      <section key="weeks" className={CARD} style={{ borderTop: `3px solid ${PRACTICE_COLOUR}` }} data-testid="practice-weeks" aria-labelledby="pc-weeks">
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
      <section key="monthly" className={CARD} style={{ borderTop: `3px solid ${PRACTICE_COLOUR}` }} data-testid="practice-monthly" aria-labelledby="pc-monthly">
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

  if (!cards.length) return null;
  return (
    <section className="space-y-3" data-testid="practice-row" aria-labelledby="pr-title">
      <SectionHeading
        id="pr-title"
        hint={practiceSummary(track)}
        right={
          <PrimaryButton large onClick={openPractice}>
            <ExternalLink size={16} aria-hidden /> Abrir práctica
          </PrimaryButton>
        }
      >
        {PRACTICE_NAME}
      </SectionHeading>
      <div className="grid items-start gap-4 @3xl:grid-cols-2 @6xl:grid-cols-3">{cards}</div>
      <p className="text-[14px] text-dim">
        El proyecto semanal es siempre full stack (frontend + backend + base de datos); el foco solo añade criterios. Se trabaja en el módulo de práctica de programación («Abrir práctica»).
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
