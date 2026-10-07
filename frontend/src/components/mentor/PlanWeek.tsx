// Mentor — Plan: «Esta semana y hoy» (todos los planes activos combinados) y, para un plan solo propuesto, la vista previa de
// lo que tocaría en su semana actual. «Planear mi día con esto» deja el objetivo para el panel Hoy.

import { CalendarDays } from "lucide-react";
import { shortWeekLabel } from "../../lib/planTime";
import { FOCUS_LABEL as FOCUS_NAME, PRACTICE_NAME, phasesText, type PracticeItem } from "../../lib/practiceTrack";
import type { MentorPlan, MentorPlanItem, MentorSubplanView } from "../../lib/types";
import { useMentor } from "../../store/mentor";
import { useNavState } from "../../store/navState";
import { Chip, GhostButton, PrimaryButton } from "../common/forms";
import { openTopic } from "./openTopic";
import { hm } from "./parts";
import { openPractice } from "./PracticeCard";

export function ThisWeek({ items, practiceItems = [], activePlans, headingId = "tw-title" }: { items: MentorPlanItem[]; practiceItems?: PracticeItem[]; activePlans: number; headingId?: string }) {
  const setPending = useMentor((s) => s.setPendingObjective);
  const planDay = (type: "plan" | "programming_practice" = "plan") => {
    setPending({ type });
    useNavState.getState().set("mentor.view", "hoy");
  };
  if (activePlans === 0) {
    return <p className="rounded-xl border border-dashed border-line p-4 text-center text-[14px] text-dim" data-testid="plan-week-empty">«Esta semana» solo existe cuando hay un plan activo hoy.</p>;
  }
  return (
    <section className="rounded-2xl border border-line bg-card p-4 @3xl:p-5" data-testid="plan-this-week" aria-labelledby={headingId}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 id={headingId} className="text-[18px] font-semibold">
          Esta semana y hoy <span className="text-[14px] font-normal text-dim">{activePlans > 1 ? `(${activePlans} planes activos combinados)` : ""}</span>
        </h2>
        <span className="flex-1" />
        {practiceItems.length > 0 && (
          <GhostButton large onClick={() => planDay("programming_practice")} title="Solo el kata y el proyecto de hoy">
            {PRACTICE_NAME} (kata + proyecto)
          </GhostButton>
        )}
        <PrimaryButton large onClick={() => planDay("plan")} disabled={!items.length && !practiceItems.length}>
          <CalendarDays size={16} aria-hidden /> Planear mi día con esto
        </PrimaryButton>
      </div>
      {practiceItems.length > 0 && (
        <ul className="mt-4 space-y-2" aria-label={`${PRACTICE_NAME} de hoy`} data-testid="plan-week-practice">
          {practiceItems.map((it) => (
            <li key={`${it.planId}:${it.kind}`} className="rounded-xl border border-line p-3" data-testid="plan-week-practice-item">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <span className="text-[15px] font-semibold">{it.kind === "kata" ? "Reto diario (kata de lógica)" : `Proyecto semanal: ${it.phases?.length ? phasesText(it.phases) : "sesión"}`}</span>
                <Chip large colour="var(--nv-practice, #c58be0)">{PRACTICE_NAME}</Chip>
                {activePlans > 1 && <Chip large colour="var(--nv-mint)">Plan: {it.label}</Chip>}
                {it.kind === "project" && it.focus && <Chip large colour="var(--nv-accent)">Semana {it.week} · foco {FOCUS_NAME[it.focus]}</Chip>}
                <span className="text-[14px] text-dim">{hm(it.estMinutes)}</span>
                <GhostButton className="ml-auto" onClick={openPractice}>Abrir práctica</GhostButton>
              </div>
            </li>
          ))}
        </ul>
      )}
      {items.length === 0 && practiceItems.length === 0 ? (
        <p className="mt-4 text-[14px] text-dim">Nada pendiente de tus planes para esta semana. Si quieres adelantar, pídele un plan de hoy al Mentor.</p>
      ) : (
        <ul className="mt-4 space-y-2" aria-label="Temas de esta semana">
          {items.map((it) => (
            <li key={`${it.planId}:${it.subplanId}:${it.folder ?? "deliverable"}`} className="rounded-xl border border-line p-3" data-testid="plan-week-item">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <span className="text-[15px] font-semibold">{it.title}</span>
                {activePlans > 1 && <Chip large colour="var(--nv-mint)">Plan: {it.label}</Chip>}
                {it.kind === "deliverable" && <Chip large colour="var(--nv-accent)">Entregable</Chip>}
                {it.overdue && <Chip large colour="var(--nv-danger)"><span aria-hidden>⚠</span> Atrasado (sem. {it.targetWeek})</Chip>}
                <span className="text-[14px] text-dim">{hm(it.estMinutes)}</span>
                {it.folder && (
                  <GhostButton className="ml-auto" aria-label={`Ver tema ${it.title}`} onClick={() => void openTopic(it.folder!)}>Ver tema</GhostButton>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * Un plan propuesto no alimenta «Esta semana»: en su lugar se enseña, solo como vista previa, qué temas caerían en su semana
 * actual (o en la primera, si aún no empieza), leídos del propio plan.
 */
export function ProposedWeekPreview({ plan, views, week, onKeep }: { plan: MentorPlan; views: MentorSubplanView[]; week: number; onKeep: () => void }) {
  const rows = plan.subplans
    .map((s) => {
      const w = s.weeks.find((x) => x.week === week);
      const view = views.find((v) => v.id === s.id);
      const topics = (w?.topics ?? []).map((f) => view?.topics.find((t) => t.folder === f)?.title ?? f);
      return { s, w, topics };
    })
    .filter((r) => r.topics.length > 0);
  const range = rows.find((r) => r.w)?.w;
  const minutes = rows.reduce((n, r) => n + (r.w?.minutes ?? 0), 0);
  return (
    <section className="rounded-2xl border border-line bg-card p-4 @3xl:p-5" aria-labelledby="pw-title" data-testid="plan-week-preview">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 id="pw-title" className="text-[18px] font-semibold">
          Vista previa de la semana {week} <span className="text-[14px] font-normal text-dim">{range ? shortWeekLabel(range.start, range.end) : ""}{minutes ? ` · ${hm(minutes)}` : ""}</span>
        </h2>
        <span className="flex-1" />
        <PrimaryButton large onClick={onKeep}>Mantener plan para activarlo</PrimaryButton>
      </div>
      <p className="mt-1 text-[14px] text-dim">Este plan sigue propuesto: no alimenta «Hoy» ni «Esta semana» hasta que lo mantengas. Esto es lo que caería en esa semana.</p>
      {rows.length === 0 ? (
        <p className="mt-3 text-[14px] text-dim">Esa semana no tiene temas repartidos.</p>
      ) : (
        <ul className="mt-3 space-y-2" aria-label="Temas previstos">
          {rows.map(({ s, topics }) => (
            <li key={s.id} className="rounded-xl border border-line p-3">
              <div className="text-[15px] font-semibold">{s.objective || s.area}</div>
              <ul className="mt-1 list-disc pl-5 text-[14px] text-dim">
                {topics.map((t) => <li key={t}>{t}</li>)}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
