// Mentor — Plan: las ÁREAS del plan (Backend, Frontend, Databases, Automation, Tooling and Quality) como TARJETAS.
//
// Plan por áreas: cada tarjeta de área muestra su avance, su cobertura de notas y práctica y sus grupos internos. Al abrirla, los grupos
// (Bases · Lenguaje · Conocimientos) son a su vez tarjetas con su nº de temas, completados, horas, cobertura y rango de semanas y meses;
// al desplegar un grupo, sus temas aparecen como TARJETAS COMPACTAS en rejilla (título, estado con icono y texto, semana, % y «Ver tema»),
// con filtro rápido y «Mostrar N más». Debajo: el detalle de cobertura (faltantes accionables y lo que sugirió el Mentor), la práctica
// del área, las semanas, las metas y el entregable. Si Bases es demasiado grande se avisa con un enlace a «Pedir cambios» pre-rellenado.
//
// Plan de estructura antigua (un subplan por rama): la lista de temas por grupos de siempre (con «Mostrar N más»).

import { ChevronRight, ExternalLink, Flame, Info, Layers, MessageSquareText, Scissors, Search, TriangleAlert, Undo2 } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { api } from "../../lib/bridge";
import { splitNotes } from "../../lib/planAreas";
import type { CoverageReview, GroupCoverage, PlanCoverage } from "../../lib/planCoverage";
import { BASES_LIMIT, basesWarning, groupSummaries, monthShort, weeksText, type BasesWarning, type GroupSummary } from "../../lib/planMonths";
import { reduceToEssentials, type RouteTopic } from "../../lib/planRoute";
import { shortWeekLabel } from "../../lib/planTime";
import type { MentorDeliverableStatus, MentorPlan, MentorSubplan, MentorSubplanView, MentorTopicView } from "../../lib/types";
import { useApp } from "../../store/app";
import { useMentor } from "../../store/mentor";
import { Chip, GhostButton, input } from "../common/forms";
import { cn, confirmAction } from "../ui";
import { openGoalInMetas } from "./MentorGoals";
import { openTopic } from "./openTopic";
import { dayText, hm, ProgressBar } from "./parts";
import { AreaCoverageDetail, CoverageLine } from "./PlanCoverage";
import {
  branchOf,
  DELIVERABLE_COLOUR,
  DELIVERABLE_LABEL,
  PALETTE,
  STATE_COLOUR,
  STATE_GLYPH,
  STATE_LABEL,
  openProjectInProyectos,
  type Loaded,
} from "./planShared";

const TOPICS_PAGE = 15;
/** temas por tanda en la rejilla de un grupo */
const GRID_PAGE = 24;
/** a partir de cuántos temas se ofrece el filtro rápido */
const FILTER_FROM = 12;

/** Semanas en que dos áreas coinciden (para «en paralelo con X»). */
const overlaps = (a: MentorSubplan, b: MentorSubplan): boolean =>
  !!a.phase && !!b.phase && a.phase.fromWeek <= b.phase.toWeek && b.phase.fromWeek <= a.phase.toWeek;

const isDone = (t: MentorTopicView): boolean => t.state === "completo" || !!t.completedAt;

/** Qué es cada bloque de un área (la línea de ayuda de su tarjeta de grupo). */
const KIND_HELP: Record<GroupSummary["kind"], string> = {
  bases: "Fundamentos comunes de programación que el área necesita (lógica, datos, memoria…).",
  language: "El lenguaje con el que aplicas el área.",
  knowledge: "Lo propio del área: sus técnicas, protocolos y herramientas.",
  other: "Temas del área sin grupo asignado.",
};
const KIND_LABEL: Record<GroupSummary["kind"], string> = { bases: "Bases", language: "Lenguaje", knowledge: "Conocimientos", other: "Otros" };

export interface AreaExtras {
  coverage?: PlanCoverage | null;
  review?: CoverageReview | null;
  /** abre «Pedir cambios» con un texto pre-rellenado (no envía nada) */
  onAskChange?: (text: string) => void;
  /** la revisión de cobertura guardada cambió (faltante añadido a la propuesta) */
  onReview?: (r: CoverageReview) => void;
}

/** Las áreas del plan en una rejilla de tarjetas (organizadas por área de vida o por áreas elementales). */
export function SubplanGroups({ data, highlight, onChanged, coverage, review, onAskChange, onReview }: { data: Loaded; highlight: Set<string>; onChanged: (p: Loaded["plan"]) => void } & AreaExtras) {
  const plan = data.plan!;
  const derived = data.derived!;
  const [open, setOpen] = useState<Set<string>>(new Set());

  const toggle = (id: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const byAreas = plan.structure === "areas";
  const areas = byAreas ? [""] : [...new Set(plan.subplans.map((s) => s.area))];
  const several = !byAreas && areas.length > 1;

  return (
    <div className="space-y-6">
      {areas.map((area, idx) => {
        const subs = byAreas ? plan.subplans : plan.subplans.filter((s) => s.area === area);
        const views = subs.map(
          (s) =>
            derived.subplans.find((v) => v.id === s.id) ?? {
              id: s.id,
              total: s.topics.length,
              done: 0,
              pct: 0,
              currentWeek: derived.summary.currentWeek,
              topics: s.topics.map((t) => ({ ...t, state: "sin_tratar" as const, pct: 0, found: false })),
            },
        );
        const topics = views.reduce((n, v) => n + v.total, 0);
        const done = views.reduce((n, v) => n + v.done, 0);

        return (
          <section key={area || "areas"} aria-label={several ? area : undefined} data-testid="area-group">
            {several && (
              <h3 className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[16px] font-semibold text-text">
                <span aria-hidden className="inline-block h-3 w-3 rounded-sm" style={{ background: PALETTE[idx % PALETTE.length] }} />
                {area}
                <span className="text-[14px] font-normal text-dim">
                  {subs.length} {subs.length === 1 ? "subplan" : "subplanes"} · {done}/{topics} temas
                </span>
              </h3>
            )}
            <ul
              className="grid items-start gap-4 @3xl:grid-cols-2 @6xl:grid-cols-3"
              aria-label={byAreas ? "Áreas del plan" : several ? `Subplanes de ${area}` : "Subplanes"}
            >
              {subs.map((s, i) => {
                const isOpen = open.has(s.id) || s.topics.some((t) => highlight.has(t.folder));
                const colour = PALETTE[(byAreas ? plan.subplans.indexOf(s) : idx) % PALETTE.length]!;
                return (
                  <li key={s.id} className={cn("min-w-0", isOpen && "@3xl:col-span-full @6xl:col-span-full")}>
                    <SubplanCard
                      plan={plan}
                      sub={s}
                      view={views[i]!}
                      data={data}
                      open={isOpen}
                      highlight={highlight}
                      onToggle={() => toggle(s.id)}
                      onChanged={onChanged}
                      colour={colour}
                      headingLevel={several ? 4 : 3}
                      coverage={coverage}
                      review={review}
                      onAskChange={onAskChange}
                      onReview={onReview}
                    />
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

const SUB_HEAD = "font-mono text-[13px] font-semibold uppercase tracking-wider text-faint";

/** Mini-barra de contexto de las fases: una barra fina por área sobre las semanas del plan. */
export function PhaseTimeline({ plan, currentWeek, weeks }: { plan: MentorPlan; currentWeek: number; weeks: number }) {
  if (plan.structure !== "areas" || !plan.subplans.some((s) => s.phase)) return null;
  const ordered = [...plan.subplans].sort((a, b) => (a.phase?.fromWeek ?? 99) - (b.phase?.fromWeek ?? 99));
  return (
    <ol className="space-y-1" aria-label="Fases del plan: semanas en que está activa cada área" data-testid="plan-phases">
      {ordered.map((s) => {
        const p = s.phase ?? { fromWeek: 1, toWeek: weeks };
        const colour = PALETTE[plan.subplans.indexOf(s) % PALETTE.length]!;
        return (
          <li key={s.id} className="grid grid-cols-[minmax(0,10rem)_1fr] items-center gap-3 text-[13px] @3xl:grid-cols-[14rem_1fr]" data-testid="plan-phase">
            <span className="min-w-0 truncate">
              <span className="font-medium text-text">{s.area}</span> <span className="text-dim">· semanas {p.fromWeek}–{p.toWeek}</span>
            </span>
            <span className="relative block h-2 rounded-full bg-hover" aria-hidden>
              <span
                className="absolute inset-y-0 rounded-full"
                style={{ left: `${((p.fromWeek - 1) / weeks) * 100}%`, width: `${((p.toWeek - p.fromWeek + 1) / weeks) * 100}%`, background: colour }}
              />
              {currentWeek >= 1 && currentWeek <= weeks && (
                <span className="absolute inset-y-[-3px] w-0.5 bg-text" style={{ left: `${((currentWeek - 0.5) / weeks) * 100}%` }} />
              )}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function SubplanCard({
  plan,
  sub,
  view,
  data,
  open,
  highlight,
  onToggle,
  onChanged,
  colour,
  headingLevel = 3,
  coverage,
  review,
  onAskChange,
  onReview,
}: {
  plan: MentorPlan;
  sub: MentorSubplan;
  view: MentorSubplanView;
  data: Loaded;
  open: boolean;
  highlight?: Set<string>;
  onToggle: () => void;
  onChanged: (p: Loaded["plan"]) => void;
  colour: string;
  headingLevel?: 3 | 4;
} & AreaExtras) {
  const uid = useId();
  const detailId = `${uid}-detail`;
  const [shown, setShown] = useState<Record<string, number>>({});
  const [weeksOpen, setWeeksOpen] = useState(false);

  const d = sub.deliverable;
  const byAreas = !!sub.areaId;
  const title = byAreas ? sub.area : sub.objective || sub.area;
  const branch = byAreas ? (sub.phase ? `Semanas ${sub.phase.fromWeek}–${sub.phase.toWeek}` : "") : branchOf(sub);
  const parallel = byAreas ? plan.subplans.filter((o) => o.id !== sub.id && overlaps(sub, o)).map((o) => o.area) : [];
  const project = d?.projectId ? data.projects[d.projectId] : undefined;
  const minutes = sub.topics.reduce((n, t) => n + t.estMinutes, 0);
  const { note, rulesFallback } = splitNotes(sub.notes);
  const fallback = sub.fallback ?? (rulesFallback ? { kind: "rules" as const, reason: "no consta el motivo (el plan se generó antes de registrarlo)" } : null);
  const areaCov = coverage?.areas.find((a) => a.subplanId === sub.id);
  const areaReview = review?.areas.find((a) => a.key === (sub.areaId || sub.id));
  const warning = byAreas ? basesWarning(sub) : null;

  const byFolder = new Map(view.topics.map((t) => [t.folder, t]));
  const Heading = headingLevel === 3 ? "h3" : "h4";
  const SubHeading = headingLevel === 3 ? "h4" : "h5";

  // Grupos de la estructura antigua (un subplan por rama)
  const groupDefs = byAreas && sub.groups?.length ? sub.groups : [{ id: "", title: "Temas y registro", kind: "knowledge" as const, order: 0 }];

  return (
    <article
      className="min-w-0 max-w-full rounded-xl border border-line bg-card p-4 shadow-sm break-words"
      style={{ borderTop: `3px solid ${colour}` }}
      data-testid="subplan-card"
      aria-label={`${byAreas ? "Área" : "Subplan"} ${title}`}
    >
      <div className="flex min-w-0 items-center gap-1.5 text-[13px] font-medium uppercase tracking-wide text-faint">
        <Layers size={15} className="flex-none text-accent-text" aria-hidden />
        <span className="min-w-0">{branch || sub.area}</span>
      </div>

      <Heading className="mt-0.5 text-[16px] font-semibold leading-snug text-text">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={detailId}
          onClick={onToggle}
          className="flex min-h-9 w-full min-w-0 items-start gap-2 rounded-md text-left transition-colors hover:text-accent-text"
        >
          <ChevronRight size={18} aria-hidden className={cn("mt-1 flex-none text-dim transition-transform", open && "rotate-90")} />
          <span className="min-w-0 flex-1">{title}</span>
        </button>
      </Heading>

      {byAreas && sub.objective && (
        <p className="ml-7 text-[14px] text-dim" data-testid="area-objective">
          {sub.objective}
        </p>
      )}

      <div className="mt-2 flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <ProgressBar pct={view.pct} colour={colour} label={`Avance de ${title}`} />
        </div>
        <span className="flex-none text-[14px] font-semibold text-text">{view.pct} %</span>
      </div>

      <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[14px] text-dim">
        <span>
          {view.done}/{view.total} {view.total === 1 ? "tema" : "temas"}
        </span>
        {minutes > 0 && <span>· {hm(minutes)}</span>}
        {!byAreas && <span>· semana {view.currentWeek} de {sub.weeks.length}</span>}
        {parallel.length > 0 && <span>· en paralelo con {parallel.join(" y ")}</span>}
        {d && <Chip large colour={DELIVERABLE_COLOUR[d.status]}>Entregable: {DELIVERABLE_LABEL[d.status]}</Chip>}
      </p>

      {byAreas && sub.groups && sub.groups.some((g) => g.kind !== "bases") && (
        <ul className="mt-2 flex flex-wrap gap-1.5" aria-label={`Grupos de ${title}`}>
          {sub.groups.filter((g) => g.kind !== "bases").map((g) => {
            const inGroup = sub.topics.filter((t) => t.group === g.id);
            const n = inGroup.filter((t) => t.route !== "skipped").length;
            const out = inGroup.length - n;
            return (
              <li key={g.id} className="min-w-0 max-w-full">
                <Chip large>
                  {g.title} · {n}
                  {out > 0 && <span className="font-normal opacity-90"> (+{out} fuera de ruta)</span>}
                </Chip>
              </li>
            );
          })}
        </ul>
      )}

      {areaCov && <CoverageLine area={areaCov} className="mt-2" />}
      {warning && <BasesAlert warning={warning} area={title} plan={plan} sub={sub} view={view} onAskChange={onAskChange} onChanged={onChanged} />}

      {fallback && (
        <p className="mt-2 rounded-lg border border-line bg-surface px-3 py-2 text-[13.5px] text-dim" data-testid="area-fallback">
          <span className="font-semibold text-text">{fallback.kind === "mixed" ? "Completado en parte con reglas." : "Completado con reglas."}</span>{" "}
          {fallback.reason[0]!.toUpperCase()}{fallback.reason.slice(1)}. Los temas siguen el orden natural de la materia, sin la selección del Mentor (no es un error).
        </p>
      )}

      {open && (
        <div id={detailId} className="mt-4 space-y-5 border-t border-line pt-4 text-[14px]" data-testid="subplan-detail">
          {!byAreas && sub.objective && sub.objective !== title && <p className="text-dim">{sub.objective}</p>}
          {note && (
            <p className="text-dim">
              <span className="font-medium text-text">Criterio del Mentor:</span> {note}
            </p>
          )}

          {byAreas ? (
            <AreaGroupsView plan={plan} sub={sub} view={view} highlight={highlight} coverage={areaCov?.groups} />
          ) : (
            <>
              {groupDefs.map((g) => {
                const list = view.topics.filter((t) => (g.id ? t.group === g.id : true));
                if (!list.length) return null;
                const cap = shown[g.id] ?? TOPICS_PAGE;
                const gDone = list.filter(isDone).length;
                return (
                  <section key={g.id || "all"} aria-label={g.title} data-testid="area-group-section">
                    <SubHeading className={cn(SUB_HEAD, "mb-2")}>
                      {g.title} <span className="font-normal normal-case tracking-normal text-dim">({gDone}/{list.length})</span>
                    </SubHeading>
                    <ul className="space-y-2">
                      {list.slice(0, cap).map((t) => (
                        <li
                          key={t.folder}
                          className={cn("rounded-lg border p-3", highlight?.has(t.folder) ? "border-accent bg-accent-soft" : "border-line")}
                          data-testid="plan-topic"
                          data-changed={highlight?.has(t.folder) ? "true" : undefined}
                        >
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="min-w-0 flex-1 font-medium" title={t.folder}>
                              {t.title}
                            </span>
                            {t.diagnostic && <Chip large colour="var(--nv-accent)">Diagnóstico inicial</Chip>}
                            <Chip large colour={STATE_COLOUR[t.state]}>
                              <span aria-hidden>{STATE_GLYPH[t.state]}</span> {STATE_LABEL[t.state]}
                            </Chip>
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-x-2 text-[13.5px] text-dim">
                            <span>{t.pct} %</span>
                            <span>· sem. {t.targetWeek}</span>
                            {t.completedAt ? <span className="text-mint">· completado el {dayText(t.completedAt)}</span> : <span>· sin completar</span>}
                            {t.found && (
                              <button
                                type="button"
                                onClick={() => void openTopic(t.folder)}
                                className="ml-auto inline-flex min-h-8 items-center px-2 text-accent-text underline-offset-2 hover:underline"
                                aria-label={`Ver tema ${t.title}`}
                              >
                                Ver tema
                              </button>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                    {list.length > cap && (
                      <GhostButton large="md" className="mt-2" onClick={() => setShown((s) => ({ ...s, [g.id]: cap + TOPICS_PAGE }))}>
                        Mostrar {Math.min(TOPICS_PAGE, list.length - cap)} más <span className="text-faint">({list.length - cap} sin mostrar)</span>
                      </GhostButton>
                    )}
                  </section>
                );
              })}
              {!view.topics.length && <p className="text-faint">Sin temas: este subplan es solo un entregable.</p>}
            </>
          )}

          {areaCov && (
            <AreaCoverageDetail
              area={areaCov}
              review={areaReview}
              reviewAt={review?.at}
              groupTitle={(id) => sub.groups?.find((g) => g.id === id)?.title ?? (id || "Temas")}
              areaName={(key) => plan.subplans.find((s) => (s.areaId || s.id) === key)?.area ?? key}
              actions={{ planId: plan.id, onReview, onPlan: onChanged }}
            />
          )}

          {byAreas && <AreaPractice plan={plan} sub={sub} />}

          {/* Semanas */}
          <section aria-label="Semanas">
            <SubHeading className={SUB_HEAD}>
              <button
                type="button"
                aria-expanded={weeksOpen}
                onClick={() => setWeeksOpen((v) => !v)}
                className="inline-flex min-h-8 items-center gap-1.5 uppercase tracking-wider"
              >
                <ChevronRight size={15} aria-hidden className={cn("transition-transform", weeksOpen && "rotate-90")} />{" "}
                {byAreas ? `Semanas con temas (${sub.weeks.filter((w) => w.topics.length).length})` : `Semanas (${sub.weeks.length})`}
              </button>
            </SubHeading>
            {weeksOpen && (
              <ol className="mt-2 space-y-1.5">
                {sub.weeks
                  .filter((w) => (byAreas ? w.topics.length > 0 : true))
                  .map((w) => (
                    <li
                      key={w.week}
                      className={cn("rounded-lg border px-3 py-2", w.week === view.currentWeek ? "border-accent bg-accent-soft" : "border-line")}
                      data-testid="plan-week"
                    >
                      <span className="font-medium">Sem. {w.week}</span> <span className="text-faint">{shortWeekLabel(w.start, w.end)}</span>
                      {!byAreas && w.week === view.currentWeek && <span className="ml-2 text-[13px] font-semibold text-accent-text">· semana actual</span>}
                      <div className="text-dim">{w.topics.length ? w.topics.map((f) => byFolder.get(f)?.title ?? f).join(" · ") : "—"}</div>
                    </li>
                  ))}
              </ol>
            )}
          </section>

          {/* Metas enlazadas */}
          {sub.requiredGoals.length > 0 && (
            <section aria-label="Metas enlazadas">
              <SubHeading className={cn(SUB_HEAD, "mb-2")}>Metas enlazadas</SubHeading>
              <ul className="space-y-2">
                {sub.requiredGoals.map((g) => {
                  const goal = data.goals[g.goalId];
                  const item = g.itemId ? goal?.items[g.itemId] : undefined;
                  return (
                    <li key={`${g.goalId}:${g.itemId ?? ""}`} className="rounded-lg border border-line p-3" data-testid="plan-required-goal">
                      <div className="flex items-center gap-2">
                        <span className="min-w-0 flex-1 font-medium">
                          {goal ? goal.name : "Meta que ya no existe"}
                          {item ? <span className="font-normal text-dim"> › {item.name}</span> : null}
                        </span>
                        {goal && <span className="text-[14px] font-medium">{item ? item.pct : goal.pct} %</span>}
                      </div>
                      {g.note && <div className="text-[13.5px] text-dim">{g.note}</div>}
                      {goal && (
                        <button
                          type="button"
                          onClick={() => void openGoalInMetas(g.goalId)}
                          className="mt-1 inline-flex min-h-8 items-center gap-1.5 text-accent-text underline-offset-2 hover:underline"
                        >
                          <ExternalLink size={14} aria-hidden /> Abrir en Metas
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {/* Entregable */}
          {d && (
            <section aria-label="Entregable" data-testid="plan-deliverable">
              <SubHeading className={cn(SUB_HEAD, "mb-2")}>Entregable</SubHeading>
              <div className="rounded-lg border border-line p-3">
                <div className="font-medium">{d.title}</div>
                {d.description && <p className="mt-0.5 text-dim">{d.description}</p>}
                {d.criteria.length > 0 && (
                  <ul className="mt-1 list-disc space-y-0.5 pl-5 text-dim">
                    {d.criteria.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                )}
                <p className="mt-1 text-[14px] text-dim" data-testid="deliverable-derived-status">Estado: {DELIVERABLE_LABEL[d.status]} · se calcula solo según lo que completas</p>
                {project ? (
                  <button
                    type="button"
                    onClick={() => void openProjectInProyectos(project.id)}
                    className="mt-1.5 inline-flex min-h-8 items-center gap-1.5 text-accent-text underline-offset-2 hover:underline"
                  >
                    <ExternalLink size={14} aria-hidden /> Abrir en Proyectos: {project.name}
                  </button>
                ) : (
                  <p className="mt-1.5 text-[13.5px] text-faint">Propuesta: aún no hay un proyecto enlazado. Créalo en el módulo Proyectos.</p>
                )}
              </div>
            </section>
          )}
        </div>
      )}
    </article>
  );
}

/**
 * Aviso «demasiadas Bases al principio» con sus dos acciones: «Reducir a lo esencial» (saca de la RUTA los temas menos necesarios de Bases,
 * con confirmación —las notas NO se borran, solo salen de tu ruta— y «Deshacer») y «Pedir ajuste» (pre-rellena «Preguntas y ajustes»; no aplica nada).
 */
function BasesAlert({
  warning,
  area,
  plan,
  sub,
  view,
  onAskChange,
  onChanged,
}: {
  warning: BasesWarning;
  area: string;
  plan: MentorPlan;
  sub: MentorSubplan;
  view: MentorSubplanView;
  onAskChange?: (text: string) => void;
  onChanged: (p: Loaded["plan"]) => void;
}) {
  const toast = useApp((s) => s.toast);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ n: number; kept: number } | null>(null);
  const groupId = (sub.groups ?? []).find((g) => g.kind === "bases")?.id ?? "bases";
  const reduce = async () => {
    if (busy) return;
    // vista previa con la misma regla determinista del motor: cuántos temas se saltarían
    const pcts = new Map(view.topics.map((t) => [t.folder, t.pct] as const));
    const scope: RouteTopic[] = sub.topics
      .filter((t) => t.group === groupId)
      .map((t) => ({ folder: t.folder, title: t.title, group: t.group, groupKind: "bases", estMinutes: t.estMinutes, ...(t.route ? { route: t.route } : {}), ...(t.completedAt ? { completedAt: t.completedAt } : {}), ...(t.pinned ? { pinned: true } : {}), pct: pcts.get(t.folder) ?? 0 }));
    const live = scope.filter((t) => t.route !== "skipped").length;
    const preview = reduceToEssentials(scope, { max: BASES_LIMIT, languagePractice: !!plan.programmingPractice });
    if (!preview.skip.length) {
      toast("info", "No hay temas de Bases que se puedan saltar sin romper prerrequisitos o temas ya empezados.");
      return;
    }
    const ok = await confirmAction(
      `Reducir Bases de ${area} a lo esencial`,
      `Bases tiene ${live} temas. Se saltarán ${preview.skip.length} (quedarán ${live - preview.skip.length}) y el resto se reparte mejor junto al lenguaje. Las notas NO se borran ni se mueven en NoteVault: solo salen de tu ruta, puedes volver a añadirlas y puedes deshacer el cambio.`,
      `Saltar ${preview.skip.length} temas`,
    );
    if (!ok) return;
    setBusy(true);
    try {
      const r = await api.mentorPlanReduce({ id: plan.id, ...(sub.areaId ? { areaId: sub.areaId } : {}), groupId, max: BASES_LIMIT });
      const n = r.skipped?.length ?? r.changed ?? preview.skip.length;
      onChanged(r.plan);
      useMentor.setState((s) => ({ planVersion: s.planVersion + 1 }));
      setDone({ n, kept: r.live ?? live - n });
      toast("info", `${n} ${n === 1 ? "tema sale" : "temas salen"} de tu ruta. Las notas siguen en tu vault.`);
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const undo = async () => {
    try {
      const r = await api.mentorPlanChangeUndo(plan.id);
      onChanged(r.plan);
      useMentor.setState((s) => ({ planVersion: s.planVersion + 1 }));
      setDone(null);
      toast("info", "Reducción deshecha: los temas vuelven a tu ruta.");
    } catch (e) {
      toast("error", (e as Error).message);
    }
  };
  return (
    <div role="note" aria-label={`Aviso sobre Bases de ${area}`} className="mt-2 min-w-0 max-w-full rounded-lg border border-warn/60 bg-warn-soft px-3 py-2 text-[13.5px] break-words" data-testid="bases-warning">
      <p className="flex min-w-0 items-start gap-2">
        <TriangleAlert size={15} aria-hidden className="mt-0.5 flex-none text-warn" />
        <span className="min-w-0 flex-1">
          <span className="font-semibold">Muchas Bases al principio.</span> {warning.text}
        </span>
      </p>
      <div className="mt-1.5 flex min-w-0 flex-wrap gap-2">
        <GhostButton wrap onClick={() => void reduce()} disabled={busy} data-testid="bases-reduce">
          <Scissors size={15} aria-hidden className="flex-none" /> <span className="min-w-0">Reducir a lo esencial</span>
        </GhostButton>
        {onAskChange && (
          <GhostButton wrap onClick={() => onAskChange(warning.request)} data-testid="bases-ask-change">
            <MessageSquareText size={15} aria-hidden className="flex-none" /> <span className="min-w-0">Pedir ajuste: «{warning.request}»</span>
          </GhostButton>
        )}
      </div>
      {done && (
        <p role="status" className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-text" data-testid="bases-reduced">
          <span className="min-w-0">
            Listo: {done.n} {done.n === 1 ? "tema salió" : "temas salieron"} de tu ruta (siguen en tu vault; quedan {done.kept} en Bases).
          </span>
          <GhostButton onClick={() => void undo()} data-testid="bases-undo">
            <Undo2 size={14} aria-hidden /> Deshacer
          </GhostButton>
        </p>
      )}
    </div>
  );
}

/** Lo que la práctica diaria del plan dedica a esta área (proyectos semanales con su foco). Solo datos reales de la pista. */
function AreaPractice({ plan, sub }: { plan: MentorPlan; sub: MentorSubplan }) {
  const weeks = (plan.programmingPractice?.weeklyProject?.weeks ?? []).filter((w) => w.focus === sub.areaId).map((w) => w.week);
  if (!plan.programmingPractice) return null;
  return (
    <section aria-label={`Práctica de ${sub.area}`} className="rounded-xl border border-line bg-surface/40 p-3.5 text-[14px]" data-testid="area-practice">
      <h5 className="flex items-center gap-2 text-[15px] font-semibold text-text">
        <Flame size={16} aria-hidden className="text-warn" /> Práctica de esta área
      </h5>
      <p className="mt-0.5 text-dim">
        {weeks.length
          ? `${weeks.length} ${weeks.length === 1 ? "proyecto semanal" : "proyectos semanales"} con foco en ${sub.area}: semanas ${weeksText(weeks)}. El kata diario y los proyectos están en la pestaña «Práctica».`
          : `Ningún proyecto semanal de la práctica tiene foco en ${sub.area}. El kata diario y los proyectos están en la pestaña «Práctica».`}
      </p>
    </section>
  );
}

/** Los grupos internos de un área como tarjetas; al desplegar uno, sus temas como tarjetas compactas en rejilla. */
function AreaGroupsView({ plan, sub, view, highlight, coverage }: { plan: MentorPlan; sub: MentorSubplan; view: MentorSubplanView; highlight?: Set<string>; coverage?: GroupCoverage[] }) {
  const uid = useId();
  const doneSet = useMemo(() => new Set(view.topics.filter(isDone).map((t) => t.folder)), [view.topics]);
  const groups = useMemo(() => groupSummaries(plan, sub, (f) => doneSet.has(f)), [plan, sub, doneSet]);
  const firstHighlighted = groups.find((g) => view.topics.some((t) => (g.id ? t.group === g.id : !sub.groups?.some((x) => x.id === t.group)) && highlight?.has(t.folder)))?.id;
  const [openGroup, setOpenGroup] = useState<string | null>(firstHighlighted ?? null);
  const known = new Set((sub.groups ?? []).map((g) => g.id));
  const topicsOf = (id: string) => view.topics.filter((t) => (id ? t.group === id : !known.has(t.group ?? "")));
  const open = groups.find((g) => g.id === openGroup);

  return (
    <section aria-labelledby={`${uid}-h`} data-testid="area-groups">
      <h5 id={`${uid}-h`} className="text-[15px] font-semibold text-text">Grupos del área</h5>
      <p className="mt-0.5 flex items-start gap-1.5 text-[13.5px] text-dim">
        <Info size={14} aria-hidden className="mt-0.5 flex-none" />
        <span>Cada área se divide en grupos: <strong className="font-medium text-text">Bases</strong> (fundamentos comunes), <strong className="font-medium text-text">Lenguaje</strong> (con qué lo aplicas) y <strong className="font-medium text-text">Conocimientos</strong> (lo propio del área). Abre un grupo para ver sus temas.</span>
      </p>
      <ul className="mt-2 grid gap-3 @2xl:grid-cols-2 @5xl:grid-cols-3" aria-label={`Grupos de ${sub.area}`}>
        {groups.map((g) => {
          const cov = coverage?.find((c) => c.id === g.id);
          const isOpen = openGroup === g.id;
          const panelId = `${uid}-g-${g.id || "otros"}`;
          return (
            <li key={g.id || "otros"} className="min-w-0">
              <div className={cn("h-full rounded-xl border bg-card p-3", isOpen ? "border-accent" : "border-line")} data-testid="group-card">
                <h6 className="text-[15px] font-semibold text-text">
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    aria-controls={panelId}
                    onClick={() => setOpenGroup(isOpen ? null : g.id)}
                    className="flex min-h-9 w-full items-start gap-2 rounded-md text-left hover:text-accent-text"
                  >
                    <ChevronRight size={17} aria-hidden className={cn("mt-0.5 flex-none text-dim transition-transform", isOpen && "rotate-90")} />
                    <span className="min-w-0 flex-1">
                      {g.title}
                      <span className="ml-1.5 text-[12.5px] font-medium uppercase tracking-wide text-faint">{KIND_LABEL[g.kind]}</span>
                    </span>
                  </button>
                </h6>
                <p className="ml-6 text-[13px] text-dim">{KIND_HELP[g.kind]}</p>
                <dl className="ml-6 mt-1.5 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[13px]">
                  <dt className="text-dim">Temas</dt>
                  <dd className="font-medium text-text">{g.done}/{g.total} hechos</dd>
                  <dt className="text-dim">Horas</dt>
                  <dd className="font-medium text-text">{hm(g.minutes)}</dd>
                  <dt className="text-dim">Semanas</dt>
                  <dd className="font-medium text-text">{g.fromWeek === null ? "—" : g.fromWeek === g.toWeek ? g.fromWeek : `${g.fromWeek}–${g.toWeek}`}</dd>
                  <dt className="text-dim">Meses</dt>
                  <dd className="font-medium text-text">{g.months.length ? (g.months.length === 1 ? monthShort(g.months[0]!) : `${monthShort(g.months[0]!)} – ${monthShort(g.months[g.months.length - 1]!)}`) : "—"}</dd>
                  {cov && (
                    <>
                      <dt className="text-dim">Cobertura</dt>
                      <dd className="font-medium text-text">teoría {cov.theory}/{cov.total} · práctica {cov.practice}/{cov.total}</dd>
                    </>
                  )}
                </dl>
                <div className="ml-6 mt-2">
                  <ProgressBar pct={g.total ? (g.done / g.total) * 100 : 0} label={`Avance de ${g.title}`} />
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      {open && (
        <div id={`${uid}-g-${open.id || "otros"}`} className="mt-3 rounded-xl border border-line bg-surface/40 p-3">
          <TopicGrid key={open.id} title={open.title} topics={topicsOf(open.id)} highlight={highlight} coverage={coverage?.find((c) => c.id === open.id)} />
        </div>
      )}
    </section>
  );
}

type TopicFilter = "todos" | "pendientes" | "hechos" | "sin_practica";

/** Los temas de un grupo como tarjetas compactas en rejilla (2–4 columnas según el ancho), con filtro y «Mostrar N más». */
function TopicGrid({ title, topics, highlight, coverage }: { title: string; topics: MentorTopicView[]; highlight?: Set<string>; coverage?: GroupCoverage }) {
  const uid = useId();
  const [cap, setCap] = useState(GRID_PAGE);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<TopicFilter>("todos");
  const noPractice = useMemo(() => new Set(coverage?.noPractice.map((t) => t.folder) ?? []), [coverage]);
  const noTheory = useMemo(() => new Set(coverage?.noTheory.map((t) => t.folder) ?? []), [coverage]);
  const needle = q.trim().toLowerCase();
  const list = topics.filter((t) => {
    if (needle && !t.title.toLowerCase().includes(needle)) return false;
    if (filter === "pendientes") return !isDone(t);
    if (filter === "hechos") return isDone(t);
    if (filter === "sin_practica") return noPractice.has(t.folder);
    return true;
  });
  const shown = list.slice(0, cap);
  return (
    <div data-testid="topic-grid">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h6 className="min-w-0 flex-1 text-[14px] font-semibold text-text">
          Temas de {title} <span className="font-normal text-dim">({topics.filter(isDone).length}/{topics.length} hechos)</span>
        </h6>
        {topics.length >= FILTER_FROM && (
          <div role="search" aria-label={`Filtrar temas de ${title}`} className="flex flex-wrap items-center gap-2">
            <label className="relative">
              <span className="sr-only">Buscar por título</span>
              <Search size={14} aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-faint" />
              <input
                type="search"
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setCap(GRID_PAGE);
                }}
                placeholder="Buscar tema…"
                className={cn(input, "min-h-9 w-48 pl-8 text-[13.5px]")}
                data-testid="topic-filter-text"
              />
            </label>
            <label className="flex items-center gap-1.5 text-[13.5px] text-dim">
              Mostrar
              <select
                value={filter}
                onChange={(e) => {
                  setFilter(e.target.value as TopicFilter);
                  setCap(GRID_PAGE);
                }}
                className="min-h-9 rounded-lg border border-line bg-surface px-2 py-1 text-[13.5px] text-text"
                data-testid="topic-filter-state"
              >
                <option value="todos">Todos</option>
                <option value="pendientes">Pendientes</option>
                <option value="hechos">Completados</option>
                {coverage && <option value="sin_practica">Sin ejercicios</option>}
              </select>
            </label>
          </div>
        )}
      </div>
      <p id={`${uid}-count`} role="status" className="mt-1 text-[13px] text-dim">
        {list.length === topics.length ? `${topics.length} temas` : `${list.length} de ${topics.length} temas`}
      </p>
      {list.length === 0 ? (
        <p className="mt-2 text-[14px] text-faint">Ningún tema coincide con el filtro.</p>
      ) : (
        <ul className="mt-2 grid gap-2 @xl:grid-cols-2 @4xl:grid-cols-3 @6xl:grid-cols-4" aria-label={`Temas de ${title}`}>
          {shown.map((t) => (
            <li
              key={t.folder}
              className={cn("flex min-w-0 flex-col rounded-lg border p-2.5", highlight?.has(t.folder) ? "border-accent bg-accent-soft" : "border-line bg-card")}
              data-testid="plan-topic"
              data-changed={highlight?.has(t.folder) ? "true" : undefined}
            >
              <span className="line-clamp-2 text-[13.5px] font-medium leading-snug text-text" title={t.folder}>
                {t.title}
              </span>
              <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-dim">
                <Chip colour={STATE_COLOUR[t.state]}>
                  <span aria-hidden>{STATE_GLYPH[t.state]}</span> {STATE_LABEL[t.state]}
                </Chip>
                <span>sem. {t.targetWeek}</span>
                <span>{t.pct} %</span>
                {t.diagnostic && <span className="text-accent-text">diagnóstico</span>}
                {t.completedAt && <span className="text-mint">✓ {dayText(t.completedAt)}</span>}
                {noPractice.has(t.folder) && <span className="text-warn">sin ejercicios</span>}
                {noTheory.has(t.folder) && <span className="text-warn">sin teoría</span>}
              </span>
              {t.found && (
                <button
                  type="button"
                  onClick={() => void openTopic(t.folder)}
                  className="mt-auto inline-flex min-h-8 items-center self-start pt-1 text-[13px] text-accent-text underline-offset-2 hover:underline"
                  aria-label={`Ver tema ${t.title}`}
                >
                  Ver tema
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {list.length > cap && (
        <GhostButton large="md" className="mt-2" onClick={() => setCap((c) => c + GRID_PAGE)}>
          Mostrar {Math.min(GRID_PAGE, list.length - cap)} más <span className="text-faint">({list.length - cap} sin mostrar)</span>
        </GhostButton>
      )}
    </div>
  );
}

/** El selector de estado de un entregable con etiqueta accesible. */
export function DeliverableStatus({
  status,
  onChange,
  label = "Estado del entregable",
}: {
  status: MentorDeliverableStatus;
  onChange: (s: MentorDeliverableStatus) => void;
  label?: string;
}) {
  return (
    <label className="flex items-center gap-2 text-[14px] text-dim">
      Estado
      <select
        value={status}
        aria-label={label}
        onChange={(e) => onChange(e.target.value as MentorDeliverableStatus)}
        className="min-h-9 rounded-lg border border-line bg-surface px-2.5 py-1 text-[14px] text-text"
      >
        {(Object.keys(DELIVERABLE_LABEL) as MentorDeliverableStatus[]).map((st) => (
          <option key={st} value={st}>
            {DELIVERABLE_LABEL[st]}
          </option>
        ))}
      </select>
    </label>
  );
}
