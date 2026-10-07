// Mentor — Plan, pestaña «Entregables»: las decisiones pendientes («¿quieres un entregable para este subplán?») como lista
// compacta con acciones masivas, y los entregables ya definidos con su estado, criterios y enlace al proyecto. Las respuestas
// van a `mentor_plan_answer` (una por subplan: «yes» añade la propuesta determinista, «no» descarta la pregunta).

import { Check, ExternalLink, X } from "lucide-react";
import { useRef, useState } from "react";
import { api } from "../../lib/bridge";
import type { MentorDeliverableStatus, MentorPlan } from "../../lib/types";
import { useApp } from "../../store/app";
import { useMentor } from "../../store/mentor";
import { Chip, GhostButton, PrimaryButton } from "../common/forms";
import { confirmAction } from "../ui";
import { SectionHeading } from "./planKit";
import { DeliverableStatus } from "./PlanSubplans";
import { branchOf, DELIVERABLE_COLOUR, DELIVERABLE_LABEL, openProjectInProyectos, type Loaded } from "./planShared";

type Answer = "yes" | "no";

export function PlanDeliverables({ data, onChanged, announce, goTab }: { data: Loaded; onChanged: (p: MentorPlan) => void; announce: (msg: string) => void; goTab: (tab: "cambios") => void }) {
  const toast = useApp((s) => s.toast);
  const plan = data.plan!;
  const pending = (plan.openQuestions ?? []).filter((q) => q.id === "deliverables");
  const [deferred, setDeferred] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  // la fila (o el bloque) que se acaba de responder desaparece: el foco pasa al título para no perderse
  const head = useRef<HTMLDivElement>(null);
  const refocus = () => setTimeout(() => head.current?.focus(), 0);
  const subOf = (id: string | undefined) => plan.subplans.find((s) => s.id === id);
  const withDeliverable = plan.subplans.filter((s) => s.deliverable);

  const bump = () => useMentor.setState((s) => ({ planVersion: s.planVersion + 1 }));
  const answerOne = async (subplanId: string, answer: Answer) => {
    setBusy(subplanId);
    try {
      onChanged(await api.mentorPlanAnswer({ id: plan.id, subplanId, answer }));
      bump();
      announce(answer === "yes" ? "Entregable añadido." : "Entregable descartado.");
      refocus();
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const answerAll = async (answer: Answer) => {
    const n = pending.length;
    const ok = await confirmAction(
      answer === "yes" ? "Añadir un entregable a todos" : "No quiero ningún entregable",
      answer === "yes"
        ? `Se añadirá la propuesta de entregable (estado «Idea») a los ${n} subplanes que siguen por decidir. Luego puedes cambiar su estado o pedir cambios al Mentor.`
        : `Se descartarán las ${n} decisiones pendientes: ningún subplan tendrá entregable. Si cambias de idea, pídelo en «Cambios».`,
      answer === "yes" ? "Añadir a todos" : "No quiero ninguno",
      answer === "no",
    );
    if (!ok) return;
    let done = 0;
    try {
      for (const q of pending) {
        setBusy(`${done + 1}/${n}`);
        onChanged(await api.mentorPlanAnswer({ id: plan.id, subplanId: q.subplanId ?? "", answer }));
        done++;
      }
      announce(answer === "yes" ? `Se añadió un entregable a ${done} subplanes.` : `Se descartaron ${done} decisiones de entregables.`);
    } catch (e) {
      toast("error", `${(e as Error).message} (se aplicó a ${done} de ${n})`);
    } finally {
      setBusy(null);
      bump();
      refocus();
    }
  };
  const later = () => {
    setDeferred(true);
    refocus();
    announce(`Decidirás después: quedan ${pending.length} decisiones pendientes en el plan.`);
  };

  return (
    <>
      <div ref={head} tabIndex={-1} className="outline-none" data-testid="plan-deliverables-summary">
        <SectionHeading id="dl-title" hint={`${withDeliverable.length} de ${plan.subplans.length} subplanes con entregable${pending.length ? ` · ${pending.length} por decidir` : ""}.`}>
          Entregables
        </SectionHeading>
      </div>

      {pending.length > 0 && (
        <section aria-labelledby="dl-pending" className="rounded-2xl border border-dashed border-line-strong bg-card p-4 @3xl:p-5" data-testid="plan-open-questions">
          <h3 id="dl-pending" className="flex flex-wrap items-center gap-2 text-[16px] font-semibold">
            Por decidir <Chip large colour="var(--nv-warn)">{pending.length} {pending.length === 1 ? "pendiente" : "pendientes"}</Chip>
          </h3>
          <p className="mt-1 text-[14px] text-dim">Un entregable es un proyecto de demostración al final del subplan. El plan no añade ninguno hasta que lo decidas; lo que dejes sin responder se queda pendiente.</p>

          {deferred ? (
            <p className="mt-3 flex flex-wrap items-center gap-3 text-[14px]" data-testid="plan-open-deferred">
              Lo decidirás después. <GhostButton onClick={() => setDeferred(false)}>Revisar las {pending.length} decisiones</GhostButton>
            </p>
          ) : (
            <>
              <div className="mt-3 flex flex-wrap items-center gap-2" role="group" aria-label="Acciones para todos los subplanes">
                <PrimaryButton large disabled={!!busy} onClick={() => void answerAll("yes")}>
                  <Check size={16} aria-hidden /> Añadir a todos
                </PrimaryButton>
                <GhostButton large disabled={!!busy} onClick={() => void answerAll("no")}>
                  <X size={16} aria-hidden /> No quiero ninguno
                </GhostButton>
                <GhostButton large disabled={!!busy} onClick={later}>Decidir después</GhostButton>
                {busy && /\d+\/\d+/.test(busy) && <span role="status" className="text-[14px] text-dim">Aplicando {busy}…</span>}
              </div>
              <ul className="mt-4 divide-y divide-line rounded-xl border border-line" aria-label="Decisiones pendientes por subplan">
                {pending.map((q) => {
                  const sub = subOf(q.subplanId);
                  const title = sub ? sub.objective || sub.area : q.text;
                  const branch = sub ? branchOf(sub) : "";
                  return (
                    <li key={`${q.id}:${q.subplanId}`} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5" data-testid="plan-open-question">
                      <span className="min-w-0 flex-1 basis-56 text-[14px]">
                        {branch && <span className="block text-[13px] font-medium uppercase tracking-wide text-faint">{branch}</span>}
                        <span className="font-medium">{title}</span>
                        <span className="sr-only">. {q.text}</span>
                      </span>
                      <GhostButton large="md" disabled={!!busy} aria-label={`Añadir entregable a ${title}`} onClick={() => void answerOne(q.subplanId ?? "", "yes")}>Añadir entregable</GhostButton>
                      <GhostButton large="md" disabled={!!busy} aria-label={`No quiero entregable en ${title}`} onClick={() => void answerOne(q.subplanId ?? "", "no")}>No lo quiero</GhostButton>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </section>
      )}

      <section aria-labelledby="dl-defined" data-testid="plan-deliverables-defined">
        <h3 id="dl-defined" className="mb-2 text-[16px] font-semibold">Definidos <span className="text-[14px] font-normal text-dim">{withDeliverable.length}</span></h3>
        {withDeliverable.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line p-4 text-[14px] text-dim" data-testid="plan-deliverables-empty">
            Este plan aún no tiene entregables.{" "}
            <button type="button" onClick={() => goTab("cambios")} className="inline-flex min-h-8 items-center text-accent-text underline underline-offset-2">Pídele uno al Mentor en «Cambios»</button>
          </p>
        ) : (
          <ul className="grid items-start gap-3 @3xl:grid-cols-2">
            {withDeliverable.map((s) => {
              const d = s.deliverable!;
              const project = d.projectId ? data.projects[d.projectId] : undefined;
              return (
                <li key={s.id} className="rounded-xl border border-line bg-card p-4" data-testid="plan-deliverable-card">
                  <div className="text-[13px] font-medium uppercase tracking-wide text-faint">{branchOf(s) || s.area} · {s.objective || s.area}</div>
                  <h4 className="mt-0.5 flex flex-wrap items-center gap-2 text-[15px] font-semibold">
                    {d.title}
                    <Chip large colour={DELIVERABLE_COLOUR[d.status]}>{DELIVERABLE_LABEL[d.status as MentorDeliverableStatus]}</Chip>
                  </h4>
                  {d.description && <p className="mt-1 text-[14px] text-dim">{d.description}</p>}
                  {d.criteria.length > 0 && (
                    <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[14px] text-dim" aria-label="Criterios de aceptación">
                      {d.criteria.map((c) => <li key={c}>{c}</li>)}
                    </ul>
                  )}
                  <DeliverableStatus
                    status={d.status}
                    label={`Estado del entregable de ${s.objective || s.area}`}
                    onChange={(status) => {
                      void api.mentorPlanUpdateDeliverable({ id: plan.id, subplanId: s.id, status }).then(
                        (p) => {
                          onChanged(p);
                          announce(`Entregable en estado «${DELIVERABLE_LABEL[status]}».`);
                        },
                        (e: Error) => toast("error", e.message),
                      );
                    }}
                  />
                  {project ? (
                    <button type="button" onClick={() => void openProjectInProyectos(project.id)} className="mt-1.5 inline-flex min-h-8 items-center gap-1.5 text-[14px] text-accent-text underline-offset-2 hover:underline">
                      <ExternalLink size={14} aria-hidden /> Abrir en Proyectos: {project.name}
                    </button>
                  ) : (
                    <p className="mt-1.5 text-[13.5px] text-faint">Propuesta: aún no hay un proyecto enlazado. Créalo en el módulo Proyectos.</p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
