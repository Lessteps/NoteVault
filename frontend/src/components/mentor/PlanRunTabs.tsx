// Mentor — Ejecución: las PESTAÑAS de la vista de ejecución y el contenido de cada una (un área, las Bases). La vista de ejecución es una barra
// de pestañas (General · una por área · Bases · Proyectos) y cada pestaña enseña SOLO lo suyo: la de un área, lo que toca hoy en esa área, su sesión
// (Pomodoro y registro de horas) y su ruta; la de Bases, los fundamentos que se intercalan en todas las áreas (no son de ninguna ruta en concreto).

import { ArrowRight } from "lucide-react";
import { useState } from "react";
import type { MentorPlan, MentorTopicView } from "../../lib/types";
import type { DayAreaEntry } from "../../lib/planTopicsByArea";
import type { PlanGate } from "../../lib/planGate";
import { cn } from "../ui";
import { Chip, GhostButton } from "../common/forms";
import { AreaSession } from "./AreaSession";
import { hm } from "./parts";
import { PlanBoard, TopicRow, type BoardPractice, type BoardRow } from "./PlanBoard";
import { type Loaded } from "./planShared";

export interface RunTab {
  id: string;
  label: string;
  colour?: string;
  hint?: string;
  hintLabel?: string;
}

/** La barra de pestañas de la ejecución: se desplaza en horizontal en anchos estrechos. */
export function RunNav({ tabs, active, onSelect }: { tabs: ReadonlyArray<RunTab>; active: string; onSelect: (id: string) => void }) {
  return (
    <nav aria-label="Secciones de la ejecución" data-testid="run-nav" className="min-w-0 border-b border-line">
      <ul className="flex gap-1 overflow-x-auto py-1.5">
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

/** El título de un bloque dentro de una pestaña. */
const BlockTitle = ({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) => (
  <div className="mb-3 flex flex-wrap items-center gap-2">
    <h2 className="text-[19px] font-bold">{children}</h2>
    <span className="flex-1" />
    {right}
  </div>
);

/** La pestaña de un área: qué toca hoy, la sesión (Pomodoro y horas) y la ruta completa del área. */
export function RunArea({ plan, data, area, card, date, hasStudy, gate, currentWeek, byFolder, practice, onGoProjects }: {
  plan: MentorPlan;
  data: Loaded;
  area: { subplanId: string; areaId?: string; area: string };
  card: TodayCard | undefined;
  date: string;
  hasStudy: boolean;
  gate: PlanGate;
  currentWeek: number;
  byFolder: Map<string, MentorTopicView>;
  practice?: BoardPractice;
  onGoProjects: () => void;
}) {
  const colour = card?.colour ?? "var(--nv-accent)";
  const areaKey = area.areaId ?? area.subplanId;
  const planned = card ? card.entry.theoryMinutes + card.entry.practiceMinutes : 0;
  return (
    <div className="space-y-8" data-testid="run-area-tab" data-area={areaKey}>
      <div className="grid items-start gap-6 @4xl:grid-cols-[minmax(0,1fr)_24rem]">
        <section aria-labelledby={`run-today-${areaKey}`} className="min-w-0 space-y-3">
          <BlockTitle
            right={card ? <Chip large colour={colour}>{card.doneN}/{card.rows.length} hechos</Chip> : undefined}
          >
            <span id={`run-today-${areaKey}`}>Lo que toca hoy en {area.area}</span>
          </BlockTitle>
          {card ? (
            <>
              <p className="text-[14.5px] text-dim">
                {[card.entry.theoryMinutes ? `${hm(card.entry.theoryMinutes)} de teoría` : "", card.entry.practiceMinutes ? `${hm(card.entry.practiceMinutes)} de práctica` : ""].filter(Boolean).join(" · ")}
              </p>
              <ul className="space-y-1 rounded-2xl border border-line bg-card p-3" aria-label={`Temas de hoy de ${area.area}`} data-testid="run-area-today">
                {card.rows.length === 0 ? <li className="px-2 py-3 text-[14.5px] text-dim">Hoy esta área solo lleva práctica.</li> : card.rows.map((r) => <TopicRow key={`${r.folder}:${r.meta}`} r={r} colour={colour} />)}
              </ul>
              {card.entry.project && (
                <p className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[14px]" data-testid="run-area-project">
                  Hoy esta área lleva proyecto.
                  <GhostButton onClick={onGoProjects}>Ver los proyectos <ArrowRight size={14} aria-hidden /></GhostButton>
                </p>
              )}
            </>
          ) : (
            <p className="rounded-2xl border border-dashed border-line p-5 text-[14.5px] text-dim" data-testid="run-area-rest">
              {hasStudy ? `Hoy no toca ${area.area}: sigue su ruta aquí abajo cuando quieras adelantar.` : "Hoy no hay estudio programado. Puedes adelantar la ruta de esta área aquí abajo."}
            </p>
          )}
        </section>
        <AreaSession planId={plan.id} areaKey={areaKey} areaName={area.area} date={date} plannedMinutes={planned} colour={colour} />
      </div>

      <section aria-label={`Ruta de ${area.area}`} data-testid="run-area-route">
        <PlanBoard plan={plan} data={data} byFolder={byFolder} gate={gate} currentWeek={currentWeek} onlyArea={area.subplanId} excludeBases practice={practice} />
      </section>
    </div>
  );
}

/** La pestaña de Bases: los fundamentos que se intercalan en todas las áreas. Los temas se juntan sin repetirse. */
export function RunBases({ plan, today, byFolder, gate, date }: { plan: MentorPlan; today: BoardRow[]; byFolder: Map<string, MentorTopicView>; gate: PlanGate; date: string }) {
  const [all, setAll] = useState(false);
  const seen = new Set<string>();
  const route: BoardRow[] = [];
  for (const s of plan.subplans) {
    const basesId = (s.groups ?? []).find((g) => g.kind === "bases")?.id;
    if (!basesId) continue;
    for (const t of s.topics) {
      if (t.group !== basesId || t.route === "skipped" || seen.has(t.folder)) continue;
      seen.add(t.folder);
      const state = byFolder.get(t.folder)?.state ?? "sin_tratar";
      route.push({ folder: t.folder, title: t.title, week: t.targetWeek, state, done: state === "completo" || !!t.completedAt, exercises: byFolder.get(t.folder)?.exercises ?? 0, unlockOn: gate.locked.get(t.folder) });
    }
  }
  route.sort((a, b) => a.week - b.week);
  const pending = route.filter((r) => !r.done);
  const shown = all ? route : pending.slice(0, 12);
  const colour = "var(--nv-accent)";
  const planned = 0;
  return (
    <div className="space-y-8" data-testid="run-bases">
      <div className="grid items-start gap-6 @4xl:grid-cols-[minmax(0,1fr)_24rem]">
        <section aria-labelledby="run-bases-h" className="min-w-0 space-y-3">
          <BlockTitle right={<Chip large colour={colour}>{route.filter((r) => r.done).length}/{route.length} hechos</Chip>}><span id="run-bases-h">Bases de programación</span></BlockTitle>
          <p className="text-[14.5px] text-dim">Los fundamentos no son de Backend ni de Frontend: se intercalan en todas las áreas. Aquí están una sola vez.</p>
          <h3 className="text-[15px] font-semibold">Hoy</h3>
          <ul className="space-y-1 rounded-2xl border border-line bg-card p-3" aria-label="Bases de hoy" data-testid="run-bases-today">
            {today.length === 0 ? <li className="px-2 py-3 text-[14.5px] text-dim">Hoy no hay fundamentos programados.</li> : today.map((r) => <TopicRow key={`${r.folder}:${r.meta}`} r={r} colour={colour} />)}
          </ul>
        </section>
        <AreaSession planId={plan.id} areaKey="bases" areaName="Bases" date={date} plannedMinutes={planned} colour={colour} />
      </div>
      <section aria-labelledby="run-bases-route-h">
        <BlockTitle right={route.length > 12 ? <GhostButton onClick={() => setAll((v) => !v)} aria-pressed={all}>{all ? "Ver solo los pendientes" : `Ver los ${route.length}`}</GhostButton> : undefined}><span id="run-bases-route-h">Ruta de Bases</span></BlockTitle>
        <ul className="space-y-1 rounded-2xl border border-line bg-card p-3" aria-label="Temas de Bases">
          {shown.length === 0 ? <li className="px-2 py-3 text-[14.5px] text-dim">No hay temas de Bases en este plan.</li> : shown.map((r) => <TopicRow key={r.folder} r={r} colour={colour} />)}
        </ul>
      </section>
    </div>
  );
}
