// Mentor — Plan, pestaña «Mi plan»: sus sub-vistas y la sub-barra de navegación que las elige.
//
// «Mi plan» ya no es una página larga con tabla de contenido: es una sub-barra (bajo la barra de pestañas) con TODAS las opciones y cada opción
// enseña SOLO su sección. Cada sub-vista es un componente propio y autocontenido, registrado en `planSectionsOf` (id, etiqueta, pista,
// visibilidad y render), para poder mejorarlas una a una sin tocar las demás. Los ids de ancla (`sec-<id>`) y los `data-testid` se mantienen.
//
// La sub-vista elegida se recuerda por plan (`planSectionKey`). Quien antes «saltaba a una sección» ahora llama a `openPlanSection`.

import { ArrowDown, PlusCircle } from "lucide-react";
import type { ReactNode } from "react";
import { usePersistedNav } from "../../store/navState";
import { splitNotes, tidyNotes } from "../../lib/planAreas";
import { periodLabel, weeksLabel } from "../../lib/planTime";
import { PRACTICE_NAME } from "../../lib/practiceTrack";
import type { MentorPlan as MentorPlanData, MentorPlanStatus } from "../../lib/types";
import { Chip, GhostButton } from "../common/forms";
import { cn } from "../ui";
import { AddAreaBar } from "./AddAreaBar";
import { AreaTopicsSection, TogetherBar } from "./AreaViews";
import { useAgendaModel } from "./agendaKit";
import { ExecutionAside } from "./ExecutionBar";
import { HandoffPanel } from "./HandoffPanel";
import { dayText, ProgressBar } from "./parts";
import { CoveragePanel, type CoverageState } from "./PlanCoverage";
import { ExecutionPanel } from "./PlanExecution";
import { PlanNotes, SectionCard, SectionHeading } from "./planKit";
import { PlanAreaTopics } from "./PlanAreaTopics";
import { routeStarted } from "../../lib/planTopicTime";
import { PlanRecords } from "./PlanRecords";
import { SubplanGroups } from "./PlanSubplans";
import { PACE_LABEL } from "./PlanForm";
import { practiceSummary } from "./PracticeCard";
import { cleanBranch, DAY_LONG, DAY_SHORT, num1, openPlanSection, planSectionKey, prepareTabKey, STATUS_COLOUR, STATUS_LABEL, type Loaded } from "./planShared";
import { deliverablesDefined } from "../../lib/planTopicsByArea";

/** Todo lo que necesita una sub-vista de «Mi plan». */
export interface PlanSectionCtx {
  data: Loaded;
  plan: MentorPlanData;
  state: MentorPlanStatus;
  summary: NonNullable<Loaded["derived"]>["summary"];
  highlight: Set<string>;
  cov: CoverageState;
  onChanged: (p: Loaded["plan"]) => void;
  onApplied: (p: MentorPlanData, changed: string[]) => void;
  onAddBranches: (names: string[]) => void;
  onOpenMonth: (month: string, firstDay: string) => void;
  onAskChange: (text: string) => void;
  announce: (msg: string) => void;
}

export interface PlanSection {
  /** id corto de la sub-vista (el ancla del DOM es `sec-<id>`) */
  id: string;
  label: string;
  /** dato corto junto a la etiqueta (un número) y su lectura para lector de pantalla */
  hint?: string;
  hintLabel?: string;
  visible: boolean;
  render: () => ReactNode;
  /** avisos que la Vista general enseña bajo el título (solo el Resumen los lleva) */
  notices?: () => ReactNode;
}

export const DEFAULT_SECTION = "resumen";
const anchor = "scroll-mt-40 outline-none";

// ── Aviso «Falta generar» (va dentro del Resumen) ──────────────────────

/** Aviso general: lo que todavía no existe y cómo generarlo. */
export function GenerateNotice({ topics, withPractice, withTheory, designPct, onGo }: { topics: number; withPractice: number; withTheory: number; designPct?: number; onGo: () => void }) {
  const missing = Math.max(0, topics - withPractice);
  const theoryMissing = Math.max(0, topics - withTheory);
  if (!missing && !theoryMissing) return null;
  return (
    <section aria-labelledby="gen-title" data-testid="generate-notice" className="rounded-2xl border-2 border-accent/60 bg-card p-4 @3xl:p-5">
      <h2 id="gen-title" className="text-[18px] font-semibold">Falta generar contenido</h2>
      <p className="mt-1 text-[14.5px] text-dim">
        El plan ya está armado, pero los archivos de práctica de sus temas todavía no existen en tu vault.{" "}
        {missing > 0 && <><strong className="text-text">{missing} de {topics} temas</strong> no tienen ejercicios.{" "}</>}
        {theoryMissing > 0 && <><strong className="text-text">{theoryMissing}</strong> no tienen teoría.{" "}</>}
        {designPct !== undefined && <>Diseño de los temas: {designPct} %. </>}
        Se crean con «Ejecutar plan»: primero muestra el informe exacto de lo que va a crear y no escribe nada hasta que confirmes.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <GhostButton large onClick={onGo} data-testid="generate-go">
          <ArrowDown size={16} aria-hidden /> Ir a «Ejecutar plan»
        </GhostButton>
        <span className="text-[13.5px] text-faint">La práctica diaria por área (katas) es otra capa y ya está creada.</span>
      </div>
    </section>
  );
}

// ── Lo que comparten varias sub-vistas ─────────────────────────────────

/** Alcance del plan: reglas de relleno, ramas excluidas y los textos del estudiante. */
function scopeOf(plan: MentorPlanData) {
  const pre = plan.preconditions;
  const excluded = pre?.branchExcluded?.map(cleanBranch) ?? [];
  const exclusionText =
    pre?.branchPreset === "fullstack"
      ? `Excluí ${excluded.join(" y ")} porque pediste full stack. Añádelos si los quieres.`
      : pre?.branchPreset === "backend" || pre?.branchPreset === "frontend"
        ? `Excluí ${excluded.join(", ")} porque tu pedido es de ${pre.branchPreset === "backend" ? "Backend" : "Frontend"}. Añádelos si los quieres.`
        : `Ramas fuera del plan: ${excluded.join(", ")}.`;
  const fallbacks = plan.subplans
    .map((s) => ({ s, fb: s.fallback ?? (splitNotes(s.notes).rulesFallback ? { kind: "rules" as const, reason: "no consta el motivo (el plan se generó antes de registrarlo)" } : null) }))
    .filter((x) => !!x.fb);
  const objective = pre?.freeObjective ? tidyNotes(pre.freeObjective) : "";
  const notes = pre?.notes ? tidyNotes(pre.notes) : "";
  const hasScope = fallbacks.length > 0 || excluded.length > 0 || !!plan.rationale || !!notes || !!objective;
  return { excluded, exclusionText, fallbacks, objective, notes, hasScope };
}

// ── Sub-vistas ─────────────────────────────────────────────────────────

/** Lo que pide atención en la Vista general, justo bajo el título: lo que falta generar, «todas las áreas desde el día 1» y «Añadir un área». */
function ResumenNotices({ plan, cov, onApplied, announce }: PlanSectionCtx) {
  const byAreas = plan.structure === "areas";
  const cov0 = cov.coverage?.totals;
  const needGenerate = !!cov0 && (cov0.practice < cov0.topics || cov0.theory < cov0.topics);
  return (
    <div className="space-y-3 empty:hidden" data-testid="plan-notices">
      {needGenerate && cov0 && (
        <div id="sec-generar" tabIndex={-1} className={anchor}>
          <GenerateNotice topics={cov0.topics} withPractice={cov0.practice} withTheory={cov0.theory} {...(cov0.design ? { designPct: cov0.design.avgScore } : {})} onGo={() => openPlanSection(plan.id, "ejecutar")} />
        </div>
      )}
      {byAreas && <TogetherBar plan={plan} onApplied={onApplied} announce={announce} />}
      {byAreas && <AddAreaBar plan={plan} onApplied={onApplied} announce={announce} />}
    </div>
  );
}

function ResumenView({ plan, state, summary }: PlanSectionCtx) {
  const byAreas = plan.structure === "areas";
  const countLabel = byAreas ? (summary.subplans === 1 ? "área" : "áreas") : summary.subplans === 1 ? "subplan" : "subplanes";
  const weeksText = state === "propuesto" ? `del ${dayText(plan.start)} al ${dayText(plan.end)}` : state === "activo" ? `semana ${summary.currentWeek} de ${summary.weeks}` : state === "futuro" ? `empieza el ${dayText(plan.start)}` : `terminó el ${dayText(plan.end)}`;
  return (
    <div className="space-y-6">
      <div id="sec-resumen" tabIndex={-1} className={cn(anchor, "space-y-3")}>
        <SectionCard labelledBy="mp-summary" testid="plan-header" className="space-y-3">
          <h2 id="mp-summary" className="sr-only">Resumen del plan</h2>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <Chip large colour={STATUS_COLOUR[state]}>{plan.proposed ? "Propuesto" : plan.archived ? "Archivado" : STATUS_LABEL[state]}</Chip>
            <p className="text-[16px] text-text" data-testid="plan-summary">
              <strong>{summary.subplans}</strong> {countLabel} · <strong>{summary.done}/{summary.topics}</strong> temas completados · <strong>{summary.pct} %</strong> global · {weeksText}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex-1"><ProgressBar pct={summary.pct} thick label="Avance global del plan" /></div>
            <span className="text-[18px] font-bold">{summary.pct} %</span>
          </div>
        </SectionCard>
      </div>
      <ExecutionAside planId={plan.id} />
    </div>
  );
}


function DatosView({ plan }: PlanSectionCtx) {
  const pre = plan.preconditions;
  const defined = deliverablesDefined(plan);
  const pending = defined ? (plan.openQuestions ?? []).filter((q) => q.id === "deliverables").length : 0;
  const facts: Array<{ label: string; value: ReactNode; hint?: string; testid?: string }> = [
    { label: "Periodo", value: periodLabel(plan.start, plan.end), hint: weeksLabel(Math.round(((Date.parse(plan.end) - Date.parse(plan.start)) / 86400000 + 1) / 7 * 10) / 10) },
  ];
  if (pre) {
    facts.push({ label: "Dedicación", value: `${num1(pre.minutesPerDay / 60)} h/día`, hint: pre.blockedDates?.length ? `${pre.blockedDates.length} fechas bloqueadas` : undefined });
    facts.push({
      label: "Días activos",
      value: (
        <ul className="flex flex-wrap gap-1" aria-label="Días de estudio">
          {DAY_SHORT.map((d, i) => {
            const on = pre.studyDays.includes(i + 1);
            return (
              <li key={d} className={cn("grid h-8 w-8 place-items-center rounded-md border text-[14px] font-semibold", on ? "border-accent bg-accent-soft text-accent-text" : "border-line text-faint")}>
                <span aria-hidden>{d}</span>
                <span className="sr-only">{DAY_LONG[i]}{on ? ", activo" : ", sin estudio"}</span>
              </li>
            );
          })}
        </ul>
      ),
      hint: `${pre.studyDays.length} ${pre.studyDays.length === 1 ? "día" : "días"} por semana`,
      testid: "plan-days",
    });
    facts.push({ label: "Ritmo", value: PACE_LABEL[pre.pace] });
  }
  if (plan.hoursPerWeek) facts.push({ label: "Carga semanal", value: `~${num1(plan.hoursPerWeek)} h/semana`, hint: plan.programmingPractice ? "para temas (la práctica va aparte)" : "efectivas" });
  if (pre) {
    facts.push(
      defined
        ? { label: "Entregables", value: pre.deliverables === "yes" ? "Sí" : pre.deliverables === "no" ? "Definidos" : "A discutir", hint: pending ? "1 decisión por tomar" : undefined, testid: "plan-deliverables-chip" }
        : { label: "Entregables", value: "Por definir", hint: "Se definen al ejecutar el plan", testid: "plan-deliverables-chip" },
    );
  }
  if (plan.programmingPractice) facts.push({ label: PRACTICE_NAME, value: "Activa", hint: practiceSummary(plan.programmingPractice), testid: "plan-practice-chip" });
  if (plan.areaMode) facts.push({ label: "Áreas", value: plan.areaMode === "together" ? "Juntas desde el día 1" : "Por fases", hint: plan.areaModeWhy, testid: "plan-area-mode-chip" });
  if (pre?.languages?.length) facts.push({ label: "Lenguajes a practicar", value: pre.languages.map((l) => ({ python: "Python", javascript: "JavaScript", typescript: "TypeScript" })[l.id]).join(" · "), hint: "Un bloque de práctica de lenguaje cada día", testid: "plan-languages-chip" });
  const skippedN = plan.subplans.reduce((n, s) => n + s.topics.filter((t) => t.route === "skipped").length, 0);
  if (skippedN) facts.push({ label: "Ruta", value: `${skippedN} ${skippedN === 1 ? "tema fuera de ruta" : "temas fuera de ruta"}`, hint: "No se borran: siguen en tus notas y puedes reactivarlos", testid: "plan-route-chip" });

  return (
    <section id="sec-datos" tabIndex={-1} className={anchor} aria-labelledby="mp-facts" data-testid="plan-preconditions">
      <SectionHeading id="mp-facts">Datos clave</SectionHeading>
      <dl className="grid gap-3 @xl:grid-cols-2 @3xl:grid-cols-3 @6xl:grid-cols-6">
        {facts.map((f) => (
          <div key={f.label} className="min-w-0 rounded-xl border border-line bg-card px-4 py-3" data-testid={f.testid}>
            <dt className="mb-1 text-[13px] font-semibold uppercase tracking-wide text-faint">{f.label}</dt>
            <dd className="text-[17px] font-semibold leading-snug text-text">{f.value}</dd>
            {f.hint && <dd className="mt-0.5 text-[13.5px] font-normal text-dim">{f.hint}</dd>}
          </div>
        ))}
      </dl>
    </section>
  );
}

function AlcanceView({ plan, onAddBranches }: PlanSectionCtx) {
  const { excluded, exclusionText, fallbacks, objective, notes } = scopeOf(plan);
  return (
    <div id="sec-alcance" tabIndex={-1} className={cn(anchor, "space-y-4")}>
      {fallbacks.length > 0 && (
        <section aria-labelledby="mp-fallback" className="rounded-2xl border border-line bg-card p-4 @3xl:p-5" data-testid="plan-fallback-note">
          <h2 id="mp-fallback" className="text-[18px] font-semibold">Completado con reglas <span className="text-[14px] font-normal text-dim">· informativo, no es un error</span></h2>
          <p className="mt-1 text-[14px] text-dim">Se aplica solo cuando la IA no pudo elegir los temas de un área (no estaba configurada, falló o se canceló): la app los ordena entonces según el orden natural de la materia, sin la selección del Mentor. El plan está completo igual. Si quieres que el Mentor lo reconsidere, pídeselo en «Preguntas y ajustes».</p>
          <ul className="mt-2 list-disc space-y-0.5 pl-5 text-[14px]">
            {fallbacks.map(({ s, fb }) => <li key={s.id}><span className="font-medium">{s.area}</span>: {fb!.reason}</li>)}
          </ul>
        </section>
      )}

      {(excluded.length > 0 || plan.rationale || notes || objective) && (
        <div className="grid items-start gap-4 @4xl:grid-cols-2 [&>*]:min-w-0">
          {excluded.length > 0 && (
            <section aria-labelledby="mp-excl" className="rounded-2xl border border-line bg-card p-4 @3xl:p-5" data-testid="plan-branch-note">
              <h2 id="mp-excl" className="text-[18px] font-semibold">Exclusiones del alcance</h2>
              <p className="mt-1 text-[14px] text-dim">{exclusionText}</p>
              <ul className="mt-3 flex flex-wrap gap-2" aria-label="Ramas fuera del plan">
                {excluded.map((b) => (
                  <li key={b}><Chip large colour="var(--nv-warn)">{b}</Chip></li>
                ))}
              </ul>
              <GhostButton large className="mt-3" onClick={() => onAddBranches(excluded)}>
                <PlusCircle size={16} aria-hidden /> Añadir {excluded.join(" y ")}
              </GhostButton>
            </section>
          )}
          {plan.rationale && (
            <section aria-labelledby="mp-comments" className="space-y-3 rounded-2xl border border-line bg-card p-4 @3xl:p-5">
              <h2 id="mp-comments" className="text-[18px] font-semibold">Comentario del Mentor</h2>
              <p className="text-[15px] leading-relaxed text-text" data-testid="plan-rationale">{plan.rationale}</p>
            </section>
          )}
          {(notes || objective) && (
            <section aria-labelledby="mp-yours" className="space-y-3 rounded-2xl border border-line bg-card p-4 @3xl:p-5" data-testid="plan-yours">
              <h2 id="mp-yours" className="text-[18px] font-semibold">Lo que pediste</h2>
              {objective && <PlanNotes notes={objective} auto={false} testid="plan-objective" title="Tu objetivo" />}
              {notes && <PlanNotes notes={notes} auto={!!plan.auto} testid="plan-notes" />}
            </section>
          )}
        </div>
      )}
    </div>
  );
}


function TemasPorAreaView(ctx: PlanSectionCtx) {
  const { data, plan, summary } = ctx;
  const agenda = useAgendaModel(data, plan);
  return (
    <div id="sec-temas" tabIndex={-1} className={cn(anchor, "space-y-6")}>
      <PlanAreaTopics plan={plan} progress={new Map([...agenda.topicByFolder].map(([f, t]) => [f, t.pct] as const))} schedule={agenda.schedule} today={agenda.today} started={routeStarted([...agenda.topicByFolder.values()].map((t) => t.state), plan.subplans.some((s) => s.topics.some((t) => t.completedAt)))} />
      <details data-testid="plan-weeks-by-area">
        <summary className="inline-flex min-h-9 cursor-pointer items-center text-[14px] text-accent-text">Ver el reparto por semanas y áreas</summary>
        <div className="mt-3"><AreaTopicsSection m={agenda} currentWeek={summary.currentWeek} /></div>
      </details>
      <details data-testid="plan-areas-detail">
        <summary className="inline-flex min-h-9 cursor-pointer items-center text-[14px] text-accent-text">Detalle de cada área: objetivo, metas enlazadas, grupos y proyecto</summary>
        <div className="mt-3"><AreasView {...ctx} /></div>
      </details>
    </div>
  );
}

/** «Resumen»: el centro de progreso + los datos clave del plan y, si lo hay, su alcance y comentarios (antes eran sub-vistas aparte). */
function ResumenCompletoView(ctx: PlanSectionCtx) {
  return (
    <div className="space-y-8" data-testid="plan-resumen-full">
      <ResumenView {...ctx} />
      <DatosView {...ctx} />
      {scopeOf(ctx.plan).hasScope && <AlcanceView {...ctx} />}
    </div>
  );
}

const PREPARE_TABS = [
  { id: "ejecutar", label: "Ejecutar plan", hint: "Crear lo que falta: teoría, mapas y ejercicios" },
  { id: "cobertura", label: "Cobertura", hint: "Qué tiene cada tema de la vault frente al plan" },
  { id: "antigravity", label: "Plan para Antigravity", hint: "Traspaso a otra IA de lo que falta por crear" },
] as const;

/** «Preparar»: lo técnico que no se usa para estudiar cada día (generar contenido, revisar cobertura, traspasar a otra IA), en una sola sub-vista. */
function PrepararView(ctx: PlanSectionCtx) {
  const [stored, setStored] = usePersistedNav<string>(prepareTabKey(ctx.plan.id), "ejecutar");
  // un enlace profundo antiguo («ejecutar», «cobertura», «antigravity») llega como la sub-vista recordada: manda hasta que se elija otra opción
  const [section, setSection] = usePersistedNav<string>(planSectionKey(ctx.plan.id), DEFAULT_SECTION);
  const deep = PREPARE_TABS.find((t) => t.id === section)?.id;
  const active = deep ?? PREPARE_TABS.find((t) => t.id === stored)?.id ?? "ejecutar";
  return (
    <div id="sec-preparar" tabIndex={-1} className={cn(anchor, "space-y-5")} data-testid="plan-prepare">
      <p className="text-[14px] text-dim">Lo que prepara el contenido del plan: verificar que no falten áreas ni temas (con la metodología de una nota por elemento o propiedad), crear lo que falta y traspasarlo a otra IA. Para estudiar no hace falta entrar aquí: está todo en «Ejecución».</p>
      <div role="group" aria-label="Qué preparar" className="inline-flex max-w-full flex-wrap gap-1 rounded-xl border border-line bg-card p-1">
        {PREPARE_TABS.map((t) => (
          <button key={t.id} type="button" aria-pressed={active === t.id} title={t.hint} onClick={() => { setStored(t.id); setSection("preparar"); }} data-testid={`prepare-${t.id}`} className={cn("inline-flex min-h-9 items-center rounded-lg px-3 text-[14px] font-medium", active === t.id ? "bg-accent text-white" : "text-dim hover:bg-hover hover:text-text")}>
            {t.label}
          </button>
        ))}
      </div>
      {active === "ejecutar" && <EjecutarView {...ctx} />}
      {active === "cobertura" && <CoberturaView {...ctx} />}
      {active === "antigravity" && <AntigravityView {...ctx} />}
    </div>
  );
}

function RegistrosView({ plan }: PlanSectionCtx) {
  return <div id="sec-registros" tabIndex={-1} className={anchor}><PlanRecords planId={plan.id} /></div>;
}

function CoberturaView({ plan, cov, onChanged, announce }: PlanSectionCtx) {
  return <div id="sec-cobertura" tabIndex={-1} className={anchor}><CoveragePanel plan={plan} cov={cov} onPlan={onChanged} announce={announce} /></div>;
}

function EjecutarView({ plan, cov, onChanged, announce }: PlanSectionCtx) {
  return <div id="sec-ejecutar" tabIndex={-1} className={anchor}><ExecutionPanel plan={plan} cov={cov} onPlan={onChanged} announce={announce} /></div>;
}

function AntigravityView({ plan, cov }: PlanSectionCtx) {
  return <div id="sec-antigravity" tabIndex={-1} className={anchor}><HandoffPanel planId={plan.id} aiConfigured={cov.aiConfigured} /></div>;
}

function AreasView({ data, plan, highlight, cov, onChanged, onAskChange }: PlanSectionCtx) {
  const byAreas = plan.structure === "areas";
  return (
    <section id="sec-areas" tabIndex={-1} className={anchor} aria-labelledby="mp-subplans" data-testid="plan-subplans">
      <SectionHeading id="mp-subplans" hint={byAreas ? "Cada tarjeta es un área con sus grupos internos (Bases, Lenguaje, Conocimientos): ábrela para ver su ruta de temas con el registro de completados, las metas enlazadas y el proyecto de área." : "Cada tarjeta resume un subplan: ábrela para ver sus semanas, sus temas con el registro de completados, las metas requeridas y el entregable."}>
        Áreas del plan <span className="text-[14px] font-normal text-dim">{plan.subplans.length} {plan.subplans.length === 1 ? (byAreas ? "área" : "subplan") : byAreas ? "áreas" : "subplanes"}</span>
      </SectionHeading>
      <SubplanGroups data={data} highlight={highlight} onChanged={onChanged} coverage={cov.coverage} review={cov.review} onAskChange={onAskChange} onReview={cov.setReview} />
    </section>
  );
}

// ── Registro ───────────────────────────────────────────────────────────

/** Las sub-vistas de «Mi plan», en el orden de la sub-barra (las no visibles se omiten). */
export function planSectionsOf(ctx: PlanSectionCtx): PlanSection[] {
  const { plan, cov } = ctx;
  const cov0 = cov.coverage?.totals;
  const missing = cov0 && (cov0.practice < cov0.topics || cov0.theory < cov0.topics) ? cov0.topics - cov0.practice : 0;
  const all: PlanSection[] = [
    { id: "resumen", label: "Resumen", visible: true, ...(missing > 0 ? { hint: String(missing), hintLabel: `${missing} sin ejercicios: falta generar` } : {}), render: () => <ResumenCompletoView {...ctx} />, notices: () => <ResumenNotices {...ctx} /> },
    { id: "temas", label: "Temas por área", visible: true, hint: String(plan.subplans.length), hintLabel: `${plan.subplans.length} ${plan.subplans.length === 1 ? "área" : "áreas"}`, render: () => <TemasPorAreaView {...ctx} /> },
    { id: "registros", label: "Registros", visible: true, render: () => <RegistrosView {...ctx} /> },
    { id: "preparar", label: "Preparar", visible: true, render: () => <PrepararView {...ctx} /> },
  ];
  return all.filter((s) => s.visible);
}

/** Las sub-vistas que se fundieron en otras siguen abriéndose con su id antiguo (enlaces profundos y lo recordado por plan). */
const SECTION_ALIAS: Record<string, string> = { datos: "resumen", alcance: "resumen", catalogo: "temas", areas: "temas", fases: "resumen", ejecutar: "preparar", cobertura: "preparar", antigravity: "preparar" };
export const sectionAlias = (id: string): string => SECTION_ALIAS[id] ?? id;

/** La sub-vista a enseñar: la guardada si existe y es visible; si no, el Resumen. */
export function activeSectionOf(sections: ReadonlyArray<PlanSection>, stored: string): PlanSection {
  const raw = stored.replace(/^sec-/, "");
  return sections.find((s) => s.id === raw) ?? sections.find((s) => s.id === sectionAlias(raw)) ?? sections.find((s) => s.id === DEFAULT_SECTION) ?? sections[0]!;
}

// ── Sub-barra ──────────────────────────────────────────────────────────

/** La sub-barra: todas las opciones, la activa marcada con `aria-current`. Se desplaza en horizontal en anchos estrechos. */
export function PlanSubNav({ sections, active, onSelect }: { sections: ReadonlyArray<PlanSection>; active: string; onSelect: (id: string) => void }) {
  return (
    <nav aria-label="Secciones de Mi plan" data-testid="plan-subnav" className="min-w-0 text-[14px]">
      <ul className="flex gap-1 overflow-x-auto py-1.5">
        {sections.map((s) => {
          const on = s.id === active;
          return (
            <li key={s.id} className="flex-none">
              <button
                type="button"
                onClick={() => onSelect(s.id)}
                aria-current={on ? "page" : undefined}
                aria-pressed={on}
                className={cn(
                  "inline-flex min-h-9 items-center gap-1.5 whitespace-nowrap rounded-lg border px-3 text-[14px] font-medium transition-colors",
                  on ? "border-accent bg-accent-soft text-accent-text" : "border-transparent text-dim hover:bg-hover hover:text-text",
                )}
                data-testid={`subnav-${s.id}`}
              >
                {s.label}
                {s.hint && (
                  <span className="rounded-md bg-hover px-1.5 text-[12px] text-dim">
                    <span aria-hidden>{s.hint}</span>
                    <span className="sr-only"> ({s.hintLabel ?? s.hint})</span>
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
