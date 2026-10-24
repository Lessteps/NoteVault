// Mentor — Plan, Agenda: piezas compartidas por las vistas Día · Semana · Mes · Calendario (modelo de la agenda, etiquetas, chips de
// estado y de entregable, y el propósito editable). Sin datos propios: todo sale del plan y se calcula con `lib/planSchedule.ts`.

import { Pencil, RotateCcw } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { api } from "../../lib/bridge";
import { type PlanDeliverable, type PlanDeliverableKind, type PlanDeliverableStatus } from "../../lib/planAreas";
import { practiceWithProgress } from "../../lib/planChain";
import { areaRowsText, buildSchedule, deliverableAreaRows, deliverablesOf, progressPlan, type PlanSchedule } from "../../lib/planSchedule";
import type { ExistingExercises } from "../../lib/planCurriculum";
import { deliverablesDefined, topicsByWeekArea, type TopicsByWeekArea } from "../../lib/planTopicsByArea";
import type { MentorPlan, MentorTopicView } from "../../lib/types";
import { useApp } from "../../store/app";
import { Chip, GhostButton, input, PrimaryButton } from "../common/forms";
import { cn } from "../ui";
import type { Loaded } from "./planShared";

/** «Backend 12 · Frontend 12 · Databases 5 · Integradores 8»: el desglose por ÁREA de una lista de entregables (la suma de las partes es el total). */
export function AreaCounts({ plan, list, testid = "area-counts" }: { plan: { subplans: ReadonlyArray<{ areaId?: string; area: string }> }; list: readonly PlanDeliverable[]; testid?: string }) {
  const rows = deliverableAreaRows(list, plan.subplans.filter((s) => s.areaId).map((s) => ({ id: s.areaId!, name: s.area })));
  if (rows.length < 2 && !(rows.length === 1 && rows[0]!.id !== "practice")) return null;
  return (
    <span className="mt-0.5 block text-[13.5px] font-normal text-dim" data-testid={testid} aria-label={`Entregables por área: ${areaRowsText(rows)}`}>
      Por área: {areaRowsText(rows)}
    </span>
  );
}

export const KIND_LABEL: Record<PlanDeliverableKind, string> = { kata: "Kata", weekly_project: "Proyecto semanal", monthly_project: "Proyecto mensual", area_project: "Proyecto de área", daily_project: "Proyecto diario", topic_project: "Proyecto del tema" };
export const KIND_COLOUR: Record<PlanDeliverableKind, string> = { kata: "var(--nv-practice, #c58be0)", weekly_project: "var(--nv-practice, #c58be0)", monthly_project: "var(--nv-practice, #c58be0)", area_project: "var(--nv-accent)", daily_project: "var(--nv-practice, #c58be0)", topic_project: "var(--nv-mint)" };
export const DSTATUS_LABEL: Record<PlanDeliverableStatus, string> = { pendiente: "Pendiente", en_curso: "En curso", hecho: "Hecho" };
export const DSTATUS_COLOUR: Record<PlanDeliverableStatus, string> = { pendiente: "var(--nv-faint)", en_curso: "var(--nv-accent)", hecho: "var(--nv-mint)" };
export const DSTATUS_GLYPH: Record<PlanDeliverableStatus, string> = { pendiente: "○", en_curso: "◐", hecho: "●" };

/** Todo lo que las vistas necesitan del plan, calculado una vez. */
export interface AgendaModel {
  plan: MentorPlan;
  today: string;
  schedule: PlanSchedule;
  deliverables: PlanDeliverable[];
  /** entregables por fecha de entrega */
  dueByDate: Map<string, PlanDeliverable[]>;
  /** estado en vivo de cada tema (de la práctica) por carpeta */
  topicByFolder: Map<string, MentorTopicView>;
  /** % de avance de cada subplan */
  pctBySubplan: Map<string, number>;
  practiceStatus: Loaded["practice"];
  /** el Mentor puede tocar propósitos y entregables (no un plan terminado) */
  editable: boolean;
  /** ejercicios que cada tema ya tiene en la vault (la práctica del plan los prioriza) */
  existing: ExistingExercises;
  /** entregable (proyectos incluidos) por id */
  deliverableById: Map<string, PlanDeliverable>;
  /**
   * ¿hay entregables DEFINIDOS? Mientras no (los define la ejecución del plan o se añaden a mano), la Agenda no enseña contadores ni chips de
   * entregables: dice «Entregables: por definir» una sola vez.
   */
  deliverablesDefined: boolean;
  /** los temas de cada semana separados por área (orden fijo de las áreas) */
  byWeekArea: TopicsByWeekArea;
}

/** Color de cada enfoque (marca; el texto siempre acompaña: el color solo no basta). */
export const FOCUS_COLOUR: Record<string, string> = { backend: "#2383e2", databases: "#8e24aa", frontend: "#33b679", logic: "#14b8a6", automation: "#c28a00", tooling: "#e67c73", generic: "#039be5" };
export const focusColour = (id?: string): string => FOCUS_COLOUR[id ?? ""] ?? FOCUS_COLOUR.generic!;

// El reparto y los temas por semana y área dependen del PLAN y del AVANCE REAL (qué temas están completos y qué día es hoy): lo pendiente se
// coloca siempre desde hoy y en el orden de la ruta de cada área (ver `progressPlan`). Se guardan por objeto de plan y por avance, así que
// Ejecución y Agenda (y cada cambio de modo o de pestaña) comparten el mismo cálculo, y se rehace en cuanto cambia el plan, el día o el avance.
type ScheduleHit = { schedule: PlanSchedule; byWeekArea: TopicsByWeekArea };
const scheduleCache = new WeakMap<object, Map<string, ScheduleHit>>();

/** Los temas completos en vivo (estado de la práctica) que el plan aún no tiene anotados como completados, en orden estable. */
export function liveDoneOf(plan: MentorPlan, topicByFolder: ReadonlyMap<string, { state: string }>): string[] {
  const out: string[] = [];
  for (const s of plan.subplans) for (const t of s.topics) if (!t.completedAt && topicByFolder.get(t.folder)?.state === "completo") out.push(t.folder);
  return out.sort();
}

export function scheduleOf(plan: MentorPlan, today?: string, liveDone: readonly string[] = []): ScheduleHit {
  const key = `${today ?? ""}|${liveDone.join(",")}`;
  let per = scheduleCache.get(plan);
  if (!per) scheduleCache.set(plan, (per = new Map()));
  let hit = per.get(key);
  if (!hit) {
    const done = new Set(liveDone);
    const schedule = buildSchedule(today ? progressPlan(plan, { today, isDone: (f) => done.has(f) }) : plan);
    hit = { schedule, byWeekArea: topicsByWeekArea(plan, schedule) };
    if (per.size > 8) per.clear();
    per.set(key, hit);
  }
  return hit;
}

export function useAgendaModel(data: Loaded, plan: MentorPlan): AgendaModel {
  const practice = data.practice ?? null;
  // el avance real manda: los temas completos en vivo y el día de hoy colocan lo que falta (sin que nadie lo ejecute)
  const liveDone = useMemo(() => {
    const st = new Map<string, { state: string }>();
    for (const s of data.derived?.subplans ?? []) for (const t of s.topics) st.set(t.folder, t);
    return liveDoneOf(plan, st);
  }, [plan, data.derived]);
  const liveKey = liveDone.join(",");
  const { schedule, byWeekArea } = useMemo(() => scheduleOf(plan, data.today, liveDone), [plan, data.today, liveKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const del = useMemo(() => {
    const deliverables = deliverablesOf(plan, practiceWithProgress(practice, data.dailyProjectDone), schedule);
    const dueByDate = new Map<string, PlanDeliverable[]>();
    for (const d of deliverables) dueByDate.set(d.dueDate, [...(dueByDate.get(d.dueDate) ?? []), d]);
    return { deliverables, dueByDate, deliverableById: new Map(deliverables.map((d) => [d.id, d] as const)), deliverablesDefined: deliverablesDefined(plan) };
  }, [plan, practice, schedule, data.dailyProjectDone]);
  // el estado en vivo (`data.derived`) cambia de objeto en cada recarga: solo esto se rehace, no el reparto
  const live = useMemo(() => {
    const topicByFolder = new Map<string, MentorTopicView>();
    const pctBySubplan = new Map<string, number>();
    for (const s of data.derived?.subplans ?? []) {
      pctBySubplan.set(s.id, s.pct);
      for (const t of s.topics) topicByFolder.set(t.folder, t);
    }
    const existing: ExistingExercises = { count: (f) => topicByFolder.get(f)?.exercises ?? 0 };
    return { topicByFolder, pctBySubplan, existing };
  }, [data.derived]);
  return useMemo(
    () => ({ plan, today: data.today, schedule, ...del, ...live, practiceStatus: practice, editable: true, byWeekArea }),
    [plan, data.today, schedule, del, live, practice, byWeekArea],
  );
}

export function StatusChip({ status }: { status: PlanDeliverableStatus }) {
  return (
    <Chip large colour={DSTATUS_COLOUR[status]}>
      <span aria-hidden>{DSTATUS_GLYPH[status]}</span> {DSTATUS_LABEL[status]}
    </Chip>
  );
}

/** Un entregable en una lista (día, semana, mes): título, tipo, fecha y estado; con «Abrir práctica» si nace de la práctica. */
export function DeliverableLine({ d, showDate, onOpenPractice }: { d: PlanDeliverable; showDate?: string; onOpenPractice?: () => void }) {
  return (
    <li className="flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-lg border border-line px-3 py-2 text-[14px]" data-testid="agenda-deliverable">
      <span className="min-w-0 flex-1 basis-48 font-medium">{d.title}</span>
      <Chip large colour={KIND_COLOUR[d.kind]}>{KIND_LABEL[d.kind]}</Chip>
      {showDate && <span className="text-[13.5px] text-dim">{showDate}</span>}
      <StatusChip status={d.status} />
      {d.source === "practice" && onOpenPractice && (
        <GhostButton className="ml-auto" onClick={onOpenPractice} aria-label={`Abrir práctica: ${d.title}`}>Abrir práctica</GhostButton>
      )}
    </li>
  );
}

/**
 * La descripción de propósito de un día, semana o mes: el texto determinista (o el que escribiste a mano) con «Editar propósito».
 * Al guardar queda en el plan (`purposes`); «Volver al automático» lo borra.
 */
export function PurposeBlock({ planId, scope, keyName, text, auto, manual, editable, onChanged, label }: {
  planId: string; scope: "day" | "week" | "month"; keyName: string; text: string; auto: string; manual: boolean; editable: boolean; onChanged: (p: MentorPlan) => void; label: string;
}) {
  const toast = useApp((s) => s.toast);
  const uid = useId();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(text);
  const [busy, setBusy] = useState(false);
  const save = async (value: string) => {
    setBusy(true);
    try {
      onChanged(await api.mentorPlanSetPurpose({ id: planId, scope, key: keyName, text: value }));
      setEditing(false);
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="rounded-xl border border-line bg-surface px-3.5 py-3" data-testid="agenda-purpose">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <h3 className="text-[13px] font-semibold uppercase tracking-wider text-faint">Propósito</h3>
        {manual && <Chip large colour="var(--nv-accent)">Editado a mano</Chip>}
        <span className="flex-1" />
        {editable && !editing && (
          <button type="button" onClick={() => { setDraft(text); setEditing(true); }} aria-label={`Editar propósito: ${label}`} className="inline-flex min-h-9 items-center gap-1.5 rounded-md px-2 text-[14px] text-accent-text underline-offset-2 hover:underline">
            <Pencil size={14} aria-hidden /> Editar propósito
          </button>
        )}
      </div>
      {editing ? (
        <div className="mt-2 space-y-2">
          <label htmlFor={`${uid}-t`} className="sr-only">Propósito de {label}</label>
          <textarea id={`${uid}-t`} value={draft} onChange={(e) => setDraft(e.target.value.slice(0, 300))} rows={3} className={cn(input, "min-h-20 resize-y text-[15px]")} />
          <div className="flex flex-wrap items-center gap-2">
            <PrimaryButton large disabled={busy} onClick={() => void save(draft)}>Guardar propósito</PrimaryButton>
            <GhostButton large onClick={() => setEditing(false)}>Cancelar</GhostButton>
            {manual && (
              <GhostButton large disabled={busy} onClick={() => void save("")} title={auto}>
                <RotateCcw size={15} aria-hidden /> Volver al automático
              </GhostButton>
            )}
            <span className="text-[13.5px] text-faint">{draft.length}/300</span>
          </div>
        </div>
      ) : (
        <p className="mt-1 text-[15px] leading-relaxed text-text" data-testid="agenda-purpose-text">{text}</p>
      )}
    </div>
  );
}

/** El nombre de un área con su color como marca (el texto va en el color normal: el color solo no basta para el contraste en tema claro). */
export function AreaChip({ colour, children }: { colour: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-line px-2 py-0.5 text-[13px] font-medium text-text">
      <span aria-hidden className="inline-block h-2.5 w-2.5 flex-none rounded-sm" style={{ background: colour }} />
      {children}
    </span>
  );
}

export const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;
/** «1 hecho» / «3 hechos». */
export const doneText = (n: number): string => plural(n, "hecho", "hechos");
