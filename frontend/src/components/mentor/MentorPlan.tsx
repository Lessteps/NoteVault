// Mentor — Plan: el plan MENSUAL (y de ahí el diario) por subplanes de área y objetivo.
//
// SOLO LECTURA salvo el estado del entregable: los temas, las metas y los proyectos se editan en sus
// módulos (cada bloque trae su botón "Abrir en …"). El estado de práctica y los porcentajes se derivan
// en vivo del motor de práctica; el registro de temas completados (fecha) lo anota `mentor_plan_get` la
// primera vez que ve un tema completo. El plan lo propone la IA en el chat del Mentor y solo se guarda
// al pulsar "Aceptar plan" (código determinista).

import { CalendarDays, Check, ChevronLeft, ChevronRight, ExternalLink, MessageSquarePlus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../lib/bridge";
import type {
  MentorPlanDraft,
  MentorPlanGet,
  MentorPlanItem,
  MentorSubplan,
  MentorSubplanView,
  MentorTopicState,
  MentorDeliverableStatus,
} from "../../lib/types";
import { useApp } from "../../store/app";
import { useMentor } from "../../store/mentor";
import { useNavState } from "../../store/navState";
import { useProjects } from "../../store/projects";
import { Chip, GhostButton, PrimaryButton } from "../common/forms";
import { cn } from "../ui";
import { openGoalInMetas } from "./MentorGoals";
import { openTopic } from "./openTopic";
import { AreaRow, CARD_CLASS, dayText, Disclosure, hm, LoadState, PanelPage, ProgressBar } from "./parts";

type Loaded = Extract<MentorPlanGet, { loading: false }>;

const COLD_RETRY_MS = 1500;
const COLD_RETRY_MAX = 40;
const PALETTE = ["#2383e2", "#33b679", "#e67c73", "#f6bf26", "#8e24aa", "#0b8043", "#d50000", "#039be5"];

export const STATE_LABEL: Record<MentorTopicState, string> = {
  sin_tratar: "Sin tratar",
  practicando: "Practicando",
  consolidado: "Consolidado",
  completo: "Completo",
  examen_pendiente: "Examen pendiente",
  no_encontrado: "No encontrado",
};
const STATE_COLOUR: Record<MentorTopicState, string> = {
  sin_tratar: "var(--nv-faint)",
  practicando: "var(--nv-accent)",
  consolidado: "var(--nv-warn)",
  completo: "var(--nv-mint)",
  examen_pendiente: "var(--nv-warn)",
  no_encontrado: "var(--nv-danger)",
};
export const DELIVERABLE_LABEL: Record<MentorDeliverableStatus, string> = { idea: "Idea", en_curso: "En curso", hecho: "Hecho" };
const DELIVERABLE_COLOUR: Record<MentorDeliverableStatus, string> = { idea: "var(--nv-faint)", en_curso: "var(--nv-accent)", hecho: "var(--nv-mint)" };

export const monthNow = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
const shiftMonth = (m: string, delta: number): string => {
  const [y, mm] = m.split("-").map(Number);
  const d = new Date(y!, mm! - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
export const monthLabel = (m: string): string => {
  const [y, mm] = m.split("-").map(Number);
  const t = new Date(y!, mm! - 1, 1).toLocaleDateString("es", { month: "long", year: "numeric" });
  return t.charAt(0).toUpperCase() + t.slice(1);
};
const shortRange = (start: string, end: string): string => `${Number(start.slice(8))}–${Number(end.slice(8))}`;

async function openProjectInProyectos(id: string): Promise<void> {
  await useProjects.getState().open(id);
  useApp.getState().setModule("proyectos");
}

/** Carga el plan del mes con el reintento de la vault fría (como el resto de paneles). */
function usePlanData(month: string) {
  const planVersion = useMentor((s) => s.planVersion);
  const [data, setData] = useState<Loaded | null>(null);
  const [warming, setWarming] = useState(false);
  const [error, setError] = useState("");
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const load = useCallback(async () => {
    setError("");
    try {
      for (let i = 0; i < COLD_RETRY_MAX; i++) {
        const r = await api.mentorPlanGet(month);
        if (!alive.current) return;
        if (!r.loading) {
          setData(r);
          setWarming(false);
          return;
        }
        setWarming(true);
        await new Promise((ok) => setTimeout(ok, COLD_RETRY_MS));
        if (!alive.current) return;
      }
      throw new Error("El índice de la vault tarda demasiado en estar listo. Inténtalo de nuevo en un momento.");
    } catch (e) {
      if (alive.current) {
        setWarming(false);
        setError((e as Error).message);
      }
    }
  }, [month]);
  useEffect(() => {
    void load();
  }, [load, planVersion]);
  return { data, warming, error, reload: load, setData };
}

export function MentorPlan() {
  const [month, setMonth] = useState(monthNow);
  const [tab, setTab] = useState<"mes" | "semana">("mes");
  const { data, warming, error, reload, setData } = usePlanData(month);
  const chatLoaded = useMentor((s) => s.chatLoaded);
  const loadChat = useMentor((s) => s.loadChat);
  const turns = useMentor((s) => s.turns);
  const pending = useMentor((s) => s.pending);
  const startPlan = useMentor((s) => s.startPlanChat);
  const acceptPlan = useMentor((s) => s.acceptPlan);
  const accepting = useMentor((s) => s.acceptingPlan);
  const discard = useMentor((s) => s.discard);

  useEffect(() => {
    if (!chatLoaded) void loadChat();
  }, [chatLoaded, loadChat]);

  const draftTurn = turns.find((t) => t.id === pending && t.planDraft);
  const plan = data?.plan ?? null;
  const summary = data?.derived?.summary;

  return (
    <PanelPage
      title="Mentor — Plan"
      subtitle="El plan del mes por áreas y objetivos, y de ahí el plan de cada día. El estado sale de tu práctica; solo el entregable se marca aquí."
      wide
      action={
        <PrimaryButton onClick={() => void startPlan()}>
          <MessageSquarePlus size={14} /> ＋ Generar plan del mes con el Mentor
        </PrimaryButton>
      }
    >
      <div className="flex flex-wrap items-center gap-2" aria-label="Mes del plan">
        <button type="button" aria-label="Mes anterior" onClick={() => setMonth((m) => shiftMonth(m, -1))} className="grid h-7 w-7 place-items-center rounded-md border border-line text-dim hover:bg-hover hover:text-text">
          <ChevronLeft size={15} />
        </button>
        <span className="min-w-[8.5rem] text-center text-[14px] font-semibold" data-testid="plan-month">{monthLabel(month)}</span>
        <button type="button" aria-label="Mes siguiente" onClick={() => setMonth((m) => shiftMonth(m, 1))} className="grid h-7 w-7 place-items-center rounded-md border border-line text-dim hover:bg-hover hover:text-text">
          <ChevronRight size={15} />
        </button>
        {month !== monthNow() && (
          <button type="button" onClick={() => setMonth(monthNow())} className="rounded-md px-2 py-1 text-[12px] text-accent-text hover:underline">
            Este mes
          </button>
        )}
        <span className="flex-1" />
        {plan && (
          <div className="inline-flex rounded-lg border border-line p-0.5 text-[12.5px]" role="tablist" aria-label="Vista del plan">
            {(["mes", "semana"] as const).map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                className={cn("rounded-md px-2.5 py-1", tab === t ? "bg-accent-soft text-accent-text" : "text-dim hover:text-text")}
              >
                {t === "mes" ? "Plan del mes" : "Esta semana / Hoy"}
              </button>
            ))}
          </div>
        )}
      </div>

      <LoadState warming={warming} error={error} empty={!data} onRetry={() => void reload()} />

      {draftTurn?.planDraft && (
        <PlanDraftCard
          draft={draftTurn.planDraft}
          accepting={accepting}
          onAccept={() => void acceptPlan().then((r) => r && setMonth(r.month))}
          onDiscard={() => void discard()}
        />
      )}

      {data && summary && plan && (
        <p className="text-[12.5px] text-dim" data-testid="plan-summary">
          {summary.subplans} {summary.subplans === 1 ? "subplan" : "subplanes"} · {summary.done}/{summary.topics} temas completados · {summary.pct}% global
          {plan.hoursPerWeek ? ` · ${plan.hoursPerWeek} h/semana` : ""} · semana {summary.currentWeek} de {summary.weeks}
        </p>
      )}

      {data && !plan && <EmptyPlan month={month} aiConfigured={data.aiConfigured} hasDraft={!!draftTurn} onGenerate={() => void startPlan()} />}

      {data && plan && data.derived && tab === "mes" && <PlanBody data={data} onChanged={(p) => setData({ ...data, plan: p })} />}
      {data && plan && data.derived && tab === "semana" && <ThisWeek items={data.items} month={data.month} today={data.today} weeks={data.derived.summary.weeks} week={data.derived.summary.currentWeek} />}
    </PanelPage>
  );
}

function EmptyPlan({ month, aiConfigured, hasDraft, onGenerate }: { month: string; aiConfigured: boolean; hasDraft: boolean; onGenerate: () => void }) {
  if (hasDraft) return null;
  return (
    <div className="rounded-xl border border-dashed border-line p-6 text-center" data-testid="plan-empty">
      <CalendarDays size={22} className="mx-auto text-faint" />
      <p className="mt-2 text-[13.5px] font-medium">Aún no hay plan para {monthLabel(month)}</p>
      <p className="mx-auto mt-1 max-w-[520px] text-[12.5px] text-dim">
        Un plan del mes reparte los temas que necesitas por semanas, agrupados en subplanes por área y objetivo, con las metas que debes cumplir y un entregable
        (un proyecto) que demuestre que lo lograste. De él sale después tu plan de cada día en «Hoy».
      </p>
      {!aiConfigured && <p className="mx-auto mt-2 max-w-[520px] text-[12px] text-warn">La IA no está configurada: el Mentor no puede proponerte un plan sin ella. Configúrala en los ajustes del asistente.</p>}
      <div className="mt-3 flex justify-center">
        <PrimaryButton onClick={onGenerate}>
          <MessageSquarePlus size={14} /> ＋ Generar plan del mes con el Mentor
        </PrimaryButton>
      </div>
    </div>
  );
}

// ── Borrador pendiente ───────────────────────────────────────────────────

export function PlanDraftCard({ draft, accepting, onAccept, onDiscard }: { draft: MentorPlanDraft; accepting: boolean; onAccept: () => void; onDiscard: () => void }) {
  const [cal, setCal] = useState(false);
  const topics = draft.subplans.reduce((n, s) => n + s.topics.length, 0);
  const weeks = draft.subplans[0]?.weeks ?? [];
  return (
    <section className="rounded-xl border-2 border-accent/60 bg-card p-4" data-testid="plan-draft" aria-label="Borrador del plan">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-[14px] font-semibold">Borrador del plan de {monthLabel(draft.month)}</h2>
        <Chip colour="var(--nv-accent)">Propuesto por el Mentor</Chip>
        <span className="text-[12px] text-faint">
          {draft.subplans.length} subplanes · {topics} temas · {draft.hoursPerWeek} h/semana · {hm(draft.totalMinutes)} de {hm(draft.availableMinutes)}
        </span>
      </div>
      {draft.rationale && <p className="mt-1.5 text-[12.5px] text-dim">{draft.rationale}</p>}
      {draft.warnings.map((w) => (
        <p key={w} role="status" className="mt-1.5 text-[12px] text-warn">{w}</p>
      ))}
      {draft.discarded.length > 0 && (
        <p className="mt-1.5 text-[11.5px] text-faint">Descartado por no existir en tu sistema: {draft.discarded.join(", ")}.</p>
      )}
      <ul className="mt-3 grid gap-2 @3xl:grid-cols-2">
        {draft.subplans.map((s) => (
          <li key={s.id} className="rounded-lg border border-line p-2.5 text-[12.5px]">
            <div className="font-semibold">{s.area}{s.objective ? <span className="font-normal text-dim"> · {s.objective}</span> : null}</div>
            <div className="text-[11.5px] text-faint">
              {s.topics.length} temas{s.requiredGoals.length ? ` · ${s.requiredGoals.length} metas requeridas` : ""}
              {s.deliverable ? ` · entregable: ${s.deliverable.title}` : ""}
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-3">
        <Disclosure open={cal} onToggle={() => setCal((v) => !v)} label={`${cal ? "Ocultar" : "Ver"} calendario semanal`}>
          <span className="text-[12.5px] font-medium">Calendario semanal</span>
        </Disclosure>
        {cal && (
          <div className="mt-2 space-y-2" data-testid="draft-calendar">
            {weeks.map((w, i) => (
              <div key={w.week} className="rounded-lg border border-line p-2.5 text-[12px]">
                <div className="font-medium">Semana {w.week} <span className="font-normal text-faint">· {shortRange(w.start, w.end)}</span></div>
                <ul className="mt-1 space-y-0.5 text-dim">
                  {draft.subplans.flatMap((s) =>
                    s.topics.filter((t) => t.targetWeek === i + 1).map((t) => (
                      <li key={`${s.id}:${t.folder}`}>
                        <span className="text-text">{t.title}</span> · {s.area} · {hm(t.estMinutes)}
                      </li>
                    )),
                  )}
                  {!draft.subplans.some((s) => s.topics.some((t) => t.targetWeek === i + 1)) && <li className="text-faint">Sin temas</li>}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <PrimaryButton onClick={onAccept} disabled={accepting}>
          <Check size={14} /> Aceptar plan
        </PrimaryButton>
        <GhostButton danger onClick={onDiscard}>
          <Trash2 size={13} /> Descartar
        </GhostButton>
      </div>
    </section>
  );
}

// ── Plan del mes: una fila por área, una tarjeta por subplan ─────────────

function PlanBody({ data, onChanged }: { data: Loaded; onChanged: (p: Loaded["plan"]) => void }) {
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
  return (
    <div className="space-y-5">
      {areas.map((area, idx) => {
        const subs = plan.subplans.filter((s) => s.area === area);
        const views = subs.map((s) => derived.subplans.find((v) => v.id === s.id)!);
        const avg = views.reduce((n, v) => n + v.pct, 0) / Math.max(1, views.length) / 100;
        return (
          <AreaRow key={area} title={area} colour={PALETTE[idx % PALETTE.length]!} count={subs.length} noun={["subplan", "subplanes"]} avg={avg}>
            {subs.map((s, i) => (
              <SubplanCard key={s.id} month={plan.month} sub={s} view={views[i]!} data={data} open={open.has(s.id)} onToggle={() => toggle(s.id)} onChanged={onChanged} colour={PALETTE[idx % PALETTE.length]!} />
            ))}
          </AreaRow>
        );
      })}
    </div>
  );
}

export function SubplanCard({
  month, sub, view, data, open, onToggle, onChanged, colour,
}: {
  month: string;
  sub: MentorSubplan;
  view: MentorSubplanView;
  data: Loaded;
  open: boolean;
  onToggle: () => void;
  onChanged: (p: Loaded["plan"]) => void;
  colour: string;
}) {
  const toast = useApp((s) => s.toast);
  const d = sub.deliverable;
  const title = sub.objective || sub.area;
  const project = d?.projectId ? data.projects[d.projectId] : undefined;
  const setStatus = async (status: MentorDeliverableStatus) => {
    try {
      onChanged(await api.mentorPlanUpdateDeliverable({ month, subplanId: sub.id, status }));
    } catch (e) {
      toast("error", (e as Error).message);
    }
  };
  const byFolder = new Map(view.topics.map((t) => [t.folder, t]));
  return (
    <section className={CARD_CLASS} style={{ borderTop: `3px solid ${colour}` }} data-testid="subplan-card" aria-label={`Subplan ${title}`}>
      <Disclosure open={open} onToggle={onToggle} label={`${open ? "Contraer" : "Expandir"} ${title}`}>
        <div className="text-[11px] font-medium uppercase tracking-wide text-faint">{sub.area}</div>
        <div className="text-[14px] font-semibold leading-snug text-text">{title}</div>
        <div className="mt-2 flex items-center gap-2">
          <div className="flex-1"><ProgressBar pct={view.pct} colour={colour} /></div>
          <span className="text-[11.5px] font-medium">{view.pct} %</span>
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-dim">
          <span>{view.done}/{view.total} temas</span>
          <span>· semana {view.currentWeek}</span>
          {d && <Chip colour={DELIVERABLE_COLOUR[d.status]}>Entregable: {DELIVERABLE_LABEL[d.status]}</Chip>}
        </div>
      </Disclosure>

      {open && (
        <div className="mt-3 space-y-3.5 border-t border-line pt-3 text-[12px]" data-testid="subplan-detail">
          {sub.objective && sub.objective !== title && <p className="text-dim">{sub.objective}</p>}

          <section aria-label="Semanas">
            <h4 className="mb-1 font-mono text-[10.5px] uppercase tracking-wider text-faint">Semanas</h4>
            <ol className="space-y-1">
              {sub.weeks.map((w) => (
                <li key={w.week} className={cn("rounded-md border px-2 py-1", w.week === view.currentWeek ? "border-accent bg-accent-soft" : "border-line")} data-testid="plan-week">
                  <span className="font-medium">Sem. {w.week}</span> <span className="text-faint">{shortRange(w.start, w.end)}</span>
                  <div className="text-dim">{w.topics.length ? w.topics.map((f) => byFolder.get(f)?.title ?? f).join(" · ") : "—"}</div>
                </li>
              ))}
            </ol>
          </section>

          <section aria-label="Temas">
            <h4 className="mb-1 font-mono text-[10.5px] uppercase tracking-wider text-faint">Temas y registro</h4>
            <ul className="space-y-1.5">
              {view.topics.map((t) => (
                <li key={t.folder} className="rounded-md border border-line p-2" data-testid="plan-topic">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="min-w-0 flex-1 truncate font-medium" title={t.folder}>{t.title}</span>
                    <Chip colour={STATE_COLOUR[t.state]}>{STATE_LABEL[t.state]}</Chip>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 text-[11px] text-dim">
                    <span>{t.pct} %</span>
                    <span>· sem. {t.targetWeek}</span>
                    {t.completedAt ? <span className="text-mint">· completado el {dayText(t.completedAt)}</span> : <span>· sin completar</span>}
                    {t.found && (
                      <button type="button" onClick={() => void openTopic(t.folder)} className="ml-auto text-accent-text hover:underline" aria-label={`Ver tema ${t.title}`}>
                        Ver tema
                      </button>
                    )}
                  </div>
                </li>
              ))}
              {!view.topics.length && <li className="text-faint">Sin temas: este subplan es solo un entregable.</li>}
            </ul>
          </section>

          {sub.requiredGoals.length > 0 && (
            <section aria-label="Metas requeridas">
              <h4 className="mb-1 font-mono text-[10.5px] uppercase tracking-wider text-faint">Metas requeridas</h4>
              <ul className="space-y-1.5">
                {sub.requiredGoals.map((g) => {
                  const goal = data.goals[g.goalId];
                  const item = g.itemId ? goal?.items[g.itemId] : undefined;
                  return (
                    <li key={`${g.goalId}:${g.itemId ?? ""}`} className="rounded-md border border-line p-2" data-testid="plan-required-goal">
                      <div className="flex items-center gap-2">
                        <span className="min-w-0 flex-1 font-medium">{goal ? goal.name : "Meta que ya no existe"}{item ? <span className="font-normal text-dim"> › {item.name}</span> : null}</span>
                        {goal && <span className="text-[11.5px]">{item ? item.pct : goal.pct} %</span>}
                      </div>
                      {g.note && <div className="text-[11px] text-dim">{g.note}</div>}
                      {goal && (
                        <button type="button" onClick={() => void openGoalInMetas(g.goalId)} className="mt-1 inline-flex items-center gap-1 text-[11.5px] text-accent-text hover:underline">
                          <ExternalLink size={11} /> Abrir en Metas
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
              <h4 className="mb-1 font-mono text-[10.5px] uppercase tracking-wider text-faint">Entregable</h4>
              <div className="rounded-md border border-line p-2">
                <div className="font-medium">{d.title}</div>
                {d.description && <p className="mt-0.5 text-dim">{d.description}</p>}
                {d.criteria.length > 0 && (
                  <ul className="mt-1 list-disc space-y-0.5 pl-4 text-dim">
                    {d.criteria.map((c) => <li key={c}>{c}</li>)}
                  </ul>
                )}
                <label className="mt-2 flex items-center gap-2 text-[11.5px] text-dim">
                  Estado
                  <select
                    value={d.status}
                    aria-label="Estado del entregable"
                    onChange={(e) => void setStatus(e.target.value as MentorDeliverableStatus)}
                    className="rounded-md border border-line bg-surface px-1.5 py-1 text-[12px] text-text"
                  >
                    {(Object.keys(DELIVERABLE_LABEL) as MentorDeliverableStatus[]).map((st) => (
                      <option key={st} value={st}>{DELIVERABLE_LABEL[st]}</option>
                    ))}
                  </select>
                </label>
                {project ? (
                  <button type="button" onClick={() => void openProjectInProyectos(project.id)} className="mt-1.5 inline-flex items-center gap-1 text-[11.5px] text-accent-text hover:underline">
                    <ExternalLink size={11} /> Abrir en Proyectos: {project.name}
                  </button>
                ) : (
                  <p className="mt-1.5 text-[11px] text-faint">Propuesta: aún no hay un proyecto enlazado. Créalo en el módulo Proyectos.</p>
                )}
              </div>
            </section>
          )}
        </div>
      )}
    </section>
  );
}

// ── Esta semana / Hoy ────────────────────────────────────────────────────

export function ThisWeek({ items, month, today, weeks, week }: { items: MentorPlanItem[]; month: string; today: string; weeks: number; week: number }) {
  const setPending = useMentor((s) => s.setPendingObjective);
  const isCurrent = today.slice(0, 7) === month;
  const planDay = () => {
    setPending({ type: "plan" });
    useNavState.getState().set("mentor.view", "hoy");
  };
  if (!isCurrent) {
    return <p className="rounded-xl border border-dashed border-line p-4 text-center text-[12.5px] text-faint" data-testid="plan-week-empty">«Esta semana» solo existe para el mes en curso.</p>;
  }
  return (
    <section className="rounded-xl border border-line bg-card p-4" data-testid="plan-this-week" aria-label="Esta semana">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-[14px] font-semibold">Esta semana (semana {week} de {weeks})</h2>
        <span className="flex-1" />
        <PrimaryButton onClick={planDay} disabled={!items.length}>
          Planear mi día con esto
        </PrimaryButton>
      </div>
      {items.length === 0 ? (
        <p className="mt-3 text-[12.5px] text-faint">Nada pendiente del plan del mes para esta semana. Si quieres adelantar, pídele un plan de hoy al Mentor.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {items.map((it) => (
            <li key={`${it.subplanId}:${it.folder ?? "deliverable"}`} className="rounded-lg border border-line p-2.5" data-testid="plan-week-item">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[13px] font-semibold">{it.title}</span>
                <Chip colour="var(--nv-mint)">Plan: {it.label}</Chip>
                {it.kind === "deliverable" && <Chip colour="var(--nv-accent)">Entregable</Chip>}
                {it.overdue && <Chip colour="var(--nv-danger)">Atrasado (sem. {it.targetWeek})</Chip>}
                <span className="text-[11.5px] text-faint">{hm(it.estMinutes)}</span>
                {it.folder && (
                  <GhostButton className="ml-auto" onClick={() => void openTopic(it.folder!)}>Ver tema</GhostButton>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
