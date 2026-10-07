// Mentor — Plan, Agenda: el CALENDARIO (rejilla mensual). Cada día enseña indicadores compactos (nº de temas, kata o sesión de proyecto,
// punto de entregable) y un resumen por semana en el margen; al elegir un día aparece su detalle debajo.
//
// Accesible: `role="grid"` con cabeceras, un único día en el orden de Tab (roving tabindex), flechas ←→↑↓ para moverse entre días
// (Inicio/Fin: lunes/domingo de la semana; RePág/AvPág: mes anterior/siguiente), Intro o Espacio para abrir el día (el foco pasa a su
// detalle) y una etiqueta por día para el lector de pantalla («martes 6 de octubre: 3 temas, 1 entregable»).

import { useEffect, useMemo, useRef, type KeyboardEvent } from "react";
import { addDays, addMonthsToDate, isoDow } from "../../lib/planTime";
import { dateLabel, dayBlockCounts, deliverablesText, longDateLabel, monthName, topicsText } from "../../lib/planSchedule";
import type { MentorPlan } from "../../lib/types";
import { cn } from "../ui";
import { DayDetail } from "./AgendaViews";
import { focusColour, type AgendaModel } from "./agendaKit";
import { DAY_LONG, DAY_SHORT } from "./planShared";

const monthStart = (d: string): string => `${d.slice(0, 7)}-01`;

/** Texto accesible de un día de la rejilla. */
export function cellLabel(m: AgendaModel, date: string): string {
  const day = m.schedule.byDate.get(date);
  if (!day) return `${longDateLabel(date)}: fuera del plan`;
  const due = m.dueByDate.get(date) ?? [];
  const c = dayBlockCounts(day);
  const proj = day.projectMinutes ? ["proyecto diario"] : [];
  const bits = day.focus
    ? [`enfoque ${day.focus.label}`, `${c.theory} ${c.theory === 1 ? "teoría" : "teorías"}`, `${c.practice} ${c.practice === 1 ? "práctica" : "prácticas"}`, ...proj, topicsText(day.topics.length), deliverablesText(due.length)]
    : [topicsText(day.topics.length), deliverablesText(due.length)];
  if (day.practice.kata) bits.push("kata");
  if (day.practice.project) bits.push("sesión de proyecto");
  if (!day.study) bits.push(day.blocked ? "día bloqueado" : "descanso");
  if (date === m.today) bits.push("hoy");
  return `${longDateLabel(date)}: ${bits.join(", ")}`;
}

export function AgendaCalendar({ m, anchor, onSelect, onChanged }: { m: AgendaModel; anchor: string; onSelect: (date: string) => void; onChanged: (p: MentorPlan) => void }) {
  const { plan } = m;
  const gridRef = useRef<HTMLDivElement>(null);
  const detailRef = useRef<HTMLDivElement>(null);
  const wantFocus = useRef(false);
  const month = anchor.slice(0, 7);

  // semanas (lunes a domingo) que cubren el mes
  const weeks = useMemo(() => {
    const first = monthStart(anchor);
    const last = addDays(addDays(first, 32).slice(0, 7) + "-01", -1);
    const start = addDays(first, 1 - isoDow(first));
    const end = addDays(last, 7 - isoDow(last));
    const rows: string[][] = [];
    for (let d = start; d <= end; d = addDays(d, 7)) rows.push(Array.from({ length: 7 }, (_, i) => addDays(d, i)));
    return rows;
  }, [anchor]);
  const inPlan = (d: string): boolean => d >= plan.start && d <= plan.end;

  useEffect(() => {
    if (!wantFocus.current) return;
    wantFocus.current = false;
    gridRef.current?.querySelector<HTMLButtonElement>(`button[data-date="${anchor}"]`)?.focus();
  }, [anchor]);

  const move = (to: string): void => {
    const clamped = to < plan.start ? plan.start : to > plan.end ? plan.end : to;
    wantFocus.current = true;
    onSelect(clamped);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    const target = (e.target as HTMLElement).closest<HTMLElement>("[data-date]");
    const cur = target?.dataset.date;
    if (!cur) return;
    let next: string | null = null;
    if (e.key === "ArrowLeft") next = addDays(cur, -1);
    else if (e.key === "ArrowRight") next = addDays(cur, 1);
    else if (e.key === "ArrowUp") next = addDays(cur, -7);
    else if (e.key === "ArrowDown") next = addDays(cur, 7);
    else if (e.key === "Home") next = addDays(cur, 1 - isoDow(cur));
    else if (e.key === "End") next = addDays(cur, 7 - isoDow(cur));
    else if (e.key === "PageUp") next = addMonthsToDate(cur, -1); // el mismo día del mes anterior (recortado si no existe)
    else if (e.key === "PageDown") next = addMonthsToDate(cur, 1);
    else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (cur !== anchor) onSelect(cur);
      detailRef.current?.focus();
      detailRef.current?.scrollIntoView?.({ block: "nearest" });
      return;
    }
    if (next) {
      e.preventDefault();
      move(next);
    }
  };

  return (
    <div className="space-y-4" data-testid="agenda-calendar">
      <div
        ref={gridRef}
        role="grid"
        aria-label={`Calendario de ${monthName(month)}`}
        aria-describedby="agenda-cal-help"
        onKeyDown={onKeyDown}
        className="overflow-hidden rounded-2xl border border-line bg-card"
        data-testid="agenda-grid"
      >
        <div role="row" className="grid grid-cols-[4.5rem_repeat(7,minmax(0,1fr))] border-b border-line bg-surface text-[13px] font-semibold uppercase tracking-wide text-faint @3xl:grid-cols-[7rem_repeat(7,minmax(0,1fr))]">
          <div role="columnheader" className="px-2 py-2">Semana</div>
          {DAY_SHORT.map((d, i) => (
            <div key={d} role="columnheader" className="px-1 py-2 text-center" aria-label={DAY_LONG[i]}>
              <span aria-hidden>{DAY_LONG[i]!.slice(0, 3)}</span>
            </div>
          ))}
        </div>
        {weeks.filter((row) => row.some(inPlan)).map((row) => {
          // las semanas del plan son bloques de 7 días desde su inicio y no coinciden con las filas lunes–domingo: el margen resume LA FILA y dice qué
          // semana(s) del plan toca
          const sumDays = row.map((d) => m.schedule.byDate.get(d)).filter((x): x is NonNullable<typeof x> => !!x);
          const wkA = sumDays[0]?.week ?? 1;
          const wkB = sumDays[sumDays.length - 1]?.week ?? wkA;
          const wk = wkA === wkB ? String(wkA) : `${wkA}–${wkB}`;
          const topics = new Set(sumDays.flatMap((d) => d.topics.map((t) => t.folder))).size;
          const dels = row.reduce((n, d) => n + (m.dueByDate.get(d)?.length ?? 0), 0);
          const hasWeek = sumDays.length > 0;
          return (
            <div key={row[0]} role="row" className="grid grid-cols-[4.5rem_repeat(7,minmax(0,1fr))] border-b border-line last:border-b-0 @3xl:grid-cols-[7rem_repeat(7,minmax(0,1fr))]">
              <div role="rowheader" className="flex flex-col justify-center border-r border-line bg-surface px-2 py-1.5 text-[13px] leading-snug" data-testid="agenda-week-margin" aria-label={hasWeek ? `${wkA === wkB ? "Semana" : "Semanas"} ${wk}: ${topicsText(topics)}, ${deliverablesText(dels)}` : "Fuera del plan"}>
                {hasWeek ? (
                  <>
                    <span className="font-semibold text-text">{wkA === wkB ? "Sem." : "Sems."} {wk}</span>
                    <span className="text-dim">{topics} {topics === 1 ? "tema" : "temas"}</span>
                    <span className="text-dim">{dels} ent.</span>
                  </>
                ) : (
                  <span className="text-faint">—</span>
                )}
              </div>
              {row.map((date) => {
                const day = m.schedule.byDate.get(date);
                const ok = inPlan(date);
                const selected = date === anchor;
                const outsideMonth = date.slice(0, 7) !== month;
                const due = (m.dueByDate.get(date) ?? []).filter((d) => d.kind !== "daily_project");
                const pendingDue = due.some((d) => d.status !== "hecho");
                return (
                  <div key={date} role="gridcell" aria-selected={ok ? selected : undefined} aria-disabled={ok ? undefined : true} className={cn("min-h-[5.5rem] border-r border-line last:border-r-0", outsideMonth && "bg-surface/60")}>
                    <button
                      type="button"
                      data-date={date}
                      data-selected={selected ? "true" : undefined}
                      tabIndex={ok && selected ? 0 : -1}
                      disabled={!ok}
                      onClick={() => ok && onSelect(date)}
                      aria-label={cellLabel(m, date)}
                      aria-current={date === m.today ? "date" : undefined}
                      className={cn(
                        "flex h-full min-h-[5.5rem] w-full flex-col items-stretch gap-1 px-1.5 py-1.5 text-left text-[14px] outline-none focus-visible:ring-2 focus-visible:ring-text focus-visible:ring-inset",
                        !ok && "cursor-default opacity-40",
                        ok && !selected && "hover:bg-hover",
                        selected && "bg-accent-soft ring-2 ring-inset ring-accent",
                      )}
                    >
                      <span className={cn("flex items-center gap-1 font-semibold", outsideMonth ? "text-faint" : "text-text")} aria-hidden>
                        <span className={cn("grid h-6 min-w-6 place-items-center rounded-full px-1", date === m.today && "bg-[var(--nv-btn,var(--nv-accent))] text-white")}>{Number(date.slice(8))}</span>
                        {Number(date.slice(8)) === 1 && <span className="text-[13px] font-medium uppercase text-dim">{dateLabel(date).split(" ")[1]}</span>}
                      </span>
                      {day?.focus && ok && (
                        <span className="flex items-center gap-1 truncate text-[12.5px] font-medium text-text" aria-hidden data-testid="agenda-cell-focus">
                          <span className="inline-block h-2 w-2 flex-none rounded-sm" style={{ background: focusColour(day.focus.id) }} />
                          <span className="truncate">{day.focus.label}</span>
                        </span>
                      )}
                      {day && ok && (
                        <span className="flex flex-wrap items-center gap-1 text-[13px]" aria-hidden>
                          {day.topics.length > 0 && <span className="rounded bg-accent-soft px-1 font-semibold text-accent-text" title="Temas">{day.topics.length} t</span>}
                          {day.practice.kata && <span className="rounded border border-line px-1 font-semibold text-dim" title="Kata">K</span>}
                          {day.practice.project && <span className="rounded border border-line px-1 font-semibold text-dim" title="Sesión de proyecto">P</span>}
                          {due.length > 0 && (
                            <span className={cn("rounded px-1 font-semibold", pendingDue ? "border border-line text-dim" : "bg-mint/20 text-text")} title="Entregables">◆{due.length > 1 ? due.length : ""}</span>
                          )}
                        </span>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
      <p id="agenda-cal-help" className="text-[13.5px] text-dim">
        Flechas para moverte entre días, Inicio/Fin para el lunes/domingo, Re Pág/Av Pág para cambiar de mes e Intro para abrir el día. «t» = temas, «K» = kata, «P» = sesión de proyecto, «◆» = entregables; el nombre con color es el enfoque del día.
      </p>
      <div ref={detailRef} tabIndex={-1} className="rounded-2xl border border-line bg-card p-4 outline-none @3xl:p-5" data-testid="agenda-calendar-detail">
        <DayDetail m={m} date={anchor} onChanged={onChanged} headingId="agenda-cal-detail-h" level={2} />
      </div>
    </div>
  );
}
