// Mentor — Plan: una SUB-INTERFAZ por cada plan (en la barra lateral del Mentor) y un resumen de todos.
//
// Un plan cubre un periodo libre que decide el estudiante y se arma desde el formulario de precondiciones
// (`PlanForm`). SOLO LECTURA salvo el estado del entregable y las acciones del plan (renombrar, archivar,
// eliminar a la papelera): los temas, las metas y los proyectos se editan en sus módulos (cada bloque trae
// su botón «Abrir en …»). El estado de práctica y los porcentajes se derivan en vivo del motor de práctica;
// el registro de temas completados (fecha) lo anota `mentor_plan_get` la primera vez que ve un tema completo.
// El borrador (de la IA o automático) solo se guarda al pulsar «Aceptar plan» (código determinista).
//
// La sub-interfaz de un plan (pestañas Mi plan · Semana actual · Práctica diaria · Entregables · Cambios) vive en `PlanView.tsx`;
// aquí quedan el resumen de planes, el estado vacío y el borrador pendiente.

import { CalendarDays, Check, ListChecks, MessageSquarePlus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../../lib/bridge";
import { periodLabel, shortWeekLabel } from "../../lib/planTime";
import { FOCUS_LABEL as FOCUS_NAME, PRACTICE_NAME } from "../../lib/practiceTrack";
import type { MentorPlanDraft, MentorPlanRow } from "../../lib/types";
import { planViewId, useMentor } from "../../store/mentor";
import { useNavState } from "../../store/navState";
import { Chip, GhostButton, PrimaryButton } from "../common/forms";
import { cn } from "../ui";
import { Disclosure, hm, LoadState, PanelPage, ProgressBar, ThinkingStatus, useAiStatus } from "./parts";
import { PlanForm } from "./PlanForm";
import { PlanNotes } from "./planKit";
import { DAY_SHORT, monthLabel, num1, STATUS_COLOUR, STATUS_LABEL, usePlanData } from "./planShared";
import { PlanView } from "./PlanView";
import { ThisWeek } from "./PlanWeek";
import { practiceSummary, PracticeWeekLines } from "./PracticeCard";

/** El panel Plan del Mentor: `planId` = la sub-interfaz de ese plan; sin él, el resumen de todos los planes. */
export function MentorPlan({ planId }: { planId?: string }) {
  return planId ? <PlanView key={planId} planId={planId} /> : <PlansOverview />;
}

// ── Resumen de planes ────────────────────────────────────────────────────

function PlansOverview() {
  const { data, warming, error, reload } = usePlanData(undefined);
  const [creating, setCreating] = useState(false);
  const chatLoaded = useMentor((s) => s.chatLoaded);
  const loadChat = useMentor((s) => s.loadChat);
  const turns = useMentor((s) => s.turns);
  const pending = useMentor((s) => s.pending);
  const startPlan = useMentor((s) => s.startPlanChat);
  const acceptPlan = useMentor((s) => s.acceptPlan);
  const accepting = useMentor((s) => s.acceptingPlan);
  const discard = useMentor((s) => s.discard);
  const builds = useMentor((s) => s.builds);
  const generatingPlan = useMentor((s) => s.generatingPlan);
  const gen = useAiStatus("generate", generatingPlan);

  useEffect(() => {
    if (!chatLoaded) void loadChat();
  }, [chatLoaded, loadChat]);

  const draftTurn = turns.find((t) => t.id === pending && t.planDraft);
  const plans = data?.plans ?? [];

  return (
    <PanelPage
      a11y
      title="Mentor — Planes"
      subtitle="Cada plan cubre el periodo que tú decides y tiene su propia sub-interfaz. Aquí ves todos y lo que toca hoy y esta semana."
      wide
      action={
        <div className="flex flex-wrap items-center gap-2">
          <GhostButton large onClick={() => void startPlan()} title="Conversa con el Mentor para armar un plan">
            <MessageSquarePlus size={16} aria-hidden /> Pedirlo al Mentor
          </GhostButton>
          <PrimaryButton large onClick={() => setCreating((v) => !v)}>
            <span aria-hidden>＋</span> Nuevo plan
          </PrimaryButton>
        </div>
      }
    >
      <LoadState warming={warming} error={error} empty={!data} onRetry={() => void reload()} />

      {creating && <PlanForm onClose={() => setCreating(false)} />}

      {generatingPlan && !creating && (
        <ThinkingStatus label={gen.label || "Generando el plan completo…"} elapsed={gen.elapsed} onCancel={() => void api.mentorAiCancel("generate", "abort")} onAuto={() => void api.mentorAiCancel("generate", "auto")} autoLabel="Generar con plan automático (sin IA)" />
      )}

      {builds.length > 0 && (
        <section aria-label="Planes en construcción" data-testid="plan-builds" className="space-y-2">
          {builds.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => useNavState.getState().set("mentor.view", `build:${b.id}`)}
              className="flex w-full flex-wrap items-center gap-3 rounded-xl border-2 border-accent/60 bg-card p-4 text-left hover:border-accent"
              data-testid="plan-build-card"
              aria-label={`Continuar plan en construcción ${b.name}`}
            >
              <ListChecks size={20} aria-hidden className="flex-none text-accent-text" />
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold">{b.name}</span>
                <span className="block text-[14px] text-dim">En construcción · etapa {b.stageNumber}/{b.stages} · {b.period}</span>
                {b.question && <span className="block text-[14px] text-dim">Te pregunto: {b.question}</span>}
              </span>
              <Chip large colour="var(--nv-accent)">Continuar</Chip>
            </button>
          ))}
        </section>
      )}

      {draftTurn?.planDraft && (
        <PlanDraftCard draft={draftTurn.planDraft} accepting={accepting} onAccept={() => void acceptPlan()} onDiscard={() => void discard()} />
      )}

      {data && plans.length === 0 && builds.length === 0 && !draftTurn && !creating && <EmptyPlan aiConfigured={data.aiConfigured} onCreate={() => setCreating(true)} />}

      {data && plans.length > 0 && (
        <section aria-labelledby="po-plans" data-testid="plans-grid">
          <h2 id="po-plans" className="mb-3 text-[18px] font-semibold">Tus planes <span className="text-[14px] font-normal text-dim">{plans.length}</span></h2>
          <ul className="grid gap-4 @3xl:grid-cols-2 @6xl:grid-cols-3">
            {plans.map((p) => (
              <li key={p.id}>
                <PlanCard plan={p} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {data && plans.some((p) => p.status === "activo") && <ThisWeek items={data.items} practiceItems={data.practiceItems} activePlans={plans.filter((p) => p.status === "activo").length} headingId="po-week" />}
    </PanelPage>
  );
}

function PlanCard({ plan }: { plan: MentorPlanRow }) {
  const open = () => useNavState.getState().set("mentor.view", planViewId(plan.id));
  return (
    <button type="button" onClick={open} aria-label={`Abrir plan ${plan.name}`} className="nv-ghost block w-full rounded-xl border border-line bg-card p-4 text-left hover:border-accent" data-testid="plan-card">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-[16px] font-semibold leading-snug">{plan.name}</div>
          <div className="text-[14px] text-dim">{plan.period}</div>
        </div>
        <Chip large colour={STATUS_COLOUR[plan.status]}>{STATUS_LABEL[plan.status]}</Chip>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <div className="flex-1"><ProgressBar pct={plan.pct} label={`Avance de ${plan.name}`} /></div>
        <span className="text-[14px] font-semibold">{plan.pct} %</span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-2 text-[14px] text-dim">
        <span>{plan.subplans} {plan.structure === "areas" ? (plan.subplans === 1 ? "área" : "áreas") : plan.subplans === 1 ? "subplan" : "subplanes"}</span>
        <span>· {plan.completed}/{plan.topics} temas</span>
        {plan.minutesPerDay ? <span>· {num1(plan.minutesPerDay / 60)} h/día</span> : null}
        {plan.auto && <span>· automático</span>}
      </div>
    </button>
  );
}

function EmptyPlan({ aiConfigured, onCreate }: { aiConfigured: boolean; onCreate: () => void }) {
  return (
    <div className="rounded-xl border border-dashed border-line p-6 text-center" data-testid="plan-empty">
      <CalendarDays size={24} aria-hidden className="mx-auto text-faint" />
      <p className="mt-2 text-[16px] font-medium">Aún no tienes ningún plan</p>
      <p className="mx-auto mt-1 max-w-[560px] text-[14px] text-dim">
        Un plan reparte los temas que necesitas por semanas en el periodo que elijas (una semana, dos meses, fechas a medida), organizados en ÁREAS
        elementales (Backend, Frontend, Databases…) con su ruta de temas, sus metas enlazadas y entregables (archivos prácticos) que demuestran lo que sabes. Cada plan tendrá su propia sub-interfaz y de ellos
        sale tu plan de cada día en «Hoy».
      </p>
      {!aiConfigured && <p className="mx-auto mt-2 max-w-[520px] text-[14px] text-warn">La IA no está configurada: se generará un plan automático con tus metas y materias.</p>}
      <div className="mt-3 flex justify-center">
        <PrimaryButton large onClick={onCreate}>
          <span aria-hidden>＋</span> Crear mi primer plan
        </PrimaryButton>
      </div>
    </div>
  );
}

// ── Borrador pendiente ───────────────────────────────────────────────────

export function draftPeriod(d: MentorPlanDraft): string {
  return d.preconditions && d.start && d.end ? periodLabel(d.start, d.end) : monthLabel(d.month);
}

const DELIVERABLES_TEXT = { ask: "entregables a discutir", yes: "con entregables", no: "entregables por definir" } as const;

export function PlanDraftCard({ draft, accepting, onAccept, onDiscard }: { draft: MentorPlanDraft; accepting: boolean; onAccept: () => void; onDiscard: () => void }) {
  const [cal, setCal] = useState(false);
  const answer = useMentor((s) => s.answerDraftQuestion);
  const questions = (draft.openQuestions ?? []).filter((q) => q.id === "deliverables");
  const topics = draft.subplans.reduce((n, s) => n + s.topics.length, 0);
  const weeks = draft.subplans[0]?.weeks ?? [];
  const pre = draft.preconditions;
  return (
    <section className="rounded-xl border-2 border-accent/60 bg-card p-4" data-testid="plan-draft" aria-label="Borrador del plan">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-[16px] font-semibold">Borrador del plan {pre ? "del" : "de"} {draftPeriod(draft)}</h2>
        {draft.auto ? <Chip large colour="var(--nv-warn)">Plan automático</Chip> : <Chip large colour="var(--nv-accent)">Propuesto por el Mentor</Chip>}
        <span className="text-[14px] text-dim">
          {draft.subplans.length} {draft.structure === "areas" ? (draft.subplans.length === 1 ? "área" : "áreas") : "subplanes"} · {topics} temas · {draft.hoursPerWeek} h/semana · {hm(draft.totalMinutes)} de {hm(draft.availableMinutes)}
        </span>
      </div>
      {pre && (
        <p className="mt-1 text-[14px] text-dim" data-testid="draft-preconditions">
          {num1(pre.minutesPerDay / 60)} h/día · {pre.studyDays.map((d) => DAY_SHORT[d - 1]).join("")} · ritmo {pre.pace}
          {pre.blockedDates?.length ? ` · ${pre.blockedDates.length} fechas bloqueadas` : ""} · {DELIVERABLES_TEXT[pre.deliverables]}
          {pre.practice ? ` · ${PRACTICE_NAME}` : ""}
        </p>
      )}
      {pre?.notes && <div className="mt-2"><PlanNotes notes={pre.notes} auto={!!draft.auto} testid="draft-notes" /></div>}
      {draft.rationale && <p className="mt-2 text-[14px] text-dim">{draft.rationale}</p>}
      {draft.coverage && <p role="status" className={cn("mt-2 text-[14px]", draft.fits ? "text-mint" : "text-warn")}>{draft.coverage}</p>}
      {draft.warnings.map((w) => (
        <p key={w} role="status" className="mt-2 text-[14px] text-warn">{w}</p>
      ))}
      {draft.fallbackReason && <p className="mt-2 text-[14px] text-faint">Se usó el plan automático porque: {draft.fallbackReason}</p>}
      {draft.discarded.length > 0 && (
        <p className="mt-2 text-[14px] text-faint">Descartado por no existir en tu sistema: {draft.discarded.join(", ")}.</p>
      )}
      <ul className="mt-3 grid gap-2 @3xl:grid-cols-2">
        {draft.subplans.map((s) => (
          <li key={s.id} className="rounded-lg border border-line p-3 text-[14px]">
            <div className="font-semibold">{s.area}{s.objective ? <span className="font-normal text-dim"> · {s.objective}</span> : null}</div>
            <div className="text-[13.5px] text-dim">
              {s.topics.length} temas{s.requiredGoals.length ? ` · ${s.requiredGoals.length} ${s.requiredGoals.length === 1 ? "meta requerida" : "metas requeridas"}` : ""}
              {s.deliverable ? ` · entregable: ${s.deliverable.title}` : ""}
            </div>
            {s.notes && <div className="mt-0.5 text-[13.5px] text-dim">{s.notes}</div>}
          </li>
        ))}
      </ul>
      {questions.length > 0 && (
        <section className="mt-3 rounded-lg border border-dashed border-line p-3" data-testid="draft-open-questions" aria-label="Por decidir: entregables">
          <h3 className="flex flex-wrap items-center gap-2 text-[15px] font-semibold">
            Por decidir: entregables <Chip large colour="var(--nv-warn)">Pendiente de decidir</Chip>
          </h3>
          <p className="mt-0.5 text-[14px] text-dim">El borrador no añade proyectos de área todavía. Decide una sola vez para todo el plan (después puedes quitar el de un área); lo que dejes sin responder se queda pendiente en el plan.</p>
          <ul className="mt-2 space-y-2">
            {questions.map((q) => (
              <li key={`${q.id}:${q.subplanId}`} className="flex flex-wrap items-center gap-2 text-[14px]" data-testid="draft-open-question">
                <span className="min-w-0 flex-1">{q.text}</span>
                <GhostButton onClick={() => void answer(q.subplanId ?? "", "yes")}>Añadir entregable</GhostButton>
                <GhostButton onClick={() => void answer(q.subplanId ?? "", "no")}>No lo quiero</GhostButton>
              </li>
            ))}
          </ul>
        </section>
      )}
      {draft.programmingPractice && (
        <section className="mt-3 rounded-lg border border-line p-3 text-[14px]" data-testid="draft-practice" aria-label={PRACTICE_NAME}>
          <h3 className="font-semibold">{PRACTICE_NAME}</h3>
          <p className="text-[14px] text-dim">{practiceSummary(draft.programmingPractice)}. Esos minutos ya están reservados: para temas quedan los del reparto.</p>
          {draft.programmingPractice.weeklyProject && (
            <ol className="mt-1 space-y-0.5 text-[14px] text-dim">
              {draft.programmingPractice.weeklyProject.weeks.filter((w) => w.sessions.length).map((w) => (
                <li key={w.week}>
                  Sem. {w.week} · {w.theme ? `${w.theme} · ` : ""}foco {FOCUS_NAME[w.focus]}
                </li>
              ))}
            </ol>
          )}
        </section>
      )}
      <div className="mt-3">
        <Disclosure open={cal} onToggle={() => setCal((v) => !v)} label={`${cal ? "Ocultar" : "Ver"} calendario semanal`} controls="draft-calendar">
          <span className="text-[14px] font-medium">Calendario semanal</span>
        </Disclosure>
        {cal && (
          <div id="draft-calendar" className="mt-2 space-y-2" data-testid="draft-calendar">
            {weeks.map((w, i) => (
              <div key={w.week} className="rounded-lg border border-line p-3 text-[14px]">
                <div className="font-medium">Semana {w.week} <span className="font-normal text-dim">· {shortWeekLabel(w.start, w.end)}</span></div>
                <ul className="mt-1 space-y-0.5 text-dim">
                  {draft.subplans.flatMap((s) =>
                    s.topics.filter((t) => t.targetWeek === i + 1).map((t) => (
                      <li key={`${s.id}:${t.folder}`}>
                        <span className="text-text">{t.title}</span> · {s.area} · {hm(t.estMinutes)}{t.diagnostic ? " · diagnóstico inicial" : ""}
                      </li>
                    )),
                  )}
                  <PracticeWeekLines track={draft.programmingPractice} week={i + 1} />
                  {!draft.subplans.some((s) => s.topics.some((t) => t.targetWeek === i + 1)) && <li className="text-faint">Sin temas</li>}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <PrimaryButton large onClick={onAccept} disabled={accepting}>
          <Check size={16} aria-hidden /> Aceptar plan
        </PrimaryButton>
        <GhostButton large danger onClick={onDiscard}>
          <Trash2 size={16} aria-hidden /> Descartar
        </GhostButton>
      </div>
    </section>
  );
}

