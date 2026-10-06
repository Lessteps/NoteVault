// Mentor — Plan: los subplanes agrupados por área en una rejilla de tarjetas legibles. Cada tarjeta resume (rama, avance,
// temas, entregable) y se expande bajo demanda: el detalle (semanas, temas con su registro, metas requeridas, entregable) solo
// se pinta al abrirla y los temas se muestran por tandas («Mostrar N más»), para que un plan de 200+ temas siga fluido.

import { ChevronRight, ExternalLink } from "lucide-react";
import { useId, useState } from "react";
import { api } from "../../lib/bridge";
import { shortWeekLabel } from "../../lib/planTime";
import type { MentorDeliverableStatus, MentorSubplan, MentorSubplanView } from "../../lib/types";
import { useApp } from "../../store/app";
import { Chip, GhostButton } from "../common/forms";
import { cn } from "../ui";
import { openGoalInMetas } from "./MentorGoals";
import { openTopic } from "./openTopic";
import { dayText, hm, ProgressBar } from "./parts";
import { branchOf, DELIVERABLE_COLOUR, DELIVERABLE_LABEL, PALETTE, STATE_COLOUR, STATE_GLYPH, STATE_LABEL, openProjectInProyectos, type Loaded } from "./planShared";

const TOPICS_PAGE = 15;

/** Una sección por área (si solo hay una, sin rótulo extra) con la rejilla de sus subplanes. */
export function SubplanGroups({ data, highlight, onChanged }: { data: Loaded; highlight: Set<string>; onChanged: (p: Loaded["plan"]) => void }) {
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
  const areas = [...new Set(plan.subplans.map((s) => s.area))];
  const several = areas.length > 1;
  return (
    <div className="space-y-6">
      {areas.map((area, idx) => {
        const subs = plan.subplans.filter((s) => s.area === area);
        const views = subs.map((s) => derived.subplans.find((v) => v.id === s.id)!);
        const colour = PALETTE[idx % PALETTE.length]!;
        const topics = views.reduce((n, v) => n + v.total, 0);
        const done = views.reduce((n, v) => n + v.done, 0);
        return (
          <section key={area} aria-label={several ? area : undefined} data-testid="area-group">
            {several && (
              <h3 className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[16px] font-semibold text-text">
                <span aria-hidden className="inline-block h-3 w-3 rounded-sm" style={{ background: colour }} />
                {area}
                <span className="text-[14px] font-normal text-dim">{subs.length} {subs.length === 1 ? "subplan" : "subplanes"} · {done}/{topics} temas</span>
              </h3>
            )}
            <ul className="grid items-start gap-4 @3xl:grid-cols-2 @6xl:grid-cols-3" aria-label={several ? `Subplanes de ${area}` : "Subplanes"}>
              {subs.map((s, i) => {
                const isOpen = open.has(s.id) || s.topics.some((t) => highlight.has(t.folder));
                return (
                  <li key={s.id} className={cn("min-w-0", isOpen && "@3xl:col-span-full @6xl:col-span-full")}>
                    <SubplanCard planId={plan.id} sub={s} view={views[i]!} data={data} open={isOpen} highlight={highlight} onToggle={() => toggle(s.id)} onChanged={onChanged} colour={colour} headingLevel={several ? 4 : 3} />
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

export function SubplanCard({
  planId, sub, view, data, open, highlight, onToggle, onChanged, colour, headingLevel = 3,
}: {
  planId: string;
  sub: MentorSubplan;
  view: MentorSubplanView;
  data: Loaded;
  open: boolean;
  highlight?: Set<string>;
  onToggle: () => void;
  onChanged: (p: Loaded["plan"]) => void;
  colour: string;
  headingLevel?: 3 | 4;
}) {
  const toast = useApp((s) => s.toast);
  const uid = useId();
  const detailId = `${uid}-detail`;
  const [shown, setShown] = useState(TOPICS_PAGE);
  const [weeksOpen, setWeeksOpen] = useState(false);
  const d = sub.deliverable;
  const title = sub.objective || sub.area;
  const branch = branchOf(sub);
  const project = d?.projectId ? data.projects[d.projectId] : undefined;
  const minutes = sub.topics.reduce((n, t) => n + t.estMinutes, 0);
  const setStatus = async (status: MentorDeliverableStatus) => {
    try {
      onChanged(await api.mentorPlanUpdateDeliverable({ id: planId, subplanId: sub.id, status }));
    } catch (e) {
      toast("error", (e as Error).message);
    }
  };
  const byFolder = new Map(view.topics.map((t) => [t.folder, t]));
  const Heading = headingLevel === 3 ? "h3" : "h4";
  const SubHeading = headingLevel === 3 ? "h4" : "h5";
  return (
    <article className="rounded-xl border border-line bg-card p-4" style={{ borderTop: `3px solid ${colour}` }} data-testid="subplan-card" aria-label={`Subplan ${title}`}>
      <div className="text-[13px] font-medium uppercase tracking-wide text-faint">{branch || sub.area}</div>
      <Heading className="mt-0.5 text-[16px] font-semibold leading-snug text-text">
        <button type="button" aria-expanded={open} aria-controls={detailId} onClick={onToggle} className="flex min-h-9 w-full min-w-0 items-start gap-2 rounded-md text-left">
          <ChevronRight size={18} aria-hidden className={cn("mt-1 flex-none text-dim transition-transform", open && "rotate-90")} />
          <span className="min-w-0 flex-1">{title}</span>
        </button>
      </Heading>
      <div className="mt-2 flex items-center gap-3">
        <div className="flex-1"><ProgressBar pct={view.pct} colour={colour} label={`Avance de ${title}`} /></div>
        <span className="text-[14px] font-semibold">{view.pct} %</span>
      </div>
      <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[14px] text-dim">
        <span>{view.done}/{view.total} {view.total === 1 ? "tema" : "temas"}</span>
        {minutes > 0 && <span>· {hm(minutes)}</span>}
        <span>· semana {view.currentWeek} de {sub.weeks.length}</span>
        {d && <Chip large colour={DELIVERABLE_COLOUR[d.status]}>Entregable: {DELIVERABLE_LABEL[d.status]}</Chip>}
      </p>

      {open && (
        <div id={detailId} className="mt-4 space-y-5 border-t border-line pt-4 text-[14px]" data-testid="subplan-detail">
          {sub.objective && sub.objective !== title && <p className="text-dim">{sub.objective}</p>}
          {sub.notes && <p className="text-dim"><span className="font-medium text-text">Nota del plan:</span> {sub.notes}</p>}

          <section aria-label="Semanas">
            <SubHeading className={SUB_HEAD}>
              <button type="button" aria-expanded={weeksOpen} onClick={() => setWeeksOpen((v) => !v)} className="inline-flex min-h-8 items-center gap-1.5 uppercase tracking-wider">
                <ChevronRight size={15} aria-hidden className={cn("transition-transform", weeksOpen && "rotate-90")} /> Semanas ({sub.weeks.length})
              </button>
            </SubHeading>
            {weeksOpen && (
              <ol className="mt-2 space-y-1.5">
                {sub.weeks.map((w) => (
                  <li key={w.week} className={cn("rounded-lg border px-3 py-2", w.week === view.currentWeek ? "border-accent bg-accent-soft" : "border-line")} data-testid="plan-week">
                    <span className="font-medium">Sem. {w.week}</span> <span className="text-faint">{shortWeekLabel(w.start, w.end)}</span>
                    {w.week === view.currentWeek && <span className="ml-2 text-[13px] font-semibold text-accent-text">· semana actual</span>}
                    <div className="text-dim">{w.topics.length ? w.topics.map((f) => byFolder.get(f)?.title ?? f).join(" · ") : "—"}</div>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section aria-label="Temas">
            <SubHeading className={cn(SUB_HEAD, "mb-2")}>Temas y registro ({view.topics.length})</SubHeading>
            <ul className="space-y-2">
              {view.topics.slice(0, shown).map((t) => (
                <li key={t.folder} className={cn("rounded-lg border p-3", highlight?.has(t.folder) ? "border-accent bg-accent-soft" : "border-line")} data-testid="plan-topic" data-changed={highlight?.has(t.folder) ? "true" : undefined}>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="min-w-0 flex-1 font-medium" title={t.folder}>{t.title}</span>
                    {t.diagnostic && <Chip large colour="var(--nv-accent)">Diagnóstico inicial</Chip>}
                    <Chip large colour={STATE_COLOUR[t.state]}><span aria-hidden>{STATE_GLYPH[t.state]}</span> {STATE_LABEL[t.state]}</Chip>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 text-[13.5px] text-dim">
                    <span>{t.pct} %</span>
                    <span>· sem. {t.targetWeek}</span>
                    {t.completedAt ? <span className="text-mint">· completado el {dayText(t.completedAt)}</span> : <span>· sin completar</span>}
                    {t.found && (
                      <button type="button" onClick={() => void openTopic(t.folder)} className="ml-auto inline-flex min-h-8 items-center px-2 text-accent-text underline-offset-2 hover:underline" aria-label={`Ver tema ${t.title}`}>
                        Ver tema
                      </button>
                    )}
                  </div>
                </li>
              ))}
              {!view.topics.length && <li className="text-faint">Sin temas: este subplan es solo un entregable.</li>}
            </ul>
            {view.topics.length > shown && (
              <GhostButton large="md" className="mt-2" onClick={() => setShown((n) => n + TOPICS_PAGE)}>
                Mostrar {Math.min(TOPICS_PAGE, view.topics.length - shown)} más <span className="text-faint">({view.topics.length - shown} sin mostrar)</span>
              </GhostButton>
            )}
          </section>

          {sub.requiredGoals.length > 0 && (
            <section aria-label="Metas requeridas">
              <SubHeading className={cn(SUB_HEAD, "mb-2")}>Metas requeridas</SubHeading>
              <ul className="space-y-2">
                {sub.requiredGoals.map((g) => {
                  const goal = data.goals[g.goalId];
                  const item = g.itemId ? goal?.items[g.itemId] : undefined;
                  return (
                    <li key={`${g.goalId}:${g.itemId ?? ""}`} className="rounded-lg border border-line p-3" data-testid="plan-required-goal">
                      <div className="flex items-center gap-2">
                        <span className="min-w-0 flex-1 font-medium">{goal ? goal.name : "Meta que ya no existe"}{item ? <span className="font-normal text-dim"> › {item.name}</span> : null}</span>
                        {goal && <span className="text-[14px] font-medium">{item ? item.pct : goal.pct} %</span>}
                      </div>
                      {g.note && <div className="text-[13.5px] text-dim">{g.note}</div>}
                      {goal && (
                        <button type="button" onClick={() => void openGoalInMetas(g.goalId)} className="mt-1 inline-flex min-h-8 items-center gap-1.5 text-accent-text underline-offset-2 hover:underline">
                          <ExternalLink size={14} aria-hidden /> Abrir en Metas
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {d && (
            <section aria-label="Entregable" data-testid="plan-deliverable">
              <SubHeading className={cn(SUB_HEAD, "mb-2")}>Entregable</SubHeading>
              <div className="rounded-lg border border-line p-3">
                <div className="font-medium">{d.title}</div>
                {d.description && <p className="mt-0.5 text-dim">{d.description}</p>}
                {d.criteria.length > 0 && (
                  <ul className="mt-1 list-disc space-y-0.5 pl-5 text-dim">
                    {d.criteria.map((c) => <li key={c}>{c}</li>)}
                  </ul>
                )}
                <DeliverableStatus status={d.status} onChange={(st) => void setStatus(st)} />
                {project ? (
                  <button type="button" onClick={() => void openProjectInProyectos(project.id)} className="mt-1.5 inline-flex min-h-8 items-center gap-1.5 text-accent-text underline-offset-2 hover:underline">
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

/** El selector de estado de un entregable (único campo editable del plan): con etiqueta visible y asociada. */
export function DeliverableStatus({ status, onChange, label = "Estado del entregable" }: { status: MentorDeliverableStatus; onChange: (s: MentorDeliverableStatus) => void; label?: string }) {
  return (
    <label className="mt-2 flex items-center gap-2 text-[14px] text-dim">
      Estado
      <select
        value={status}
        aria-label={label}
        onChange={(e) => onChange(e.target.value as MentorDeliverableStatus)}
        className="min-h-9 rounded-lg border border-line bg-surface px-2.5 py-1 text-[14px] text-text"
      >
        {(Object.keys(DELIVERABLE_LABEL) as MentorDeliverableStatus[]).map((st) => (
          <option key={st} value={st}>{DELIVERABLE_LABEL[st]}</option>
        ))}
      </select>
    </label>
  );
}
