// Mentor — Plan, Agenda: las vistas de DÍA, SEMANA y MES de un plan. Cada una enseña lo que toca (temas con minutos, agrupados por la ruta
// de cada área, la práctica y los entregables), con su descripción de propósito y el CONTEO visible de temas y entregables.
// Todo se calcula con `lib/planSchedule.ts` a partir del plan; lo único que se escribe son los propósitos editados a mano.

import { CalendarDays } from "lucide-react";
import type { ReactNode } from "react";
import { dateLabel, dayPurpose, deliverablesText, longDateLabel, monthSummary, topicsText, weekSummary, type ScheduleDay } from "../../lib/planSchedule";
import { PHASE_LABEL, PRACTICE_NAME, type PracticePhase } from "../../lib/practiceTrack";
import { areaShort, dayBases, dayByArea } from "../../lib/planTopicsByArea";
import type { MentorPlan } from "../../lib/types";
import { useMentor } from "../../store/mentor";
import { useNavState } from "../../store/navState";
import { Chip, GhostButton, PrimaryButton } from "../common/forms";
import { cn } from "../ui";
import { AreaChip, AreaCounts, DeliverableLine, doneText, focusColour, plural, PurposeBlock, type AgendaModel } from "./agendaKit";
import { DayDetailFocus, FocusStructure, MonthProjects, WeekProjects } from "./AgendaDayFocus";
import { AreaDot, MonthAreaTotals } from "./AreaViews";
import { MonthLegend, MonthStats, MonthWeekBlock, RegisteredTime, topicsPerDay, WeekCategories, WeekDayStrip, WeekStats } from "./AgendaBoards";
import { dayViewable } from "./mentorAreas";
import { ExtraTag, removeExtraTopic } from "./extraKit";
import { openTopic } from "./openTopic";
import { TopicNoteLinks } from "./TopicNoteLinks";
import { hm, ProgressBar } from "./parts";
import { openPractice } from "./PracticeCard";
import { DAY_LONG, DAY_SHORT, PALETTE, STATE_COLOUR, STATE_GLYPH, STATE_LABEL } from "./planShared";

const SECTION = "text-[13px] font-semibold uppercase tracking-wider text-faint";

const colourOfArea = (m: AgendaModel, subplanId: string): string => {
  const sub = m.plan.subplans.find((s) => s.id === subplanId);
  return sub?.areaId ? focusColour(sub.areaId) : PALETTE[Math.max(0, m.plan.subplans.findIndex((s) => s.id === subplanId)) % PALETTE.length]!;
};
/** «3 temas · 2 h · 1 entregable» o, mientras no haya entregables definidos, «Entregables: por definir» (una sola vez). */
const countsLine = (m: AgendaModel, parts: string[], nDeliverables: number): string => [...parts, m.deliverablesDefined ? deliverablesText(nDeliverables) : "Entregables: por definir"].join(" · ");

/** Un día: propósito, temas con minutos, la ruta de cada área, la práctica y los entregables. */
export function DayDetail({ m, date, onChanged, headingId, level = 2, areaFilter = null }: { m: AgendaModel; date: string; onChanged: (p: MentorPlan) => void; headingId?: string; level?: 2 | 3; /** subplan elegido en el filtro por área (null = todas) */ areaFilter?: string | null }) {
  const setPending = useMentor((s) => s.setPendingObjective);
  const day = m.schedule.byDate.get(date);
  const H = level === 2 ? "h2" : "h3";
  const H2 = level === 2 ? "h3" : "h4";
  if (!day) {
    return <p className="rounded-xl border border-dashed border-line p-4 text-[14px] text-dim" data-testid="agenda-day-outside">El {longDateLabel(date)} queda fuera del plan ({dateLabel(m.plan.start)} – {dateLabel(m.plan.end)}).</p>;
  }
  if (m.schedule.mode === "focus") return <DayDetailFocus m={m} date={date} onChanged={onChanged} {...(headingId ? { headingId } : {})} level={level} areaFilter={areaFilter} />;
  const due = m.dueByDate.get(date) ?? [];
  const real = due.filter((d) => d.kind !== "kata");
  const purpose = dayPurpose(m.plan, day, m.deliverablesDefined ? due : []);
  const pending = day.topics.filter((t) => !t.done);
  const done = day.topics.filter((t) => t.done);
  // la ruta de cada área: qué parte avanza hoy
  const routes = [...new Map(day.topics.map((t) => [t.subplanId, t])).keys()].map((sid) => {
    const mine = day.topics.filter((t) => t.subplanId === sid);
    const sub = m.plan.subplans.find((s) => s.id === sid)!;
    const last = mine[mine.length - 1]!;
    const next = sub.topics.slice(last.position, last.position + 2).filter((t) => !t.completedAt);
    return { sid, sub, mine, first: mine[0]!, last, next };
  });
  const isToday = date === m.today;
  const canPlan = isToday && !m.plan.proposed && !m.plan.archived;
  const practiceCount = (day.practice.kata ? 1 : 0) + (day.practice.project ? 1 : 0);
  return (
    <article className="space-y-4" data-testid="agenda-day" aria-labelledby={headingId}>
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <H id={headingId} className="text-[20px] font-bold leading-tight first-letter:uppercase">{longDateLabel(date)}</H>
        <Chip large colour="var(--nv-accent)">Semana {day.week}</Chip>
        {isToday && <Chip large colour="var(--nv-mint)">Hoy</Chip>}
        {!day.study && <Chip large colour="var(--nv-faint)">{day.blocked ? "Bloqueado" : "Descanso"}</Chip>}
        <span className="flex-1" />
        {canPlan && practiceCount > 0 && (
          <GhostButton large onClick={() => { setPending({ type: "programming_practice" }); useNavState.getState().set("mentor.view", "hoy"); }} title="Solo el kata y el proyecto de hoy">
            {PRACTICE_NAME} (kata + proyecto)
          </GhostButton>
        )}
        {canPlan && (
          <PrimaryButton large onClick={() => { setPending({ type: "plan" }); useNavState.getState().set("mentor.view", "hoy"); }} disabled={!pending.length && !practiceCount}>
            <CalendarDays size={16} aria-hidden /> Planear mi día con esto
          </PrimaryButton>
        )}
      </header>

      <p className="text-[15px] font-medium text-text" data-testid="agenda-day-counts">
        {countsLine(m, [topicsText(day.topics.length), ...(day.study ? [] : [day.blocked ? "bloqueado" : "descanso"])], due.length)}
        {m.deliverablesDefined && <AreaCounts plan={m.plan} list={due} testid="area-counts-day" />}
      </p>

      <PurposeBlock planId={m.plan.id} scope="day" keyName={date} text={purpose.text} auto={purpose.auto} manual={purpose.manual} editable={m.editable} onChanged={onChanged} label={longDateLabel(date)} />

      <section aria-labelledby={`${headingId ?? "day"}-topics`} data-testid="agenda-day-topics">
        <H2 id={`${headingId ?? "day"}-topics`} className={cn(SECTION, "mb-2")}>Temas del día</H2>
        {day.topics.length === 0 ? (
          <p className="text-[14px] text-dim">{day.study ? "Ningún tema repartido este día: queda para práctica, repaso o recuperar lo atrasado." : "No hay estudio programado este día."}</p>
        ) : (
          <ul className="space-y-2">
            {[...pending, ...done].map((t) => {
              const live = m.topicByFolder.get(t.folder);
              const state = t.done ? "completo" : (live?.state ?? "sin_tratar");
              return (
                <li key={`${t.subplanId}:${t.folder}:${t.part}`} className="flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-xl border border-line p-3" data-testid="agenda-topic">
                  <span className="min-w-0 flex-1 basis-56 text-[15px] font-medium" title={t.folder}>{t.title}</span>
                  <AreaChip colour={colourOfArea(m, t.subplanId)}>{t.area}</AreaChip>
                  {t.extra && <ExtraTag title={t.title} onRemove={() => void removeExtraTopic(m.plan.id, date, t.folder, onChanged)} />}
                  {t.groupTitle && <Chip large>{t.groupTitle}</Chip>}
                  {t.parts > 1 && <span className="text-[13.5px] text-dim">parte {t.part} de {t.parts}</span>}
                  {t.overflow && <Chip large colour="var(--nv-warn)">No cabe: amontonado</Chip>}
                  <span className="text-[14px] font-medium" data-testid="agenda-topic-minutes">est. {hm(t.minutes)}</span>
                  <Chip large colour={STATE_COLOUR[state]}><span aria-hidden>{STATE_GLYPH[state]}</span> {STATE_LABEL[state]}</Chip>
                  {live?.found && (
                    <button type="button" onClick={() => void openTopic(t.folder)} className="inline-flex min-h-8 items-center px-2 text-[14px] text-accent-text underline-offset-2 hover:underline" aria-label={`Ver tema ${t.title}`}>Ver tema</button>
                  )}
                  {live?.found && <TopicNoteLinks folder={t.folder} title={t.title} practice={false} />}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {routes.length > 0 && (
        <section aria-labelledby={`${headingId ?? "day"}-routes`} data-testid="agenda-day-routes">
          <H2 id={`${headingId ?? "day"}-routes`} className={cn(SECTION, "mb-2")}>Tu ruta de estudio, por áreas</H2>
          <ul className="grid items-start gap-3 @3xl:grid-cols-2">
            {routes.map(({ sid, sub, mine, first, last, next }) => (
              <li key={sid} className="rounded-xl border border-line bg-card p-3.5" style={{ borderTop: `3px solid ${colourOfArea(m, sid)}` }} data-testid="agenda-route">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-[15px] font-semibold">{sub.area}</span>
                  {sub.phase && <span className="text-[13.5px] text-dim">semanas {sub.phase.fromWeek}–{sub.phase.toWeek}</span>}
                </div>
                <p className="mt-0.5 text-[14px] text-dim">
                  {first.groupTitle ? `${first.groupTitle} · ` : ""}
                  {mine.length === 1 ? `tema ${first.position}` : `temas ${first.position}–${last.position}`} de {first.total} en la ruta
                </p>
                <div className="mt-2 flex items-center gap-3">
                  <div className="flex-1"><ProgressBar pct={m.pctBySubplan.get(sid) ?? 0} colour={colourOfArea(m, sid)} label={`Avance de ${sub.area}`} /></div>
                  <span className="text-[14px] font-semibold">{m.pctBySubplan.get(sid) ?? 0} %</span>
                </div>
                <ul className="mt-2 list-disc space-y-0.5 pl-5 text-[14px]">
                  {mine.map((t) => <li key={`${t.folder}:${t.part}`}>{t.title} </li>)}
                </ul>
                {next.length > 0 && <p className="mt-1.5 text-[13.5px] text-dim">Después: {next.map((t) => t.title).join(" · ")}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby={`${headingId ?? "day"}-practice`} data-testid="agenda-day-practice">
        <H2 id={`${headingId ?? "day"}-practice`} className={cn(SECTION, "mb-2")}>Práctica del día</H2>
        {practiceCount === 0 ? (
          <p className="text-[14px] text-dim">{m.plan.programmingPractice ? "Hoy no toca kata ni sesión de proyecto." : `Este plan no incluye ${PRACTICE_NAME}.`}</p>
        ) : (
          <ul className="space-y-2">
            {day.practice.kata && (
              <li className="flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-xl border border-line p-3" data-testid="agenda-practice-kata">
                <span className="text-[15px] font-medium">Reto diario (kata de lógica)</span>
                <Chip large colour="var(--nv-practice, #c58be0)">{PRACTICE_NAME}</Chip>
                <span className="text-[14px] text-dim">est. {hm(day.practice.kata.minutes)}</span>
                <GhostButton className="ml-auto" onClick={openPractice}>Abrir práctica</GhostButton>
              </li>
            )}
            {day.practice.project && (
              <li className="flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-xl border border-line p-3" data-testid="agenda-practice-project">
                <span className="text-[15px] font-medium">Proyecto semanal: {day.practice.project.phases.map((p: PracticePhase) => PHASE_LABEL[p]).join(" + ")}</span>
                <Chip large colour="var(--nv-practice, #c58be0)">{PRACTICE_NAME}</Chip>
                <Chip large colour="var(--nv-accent)">Semana {day.practice.project.week} · foco {day.practice.project.focus}</Chip>
                <span className="text-[14px] text-dim">est. {hm(day.practice.project.minutes)}</span>
                {day.practice.project.theme && <span className="basis-full text-[14px] text-dim">{day.practice.project.theme}</span>}
                <GhostButton className="ml-auto" onClick={openPractice}>Abrir práctica</GhostButton>
              </li>
            )}
          </ul>
        )}
      </section>

      {m.deliverablesDefined && (
        <section aria-labelledby={`${headingId ?? "day"}-deliv`} data-testid="agenda-day-deliverables">
          <H2 id={`${headingId ?? "day"}-deliv`} className={cn(SECTION, "mb-2")}>Entregables del día <span className="font-normal normal-case tracking-normal text-dim">({deliverablesText(due.length)})</span></H2>
          {due.length === 0 ? (
            <p className="text-[14px] text-dim">Nada se entrega este día.</p>
          ) : (
            <ul className="space-y-2">
              {[...real, ...due.filter((d) => d.kind === "kata")].map((d) => <DeliverableLine key={d.id} d={d} onOpenPractice={openPractice} />)}
            </ul>
          )}
        </section>
      )}
    </article>
  );
}

/** Una semana: cuántos temas por área, horas, progreso, práctica, entregables y sus días. */
export function WeekDetail({ m, week, onPickDay, onChanged, headingId, only = null, dayExtra }: { m: AgendaModel; week: number; onPickDay: (date: string) => void; onChanged: (p: MentorPlan) => void; headingId?: string; /** subplan elegido en las pestañas por área (null = todas) */ only?: string | null; /** gancho al final de cada fila de día (p. ej. «añadir tema extra») */ dayExtra?: (date: string) => ReactNode }) {
  const w = weekSummary(m.plan, m.schedule, week, m.deliverablesDefined ? m.deliverables : []);
  if (!w) return <p className="text-[14px] text-dim">Esa semana no existe en el plan.</p>;
  const days = m.schedule.days.filter((d) => d.week === week);
  const current = m.today >= w.start && m.today <= w.end;
  const purposeManual = !!m.plan.purposes?.week?.[String(week)];
  const doneTopics = w.topicsDone;
  const pct = w.topics ? Math.round((doneTopics / w.topics) * 100) : 0;
  return (
    <article className="space-y-4" data-testid="agenda-week" aria-labelledby={headingId}>
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 id={headingId} className="text-[20px] font-bold leading-tight">Semana {week} <span className="text-[16px] font-normal text-dim">{dateLabel(w.start)} – {dateLabel(w.end)}</span></h2>
        {current && <Chip large colour="var(--nv-mint)">Esta semana</Chip>}
      </header>

      <p className="text-[15px] font-medium text-text" data-testid="agenda-week-counts">
        {countsLine(m, [topicsText(w.topics)], w.deliverables.length)}
        {m.deliverablesDefined && <AreaCounts plan={m.plan} list={w.deliverables} testid="area-counts-week" />}
      </p>

      <PurposeBlock planId={m.plan.id} scope="week" keyName={String(week)} text={w.purpose} auto={w.autoPurpose} manual={purposeManual} editable={m.editable} onChanged={onChanged} label={`la semana ${week}`} />

      <WeekStats m={m} week={week} only={only} />
      <RegisteredTime planId={m.plan.id} from={w.start} to={w.end} />
      <div className="flex items-center gap-3">
        <div className="flex-1"><ProgressBar pct={pct} thick label={`Temas completados de la semana ${week}`} /></div>
        <span className="text-[14px] font-semibold">{pct} %</span>
      </div>

      <WeekDayStrip m={m} days={days} counts={topicsPerDay(m.byWeekArea.weeks[week - 1]!)} onPick={onPickDay} only={only} />

      {m.schedule.mode === "focus" && <FocusStructure days={days} headingId={`${headingId ?? "wk"}-focus`} label={`de la semana ${week}`} />}

      <WeekCategories m={m} week={week} headingId={`${headingId ?? "wk"}-areas`} only={only} />

      {m.schedule.mode === "focus" && <WeekProjects m={m} week={week} headingId={`${headingId ?? "wk"}-projects`} onChanged={onChanged} />}

      {m.deliverablesDefined && (
        <section aria-labelledby={`${headingId ?? "wk"}-deliv`} data-testid="agenda-week-deliverables">
          <h3 id={`${headingId ?? "wk"}-deliv`} className={cn(SECTION, "mb-2")}>Entregables de la semana <span className="font-normal normal-case tracking-normal text-dim">({deliverablesText(w.deliverables.length)})</span></h3>
          {w.deliverables.length === 0 ? (
            <p className="text-[14px] text-dim">Sin entregables esta semana.</p>
          ) : (
            <ul className="space-y-2">
              {w.deliverables.some((d) => d.kind === "daily_project") && (
                <li className="list-none text-[14px] text-dim" data-testid="agenda-week-daily-count">Incluye {plural(w.deliverables.filter((d) => d.kind === "daily_project").length, "proyecto diario", "proyectos diarios")} (uno por día de estudio, en «Proyectos de la semana»).</li>
              )}
              {[...w.deliverables.filter((d) => d.kind !== "kata" && d.kind !== "daily_project"), ...w.deliverables.filter((d) => d.kind === "kata")].map((d) => (
                <DeliverableLine key={d.id} d={d} showDate={dateLabel(d.dueDate)} onOpenPractice={openPractice} />
              ))}
            </ul>
          )}
        </section>
      )}

      <section aria-labelledby={`${headingId ?? "wk"}-days`} data-testid="agenda-week-days">
        <h3 id={`${headingId ?? "wk"}-days`} className={cn(SECTION, "mb-2")}>Días de la semana (plan diario)</h3>
        <ol className="space-y-1.5">
          {days.map((d) => <WeekDayRow key={d.date} m={m} day={d} onPick={onPickDay} only={only} {...(dayExtra ? { extra: dayExtra(d.date) } : {})} />)}
        </ol>
      </section>
    </article>
  );
}

export function WeekDayRow({ m, day, onPick, extra, only = null }: { m: AgendaModel; day: ScheduleDay; onPick: (d: string) => void; extra?: ReactNode; /** filtro del alcance (null = todo el plan) */ only?: string | null }) {
  const due = m.dueByDate.get(day.date) ?? [];
  const areas = dayByArea(m.plan, day, due);
  const bases = new Set(dayBases(m.plan, day).map((b) => b.folder)).size;
  return (
    <li className={cn("flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border px-3.5 py-2.5 text-[14px]", day.date === m.today ? "border-accent bg-accent-soft" : "border-line bg-card")} data-testid="agenda-week-day" data-date={day.date}>
      <span className="w-24 flex-none font-medium capitalize">{DAY_SHORT[day.dow - 1]} {Number(day.date.slice(8))}<span className="sr-only"> {DAY_LONG[day.dow - 1]}</span></span>
      <span className="whitespace-nowrap font-medium">{topicsText(day.topics.length)}</span>
      {areas.length > 0 || bases > 0 ? (
        <span className="flex min-w-0 flex-1 basis-48 flex-wrap gap-1" aria-label={`Por área: ${[...areas.map((a) => `${a.area} ${a.topics}`), ...(bases ? [`Bases ${bases}`] : [])].join(", ")}`} data-testid="agenda-week-day-areas">
          {areas.map((a) => (
            <span key={a.subplanId} aria-hidden className="inline-flex items-center gap-1 rounded border border-line px-1.5 py-0.5 text-[12.5px]"><AreaDot {...(a.areaId ? { areaId: a.areaId } : {})} />{areaShort(a.areaId, a.area)} {a.topics}</span>
          ))}
          {bases > 0 && <span aria-hidden className="inline-flex items-center gap-1 rounded border border-line px-1.5 py-0.5 text-[12.5px]"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-accent" />Bases {bases}</span>}
        </span>
      ) : (
        <span className="min-w-0 flex-1 basis-48 text-dim">{day.study ? "Repaso y práctica" : day.blocked ? "Bloqueado" : "Descanso"}</span>
      )}
      {m.deliverablesDefined && <span className="whitespace-nowrap text-dim">{deliverablesText(due.length)}</span>}
      {day.topics.some((t) => t.extra) && <Chip large colour="var(--nv-accent)">Extra {new Set(day.topics.filter((t) => t.extra).map((t) => t.folder)).size}</Chip>}
      {day.practice.kata && <Chip large colour="var(--nv-practice, #c58be0)">Kata</Chip>}
      {day.practice.project && <Chip large colour="var(--nv-practice, #c58be0)">Proyecto</Chip>}
      {dayViewable(m, day, only) && <GhostButton aria-label={`Ver el día ${longDateLabel(day.date)}`} onClick={() => onPick(day.date)}>Ver día</GhostButton>}
      {extra}
    </li>
  );
}

/** Un mes: áreas en foco, temas por semana, hitos y entregables. */
export function MonthDetail({ m, month, onPickWeek, onChanged, headingId, only = null }: { m: AgendaModel; month: string; onPickWeek: (date: string) => void; onChanged: (p: MentorPlan) => void; headingId?: string; /** subplan elegido en las pestañas por área (null = todas) */ only?: string | null }) {
  const s = monthSummary(m.plan, m.schedule, month, m.deliverablesDefined ? m.deliverables : []);
  if (!s) return <p className="text-[14px] text-dim">Ese mes queda fuera del plan.</p>;
  const manual = !!m.plan.purposes?.month?.[month];
  const real = s.deliverables.filter((d) => d.kind !== "kata" && d.kind !== "daily_project");
    return (
    <article className="space-y-4" data-testid="agenda-month" aria-labelledby={headingId}>
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 id={headingId} className="text-[20px] font-bold leading-tight">{s.label}</h2>
        {m.today.slice(0, 7) === month && <Chip large colour="var(--nv-mint)">Este mes</Chip>}
      </header>
      <p className="text-[15px] font-medium" data-testid="agenda-month-counts">
        {countsLine(m, [topicsText(s.topics)], s.deliverables.length)} · {plural(s.weeks.length, "semana", "semanas")}
        {m.deliverablesDefined && <AreaCounts plan={m.plan} list={s.deliverables} testid="area-counts-month" />}
      </p>
      <RegisteredTime planId={m.plan.id} from={s.start} to={s.end} {...(only ? { areaKey: m.plan.subplans.find((x) => x.id === only)?.areaId ?? only } : {})} />
      <PurposeBlock planId={m.plan.id} scope="month" keyName={month} text={s.purpose} auto={s.autoPurpose} manual={manual} editable={m.editable} onChanged={onChanged} label={s.label} />

      {m.schedule.mode === "focus" && <FocusStructure days={m.schedule.days.filter((d) => d.date >= s.start && d.date <= s.end)} headingId={`${headingId ?? "mo"}-focus`} label={`de ${s.label}`} />}

      <MonthStats weeks={s.weeks.map((x) => x.week)} data={m.byWeekArea} topics={s.topics} />

      <section aria-labelledby={`${headingId ?? "mo"}-areas`} data-testid="agenda-month-areas">
        <h3 id={`${headingId ?? "mo"}-areas`} className={cn(SECTION, "mb-2")}>El mes por categoría</h3>
        {s.byArea.length === 0 && <p className="mb-2 text-[14px] text-dim">Este mes no tiene temas repartidos.</p>}
        <MonthAreaTotals weeks={s.weeks.map((x) => x.week)} data={m.byWeekArea} only={only} />
      </section>

      {s.milestones.length > 0 && (
        <section aria-labelledby={`${headingId ?? "mo"}-miles`} data-testid="agenda-month-milestones">
          <h3 id={`${headingId ?? "mo"}-miles`} className={cn(SECTION, "mb-2")}>Hitos</h3>
          <ul className="list-disc space-y-0.5 pl-5 text-[14px]">{s.milestones.map((x) => <li key={x}>{x}</li>)}</ul>
        </section>
      )}

      <section aria-labelledby={`${headingId ?? "mo"}-weeks`} data-testid="agenda-month-weeks">
        <h3 id={`${headingId ?? "mo"}-weeks`} className={cn(SECTION, "mb-2")}>Temas por semana, separados por categoría</h3>
        <div className="mb-3"><MonthLegend data={m.byWeekArea} only={only} bases={s.weeks.some((x) => (m.byWeekArea.weeks[x.week - 1]?.bases.length ?? 0) > 0)} /></div>
        <ol className="space-y-3">
          {s.weeks.map((w) => <MonthWeekBlock key={w.week} m={m} week={w.week} summary={w} onPickWeek={onPickWeek} only={only} {...(m.deliverablesDefined ? { deliverablesText: deliverablesText(w.deliverables.length) } : {})} />)}
        </ol>
      </section>

      {m.schedule.mode === "focus" && <MonthProjects m={m} month={month} headingId={`${headingId ?? "mo"}-projects`} onChanged={onChanged} />}

      {m.deliverablesDefined && (
        <section aria-labelledby={`${headingId ?? "mo"}-deliv`} data-testid="agenda-month-deliverables">
          <h3 id={`${headingId ?? "mo"}-deliv`} className={cn(SECTION, "mb-2")}>Entregables del mes <span className="font-normal normal-case tracking-normal text-dim">({deliverablesText(s.deliverables.length)}{s.deliverables.length ? `, ${doneText(s.deliverables.filter((d) => d.status === "hecho").length)}` : ""})</span></h3>
          {s.deliverables.length === 0 ? (
            <p className="text-[14px] text-dim">Sin entregables este mes.</p>
          ) : (
            <>
              <p className="mb-2 text-[14px] text-dim">{plural(s.deliverables.filter((d) => d.kind === "kata").length, "kata", "katas")} · {plural(s.deliverables.filter((d) => d.kind === "daily_project").length, "proyecto diario", "proyectos diarios")} · {plural(s.deliverables.filter((d) => d.kind === "weekly_project").length, "proyecto semanal", "proyectos semanales")} · {plural(real.filter((d) => d.kind === "monthly_project").length, "proyecto mensual", "proyectos mensuales")} · {plural(real.filter((d) => d.kind === "area_project").length, "proyecto de área", "proyectos de área")}</p>
              <ul className="space-y-2">
                {real.map((d) => <DeliverableLine key={d.id} d={d} showDate={dateLabel(d.dueDate)} onOpenPractice={openPractice} />)}
              </ul>
            </>
          )}
        </section>
      )}
    </article>
  );
}

