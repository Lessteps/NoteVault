// Mentor — Plan, VISTA DE EJECUCIÓN: la cara del plan para el día a día. Responde a tres preguntas sin tocar nada del plan:
// ¿qué hago HOY?, ¿cómo voy en cada área? y ¿qué viene después? Es de SOLO LECTURA: no renombra, no reparte, no ajusta, no ejecuta.
// Lo único que ofrece son accesos: «Ver tema» (abre la nota), «Ver en la Agenda» (el día concreto) y «Planear mi día» (el panel Hoy).
// Todo se calcula con el mismo modelo de agenda que la vista de plan (`useAgendaModel`), así que ambas vistas nunca discrepan.

import { CalendarDays, ChevronRight, Lock } from "lucide-react";
import { useMemo } from "react";
import { planGate } from "../../lib/planGate";
import { clampToPlan, dateLabel, longDateLabel, type ScheduleDay } from "../../lib/planSchedule";
import { dayByArea } from "../../lib/planTopicsByArea";
import type { MentorPlan, MentorTopicView } from "../../lib/types";
import { useMentor } from "../../store/mentor";
import { useNavState } from "../../store/navState";
import { Chip, GhostButton, PrimaryButton } from "../common/forms";
import { cn } from "../ui";
import { DeliverableLine, focusColour, plural, useAgendaModel } from "./agendaKit";
import { openTopic } from "./openTopic";
import { hm, ProgressBar } from "./parts";
import { PlanBoard } from "./PlanBoard";
import { SectionCard, SectionHeading } from "./planKit";
import { openAgendaAt, STATE_COLOUR, STATE_GLYPH, STATE_LABEL, type Loaded } from "./planShared";

const UPCOMING_DAYS = 5;
const DELIVERABLES_SHOWN = 4;

/** Un tema con el símbolo de su estado (el color nunca va solo) y su botón «Ver tema». */
function TopicLine({ folder, title, state, minutes, part, parts, lockedBy }: { folder: string; title: string; state?: MentorTopicView["state"]; minutes?: number; part?: number; parts?: number; /** fecha del día que hay que terminar antes (ruta sólida) */ lockedBy?: string }) {
  const s = state ?? "sin_tratar";
  return (
    <li className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[15px]" data-testid="run-topic">
      <span aria-hidden className="w-5 flex-none text-center text-[16px]" style={{ color: STATE_COLOUR[s] }}>{lockedBy ? <Lock size={14} className="mx-auto text-faint" /> : STATE_GLYPH[s]}</span>
      <span className="min-w-0 flex-1 basis-48">
        <span className="font-medium">{title}</span>
        {parts && parts > 1 ? <span className="text-dim"> · parte {part}/{parts}</span> : null}
        <span className="sr-only">, {lockedBy ? `bloqueado hasta terminar el ${dateLabel(lockedBy)}` : STATE_LABEL[s]}</span>
      </span>
      {minutes ? <span className="text-[14px] text-dim">{hm(minutes)}</span> : null}
      {lockedBy ? (
        <span className="text-[13.5px] text-faint" data-testid="run-topic-locked">Bloqueado</span>
      ) : (
        <button type="button" onClick={() => void openTopic(folder)} aria-label={`Ver el tema ${title}`} className="inline-flex min-h-8 items-center px-2 text-[14px] text-accent-text underline-offset-2 hover:underline">
          Ver tema
        </button>
      )}
    </li>
  );
}

export function PlanRun({ data, plan }: { data: Loaded; plan: MentorPlan }) {
  const m = useAgendaModel(data, plan);
  const setPending = useMentor((s) => s.setPendingObjective);
  const summary = data.derived?.summary;
  const real = m.today;
  const before = real < plan.start;
  const after = real > plan.end;
  const date = clampToPlan(real, plan);
  const day: ScheduleDay | undefined = m.schedule.byDate.get(date);
  const due = m.dueByDate.get(date) ?? [];
  const entries = day ? dayByArea(plan, day, due) : [];
  const langBlocks = (day?.blocks ?? []).filter((b) => b.daily && b.status !== "omitted");
  const topicsToday = day?.topics ?? [];
  const doneToday = topicsToday.filter((t) => t.done).length;
  const pctToday = topicsToday.length ? Math.round((doneToday / topicsToday.length) * 100) : 0;
  const isToday = date === real && !before && !after;
  const canPlan = isToday && !plan.proposed && !plan.archived && (topicsToday.some((t) => !t.done) || !!day?.practice.kata || !!day?.practice.project);
  const upcoming = m.schedule.days.filter((d) => d.date > date && d.study).slice(0, UPCOMING_DAYS);
  const nextStudy = before ? m.schedule.days.find((d) => d.study) : undefined;
  const currentWeek = summary?.currentWeek ?? 1;
  const deliverables = m.deliverablesDefined
    ? m.deliverables.filter((d) => d.status !== "hecho" && d.dueDate >= date).sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, DELIVERABLES_SHOWN)
    : [];
  // Ruta sólida: no se avanza sin cerrar el día pendiente más antiguo.
  const gate = useMemo(
    () => planGate(m.schedule.days.map((d) => ({ date: d.date, topics: d.topics.map((t) => ({ folder: t.folder, done: t.done })) })), (f) => m.topicByFolder.get(f)?.state === "completo"),
    [m.schedule, m.topicByFolder],
  );
  const behind = !!gate.frontier && gate.frontier < date && !plan.proposed && !plan.archived;
  const titleOf = (folder: string): string => m.topicByFolder.get(folder)?.title ?? folder.split("/").pop() ?? folder;
  const late = (data.derived?.subplans ?? []).reduce((n, s) => n + s.topics.filter((t) => t.route !== "skipped" && t.targetWeek < currentWeek && t.state !== "completo").length, 0);

  const planToday = () => {
    setPending({ type: "plan" });
    useNavState.getState().set("mentor.view", "hoy");
  };

  return (
    <div className="space-y-5 pb-4" data-testid="plan-run">
      {/* 1 · HOY */}
      <SectionCard labelledBy="run-today-h" testid="run-today" className="space-y-4 border-2 border-accent/50">
        <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <div className="min-w-0 flex-1 basis-64">
            <p className="font-mono text-[13px] uppercase tracking-wider text-faint">{isToday ? "Hoy" : before ? "El plan aún no empieza" : after ? "El plan terminó" : "Día del plan"}</p>
            <h2 id="run-today-h" className="text-[24px] font-bold leading-tight first-letter:uppercase">{longDateLabel(date)}</h2>
          </div>
          {day && <Chip large colour="var(--nv-accent)">Semana {day.week}</Chip>}
          {day?.focus && (
            <span className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 py-1 text-[14px] font-semibold">
              <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: focusColour(day.focus.id) }} />
              Enfoque: {day.focus.label}
            </span>
          )}
          {canPlan && (
            <PrimaryButton large onClick={planToday} data-testid="run-plan-day">
              <CalendarDays size={16} aria-hidden /> Planear mi día
            </PrimaryButton>
          )}
        </header>

        {behind && gate.blockers.length > 0 && (
          <div role="status" className="rounded-xl border border-warn/60 bg-warn-soft px-4 py-3" data-testid="run-gate">
            <p className="flex items-center gap-2 text-[15px] font-semibold text-warn"><Lock size={15} aria-hidden /> Ruta sólida: termina primero los temas del {longDateLabel(gate.frontier!)}</p>
            <p className="mt-1 text-[14px] text-dim">Hasta cerrar ese día, lo que viene después queda bloqueado. Te falta: {gate.blockers.map(titleOf).join(" · ")}.</p>
            <GhostButton className="mt-2" onClick={() => openAgendaAt(plan.id, gate.frontier!, "dia")}>Ver ese día en la Agenda</GhostButton>
          </div>
        )}
        {before && nextStudy && <p className="text-[15px] text-dim" data-testid="run-before">Empieza el {longDateLabel(nextStudy.date)}. Mientras, repasa el plan en «Vista de plan».</p>}
        {after && <p className="text-[15px] text-dim" data-testid="run-after">Este plan ya terminó. Revisa tu avance por área abajo.</p>}
        {day && !day.study && !before && !after && <p className="text-[15px] text-dim" data-testid="run-rest">{day.blocked ? "Día bloqueado: hoy no hay estudio programado." : "Día de descanso: hoy no hay estudio programado."}</p>}

        {day?.study && (
          <>
            {day.focus?.line && <p className="text-[17px] font-semibold" data-testid="run-line">{day.focus.line}</p>}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[15px] text-dim">
              <span><strong className="text-text">{hm(day.topicMinutes + day.practiceMinutes)}</strong> de {hm(day.capacityMinutes)} disponibles</span>
              <span><strong className="text-text">{doneToday}/{topicsToday.length}</strong> {topicsToday.length === 1 ? "tema hecho" : "temas hechos"}</span>
              <div className="min-w-32 flex-1 basis-40"><ProgressBar pct={pctToday} thick label="Avance de hoy" /></div>
            </div>

            {entries.length === 0 && langBlocks.length === 0 && !day.practice.kata && !day.practice.project && (
              <p className="text-[14px] text-dim">Sin temas repartidos hoy: queda para repaso o para recuperar lo atrasado.</p>
            )}

            {entries.length > 0 && (
              <ul className="grid gap-3 @3xl:grid-cols-2" aria-label="Qué estudiar hoy, por área">
                {entries.map((e) => {
                  const items = (e.blocks ?? []).flatMap((b) => b.items.filter((i) => !i.applied));
                  const seen = new Set<string>();
                  const unique = items.filter((i) => (seen.has(`${i.folder}:${i.part}`) ? false : (seen.add(`${i.folder}:${i.part}`), true)));
                  return (
                    <li key={e.subplanId} className="rounded-xl border border-line bg-surface p-3.5" style={{ borderTop: `3px solid ${focusColour(e.areaId)}` }} data-testid="run-area" data-area={e.areaId ?? e.subplanId}>
                      <div className="flex flex-wrap items-baseline gap-x-2">
                        <h3 className="text-[16px] font-semibold">{e.area}</h3>
                        <span className="text-[14px] text-dim">{[e.theoryMinutes ? `${hm(e.theoryMinutes)} de teoría` : "", e.practiceMinutes ? `${hm(e.practiceMinutes)} de práctica` : ""].filter(Boolean).join(" · ")}</span>
                      </div>
                      {unique.length > 0 && (
                        <ul className="mt-2 space-y-1.5">
                          {unique.map((i) => (
                            <TopicLine key={`${i.folder}:${i.part}`} folder={i.folder} title={i.title} state={m.topicByFolder.get(i.folder)?.state} minutes={i.minutes} part={i.part} parts={i.parts} lockedBy={gate.locked.get(i.folder)} />
                          ))}
                        </ul>
                      )}
                      {e.project && <p className="mt-2 text-[14px] text-dim">Hoy toca también un proyecto de esta área.</p>}
                    </li>
                  );
                })}
              </ul>
            )}

            {(day.practice.kata || day.practice.project || langBlocks.length > 0) && (
              <ul className="flex flex-wrap gap-2" aria-label="Práctica del día" data-testid="run-practice">
                {day.practice.kata && <li><Chip large colour="var(--nv-practice, #c58be0)">Kata · {hm(day.practice.kata.minutes)}</Chip></li>}
                {day.practice.project && <li><Chip large colour="var(--nv-practice, #c58be0)">Proyecto semanal · {hm(day.practice.project.minutes)}</Chip></li>}
                {langBlocks.map((b) => <li key={b.id}><Chip large colour="var(--nv-accent)">{b.label} · {hm(b.minutes)}</Chip></li>)}
              </ul>
            )}

            {due.length > 0 && m.deliverablesDefined && (
              <ul className="space-y-2" aria-label="Entregables de hoy">
                {due.map((d) => <DeliverableLine key={d.id} d={d} />)}
              </ul>
            )}
          </>
        )}
        {late > 0 && <p className="text-[14px] text-warn" data-testid="run-late">{plural(late, "tema atrasado", "temas atrasados")} de semanas anteriores: están en «Vista de plan», dentro de cada área.</p>}
      </SectionCard>

      {/* 2 · Cómo voy */}
      <PlanBoard plan={plan} data={data} byFolder={m.topicByFolder} gate={gate} currentWeek={currentWeek} />

      {/* 3 · Lo que viene */}
      {(upcoming.length > 0 || deliverables.length > 0) && (
        <section aria-labelledby="run-next-h" data-testid="run-next">
          <SectionHeading id="run-next-h" hint="Los próximos días de estudio y los entregables que vencen pronto.">Lo que viene</SectionHeading>
          <div className="grid items-start gap-4 @4xl:grid-cols-2 [&>*]:min-w-0">
            {upcoming.length > 0 && (
              <ul className="space-y-2" aria-label="Próximos días">
                {upcoming.map((d) => (
                  <li key={d.date}>
                    <button
                      type="button"
                      onClick={() => openAgendaAt(plan.id, d.date, "dia")}
                      aria-label={`Ver en la Agenda: ${longDateLabel(d.date)}`}
                      className={cn("nv-ghost flex w-full items-center gap-3 rounded-xl border border-line bg-card px-3.5 py-2.5 text-left hover:border-accent")}
                      data-testid="run-upcoming-day"
                    >
                      <span className="w-16 flex-none text-[14px] font-semibold">{dateLabel(d.date)}</span>
                      <span className="min-w-0 flex-1 text-[14px]">
                        <span className="font-medium">{d.focus?.label ?? "Estudio"}</span>
                        <span className="text-dim"> · {plural(d.topics.length, "tema", "temas")} · {hm(d.topicMinutes + d.practiceMinutes)}</span>
                      </span>
                      <ChevronRight size={16} aria-hidden className="flex-none text-faint" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {deliverables.length > 0 && (
              <ul className="space-y-2" aria-label="Próximos entregables">
                {deliverables.map((d) => <DeliverableLine key={d.id} d={d} showDate={dateLabel(d.dueDate)} />)}
              </ul>
            )}
          </div>
        </section>
      )}

      <p className="flex flex-wrap items-center gap-2 text-[14px] text-faint">
        Vista de solo lectura.
        <GhostButton onClick={() => openAgendaAt(plan.id, date, "dia")}>Ver el día en la Agenda</GhostButton>
      </p>
    </div>
  );
}
