// Mentor — barra de PROGRESO de la ejecución del plan en segundo plano.
//
// «Ejecutar plan» trabaja en segundo plano (crea ejercicios, entregables y carpetas). Esta barra va fija abajo de la sub-interfaz del plan, en
// cualquier pestaña y en cualquiera de las dos vistas, para ver siempre cuánto lleva, qué está haciendo, cuánto falta y poder pausar o cancelar.
// No inicia nada: solo lee el estado (`mentor_execution_status`) y pausa, reanuda o cancela lo que ya corre.

import { ListChecks, Pause, Play, Square, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api } from "../../lib/bridge";
import { RUN_STATUS_LABEL } from "../../lib/planExecution";
import { useApp } from "../../store/app";
import { cn, confirmAction } from "../ui";
import { useExecution } from "./PlanExecution";
import { openPlanSection } from "./planShared";

const FINISHED_VISIBLE_MS = 10 * 60 * 1000;

/** «unos 12 min» a partir de lo que lleva y de lo que falta (estimación simple: el ritmo medio hasta ahora). */
export function etaText(createdAt: string, finished: number, remaining: number, now: number): string {
  const start = Date.parse(createdAt);
  if (!Number.isFinite(start) || finished < 1 || remaining < 1) return "";
  const msPerTask = Math.max(0, now - start) / finished;
  const min = Math.round((msPerTask * remaining) / 60000);
  if (min < 1) return "menos de 1 min";
  if (min < 90) return `unos ${min} min`;
  return `unas ${Math.round((min / 60) * 10) / 10} h`;
}

export function ExecutionBar({ planId, onOpenPlan }: { planId: string; /** lleva a la pestaña donde está el registro completo */ onOpenPlan?: () => void }) {
  const toast = useApp((s) => s.toast);
  const { exec, setExec } = useExecution(planId);
  const [dismissed, setDismissed] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const st = exec?.state;
  const running = st?.status === "running";
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running]);
  const eta = useMemo(() => {
    if (!st || !exec || st.status !== "running") return "";
    const p = exec.progress;
    return etaText(st.createdAt, p.done + p.failed + p.skipped, p.pending + p.running, now);
  }, [st, exec, now]);

  if (!exec || !st) return null;
  const p = exec.progress;
  const live = st.status === "running" || st.status === "paused";
  // una ejecución terminada se enseña un rato (con su resultado) y se puede cerrar; no se queda para siempre
  const recent = Date.now() - Date.parse(st.updatedAt) < FINISHED_VISIBLE_MS;
  if (!live && (!recent || dismissed === st.id)) return null;

  const act = async (what: "pause" | "resume" | "cancel"): Promise<void> => {
    if (what === "cancel" && !(await confirmAction("Cancelar la ejecución", "Se detiene lo que falta. Lo que ya se creó se queda en tu vault.", "Cancelar ejecución", true))) return;
    setBusy(true);
    try {
      const r = what === "pause" ? await api.mentorExecutionPause(planId) : what === "resume" ? await api.mentorExecutionResume(planId) : await api.mentorExecutionCancel(planId);
      setExec(r.execution);
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const verify = async (): Promise<void> => {
    setBusy(true);
    try {
      const r = await api.mentorExecutionVerify(planId);
      setExec(r.execution);
      toast("info", r.verified || r.trimmed ? `Verificado: ${r.verified} tareas ya estaban en la vault${r.trimmed ? `, ${r.trimmed} con menos por hacer` : ""}; quedan ${r.remaining}.` : `Verificado: no hay cambios; siguen pendientes ${r.remaining} tareas.`);
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const colour = st.status === "failed" ? "var(--nv-danger)" : st.status === "done" ? "var(--nv-mint)" : st.status === "paused" ? "var(--nv-warn)" : "var(--nv-accent)";
  const btn = "inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-line px-2.5 text-[13.5px] text-dim hover:bg-hover hover:text-text disabled:opacity-50";
  return (
    <div className="sticky bottom-0 z-30 border-t border-line bg-surface/95 px-4 py-2.5 backdrop-blur @3xl:px-6" role="region" aria-label="Progreso de la ejecución del plan" data-testid="exec-bar">
      <div className="mx-auto flex w-full max-w-[1400px] flex-wrap items-center gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1 basis-80">
          <div className="flex flex-wrap items-baseline gap-x-2 text-[14px]">
            <span className="font-semibold" style={{ color: colour }}>{RUN_STATUS_LABEL[st.status]}</span>
            <span className="min-w-0 truncate text-dim" data-testid="exec-bar-label">{p.label}</span>
          </div>
          <div className="mt-1.5 flex items-center gap-3">
            <div
              className="h-2.5 flex-1 overflow-hidden rounded-full bg-hover"
              role="progressbar"
              aria-label="Progreso de la ejecución"
              aria-valuenow={p.pct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuetext={`${p.pct} %, ${p.done} de ${p.total} tareas`}
            >
              <div className={cn("h-full rounded-full transition-[width] duration-500", running && "animate-pulse")} style={{ width: `${p.pct}%`, background: colour }} data-testid="exec-bar-fill" />
            </div>
            <span className="w-12 flex-none text-right text-[15px] font-bold" data-testid="exec-bar-pct">{p.pct} %</span>
          </div>
          <p className="mt-1 text-[13px] text-faint">
            {p.done}/{p.total} tareas · {p.created} {p.created === 1 ? "archivo creado" : "archivos creados"}
            {p.failed > 0 ? ` · ${p.failed} con error` : ""}
            {eta ? ` · quedan ${eta}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {st.status === "running" && <button type="button" className={btn} disabled={busy} onClick={() => void act("pause")}><Pause size={14} aria-hidden /> Pausar</button>}
          {st.status === "paused" && <button type="button" className={btn} disabled={busy} onClick={() => void act("resume")}><Play size={14} aria-hidden /> Reanudar</button>}
          {(st.status === "paused" || st.status === "failed") && <button type="button" className={btn} disabled={busy} onClick={() => void verify()} title="Relee la vault y marca como hechas las tareas cuyos archivos ya existen" data-testid="exec-bar-verify"><ListChecks size={14} aria-hidden /> Verificar</button>}
          {live && <button type="button" className={btn} disabled={busy} onClick={() => void act("cancel")}><Square size={14} aria-hidden /> Cancelar</button>}
          <button type="button" className={btn} onClick={() => { onOpenPlan?.(); openPlanSection(planId, "ejecutar"); }} data-testid="exec-bar-open">Ver registro</button>
          {!live && <button type="button" className={btn} aria-label="Cerrar" onClick={() => setDismissed(st.id)}><X size={14} aria-hidden /></button>}
        </div>
      </div>
    </div>
  );
}

/**
 * Aviso de una ejecución a medias (la app se cerró con la cola trabajando, o está en pausa): NUNCA se reanuda sola, porque generar notas escribe
 * en la vault. Reutiliza `mentor_execution_resume` / `_cancel`.
 */
export function InterruptedRunBanner({ planId }: { planId: string }) {
  const toast = useApp((s) => s.toast);
  const { exec, setExec } = useExecution(planId);
  const [busy, setBusy] = useState(false);
  const st = exec?.state;
  if (!exec || !st || st.status !== "paused") return null;
  const p = exec.progress;
  const act = async (what: "resume" | "cancel"): Promise<void> => {
    if (what === "cancel" && !(await confirmAction("Descartar la ejecución", "Se descarta lo que falta. Lo que ya se creó se queda en tu vault.", "Descartar", true))) return;
    setBusy(true);
    try {
      const r = what === "resume" ? await api.mentorExecutionResume(planId) : await api.mentorExecutionCancel(planId);
      setExec(r.execution);
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div role="status" className="flex flex-wrap items-center gap-3 rounded-2xl border border-warn/60 bg-warn-soft px-4 py-3" data-testid="run-resume-banner">
      <p className="min-w-0 flex-1 basis-60 text-[14px]"><strong>Hay una ejecución a medias: ¿reanudar?</strong> <span className="text-dim">Lleva {p.done}/{p.total} tareas. Al reanudar se seguirán creando notas en tu vault.</span></p>
      <button type="button" disabled={busy} onClick={() => void act("resume")} data-testid="run-resume" className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-[13.5px] font-medium hover:bg-hover disabled:opacity-50"><Play size={14} aria-hidden /> Reanudar</button>
      <button type="button" disabled={busy} onClick={() => void act("cancel")} data-testid="run-discard" className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-[13.5px] text-dim hover:bg-hover hover:text-text disabled:opacity-50"><Square size={14} aria-hidden /> Descartar</button>
    </div>
  );
}

/** El nombre corto de un archivo creado y su carpeta: «ej_pg_classify_d1_….md · 1.4 From source code to execution/Ejercicios». */
export function fileLabel(rel: string): { name: string; where: string } {
  const parts = rel.replace(/\\/g, "/").split("/");
  const name = parts.pop() ?? rel;
  return { name: name.replace(/\.md$/i, ""), where: parts.slice(-3).join("/") };
}

/**
 * La generación de notas, dentro de la sub-vista «Resumen» de «Mi plan»: avance, qué archivos se han ido creando (clic para abrirlos)
 * y las últimas líneas del registro. Solo lee; pausar o cancelar se hace en la barra de abajo o en «Ejecutar plan».
 */
export function ExecutionAside({ planId }: { planId: string }) {
  const { exec } = useExecution(planId);
  const st = exec?.state;
  if (!exec || !st) return null;
  const p = exec.progress;
  const live = st.status === "running" || st.status === "paused";
  if (!live && Date.now() - Date.parse(st.updatedAt) > FINISHED_VISIBLE_MS) return null;
  const files = st.tasks.flatMap((t) => t.created).slice(-6).reverse();
  const log = st.log.slice(-3);
  const colour = st.status === "failed" ? "var(--nv-danger)" : st.status === "done" ? "var(--nv-mint)" : st.status === "paused" ? "var(--nv-warn)" : "var(--nv-accent)";
  return (
    <section aria-label="Generación de notas" data-testid="exec-aside" className="mt-5 rounded-xl border border-line bg-card p-3 text-[13.5px]">
      <div className="flex items-center gap-2">
        <h3 className="min-w-0 flex-1 text-[12px] font-semibold uppercase tracking-wider text-faint">Generación de notas</h3>
        <span className="flex-none text-[12.5px] font-semibold" style={{ color: colour }}>{RUN_STATUS_LABEL[st.status]}</span>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-hover" role="progressbar" aria-label="Progreso de la generación" aria-valuenow={p.pct} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${p.pct}%`, background: colour }} data-testid="exec-aside-fill" />
        </div>
        <span className="w-10 flex-none text-right font-bold" data-testid="exec-aside-pct">{p.pct} %</span>
      </div>
      <p className="mt-1.5 break-words text-dim" data-testid="exec-aside-label">{p.label}</p>
      <p className="mt-0.5 text-faint">
        {p.done}/{p.total} tareas · {p.created} {p.created === 1 ? "archivo" : "archivos"}
        {p.failed > 0 ? ` · ${p.failed} con error` : ""}
      </p>
      {files.length > 0 && (
        <>
          <p className="mt-3 text-[12px] font-semibold uppercase tracking-wider text-faint">Últimos archivos</p>
          <ul className="mt-1 space-y-1" data-testid="exec-aside-files">
            {files.map((f) => {
              const l = fileLabel(f);
              return (
                <li key={f}>
                  <button type="button" onClick={() => void useApp.getState().openNote(f.replace(/\\/g, "/"))} className="block w-full min-w-0 text-left hover:underline" title={f}>
                    <span className="block truncate text-text">{l.name}</span>
                    <span className="block truncate text-[12px] text-faint">{l.where}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
      {log.length > 0 && (
        <>
          <p className="mt-3 text-[12px] font-semibold uppercase tracking-wider text-faint">Registro</p>
          <ul className="mt-1 space-y-0.5 text-[12.5px] text-dim" data-testid="exec-aside-log">
            {log.map((l, i) => <li key={`${i}-${l}`} className="break-words">{l.trim()}</li>)}
          </ul>
        </>
      )}
    </section>
  );
}
