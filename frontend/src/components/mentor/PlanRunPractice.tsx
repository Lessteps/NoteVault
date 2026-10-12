// Mentor — Plan, vista de ejecución: los PROYECTOS (diario y semanal), abajo del todo.
//
// Cada proyecto se desglosa POR ÁREA, como un panel de áreas: qué hay que hacer, cómo hacerlo y el RESULTADO REAL que debe poder enseñarse
// (un comando que se ejecuta, una respuesta, una captura, una prueba que pasa). El diario es una pieza pequeña con un poco de cada área; el
// semanal es la vertical completa, con más exigencia, sobre lo aprendido en la semana. La práctica diaria de cada área vive en su tarjeta de
// «Cómo voy» (ver `AreaPracticeBlock.tsx`), no aquí.

import { CheckCircle2 } from "lucide-react";
import { clampToPlan, dateLabel } from "../../lib/planSchedule";
import { dailyProjectOf, shortOf, weeklyProjectOf } from "../../lib/planCurriculum";
import { dailyBreakdown, weeklyBreakdown, type ProjectSection } from "../../lib/planAreaPractice";
import type { MentorPlan } from "../../lib/types";
import { Chip } from "../common/forms";
import { DSTATUS_COLOUR, DSTATUS_LABEL, focusColour, plural, type AgendaModel } from "./agendaKit";
import { hm, ProgressBar } from "./parts";
import { GeneralCards } from "./PracticeCard";
import { SectionCard, SectionHeading } from "./planKit";
import type { Loaded } from "./planShared";

const PRACTICE_COLOUR = "var(--nv-practice, #c58be0)";

/** Un proyecto desglosado por área: qué hacer, cómo y el resultado real. */
function AreaSections({ sections, testid }: { sections: ProjectSection[]; testid: string }) {
  if (!sections.length) return null;
  return (
    <ul className="mt-3 grid items-start gap-3 @4xl:grid-cols-2 [&>*]:min-w-0" aria-label="Desglose por área" data-testid={testid}>
      {sections.map((s) => {
        const colour = focusColour(s.areaId);
        return (
          <li key={s.areaId} className="rounded-xl border border-line bg-surface p-3.5" style={{ borderLeft: `4px solid ${colour}` }} data-testid="project-area" data-area={s.areaId}>
            <h4 className="text-[15.5px] font-bold">{s.area}</h4>
            <p className="mt-1 text-[11.5px] font-semibold uppercase tracking-wide text-faint">Qué hay que hacer</p>
            <p className="text-[14.5px]">{s.what}</p>
            <p className="mt-2 text-[11.5px] font-semibold uppercase tracking-wide text-faint">Cómo hacerlo</p>
            <ol className="list-decimal space-y-0.5 pl-5 text-[14.5px] text-dim">
              {s.how.map((h) => <li key={h}>{h}</li>)}
            </ol>
            <div className="mt-2.5 flex items-start gap-2 rounded-lg border border-mint/50 bg-mint-soft px-2.5 py-2 text-[14px]" data-testid="project-result">
              <CheckCircle2 size={16} aria-hidden className="mt-0.5 flex-none text-mint" />
              <span><span className="font-semibold text-mint">Resultado real:</span> {s.result}</span>
            </div>
          </li>
        );
      })}
    </ul>
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
  // «un poco de cada área»: todas las áreas del plan; sin áreas (plan antiguo), las que integra la pieza
  const planAreas = [...new Set(plan.subplans.map((s) => s.areaId).filter((x): x is string => !!x))];
  const areaIds = planAreas.length ? planAreas : daily?.areaIds ?? weekly?.areaIds ?? [];
  const dailySections = daily ? dailyBreakdown(areaIds, daily.topics.map((t) => t.title)) : [];
  const weeklySections = weekly ? weeklyBreakdown(areaIds, weekly.week, weekly.dailyTitles.map((t) => shortOf(t))) : [];
  return (
    <section aria-labelledby="run-projects-h" data-testid="run-projects" className="space-y-4">
      <SectionHeading id="run-projects-h" hint="Aplican lo que estudias y practicas: el diario es una pieza pequeña con un poco de cada área y el semanal junta las piezas en una vertical completa. Los dos se dan por buenos con un resultado real, no con una intención.">
        Proyectos
      </SectionHeading>

      <SectionCard labelledBy="run-daily-h" testid="run-project-daily" className="space-y-1.5">
        <p className="text-[13px] font-medium uppercase tracking-wide text-faint">Proyecto diario{day ? ` · ${dateLabel(date)}` : ""}</p>
        {daily ? (
          <>
            <h3 id="run-daily-h" className="text-[18px] font-semibold leading-snug">{daily.title}</h3>
            <p className="text-[14.5px] text-dim">{daily.description}</p>
            <p className="flex flex-wrap items-center gap-2 text-[14px] text-dim">
              {daily.minutes ? <span>{hm(daily.minutes)}</span> : null}
              <span>{daily.weeklyPart}</span>
              {dailyStatus ? <Chip large colour={DSTATUS_COLOUR[dailyStatus]}>{DSTATUS_LABEL[dailyStatus]}</Chip> : <Chip large colour="var(--nv-faint)">Entregable por definir</Chip>}
            </p>
            {daily.topics.length > 0 && <p className="text-[14px]"><span className="font-medium">Aplica:</span> {daily.topics.map((t) => shortOf(t.title)).join(" · ")}</p>}
            <AreaSections sections={dailySections} testid="daily-areas" />
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
            <h3 id="run-weekly-h" className="text-[18px] font-semibold leading-snug">{weekly.title}</h3>
            <p className="text-[14.5px] text-dim">{weekly.description}</p>
            <p className="text-[14px]"><span className="font-medium">Hoy avanza:</span> {daily ? daily.title : "repaso"} <span className="text-dim">· {weeklyDone} de {plural(weekly.dailyIds.length, "pieza", "piezas")} hechas</span></p>
            <ProgressBar pct={weekly.dailyIds.length ? (weeklyDone / weekly.dailyIds.length) * 100 : 0} label={`Avance del proyecto semanal ${weekly.week}`} />
            {weeklyStatus ? <Chip large colour={DSTATUS_COLOUR[weeklyStatus]}>{DSTATUS_LABEL[weeklyStatus]}</Chip> : <Chip large colour="var(--nv-faint)">Entregable por definir</Chip>}
            <AreaSections sections={weeklySections} testid="weekly-areas" />
          </>
        ) : (
          <h3 id="run-weekly-h" className="text-[16px] font-semibold">Sin proyecto semanal esta semana</h3>
        )}
        {track?.weeklyProject && (
          // El proyecto full stack de programming_practice ES el proyecto semanal: el semanal se alimenta de él, no es otro proyecto aparte.
          <div className="mt-3 space-y-1.5 border-t border-line pt-3" data-testid="run-pp-project">
            <h4 className="text-[15px] font-semibold" style={{ color: PRACTICE_COLOUR }}>Cómo se construye: las cuatro fases de programming_practice</h4>
            <p className="text-[14px] text-dim">El proyecto semanal se alimenta del proyecto full stack de la semana: especificar, construir, defender y cerrar con el postmortem. Las piezas de cada día son las que lo van completando.</p>
            <GeneralCards track={track} status={data.practice} today={m.today} only={["project"]} />
          </div>
        )}
      </SectionCard>
    </section>
  );
}
