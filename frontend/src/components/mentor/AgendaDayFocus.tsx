// Mentor — Plan, Agenda: la vista de DÍA por ENFOQUE (planes por áreas), las secciones de enfoque y proyectos de Semana y Mes, y la barra
// «Generar la práctica del plan con el Mentor». Todo sale de `lib/planSchedule.ts` + `lib/planCurriculum.ts`; lo único que se escribe son los
// propósitos, el estado de los proyectos y el currículo (solo cuando el usuario pulsa el botón).
//
// Orden de la vista Día: (1) cabecera con fecha, enfoque y propósito · (2) Teoría del día · (3) Práctica del día · (4) Reto de lógica ·
// (5) al final: Proyecto diario, Proyecto semanal y Proyecto mensual, conectados con los temas del día.

import { CalendarDays, Sparkles } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../lib/bridge";
import type { PlanDeliverable, PlanDeliverableStatus } from "../../lib/planAreas";
import { dayExercisesOf, dailyProjectOf, dayLogicOf, languageBlockExercises, monthlyBlocksOf, shortOf, weeklyProjectOf, type MonthlyBlock } from "../../lib/planCurriculum";
import { dayAreasText, dayBases, dayByArea } from "../../lib/planTopicsByArea";
import { PROJECT_BASIS_LABEL, PROJECT_LEVEL_LABEL } from "../../lib/planTopicProject";
import type { DayBlock } from "../../lib/planDayFocus";
import type { BlockItem } from "../../lib/planDayFocus";
import { dateLabel, dayPurpose, deliverablesText, focusStatsOf, longDateLabel, topicsText, type ScheduleDay } from "../../lib/planSchedule";
import { PHASE_LABEL, PRACTICE_NAME, type PracticePhase } from "../../lib/practiceTrack";
import type { MentorPlan } from "../../lib/types";
import { useApp } from "../../store/app";
import { useMentor } from "../../store/mentor";
import { useNavState } from "../../store/navState";
import { Chip, GhostButton, PrimaryButton } from "../common/forms";
import { cn } from "../ui";
import { AreaChip, AreaCounts, DSTATUS_LABEL, focusColour, plural, PurposeBlock, StatusChip, type AgendaModel } from "./agendaKit";
import { AreaDot, areaColour, areaPracticeView } from "./AreaViews";
import { ExtraTag, removeExtraTopic } from "./extraKit";
import { openTopic } from "./openTopic";
import { TopicNoteLinks } from "./TopicNoteLinks";
import { hm, ProgressBar, ThinkingStatus, useAiStatus } from "./parts";
import { openPractice } from "./PracticeCard";
import { PALETTE, STATE_COLOUR, STATE_GLYPH, STATE_LABEL } from "./planShared";

/** Los minutos de un tema o bloque son los PLANEADOS: se muestran solo como pista pequeña («est.»), nunca como tiempo estudiado. */
const est = (min: number): string => `est. ${hm(min)}`;
const SECTION = "text-[13px] font-semibold uppercase tracking-wider text-faint";
const colourOfArea = (m: AgendaModel, subplanId: string): string => {
  const sub = m.plan.subplans.find((s) => s.id === subplanId);
  return sub?.areaId ? focusColour(sub.areaId) : PALETTE[Math.max(0, m.plan.subplans.findIndex((s) => s.id === subplanId)) % PALETTE.length]!;
};

/** «Enfoque: Backend» con su color como marca (el texto va en el color normal). */
export function FocusChip({ id, label }: { id?: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-line bg-surface px-2.5 py-1 text-[14px] font-semibold text-text" data-testid="agenda-focus-chip">
      <span aria-hidden className="inline-block h-2.5 w-2.5 flex-none rounded-sm" style={{ background: focusColour(id) }} />
      Enfoque: {label}
    </span>
  );
}

const statusOf = (m: AgendaModel, id: string): PlanDeliverableStatus => m.deliverableById.get(id)?.status ?? "pendiente";

/** Un proyecto (diario, semanal o mensual): título, descripción, estado y, si el plan es editable, cambiarlo. */
function ProjectCard({ m, d, kind, onChanged, children, testid }: { m: AgendaModel; d: PlanDeliverable | undefined; kind: string; onChanged: (p: MentorPlan) => void; children?: React.ReactNode; testid: string }) {
  const toast = useApp((s) => s.toast);
  const [busy, setBusy] = useState(false);
  if (!d) return null;
  const set = async (status: PlanDeliverableStatus) => {
    setBusy(true);
    try {
      onChanged(await api.mentorPlanUpdateDeliverable({ id: m.plan.id, deliverableId: d.id, status }));
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const next: PlanDeliverableStatus | null = d.status === "pendiente" ? "en_curso" : d.status === "en_curso" ? "hecho" : null;
  return (
    <li className="rounded-xl border border-line bg-card p-3.5" data-testid={testid}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <Chip large colour="var(--nv-practice, #c58be0)">{kind}</Chip>
        <span className="min-w-0 flex-1 basis-56 text-[15px] font-semibold">{d.title}</span>
        {m.deliverablesDefined ? <StatusChip status={d.status} /> : <Chip large colour="var(--nv-faint)">Entregable por definir</Chip>}
        {m.deliverablesDefined && m.editable && next && (
          <GhostButton disabled={busy} onClick={() => void set(next)} aria-label={`${next === "hecho" ? "Marcar como hecho" : "Marcar en curso"}: ${d.title}`}>
            {next === "hecho" ? "Marcar hecho" : "Marcar en curso"}
          </GhostButton>
        )}
        {m.deliverablesDefined && m.editable && d.status === "hecho" && (
          <GhostButton disabled={busy} onClick={() => void set("pendiente")} aria-label={`Reabrir: ${d.title}`}>Reabrir</GhostButton>
        )}
      </div>
      <p className="mt-1 text-[14px] text-dim">{d.description}</p>
      {children}
    </li>
  );
}

/** La práctica diaria de lenguaje (bloque sin tema propio): su nota y los ejercicios ligados a los temas del día. */
function FreeLanguage({ m, b, day }: { m: AgendaModel; b: DayBlock; day: ScheduleDay }) {
  const ex = languageBlockExercises(m.plan, day, b);
  return (
    <>
      {b.note && <p className="mt-1 text-[14px] text-dim" data-testid="agenda-lang-note">{b.note}</p>}
      <ul className="mt-2.5 space-y-1.5 border-t border-line pt-2.5" aria-label={`Ejercicios de ${b.label}`}>
        {ex.map((e) => (
          <li key={e.id} className="flex flex-wrap items-start gap-x-2 gap-y-1 text-[14.5px]" data-testid="agenda-exercise">
            <span className="min-w-0 flex-1 basis-60">
              <span className="font-medium">{e.title}</span>
              {e.statement && <span className="mt-0.5 block text-[13.5px] text-dim">{e.statement}</span>}
            </span>
            {e.source === "ai" && <Chip large colour="var(--nv-accent)">Del Mentor</Chip>}
            {e.auto && <Chip large colour="var(--nv-faint)">Automático</Chip>}
            {e.folder && <button type="button" onClick={() => void openTopic(e.folder)} className="inline-flex min-h-8 items-center px-2 text-[14px] text-accent-text underline-offset-2 hover:underline" aria-label={`Ver el tema ${e.topicTitle}`}>Ver tema</button>}
          </li>
        ))}
      </ul>
    </>
  );
}

function BlockTopics({ m, items, date, onChanged }: { m: AgendaModel; items: BlockItem[]; date: string; onChanged: (p: MentorPlan) => void }) {
  return (
    <ul className="mt-2 space-y-1.5">
      {items.map((t) => {
        const live = m.topicByFolder.get(t.folder);
        const state = live?.state ?? "sin_tratar";
        return (
          <li key={`${t.subplanId}:${t.folder}:${t.part}`} className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[14.5px]" data-testid="agenda-topic">
            <span className="min-w-0 flex-1 basis-52 font-medium" title={t.folder}>{t.title}</span>
            <AreaChip colour={colourOfArea(m, t.subplanId)}>{t.area}</AreaChip>
            {t.extra && <ExtraTag title={t.title} onRemove={() => void removeExtraTopic(m.plan.id, date, t.folder, onChanged)} />}
            {t.applied ? <Chip large>Lógica aplicada (fundamentos)</Chip> : t.groupTitle ? <Chip large>{t.groupTitle}</Chip> : null}
            {t.parts > 1 && <span className="text-[13.5px] text-dim">parte {t.part} de {t.parts}</span>}
            <span className="text-[14px] font-medium" data-testid="agenda-topic-minutes">{est(t.minutes)}</span>
            <Chip large colour={STATE_COLOUR[state]}><span aria-hidden>{STATE_GLYPH[state]}</span> {STATE_LABEL[state]}</Chip>
            {live?.found && (
              <button type="button" onClick={() => void openTopic(t.folder)} className="inline-flex min-h-8 items-center px-2 text-[14px] text-accent-text underline-offset-2 hover:underline" aria-label={`Ver tema ${t.title}`}>Ver tema</button>
            )}
            {live?.found && <TopicNoteLinks folder={t.folder} title={t.title} practice={false} />}
          </li>
        );
      })}
    </ul>
  );
}

/** El día por enfoque: teoría · práctica · reto de lógica · proyectos (diario, semanal, mensual) al final. */
export function DayDetailFocus({ m, date, onChanged, headingId, level = 2, areaFilter = null }: { m: AgendaModel; date: string; onChanged: (p: MentorPlan) => void; headingId?: string; level?: 2 | 3; /** subplan elegido en el filtro por área (null = todas) */ areaFilter?: string | null }) {
  const setPending = useMentor((s) => s.setPendingObjective);
  const day = m.schedule.byDate.get(date)!;
  const H = level === 2 ? "h2" : "h3";
  const H2 = level === 2 ? "h3" : "h4";
  const H3 = level === 2 ? "h4" : "h5";
  const id = headingId ?? "day";
  const due = m.dueByDate.get(date) ?? [];
  const purpose = dayPurpose(m.plan, day, m.deliverablesDefined ? due : []);
  const isToday = date === m.today;
  const canPlan = isToday && !m.plan.proposed && !m.plan.archived;
  const blocks = day.blocks ?? [];
  // el día separado por ÁREA en el orden fijo (Backend · Frontend · Databases · Tooling and Quality · Automation)
  const entries = dayByArea(m.plan, day, due).filter((e) => areaFilter === null || e.subplanId === areaFilter);
  // los fundamentos (Bases) no son de ningún área: van aparte, igual que en la pestaña «Bases» de la Ejecución
  const bases = areaFilter === null ? dayBases(m.plan, day) : [];
  const langBlocks = blocks.filter((b) => b.daily);
  const pending = day.topics.filter((t) => !t.done);
  const done = day.topics.filter((t) => t.done);
  const logic = dayLogicOf(m.plan, m.schedule, day);
  const daily = dailyProjectOf(m.plan, m.schedule, day);
  const weeklyP = weeklyProjectOf(m.plan, m.schedule, day.week);
  const monthly = monthlyBlocksOf(m.plan, m.schedule).find((b) => day.week >= b.fromWeek && day.week <= b.toWeek && (!b.month || date.startsWith(b.month)));
  const dailyD = daily ? m.deliverableById.get(daily.id) : undefined;
  const weeklyD = weeklyP ? m.deliverableById.get(weeklyP.id) : undefined;
  const monthlyD = monthly ? m.deliverableById.get(monthly.id) : undefined;
  const practiceCount = (day.practice.kata ? 1 : 0) + (day.practice.project ? 1 : 0);
  const otherDue = due.filter((d) => !["kata", "daily_project", "weekly_project", "monthly_project", "topic_project"].includes(d.kind));
  const weeklyDone = weeklyP ? weeklyP.dailyIds.filter((x) => statusOf(m, x) === "hecho").length : 0;
  const monthWeekly = monthly ? monthly.weeklyIds : [];
  const monthDone = monthWeekly.filter((x) => statusOf(m, x) === "hecho").length;
  return (
    <article className="space-y-4" data-testid="agenda-day" aria-labelledby={headingId}>
      {/* 1 · cabecera */}
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <H id={headingId} className="text-[20px] font-bold leading-tight first-letter:uppercase">{longDateLabel(date)}</H>
        <Chip large colour="var(--nv-accent)">Semana {day.week}</Chip>
        {isToday && <Chip large colour="var(--nv-mint)">Hoy</Chip>}
        {entries.map((e) => <AreaChip key={e.subplanId} colour={areaColour(e.areaId)}>{e.area}<span className="font-normal text-dim" data-testid="agenda-day-area-chip-count"> {e.topics}</span></AreaChip>)}
        {day.focus?.together && <Chip large colour="var(--nv-mint)">Áreas juntas</Chip>}
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
      {day.focus && (
        <p className="text-[16px] font-semibold text-text" data-testid="agenda-day-today-line">{day.focus.line}</p>
      )}
      <p className="text-[15px] font-medium text-text" data-testid="agenda-day-counts">
        {[topicsText(day.topics.length), ...(day.study ? [] : [day.blocked ? "bloqueado" : "descanso"]), m.deliverablesDefined ? deliverablesText(due.length) : "Entregables: por definir"].join(" · ")}
        {m.deliverablesDefined && <AreaCounts plan={m.plan} list={due} testid="area-counts-day" />}
      </p>
      <PurposeBlock planId={m.plan.id} scope="day" keyName={date} text={purpose.text} auto={purpose.auto} manual={purpose.manual} editable={m.editable} onChanged={onChanged} label={longDateLabel(date)} />

      {!day.study && <p className="text-[14px] text-dim" data-testid="agenda-day-rest">{day.blocked ? "Día bloqueado: no hay estudio programado." : "Día de descanso: no hay estudio programado."}</p>}

      {day.study && (
        <>
          {entries.length === 0 && bases.length === 0 && (
            <p className="text-[14px] text-dim" data-testid="agenda-day-no-areas">{areaFilter ? "El área elegida no tiene nada este día." : "Ningún tema repartido este día: queda para práctica, repaso o recuperar lo atrasado."}</p>
          )}
          {/* 2 · una sección por ÁREA, en el orden fijo: su teoría, su práctica y su proyecto */}
          {entries.map((e) => {
            const theory = (e.blocks ?? []).filter((b) => b.kind === "theory");
            const practice = (e.blocks ?? []).filter((b) => b.kind === "practice");
            const ap = areaPracticeView(m.plan, e.areaId, date);
            const tps = (day.topicProjects ?? []).filter((tp) => tp.subplanId === e.subplanId);
            const areaD = m.deliverablesDefined ? due.filter((d) => d.kind === "area_project" && d.areaId === e.areaId) : [];
            const aid = `${id}-a-${e.subplanId}`;
            return (
              <section key={e.subplanId} aria-labelledby={aid} className="rounded-2xl border border-line bg-card p-3.5 @3xl:p-4" style={{ borderTop: `3px solid ${areaColour(e.areaId)}` }} data-testid="agenda-day-area" data-area={e.areaId ?? e.subplanId}>
                <H2 id={aid} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[17px] font-bold">
                  <AreaDot {...(e.areaId ? { areaId: e.areaId } : {})} /> <span className="break-words">{e.area}</span>
                  <span className="text-[14px] font-normal text-dim">{dayAreasText([e]).slice(e.area.length + 1)}</span>
                </H2>

                <div className="mt-3" data-testid="agenda-day-theory">
                  <H3 className={cn(SECTION, "mb-2")}>Teoría de {e.area}</H3>
                  {theory.length === 0 ? (
                    <p className="text-[14px] text-dim">Sin teoría de {e.area} este día.</p>
                  ) : (
                    <ul className="space-y-2">
                      {theory.map((b) => (
                        <li key={b.id} className="rounded-xl border border-line p-3" data-testid="agenda-block" data-block={b.id}>
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="text-[15px] font-semibold">{b.label}</span>
                            {b.status !== "topic" && <Chip large colour="var(--nv-faint)">{b.status === "review" ? "Repaso" : "Omitido"}</Chip>}
                            {b.minutes > 0 && <span className="text-[14px] text-dim">{est(b.minutes)}</span>}
                          </div>
                          {b.items.length > 0 ? <BlockTopics m={m} items={b.items} date={date} onChanged={onChanged} /> : <p className="mt-1 text-[14px] text-dim">{b.note}</p>}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="mt-3" data-testid="agenda-day-practice">
                  <H3 className={cn(SECTION, "mb-2")}>Práctica de {e.area}</H3>
                  {ap && (
                    <details className="mb-2 rounded-lg border border-line px-3 py-2 text-[14px]" data-testid="agenda-area-practice" data-source={ap.source}>
                      <summary className="cursor-pointer font-medium">Sistema de práctica de {e.area}: {ap.name}</summary>
                      <p className="mt-1.5 text-dim">{ap.daily}</p>
                      {ap.weekly && <p className="mt-1 text-dim"><span className="font-medium text-text">Cada fin de semana:</span> {ap.weekly}</p>}
                      {ap.monthly && <p className="mt-1 text-dim"><span className="font-medium text-text">Cada mes:</span> {ap.monthly}</p>}
                      {ap.measure && <p className="mt-1 text-dim"><span className="font-medium text-text">Demuestra:</span> {ap.measure}</p>}
                    </details>
                  )}
                  {ap?.kata && (
                    <p className="mb-2 rounded-lg border border-line px-3 py-2 text-[14px]" data-testid="agenda-area-kata">
                      <span className="font-medium">Kata de {e.area} de hoy:</span> {ap.kata.title}
                      <span className="text-dim"> · {ap.kata.skill ? `${ap.kata.skill} · ` : ""}nivel {ap.kata.level}{ap.kata.minutes ? ` · ${ap.kata.minutes} min` : ""}</span>
                      {ap.kata.statement && <span className="mt-0.5 block text-[13.5px] text-dim">{ap.kata.statement}</span>}
                    </p>
                  )}
                  {practice.length === 0 ? (
                    <p className="text-[14px] text-dim">Hoy no hay bloques de práctica por tema de {e.area}.</p>
                  ) : (
                    <ul className="space-y-2">
                      {practice.map((b) => {
                        const ex = dayExercisesOf(m.plan, day, b, m.existing);
                        return (
                          <li key={b.id} className="rounded-xl border border-line p-3" data-testid="agenda-block" data-block={b.id}>
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                              <span className="text-[15px] font-semibold">{b.label}</span>
                              {b.status !== "topic" && <Chip large colour="var(--nv-faint)">{b.status === "review" ? "Repaso" : "Omitido"}</Chip>}
                              {b.minutes > 0 && <span className="text-[14px] text-dim">{est(b.minutes)}</span>}
                            </div>
                            {b.items.length === 0 ? (
                              <p className="mt-1 text-[14px] text-dim">{b.note}</p>
                            ) : (
                              <>
                                <BlockTopics m={m} items={b.items} date={date} onChanged={onChanged} />
                                <ul className="mt-2.5 space-y-1.5 border-t border-line pt-2.5" aria-label={`Ejercicios de ${b.label}`}>
                                  {ex.map((x) => (
                                    <li key={x.id} className="flex flex-wrap items-start gap-x-2 gap-y-1 text-[14.5px]" data-testid="agenda-exercise">
                                      <span className="min-w-0 flex-1 basis-60">
                                        <span className="font-medium">{x.title}</span>
                                        {x.statement && <span className="mt-0.5 block text-[13.5px] text-dim">{x.statement}</span>}
                                      </span>
                                      {x.source === "vault" && <Chip large colour="var(--nv-mint)">En tu vault</Chip>}
                                      {x.source === "ai" && <Chip large colour="var(--nv-accent)">Del Mentor</Chip>}
                                      {x.auto && <Chip large colour="var(--nv-faint)">Automático</Chip>}
                                      <button type="button" onClick={() => void openTopic(x.folder)} className="inline-flex min-h-8 items-center px-2 text-[14px] text-accent-text underline-offset-2 hover:underline" aria-label={`Abrir los ejercicios del tema ${x.topicTitle}`}>Abrir ejercicios</button>
                                    </li>
                                  ))}
                                </ul>
                              </>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>

                {(tps.length > 0 || areaD.length > 0) && (
                  <div className="mt-3" data-testid="agenda-day-topic-projects">
                    <H3 className={cn(SECTION, "mb-2")}>Proyecto de {e.area} <span className="font-normal normal-case tracking-normal text-dim">(hoy completas {tps.length === 1 ? "un tema" : "temas"}: aplícalo)</span></H3>
                    <ul className="space-y-2.5">
                      {tps.map((tp) => (
                        <ProjectCard key={tp.id} m={m} d={m.deliverableById.get(tp.id)} kind="Proyecto del tema" onChanged={onChanged} testid="agenda-project-topic">
                          <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[14px]">
                            <Chip large colour="var(--nv-mint)">Nivel {PROJECT_LEVEL_LABEL[tp.project.level]}</Chip>
                            <span className="text-dim">{PROJECT_BASIS_LABEL[tp.project.basis]}</span>
                            {tp.project.language && <Chip large>{tp.project.language}</Chip>}
                            {tp.minutes > 0 && <span className="text-dim">{est(tp.minutes)}</span>}
                          </p>
                          <p className="mt-0.5 text-[14px]"><span className="font-medium">Tema:</span> {shortOf(tp.title)}{tp.project.requires.length ? <span className="text-dim"> · combina {tp.project.requires.map((r) => shortOf(r.split("/").pop() ?? r)).join(", ")}</span> : null}</p>
                        </ProjectCard>
                      ))}
                      {areaD.map((d) => (
                        <ProjectCard key={d.id} m={m} d={d} kind="Proyecto de área" onChanged={onChanged} testid="agenda-project-area">
                          <p className="mt-1 text-[14px] text-dim">{d.description}</p>
                        </ProjectCard>
                      ))}
                    </ul>
                  </div>
                )}
              </section>
            );
          })}

          {bases.length > 0 && (
            <section aria-labelledby={`${id}-bases`} className="rounded-2xl border border-line bg-card p-3.5 @3xl:p-4" style={{ borderTop: "3px solid var(--nv-accent)" }} data-testid="agenda-day-bases">
              <H2 id={`${id}-bases`} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[17px] font-bold">
                Bases <span className="text-[14px] font-normal text-dim">{plural(new Set(bases.map((b) => b.folder)).size, "fundamento", "fundamentos")} intercalados en las áreas</span>
              </H2>
              <BlockTopics m={m} items={bases} date={date} onChanged={onChanged} />
            </section>
          )}

          {done.length > 0 && <p className="text-[13.5px] text-dim">{plural(done.length, "tema completado", "temas completados")} este día: {done.map((t) => shortOf(t.title)).join(" · ")}.</p>}

          {/* 3 · práctica de lenguaje (no es de ningún área) */}
          {!areaFilter && (
            <section aria-labelledby={`${id}-lang`} data-testid="agenda-day-language">
              <H2 id={`${id}-lang`} className={cn(SECTION, "mb-2")}>Práctica de lenguaje <span className="font-normal normal-case tracking-normal text-dim">(todos los días, ligada a lo de hoy)</span></H2>
              {langBlocks.length === 0 ? (
                <p className="text-[14px] text-dim">Este plan no tiene un bloque diario de práctica de lenguaje.</p>
              ) : (
                <ul className="space-y-2">
                  {langBlocks.map((b) => (
                    <li key={b.id} className="rounded-xl border border-line p-3" data-testid="agenda-block" data-block={b.id}>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="text-[15px] font-semibold">{b.label}</span>
                        <Chip large colour="var(--nv-accent)">Práctica diaria</Chip>
                        {b.minutes > 0 && <span className="text-[14px] text-dim">{est(b.minutes)}</span>}
                      </div>
                      <FreeLanguage m={m} b={b} day={day} />
                    </li>
                  ))}
                </ul>
              )}
              {day.practice.project && (
                <ul className="mt-2">
                  <li className="flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-xl border border-line p-3" data-testid="agenda-practice-project">
                    <span className="text-[15px] font-medium">Proyecto semanal de práctica: {day.practice.project.phases.map((p: PracticePhase) => PHASE_LABEL[p]).join(" + ")}</span>
                    <Chip large colour="var(--nv-practice, #c58be0)">{PRACTICE_NAME}</Chip>
                    <Chip large colour="var(--nv-accent)">Semana {day.practice.project.week} · foco {day.practice.project.focus}</Chip>
                    <span className="text-[14px] text-dim">{est(day.practice.project.minutes)}</span>
                    <GhostButton className="ml-auto" onClick={openPractice}>Abrir práctica</GhostButton>
                  </li>
                </ul>
              )}
            </section>
          )}

          {/* 4 · reto de lógica */}
          {!areaFilter && (
            <section aria-labelledby={`${id}-logic`} data-testid="agenda-day-logic">
              <H2 id={`${id}-logic`} className={cn(SECTION, "mb-2")}>Reto de lógica <span className="font-normal normal-case tracking-normal text-dim">({PRACTICE_NAME}, preparación de entrevistas)</span></H2>
              {!logic || !day.practice.kata ? (
                <p className="text-[14px] text-dim">{m.plan.programmingPractice ? "Hoy no toca reto de lógica." : `Este plan no incluye ${PRACTICE_NAME}.`}</p>
              ) : (
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-xl border border-line p-3" data-testid="agenda-practice-kata">
                  <span className="min-w-0 flex-1 basis-60">
                    <span className="text-[15px] font-medium">{logic.title}</span>
                    {logic.statement && <span className="mt-0.5 block text-[13.5px] text-dim">{logic.statement}</span>}
                  </span>
                  <Chip large colour="var(--nv-practice, #c58be0)">{PRACTICE_NAME}</Chip>
                  {logic.auto && <Chip large colour="var(--nv-faint)">Automático</Chip>}
                  <span className="text-[14px] text-dim">{est(day.practice.kata.minutes)}</span>
                  <GhostButton className="ml-auto" onClick={openPractice}>Abrir práctica</GhostButton>
                </div>
              )}
            </section>
          )}

          {/* 5 · proyectos integradores (diario, semanal, mensual), al final */}
          {!areaFilter && (
            <section aria-labelledby={`${id}-projects`} data-testid="agenda-day-projects">
              <H2 id={`${id}-projects`} className={cn(SECTION, "mb-2")}>Proyectos integradores <span className="font-normal normal-case tracking-normal text-dim">(diario, semanal y mensual)</span></H2>
              <ul className="space-y-2.5">
                <ProjectCard m={m} d={dailyD} kind="Proyecto diario" onChanged={onChanged} testid="agenda-project-daily">
                  {daily && (
                    <>
                      <p className="mt-1.5 text-[14px]"><span className="font-medium">Conectado con:</span> {daily.topics.map((t) => shortOf(t.title)).join(" · ")}</p>
                      <p className="mt-0.5 text-[14px] text-dim">{daily.minutes ? `${est(daily.minutes)} · ` : ""}{daily.weeklyPart}{daily.source === "template" ? " · plantilla automática" : " · del Mentor"}</p>
                    </>
                  )}
                </ProjectCard>
                <ProjectCard m={m} d={weeklyD} kind="Proyecto semanal" onChanged={onChanged} testid="agenda-project-weekly">
                  {weeklyP && (
                    <>
                      <p className="mt-1.5 text-[14px]"><span className="font-medium">Hoy avanza:</span> {daily ? daily.title : "repaso"} <span className="text-dim">· {weeklyDone} de {weeklyP.dailyIds.length} mini-proyectos de la semana {day.week} hechos</span></p>
                      <div className="mt-1.5"><ProgressBar pct={weeklyP.dailyIds.length ? (weeklyDone / weeklyP.dailyIds.length) * 100 : 0} label={`Avance del proyecto semanal ${day.week}`} /></div>
                    </>
                  )}
                </ProjectCard>
                <ProjectCard m={m} d={monthlyD} kind="Proyecto mensual" onChanged={onChanged} testid="agenda-project-monthly">
                  {monthly && (
                    <p className="mt-1.5 text-[14px] text-dim">Integra {plural(monthWeekly.length, "proyecto semanal", "proyectos semanales")} (semanas {monthly.fromWeek}–{monthly.toWeek}) · {monthDone} hechos · entrega {monthlyD ? dateLabel(monthlyD.dueDate) : ""}</p>
                  )}
                </ProjectCard>
              </ul>
              {m.deliverablesDefined && otherDue.length > 0 && (
                <div className="mt-3">
                  <H2 className={cn(SECTION, "mb-1.5")}>Otros entregables del día</H2>
                  <ul className="space-y-1.5">
                    {otherDue.map((d) => (
                      <li key={d.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-line px-3 py-2 text-[14px]" data-testid="agenda-deliverable"><span className="min-w-0 flex-1 font-medium">{d.title}</span><StatusChip status={d.status} /></li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          )}
        </>
      )}
    </article>
  );
}

// ── Semana y Mes: estructura por enfoque y proyectos ────────────────────

const h1 = (min: number): string => `${Math.round((min / 60) * 10) / 10} h`;

/** Cuántos días de cada enfoque y teoría vs práctica en horas (semana o mes). */
export function FocusStructure({ days, headingId, level = 3, label }: { days: readonly ScheduleDay[]; headingId: string; level?: 3 | 4; label: string }) {
  const st = focusStatsOf(days);
  const H = level === 3 ? "h3" : "h4";
  if (!st.byFocus.length) return null;
  const total = Math.max(1, st.theoryMinutes + st.practiceMinutes);
  return (
    <section aria-labelledby={headingId} data-testid="agenda-focus-structure">
      <H id={headingId} className={cn(SECTION, "mb-2")}>Estructura por enfoque</H>
      <ul className="mb-3 flex flex-wrap gap-2" aria-label={`Días por enfoque ${label}`}>
        {st.byFocus.map((f) => (
          <li key={f.id + f.label} className="inline-flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1 text-[14px]" data-testid="agenda-focus-count">
            <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: focusColour(f.id) }} />
            <span className="font-medium">{f.label}</span> <span className="text-dim">{plural(f.days, "día", "días")}</span>
          </li>
        ))}
      </ul>
      <dl className="grid gap-3 @xl:grid-cols-3">
        {[
          { l: "Teoría", v: h1(st.theoryMinutes), h: `${Math.round((st.theoryMinutes / total) * 100)} % del estudio y la práctica` },
          { l: "Práctica", v: h1(st.practiceMinutes), h: `lenguaje, bases de datos, kata y proyectos · ${Math.round((st.practiceMinutes / total) * 100)} %` },
          { l: "Proyectos diarios", v: h1(st.projectMinutes), h: st.reviewMinutes ? `y ${h1(st.reviewMinutes)} de repaso` : "una pieza cada día de estudio" },
        ].map((x) => (
          <div key={x.l} className="min-w-0 rounded-xl border border-line bg-card px-4 py-3" data-testid="agenda-focus-hours">
            <dt className="mb-1 text-[13px] font-semibold uppercase tracking-wide text-faint">{x.l}</dt>
            <dd className="text-[19px] font-semibold leading-snug">{x.v}</dd>
            <dd className="mt-0.5 text-[13.5px] text-dim">{x.h}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** Proyecto semanal con su progreso (acumula los diarios) y la lista de mini-proyectos diarios de la semana. */
export function WeekProjects({ m, week, headingId, onChanged }: { m: AgendaModel; week: number; headingId: string; onChanged: (p: MentorPlan) => void }) {
  const wp = weeklyProjectOf(m.plan, m.schedule, week);
  if (!wp) return null;
  const d = m.deliverableById.get(wp.id);
  const done = wp.dailyIds.filter((x) => statusOf(m, x) === "hecho").length;
  const monthly = monthlyBlocksOf(m.plan, m.schedule).find((b) => week >= b.fromWeek && week <= b.toWeek);
  return (
    <section aria-labelledby={headingId} data-testid="agenda-week-projects">
      <h3 id={headingId} className={cn(SECTION, "mb-2")}>Proyectos de la semana</h3>
      <ul className="space-y-2.5">
        <ProjectCard m={m} d={d} kind="Proyecto semanal" onChanged={onChanged} testid="agenda-project-weekly">
          <p className="mt-1.5 text-[14px] text-dim">{done} de {wp.dailyIds.length} mini-proyectos diarios hechos</p>
          <div className="mt-1.5"><ProgressBar pct={wp.dailyIds.length ? (done / wp.dailyIds.length) * 100 : 0} label={`Progreso del proyecto semanal ${week}`} /></div>
          <ol className="mt-2 list-decimal space-y-0.5 pl-5 text-[14px]" aria-label="Mini-proyectos diarios de la semana">
            {wp.dailyIds.map((id, i) => <li key={id}>{wp.dailyTitles[i]} <span className="text-dim">· {DSTATUS_LABEL[statusOf(m, id)].toLowerCase()}</span></li>)}
          </ol>
        </ProjectCard>
        {monthly && <MonthlyCard m={m} b={monthly} onChanged={onChanged} />}
      </ul>
    </section>
  );
}

function MonthlyCard({ m, b, onChanged }: { m: AgendaModel; b: MonthlyBlock; onChanged: (p: MentorPlan) => void }) {
  const d = m.deliverableById.get(b.id);
  const done = b.weeklyIds.filter((x) => statusOf(m, x) === "hecho").length;
  return (
    <ProjectCard m={m} d={d} kind="Proyecto mensual" onChanged={onChanged} testid="agenda-project-monthly">
      <p className="mt-1.5 text-[14px] text-dim">Integra {plural(b.weeklyIds.length, "proyecto semanal", "proyectos semanales")} (semanas {b.fromWeek}–{b.toWeek}) · {done} hechos{d ? ` · entrega ${dateLabel(d.dueDate)}` : ""}</p>
    </ProjectCard>
  );
}

/** Proyectos del mes: el mensual y los semanales que integra, con su progreso. */
export function MonthProjects({ m, month, headingId, onChanged }: { m: AgendaModel; month: string; headingId: string; onChanged: (p: MentorPlan) => void }) {
  const blocks = monthlyBlocksOf(m.plan, m.schedule).filter((b) => (b.month ? b.month === month : m.deliverableById.get(b.id)?.dueDate.startsWith(month)));
  const weeks = [...new Set(m.schedule.days.filter((d) => d.date.startsWith(month) && d.study).map((d) => d.week))];
  const weeklies = weeks.map((w) => weeklyProjectOf(m.plan, m.schedule, w)).filter((x): x is NonNullable<typeof x> => !!x);
  if (!blocks.length && !weeklies.length) return null;
  return (
    <section aria-labelledby={headingId} data-testid="agenda-month-projects">
      <h3 id={headingId} className={cn(SECTION, "mb-2")}>Proyectos del mes</h3>
      <ul className="space-y-2.5">
        {blocks.map((b) => <MonthlyCard key={b.id} m={m} b={b} onChanged={onChanged} />)}
      </ul>
      {weeklies.length > 0 && (
        <ol className="mt-3 space-y-1.5" aria-label="Proyectos semanales del mes">
          {weeklies.map((w) => {
            const done = w.dailyIds.filter((x) => statusOf(m, x) === "hecho").length;
            return (
              <li key={w.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-line px-3 py-2 text-[14px]" data-testid="agenda-month-weekly">
                <span className="font-medium">Semana {w.week}</span>
                <span className="min-w-0 flex-1 basis-56">{w.title}</span>
                <span className="text-dim">{done}/{w.dailyIds.length} diarios</span>
                <StatusChip status={statusOf(m, w.id)} />
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

// ── «Generar la práctica del plan con el Mentor» ────────────────────────

const COLD_RETRY_MS = 1500;
const COLD_RETRY_MAX = 40;

export function PracticeCurriculumBar({ plan, onChanged, announce, tip }: { plan: MentorPlan; onChanged: (p: MentorPlan) => void; announce: (msg: string) => void; /** versión «nota» de las páginas del plan (tarjeta suave, sin iconos); `area` = el nombre del área de la página */ tip?: { area?: string } }) {
  const toast = useApp((s) => s.toast);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const alive = useRef(true);
  const key = `practice:${plan.id}`;
  const status = useAiStatus(key, busy);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const cur = plan.practiceCurriculum;
  const run = useCallback(
    async (noAi: boolean) => {
      setBusy(true);
      setNote("");
      try {
        let r = await api.mentorPlanPracticeGenerate(plan.id, noAi ? { noAi: true } : {});
        for (let i = 0; r.loading && i < COLD_RETRY_MAX; i++) {
          await new Promise((ok) => setTimeout(ok, COLD_RETRY_MS));
          r = await api.mentorPlanPracticeGenerate(plan.id, noAi ? { noAi: true } : {});
        }
        if (r.loading) throw new Error("El índice de la vault tarda demasiado en estar listo. Inténtalo de nuevo en un momento.");
        if (!alive.current) return;
        onChanged(r.plan);
        useMentor.setState((s) => ({ planVersion: s.planVersion + 1 }));
        const msg = r.entry.summary + " Puedes deshacerlo en «Preguntas y ajustes».";
        setNote(msg);
        announce(msg);
      } catch (e) {
        const text = (e as Error).message;
        if (!/Cancelado/.test(text)) toast("error", text);
        else setNote("Cancelaste la generación: no se guardó nada.");
      } finally {
        if (alive.current) setBusy(false);
      }
    },
    [plan.id, onChanged, announce, toast],
  );
  const when = cur ? new Date(cur.generatedAt).toLocaleDateString("es", { day: "numeric", month: "short" }) : "";
  const state = cur
    ? `${cur.source === "ai" ? "Generada con el Mentor" : cur.source === "mixed" ? "Generada con el Mentor y plantillas" : "Plantillas automáticas"} (${when}): ejercicios por tema, retos de lógica y proyectos. ${plural(cur.weeks.length, "semana", "semanas")}.`
    : "Sin generar: la agenda usa plantillas automáticas por tipo de tema. El Mentor puede crear ejercicios concretos y proyectos enfocados en el objetivo del plan.";
  const area = tip?.area;
  return (
    <section aria-labelledby="pc-bar-h" className={tip ? "rounded-2xl bg-hover px-4 py-3.5" : "rounded-xl border border-line bg-card px-4 py-3"} data-testid="practice-curriculum-bar">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1 basis-72">
          <h3 id="pc-bar-h" className="text-[16px] font-semibold">{tip ? (area ? `Práctica de ${area} con Mentor IA` : "Práctica del plan con Mentor IA") : "Práctica del plan"}</h3>
          <p className="text-[14px] text-dim" data-testid="practice-curriculum-state">
            {state}
            {area ? ` El Mentor la genera para todas las áreas del plan a la vez; aquí ves la de ${area}.` : ""}
          </p>
        </div>
        <PrimaryButton large disabled={busy} onClick={() => void run(false)} data-testid="practice-curriculum-generate">
          <Sparkles size={16} aria-hidden /> {area ? `${cur ? "Regenerar" : "Generar"} práctica de ${area} con el Mentor` : cur ? "Regenerar la práctica del plan con el Mentor" : "Generar la práctica del plan con el Mentor"}
        </PrimaryButton>
        {!busy && <GhostButton large onClick={() => void run(true)} data-testid="practice-curriculum-templates">{area ? `Solo plantillas de ${area}` : "Solo plantillas (sin IA)"}</GhostButton>}
      </div>
      {busy && (
        <div className="mt-2">
          <ThinkingStatus
            label={status.label || "Preparando la práctica del plan…"}
            elapsed={status.elapsed}
            onCancel={() => void api.mentorAiCancel(key, "abort")}
            onAuto={() => void api.mentorAiCancel(key, "auto")}
            autoLabel="Completar el resto con plantillas (sin IA)"
          />
        </div>
      )}
      {note && <p role="status" className="mt-2 flex items-center gap-1.5 text-[14px] text-dim" data-testid="practice-curriculum-note">{note}</p>}
      {cur?.warnings?.length ? (
        <ul className="mt-2 list-disc space-y-0.5 pl-5 text-[13.5px] text-dim" data-testid="practice-curriculum-warnings">
          {cur.warnings.slice(0, 4).map((w) => <li key={w}>{w}</li>)}
        </ul>
      ) : null}
    </section>
  );
}
