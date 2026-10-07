// Mentor — Plan, «Mi plan»: las FASES DEL PLAN MES A MES. Una tabla accesible (caption, cabeceras de fila y de columna) con una fila por
// área y una columna por mes del periodo: temas planificados (y completados), horas, semanas activas de ese mes, grupos internos que se
// trabajan y los primeros títulos. Fila de totales por mes (temas, horas, entregables, áreas activas). El mes actual se resalta y cada mes
// abre la Agenda en su vista Mes. En un contenedor estrecho la tabla se desplaza DENTRO de su propio contenedor con la primera columna fija.
// Debajo, una mini-barra por semanas da el contexto de las fases (cuándo empieza y acaba cada área).

import { CalendarDays } from "lucide-react";
import { useId, useMemo } from "react";
import { phasesByMonth, monthLong, weeksText, type MonthCell } from "../../lib/planMonths";
import { deliverablesOf } from "../../lib/planSchedule";
import type { MentorPlan } from "../../lib/types";
import { cn } from "../ui";
import { hm } from "./parts";
import { PALETTE, type Loaded } from "./planShared";

const hours = (min: number): string => (min ? hm(min).replace(".", ",") : "0 h");
const temas = (n: number): string => `${n} ${n === 1 ? "tema" : "temas"}`;

export function PhaseMonthTable({ data, plan, onOpenMonth }: { data: Loaded; plan: MentorPlan; /** abre la Agenda (vista Mes) en ese mes */ onOpenMonth: (month: string, firstDay: string) => void }) {
  const uid = useId();
  const model = useMemo(() => {
    const done = new Set((data.derived?.subplans ?? []).flatMap((s) => s.topics.filter((t) => t.state === "completo" || t.completedAt).map((t) => t.folder)));
    let deliverables: Array<{ dueDate: string }> | undefined;
    try {
      deliverables = deliverablesOf(plan as never, data.practice ?? null);
    } catch {
      deliverables = undefined;
    }
    return phasesByMonth(plan, { today: data.today, done: (f) => done.has(f), deliverables });
  }, [plan, data.derived, data.practice, data.today]);

  if (!model.months.length || !plan.subplans.length) return null;
  const colourOf = (id: string) => PALETTE[plan.subplans.findIndex((s) => s.id === id) % PALETTE.length]!;
  const captionId = `${uid}-cap`;

  return (
    <div className="space-y-2" data-testid="plan-months">
      <p className="text-[13.5px] text-dim" aria-hidden>
        Temas planificados (y hechos), horas, semanas activas y grupos de cada área por mes. Pulsa un mes para verlo en la Agenda.
      </p>
      <div
        role="region"
        aria-labelledby={captionId}
        tabIndex={0}
        className="relative max-w-full overflow-x-auto rounded-xl border border-line bg-card"
        data-testid="plan-months-scroll"
      >
        <table className="w-max min-w-full border-separate border-spacing-0 text-left text-[13.5px]" data-testid="plan-months-table">
          <caption id={captionId} className="sr-only">
            Fases del plan mes a mes: temas planificados y completados, horas, semanas activas y grupos de cada área. Pulsa un mes para verlo en la Agenda.
          </caption>
          <thead>
            <tr>
              <th scope="col" className="sticky left-0 z-10 min-w-[9.5rem] border-b border-line bg-card px-3 py-2 align-bottom text-[13px] font-semibold uppercase tracking-wide text-faint">
                Área
              </th>
              {model.months.map((m) => (
                <th
                  key={m.key}
                  scope="col"
                  aria-current={m.current ? "date" : undefined}
                  className={cn("min-w-[11.5rem] border-b border-l border-line px-2 py-1.5 align-bottom", m.current && "bg-accent-soft")}
                  data-testid="plan-month-head"
                  data-current={m.current ? "true" : undefined}
                >
                  <button
                    type="button"
                    onClick={() => onOpenMonth(m.key, `${m.key}-01` < plan.start ? plan.start : `${m.key}-01` > plan.end ? plan.end : `${m.key}-01`)}
                    aria-label={`${monthLong(m.key)}${m.current ? ", mes actual" : ""}: abrir en la Agenda (vista Mes)`}
                    className="inline-flex min-h-8 w-full items-center gap-1.5 rounded-md px-1.5 text-left text-[14px] font-semibold capitalize text-accent-text underline-offset-2 hover:underline"
                  >
                    <CalendarDays size={14} aria-hidden className="flex-none" />
                    <span>{m.label}</span>
                  </button>
                  <span className="block px-1.5 text-[12.5px] font-normal text-dim">
                    sem. {weeksText(m.weeks)}
                    {m.current && <span className="ml-1.5 font-semibold text-accent-text">· actual</span>}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {model.rows.map((r) => (
              <tr key={r.subplanId} data-testid="plan-month-row">
                <th scope="row" className="sticky left-0 z-10 border-b border-line bg-card px-3 py-2 align-top font-medium">
                  <span className="flex items-center gap-2">
                    <span aria-hidden className="inline-block h-3 w-3 flex-none rounded-sm" style={{ background: colourOf(r.subplanId) }} />
                    <span className="text-[14px] text-text">{r.area}</span>
                  </span>
                  <span className="mt-0.5 block text-[12.5px] font-normal text-dim">
                    {temas(r.total)}
                    {r.phase ? ` · sem. ${r.phase.fromWeek}–${r.phase.toWeek}` : ""}
                  </span>
                </th>
                {r.cells.map((c, i) => (
                  <Cell key={c.month} c={c} current={model.months[i]!.current} />
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr data-testid="plan-month-totals">
              <th scope="row" className="sticky left-0 z-10 bg-card px-3 py-2 align-top text-[13px] font-semibold uppercase tracking-wide text-faint">
                Total del mes
              </th>
              {model.totals.map((t, i) => (
                <td key={t.month} className={cn("border-l border-line px-3 py-2 align-top text-[13px]", model.months[i]!.current && "bg-accent-soft")}>
                  <span className="block font-semibold text-text">
                    {temas(t.topics)}
                    {t.done ? <span className="font-normal text-mint"> · {t.done} hechos</span> : null}
                  </span>
                  <span className="block text-dim">
                    {hours(t.minutes)} · {t.areas} {t.areas === 1 ? "área" : "áreas"}
                  </span>
                  {t.deliverables !== null && (
                    <span className="block text-dim">
                      {t.deliverables} {t.deliverables === 1 ? "entregable" : "entregables"}
                    </span>
                  )}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="text-[13px] text-dim">
        Cada semana del plan cuenta en el mes donde cae la mayor parte de sus días. Las horas son la estimación de los temas (la práctica diaria va aparte).
      </p>
    </div>
  );
}

function Cell({ c, current }: { c: MonthCell; current: boolean }) {
  const base = cn("border-b border-l border-line px-3 py-2 align-top", current && "bg-accent-soft");
  if (c.empty) {
    return (
      <td className={cn(base, "text-center text-faint")} data-testid="plan-month-cell" data-empty="true">
        <span aria-hidden>—</span>
        <span className="sr-only">Sin actividad</span>
      </td>
    );
  }
  return (
    <td className={base} data-testid="plan-month-cell">
      {c.topics > 0 ? (
        <span className="block font-semibold text-text">
          {temas(c.topics)}
          {c.done ? <span className="font-normal text-mint"> · {c.done} hechos</span> : null}
          <span className="font-normal text-dim"> · {hours(c.minutes)}</span>
        </span>
      ) : (
        <span className="block text-dim">Sin temas nuevos</span>
      )}
      {c.weeks.length > 0 && <span className="block text-[12.5px] text-dim">activa sem. {weeksText(c.weeks)}</span>}
      {c.groups.length > 0 && (
        <span className="mt-1 block text-[12.5px] text-text">
          {c.groups.map((g) => `${g.title} ${g.count}`).join(" · ")}
        </span>
      )}
      {c.titles.length > 0 && (
        <span className="mt-0.5 block max-w-[15rem] truncate text-[12.5px] text-dim" title={c.titles.join(" · ")}>
          {c.titles.join(" · ")}
          {c.topics > c.titles.length ? "…" : ""}
        </span>
      )}
    </td>
  );
}
