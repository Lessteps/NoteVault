// Mentor — Plan, VISTA DE EJECUCIÓN: la cara del plan para el día a día. Responde a tres preguntas sin tocar nada del plan:
// ¿qué hago HOY?, ¿cómo voy en cada área? y ¿qué viene después? Es de SOLO LECTURA: no renombra, no reparte, no ajusta, no ejecuta.
// Lo único que ofrece son accesos: «Ver tema» (abre la nota), «Ver en la Agenda» (el día concreto) y «Planear mi día» (el panel Hoy).
// Todo se calcula con el mismo modelo de agenda que la vista de plan (`useAgendaModel`), así que ambas vistas nunca discrepan.

import { CalendarDays, ChevronRight, Lock } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../lib/bridge";
import { planGate } from "../../lib/planGate";
import { clampToPlan, dateLabel, longDateLabel, type ScheduleDay } from "../../lib/planSchedule";
import { dayByArea } from "../../lib/planTopicsByArea";
import type { MentorPlan } from "../../lib/types";
import { useMentor } from "../../store/mentor";
import { useNavState } from "../../store/navState";
import { Chip, GhostButton, PrimaryButton } from "../common/forms";
import { cn } from "../ui";
import { DeliverableLine, focusColour, plural, useAgendaModel } from "./agendaKit";
import { hm, ProgressBar } from "./parts";
import { AreaCardShell, PlanBoard, TopicRow, type BoardRow } from "./PlanBoard";
import { usePlanAreaPractice } from "./PracticeCard";
import { RunProjects } from "./PlanRunPractice";
import { SectionCard, SectionHeading } from "./planKit";
import { openAgendaAt, type Loaded } from "./planShared";

const UPCOMING_DAYS = 5;
const DELIVERABLES_SHOWN = 4;

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
  const canPlan = isToday && !plan.proposed && !plan.archived && (topicsToday.some((t) => !t.done) || !!day?.practice.project);
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
  // La práctica diaria de cada área vive en su tarjeta de «Cómo voy». Cada área debe tener su carpeta en programming_practice: si falta, se deja
  // preparada una sola vez (solo estructura, nunca sobrescribe y sin katas: esos se crean al abrirlos).
  const ap = usePlanAreaPractice(plan.id);
  const setupTried = useRef(false);
  useEffect(() => {
    const d = ap.data;
    if (setupTried.current || !d || !d.ppReady || !d.areas.some((a) => !a.folderReady)) return;
    setupTried.current = true;
    void api.mentorAreaPracticeSetup(plan.id).then(() => ap.reload()).catch(() => undefined);
  }, [ap, plan.id]);
  const behind = !!gate.frontier && gate.frontier < date && !plan.proposed && !plan.archived;
  const titleOf = (folder: string): string => m.topicByFolder.get(folder)?.title ?? folder.split("/").pop() ?? folder;
  const late = (data.derived?.subplans ?? []).reduce((n, s) => n + s.topics.filter((t) => t.route !== "skipped" && t.targetWeek < currentWeek && t.state !== "completo").length, 0);

  // una pestaña por área de hoy: cada una enseña SOLO su tarjeta (temas de hoy y su práctica); abre en la primera con algo pendiente
  const cards = entries.map((e) => {
    const items = (e.blocks ?? []).flatMap((bl) => bl.items);
    const seen = new Set<string>();
    const unique = items.filter((i) => (seen.has(`${i.folder}:${i.part}`) ? false : (seen.add(`${i.folder}:${i.part}`), true)));
    const rows: BoardRow[] = unique.map((i) => {
      const state = m.topicByFolder.get(i.folder)?.state ?? "sin_tratar";
      return {
        folder: i.folder,
        title: i.title,
        meta: `${i.applied ? "Bases · " : ""}${i.parts > 1 ? `parte ${i.part}/${i.parts} · ` : ""}${hm(i.minutes)}`,
        week: currentWeek,
        state,
        done: state === "completo",
        exercises: 0,
        unlockOn: gate.locked.get(i.folder),
      };
    });
    return { e, rows, colour: focusColour(e.areaId), doneN: rows.filter((r) => r.done).length };
  });
  const [areaSel, setAreaSel] = useState("");
  const activeCard = cards.find((c) => c.e.subplanId === areaSel) ?? cards.find((c) => c.doneN < c.rows.length) ?? cards[0];

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

            {entries.length === 0 && langBlocks.length === 0 && !day.practice.project && (
              <p className="text-[14px] text-dim">Sin temas repartidos hoy: queda para repaso o para recuperar lo atrasado.</p>
            )}

            {entries.length > 0 && (
              <div className="space-y-3" data-testid="run-areas">
                <nav aria-label="Áreas de hoy" data-testid="run-area-tabs" className="min-w-0">
                  <ul className="flex gap-1 overflow-x-auto border-b border-line py-1">
                    {cards.map((c) => {
                      const on = c.e.subplanId === activeCard?.e.subplanId;
                      return (
                        <li key={c.e.subplanId} className="flex-none">
                          <button
                            type="button"
                            aria-pressed={on}
                            aria-current={on ? "page" : undefined}
                            onClick={() => setAreaSel(c.e.subplanId)}
                            data-testid={`run-area-tab-${c.e.areaId ?? c.e.subplanId}`}
                            className={cn("inline-flex min-h-10 items-center gap-2 whitespace-nowrap rounded-lg border px-3 text-[14.5px] font-medium transition-colors", on ? "border-accent bg-accent-soft text-accent-text" : "border-transparent text-dim hover:bg-hover hover:text-text")}
                          >
                            <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: c.colour }} />
                            {c.e.area}
                            <span className="rounded-md bg-hover px-1.5 text-[12px] text-dim">
                              <span aria-hidden>{c.doneN}/{c.rows.length}</span>
                              <span className="sr-only"> ({c.doneN} de {c.rows.length} temas hechos)</span>
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </nav>
                {activeCard && (
                  <AreaCardShell
                    key={activeCard.e.subplanId}
                    colour={activeCard.colour}
                    title={activeCard.e.area}
                    badge={`${activeCard.doneN}/${activeCard.rows.length}`}
                    sub={[activeCard.e.theoryMinutes ? `${hm(activeCard.e.theoryMinutes)} teoría` : "", activeCard.e.practiceMinutes ? `${hm(activeCard.e.practiceMinutes)} práctica` : ""].filter(Boolean).join(" · ")}
                    tag={activeCard.e.project ? "Con proyecto" : undefined}
                    testid="run-area"
                    area={activeCard.e.areaId ?? activeCard.e.subplanId}
                  >
                    <ul className="space-y-0.5" aria-label={`Temas de hoy de ${activeCard.e.area}`}>
                      {activeCard.rows.map((r) => <TopicRow key={`${r.folder}:${r.meta}`} r={r} colour={activeCard.colour} />)}
                    </ul>
                  </AreaCardShell>
                )}
              </div>
            )}

            {(day.practice.project || langBlocks.length > 0) && (
              <ul className="flex flex-wrap gap-2" aria-label="Práctica del día" data-testid="run-practice">
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

      {/* 2 · Cómo voy: cada área con sus temas Y su práctica diaria */}
      <PlanBoard
        plan={plan}
        data={data}
        byFolder={m.topicByFolder}
        gate={gate}
        currentWeek={currentWeek}
        practice={ap.data && ap.data.areas.length ? { areas: ap.data.areas, today: ap.data.today || m.today, mark: ap.mark } : undefined}
      />

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
        Desde aquí no se cambia el plan: solo se marca la práctica del día.
        <GhostButton onClick={() => openAgendaAt(plan.id, date, "dia")}>Ver el día en la Agenda</GhostButton>
        <GhostButton onClick={() => useNavState.getState().set("mentor.view", "cierre")} data-testid="run-close-day">Cerrar el día con el Mentor</GhostButton>
      </p>

      {/* 4 · Proyectos diario y semanal, abajo del todo */}
      <RunProjects plan={plan} data={data} m={m} />
    </div>
  );
}
