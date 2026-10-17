// Mentor — Ejecución: las PESTAÑAS de la vista de ejecución y el contenido de cada una (un área, las Bases). La vista de ejecución es una barra
// de pestañas (General · una por área · Bases · Proyectos) y cada pestaña enseña SOLO lo suyo: la de un área, lo que toca hoy en esa área, su sesión
// (Pomodoro y registro de horas) y su ruta; la de Bases, los fundamentos que se intercalan en todas las áreas (no son de ninguna ruta en concreto).

import { ArrowRight } from "lucide-react";
import type { MentorPlan } from "../../lib/types";
import type { DayAreaEntry } from "../../lib/planTopicsByArea";
import type { AreaSets } from "../../lib/planAreaLists";
import type { ReviewRow } from "../../lib/planReviews";
import { cn } from "../ui";
import { GhostButton } from "../common/forms";
import { AreaSession, useTimeLog } from "./AreaSession";
import { minutesOn } from "../../lib/timeLog";
import { AreaWork, startAreaBlock, type WeekDayView } from "./AreaWork";
import type { BoardPractice, BoardRow } from "./PlanBoard";
import { useApp } from "../../store/app";
import { SectionCard } from "./planKit";
import { AreaSections } from "./PlanRunPractice";
import { dailyBreakdown } from "../../lib/planAreaPractice";
import { hm } from "./parts";
import type { DayProject } from "../../lib/planCurriculum";

export interface RunTab {
  id: string;
  label: string;
  colour?: string;
  hint?: string;
  hintLabel?: string;
}

/** La barra de pestañas de la ejecución: se desplaza en horizontal en anchos estrechos. */
export function RunNav({ tabs, active, onSelect, right }: { tabs: ReadonlyArray<RunTab>; active: string; onSelect: (id: string) => void; /** acciones fijas a la derecha de la barra (p. ej. «Registros») */ right?: React.ReactNode }) {
  return (
    <nav aria-label="Secciones de la ejecución" data-testid="run-nav" className="flex min-w-0 items-center gap-2 border-b border-line">
      <ul className="flex min-w-0 flex-1 gap-1 overflow-x-auto py-1.5">
        {tabs.map((t) => {
          const on = t.id === active;
          return (
            <li key={t.id} className="flex-none">
              <button
                type="button"
                aria-pressed={on}
                aria-current={on ? "page" : undefined}
                onClick={() => onSelect(t.id)}
                data-testid={`run-tab-${t.id}`}
                className={cn("inline-flex min-h-10 items-center gap-2 whitespace-nowrap rounded-lg border px-3.5 text-[14.5px] font-medium transition-colors", on ? "border-accent bg-accent-soft text-accent-text" : "border-transparent text-dim hover:bg-hover hover:text-text")}
              >
                {t.colour && <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: t.colour }} />}
                {t.label}
                {t.hint && (
                  <span className="rounded-md bg-hover px-1.5 text-[12px] text-dim">
                    <span aria-hidden>{t.hint}</span>
                    <span className="sr-only"> ({t.hintLabel ?? t.hint})</span>
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      {right && <div className="flex-none py-1.5">{right}</div>}
    </nav>
  );
}

/** Lo de hoy de un área (o de las Bases): sus filas ya calculadas. */
export interface TodayCard {
  entry: DayAreaEntry;
  rows: BoardRow[];
  colour: string;
  doneN: number;
}

/** La pestaña de un área: su trabajo (hoy, semana, pendientes, repasos) a la izquierda y su sesión (Pomodoro y horas) a la derecha. */
export function RunArea({ plan, area, card, routeRows, weekDays, sets, reviews, date, practice, dailyProject, weeklyProjectTitle, onGoProjects }: {
  plan: MentorPlan;
  area: { subplanId: string; areaId?: string; area: string };
  card: TodayCard | undefined;
  /** toda la ruta del área, sin Bases */
  routeRows: BoardRow[];
  weekDays: WeekDayView[];
  sets: AreaSets;
  reviews: ReviewRow[];
  date: string;
  practice?: BoardPractice;
  dailyProject?: DayProject | null;
  weeklyProjectTitle?: string;
  onGoProjects: () => void;
}) {
  const colour = card?.colour ?? "var(--nv-accent)";
  const areaKey = area.areaId ?? area.subplanId;
  const { entries: timeEntries } = useTimeLog(plan.id);
  const objective = plan.subplans.find((s) => s.id === area.subplanId)?.objective;
  const planned = card ? card.entry.theoryMinutes + card.entry.practiceMinutes : 0;
  const current = card?.rows.find((r) => !r.done)?.title;
  const toast = useApp.getState().toast;
  return (
    <div className="grid items-start gap-6 @4xl:grid-cols-[minmax(0,1fr)_24rem]" data-testid="run-area-tab" data-area={areaKey}>
      <div className="min-w-0 space-y-4">
        <AreaWork
          planId={plan.id}
          areaName={area.area}
          areaId={area.areaId}
          {...(objective ? { subtitle: objective } : {})}
          loggedMinutes={minutesOn(timeEntries, date, areaKey)}
          rows={routeRows}
          todayRows={card?.rows ?? []}
          weekDays={weekDays}
          sets={sets}
          today={date}
          colour={colour}
          practice={practice}
          reviews={reviews}
          plannedMinutes={planned}
          onStartBlock={() => { if (!startAreaBlock(plan.id, areaKey)) toast("info", "Ya hay un Pomodoro en marcha: termínalo o detenlo primero."); }}
        />
        {card?.entry.project && (
          <p className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[14px]" data-testid="run-area-project">
            Hoy esta área lleva proyecto.
            <GhostButton onClick={onGoProjects}>Ver los proyectos <ArrowRight size={14} aria-hidden /></GhostButton>
          </p>
        )}
        {/* El proyecto diario de ESTA área, en su pestaña (no en «Proyectos»): una pieza pequeña con lo que toca hoy en el área */}
        {dailyProject && (
          <SectionCard labelledBy={`daily-${areaKey}-title`} testid="area-daily-project" className="space-y-2 border border-line bg-card p-4">
            <div className="flex items-center gap-2">
              <span className="rounded bg-accent/20 px-2 py-0.5 font-mono text-[11px] font-semibold uppercase text-accent-text">Proyecto diario · {area.area}</span>
              {dailyProject.minutes ? <span className="text-[12.5px] text-dim">· {hm(dailyProject.minutes)}</span> : null}
            </div>
            <h3 id={`daily-${areaKey}-title`} className="text-[16.5px] font-bold text-text">{dailyProject.title}</h3>
            <p className="text-[14px] text-dim">{dailyProject.description}</p>
            {dailyProject.weeklyPart && <p className="text-[13px] font-medium text-accent-text">{dailyProject.weeklyPart}</p>}
            <AreaSections sections={dailyBreakdown(area.areaId ? [area.areaId] : [], (card?.rows.length ? card.rows.map((r) => r.title) : dailyProject.topics.map((t: { title: string }) => t.title)))} testid="area-daily-sections" />
          </SectionCard>
        )}
      </div>
      <AreaSession
        planId={plan.id}
        areaKey={areaKey}
        areaName={area.area}
        date={date}
        plannedMinutes={planned}
        colour={colour}
        {...(current ? { currentTopic: current } : {})}
        todayTopics={(card?.rows ?? []).filter((r) => !r.done).map((r) => ({ folder: r.folder, title: r.title, kind: "topic" as const }))}
        suggestions={[
          ...(dailyProject ? [{ folder: `project:daily:${areaKey}`, title: `Proyecto diario: ${dailyProject.title}`, kind: "project" as const }] : []),
          ...(weeklyProjectTitle ? [{ folder: `project:weekly:${areaKey}`, title: `Proyecto semanal: ${weeklyProjectTitle}`, kind: "project" as const }] : []),
        ]}
      />
    </div>
  );
}

/** La pestaña de Bases: los fundamentos que se intercalan en todas las áreas. Los temas se juntan sin repetirse. */
export function RunBases({ plan, routeRows, todayRows, weekDays, sets, reviews, date }: {
  plan: MentorPlan;
  routeRows: BoardRow[];
  todayRows: BoardRow[];
  weekDays: WeekDayView[];
  sets: AreaSets;
  reviews: ReviewRow[];
  date: string;
}) {
  const colour = "var(--nv-accent)";
  const current = todayRows.find((r) => !r.done)?.title;
  const toast = useApp.getState().toast;
  return (
    <div className={cn("grid items-start gap-6 @4xl:grid-cols-[minmax(0,1fr)_24rem]")} data-testid="run-bases">
      <div className="min-w-0 space-y-3">
        <p className="text-[14.5px] text-dim">Los fundamentos no son de Backend ni de Frontend: se intercalan en todas las áreas. Aquí están una sola vez.</p>
        <AreaWork
          planId={plan.id}
          areaName="Bases de programación"
          rows={routeRows}
          todayRows={todayRows}
          weekDays={weekDays}
          sets={sets}
          today={date}
          colour={colour}
          reviews={reviews}
          plannedMinutes={0}
          onStartBlock={() => { if (!startAreaBlock(plan.id, "bases")) toast("info", "Ya hay un Pomodoro en marcha: termínalo o detenlo primero."); }}
        />
      </div>
      <AreaSession planId={plan.id} areaKey="bases" areaName="Bases" date={date} plannedMinutes={0} colour={colour} {...(current ? { currentTopic: current } : {})} />
    </div>
  );
}
