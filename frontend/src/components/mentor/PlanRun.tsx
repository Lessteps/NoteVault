// Mentor — Plan, VISTA DE EJECUCIÓN: la cara del plan para el día a día. Responde a tres preguntas sin tocar nada del plan:
// ¿qué hago HOY?, ¿cómo voy en cada área? y ¿qué viene después? Es de SOLO LECTURA: no renombra, no reparte, no ajusta, no ejecuta.
// Lo único que ofrece son accesos: «Ver tema» (abre la nota), «Ver en la Agenda» (el día concreto) y «Planear mi día» (el panel Hoy).
// Todo se calcula con el mismo modelo de agenda que la vista de plan (`useAgendaModel`), así que ambas vistas nunca discrepan.

import { CalendarDays, ChevronRight } from "lucide-react";
import { clampToPlan, dateLabel, longDateLabel, type ScheduleDay } from "../../lib/planSchedule";
import { dayByArea, orderedAreas } from "../../lib/planTopicsByArea";
import type { MentorPlan, MentorTopicView } from "../../lib/types";
import { useMentor } from "../../store/mentor";
import { useNavState } from "../../store/navState";
import { Chip, GhostButton, PrimaryButton } from "../common/forms";
import { cn } from "../ui";
import { DeliverableLine, focusColour, plural, useAgendaModel } from "./agendaKit";
import { openTopic } from "./openTopic";
import { hm, ProgressBar } from "./parts";
import { SectionCard, SectionHeading } from "./planKit";
import { openAgendaAt, STATE_COLOUR, STATE_GLYPH, STATE_LABEL, type Loaded } from "./planShared";

const DAY_MS = 86400000;
const UPCOMING_DAYS = 5;
const WEEK_TOPICS_SHOWN = 4;
const DELIVERABLES_SHOWN = 4;

const daysBetween = (from: string, to: string): number => Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS);

/** Un tema con el símbolo de su estado (el color nunca va solo) y su botón «Ver tema». */
function TopicLine({ folder, title, state, minutes, part, parts }: { folder: string; title: string; state?: MentorTopicView["state"]; minutes?: number; part?: number; parts?: number }) {
  const s = state ?? "sin_tratar";
  return (
    <li className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[15px]" data-testid="run-topic">
      <span aria-hidden className="w-5 flex-none text-center text-[16px]" style={{ color: STATE_COLOUR[s] }}>{STATE_GLYPH[s]}</span>
      <span className="min-w-0 flex-1 basis-48">
        <span className="font-medium">{title}</span>
        {parts && parts > 1 ? <span className="text-dim"> · parte {part}/{parts}</span> : null}
        <span className="sr-only">, {STATE_LABEL[s]}</span>
      </span>
      {minutes ? <span className="text-[14px] text-dim">{hm(minutes)}</span> : null}
      <button type="button" onClick={() => void openTopic(folder)} aria-label={`Ver el tema ${title}`} className="inline-flex min-h-8 items-center px-2 text-[14px] text-accent-text underline-offset-2 hover:underline">
        Ver tema
      </button>
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
  const daysLeft = Math.max(0, daysBetween(real, plan.end));
  const deliverables = m.deliverablesDefined
    ? m.deliverables.filter((d) => d.status !== "hecho" && d.dueDate >= date).sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, DELIVERABLES_SHOWN)
    : [];
  const late = (data.derived?.subplans ?? []).reduce((n, s) => n + s.topics.filter((t) => t.route !== "skipped" && t.targetWeek < currentWeek && t.state !== "completo").length, 0);
  const areas = orderedAreas(plan).map((a) => ({ a, sub: plan.subplans.find((s) => s.id === a.subplanId)!, view: data.derived?.subplans.find((s) => s.id === a.subplanId) }));

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
                            <TopicLine key={`${i.folder}:${i.part}`} folder={i.folder} title={i.title} state={m.topicByFolder.get(i.folder)?.state} minutes={i.minutes} part={i.part} parts={i.parts} />
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
      {summary && (
        <section aria-labelledby="run-progress-h" data-testid="run-progress">
          <SectionHeading id="run-progress-h" hint={`Semana ${summary.currentWeek} de ${summary.weeks} · quedan ${plural(daysLeft, "día", "días")} · ${summary.done}/${summary.topics} temas completados.`}>
            Cómo voy
          </SectionHeading>
          <div className="mb-4 flex items-center gap-3 rounded-xl border border-line bg-card px-4 py-3">
            <span className="text-[15px] font-semibold">Plan completo</span>
            <div className="flex-1"><ProgressBar pct={summary.pct} thick label="Avance global del plan" /></div>
            <span className="text-[18px] font-bold">{summary.pct} %</span>
          </div>
          <ul className="grid gap-3 @xl:grid-cols-2 @5xl:grid-cols-3">
            {areas.map(({ a, sub, view }) => {
              const week = sub.topics.filter((t) => t.route !== "skipped" && t.targetWeek === currentWeek).slice(0, WEEK_TOPICS_SHOWN);
              const pct = view?.pct ?? 0;
              return (
                <li key={a.subplanId} className="rounded-xl border border-line bg-card p-3.5" style={{ borderTop: `3px solid ${focusColour(a.areaId)}` }} data-testid="run-area-progress" data-area={a.areaId ?? a.subplanId}>
                  <div className="flex items-baseline gap-2">
                    <h3 className="min-w-0 flex-1 text-[16px] font-semibold">{a.area}</h3>
                    <span className="text-[18px] font-bold">{pct} %</span>
                  </div>
                  <div className="mt-2"><ProgressBar pct={pct} colour={focusColour(a.areaId)} label={`Avance de ${a.area}`} /></div>
                  <p className="mt-1.5 text-[14px] text-dim">{view ? `${view.done}/${view.total} temas` : `${sub.topics.length} temas`}</p>
                  {week.length > 0 && (
                    <>
                      <p className="mt-2 text-[13px] font-semibold uppercase tracking-wider text-faint">Esta semana</p>
                      <ul className="mt-1 space-y-0.5">
                        {week.map((t) => {
                          const s = m.topicByFolder.get(t.folder)?.state ?? "sin_tratar";
                          return (
                            <li key={t.folder} className="flex gap-2 text-[14px]">
                              <span aria-hidden style={{ color: STATE_COLOUR[s] }}>{STATE_GLYPH[s]}</span>
                              <span className="min-w-0 flex-1">{t.title}<span className="sr-only">, {STATE_LABEL[s]}</span></span>
                            </li>
                          );
                        })}
                      </ul>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

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
