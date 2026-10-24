// Mentor — Plan, vista de ejecución: los PROYECTOS (diario y semanal), abajo del todo.
//
// Cada proyecto se desglosa POR ÁREA, como un panel de áreas: qué hay que hacer, cómo hacerlo y el RESULTADO REAL que debe poder enseñarse
// (un comando que se ejecuta, una respuesta, una captura, una prueba que pasa). El diario es una pieza pequeña con un poco de cada área; el
// semanal es la vertical completa, con más exigencia, sobre lo aprendido en la semana. La práctica diaria de cada área vive en su tarjeta de
// «Cómo voy» (ver `AreaPracticeBlock.tsx`), no aquí.

import { CheckCircle2 } from "lucide-react";
import { useMemo } from "react";
import { chainSignalsOf, planChain } from "../../lib/planChain";
import { clampToPlan } from "../../lib/planSchedule";
import { shortOf, weeklyProjectOf } from "../../lib/planCurriculum";
import { weeklyBreakdown, type ProjectSection } from "../../lib/planAreaPractice";
import type { MentorPlan } from "../../lib/types";
import { Chip } from "../common/forms";
import { cn } from "../ui";
import { DSTATUS_COLOUR, DSTATUS_LABEL, focusColour, plural, type AgendaModel } from "./agendaKit";
import { MonthCard } from "./MonthlyDeliverables";
import { ProgressBar } from "./parts";
import { ProjectFolder } from "./ProjectFolder";
import { ProjectsHub } from "./ProjectsHub";
import { GeneralCards } from "./PracticeCard";
import { SectionCard, SectionHeading } from "./planKit";
import type { Loaded } from "./planShared";

const PRACTICE_COLOUR = "var(--nv-practice, #c58be0)";

/** Un proyecto desglosado por área: qué hacer, cómo y el resultado real. */
export function AreaSections({ sections, testid }: { sections: ProjectSection[]; testid: string }) {
  if (!sections.length) return null;
  return (
    <ul className={cn("mt-3 grid items-start gap-3 [&>*]:min-w-0", sections.length > 1 && "@4xl:grid-cols-2")} aria-label="Desglose por área" data-testid={testid}>
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

/** Los proyectos al final de la vista: el semanal (conjunción de todo) y el proyecto mensual. */
export function RunProjects({ plan, data, m }: { plan: MentorPlan; data: Loaded; m: AgendaModel }) {
  const date = clampToPlan(m.today, plan);
  const day = m.schedule.byDate.get(date);
  const weekly = day ? weeklyProjectOf(plan, m.schedule, day.week) : null;
  const track = plan.programmingPractice;
  // el entregable del mes en curso: UN proyecto mensual por mes del plan, hecho de los semanales y estos de las piezas diarias
  const chain = useMemo(() => planChain(plan, m.schedule, chainSignalsOf(data.practice, data.dailyProjectDone)), [plan, m.schedule, data.practice, data.dailyProjectDone]);
  const currentMonth = (day ? chain.months.find((b) => b.weeks.some((w) => w.week === day.week)) : undefined) ?? chain.months[0];

  if (!weekly && !track?.weeklyProject && !currentMonth) return null;
  const status = (id: string | undefined) => (id && m.deliverablesDefined ? m.deliverableById.get(id)?.status : undefined);
  const weeklyDone = weekly ? weekly.dailyIds.filter((id) => status(id) === "hecho").length : 0;
  const weeklyStatus = status(weekly?.id);

  const planAreas = [...new Set(plan.subplans.map((s) => s.areaId).filter((x): x is string => !!x))];
  const areaIds = planAreas.length ? planAreas : weekly?.areaIds ?? [];
  const allKeys = plan.subplans.map((x) => x.areaId ?? x.id);
  const weeklySections = weekly ? weeklyBreakdown(areaIds, weekly.week, weekly.dailyTitles.map((t) => shortOf(t))) : [];

  return (
    <section aria-labelledby="run-projects-h" data-testid="run-projects" className="space-y-4">
      <SectionHeading id="run-projects-h" hint="El proyecto semanal junta las áreas en una vertical completa y el proyecto mensual consolida el avance del mes.">
        Proyectos
      </SectionHeading>
      <ProjectsHub planId={plan.id} />

      <SectionCard labelledBy="run-weekly-h" testid="run-project-weekly" className="space-y-1.5">
        <p className="text-[13px] font-medium uppercase tracking-wide text-faint">Proyecto semanal{weekly ? ` · semana ${weekly.week}` : ""}</p>
        {weekly ? (
          <>
            <h3 id="run-weekly-h" className="text-[18px] font-semibold leading-snug">{weekly.title}</h3>
            <p className="text-[14.5px] text-dim">{weekly.description}</p>
            <p className="text-[14px]"><span className="font-medium">Progreso semanal:</span> <span className="text-dim">{weeklyDone} de {plural(weekly.dailyIds.length, "pieza", "piezas")} hechas</span></p>
            <ProgressBar pct={weekly.dailyIds.length ? (weeklyDone / weekly.dailyIds.length) * 100 : 0} label={`Avance del proyecto semanal ${weekly.week}`} />
            {weeklyStatus ? <Chip large colour={DSTATUS_COLOUR[weeklyStatus]}>{DSTATUS_LABEL[weeklyStatus]}</Chip> : <Chip large colour="var(--nv-faint)">Pendiente</Chip>}
            <AreaSections sections={weeklySections} testid="weekly-areas" />
            <ProjectFolder
              planId={plan.id}
              areaKeys={allKeys}
              testid="weekly-project-folder"
              project={{ kind: "weekly", title: weekly.title, description: weekly.description, week: weekly.week, topics: [], sections: weeklySections }}
            />
          </>
        ) : (
          <h3 id="run-weekly-h" className="text-[16px] font-semibold">Sin proyecto semanal esta semana</h3>
        )}
        {track?.weeklyProject && (
          <div className="mt-3 space-y-1.5 border-t border-line pt-3" data-testid="run-pp-project">
            <h4 className="text-[15px] font-semibold" style={{ color: PRACTICE_COLOUR }}>Cómo se construye: las cuatro fases de programming_practice</h4>
            <p className="text-[14px] text-dim">El proyecto semanal se alimenta del proyecto full stack de la semana: especificar, construir, defender y cerrar con el postmortem. Las piezas de cada día son las que lo van completando.</p>
            <GeneralCards track={track} status={data.practice} today={m.today} only={["project"]} />
          </div>
        )}
      </SectionCard>

      {currentMonth && (
        <div className="space-y-2" data-testid="run-project-monthly">
          <p className="text-[13px] font-medium uppercase tracking-wide text-faint">Entregable del mes</p>
          <ul className="space-y-2">
            <MonthCard month={currentMonth} planId={plan.id} />
          </ul>
          <ProjectFolder
            planId={plan.id}
            areaKeys={allKeys}
            testid="monthly-project-folder"
            project={{ kind: "monthly", title: currentMonth.title, description: currentMonth.goal, month: currentMonth.month, topics: currentMonth.topics.slice(0, 8), sections: [] }}
          />
        </div>
      )}
    </section>
  );
}
