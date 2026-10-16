// Mentor — Plan, VISTA DE EJECUCIÓN: la cara del plan para el día a día. Es una barra de pestañas y cada una enseña SOLO lo suyo:
//   · General: el resumen de hoy (qué toca, la ruta sólida), el presupuesto de estudio, el avance de cada área y lo que viene.
//   · una pestaña por área: lo que toca hoy en esa área, su sesión (Pomodoro y registro de horas) y su ruta completa.
//   · Bases: los fundamentos que se intercalan en todas las áreas (no son de la ruta de Backend ni de ninguna otra).
//   · Proyectos: el proyecto diario y el semanal.
// Es de SOLO LECTURA sobre el plan: no renombra, no reparte, no ajusta, no ejecuta. Todo se calcula con el mismo modelo de agenda que la
// vista de plan (`useAgendaModel`), así que ambas vistas nunca discrepan.

import { CalendarDays, ChevronRight, Lock } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../lib/bridge";
import { planGate } from "../../lib/planGate";
import { clampToPlan, dateLabel, longDateLabel, type ScheduleDay } from "../../lib/planSchedule";
import { dayByArea, orderedAreas } from "../../lib/planTopicsByArea";
import { minutesOn, minutesText } from "../../lib/timeLog";
import type { MentorPlan } from "../../lib/types";
import { useMentor } from "../../store/mentor";
import { useNavState } from "../../store/navState";
import { Chip, GhostButton, PrimaryButton } from "../common/forms";
import { cn } from "../ui";
import { PomodoroTicker, useTimeLog } from "./AreaSession";
import { DeliverableLine, focusColour, plural, useAgendaModel } from "./agendaKit";
import { hm, ProgressBar } from "./parts";
import { ProgressOverview, type BoardRow } from "./PlanBoard";
import { usePlanAreaPractice } from "./PracticeCard";
import { RunProjects } from "./PlanRunPractice";
import { RunArea, RunBases, RunNav, type RunTab, type TodayCard } from "./PlanRunTabs";
import { SectionHeading } from "./planKit";
import { openAgendaAt, type Loaded } from "./planShared";

const UPCOMING_DAYS = 5;
const DELIVERABLES_SHOWN = 4;
const card = "rounded-2xl border border-line bg-card p-5";

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
  // La práctica diaria de cada área vive en la pestaña de su área. Cada área debe tener su carpeta en programming_practice: si falta, se deja
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
  const { entries: timeEntries } = useTimeLog(plan.id);

  const planToday = () => {
    setPending({ type: "plan" });
    useNavState.getState().set("mentor.view", "hoy");
  };

  // Lo de hoy por área. Los fundamentos («Bases») NO son de ningún área: se sacan de las tarjetas de área y van juntos, sin repetirse, a su pestaña.
  const rowOf = (i: { folder: string; title: string; part: number; parts: number; minutes: number }, withBases: boolean): BoardRow => {
    const state = m.topicByFolder.get(i.folder)?.state ?? "sin_tratar";
    return {
      folder: i.folder,
      title: i.title,
      meta: `${withBases ? "Bases · " : ""}${i.parts > 1 ? `parte ${i.part}/${i.parts} · ` : ""}${hm(i.minutes)}`,
      week: currentWeek,
      state,
      done: state === "completo",
      exercises: 0,
      unlockOn: gate.locked.get(i.folder),
    };
  };
  const seenBases = new Set<string>();
  const basesRows: BoardRow[] = [];
  const cards: TodayCard[] = entries.map((e) => {
    const items = (e.blocks ?? []).flatMap((bl) => bl.items);
    const seen = new Set<string>();
    const own = items.filter((i) => !i.applied && (seen.has(`${i.folder}:${i.part}`) ? false : (seen.add(`${i.folder}:${i.part}`), true)));
    for (const i of items.filter((x) => x.applied)) {
      if (seenBases.has(`${i.folder}:${i.part}`)) continue;
      seenBases.add(`${i.folder}:${i.part}`);
      basesRows.push(rowOf(i, true));
    }
    const rows = own.map((i) => rowOf(i, false));
    return { entry: e, rows, colour: focusColour(e.areaId), doneN: rows.filter((r) => r.done).length };
  });
  const cardOf = new Map(cards.map((c) => [c.entry.subplanId, c] as const));
  const areaList = orderedAreas(plan);
  const basesDone = basesRows.filter((r) => r.done).length;
  const hasBasesRoute = plan.subplans.some((s) => { const g = (s.groups ?? []).find((x) => x.kind === "bases"); return !!g && s.topics.some((t) => t.group === g.id && t.route !== "skipped"); });

  const tabs: RunTab[] = [
    { id: "general", label: "General" },
    ...areaList.map((a) => {
      const c = cardOf.get(a.subplanId);
      return { id: `area:${a.subplanId}`, label: a.area, colour: focusColour(a.areaId), ...(c && c.rows.length ? { hint: `${c.doneN}/${c.rows.length}`, hintLabel: `${c.doneN} de ${c.rows.length} temas de hoy hechos` } : {}) };
    }),
    ...(basesRows.length || hasBasesRoute ? [{ id: "bases", label: "Bases", colour: "var(--nv-accent)", ...(basesRows.length ? { hint: `${basesDone}/${basesRows.length}`, hintLabel: `${basesDone} de ${basesRows.length} temas de hoy hechos` } : {}) }] : []),
    { id: "proyectos", label: "Proyectos" },
  ];
  const [tabSel, setTabSel] = useState("general");
  const tab = tabs.some((t) => t.id === tabSel) ? tabSel : "general";
  const go = (id: string): void => {
    setTabSel(id);
    document.querySelector("[data-testid=run-nav]")?.scrollIntoView?.({ block: "start" });
  };
  const areaTab = tab.startsWith("area:") ? areaList.find((a) => `area:${a.subplanId}` === tab) : undefined;

  const planned = day ? day.topicMinutes + day.practiceMinutes : 0;
  const capacity = day?.capacityMinutes ?? 0;
  const excess = planned - capacity;
  const loggedToday = minutesOn(timeEntries, date);

  return (
    <div className="space-y-6 pb-4" data-testid="plan-run">
      <PomodoroTicker />
      <RunNav tabs={tabs} active={tab} onSelect={go} />

      {tab === "general" && (
        <div className="grid items-start gap-6 @4xl:grid-cols-[minmax(0,1fr)_24rem]" data-testid="run-general">
          <div className="min-w-0 space-y-6">
            {/* HOY */}
            <section aria-labelledby="run-today-h" data-testid="run-today" className={cn(card, "space-y-5 border-2 border-accent/50")}>
              <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <div className="min-w-0 flex-1 basis-64">
                  <p className="font-mono text-[13px] uppercase tracking-wider text-faint">{isToday ? "Hoy" : before ? "El plan aún no empieza" : after ? "El plan terminó" : "Día del plan"}</p>
                  <h2 id="run-today-h" className="text-[26px] font-bold leading-tight first-letter:uppercase">{longDateLabel(date)}</h2>
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
                <div role="status" className="rounded-xl border border-warn/60 bg-warn-soft px-4 py-3.5" data-testid="run-gate">
                  <p className="flex items-center gap-2 text-[15px] font-semibold text-warn"><Lock size={15} aria-hidden /> Ruta sólida: termina primero los temas del {longDateLabel(gate.frontier!)}</p>
                  <p className="mt-1 text-[14px] text-dim">Hasta cerrar ese día, lo que viene después queda bloqueado. Te falta: {gate.blockers.map(titleOf).join(" · ")}.</p>
                  <GhostButton className="mt-2" onClick={() => openAgendaAt(plan.id, gate.frontier!, "dia")}>Ver ese día en la Agenda</GhostButton>
                </div>
              )}
              {before && nextStudy && <p className="text-[15px] text-dim" data-testid="run-before">Empieza el {longDateLabel(nextStudy.date)}. Mientras, repasa el plan en «Vista de plan».</p>}
              {after && <p className="text-[15px] text-dim" data-testid="run-after">Este plan ya terminó. Revisa tu avance por área en la columna de la derecha.</p>}
              {day && !day.study && !before && !after && <p className="text-[15px] text-dim" data-testid="run-rest">{day.blocked ? "Día bloqueado: hoy no hay estudio programado." : "Día de descanso: hoy no hay estudio programado."}</p>}

              {day?.study && (
                <>
                  {day.focus?.line && <p className="text-[17px] font-semibold" data-testid="run-line">{day.focus.line}</p>}
                  {entries.length === 0 && langBlocks.length === 0 && !day.practice.project && (
                    <p className="text-[14px] text-dim">Sin temas repartidos hoy: queda para repaso o para recuperar lo atrasado.</p>
                  )}
                  {(cards.length > 0 || basesRows.length > 0) && (
                    <div data-testid="run-composition">
                      <p className="mb-2 text-[14px] text-dim">Lo programado para hoy, por área (pulsa una para abrirla):</p>
                      <ul className="flex flex-wrap gap-2" aria-label="Áreas de hoy">
                        {cards.filter((c) => c.rows.length > 0 || c.entry.practiceMinutes > 0).map((c) => (
                          <li key={c.entry.subplanId}>
                            <button type="button" onClick={() => go(`area:${c.entry.subplanId}`)} className="inline-flex min-h-9 items-center gap-2 rounded-full border px-3 text-[14px] hover:bg-hover" style={{ borderColor: `${c.colour}66` }} data-testid="run-composition-chip">
                              <span aria-hidden className="inline-block h-2 w-2 rounded-full" style={{ background: c.colour }} />
                              <span className="text-text">{c.entry.area}</span>
                              <span className="text-dim">{plural(c.rows.length, "tema", "temas")} · {hm(c.entry.theoryMinutes + c.entry.practiceMinutes)}</span>
                            </button>
                          </li>
                        ))}
                        {basesRows.length > 0 && (
                          <li>
                            <button type="button" onClick={() => go("bases")} className="inline-flex min-h-9 items-center gap-2 rounded-full border border-accent/50 px-3 text-[14px] hover:bg-hover" data-testid="run-composition-chip">
                              <span className="text-text">Bases</span>
                              <span className="text-dim">{plural(basesRows.length, "tema", "temas")}</span>
                            </button>
                          </li>
                        )}
                      </ul>
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[15px] text-dim">
                    <span><strong className="text-text">{doneToday}/{topicsToday.length}</strong> {topicsToday.length === 1 ? "tema hecho" : "temas hechos"}</span>
                    <div className="min-w-32 flex-1 basis-40"><ProgressBar pct={pctToday} thick label="Avance de hoy" /></div>
                  </div>
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
            </section>

            {/* LO QUE VIENE: solo en la vista general */}
            {(upcoming.length > 0 || deliverables.length > 0) && (
              <section aria-labelledby="run-next-h" data-testid="run-next">
                <SectionHeading id="run-next-h" hint="Los próximos días de estudio y los entregables que vencen pronto.">Lo que viene</SectionHeading>
                <div className="grid items-start gap-4 @3xl:grid-cols-2 [&>*]:min-w-0">
                  {upcoming.length > 0 && (
                    <ul className="space-y-2" aria-label="Próximos días">
                      {upcoming.map((d) => (
                        <li key={d.date}>
                          <button
                            type="button"
                            onClick={() => openAgendaAt(plan.id, d.date, "dia")}
                            aria-label={`Ver en la Agenda: ${longDateLabel(d.date)}`}
                            className="nv-ghost flex w-full items-center gap-3 rounded-xl border border-line bg-card px-3.5 py-3 text-left hover:border-accent"
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
          </div>

          {/* Columna lateral: presupuesto, avance de cada área y horas de hoy */}
          <aside aria-label="Resumen del día" className="min-w-0 space-y-5">
            {day?.study && (
              <section aria-labelledby="run-budget-h" className={cn(card, "space-y-3")} data-testid="run-budget">
                <div className="flex items-center gap-2">
                  <h2 id="run-budget-h" className="flex-1 text-[17px] font-bold">Presupuesto de estudio</h2>
                  {excess > 0 && <Chip colour="var(--nv-warn)">+{excess} min exceso</Chip>}
                </div>
                <p className="flex items-baseline gap-2 text-[14.5px] text-dim">Tiempo estimado hoy <span className="flex-1" /><strong className="text-[19px] text-text">{hm(planned)}</strong> / {hm(capacity)}</p>
                <ProgressBar pct={capacity ? Math.min(100, Math.round((planned / capacity) * 100)) : 0} thick label="Tiempo estimado de hoy frente al disponible" />
                <dl className="grid grid-cols-2 gap-3 text-[13.5px]">
                  <div className="rounded-xl border border-line bg-surface px-3 py-2"><dt className="text-dim">Temas para hoy</dt><dd className="text-[19px] font-bold">{doneToday} / {topicsToday.length}</dd></div>
                  <div className="rounded-xl border border-line bg-surface px-3 py-2"><dt className="text-dim">Proyecto semanal</dt><dd className="text-[19px] font-bold">{day.practice.project ? hm(day.practice.project.minutes) : "—"}</dd></div>
                </dl>
              </section>
            )}
            <ProgressOverview plan={plan} data={data} compact onPick={(id) => go(`area:${id}`)} />
            <section aria-labelledby="run-hours-h" className={cn(card, "space-y-2")} data-testid="run-hours">
              <div className="flex items-baseline gap-2">
                <h2 id="run-hours-h" className="flex-1 text-[17px] font-bold">Horas de hoy</h2>
                <strong className="text-[17px]">{minutesText(loggedToday)}</strong>
              </div>
              {loggedToday === 0 ? (
                <p className="text-[13.5px] text-dim">Aún no has registrado tiempo. Abre un área y empieza un Pomodoro.</p>
              ) : (
                <ul className="space-y-1 text-[14px]" aria-label="Horas de hoy por área">
                  {[...areaList.map((a) => ({ key: a.areaId ?? a.subplanId, name: a.area })), { key: "bases", name: "Bases" }]
                    .map((a) => ({ ...a, min: minutesOn(timeEntries, date, a.key) }))
                    .filter((a) => a.min > 0)
                    .map((a) => <li key={a.key} className="flex"><span className="flex-1 text-dim">{a.name}</span><span className="font-semibold">{minutesText(a.min)}</span></li>)}
                </ul>
              )}
            </section>
          </aside>
        </div>
      )}

      {areaTab && (
        <RunArea
          plan={plan}
          data={data}
          area={areaTab}
          card={cardOf.get(areaTab.subplanId)}
          date={date}
          hasStudy={!!day?.study}
          gate={gate}
          currentWeek={currentWeek}
          byFolder={m.topicByFolder}
          practice={ap.data && ap.data.areas.length ? { areas: ap.data.areas, today: ap.data.today || m.today, mark: ap.mark } : undefined}
          onGoProjects={() => go("proyectos")}
        />
      )}

      {tab === "bases" && <RunBases plan={plan} today={basesRows} byFolder={m.topicByFolder} gate={gate} date={date} />}

      {tab === "proyectos" && <RunProjects plan={plan} data={data} m={m} />}
    </div>
  );
}
