// Mentor — Plan, vista de ejecución: los PROYECTOS (diario y semanal), abajo del todo.
//
// Cada proyecto se desglosa POR ÁREA, como un panel de áreas: qué hay que hacer, cómo hacerlo y el RESULTADO REAL que debe poder enseñarse
// (un comando que se ejecuta, una respuesta, una captura, una prueba que pasa). El diario es una pieza pequeña con un poco de cada área; el
// semanal es la vertical completa, con más exigencia, sobre lo aprendido en la semana. La práctica diaria de cada área vive en su tarjeta de
// «Cómo voy» (ver `AreaPracticeBlock.tsx`), no aquí.

import { CheckCircle2 } from "lucide-react";
import { clampToPlan } from "../../lib/planSchedule";
import { monthlyBlocksOf, shortOf, weeklyProjectOf, type MonthlyBlock } from "../../lib/planCurriculum";
import { weeklyBreakdown, type ProjectSection } from "../../lib/planAreaPractice";
import type { MentorPlan } from "../../lib/types";
import { Chip } from "../common/forms";
import { cn } from "../ui";
import { DSTATUS_COLOUR, DSTATUS_LABEL, focusColour, plural, type AgendaModel } from "./agendaKit";
import { ProgressBar } from "./parts";
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
  const months = monthlyBlocksOf(plan, m.schedule);
  const currentMonth = day ? months.find((b: MonthlyBlock) => day.week >= b.fromWeek && day.week <= b.toWeek) ?? months[0] : months[0];

  if (!weekly && !track?.weeklyProject && !currentMonth) return null;
  const status = (id: string | undefined) => (id && m.deliverablesDefined ? m.deliverableById.get(id)?.status : undefined);
  const weeklyDone = weekly ? weekly.dailyIds.filter((id) => status(id) === "hecho").length : 0;
  const weeklyStatus = status(weekly?.id);
  const monthlyStatus = currentMonth ? status(currentMonth.id) : undefined;

  const planAreas = [...new Set(plan.subplans.map((s) => s.areaId).filter((x): x is string => !!x))];
  const areaIds = planAreas.length ? planAreas : weekly?.areaIds ?? [];
  const weeklySections = weekly ? weeklyBreakdown(areaIds, weekly.week, weekly.dailyTitles.map((t) => shortOf(t))) : [];

  return (
    <section aria-labelledby="run-projects-h" data-testid="run-projects" className="space-y-4">
      <SectionHeading id="run-projects-h" hint="El proyecto semanal junta las áreas en una vertical completa y el proyecto mensual consolida el avance del mes.">
        Proyectos
      </SectionHeading>

      <SectionCard labelledBy="run-weekly-h" testid="run-project-weekly" className="space-y-1.5">
        <p className="text-[13px] font-medium uppercase tracking-wide text-faint">Proyecto semanal{weekly ? ` · semana ${weekly.week}` : ""}</p>
        {weekly ? (
          <>
            <h3 id="run-weekly-h" className="text-[18px] font-semibold leading-snug">{weekly.title}</h3>
            <p className="text-[14.5px] text-dim">{weekly.description}</p>
            <p className="text-[14px]"><span className="font-medium">Progreso semanal:</span> <span className="text-dim">{weeklyDone} de {plural(weekly.dailyIds.length, "pieza", "piezas")} hechas</span></p>
            <ProgressBar pct={weekly.dailyIds.length ? (weeklyDone / weekly.dailyIds.length) * 100 : 0} label={`Avance del proyecto semanal ${weekly.week}`} />
            {weeklyStatus ? <Chip large colour={DSTATUS_COLOUR[weeklyStatus]}>{DSTATUS_LABEL[weeklyStatus]}</Chip> : <Chip large colour="var(--nv-faint)">Entregable por definir</Chip>}
            <AreaSections sections={weeklySections} testid="weekly-areas" />
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
        <SectionCard labelledBy="run-monthly-h" testid="run-project-monthly" className="space-y-1.5">
          <p className="text-[13px] font-medium uppercase tracking-wide text-faint">Proyecto mensual{currentMonth.month ? ` · ${currentMonth.month}` : ""}</p>
          <h3 id="run-monthly-h" className="text-[18px] font-semibold leading-snug">{currentMonth.title}</h3>
          <p className="text-[14.5px] text-dim">{currentMonth.description}</p>
          <p className="flex flex-wrap items-center gap-2 text-[14px] text-dim">
            <span>Semanas {currentMonth.fromWeek} a {currentMonth.toWeek}</span>
            {monthlyStatus ? <Chip large colour={DSTATUS_COLOUR[monthlyStatus]}>{DSTATUS_LABEL[monthlyStatus]}</Chip> : <Chip large colour="var(--nv-faint)">Entregable mensual</Chip>}
          </p>
        </SectionCard>
      )}
    </section>
  );
}
