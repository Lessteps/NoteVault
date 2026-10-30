// Mentor — «Práctica» de un área: SOLO la práctica que le toca por su proyecto, nunca temas de teoría. Es la cadena de entregables del plan, vista desde el área:
// el PROYECTO DEL MES (lo que se construye) → el PROYECTO SEMANAL (la parte de esta semana) → las PIEZAS DIARIAS de esta semana en las que participa el área
// (cada una con su id, su fecha y su estado). Cada pieza diaria suma al semanal y este al mensual; el avance sale de las casillas de su carpeta de proyecto, no se marca a mano.
// Los temas de teoría viven en «Ejecución» (aprendizaje diario); aquí no aparecen.

import { useMemo } from "react";
import { chainSignalsOf, lockText, planChain, type ChainPiece } from "../../lib/planChain";
import { dailyBreakdown } from "../../lib/planAreaPractice";
import { dailyProjectOf, shortOf } from "../../lib/planCurriculum";
import { clampToPlan, dateLabel } from "../../lib/planSchedule";
import type { MentorPlan } from "../../lib/types";
import { Chip } from "../common/forms";
import { cn } from "../ui";
import { DSTATUS_COLOUR, DSTATUS_LABEL, type AgendaModel } from "./agendaKit";
import { AreaSections } from "./AreaSections";
import { ProgressBar } from "./parts";
import type { Loaded } from "./planShared";

/** La pieza que toca HOY para el área (o la primera pendiente de la semana), para el progreso de la sesión. */
export function todayPieceOf(pieces: readonly ChainPiece[], today: string): ChainPiece | undefined {
  return pieces.find((p) => p.date === today) ?? pieces.find((p) => p.current);
}

export function areaChainOf(plan: MentorPlan, m: AgendaModel, loaded: Loaded, areaId: string, today: string) {
  const chain = planChain(plan, m.schedule, chainSignalsOf(loaded.practice, loaded.dailyProjectDone));
  const date = clampToPlan(today, plan);
  const week = m.schedule.byDate.get(date)?.week;
  const month = (week ? chain.months.find((b) => b.weeks.some((w) => w.week === week)) : undefined) ?? chain.months[0];
  const cw = month?.weeks.find((w) => w.week === week) ?? month?.weeks[0];
  const pieces = (cw?.pieces ?? []).filter((p) => p.areaIds.includes(areaId));
  return { month, week: cw, pieces };
}

export function AreaPracticeChain({ plan, m, loaded, areaId, areaLabel, today, colour }: { plan: MentorPlan; m: AgendaModel; loaded: Loaded; areaId: string; areaLabel: string; today: string; colour: string }) {
  const { month, week, pieces } = useMemo(() => areaChainOf(plan, m, loaded, areaId, today), [plan, m, loaded, areaId, today]);
  if (!month || !week) {
    return <p className="rounded-2xl border border-dashed border-line p-4 text-[14px] text-dim" data-testid="area-chain-empty">Este plan no tiene proyectos mensuales ni semanales: no hay práctica por proyecto que mostrar.</p>;
  }
  const mine = pieces.length;
  const doneMine = pieces.filter((p) => p.done).length;
  const todayPiece = todayPieceOf(pieces, today);
  // lo que HACES en ESTA área en la pieza del día (qué, cómo y resultado real): no el título del tema de teoría
  const sectionsOf = (p: ChainPiece) => {
    const day = m.schedule.byDate.get(p.date);
    const dp = day ? dailyProjectOf(plan, m.schedule, day) : null;
    return dp ? dailyBreakdown([areaId], dp.topics.map((t) => shortOf(t.title))) : [];
  };
  return (
    <div className="space-y-3" data-testid="area-chain" data-area={areaId}>
      <div className="rounded-2xl border border-line bg-card p-4" data-testid="area-chain-month">
        <p className="text-[12px] font-semibold uppercase tracking-wider text-dim">1 · Proyecto del mes {month.n} de {month.of}</p>
        <h5 className="mt-0.5 text-[16px] font-semibold leading-snug">{month.title}</h5>
        <p className="mt-0.5 text-[14px] text-dim">{month.goal}</p>
        <div className="mt-2 flex items-center gap-3">
          <div className="flex-1"><ProgressBar pct={month.pct} colour={colour} label={`Avance del proyecto del mes ${month.n}`} /></div>
          <span className="text-[13.5px] font-semibold">{month.pct} %</span>
          <Chip colour={DSTATUS_COLOUR[month.status]}>{DSTATUS_LABEL[month.status]}</Chip>
        </div>
      </div>

      <div className="rounded-2xl border border-line bg-card p-4" data-testid="area-chain-week">
        <p className="text-[12px] font-semibold uppercase tracking-wider text-dim">2 · Proyecto de la semana {week.week} · parte {week.n} de {week.of} del mes</p>
        <h5 className="mt-0.5 text-[16px] font-semibold leading-snug">{week.title}</h5>
        <p className="mt-0.5 text-[14px] text-dim">{week.slice}</p>
        {week.milestone && <p className="mt-1 text-[14px]"><span className="font-medium">Hito:</span> <span className="text-dim">{week.milestone.title}</span></p>}
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <div className="min-w-32 flex-1"><ProgressBar pct={week.pct} colour={colour} label={`Avance del proyecto de la semana ${week.week}`} /></div>
          <span className="text-[13.5px] font-semibold">{week.pct} %</span>
          {week.locked && week.lockedBy ? <Chip colour="var(--nv-faint)">{lockText("week", week.lockedBy)}</Chip> : <Chip colour={DSTATUS_COLOUR[week.status]}>{DSTATUS_LABEL[week.status]}</Chip>}
        </div>
      </div>

      <div className="rounded-2xl border border-line bg-card p-4" data-testid="area-chain-pieces">
        <p className="text-[12px] font-semibold uppercase tracking-wider text-dim">3 · Tus piezas diarias de {areaLabel} esta semana · {doneMine} de {mine} hechas</p>
        {pieces.length === 0 ? (
          <p className="mt-2 text-[14px] text-dim" data-testid="area-chain-no-pieces">Esta semana no hay piezas diarias de {areaLabel}: el proyecto lo llevan otras áreas.</p>
        ) : (
          <ul className="mt-2 space-y-2" aria-label={`Piezas diarias de ${areaLabel}`}>
            {pieces.map((p) => {
              const isToday = p.date === today;
              return (
                <li key={p.id} className={cn("rounded-xl border px-3 py-2.5", isToday ? "border-accent/50 bg-surface" : "border-line")} data-testid="area-chain-piece" data-id={p.id} data-status={p.status} data-today={isToday ? "true" : "false"}>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className={cn("text-[14.5px] font-medium", p.done && "text-faint line-through decoration-faint/60")}>{p.title}</span>
                    <span className="flex-1" />
                    {isToday && <Chip colour={colour}>Hoy</Chip>}
                    {!isToday && p.current && <Chip colour={colour}>Te toca</Chip>}
                    <Chip colour={DSTATUS_COLOUR[p.status]}>{DSTATUS_LABEL[p.status]}</Chip>
                  </div>
                  <p className="mt-0.5 text-[13.5px] text-dim">
                    <code className="rounded bg-hover px-1 font-mono text-[12.5px] text-text" title="Id de la pieza en el plan">{p.id}</code> · pieza {p.n} de {p.of} · {isToday ? "hoy" : dateLabel(p.date)}
                  </p>
                  <p className="text-[13.5px] text-dim">{p.slice}</p>
                  {(isToday || p.current) && <AreaSections sections={sectionsOf(p)} testid="area-chain-sections" />}
                </li>
              );
            })}
          </ul>
        )}
        {todayPiece && <p className="sr-only" data-testid="area-chain-today">{todayPiece.id}</p>}
      </div>
    </div>
  );
}
