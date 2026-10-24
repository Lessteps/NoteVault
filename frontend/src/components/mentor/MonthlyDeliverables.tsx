// Mentor — ENTREGABLES MES A MES: cada mes del plan tiene UN proyecto mensual (= el entregable), hecho de proyectos semanales que a su vez
// se hacen de piezas diarias. El avance NO se marca a mano: sale de lo que el estudiante completa (casillas de la carpeta de cada proyecto
// diario). Un mes o una semana sin empezar queda bloqueado hasta completar el anterior.
//
// `MonthlyDeliverables` es reutilizable (pestaña «Entregables», pestañas «Proyectos» de un área o de un plan): recibe lo cargado del plan y,
// opcionalmente, un `areaId` para ver solo las piezas de esa área y un `month` (AAAA-MM del inicio de la ventana) para ver un solo mes.

import { Check, ChevronDown, Circle, Lock } from "lucide-react";
import { useMemo } from "react";
import { chainProgressText, chainSignalsOf, lockText, planChain, type ChainMonth, type ChainPiece, type ChainWeek } from "../../lib/planChain";
import { dateLabel } from "../../lib/planSchedule";
import { Chip } from "../common/forms";
import { cn } from "../ui";
import { DSTATUS_COLOUR, StatusChip, useAgendaModel } from "./agendaKit";
import { ProjectFolder } from "./ProjectFolder";
import type { Loaded } from "./planShared";

/** La cadena del plan calculada con el avance real (se rehace sola cuando cambia el plan, el reparto o lo completado). */
export function useDeliverableChain(data: Loaded) {
  const plan = data.plan!;
  const m = useAgendaModel(data, plan);
  return useMemo(() => planChain(plan, m.schedule, chainSignalsOf(data.practice, data.dailyProjectDone)), [plan, m.schedule, data.practice, data.dailyProjectDone]);
}

function Bar({ pct, label }: { pct: number; label: string }) {
  return (
    <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={label} className="h-2 w-full overflow-hidden rounded-full bg-hover">
      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: pct >= 100 ? "var(--nv-mint)" : "var(--nv-accent)" }} />
    </div>
  );
}

function PieceRow({ p, planId, week }: { p: ChainPiece; planId: string; week: ChainWeek }) {
  return (
    <li className="rounded-lg border border-line px-3 py-2 text-[14px]" data-testid="chain-piece" data-done={p.done ? "true" : "false"}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span aria-hidden className={cn("grid h-5 w-5 flex-none place-items-center rounded-full border", p.done ? "border-mint bg-mint-soft text-text" : "border-line text-faint")}>
          {p.done ? <Check size={12} /> : <Circle size={8} />}
        </span>
        <span className="min-w-0 flex-1 basis-48 font-medium">{p.title}</span>
        <span className="text-[13px] text-dim">{dateLabel(p.date)} · pieza {p.n} de {p.of}</span>
        <Chip large colour={p.done ? DSTATUS_COLOUR.hecho : p.current ? "var(--nv-accent)" : DSTATUS_COLOUR.pendiente}>{p.done ? "Hecha" : p.current ? "Te toca" : "Pendiente"}</Chip>
      </div>
      {p.description && <p className="mt-1 text-dim">{p.description}</p>}
      <p className="mt-0.5 text-[13px] text-faint">{p.slice}</p>
      {p.current && p.areaIds.length > 0 && (
        <div className="mt-2">
          <ProjectFolder
            planId={planId}
            areaKeys={p.areaIds}
            testid={`chain-folder-${p.id}`}
            label="Crear la carpeta de esta pieza"
            pomodoro={{ folder: `project:piece:${p.id}`, title: `Proyecto: ${p.title}`, areaKey: p.areaIds[0]! }}
            project={{ kind: "daily", title: p.title, description: p.description, date: p.date, weeklyPart: p.slice, topics: [], week: week.week }}
          />
          <p className="mt-1 text-[13px] text-dim">Se da por hecha cuando marcas todas las casillas de su carpeta.</p>
        </div>
      )}
    </li>
  );
}

function WeekBlock({ w, planId, open }: { w: ChainWeek; planId: string; open?: boolean }) {
  return (
    <li className="rounded-xl border border-line bg-surface" data-testid="chain-week" data-status={w.status}>
      <details open={open} className="group">
        <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-2 gap-y-1 px-3.5 py-2.5">
          <ChevronDown size={15} aria-hidden className="flex-none transition-transform group-open:rotate-180" />
          <span className="min-w-0 flex-1 basis-56 text-[15px] font-semibold">Semana {w.week} · {w.title}</span>
          {w.locked ? <Chip large colour="var(--nv-faint)"><Lock size={12} aria-hidden /> {lockText("week", w.lockedBy ?? w.week - 1)}</Chip> : <StatusChip status={w.status} />}
          <span className="text-[13px] text-dim">{chainProgressText(w.done, w.total)}</span>
        </summary>
        <div className="space-y-2 px-3.5 pb-3">
          <p className="text-[14px] text-dim">{w.description}</p>
          <p className="text-[13px] font-medium text-accent-text">{w.slice}</p>
          <Bar pct={w.pct} label={`Avance de la semana ${w.week}`} />
          {w.pieces.length === 0 ? (
            <p className="text-[14px] text-dim">Esta semana no tiene piezas diarias: su proyecto se completa con las fases de práctica.</p>
          ) : (
            <ol className="space-y-1.5" aria-label={`Piezas diarias de la semana ${w.week}`}>
              {w.pieces.map((p) => <PieceRow key={p.id} p={p} planId={planId} week={w} />)}
            </ol>
          )}
        </div>
      </details>
    </li>
  );
}

export function MonthCard({ month, planId, defaultOpen }: { month: ChainMonth; planId: string; defaultOpen?: boolean }) {
  return (
    <li className="rounded-2xl border border-line bg-card p-4 @3xl:p-5" data-testid="chain-month" data-status={month.status} data-locked={month.locked ? "true" : "false"}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <h3 className="min-w-0 flex-1 basis-64 text-[17px] font-semibold leading-snug">{month.title}</h3>
        {month.locked ? <Chip large colour="var(--nv-faint)"><Lock size={12} aria-hidden /> {lockText("month", month.lockedBy ?? month.n - 1)}</Chip> : <StatusChip status={month.status} />}
      </div>
      <p className="mt-0.5 text-[13px] text-faint">Mes {month.n} de {month.of} · {dateLabel(month.start)} – {dateLabel(month.end)} · se entrega el {dateLabel(month.dueDate)}</p>
      <p className="mt-2 text-[14.5px] text-text">{month.goal}</p>
      <div className="mt-3 space-y-1">
        <Bar pct={month.pct} label={`Avance de ${month.title}`} />
        <p className="text-[13px] text-dim">
          {month.weeksDone} de {month.weeks.length} semanas · {chainProgressText(month.done, month.total)}
        </p>
      </div>
      <details className="mt-2">
        <summary className="cursor-pointer text-[14px] font-medium text-accent-text">Cuándo está hecho</summary>
        <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[14px] text-dim" aria-label="Definición de hecho">
          {month.criteria.map((c) => <li key={c}>{c}</li>)}
        </ul>
      </details>
      <ol className="mt-3 space-y-2" aria-label={`Proyectos semanales de ${month.title}`}>
        {month.weeks.map((w) => <WeekBlock key={w.id} w={w} planId={planId} open={defaultOpen ?? w.status === "en_curso"} />)}
      </ol>
    </li>
  );
}

/**
 * Los entregables mes a mes. `areaId` deja solo los meses y piezas donde participa el área; `month` (AAAA-MM) un solo mes.
 * Sin interruptores de estado: el avance se calcula solo.
 */
export function MonthlyDeliverables({ data, areaId, month, heading = true }: { data: Loaded; areaId?: string; month?: string; heading?: boolean }) {
  const chain = useDeliverableChain(data);
  const plan = data.plan!;
  const months = useMemo(() => {
    let ms = chain.months;
    if (month) ms = ms.filter((x) => x.month === month);
    if (areaId) {
      ms = ms
        .filter((x) => x.areaIds.includes(areaId))
        .map((x) => ({ ...x, weeks: x.weeks.map((w) => ({ ...w, pieces: w.pieces.filter((p) => !p.areaIds.length || p.areaIds.includes(areaId)) })) }));
    }
    return ms;
  }, [chain, areaId, month]);
  if (!months.length) {
    return (
      <section aria-label="Entregables mes a mes" data-testid="monthly-deliverables-empty" className="rounded-xl border border-dashed border-line p-4 text-[14px] text-dim">
        Este plan aún no tiene días de estudio con proyecto: cuando los tenga, aquí aparece un entregable por mes.
      </section>
    );
  }
  const doneMonths = months.filter((x) => x.status === "hecho").length;
  return (
    <section aria-labelledby="md-title" data-testid="monthly-deliverables" className="space-y-3">
      {heading && (
        <div>
          <h3 id="md-title" className="text-[17px] font-semibold">Entregables mes a mes</h3>
          <p className="mt-0.5 text-[14px] text-dim">
            {months.length} {months.length === 1 ? "mes" : "meses"} · {doneMonths} {doneMonths === 1 ? "hecho" : "hechos"}. Cada día aporta una pieza a su proyecto semanal y cada semana, una parte al entregable del mes. Se completa automáticamente conforme avanzas: no se marca a mano.
          </p>
        </div>
      )}
      <ol className="space-y-3" aria-label="Entregables por mes">
        {months.map((x) => <MonthCard key={x.id} month={x} planId={plan.id} />)}
      </ol>
    </section>
  );
}
