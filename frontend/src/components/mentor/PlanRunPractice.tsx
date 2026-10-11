// Mentor — Plan, vista de ejecución: la PRÁCTICA diaria y semanal y los PROYECTOS (diario y semanal).
//
// Es la parte práctica del día, la que nace de la carpeta `programming_practice` y no de las asignaturas: un reto diario POR ÁREA (Backend,
// Frontend, Databases, Tooling and Quality…) basado en las habilidades clave que piden las entrevistas técnicas, el kata de lógica general y el
// proyecto full stack de la semana. Los proyectos integradores (diario y semanal) van al final de la vista.
// Lo único que escribe es la marca de «kata hecho / saltado» del día (datos de la app); nada del plan.

import { BookOpen, Check, Dumbbell, ExternalLink, SkipForward, Undo2 } from "lucide-react";
import { clampToPlan, dateLabel } from "../../lib/planSchedule";
import { dailyProjectOf, shortOf, weeklyProjectOf } from "../../lib/planCurriculum";
import { api } from "../../lib/bridge";
import type { AreaPracticeView } from "../../lib/areaPracticeView";
import { KATA_LEVEL_LABEL } from "../../lib/areaPracticeSystem";
import type { MentorPlan } from "../../lib/types";
import { useApp } from "../../store/app";
import { useNavState } from "../../store/navState";
import { cn } from "../ui";
import { openTopic } from "./openTopic";
import { AreaCardShell, RowMenu, type MenuAction } from "./PlanBoard";
import { Chip, GhostButton } from "../common/forms";
import { DSTATUS_COLOUR, DSTATUS_LABEL, focusColour, plural, type AgendaModel } from "./agendaKit";
import { hm, ProgressBar } from "./parts";
import { GeneralCards, practiceAreaKey, usePlanAreaPractice, type AreaPracticeState } from "./PracticeCard";
import { SectionCard, SectionHeading } from "./planKit";
import { openPlanTab, type Loaded } from "./planShared";

const PRACTICE_COLOUR = "var(--nv-practice, #c58be0)";

/** La fila del kata de un área: casilla (marca el día), título, habilidad y la flecha con el acceso directo al kata. */
function KataRow({ plan, area, today, mark }: { plan: MentorPlan; area: AreaPracticeView; today: string; mark: AreaPracticeState["mark"] }) {
  const toast = useApp((st) => st.toast);
  const next = area.kata.next;
  if (!next) return <p className="px-2.5 py-3 text-[14px] text-faint">Este plan no tiene katas en esta área.</p>;
  const colour = focusColour(area.areaId);
  const isToday = next.date === today;
  const state = area.kata.week.find((d) => d.today)?.state;
  const done = isToday && state === "done";
  const openKata = async (): Promise<void> => {
    try {
      const r = await api.mentorAreaKataOpen(plan.id, area.areaId);
      await useApp.getState().openNote(r.rel);
      if (r.created) toast("info", "Kata creado en tu vault y abierto.");
    } catch (e) {
      toast("error", (e as Error).message);
    }
  };
  const items: MenuAction[] = [
    { id: "open", label: "Abrir kata (.md)", icon: <BookOpen size={16} aria-hidden className="text-accent-text" />, onClick: () => void openKata(), testid: "kata-open" },
    ...(isToday && state !== "done" ? [{ id: "done", label: "Marcar hecho", icon: <Check size={16} aria-hidden className="text-mint" />, onClick: () => void mark(area.areaId, today, "done"), testid: "kata-mark-done" }] : []),
    ...(isToday && state === "pending" ? [{ id: "skip", label: "Saltar hoy", icon: <SkipForward size={16} aria-hidden />, onClick: () => void mark(area.areaId, today, "skipped"), testid: "kata-mark-skip" }] : []),
    ...(isToday && (state === "done" || state === "skipped") ? [{ id: "undo", label: "Quitar marca", icon: <Undo2 size={16} aria-hidden />, onClick: () => void mark(area.areaId, today, null), testid: "kata-mark-undo" }] : []),
    { id: "area", label: `Ver práctica de ${area.label}`, icon: <Dumbbell size={16} aria-hidden className="text-mint" />, onClick: () => { useNavState.getState().set(practiceAreaKey(plan.id), area.areaId); openPlanTab(plan.id, "practica"); }, testid: "kata-area" },
  ];
  return (
    <li className="flex items-center gap-2.5 rounded-xl border border-line bg-surface px-2.5 py-1.5" data-testid="kata-row" data-state={done ? "done" : state ?? "none"}>
      <button
        type="button"
        role="checkbox"
        aria-checked={done}
        aria-label={`${done ? "Quitar la marca de" : "Marcar como hecho"}: ${next.kata.title}`}
        disabled={!isToday}
        onClick={() => void mark(area.areaId, today, done ? null : "done")}
        className="grid h-5 w-5 flex-none place-items-center rounded-md border text-[12px] font-bold text-white disabled:opacity-40"
        style={done ? { background: colour, borderColor: colour } : { borderColor: "var(--nv-line, currentColor)" }}
        data-testid="kata-check"
      >
        {done ? "✓" : null}
      </button>
      <span className={cn("min-w-0 flex-1 text-[15px] leading-snug", done && "text-faint line-through decoration-faint/60")}>
        {next.kata.title}
        <span className="block text-[13.5px] font-normal text-dim">{next.kata.skillName} · {KATA_LEVEL_LABEL[next.kata.level]} · {next.kata.minutes} min{isToday ? "" : ` · ${dateLabel(next.date)}`}</span>
      </span>
      <RowMenu title={next.kata.title} items={items} />
    </li>
  );
}

/** «Práctica de hoy»: un reto por área, con la misma tarjeta que los temas, y el kata de lógica del plan. */
export function RunPractice({ plan, data, today }: { plan: MentorPlan; data: Loaded; today: string }) {
  const ap = usePlanAreaPractice(plan.id);
  const areas = ap.data?.areas ?? [];
  const track = plan.programmingPractice;
  if (!areas.length && !track?.kata) return null;
  const done = areas.filter((a) => a.kata.todayPlanned && a.kata.todayDone).length;
  const due = areas.filter((a) => a.kata.todayPlanned).length;
  const openAll = (): void => openPlanTab(plan.id, track ? "practica" : "plan");
  const ppBase = ap.data?.ppBase ?? "";
  const general = data.practice?.kata;
  return (
    <section aria-labelledby="run-practice-h" data-testid="run-practice" className="space-y-3">
      <SectionHeading
        id="run-practice-h"
        hint="Un reto diario por área, con las habilidades clave que piden las entrevistas técnicas, más el kata de lógica. La flecha de cada reto abre el kata."
        right={
          <div className="flex flex-wrap items-center gap-2">
            {due > 0 && <Chip large colour={done === due ? "var(--nv-mint)" : "var(--nv-warn)"}>{done}/{due} retos de hoy</Chip>}
            <GhostButton onClick={openAll} data-testid="run-practice-all"><ExternalLink size={14} aria-hidden /> Toda la práctica</GhostButton>
          </div>
        }
      >
        Práctica de hoy
      </SectionHeading>
      {ap.loading && !ap.data && <p role="status" className="text-[14px] text-dim">Leyendo la práctica de cada área…</p>}
      {ap.error && <p role="alert" className="text-[14px] text-danger">{ap.error} <button type="button" className="underline" onClick={ap.reload}>Reintentar</button></p>}
      <ul className="grid items-start gap-4 @3xl:grid-cols-2 @6xl:grid-cols-3 [&>*]:min-w-0" aria-label="Retos de hoy por área" data-testid="run-practice-areas">
        {areas.map((a) => {
          const colour = focusColour(a.areaId);
          const tag = !a.kata.todayPlanned ? "No toca hoy" : a.kata.todayDone ? "Hoy: hecho" : "Hoy: pendiente";
          return (
            <AreaCardShell
              key={a.areaId}
              colour={colour}
              title={a.label}
              badge={`${a.kata.doneDays}/${a.kata.plannedDays}`}
              sub={`racha ${a.kata.streak} · ${KATA_LEVEL_LABEL[a.level]}`}
              tag={tag}
              testid="run-practice-area"
              area={a.areaId}
              footer={a.kata.next ? <span className="line-clamp-2 text-dim">{a.kata.next.summary}</span> : undefined}
            >
              <ul>
                <KataRow plan={plan} area={a} today={ap.data!.today || today} mark={ap.mark} />
              </ul>
            </AreaCardShell>
          );
        })}
        {track?.kata && (
          <AreaCardShell
            colour={PRACTICE_COLOUR}
            title="Kata de lógica"
            badge={general ? `${general.doneDays}/${general.plannedDays}` : undefined}
            sub={`${hm(track.kata.minutesPerDay)} al día${general ? ` · racha ${general.streak}` : ""}`}
            tag={general?.todayPlanned ? (general.todayDone ? "Hoy: hecho" : "Hoy: pendiente") : "No toca hoy"}
            testid="run-practice-logic"
          >
            <ul>
              <li className="flex items-center gap-2.5 rounded-xl border border-line bg-surface px-2.5 py-1.5">
                <span aria-hidden className="grid h-5 w-5 flex-none place-items-center rounded-md border text-[12px] font-bold text-white" style={general?.todayDone ? { background: PRACTICE_COLOUR, borderColor: PRACTICE_COLOUR } : { borderColor: "var(--nv-line, currentColor)" }}>{general?.todayDone ? "✓" : ""}</span>
                <span className="min-w-0 flex-1 text-[15px] leading-snug">Reto de lógica del día<span className="block text-[13.5px] text-dim">Arrays, hashing, recursión, punteros… · {hm(track.kata.minutesPerDay)}</span></span>
                {ppBase && (
                  <RowMenu
                    title="Kata de lógica"
                    items={[{ id: "logic", label: "Abrir el kata de lógica", icon: <BookOpen size={16} aria-hidden className="text-accent-text" />, onClick: () => void openTopic(`${ppBase}/kata`), testid: "logic-open" }]}
                  />
                )}
              </li>
            </ul>
          </AreaCardShell>
        )}
      </ul>
    </section>
  );
}

/** Los proyectos al final de la vista: el del día, el de la semana y el proyecto full stack de la pista. */
export function RunProjects({ plan, data, m }: { plan: MentorPlan; data: Loaded; m: AgendaModel }) {
  const date = clampToPlan(m.today, plan);
  const day = m.schedule.byDate.get(date);
  const daily = day ? dailyProjectOf(plan, m.schedule, day) : null;
  const weekly = day ? weeklyProjectOf(plan, m.schedule, day.week) : null;
  const track = plan.programmingPractice;
  if (!daily && !weekly && !track?.weeklyProject) return null;
  const status = (id: string | undefined) => (id && m.deliverablesDefined ? m.deliverableById.get(id)?.status : undefined);
  const weeklyDone = weekly ? weekly.dailyIds.filter((id) => status(id) === "hecho").length : 0;
  const dailyStatus = status(daily?.id);
  const weeklyStatus = status(weekly?.id);
  return (
    <section aria-labelledby="run-projects-h" data-testid="run-projects" className="space-y-3">
      <SectionHeading id="run-projects-h" hint="Aplican lo que estudias y practicas hoy: el diario es una pieza pequeña y el semanal junta las piezas de la semana en una vertical completa.">
        Proyectos
      </SectionHeading>
      <div className="grid items-start gap-4 @3xl:grid-cols-2 [&>*]:min-w-0">
        <SectionCard labelledBy="run-daily-h" testid="run-project-daily" className="space-y-1.5">
          <p className="text-[13px] font-medium uppercase tracking-wide text-faint">Proyecto diario{day ? ` · ${dateLabel(date)}` : ""}</p>
          {daily ? (
            <>
              <h3 id="run-daily-h" className="text-[17px] font-semibold leading-snug">{daily.title}</h3>
              <p className="text-[14.5px] text-dim">{daily.description}</p>
              {daily.topics.length > 0 && <p className="text-[14px]"><span className="font-medium">Conectado con:</span> {daily.topics.map((t) => shortOf(t.title)).join(" · ")}</p>}
              <p className="flex flex-wrap items-center gap-2 text-[14px] text-dim">
                {daily.minutes ? <span>{hm(daily.minutes)}</span> : null}
                <span>{daily.weeklyPart}</span>
                {dailyStatus ? <Chip large colour={DSTATUS_COLOUR[dailyStatus]}>{DSTATUS_LABEL[dailyStatus]}</Chip> : <Chip large colour="var(--nv-faint)">Entregable por definir</Chip>}
              </p>
            </>
          ) : (
            <>
              <h3 id="run-daily-h" className="text-[16px] font-semibold">Hoy no hay proyecto diario</h3>
              <p className="text-[14px] text-dim">Es un día sin estudio programado.</p>
            </>
          )}
        </SectionCard>

        <SectionCard labelledBy="run-weekly-h" testid="run-project-weekly" className="space-y-1.5">
          <p className="text-[13px] font-medium uppercase tracking-wide text-faint">Proyecto semanal{weekly ? ` · semana ${weekly.week}` : ""}</p>
          {weekly ? (
            <>
              <h3 id="run-weekly-h" className="text-[17px] font-semibold leading-snug">{weekly.title}</h3>
              <p className="text-[14.5px] text-dim">{weekly.description}</p>
              <p className="text-[14px]"><span className="font-medium">Hoy avanza:</span> {daily ? daily.title : "repaso"} <span className="text-dim">· {weeklyDone} de {plural(weekly.dailyIds.length, "pieza", "piezas")} hechas</span></p>
              <ProgressBar pct={weekly.dailyIds.length ? (weeklyDone / weekly.dailyIds.length) * 100 : 0} label={`Avance del proyecto semanal ${weekly.week}`} />
              {weeklyStatus ? <Chip large colour={DSTATUS_COLOUR[weeklyStatus]}>{DSTATUS_LABEL[weeklyStatus]}</Chip> : <Chip large colour="var(--nv-faint)">Entregable por definir</Chip>}
            </>
          ) : (
            <h3 id="run-weekly-h" className="text-[16px] font-semibold">Sin proyecto semanal esta semana</h3>
          )}
        </SectionCard>
      </div>

      {track?.weeklyProject && (
        <div data-testid="run-pp-project" className="space-y-1.5">
          <p className="text-[14px] text-dim">
            <span className="font-medium text-text" style={{ color: PRACTICE_COLOUR }}>Proyecto full stack de programming_practice</span> · cuatro fases: especificar, construir, defender y cerrar con el postmortem.
          </p>
          <GeneralCards track={track} status={data.practice} today={m.today} only={["project"]} />
        </div>
      )}
    </section>
  );
}
