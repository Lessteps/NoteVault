// Mentor — Plan, pestaña «Entregables»: archivos prácticos que demuestran habilidad. Los de práctica (el kata de cada día, el proyecto semanal y
// el mensual) nacen del sistema de Programming practice y los proyectos de cada área los propone la IA. Aquí:
//  · UNA sola pregunta global («¿quieres un entregable por cada área?») con excepciones por área (en planes antiguos, una por subplan);
//  · los proyectos de área (añadir / quitar uno concreto);
//  · la AGENDA de entregables con filtros por área, tipo y fecha, su estado (hecho / pendiente, derivado de la práctica o anotado a mano) y
//    los archivos de cada uno.
// Las respuestas van a `mentor_plan_answer` y los estados a `mentor_plan_update_deliverable`.

import { Check, ExternalLink, Plus, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { api } from "../../lib/bridge";
import { addDays, daysBetween } from "../../lib/planTime";
import { PLAN_DELIVERABLE_STATUSES, type PlanDeliverable, type PlanDeliverableKind, type PlanDeliverableStatus } from "../../lib/planAreas";
import { countDeliverables, dateLabel, deliverableInArea, deliverablesText } from "../../lib/planSchedule";
import type { MentorPlan } from "../../lib/types";
import { useApp } from "../../store/app";
import { useMentor } from "../../store/mentor";
import { Chip, GhostButton, input, PrimaryButton } from "../common/forms";
import { cn, confirmAction } from "../ui";
import { AreaCounts, doneText, DSTATUS_LABEL, plural, KIND_COLOUR, KIND_LABEL, StatusChip, useAgendaModel } from "./agendaKit";
import { DELIVERABLES_PENDING_TEXT } from "../../lib/planTopicsByArea";
import { SectionHeading } from "./planKit";
import { openPractice } from "./PracticeCard";
import { branchOf, openProjectInProyectos, type Loaded } from "./planShared";

type Answer = "yes" | "no";
const PAGE = 25;
const RANGES = [
  { id: "mes", label: "Este mes" },
  { id: "semana", label: "Esta semana" },
  { id: "proximos", label: "Próximos 30 días" },
  { id: "atrasados", label: "Atrasados" },
  { id: "todo", label: "Todo el plan" },
] as const;
type RangeId = (typeof RANGES)[number]["id"];
const KINDS: Array<{ id: "" | PlanDeliverableKind; label: string }> = [
  { id: "", label: "Todos los tipos" },
  { id: "kata", label: "Katas" },
  { id: "daily_project", label: "Proyectos diarios" },
  { id: "topic_project", label: "Proyectos de tema" },
  { id: "weekly_project", label: "Proyectos semanales" },
  { id: "monthly_project", label: "Proyectos mensuales" },
  { id: "area_project", label: "Proyectos de área" },
];

function rangeBounds(id: RangeId, today: string, plan: { start: string; end: string }): { from: string; to: string } {
  const t = today < plan.start ? plan.start : today > plan.end ? plan.end : today;
  if (id === "semana") {
    const w = Math.floor(daysBetween(plan.start, t) / 7);
    return { from: addDays(plan.start, w * 7), to: addDays(plan.start, w * 7 + 6) };
  }
  if (id === "mes") {
    const first = `${t.slice(0, 7)}-01`;
    const last = new Date(Date.UTC(Number(t.slice(0, 4)), Number(t.slice(5, 7)), 0)).getUTCDate();
    return { from: first, to: `${t.slice(0, 7)}-${String(last).padStart(2, "0")}` };
  }
  if (id === "proximos") return { from: t, to: addDays(t, 30) };
  if (id === "atrasados") return { from: plan.start, to: addDays(today, -1) };
  return { from: plan.start, to: plan.end };
}

export function PlanDeliverables({ data, onChanged, announce, goTab }: { data: Loaded; onChanged: (p: MentorPlan) => void; announce: (msg: string) => void; goTab: (tab: "cambios") => void }) {
  const toast = useApp((s) => s.toast);
  const plan = data.plan!;
  const m = useAgendaModel(data, plan);
  const pendingQs = (plan.openQuestions ?? []).filter((q) => q.id === "deliverables");
  const globalQ = pendingQs.find((q) => !q.subplanId);
  const legacyQs = pendingQs.filter((q) => !!q.subplanId);
  const [deferred, setDeferred] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  // la fila (o el bloque) que se acaba de responder desaparece: el foco pasa al título para no perderse
  const head = useRef<HTMLDivElement>(null);
  const refocus = () => setTimeout(() => head.current?.focus(), 0);
  const subOf = (id: string | undefined) => plan.subplans.find((s) => s.id === id);
  const withDeliverable = plan.subplans.filter((s) => s.deliverable);
  const byAreas = plan.structure === "areas";
  const counts = countDeliverables(m.deliverables);

  const bump = () => useMentor.setState((s) => ({ planVersion: s.planVersion + 1 }));
  const answerOne = async (subplanId: string | undefined, answer: Answer) => {
    setBusy(subplanId ?? "all");
    try {
      onChanged(await api.mentorPlanAnswer({ id: plan.id, ...(subplanId ? { subplanId } : {}), answer }));
      bump();
      announce(answer === "yes" ? "Entregable añadido." : "Entregable descartado.");
      refocus();
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const answerGlobal = async (answer: Answer) => {
    const n = plan.subplans.filter((s) => !s.deliverable).length;
    const ok = await confirmAction(
      answer === "yes" ? "Añadir un entregable por área" : "No quiero ningún entregable de área",
      answer === "yes"
        ? `Se añadirá a cada una de las ${n} áreas sin entregable un proyecto propio de esa área (estado «Pendiente»). Después puedes quitarlo en un área concreta o pedir cambios al Mentor.`
        : "Se descartará la pregunta: ningún área tendrá proyecto propio. Los katas y proyectos de práctica no cambian. Si cambias de idea, añádelo después en un área o pídelo en «Preguntas y ajustes».",
      answer === "yes" ? "Añadir a todas" : "No quiero ninguno",
      answer === "no",
    );
    if (ok) await answerOne(undefined, answer);
  };
  const answerAllLegacy = async (answer: Answer) => {
    const n = legacyQs.length;
    const ok = await confirmAction(
      answer === "yes" ? "Añadir un entregable a todos" : "No quiero ningún entregable",
      answer === "yes" ? `Se añadirá la propuesta de entregable a los ${n} subplanes que siguen por decidir.` : `Se descartarán las ${n} decisiones pendientes.`,
      answer === "yes" ? "Añadir a todos" : "No quiero ninguno",
      answer === "no",
    );
    if (!ok) return;
    let done = 0;
    try {
      for (const q of legacyQs) {
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
  const toggleArea = async (subplanId: string, enabled: boolean) => {
    setBusy(subplanId);
    try {
      onChanged(await api.mentorPlanAreaDeliverable({ id: plan.id, subplanId, enabled }));
      bump();
      announce(enabled ? "Entregable de área añadido." : "Entregable de área quitado.");
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const later = () => {
    setDeferred(true);
    refocus();
    announce(`Decidirás después: quedan ${pendingQs.length} ${pendingQs.length === 1 ? "decisión pendiente" : "decisiones pendientes"} en el plan.`);
  };

  // Los entregables dependen del sistema de práctica y de los proyectos que se definen al EJECUTAR el plan: mientras no haya ninguno definido
  // no se eligen ni se «discuten» aquí (ni siquiera una decisión antigua pendiente se ofrece): se enseña un estado claro.
  if (!m.deliverablesDefined) {
    return (
      <section aria-labelledby="dl-title" data-testid="plan-deliverables-pending" className="space-y-3">
        <SectionHeading id="dl-title" hint="Archivos prácticos que demuestran habilidad: katas, proyectos diarios, semanales, mensuales y de área.">
          Entregables
        </SectionHeading>
        <div className="rounded-2xl border border-dashed border-line-strong bg-card p-4 @3xl:p-5">
          <p className="flex flex-wrap items-center gap-2 text-[16px] font-semibold">
            Aún sin definir <Chip large colour="var(--nv-faint)">Por definir</Chip>
          </p>
          <p className="mt-1 text-[15px] text-text" data-testid="plan-deliverables-pending-text">{DELIVERABLES_PENDING_TEXT}</p>
          <p className="mt-1.5 text-[14px] text-dim">
            Los entregables nacen del sistema de práctica de cada área y de los proyectos que se definen cuando el plan se ejecuta, así que no se eligen al crear el plan. Hasta entonces la Agenda no cuenta entregables: solo enseña los proyectos propuestos de cada día.
          </p>
          <GhostButton large className="mt-3" onClick={() => goTab("cambios")} data-testid="plan-deliverables-ask">
            Pedirlos en «Preguntas y ajustes»
          </GhostButton>
        </div>
      </section>
    );
  }

  return (
    <>
      <div ref={head} tabIndex={-1} className="outline-none" data-testid="plan-deliverables-summary">
        <AreaCounts plan={plan} list={m.deliverables} testid="area-counts-plan" />
        <SectionHeading id="dl-title" hint={`${deliverablesText(counts.total)} · ${doneText(counts.done)} · ${plural(counts.pending, "pendiente", "pendientes")}${pendingQs.length ? ` · ${pendingQs.length === 1 && globalQ ? "1 decisión por tomar" : `${pendingQs.length} decisiones por tomar`}` : ""}.`}>
          Entregables
        </SectionHeading>
      </div>

      {pendingQs.length > 0 && (
        <section aria-labelledby="dl-pending" className="rounded-2xl border border-dashed border-line-strong bg-card p-4 @3xl:p-5" data-testid="plan-open-questions">
          <h3 id="dl-pending" className="flex flex-wrap items-center gap-2 text-[16px] font-semibold">
            Por decidir <Chip large colour="var(--nv-warn)">{pendingQs.length} {pendingQs.length === 1 ? "pendiente" : "pendientes"}</Chip>
          </h3>
          {globalQ && (
            <>
              <p className="mt-1 text-[15px] font-medium" data-testid="plan-global-question">{globalQ.text}</p>
              <p className="mt-0.5 text-[14px] text-dim">Es un proyecto de demostración al final de cada área. Los katas y los proyectos de práctica salen siempre de Programming practice. Lo que dejes sin responder se queda pendiente.</p>
            </>
          )}
          {!globalQ && <p className="mt-1 text-[14px] text-dim">Un entregable es un proyecto de demostración al final del subplan. El plan no añade ninguno hasta que lo decidas.</p>}

          {deferred ? (
            <p className="mt-3 flex flex-wrap items-center gap-3 text-[14px]" data-testid="plan-open-deferred">
              Lo decidirás después. <GhostButton onClick={() => setDeferred(false)}>Revisar {pendingQs.length === 1 ? "la decisión" : `las ${pendingQs.length} decisiones`}</GhostButton>
            </p>
          ) : (
            <>
              <div className="mt-3 flex flex-wrap items-center gap-2" role="group" aria-label={globalQ ? "Responder para todas las áreas" : "Acciones para todos los subplanes"}>
                <PrimaryButton large disabled={!!busy} onClick={() => void (globalQ ? answerGlobal("yes") : answerAllLegacy("yes"))}>
                  <Check size={16} aria-hidden /> {globalQ ? "Añadir a todas las áreas" : "Añadir a todos"}
                </PrimaryButton>
                <GhostButton large disabled={!!busy} onClick={() => void (globalQ ? answerGlobal("no") : answerAllLegacy("no"))}>
                  <X size={16} aria-hidden /> No quiero ninguno
                </GhostButton>
                <GhostButton large disabled={!!busy} onClick={later}>Decidir después</GhostButton>
                {busy && /\d+\/\d+/.test(busy) && <span role="status" className="text-[14px] text-dim">Aplicando {busy}…</span>}
              </div>
              {globalQ && <p className="mt-2 text-[13.5px] text-dim">¿Excepciones? Añade o quita el proyecto de un área concreta más abajo, en «Proyectos de área».</p>}
              {legacyQs.length > 0 && (
                <ul className="mt-4 divide-y divide-line rounded-xl border border-line" aria-label="Decisiones pendientes por subplan">
                  {legacyQs.map((q) => {
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
                        <GhostButton large="md" disabled={!!busy} aria-label={`Añadir entregable a ${title}`} onClick={() => void answerOne(q.subplanId, "yes")}>Añadir entregable</GhostButton>
                        <GhostButton large="md" disabled={!!busy} aria-label={`No quiero entregable en ${title}`} onClick={() => void answerOne(q.subplanId, "no")}>No lo quiero</GhostButton>
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          )}
        </section>
      )}

      <section aria-labelledby="dl-areas" data-testid="plan-deliverables-defined">
        <h3 id="dl-areas" className="mb-2 text-[16px] font-semibold">{byAreas ? "Proyectos de área" : "Entregables por subplan"} <span className="text-[14px] font-normal text-dim">{withDeliverable.length} de {plan.subplans.length}</span></h3>
        <ul className="grid items-start gap-3 @3xl:grid-cols-2">
          {plan.subplans.map((s) => {
            const d = s.deliverable;
            const project = d?.projectId ? data.projects[d.projectId] : undefined;
            const name = byAreas ? s.area : s.objective || s.area;
            return (
              <li key={s.id} className="rounded-xl border border-line bg-card p-4" data-testid="plan-deliverable-card">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="min-w-0 flex-1 text-[13px] font-medium uppercase tracking-wide text-faint">{name}</span>
                  {d ? (
                    <GhostButton large="md" disabled={!!busy || d.status !== "idea"} title={d.status !== "idea" ? "Ya está en marcha: cambia su estado en la lista de abajo" : undefined} aria-label={`Quitar el entregable de ${name}`} onClick={() => void toggleArea(s.id, false)}>Quitar</GhostButton>
                  ) : (
                    <GhostButton large="md" disabled={!!busy} aria-label={`Añadir entregable a ${name}`} onClick={() => void toggleArea(s.id, true)}><Plus size={15} aria-hidden /> Añadir proyecto</GhostButton>
                  )}
                </div>
                {d ? (
                  <>
                    <h4 className="mt-0.5 flex flex-wrap items-center gap-2 text-[15px] font-semibold">
                      {d.title}
                      <StatusChip status={d.status === "idea" ? "pendiente" : d.status} />
                    </h4>
                    {d.description && <p className="mt-1 text-[14px] text-dim">{d.description}</p>}
                    {d.criteria.length > 0 && (
                      <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[14px] text-dim" aria-label="Criterios de aceptación">
                        {d.criteria.map((c) => <li key={c}>{c}</li>)}
                      </ul>
                    )}
                    {project ? (
                      <button type="button" onClick={() => void openProjectInProyectos(project.id)} className="mt-1.5 inline-flex min-h-8 items-center gap-1.5 text-[14px] text-accent-text underline-offset-2 hover:underline">
                        <ExternalLink size={14} aria-hidden /> Abrir en Proyectos: {project.name}
                      </button>
                    ) : (
                      <p className="mt-1.5 text-[13.5px] text-faint">Propuesta: aún no hay un proyecto enlazado. Créalo en el módulo Proyectos.</p>
                    )}
                  </>
                ) : (
                  <p className="mt-1 text-[14px] text-dim">Sin proyecto de área.{plan.openQuestions?.some((q) => q.id === "deliverables") ? " Pendiente de decidir arriba." : ""}</p>
                )}
              </li>
            );
          })}
        </ul>
        {withDeliverable.length === 0 && (
          <p className="mt-3 rounded-xl border border-dashed border-line p-4 text-[14px] text-dim" data-testid="plan-deliverables-empty">
            Este plan aún no tiene proyectos de área.{" "}
            <button type="button" onClick={() => goTab("cambios")} className="inline-flex min-h-8 items-center text-accent-text underline underline-offset-2">Pídele uno al Mentor en «Preguntas y ajustes»</button>
          </p>
        )}
      </section>

      <AgendaDeliverables m={m} plan={plan} today={data.today} onChanged={onChanged} announce={announce} />
    </>
  );
}

/** La agenda de entregables: filtros por área, tipo y fecha; estado editable y archivos. */
function AgendaDeliverables({ m, plan, today, onChanged, announce }: { m: ReturnType<typeof useAgendaModel>; plan: MentorPlan; today: string; onChanged: (p: MentorPlan) => void; announce: (msg: string) => void }) {
  const toast = useApp((s) => s.toast);
  const [range, setRange] = useState<RangeId>("mes");
  const initial = rangeBounds("mes", today, plan);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [kind, setKind] = useState<"" | PlanDeliverableKind>("");
  const [area, setArea] = useState("");
  const [shown, setShown] = useState(PAGE);
  const pickRange = (id: RangeId) => {
    setRange(id);
    const b = rangeBounds(id, today, plan);
    setFrom(b.from);
    setTo(b.to);
    setShown(PAGE);
  };
  const areas = plan.subplans.filter((s) => s.areaId);
  const list = useMemo(
    () => m.deliverables.filter((d) => d.dueDate >= from && d.dueDate <= to && (!kind || d.kind === kind) && (!area || (area === "practice" ? !d.areaId : deliverableInArea(d, area)))),
    [m.deliverables, from, to, kind, area],
  );
  const counts = countDeliverables(list);
  const update = async (d: PlanDeliverable, status: PlanDeliverableStatus, files?: Array<{ path?: string; note: string }>) => {
    try {
      onChanged(await api.mentorPlanUpdateDeliverable({ id: plan.id, deliverableId: d.id, status, ...(files ? { files } : {}) }));
      announce(`«${d.title}»: ${DSTATUS_LABEL[status].toLowerCase()}.`);
    } catch (e) {
      toast("error", (e as Error).message);
    }
  };
  return (
    <section aria-labelledby="dl-agenda" data-testid="plan-deliverables-agenda">
      <h3 id="dl-agenda" className="mb-2 text-[16px] font-semibold">Agenda de entregables</h3>
      <div role="group" aria-label="Filtros de entregables" className="mb-3 flex flex-wrap items-end gap-3 rounded-xl border border-line bg-card px-3 py-3" data-testid="deliverable-filters">
        <label className="text-[14px] text-dim">
          Periodo
          <select value={range} onChange={(e) => pickRange(e.target.value as RangeId)} aria-label="Periodo" className="mt-0.5 block min-h-11 rounded-lg border border-line bg-surface px-2.5 text-[14px] text-text">
            {RANGES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
        </label>
        <label className="text-[14px] text-dim">
          Desde
          <input type="date" value={from} min={plan.start} max={plan.end} onChange={(e) => e.target.value && (setFrom(e.target.value), setShown(PAGE))} aria-label="Desde" className="mt-0.5 block min-h-11 rounded-lg border border-line bg-surface px-2.5 text-[14px] text-text" />
        </label>
        <label className="text-[14px] text-dim">
          Hasta
          <input type="date" value={to} min={plan.start} max={plan.end} onChange={(e) => e.target.value && (setTo(e.target.value), setShown(PAGE))} aria-label="Hasta" className="mt-0.5 block min-h-11 rounded-lg border border-line bg-surface px-2.5 text-[14px] text-text" />
        </label>
        <label className="text-[14px] text-dim">
          Tipo
          <select value={kind} onChange={(e) => { setKind(e.target.value as "" | PlanDeliverableKind); setShown(PAGE); }} aria-label="Tipo" className="mt-0.5 block min-h-11 rounded-lg border border-line bg-surface px-2.5 text-[14px] text-text">
            {KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
          </select>
        </label>
        <label className="text-[14px] text-dim">
          Área
          <select value={area} onChange={(e) => { setArea(e.target.value); setShown(PAGE); }} aria-label="Área" className="mt-0.5 block min-h-11 rounded-lg border border-line bg-surface px-2.5 text-[14px] text-text">
            <option value="">Todas las áreas</option>
            {areas.map((s) => <option key={s.areaId} value={s.areaId}>{s.area}</option>)}
            <option value="all">Integradores (varias áreas)</option>
            <option value="practice">Práctica (katas)</option>
          </select>
        </label>
      </div>
      <p role="status" aria-live="polite" className="mb-2 text-[14px] text-dim" data-testid="deliverable-count">
        {deliverablesText(counts.total)} · {doneText(counts.done)} · {plural(counts.pending, "pendiente", "pendientes")}
        <AreaCounts plan={plan} list={list} testid="area-counts-filtered" />
      </p>
      {list.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line p-4 text-[14px] text-dim" data-testid="deliverable-empty">No hay entregables con esos filtros.</p>
      ) : (
        <ul className="space-y-2">
          {list.slice(0, shown).map((d) => <DeliverableRow key={d.id} d={d} onStatus={(s) => void update(d, s)} onFiles={(files) => void update(d, d.status, files)} />)}
        </ul>
      )}
      {list.length > shown && (
        <GhostButton large="md" className="mt-2" onClick={() => setShown((n) => n + PAGE)}>
          Mostrar {Math.min(PAGE, list.length - shown)} más <span className="text-faint">({list.length - shown} sin mostrar)</span>
        </GhostButton>
      )}
    </section>
  );
}

function DeliverableRow({ d, onStatus, onFiles }: { d: PlanDeliverable; onStatus: (s: PlanDeliverableStatus) => void; onFiles: (files: Array<{ path?: string; note: string }>) => void }) {
  const [adding, setAdding] = useState(false);
  const [note, setNote] = useState("");
  const [path, setPath] = useState("");
  const files = d.files ?? [];
  return (
    <li className="rounded-xl border border-line bg-card p-3.5" data-testid="deliverable-row">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <span className="min-w-0 flex-1 basis-56 text-[15px] font-semibold">{d.title}</span>
        <Chip large colour={KIND_COLOUR[d.kind]}>{KIND_LABEL[d.kind]}</Chip>
        <span className="text-[13.5px] text-dim">para el {dateLabel(d.dueDate)}</span>
        <StatusChip status={d.status} />
      </div>
      {d.description && <p className="mt-1 text-[14px] text-dim">{d.description}</p>}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-[14px] text-dim">
          Estado
          <select value={d.status} aria-label={`Estado de ${d.title}`} onChange={(e) => onStatus(e.target.value as PlanDeliverableStatus)} className="min-h-9 rounded-lg border border-line bg-surface px-2.5 py-1 text-[14px] text-text">
            {PLAN_DELIVERABLE_STATUSES.map((s) => <option key={s} value={s}>{DSTATUS_LABEL[s]}</option>)}
          </select>
        </label>
        {d.source === "practice" && <GhostButton onClick={openPractice} aria-label={`Abrir práctica: ${d.title}`}>Abrir práctica</GhostButton>}
        <GhostButton onClick={() => setAdding((v) => !v)} aria-expanded={adding} aria-label={`Añadir archivo a ${d.title}`}><Plus size={14} aria-hidden /> Archivo</GhostButton>
      </div>
      {files.length > 0 && (
        <ul className="mt-2 space-y-1 text-[14px]" aria-label={`Archivos de ${d.title}`}>
          {files.map((f, i) => (
            <li key={`${f.path ?? ""}${f.note}${i}`} className="flex flex-wrap items-center gap-x-2">
              <span className="font-medium">{f.path ?? "Archivo"}</span>
              {f.note && <span className="text-dim">{f.note}</span>}
              <button type="button" className="ml-auto inline-flex min-h-8 items-center px-2 text-accent-text underline-offset-2 hover:underline" aria-label={`Quitar archivo ${f.path ?? f.note}`} onClick={() => onFiles(files.filter((_, j) => j !== i))}>Quitar</button>
            </li>
          ))}
        </ul>
      )}
      {adding && (
        <form
          className="mt-2 flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!note.trim() && !path.trim()) return;
            onFiles([...files, { ...(path.trim() ? { path: path.trim() } : {}), note: note.trim() }]);
            setNote("");
            setPath("");
            setAdding(false);
          }}
        >
          <label className="text-[14px] text-dim">Ruta del archivo (opcional)<input value={path} onChange={(e) => setPath(e.target.value)} className={cn(input, "mt-0.5 min-h-10")} /></label>
          <label className="text-[14px] text-dim">Nota<input value={note} onChange={(e) => setNote(e.target.value)} className={cn(input, "mt-0.5 min-h-10")} /></label>
          <PrimaryButton type="submit" large>Guardar archivo</PrimaryButton>
        </form>
      )}
    </li>
  );
}

