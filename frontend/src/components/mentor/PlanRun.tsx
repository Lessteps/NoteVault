// Mentor — Plan, VISTA DE EJECUCIÓN: la cara del plan para el día a día. Es una barra de pestañas y cada una enseña SOLO lo suyo:
//   · General: el resumen de hoy (qué toca, la ruta sólida), el presupuesto de estudio, el avance de cada área y lo que viene.
//   · una pestaña por área: lo que toca hoy en esa área, su sesión (Pomodoro y registro de horas) y su ruta completa.
//   · Bases: los fundamentos que se intercalan en todas las áreas (no son de la ruta de Backend ni de ninguna otra).
//   · Proyectos: el proyecto diario y el semanal.
// Es de SOLO LECTURA sobre el plan: no renombra, no reparte, no ajusta, no ejecuta. Todo se calcula con el mismo modelo de agenda que la
// vista de plan (`useAgendaModel`), así que ambas vistas nunca discrepan.

import { CalendarDays, ChevronRight, Lock, NotebookText } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../lib/bridge";
import { areaSets } from "../../lib/planAreaLists";
import { planGateByArea } from "../../lib/planGate";
import { catchUpOf } from "../../lib/planCatchUp";
import { bucketReviews, dueText, reviewsOfTopics, type ReviewRow } from "../../lib/planReviews";
import { clampToPlan, dateLabel, longDateLabel, type ScheduleDay } from "../../lib/planSchedule";
import { dailyProjectOf, weeklyProjectOf } from "../../lib/planCurriculum";
import { dayByArea, orderedAreas } from "../../lib/planTopicsByArea";
import { routeStarted, timeTagOf, topicTimes } from "../../lib/planTopicTime";
import { minutesOn, minutesText } from "../../lib/timeLog";
import type { MentorPlan } from "../../lib/types";
import { useMentor } from "../../store/mentor";
import { useNavState } from "../../store/navState";
import { Chip, GhostButton, PrimaryButton } from "../common/forms";
import { cn } from "../ui";
import { useTimeLog } from "./AreaSession";
import { useReviewItems, type UpcomingWeekView, type WeekDayView } from "./AreaWork";
import { openTopic } from "./openTopic";
import { DeliverableLine, focusColour, plural, useAgendaModel } from "./agendaKit";
import { hm, ProgressBar } from "./parts";
import { ProgressOverview, type BoardRow } from "./PlanBoard";
import { usePlanAreaPractice } from "./PracticeCard";
import { RunProjects } from "./PlanRunPractice";
import { RunArea, RunBases, RunNav, type RunTab, type TodayCard } from "./PlanRunTabs";
import { SectionHeading } from "./planKit";
import { DAY_LONG, openAgendaAt, openPlanRecords, type Loaded } from "./planShared";

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
  // Ruta sólida POR ÁREA: cada área no avanza sin cerrar su día pendiente más antiguo (un atraso en Frontend no bloquea Backend).
  const gate = useMemo(
    () => planGateByArea(m.schedule.days.map((d) => ({ date: d.date, topics: d.topics.map((t) => ({ folder: t.folder, done: t.done, subplanId: t.subplanId })) })), (f) => m.topicByFolder.get(f)?.state === "completo"),
    [m.schedule, m.topicByFolder],
  );
  // Aviso de constancia: lo atrasado y el ritmo que hace falta para llegar a la fecha de fin.
  const catchUp = useMemo(() => {
    const study = m.schedule.days.filter((d) => d.study && d.date >= date && d.date <= plan.end);
    const cap = study.length ? Math.round(study.reduce((n, d) => n + d.capacityMinutes, 0) / study.length) : 0;
    return catchUpOf(m.schedule.days.map((d) => ({ date: d.date, study: d.study, topics: d.topics.map((t) => ({ folder: t.folder, title: t.title, minutes: t.minutes, done: t.done, area: t.area })) })), date, plan.end, (f) => m.topicByFolder.get(f)?.state === "completo", cap);
  }, [m.schedule, m.topicByFolder, date, plan.end]);
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
  // Etiqueta de tiempo de cada tema: su ventana de reparto. Nada está pendiente hasta que la ruta empieza y su tiempo pasa.
  const started = useMemo(() => routeStarted([...m.topicByFolder.values()].map((t) => t.state), plan.subplans.some((s) => s.topics.some((t) => t.completedAt))), [m.topicByFolder, plan.subplans]);
  const times = useMemo(
    () => topicTimes(m.schedule.days.map((d) => ({ date: d.date, topics: d.topics.map((t) => ({ folder: t.folder, done: t.done || m.topicByFolder.get(t.folder)?.state === "completo" })) }))),
    [m.schedule, m.topicByFolder],
  );
  const timeOf = (folder: string, done: boolean) => timeTagOf(times.get(folder), done, date, started);
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
    const time = timeOf(i.folder, state === "completo");
    return {
      ...(time ? { time } : {}),
      folder: i.folder,
      title: i.title,
      meta: `${withBases ? "Bases · " : ""}${i.parts > 1 ? `parte ${i.part}/${i.parts} · ` : ""}${hm(i.minutes)}`,
      week: currentWeek,
      state,
      done: state === "completo",
      exercises: 0,
      pct: m.topicByFolder.get(i.folder)?.pct ?? 0,
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
  // Repaso espaciado (el mismo calendario del módulo de estudio): los repasos de cada área, unidos con los temas del plan
  const reviewData = useReviewItems();
  const reviewItems = reviewData.data?.items ?? [];
  const isBasesTopic = (sub: (typeof plan.subplans)[number], group?: string): boolean => !!group && (sub.groups ?? []).some((g) => g.kind === "bases" && g.id === group);
  const routeRowOf = (t: (typeof plan.subplans)[number]["topics"][number]): BoardRow => {
    const state = m.topicByFolder.get(t.folder)?.state ?? "sin_tratar";
    const isDone = state === "completo" || !!t.completedAt;
    const time = timeOf(t.folder, isDone);
    return { ...(time ? { time } : {}), folder: t.folder, title: t.title, week: t.targetWeek, state, done: isDone, exercises: m.topicByFolder.get(t.folder)?.exercises ?? 0, pct: m.topicByFolder.get(t.folder)?.pct ?? 0, unlockOn: gate.locked.get(t.folder) };
  };
  const routeOf = (subplanId: string): BoardRow[] => {
    const sub = plan.subplans.find((x) => x.id === subplanId);
    return sub ? sub.topics.filter((t) => t.route !== "skipped" && !isBasesTopic(sub, t.group)).map(routeRowOf) : [];
  };
  const reviewsOf = (subplanId: string): ReviewRow[] => {
    const sub = plan.subplans.find((x) => x.id === subplanId);
    return sub ? reviewsOfTopics(sub.topics.filter((t) => t.route !== "skipped" && !isBasesTopic(sub, t.group)), reviewItems) : [];
  };
  // la semana en curso día a día: los temas de un área (o, sin área, los fundamentos) repartidos cada día de estudio
  const weekDaysOf = (subplanId: string | null): WeekDayView[] =>
    m.schedule.days
      .filter((d) => d.week === currentWeek && d.study)
      .map((d) => {
        const seen = new Set<string>();
        const rows: BoardRow[] = [];
        for (const t of d.topics) {
          if (subplanId ? t.subplanId !== subplanId || t.applied : !t.applied) continue;
          if (seen.has(t.folder)) continue;
          seen.add(t.folder);
          rows.push(rowOf(t, subplanId === null));
        }
        // los días ANTERIORES a hoy solo enseñan lo que ya se hizo (tu avance): lo que no se tocó no se ofrece como si fuera de ese día, sigue en «Pendientes»
        return { date: d.date, label: `${DAY_LONG[d.dow - 1] ?? ""} ${dateLabel(d.date)}`, rows: d.date < date ? rows.filter((r) => r.done) : rows };
      })
      .filter((d) => d.date >= date || d.rows.length > 0);
  // lo que viene: las semanas siguientes a la actual, tal como las reparte el plan (proyección; no se bloquea por la ruta sólida)
  const upcomingWeeksOf = (subplanId: string | null): UpcomingWeekView[] => {
    const byWeek = new Map<number, ScheduleDay[]>();
    for (const d of m.schedule.days) if (d.week > currentWeek && d.study) byWeek.set(d.week, [...(byWeek.get(d.week) ?? []), d]);
    const out: UpcomingWeekView[] = [];
    for (const [week, days] of [...byWeek].sort((a, b) => a[0] - b[0])) {
      const views = days
        .map((d) => {
          const seen = new Set<string>();
          const rows: BoardRow[] = [];
          for (const t of d.topics) {
            if (t.done || (subplanId ? t.subplanId !== subplanId || t.applied : !t.applied)) continue;
            if (seen.has(t.folder)) continue;
            seen.add(t.folder);
            const { unlockOn: _unlock, ...row } = rowOf(t, subplanId === null);
            rows.push({ ...row, week });
          }
          return { date: d.date, label: `${DAY_LONG[d.dow - 1] ?? ""} ${dateLabel(d.date)}`, rows };
        })
        .filter((d) => d.rows.length > 0);
      if (views.length) out.push({ week, start: days[0]!.date, end: days[days.length - 1]!.date, days: views });
    }
    return out;
  };
  const basesRoute: BoardRow[] = [];
  const basesTopics: Array<{ folder: string; title: string }> = [];
  {
    const seenRoute = new Set<string>();
    for (const sp of plan.subplans) {
      for (const t of sp.topics) {
        if (!isBasesTopic(sp, t.group) || t.route === "skipped" || seenRoute.has(t.folder)) continue;
        seenRoute.add(t.folder);
        basesRoute.push(routeRowOf(t));
        basesTopics.push({ folder: t.folder, title: t.title });
      }
    }
    basesRoute.sort((a, b) => a.week - b.week);
  }
  const basesReviews = reviewsOfTopics(basesTopics, reviewItems);
  const allTopics = plan.subplans.flatMap((sp) => sp.topics.filter((t) => t.route !== "skipped").map((t) => ({ folder: t.folder, title: t.title })));
  const planReviews = reviewsOfTopics(allTopics, reviewItems);
  const planBuckets = bucketReviews(planReviews, date);
  const dueByArea = new Map(areaList.map((a) => [a.subplanId, reviewsOf(a.subplanId).filter((r) => r.inDays <= 0).length] as const));

  const tabs: RunTab[] = [
    { id: "general", label: "Plan de estudio" },
    ...areaList.map((a) => {
      const c = cardOf.get(a.subplanId);
      const due = dueByArea.get(a.subplanId) ?? 0;
      return {
        id: `area:${a.subplanId}`,
        label: a.area,
        colour: focusColour(a.areaId),
        ...((c && c.rows.length) || due ? { hint: `${c && c.rows.length ? `${c.doneN}/${c.rows.length}` : ""}${due ? `${c && c.rows.length ? " · " : ""}${due} ⟳` : ""}`, hintLabel: `${c && c.rows.length ? `${c.doneN} de ${c.rows.length} temas de hoy hechos` : "sin temas hoy"}${due ? `, ${due} repasos para hoy` : ""}` } : {}),
      };
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
      <RunNav
        tabs={tabs}
        active={tab}
        onSelect={go}
        right={<GhostButton onClick={() => openPlanRecords(plan.id)} data-testid="run-records"><NotebookText size={14} aria-hidden /> Registros</GhostButton>}
      />

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
                  <p className="mt-1 text-[14px] text-dim">Hasta cerrar ese día, lo que viene después queda bloqueado. Te falta: {gate.blockers.slice(0, 5).map(titleOf).join(" · ")}{gate.blockers.length > 5 ? ` y ${gate.blockers.length - 5} más` : ""}.</p>
                  <GhostButton className="mt-2" onClick={() => openAgendaAt(plan.id, gate.frontier!, "dia")}>Ver ese día en la Agenda</GhostButton>
                </div>
              )}
              {before && nextStudy && <p className="text-[15px] text-dim" data-testid="run-before">Empieza el {longDateLabel(nextStudy.date)}. Mientras, repasa el plan en «Vista de plan».</p>}
              {after && <p className="text-[15px] text-dim" data-testid="run-after">Este plan ya terminó. Revisa tu avance por área en la columna de la derecha.</p>}
              {day && !day.study && !before && !after && <p className="text-[15px] text-dim" data-testid="run-rest">{day.blocked ? "Día bloqueado: hoy no hay estudio programado." : "Día de descanso: hoy no hay estudio programado."}</p>}

              {day?.study && (
                <>
                  {day.focus?.line && <p className="text-[14.5px] leading-relaxed text-dim" data-testid="run-line">{day.focus.line}</p>}
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
            <section aria-labelledby="run-reviews-h" className={cn(card, "space-y-3")} data-testid="run-reviews">
              <div className="flex items-baseline gap-2">
                <h2 id="run-reviews-h" className="flex-1 text-[17px] font-bold">Repasos</h2>
                <span className="text-[13px] text-dim">{planBuckets.today.length} hoy · {planBuckets.week.length} esta semana · {planBuckets.nextWeek.length} la próxima</span>
              </div>
              {planBuckets.today.length === 0 ? (
                <p className="text-[13.5px] text-dim">No tienes repasos vencidos ni para hoy. Cada tema que practicas programa el siguiente repaso (3, 7, 14, 30, 60 y 120 días).</p>
              ) : (
                <ul className="space-y-1.5" aria-label="Repasos para hoy">
                  {planBuckets.today.slice(0, 6).map((r) => (
                    <li key={r.path} className="flex items-center gap-2 text-[14px]" data-testid="run-review-row">
                      <span className="min-w-0 flex-1"><span className="block truncate">{r.title}</span><span className="block text-[12.5px] text-dim">{dueText(r.inDays)}</span></span>
                      <GhostButton onClick={() => void openTopic(r.folder)} aria-label={`Ir a la práctica de repaso de ${r.title}`}>Ir al repaso</GhostButton>
                    </li>
                  ))}
                </ul>
              )}
              {planBuckets.today.length > 6 && <p className="text-[12.5px] text-faint">Y {planBuckets.today.length - 6} más: míralos en la pestaña de cada área, en «Por repasar».</p>}
            </section>
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
                  {[...areaList.map((a) => ({ key: a.areaId ?? a.subplanId, name: a.area })), { key: "bases", name: "Bases" }, { key: "libre", name: "Sesión libre" }]
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
          area={areaTab}
          card={cardOf.get(areaTab.subplanId)}
          routeRows={routeOf(areaTab.subplanId)}
          weekDays={weekDaysOf(areaTab.subplanId)}
          upcoming={upcomingWeeksOf(areaTab.subplanId)}
          sets={areaSets(m.schedule.days, areaTab.subplanId, date, currentWeek, started)}
          reviews={reviewsOf(areaTab.subplanId)}
          date={date}
          practice={ap.data && ap.data.areas.length ? { areas: ap.data.areas, today: ap.data.today || m.today, mark: ap.mark } : undefined}
          dailyProject={day ? dailyProjectOf(plan, m.schedule, day) : null}
          {...(day && weeklyProjectOf(plan, m.schedule, day.week) ? { weeklyProjectTitle: weeklyProjectOf(plan, m.schedule, day.week)!.title } : {})}
          onGoProjects={() => go("proyectos")}
        />
      )}

      {tab === "bases" && <RunBases plan={plan} routeRows={basesRoute} todayRows={basesRows} weekDays={weekDaysOf(null)} upcoming={upcomingWeeksOf(null)} sets={areaSets(m.schedule.days, null, date, currentWeek, started)} reviews={basesReviews} date={date} />}

      {tab === "proyectos" && <RunProjects plan={plan} data={data} m={m} />}

      {/* AVISO DE CONSTANCIA: al final de todo */}
      {!plan.proposed && !plan.archived && !before && !after && catchUp.late.length > 0 && (
        <section role="status" className="rounded-2xl border border-warn/60 bg-warn-soft p-5" data-testid="run-catchup">
          <h2 className="text-[17px] font-bold text-warn">Vas atrasado en {plural(catchUp.late.length, "tema", "temas")}</h2>
          <ul className="mt-1 text-[14.5px] text-dim" aria-label="Atraso por área">
            {catchUp.lateByArea.map((a) => (
              <li key={a.area}><strong className="text-text">{a.area}</strong>: {plural(a.count, "tema", "temas")} atrasado{a.count === 1 ? "" : "s"} ({catchUp.late.filter((l) => l.area === a.area).slice(0, 3).map((l) => l.title).join(" · ")}{a.count > 3 ? "…" : ""})</li>
            ))}
          </ul>
          <p className="mt-2 text-[14.5px]">
            Para terminar el {longDateLabel(plan.end)} debes completar {plural(catchUp.remaining, "tema pendiente", "temas pendientes")} en {plural(catchUp.daysLeft, "día de estudio", "días de estudio")}: unos <strong>{String(catchUp.perDay).replace(".", ",")} temas por día</strong> (≈ {hm(catchUp.minutesPerDay)}).
          </p>
          {catchUp.capacityPerDay > 0 && catchUp.minutesPerDay > catchUp.capacityPerDay && (
            <p className="mt-1 text-[14px] text-warn">Eso supera tu tiempo diario de teoría ({hm(catchUp.capacityPerDay)}): sube el tiempo diario o mueve la fecha de fin.</p>
          )}
        </section>
      )}
    </div>
  );
}
