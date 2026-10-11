// Mentor — Plan, vista de ejecución: la PRÁCTICA diaria y semanal y los PROYECTOS (diario y semanal).
//
// Es la parte práctica del día, la que nace de la carpeta `programming_practice` y no de las asignaturas: un reto diario POR ÁREA (Backend,
// Frontend, Databases, Tooling and Quality…) basado en las habilidades clave que piden las entrevistas técnicas, el kata de lógica general y el
// proyecto full stack de la semana. Los proyectos integradores (diario y semanal) van al final de la vista.
// Lo único que escribe es la marca de «kata hecho / saltado» del día (datos de la app); nada del plan.

import { ExternalLink } from "lucide-react";
import { clampToPlan, dateLabel } from "../../lib/planSchedule";
import { dailyProjectOf, shortOf, weeklyProjectOf } from "../../lib/planCurriculum";
import type { MentorPlan } from "../../lib/types";
import { Chip, GhostButton } from "../common/forms";
import { DSTATUS_COLOUR, DSTATUS_LABEL, plural, type AgendaModel } from "./agendaKit";
import { hm, ProgressBar } from "./parts";
import { GeneralCards, KataToday, usePlanAreaPractice } from "./PracticeCard";
import { SectionCard, SectionHeading } from "./planKit";
import { openPlanTab, type Loaded } from "./planShared";

const PRACTICE_COLOUR = "var(--nv-practice, #c58be0)";

/** «Práctica de hoy»: un reto por área y el kata de lógica del plan. */
export function RunPractice({ plan, data, today }: { plan: MentorPlan; data: Loaded; today: string }) {
  const ap = usePlanAreaPractice(plan.id);
  const areas = ap.data?.areas ?? [];
  const track = plan.programmingPractice;
  if (!areas.length && !track?.kata) return null;
  const done = areas.filter((a) => a.kata.todayPlanned && a.kata.todayDone).length;
  const due = areas.filter((a) => a.kata.todayPlanned).length;
  const openAll = (): void => openPlanTab(plan.id, track ? "practica" : "plan");
  return (
    <section aria-labelledby="run-practice-h" data-testid="run-practice" className="space-y-3">
      <SectionHeading
        id="run-practice-h"
        hint="Un reto diario por área, con las habilidades clave que piden las entrevistas técnicas, más el kata de lógica. Se practica en programming_practice, aparte de los temas."
        right={
          <div className="flex flex-wrap items-center gap-2">
            {due > 0 && <Chip large colour={done === due ? "var(--nv-mint)" : "var(--nv-warn)"}>{done}/{due} retos de hoy</Chip>}
            <GhostButton onClick={openAll} data-testid="run-practice-all"><ExternalLink size={14} aria-hidden /> Toda la práctica</GhostButton>
          </div>
        }
      >
        Práctica de hoy
      </SectionHeading>
      {ap.loading && !ap.data && <p role="status" className="text-[14px] text-dim">Leyendo la práctica de cada área…</p>}
      {ap.error && <p role="alert" className="text-[14px] text-danger">{ap.error} <button type="button" className="underline" onClick={ap.reload}>Reintentar</button></p>}
      {areas.length > 0 && ap.data && (
        <ul className="grid items-start gap-4 @3xl:grid-cols-2 [&>*]:min-w-0" aria-label="Retos de hoy por área" data-testid="run-practice-areas">
          {areas.map((a) => (
            <li key={a.areaId}>
              <KataToday area={a} ppBase={ap.data!.ppBase} today={ap.data!.today || today} mark={ap.mark} ppReady={ap.data!.ppReady} onExecute={() => openPlanTab(plan.id, "plan")} />
            </li>
          ))}
        </ul>
      )}
      {track?.kata && <GeneralCards track={track} status={data.practice} today={today} only={["kata"]} />}
    </section>
  );
}

/** Los proyectos al final de la vista: el del día, el de la semana y el proyecto full stack de la pista. */
export function RunProjects({ plan, data, m }: { plan: MentorPlan; data: Loaded; m: AgendaModel }) {
  const date = clampToPlan(m.today, plan);
  const day = m.schedule.byDate.get(date);
  const daily = day ? dailyProjectOf(plan, m.schedule, day) : null;
  const weekly = day ? weeklyProjectOf(plan, m.schedule, day.week) : null;
  const track = plan.programmingPractice;
  if (!daily && !weekly && !track?.weeklyProject) return null;
  const status = (id: string | undefined) => (id && m.deliverablesDefined ? m.deliverableById.get(id)?.status : undefined);
  const weeklyDone = weekly ? weekly.dailyIds.filter((id) => status(id) === "hecho").length : 0;
  const dailyStatus = status(daily?.id);
  const weeklyStatus = status(weekly?.id);
  return (
    <section aria-labelledby="run-projects-h" data-testid="run-projects" className="space-y-3">
      <SectionHeading id="run-projects-h" hint="Aplican lo que estudias y practicas hoy: el diario es una pieza pequeña y el semanal junta las piezas de la semana en una vertical completa.">
        Proyectos
      </SectionHeading>
      <div className="grid items-start gap-4 @3xl:grid-cols-2 [&>*]:min-w-0">
        <SectionCard labelledBy="run-daily-h" testid="run-project-daily" className="space-y-1.5">
          <p className="text-[13px] font-medium uppercase tracking-wide text-faint">Proyecto diario{day ? ` · ${dateLabel(date)}` : ""}</p>
          {daily ? (
            <>
              <h3 id="run-daily-h" className="text-[17px] font-semibold leading-snug">{daily.title}</h3>
              <p className="text-[14.5px] text-dim">{daily.description}</p>
              {daily.topics.length > 0 && <p className="text-[14px]"><span className="font-medium">Conectado con:</span> {daily.topics.map((t) => shortOf(t.title)).join(" · ")}</p>}
              <p className="flex flex-wrap items-center gap-2 text-[14px] text-dim">
                {daily.minutes ? <span>{hm(daily.minutes)}</span> : null}
                <span>{daily.weeklyPart}</span>
                {dailyStatus ? <Chip large colour={DSTATUS_COLOUR[dailyStatus]}>{DSTATUS_LABEL[dailyStatus]}</Chip> : <Chip large colour="var(--nv-faint)">Entregable por definir</Chip>}
              </p>
            </>
          ) : (
            <>
              <h3 id="run-daily-h" className="text-[16px] font-semibold">Hoy no hay proyecto diario</h3>
              <p className="text-[14px] text-dim">Es un día sin estudio programado.</p>
            </>
          )}
        </SectionCard>

        <SectionCard labelledBy="run-weekly-h" testid="run-project-weekly" className="space-y-1.5">
          <p className="text-[13px] font-medium uppercase tracking-wide text-faint">Proyecto semanal{weekly ? ` · semana ${weekly.week}` : ""}</p>
          {weekly ? (
            <>
              <h3 id="run-weekly-h" className="text-[17px] font-semibold leading-snug">{weekly.title}</h3>
              <p className="text-[14.5px] text-dim">{weekly.description}</p>
              <p className="text-[14px]"><span className="font-medium">Hoy avanza:</span> {daily ? daily.title : "repaso"} <span className="text-dim">· {weeklyDone} de {plural(weekly.dailyIds.length, "pieza", "piezas")} hechas</span></p>
              <ProgressBar pct={weekly.dailyIds.length ? (weeklyDone / weekly.dailyIds.length) * 100 : 0} label={`Avance del proyecto semanal ${weekly.week}`} />
              {weeklyStatus ? <Chip large colour={DSTATUS_COLOUR[weeklyStatus]}>{DSTATUS_LABEL[weeklyStatus]}</Chip> : <Chip large colour="var(--nv-faint)">Entregable por definir</Chip>}
            </>
          ) : (
            <h3 id="run-weekly-h" className="text-[16px] font-semibold">Sin proyecto semanal esta semana</h3>
          )}
        </SectionCard>
      </div>

      {track?.weeklyProject && (
        <div data-testid="run-pp-project" className="space-y-1.5">
          <p className="text-[14px] text-dim">
            <span className="font-medium text-text" style={{ color: PRACTICE_COLOUR }}>Proyecto full stack de programming_practice</span> · cuatro fases: especificar, construir, defender y cerrar con el postmortem.
          </p>
          <GeneralCards track={track} status={data.practice} today={m.today} only={["project"]} />
        </div>
      )}
    </section>
  );
}
