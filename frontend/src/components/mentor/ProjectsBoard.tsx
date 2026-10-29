// Mentor — PROYECTOS, ordenados: tres niveles (mensual · semanal · diario) con su desarrollo y lo que FALTA, una lista de proyectos mensuales y, al abrir uno,
// una ventana propia con TODO su material y su progreso (producto, hitos, semanas y piezas, archivos y el proyecto real del módulo Proyectos). Lo usan la
// Planeación («Entregables») y la Ejecución («Proyectos»): el avance sale de la cadena del plan (las casillas de las carpetas), nunca se marca a mano.

import { AlertTriangle, ArrowRight, Check, Circle, ExternalLink, FolderKanban, Lock, Pencil, Plus, Target, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../lib/bridge";
import { weeklyBreakdown } from "../../lib/planAreaPractice";
import { chainProgressText, lockText, type ChainMonth, type ChainPiece, type ChainWeek } from "../../lib/planChain";
import { shortOf } from "../../lib/planCurriculum";
import { dateLabel } from "../../lib/planSchedule";
import { todayIso } from "../../lib/tasks";
import { useApp } from "../../store/app";
import { useMentor } from "../../store/mentor";
import { useProjects } from "../../store/projects";
import { Chip, GhostButton, Modal, PrimaryButton } from "../common/forms";
import { cn, confirmAction } from "../ui";
import { AreaSections } from "./AreaSections";
import { DSTATUS_COLOUR, plural, StatusChip } from "./agendaKit";
import { useDeliverableChain } from "./MonthlyDeliverables";
import { ProgressBar } from "./parts";
import { NewProjectDialog } from "./NewProjectDialog";
import { ProjectFolder } from "./ProjectFolder";
import { ProjectsHub } from "./ProjectsHub";
import type { PlanDeliverable } from "../../lib/planAreas";
import type { Loaded } from "./planShared";

type RealLink = { projectId: string; name: string; issues: { total: number; done: number }; monthId: string };
const DETAIL_TABS = [
  { id: "resumen", label: "Resumen" },
  { id: "semanas", label: "Semanas y piezas" },
  { id: "archivos", label: "Archivos" },
  { id: "real", label: "Proyecto real" },
] as const;
type DetailTab = (typeof DETAIL_TABS)[number]["id"];

/** Los temas que aplica un hito: unos pocos y «+N más» (un mes junta cientos). */
const topicsText = (topics: readonly string[], max = 8): string => `${topics.slice(0, max).join(" · ")}${topics.length > max ? ` · +${topics.length - max} más` : ""}`;

const pieceLate = (p: ChainPiece, today: string): boolean => !p.done && p.date < today;

/** Qué falta de un mes: piezas, semanas y las atrasadas. */
export function monthMissing(m: ChainMonth, today: string): { pieces: number; weeks: number; late: number } {
  const pieces = m.weeks.flatMap((w) => w.pieces);
  return { pieces: pieces.filter((p) => !p.done).length, weeks: m.weeks.filter((w) => w.status !== "hecho").length, late: pieces.filter((p) => pieceLate(p, today)).length };
}

function LevelCard({ label, done, total, hint, testid }: { label: string; done: number; total: number; hint: string; testid: string }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div className="min-w-0 rounded-xl border border-line bg-card px-4 py-3" data-testid={testid}>
      <p className="text-[12.5px] font-semibold uppercase tracking-wider text-faint">{label}</p>
      <p className="mt-0.5 text-[22px] font-semibold leading-snug">{done}<span className="text-[15px] font-normal text-dim"> / {total}</span> <span className="text-[14px] font-normal text-dim">· {pct} %</span></p>
      <div className="mt-1.5"><ProgressBar pct={pct} label={`Desarrollo ${label.toLowerCase()}`} /></div>
      <p className="mt-1.5 text-[13px] text-dim">{hint}</p>
    </div>
  );
}

function PieceLine({ p, today }: { p: ChainPiece; today: string }) {
  const late = pieceLate(p, today);
  return (
    <li className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-line px-3 py-1.5 text-[14px]" data-testid="board-piece" data-done={p.done ? "true" : "false"}>
      <span aria-hidden className={cn("grid h-5 w-5 flex-none place-items-center rounded-full border", p.done ? "border-mint bg-mint-soft" : late ? "border-warn text-warn" : "border-line text-faint")}>{p.done ? <Check size={12} /> : <Circle size={8} />}</span>
      <span className="min-w-0 flex-1 basis-52 break-words font-medium">{p.title}</span>
      <span className="text-[13px] text-dim">{dateLabel(p.date)} · pieza {p.n} de {p.of}</span>
      <Chip colour={p.done ? DSTATUS_COLOUR.hecho : p.current ? "var(--nv-accent)" : late ? "var(--nv-warn)" : DSTATUS_COLOUR.pendiente}>{p.done ? "Hecha" : p.current ? "Te toca" : late ? "Atrasada" : "Pendiente"}</Chip>
    </li>
  );
}

function WeekPanel({ w, plan, today }: { w: ChainWeek; plan: { id: string; subplans: Array<{ areaId?: string; id: string }> }; today: string }) {
  const areaIds = w.areaIds.length ? w.areaIds : [...new Set(plan.subplans.map((s) => s.areaId).filter((x): x is string => !!x))];
  const sections = useMemo(() => weeklyBreakdown(areaIds, w.week, w.pieces.map((p) => shortOf(p.title))), [areaIds, w]);
  const missing = w.pieces.filter((p) => !p.done).length;
  return (
    <li className="rounded-xl border border-line bg-surface" data-testid="board-week" data-status={w.status}>
      <details className="group" open={w.status === "en_curso"}>
        <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-2 gap-y-1 px-3.5 py-2.5">
          <span className="min-w-0 flex-1 basis-56 break-words text-[15px] font-semibold">{w.title}</span>
          {w.locked ? <Chip colour="var(--nv-faint)"><Lock size={12} aria-hidden /> {lockText("week", w.lockedBy ?? w.week - 1)}</Chip> : <StatusChip status={w.status} />}
          <span className="text-[13px] text-dim">{chainProgressText(w.done, w.total)}{missing ? ` · faltan ${missing}` : ""}</span>
        </summary>
        <div className="space-y-2 px-3.5 pb-3">
          <p className="text-[14px] text-dim">{w.description}</p>
          {w.milestone?.topics.length ? <p className="text-[13px] text-faint">Aplica: {topicsText(w.milestone.topics)}</p> : null}
          <ProgressBar pct={w.pct} label={`Avance de la semana ${w.week}`} />
          {w.pieces.length === 0 ? <p className="text-[14px] text-dim">Esta semana no tiene piezas diarias: su proyecto se completa con las fases de práctica.</p> : <ol className="space-y-1.5" aria-label={`Piezas de la semana ${w.week}`}>{w.pieces.map((p) => <PieceLine key={p.id} p={p} today={today} />)}</ol>}
          {sections.length > 0 && (
            <details>
              <summary className="cursor-pointer text-[14px] font-medium text-accent-text">Qué hay que hacer en cada área</summary>
              <AreaSections sections={sections} testid="board-week-areas" />
            </details>
          )}
        </div>
      </details>
    </li>
  );
}

/** La ventana de UN proyecto mensual: todo su material y su progreso. */
export function ProjectDetail({ month, data, link, onLink, onClose }: { month: ChainMonth; data: Loaded; link: RealLink | undefined; onLink: (l: RealLink) => void; onClose: () => void }) {
  const toast = useApp((s) => s.toast);
  const plan = data.plan!;
  const [tab, setTab] = useState<DetailTab>("resumen");
  const [busy, setBusy] = useState(false);
  const today = todayIso();
  const miss = monthMissing(month, today);
  const allKeys = plan.subplans.map((x) => x.areaId ?? x.id);
  const createReal = async (): Promise<void> => {
    setBusy(true);
    try {
      const r = await api.mentorPlanProjectCreate({ planId: plan.id, monthId: month.id });
      onLink(r.link);
      toast("info", r.created ? `Proyecto «${r.link.name}» creado en el módulo Proyectos, con ${r.link.issues.total} issues.` : "Ese proyecto ya existe en el módulo Proyectos.");
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const openReal = async (): Promise<void> => {
    if (!link) return;
    await useProjects.getState().open(link.projectId);
    useApp.getState().setModule("proyectos");
  };
  return (
    <Modal title={month.title} onClose={onClose} width={1100}>
      <div data-testid="project-detail" className="space-y-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <StatusChip status={month.status} />
          <span className="text-[13.5px] text-dim">Mes {month.n} de {month.of} · {dateLabel(month.start)} – {dateLabel(month.end)} · se entrega el {dateLabel(month.dueDate)}</span>
        </div>
        <div className="grid gap-3 @2xl:grid-cols-3">
          <LevelCard label="Mensual" done={month.weeksDone} total={month.weeks.length} hint="semanas completadas" testid="detail-level-month" />
          <LevelCard label="Semanal" done={month.weeks.filter((w) => w.status === "hecho").length} total={month.weeks.length} hint={miss.weeks ? `faltan ${plural(miss.weeks, "semana", "semanas")}` : "todas hechas"} testid="detail-level-week" />
          <LevelCard label="Diario" done={month.done} total={month.total} hint={miss.pieces ? `faltan ${plural(miss.pieces, "pieza", "piezas")}${miss.late ? ` · ${miss.late} atrasadas` : ""}` : "todas hechas"} testid="detail-level-day" />
        </div>
        <div className="flex gap-1 border-b border-line" role="group" aria-label="Secciones del proyecto">
          {DETAIL_TABS.map((t) => (
            <button key={t.id} type="button" aria-pressed={tab === t.id} onClick={() => setTab(t.id)} data-testid={`detail-tab-${t.id}`} className={cn("-mb-px min-h-9 border-b-2 px-3 text-[14px] font-medium", tab === t.id ? "border-accent text-accent-text" : "border-transparent text-dim hover:text-text")}>{t.label}</button>
          ))}
        </div>

        {tab === "resumen" && (
          <div className="space-y-3" data-testid="detail-resumen">
            <p className="text-[14.5px]">{month.goal}</p>
            <section aria-label="Cuándo está hecho">
              <h4 className="text-[14px] font-semibold">Cuándo está hecho</h4>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[14px] text-dim">{month.criteria.map((c) => <li key={c}>{c}</li>)}</ul>
            </section>
            <section aria-label="Hitos del producto">
              <h4 className="text-[14px] font-semibold">Hitos del producto y los temas que consolida</h4>
              <ul className="mt-1.5 space-y-1.5">
                {month.weeks.map((w) => (
                  <li key={w.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-line px-3 py-2 text-[14px]">
                    <Target size={14} aria-hidden className="flex-none text-accent-text" />
                    <span className="min-w-0 flex-1 basis-56"><span className="font-medium">Semana {w.week} · {w.milestone?.title ?? w.title}</span>{w.milestone?.topics.length ? <span className="block text-[13px] text-dim">Aplica: {topicsText(w.milestone.topics)}</span> : null}</span>
                    <StatusChip status={w.status} />
                  </li>
                ))}
              </ul>
            </section>
          </div>
        )}

        {tab === "semanas" && (
          <div className="space-y-2" data-testid="detail-semanas">
            <p className="text-[14px] text-dim" data-testid="detail-missing">{miss.pieces ? `Faltan ${plural(miss.pieces, "pieza diaria", "piezas diarias")} y ${plural(miss.weeks, "semana", "semanas")} por cerrar${miss.late ? ` · ${miss.late} atrasadas` : ""}.` : "No falta nada: todas las piezas están hechas."}</p>
            <ol className="space-y-2" aria-label="Semanas del proyecto">{month.weeks.map((w) => <WeekPanel key={w.id} w={w} plan={plan} today={today} />)}</ol>
          </div>
        )}

        {tab === "archivos" && (
          <div className="space-y-3" data-testid="detail-archivos">
            <ProjectFolder planId={plan.id} areaKeys={allKeys} testid="monthly-project-folder" project={{ kind: "monthly", title: month.title, description: month.goal, month: month.month, topics: month.topics.slice(0, 8), sections: [] }} />
            <ProjectsHub planId={plan.id} />
          </div>
        )}

        {tab === "real" && (
          <div className="space-y-2 rounded-xl border border-line p-3.5" data-testid="detail-real">
            <h4 className="flex items-center gap-2 text-[15px] font-semibold"><FolderKanban size={16} aria-hidden /> El proyecto en el módulo Proyectos</h4>
            {link ? (
              <>
                <p className="text-[14px] text-dim">«{link.name}» ya existe como proyecto real: sus hitos semanales son issues y las piezas diarias cuelgan de ellos. Cuando completas una pieza, su issue pasa a «hecho» solo.</p>
                <ProgressBar pct={link.issues.total ? (link.issues.done / link.issues.total) * 100 : 0} label="Issues hechos del proyecto real" />
                <p className="text-[13px] text-dim">{link.issues.done} de {link.issues.total} issues hechos</p>
                <GhostButton large="md" onClick={() => void openReal()} data-testid="detail-open-real"><ExternalLink size={15} aria-hidden /> Abrir en Proyectos</GhostButton>
              </>
            ) : (
              <>
                <p className="text-[14px] text-dim">Este entregable todavía no es un proyecto de verdad. Créalo y tendrás un proyecto en el módulo Proyectos con su descripción, un issue por hito semanal y uno por pieza diaria, con sus fechas.</p>
                <PrimaryButton large onClick={() => void createReal()} disabled={busy} data-testid="detail-create-real"><FolderKanban size={15} aria-hidden /> Crear el proyecto real</PrimaryButton>
              </>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

/** Un proyecto PROPIO del plan: editar, quitar y —como los mensuales— crearlo como proyecto real; su avance sale de los issues de ese proyecto (nunca a mano). */
function OwnProject({ d, plan, link, onEdit, onLink }: { d: PlanDeliverable; plan: Loaded["plan"] & object; link: RealLink | undefined; onEdit: () => void; onLink: (l: RealLink) => void }) {
  const toast = useApp((s) => s.toast);
  const [busy, setBusy] = useState(false);
  const status = link && link.issues.total > 0 ? (link.issues.done >= link.issues.total ? "hecho" : link.issues.done > 0 ? "en_curso" : "pendiente") : "pendiente";
  const remove = async (): Promise<void> => {
    if (!(await confirmAction("Quitar el proyecto", `«${d.title}» sale del plan (no se borra el proyecto real del módulo Proyectos, si lo creaste). Se puede deshacer desde «Preguntas y ajustes».`, "Quitar", true))) return;
    setBusy(true);
    try {
      const body = { id: plan.id, label: `Quitar el proyecto «${d.title}»`, ops: [{ op: "remove_deliverable", id: d.id }] };
      let r = await api.mentorPlanChange(body);
      for (let i = 0; r.loading && i < 40; i++) {
        await new Promise((ok) => setTimeout(ok, 1500));
        r = await api.mentorPlanChange(body);
      }
      if (!r.loading) useMentor.setState((st) => ({ planVersion: st.planVersion + 1 }));
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const makeReal = async (): Promise<void> => {
    setBusy(true);
    try {
      const r = await api.mentorPlanProjectCreate({ planId: plan.id, monthId: d.id });
      onLink(r.link);
      toast("info", r.created ? `Proyecto «${r.link.name}» creado en el módulo Proyectos, con ${r.link.issues.total} issues (uno por criterio).` : "Ese proyecto ya existe en el módulo Proyectos.");
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const openReal = async (): Promise<void> => {
    if (!link) return;
    await useProjects.getState().open(link.projectId);
    useApp.getState().setModule("proyectos");
  };
  return (
    <li className="min-w-0 space-y-1.5 rounded-2xl border border-line bg-card p-4" data-testid="board-own-project" data-status={status}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1"><span className="min-w-0 flex-1 basis-48 break-words text-[15.5px] font-semibold">{d.title}</span><StatusChip status={status} /></div>
      <p className="text-[13px] text-faint">Se entrega el {dateLabel(d.dueDate)}{d.areaId ? ` · ${plan.subplans.find((s) => (s.areaId ?? s.id) === d.areaId)?.area ?? d.areaId}` : ""}</p>
      {d.description && <p className="text-[14px] text-dim">{d.description}</p>}
      {d.criteria.length > 0 && <ul className="list-disc space-y-0.5 pl-5 text-[13.5px] text-dim">{d.criteria.map((c) => <li key={c}>{c}</li>)}</ul>}
      {link ? <><ProgressBar pct={link.issues.total ? (link.issues.done / link.issues.total) * 100 : 0} label={`Avance de ${d.title}`} /><p className="text-[12.5px] text-dim">{link.issues.done} de {link.issues.total} issues hechos (se marcan en el módulo Proyectos)</p></> : <p className="text-[12.5px] text-faint">Créalo como proyecto real para seguir su avance: el estado se calcula, no se marca a mano.</p>}
      <div className="flex flex-wrap gap-2 pt-1">
        {link ? <GhostButton onClick={() => void openReal()} data-testid="own-open-real"><ExternalLink size={14} aria-hidden /> Abrir en Proyectos</GhostButton> : <PrimaryButton onClick={() => void makeReal()} disabled={busy} data-testid="own-create-real"><FolderKanban size={14} aria-hidden /> Crear como proyecto real</PrimaryButton>}
        <GhostButton onClick={onEdit} disabled={busy} data-testid="own-edit"><Pencil size={14} aria-hidden /> Editar</GhostButton>
        <GhostButton onClick={() => void remove()} disabled={busy} data-testid="own-remove"><Trash2 size={14} aria-hidden /> Quitar</GhostButton>
      </div>
    </li>
  );
}

export function ProjectsBoard({ data, mode }: { data: Loaded; mode: "planeacion" | "ejecucion" }) {
  const plan = data.plan!;
  const chain = useDeliverableChain(data);
  const today = todayIso();
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<PlanDeliverable | null>(null);
  const [links, setLinks] = useState<Record<string, RealLink>>({});
  const loadLinks = useCallback(() => {
    Promise.resolve()
      .then(() => api.mentorPlanProjectLinks({ planId: plan.id }))
      .then((r) => setLinks(r?.links ?? {}))
      .catch(() => setLinks({}));
  }, [plan.id]);
  useEffect(loadLinks, [loadLinks]);

  const months = chain.months;
  const weeks = months.flatMap((m) => m.weeks);
  const pieces = weeks.flatMap((w) => w.pieces);
  const late = pieces.filter((p) => pieceLate(p, today)).length;
  const next = pieces.find((p) => p.current);
  const current = months.find((m) => m.weeks.some((w) => w.pieces.some((p) => p.current))) ?? months.find((m) => m.status !== "hecho") ?? months[0];
  const open = months.find((m) => m.id === openId);
  const own = (plan.deliverables ?? []).filter((d) => d.id.startsWith("x:"));

  if (!months.length) {
    return (
      <section aria-label="Proyectos" data-testid="projects-board-empty" className="rounded-xl border border-dashed border-line p-4 text-[14px] text-dim">
        Este plan aún no tiene días de estudio con proyecto: cuando los tenga, aquí aparecen los proyectos mensual, semanal y diario.
      </section>
    );
  }
  return (
    <section aria-labelledby="board-h" data-testid="projects-board" data-mode={mode} className="space-y-4">
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
        <div className="min-w-0 flex-1 basis-72">
        <h3 id="board-h" className="text-[18px] font-semibold">Proyectos</h3>
        <p className="mt-0.5 text-[14px] text-dim">{mode === "ejecucion" ? "Lo que construyes: cada día una pieza, cada semana un hito y cada mes un producto real que consolida lo aprendido." : "Cómo se construye el producto: piezas diarias → hitos semanales → producto mensual. El avance sale solo de lo que completas."}</p>
        </div>
        <GhostButton large="md" onClick={() => setAdding(true)} data-testid="board-new-project"><Plus size={15} aria-hidden /> Nuevo proyecto</GhostButton>
      </div>

      <div className="grid gap-3 @2xl:grid-cols-3" data-testid="board-levels">
        <LevelCard label="Mensual" done={months.filter((m) => m.status === "hecho").length} total={months.length} hint={`${plural(months.length - months.filter((m) => m.status === "hecho").length, "producto por terminar", "productos por terminar")}`} testid="board-level-month" />
        <LevelCard label="Semanal" done={weeks.filter((w) => w.status === "hecho").length} total={weeks.length} hint={`${plural(weeks.filter((w) => w.status !== "hecho").length, "hito por terminar", "hitos por terminar")}`} testid="board-level-week" />
        <LevelCard label="Diario" done={pieces.filter((p) => p.done).length} total={pieces.length} hint={`${plural(pieces.filter((p) => !p.done).length, "pieza por hacer", "piezas por hacer")}${late ? ` · ${late} atrasadas` : ""}`} testid="board-level-day" />
      </div>

      {(next || late > 0) && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-accent/50 bg-accent-soft/20 px-4 py-2.5" data-testid="board-next">
          {next ? <span className="min-w-0 flex-1 basis-64 text-[14.5px]"><span className="font-semibold">Te toca: </span>{next.title} <span className="text-dim">· {dateLabel(next.date)}</span></span> : <span className="flex-1 text-[14.5px]">No hay pieza pendiente.</span>}
          {late > 0 && <Chip colour="var(--nv-warn)"><AlertTriangle size={12} aria-hidden /> {plural(late, "pieza atrasada", "piezas atrasadas")}</Chip>}
          {current && <GhostButton onClick={() => setOpenId(current.id)} data-testid="board-open-current">Abrir el proyecto del mes <ArrowRight size={14} aria-hidden /></GhostButton>}
        </div>
      )}

      <div className="space-y-2">
        <p className="text-[13px] font-medium uppercase tracking-wide text-faint">Entregable del mes · un producto por mes</p>
        <ol className="grid gap-3 @3xl:grid-cols-2" aria-label="Proyectos mensuales" data-testid="board-months">
          {months.map((m) => {
            const miss = monthMissing(m, today);
            const link = links[m.id];
            return (
              <li key={m.id} className={cn("flex min-w-0 flex-col gap-2 rounded-2xl border bg-card p-4", m.id === current?.id ? "border-accent" : "border-line")} data-testid="board-month" data-status={m.status} data-locked={m.locked ? "true" : "false"} data-current={m.id === current?.id ? "true" : "false"}>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="min-w-0 flex-1 basis-56 break-words text-[16px] font-semibold leading-snug">{m.title}</span>
                  {m.locked ? <Chip colour="var(--nv-faint)"><Lock size={12} aria-hidden /> {lockText("month", m.lockedBy ?? m.n - 1)}</Chip> : <StatusChip status={m.status} />}
                </div>
                <p className="text-[13px] text-faint">Mes {m.n} de {m.of} · se entrega el {dateLabel(m.dueDate)}</p>
                <ProgressBar pct={m.pct} label={`Avance de ${m.title}`} />
                <div className="flex flex-wrap gap-1" aria-label="Semanas del mes">
                  {m.weeks.map((w) => <span key={w.id} title={`Semana ${w.week}: ${w.title}`} className="inline-flex h-6 min-w-6 items-center justify-center rounded-md border px-1 text-[11.5px] font-semibold" style={{ borderColor: DSTATUS_COLOUR[w.status], color: DSTATUS_COLOUR[w.status] }}>S{w.week}</span>)}
                </div>
                <p className="text-[13px] text-dim" data-testid="board-month-missing">{miss.pieces ? `Faltan ${plural(miss.pieces, "pieza", "piezas")} · ${plural(miss.weeks, "semana", "semanas")}${miss.late ? ` · ${miss.late} atrasadas` : ""}` : "Completo"}{link ? ` · proyecto real ${link.issues.done}/${link.issues.total}` : ""}</p>
                <div className="mt-auto flex flex-wrap gap-2 pt-1">
                  <PrimaryButton onClick={() => setOpenId(m.id)} data-testid="board-open-month">Abrir proyecto</PrimaryButton>
                </div>
              </li>
            );
          })}
        </ol>
      </div>

      {own.length > 0 && (
        <div className="space-y-2" data-testid="board-own">
          <p className="text-[13px] font-medium uppercase tracking-wide text-faint">Proyectos propios · los que añadiste al plan</p>
          <ul className="grid gap-3 @3xl:grid-cols-2">
            {own.map((d) => <OwnProject key={d.id} d={d} plan={plan} link={links[d.id]} onEdit={() => setEditing(d)} onLink={(l) => { setLinks((x) => ({ ...x, [d.id]: l })); loadLinks(); }} />)}
          </ul>
        </div>
      )}

      {adding && <NewProjectDialog plan={plan} onClose={() => setAdding(false)} />}
      {editing && <NewProjectDialog plan={plan} edit={editing} onClose={() => setEditing(null)} />}
      {open && <ProjectDetail month={open} data={data} link={links[open.id]} onLink={(l) => { setLinks((s) => ({ ...s, [open.id]: l })); loadLinks(); }} onClose={() => setOpenId(null)} />}
    </section>
  );
}
