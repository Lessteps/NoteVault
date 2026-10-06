// Mentor — Plan: una SUB-INTERFAZ por cada plan (en la barra lateral del Mentor) y un resumen de todos.
//
// Un plan cubre un periodo libre que decide el estudiante y se arma desde el formulario de precondiciones
// (`PlanForm`). SOLO LECTURA salvo el estado del entregable y las acciones del plan (renombrar, archivar,
// eliminar a la papelera): los temas, las metas y los proyectos se editan en sus módulos (cada bloque trae
// su botón «Abrir en …»). El estado de práctica y los porcentajes se derivan en vivo del motor de práctica;
// el registro de temas completados (fecha) lo anota `mentor_plan_get` la primera vez que ve un tema completo.
// El borrador (de la IA o automático) solo se guarda al pulsar «Aceptar plan» (código determinista).

import { Archive, ArchiveRestore, CalendarDays, Check, ExternalLink, MessageSquarePlus, Pencil, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../lib/bridge";
import { periodLabel, shortWeekLabel, weeksLabel } from "../../lib/planTime";
import type {
  MentorDeliverableStatus,
  MentorPlan as MentorPlanData,
  MentorPlanDraft,
  MentorPlanGet,
  MentorPlanItem,
  MentorPlanRow,
  MentorPlanStatus,
  MentorSubplan,
  MentorSubplanView,
  MentorTopicState,
} from "../../lib/types";
import { useApp } from "../../store/app";
import { planViewId, useMentor } from "../../store/mentor";
import { useNavState } from "../../store/navState";
import { useProjects } from "../../store/projects";
import { Chip, GhostButton, PrimaryButton } from "../common/forms";
import { cn, askText, confirmAction } from "../ui";
import { openGoalInMetas } from "./MentorGoals";
import { openTopic } from "./openTopic";
import { AreaRow, CARD_CLASS, dayText, Disclosure, hm, LoadState, PanelPage, ProgressBar } from "./parts";
import { PACE_LABEL, PlanForm } from "./PlanForm";

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
export const STATUS_LABEL: Record<MentorPlanStatus, string> = { activo: "Activo", futuro: "Futuro", terminado: "Terminado" };
export const STATUS_COLOUR: Record<MentorPlanStatus, string> = { activo: "var(--nv-mint)", futuro: "var(--nv-accent)", terminado: "var(--nv-faint)" };

export const monthNow = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
export const monthLabel = (m: string): string => {
  const [y, mm] = m.split("-").map(Number);
  const t = new Date(y!, mm! - 1, 1).toLocaleDateString("es", { month: "long", year: "numeric" });
  return t.charAt(0).toUpperCase() + t.slice(1);
};
const DAY_SHORT = ["L", "M", "X", "J", "V", "S", "D"];
const num1 = (n: number): string => String(Math.round(n * 10) / 10).replace(".", ",");

async function openProjectInProyectos(id: string): Promise<void> {
  await useProjects.getState().open(id);
  useApp.getState().setModule("proyectos");
}

/** Carga un plan (o, sin id, el resumen: el plan por defecto con todos los planes) con el reintento de la vault fría. */
function usePlanData(id: string | undefined) {
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
        const r = await api.mentorPlanGet(id);
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
  }, [id]);
  useEffect(() => {
    void load();
  }, [load, planVersion]);
  return { data, warming, error, reload: load, setData };
}

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

  useEffect(() => {
    if (!chatLoaded) void loadChat();
  }, [chatLoaded, loadChat]);

  const draftTurn = turns.find((t) => t.id === pending && t.planDraft);
  const plans = data?.plans ?? [];

  return (
    <PanelPage
      title="Mentor — Planes"
      subtitle="Cada plan cubre el periodo que tú decides y tiene su propia sub-interfaz. Aquí ves todos y lo que toca hoy y esta semana."
      wide
      action={
        <div className="flex flex-wrap items-center gap-2">
          <GhostButton onClick={() => void startPlan()} title="Conversa con el Mentor para armar un plan">
            <MessageSquarePlus size={13} /> Pedirlo al Mentor
          </GhostButton>
          <PrimaryButton onClick={() => setCreating((v) => !v)}>
            ＋ Nuevo plan
          </PrimaryButton>
        </div>
      }
    >
      <LoadState warming={warming} error={error} empty={!data} onRetry={() => void reload()} />

      {creating && <PlanForm onClose={() => setCreating(false)} />}

      {draftTurn?.planDraft && (
        <PlanDraftCard draft={draftTurn.planDraft} accepting={accepting} onAccept={() => void acceptPlan()} onDiscard={() => void discard()} />
      )}

      {data && plans.length === 0 && !draftTurn && !creating && <EmptyPlan aiConfigured={data.aiConfigured} onCreate={() => setCreating(true)} />}

      {data && plans.length > 0 && (
        <section aria-label="Todos los planes" data-testid="plans-grid">
          <h2 className="mb-2 text-[13.5px] font-semibold">Tus planes <span className="text-[11.5px] font-normal text-faint">{plans.length}</span></h2>
          <ul className="grid gap-3 @3xl:grid-cols-2 @6xl:grid-cols-3">
            {plans.map((p) => (
              <li key={p.id}>
                <PlanCard plan={p} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {data && plans.some((p) => p.status === "activo") && <ThisWeek items={data.items} activePlans={plans.filter((p) => p.status === "activo").length} />}
    </PanelPage>
  );
}

function PlanCard({ plan }: { plan: MentorPlanRow }) {
  const open = () => useNavState.getState().set("mentor.view", planViewId(plan.id));
  return (
    <button type="button" onClick={open} aria-label={`Abrir plan ${plan.name}`} className="block w-full rounded-xl border border-line bg-card p-3.5 text-left hover:border-accent" data-testid="plan-card">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14px] font-semibold">{plan.name}</div>
          <div className="text-[11.5px] text-faint">{plan.period}</div>
        </div>
        <Chip colour={STATUS_COLOUR[plan.status]}>{STATUS_LABEL[plan.status]}</Chip>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <div className="flex-1"><ProgressBar pct={plan.pct} /></div>
        <span className="text-[11.5px] font-medium">{plan.pct} %</span>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 text-[11px] text-dim">
        <span>{plan.subplans} {plan.subplans === 1 ? "subplan" : "subplanes"}</span>
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
      <CalendarDays size={22} className="mx-auto text-faint" />
      <p className="mt-2 text-[13.5px] font-medium">Aún no tienes ningún plan</p>
      <p className="mx-auto mt-1 max-w-[560px] text-[12.5px] text-dim">
        Un plan reparte los temas que necesitas por semanas en el periodo que elijas (una semana, dos meses, fechas a medida), agrupados en subplanes por área y
        objetivo, con las metas que debes cumplir y un entregable (un proyecto) que demuestre que lo lograste. Cada plan tendrá su propia sub-interfaz y de ellos
        sale tu plan de cada día en «Hoy».
      </p>
      {!aiConfigured && <p className="mx-auto mt-2 max-w-[520px] text-[12px] text-warn">La IA no está configurada: se generará un plan automático con tus metas y materias.</p>}
      <div className="mt-3 flex justify-center">
        <PrimaryButton onClick={onCreate}>
          ＋ Crear mi primer plan
        </PrimaryButton>
      </div>
    </div>
  );
}

// ── Borrador pendiente ───────────────────────────────────────────────────

export function draftPeriod(d: MentorPlanDraft): string {
  return d.preconditions && d.start && d.end ? periodLabel(d.start, d.end) : monthLabel(d.month);
}

export function PlanDraftCard({ draft, accepting, onAccept, onDiscard }: { draft: MentorPlanDraft; accepting: boolean; onAccept: () => void; onDiscard: () => void }) {
  const [cal, setCal] = useState(false);
  const topics = draft.subplans.reduce((n, s) => n + s.topics.length, 0);
  const weeks = draft.subplans[0]?.weeks ?? [];
  const pre = draft.preconditions;
  return (
    <section className="rounded-xl border-2 border-accent/60 bg-card p-4" data-testid="plan-draft" aria-label="Borrador del plan">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-[14px] font-semibold">Borrador del plan {pre ? "del" : "de"} {draftPeriod(draft)}</h2>
        {draft.auto ? <Chip colour="var(--nv-warn)">Plan automático</Chip> : <Chip colour="var(--nv-accent)">Propuesto por el Mentor</Chip>}
        <span className="text-[12px] text-faint">
          {draft.subplans.length} subplanes · {topics} temas · {draft.hoursPerWeek} h/semana · {hm(draft.totalMinutes)} de {hm(draft.availableMinutes)}
        </span>
      </div>
      {pre && (
        <p className="mt-1 text-[11.5px] text-faint" data-testid="draft-preconditions">
          {num1(pre.minutesPerDay / 60)} h/día · {pre.studyDays.map((d) => DAY_SHORT[d - 1]).join("")} · ritmo {pre.pace}
          {pre.blockedDates?.length ? ` · ${pre.blockedDates.length} fechas bloqueadas` : ""} · {pre.deliverables ? "con entregables" : "sin entregables"}
        </p>
      )}
      {draft.rationale && <p className="mt-1.5 text-[12.5px] text-dim">{draft.rationale}</p>}
      {draft.coverage && <p role="status" className={cn("mt-1.5 text-[12px]", draft.fits ? "text-mint" : "text-warn")}>{draft.coverage}</p>}
      {draft.warnings.map((w) => (
        <p key={w} role="status" className="mt-1.5 text-[12px] text-warn">{w}</p>
      ))}
      {draft.fallbackReason && <p className="mt-1.5 text-[11.5px] text-faint">Se usó el plan automático porque: {draft.fallbackReason}</p>}
      {draft.discarded.length > 0 && (
        <p className="mt-1.5 text-[11.5px] text-faint">Descartado por no existir en tu sistema: {draft.discarded.join(", ")}.</p>
      )}
      <ul className="mt-3 grid gap-2 @3xl:grid-cols-2">
        {draft.subplans.map((s) => (
          <li key={s.id} className="rounded-lg border border-line p-2.5 text-[12.5px]">
            <div className="font-semibold">{s.area}{s.objective ? <span className="font-normal text-dim"> · {s.objective}</span> : null}</div>
            <div className="text-[11.5px] text-faint">
              {s.topics.length} temas{s.requiredGoals.length ? ` · ${s.requiredGoals.length} ${s.requiredGoals.length === 1 ? "meta requerida" : "metas requeridas"}` : ""}
              {s.deliverable ? ` · entregable: ${s.deliverable.title}` : ""}
            </div>
            {s.notes && <div className="mt-0.5 text-[11.5px] text-dim">{s.notes}</div>}
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
                <div className="font-medium">Semana {w.week} <span className="font-normal text-faint">· {shortWeekLabel(w.start, w.end)}</span></div>
                <ul className="mt-1 space-y-0.5 text-dim">
                  {draft.subplans.flatMap((s) =>
                    s.topics.filter((t) => t.targetWeek === i + 1).map((t) => (
                      <li key={`${s.id}:${t.folder}`}>
                        <span className="text-text">{t.title}</span> · {s.area} · {hm(t.estMinutes)}{t.diagnostic ? " · diagnóstico inicial" : ""}
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

// ── Sub-interfaz de un plan ──────────────────────────────────────────────

function PlanView({ planId }: { planId: string }) {
  const [tab, setTab] = useState<"plan" | "semana">("plan");
  const { data, warming, error, reload, setData } = usePlanData(planId);
  const renamePlan = useMentor((s) => s.renamePlan);
  const archivePlan = useMentor((s) => s.archivePlan);
  const deletePlan = useMentor((s) => s.deletePlan);
  const plan = data?.plan ?? null;
  const row = data?.plans.find((p) => p.id === planId);
  const summary = data?.derived?.summary;

  const rename = async () => {
    if (!plan) return;
    const next = await askText("Nombre del plan", row?.name ?? "", "Guardar");
    if (next === null) return;
    await renamePlan(plan.id, next);
  };
  const remove = async () => {
    if (!plan) return;
    const ok = await confirmAction("Eliminar plan", `«${row?.name ?? plan.id}» irá a la papelera de la vault (no se borra de forma definitiva). Tus temas, metas y proyectos no se tocan.`, "Eliminar", true);
    if (ok) await deletePlan(plan.id);
  };

  return (
    <PanelPage
      title={row?.name ?? "Mentor — Plan"}
      subtitle={plan ? `${periodLabel(plan.start, plan.end)} · ${weeksLabel(Math.round(((Date.parse(plan.end) - Date.parse(plan.start)) / 86400000 + 1) / 7 * 10) / 10)}` : "El plan por áreas y objetivos. El estado sale de tu práctica; solo el entregable se marca aquí."}
      wide
      action={
        plan && (
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Acciones del plan">
            <GhostButton onClick={() => void rename()}>
              <Pencil size={13} /> Renombrar
            </GhostButton>
            <GhostButton onClick={() => void archivePlan(plan.id, !plan.archived)}>
              {plan.archived ? <ArchiveRestore size={13} /> : <Archive size={13} />} {plan.archived ? "Reactivar" : "Terminar / archivar"}
            </GhostButton>
            <GhostButton danger onClick={() => void remove()}>
              <Trash2 size={13} /> Eliminar
            </GhostButton>
          </div>
        )
      }
    >
      <LoadState warming={warming} error={error} empty={!data} onRetry={() => void reload()} />

      {data && !plan && (
        <div className="rounded-xl border border-dashed border-line p-6 text-center text-[12.5px] text-faint" data-testid="plan-missing">
          Este plan ya no existe.{" "}
          <button type="button" className="text-accent-text hover:underline" onClick={() => useNavState.getState().set("mentor.view", "plan")}>
            Volver al resumen de planes
          </button>
        </div>
      )}

      {data && plan && summary && (
        <>
          <PlanHeader plan={plan} status={data.status ?? "activo"} summary={summary} />
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex-1" />
            <div className="inline-flex rounded-lg border border-line p-0.5 text-[12.5px]" role="tablist" aria-label="Vista del plan">
              {(["plan", "semana"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  role="tab"
                  aria-selected={tab === t}
                  onClick={() => setTab(t)}
                  className={cn("rounded-md px-2.5 py-1", tab === t ? "bg-accent-soft text-accent-text" : "text-dim hover:text-text")}
                >
                  {t === "plan" ? "Plan" : "Esta semana / Hoy"}
                </button>
              ))}
            </div>
          </div>
          {tab === "plan" && data.derived && <PlanBody data={data} onChanged={(p) => setData({ ...data, plan: p })} />}
          {tab === "semana" && <ThisWeek items={data.items} activePlans={data.plans.filter((p) => p.status === "activo").length} />}
        </>
      )}
    </PanelPage>
  );
}

/** Cabecera compacta: estado, progreso y las precondiciones con las que se creó el plan. */
function PlanHeader({ plan, status, summary }: { plan: MentorPlanData; status: MentorPlanStatus; summary: NonNullable<Loaded["derived"]>["summary"] }) {
  const pre = plan.preconditions;
  const state = plan.archived ? ("terminado" as const) : status;
  const weeksText = state === "activo" ? `semana ${summary.currentWeek} de ${summary.weeks}` : state === "futuro" ? `empieza el ${dayText(plan.start)}` : `terminó el ${dayText(plan.end)}`;
  return (
    <section className="rounded-xl border border-line bg-card p-3.5" data-testid="plan-header" aria-label="Datos del plan">
      <div className="flex flex-wrap items-center gap-2">
        <Chip colour={STATUS_COLOUR[state]}>{plan.archived ? "Archivado" : STATUS_LABEL[state]}</Chip>
        {plan.auto && <Chip colour="var(--nv-warn)">Plan automático</Chip>}
        <span className="text-[12.5px] text-dim" data-testid="plan-summary">
          {summary.subplans} {summary.subplans === 1 ? "subplan" : "subplanes"} · {summary.done}/{summary.topics} temas completados · {summary.pct}% global · {weeksText}
        </span>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <div className="flex-1"><ProgressBar pct={summary.pct} /></div>
        <span className="text-[11.5px] font-medium">{summary.pct} %</span>
      </div>
      <ul className="mt-2.5 flex flex-wrap gap-1.5 text-[11.5px] text-dim" data-testid="plan-preconditions" aria-label="Precondiciones del plan">
        <li className="rounded-md border border-line px-2 py-0.5">Periodo: {periodLabel(plan.start, plan.end)}</li>
        {pre ? (
          <>
            <li className="rounded-md border border-line px-2 py-0.5">{num1(pre.minutesPerDay / 60)} h/día</li>
            <li className="rounded-md border border-line px-2 py-0.5">Días: {DAY_SHORT.filter((_, i) => pre.studyDays.includes(i + 1)).join(" ")}</li>
            <li className="rounded-md border border-line px-2 py-0.5">Ritmo: {PACE_LABEL[pre.pace]}</li>
            {pre.blockedDates?.length ? <li className="rounded-md border border-line px-2 py-0.5">{pre.blockedDates.length} fechas bloqueadas</li> : null}
          </>
        ) : plan.hoursPerWeek ? (
          <li className="rounded-md border border-line px-2 py-0.5">{plan.hoursPerWeek} h/semana</li>
        ) : null}
        {plan.hoursPerWeek && pre ? <li className="rounded-md border border-line px-2 py-0.5">~{num1(plan.hoursPerWeek)} h/semana efectivas</li> : null}
      </ul>
      {plan.rationale && <p className="mt-2 text-[12px] text-dim">{plan.rationale}</p>}
    </section>
  );
}

// ── Plan: una fila por área, una tarjeta por subplan ─────────────────────

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
              <SubplanCard key={s.id} planId={plan.id} sub={s} view={views[i]!} data={data} open={open.has(s.id)} onToggle={() => toggle(s.id)} onChanged={onChanged} colour={PALETTE[idx % PALETTE.length]!} />
            ))}
          </AreaRow>
        );
      })}
    </div>
  );
}

export function SubplanCard({
  planId, sub, view, data, open, onToggle, onChanged, colour,
}: {
  planId: string;
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
      onChanged(await api.mentorPlanUpdateDeliverable({ id: planId, subplanId: sub.id, status }));
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
          {sub.notes && <p className="text-dim">{sub.notes}</p>}

          <section aria-label="Semanas">
            <h4 className="mb-1 font-mono text-[10.5px] uppercase tracking-wider text-faint">Semanas</h4>
            <ol className="space-y-1">
              {sub.weeks.map((w) => (
                <li key={w.week} className={cn("rounded-md border px-2 py-1", w.week === view.currentWeek ? "border-accent bg-accent-soft" : "border-line")} data-testid="plan-week">
                  <span className="font-medium">Sem. {w.week}</span> <span className="text-faint">{shortWeekLabel(w.start, w.end)}</span>
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
                    {t.diagnostic && <Chip colour="var(--nv-accent)">Diagnóstico inicial</Chip>}
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

// ── Esta semana / Hoy (todos los planes activos) ─────────────────────────

export function ThisWeek({ items, activePlans }: { items: MentorPlanItem[]; activePlans: number }) {
  const setPending = useMentor((s) => s.setPendingObjective);
  const planDay = () => {
    setPending({ type: "plan" });
    useNavState.getState().set("mentor.view", "hoy");
  };
  if (activePlans === 0) {
    return <p className="rounded-xl border border-dashed border-line p-4 text-center text-[12.5px] text-faint" data-testid="plan-week-empty">«Esta semana» solo existe cuando hay un plan activo hoy.</p>;
  }
  return (
    <section className="rounded-xl border border-line bg-card p-4" data-testid="plan-this-week" aria-label="Esta semana">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-[14px] font-semibold">Esta semana y hoy <span className="text-[11.5px] font-normal text-faint">({activePlans} {activePlans === 1 ? "plan activo" : "planes activos"} combinados)</span></h2>
        <span className="flex-1" />
        <PrimaryButton onClick={planDay} disabled={!items.length}>
          Planear mi día con esto
        </PrimaryButton>
      </div>
      {items.length === 0 ? (
        <p className="mt-3 text-[12.5px] text-faint">Nada pendiente de tus planes para esta semana. Si quieres adelantar, pídele un plan de hoy al Mentor.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {items.map((it) => (
            <li key={`${it.planId}:${it.subplanId}:${it.folder ?? "deliverable"}`} className="rounded-lg border border-line p-2.5" data-testid="plan-week-item">
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
