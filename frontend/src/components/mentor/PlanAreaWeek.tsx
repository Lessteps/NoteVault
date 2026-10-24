// Mentor — Planeación: la SEMANA de una página de área (o de Bases). Es la versión «de un área» de `WeekDetail`: encabezado con el resumen, la franja de
// propósito, las 4 tarjetas de cifras, los temas de la semana del área y «Días de la semana (plan diario)». Todos los números salen de los mismos
// selectores que la Agenda y la Ejecución (`mentorAreas.scopeWeekStats` → `byWeekArea` / `dayByArea`), no de un cálculo propio.

import { useMemo, type ReactNode } from "react";
import { paceImpact } from "../../lib/planPaceImpact";
import { dateLabel, deliverablesText, longDateLabel, topicsText, weekSummary } from "../../lib/planSchedule";
import type { MentorPlan } from "../../lib/types";
import { Chip, GhostButton } from "../common/forms";
import { cn } from "../ui";
import { PurposeBlock, type AgendaModel } from "./agendaKit";
import { RegisteredTime, WeekCategories, WeekStats } from "./AgendaBoards";
import { dayViewable, scopeDayRow, scopeOnly, scopeWeekStats, type PageScope } from "./mentorAreas";
import { pagePace } from "./PlanPageSlots";
import { DAY_LONG, DAY_SHORT } from "./planShared";

const SECTION = "text-[13px] font-semibold uppercase tracking-wider text-faint";

/** «Ritmo: 3 temas/día · mínimo 2 · termina el 14 nov»: el ritmo manual de la página y su efecto en el final. Nada si es automático. */
function PaceLine({ m, scope }: { m: AgendaModel; scope: PageScope }) {
  const sid = scope.kind === "area" ? scope.subplanId : undefined;
  const eff = pagePace(m.plan, scope);
  const manual = !!(eff.perDay || eff.minPerDay);
  const finish = useMemo(() => {
    if (!manual || scope.kind === "bases") return undefined;
    const done = new Set<string>();
    for (const s of m.plan.subplans) for (const t of s.topics) if (t.completedAt || m.topicByFolder.get(t.folder)?.state === "completo") done.add(t.folder);
    return paceImpact(m.plan, m.plan.pace, { today: m.today, ...(sid ? { subplanId: sid } : {}), isDone: (f) => done.has(f) });
  }, [manual, m.plan, m.today, m.topicByFolder, sid, scope.kind]);
  if (!manual) return null;
  const parts = [eff.perDay ? `${eff.perDay} ${eff.perDay === 1 ? "tema" : "temas"}/día` : "temas/día automático", ...(eff.minPerDay ? [`mínimo ${eff.minPerDay}`] : [])];
  const end = finish?.remaining === 0 ? "nada pendiente" : finish?.finishDate ? `termina el ${dateLabel(finish.finishDate)}${finish.fits ? "" : `, pero ${finish.overflow} no ${finish.overflow === 1 ? "cabe" : "caben"} antes del fin del plan`}` : "";
  return (
    <p className="text-[14px] text-dim" data-testid="week-pace-line">
      <span className="font-medium text-text">Ritmo:</span> {[...parts, ...(end ? [end] : [])].join(" · ")}
    </p>
  );
}

/** Las tarjetas de CUMPLIMIENTO de una semana de un área (temas hechos, teoría, práctica, proyecto diario) y el «Tiempo registrado» si lo hay. */
export function ScopeWeekCards({ m, scope, week }: { m: AgendaModel; scope: PageScope; week: number }) {
  const w = weekSummary(m.plan, m.schedule, week, []);
  const areaKey = scope.kind === "area" ? m.plan.subplans.find((s) => s.id === scope.subplanId)?.areaId ?? scope.subplanId : undefined;
  return (
    <>
      <WeekStats m={m} week={week} only={scopeOnly(scope)} />
      {w && <RegisteredTime planId={m.plan.id} from={w.start} to={w.end} {...(areaKey ? { areaKey } : {})} />}
      <PaceLine m={m} scope={scope} />
    </>
  );
}

/** Una fila de «Días de la semana»: letra y número, qué se trabaja, cuántos temas, etiquetas y «Ver día». */
export function ScopeDayRow({ m, scope, date, onPick, extra }: { m: AgendaModel; scope: PageScope; date: string; onPick: (d: string) => void; extra?: ReactNode }) {
  const day = m.schedule.byDate.get(date)!;
  const r = scopeDayRow(m, scope, day);
  const today = date === m.today;
  const nExtra = new Set(day.topics.filter((t) => t.extra && (scope.kind !== "area" || t.subplanId === scope.subplanId)).map((t) => t.folder)).size;
  const text = r.titles.length ? r.titles.join(" · ") : day.study ? "Repaso y práctica" : day.blocked ? "Bloqueado" : "Descanso";
  return (
    <li className={cn("flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border px-3.5 py-2.5 text-[14px]", today ? "border-accent bg-accent-soft" : "border-line bg-card")} data-testid="agenda-week-day" data-date={date}>
      <span className="w-14 flex-none font-semibold capitalize">{DAY_SHORT[day.dow - 1]} {Number(date.slice(8))}<span className="sr-only"> {DAY_LONG[day.dow - 1]}</span></span>
      <span className={cn("min-w-0 flex-1 basis-56", r.titles.length ? "text-text" : "text-dim")} data-testid="agenda-week-day-text">{text}</span>
      <span className="whitespace-nowrap font-medium" data-testid="agenda-week-day-count">{topicsText(r.count)}</span>
      {r.theoryMinutes > 0 && <Chip large>Teoría</Chip>}
      {r.practiceMinutes > 0 && <Chip large colour="var(--nv-practice, #c58be0)">Práctica</Chip>}
      {nExtra > 0 && <Chip large colour="var(--nv-accent)">Extra {nExtra}</Chip>}
      {r.project && <Chip large colour="var(--nv-practice, #c58be0)">Proyecto</Chip>}
      {dayViewable(m, day, scopeOnly(scope)) && <GhostButton aria-label={`Ver el día ${longDateLabel(date)}`} onClick={() => onPick(date)}>Ver día</GhostButton>}
      {extra}
    </li>
  );
}

/** La semana `week` de un área o de Bases. */
export function AreaWeek({ m, scope, week, onPickDay, onChanged, headingId, dayExtra }: {
  m: AgendaModel;
  scope: PageScope;
  week: number;
  onPickDay: (date: string) => void;
  onChanged: (p: MentorPlan) => void;
  headingId: string;
  /** gancho al final de cada fila de día (p. ej. «añadir tema extra») */
  dayExtra?: (date: string) => ReactNode;
}) {
  const w = weekSummary(m.plan, m.schedule, week, m.deliverablesDefined ? m.deliverables : []);
  if (!w) return <p className="text-[14px] text-dim">Esa semana no existe en el plan.</p>;
  const stats = scopeWeekStats(m, scope, week, w);
  const days = m.schedule.days.filter((d) => d.week === week);
  const current = m.today >= w.start && m.today <= w.end;
  const del = !m.deliverablesDefined ? "entregables por definir" : stats.deliverables.length === 1 ? `Entregable: ${stats.deliverables[0]!.title}` : deliverablesText(stats.deliverables.length);
  return (
    <article className="space-y-4" data-testid="agenda-week" aria-labelledby={headingId}>
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 id={headingId} className="text-[22px] font-bold leading-tight">Semana {week} <span className="text-[16px] font-normal text-dim">{dateLabel(w.start)} – {dateLabel(w.end)}</span></h2>
        {current && <Chip large colour="var(--nv-mint)">Esta semana</Chip>}
      </header>
      <p className="text-[15px] font-medium text-text" data-testid="agenda-week-counts">
        {topicsText(stats.topics)} · {del}
      </p>
      <PurposeBlock planId={m.plan.id} scope="week" keyName={String(week)} text={w.purpose} auto={w.autoPurpose} manual={!!m.plan.purposes?.week?.[String(week)]} editable={m.editable} onChanged={onChanged} label={`la semana ${week}`} />
      <ScopeWeekCards m={m} scope={scope} week={week} />
      <WeekCategories m={m} week={week} headingId={`${headingId}-areas`} only={scopeOnly(scope)} />
      <section aria-labelledby={`${headingId}-days`} data-testid="agenda-week-days">
        <h3 id={`${headingId}-days`} className={cn(SECTION, "mb-2")}>Días de la semana (plan diario)</h3>
        <ol className="space-y-1.5">
          {days.map((d) => <ScopeDayRow key={d.date} m={m} scope={scope} date={d.date} onPick={onPickDay} {...(dayExtra ? { extra: dayExtra(d.date) } : {})} />)}
        </ol>
      </section>
    </article>
  );
}
