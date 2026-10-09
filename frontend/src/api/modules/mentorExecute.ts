// Mentor — «Ejecutar plan»: informe de ejecución (qué falta crear, agrupado, con coste y orden por semanas), ejecución en segundo plano con cola
// persistida, pausa / reanudación / cancelación y registro de los archivos creados.
//
//  - mentor_execution_report({ id, scope? }) -> { loading } | { report, execution, aiConfigured }: SOLO LEE. Calcula el informe con la cobertura
//    determinista (checklist de diseño por tema) y la última revisión de la IA (`coverageReview`, temas nuevos propuestos).
//  - mentor_execution_start({ id, scope, confirm: true }) -> { execution }: crea la cola y empieza. Exige `confirm: true` (la persona pulsó el
//    botón del diálogo) e IA configurada. Nunca se llama solo.
//  - mentor_execution_status({ id }) -> { execution, active }: el estado guardado (una ejecución que quedó «en curso» tras cerrar la app se
//    devuelve en pausa).
//  - mentor_execution_pause / _resume / _cancel({ id }) -> { execution }: pausar y cancelar ABORTAN de verdad las tareas en vuelo.
//
// Nada de aquí sobrescribe: ver `mentorExecuteDeps.ts` (fotografía y restauración de la carpeta del tema) y docs/VAULT_FORMAT.md.

import * as fs from "node:fs";
import * as path from "node:path";
import { AIConfig } from "../../core/aiClient.js";
import { ApiError } from "../../core/errors.js";
import { areaFiles, areaKataDates, practiceAreasOf } from "../../lib/areaPracticeSystem.js";
import { PLAN_ID_RE, PlanStore, type Plan } from "../../core/mentor/plan.js";
import { ExecutionRunner, ExecutionStore, newExecution, recoverInterrupted, type ExecDeps } from "../../core/mentor/planExecutor.js";
import { ppAreaDir } from "../../core/mentor/practiceState.js";
import { aiUnavailableReason } from "../../core/mentor/planner.js";
import { areaKeyOf } from "../../lib/planCoverage.js";
import { buildExecutionReport, DEFAULT_SCOPE, progressOf, type ExecutionReport, type ExecutionScope, type ExecutionState } from "../../lib/planExecution.js";
import { weekRangesOf } from "../../lib/planTime.js";
import * as store from "../../core/store.js";
import { AppConfig } from "../appConfig.js";
import type { AppState } from "../appState.js";
import { designsOf } from "./mentorDesign.js";
import { makeExecDeps, type ExecDepsOptions } from "./mentorExecuteDeps.js";
import { studyIndexCold } from "./study.js";

export interface MentorExecuteHooks extends ExecDepsOptions {
  /** reemplaza las dependencias reales (tests con IA simulada) */
  depsFor?: (planId: string) => ExecDeps;
  retryDelayMs?: number;
  now?: () => string;
}

const RUNNERS = new WeakMap<AppState, Map<string, ExecutionRunner>>();
const runnersOf = (app: AppState): Map<string, ExecutionRunner> => {
  let m = RUNNERS.get(app);
  if (!m) RUNNERS.set(app, (m = new Map()));
  return m;
};

const sanitizeScope = (raw: unknown): ExecutionScope => {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, any>;
  const mode = o.mode === "weeks" || o.mode === "area" ? o.mode : "all";
  const week = (v: unknown): number | undefined => (Number.isFinite(Number(v)) && Number(v) >= 1 ? Math.min(1000, Math.round(Number(v))) : undefined);
  return {
    mode,
    ...(mode === "weeks" ? { fromWeek: week(o.fromWeek) ?? 1, toWeek: week(o.toWeek) ?? 4 } : {}),
    ...(mode === "area" ? { areaKey: String(o.areaKey ?? "").slice(0, 60) } : {}),
    includeRecommended: o.includeRecommended === true,
    includeNewTopics: o.includeNewTopics === true,
    includeAreaPractice: o.includeAreaPractice !== false,
    includeKatasAi: o.includeKatasAi === true,
  };
};

export function mentorExecuteApi(app: AppState, hooks: MentorExecuteHooks = {}) {
  const now = hooks.now ?? ((): string => new Date().toISOString());
  const execStore = (): ExecutionStore => new ExecutionStore(app.root);
  const aiOn = (): boolean => aiUnavailableReason(AIConfig.fromDict(AppConfig.get_ai_config())) === null;
  const planOf = (opts: unknown): Plan => {
    const id = String(((opts && typeof opts === "object" ? opts : {}) as Record<string, any>).id ?? "");
    if (!PLAN_ID_RE.test(id)) throw new ApiError("Plan inválido.");
    const plan = new PlanStore(app.root).load(id);
    if (!plan) throw new ApiError("Ese plan ya no existe.");
    return plan;
  };

  /** El informe de ejecución del plan para un alcance. Solo lee. */
  function reportOf(plan: Plan, scope: ExecutionScope): ExecutionReport {
    const topics = plan.subplans.flatMap((s) =>
      s.topics.map((t) => ({ folder: t.folder, title: t.title, areaKey: areaKeyOf(s), area: s.area, week: t.targetWeek, skipped: t.route === "skipped", completed: !!t.completedAt })),
    );
    const designs = designsOf(app, topics.map((t) => ({ folder: t.folder, title: t.title })));
    const ppDir = ppAreaDir(app.root);
    const space = topics[0]?.folder.split("/")[0] ?? "Programación";
    const ranges = weekRangesOf(plan.start, plan.end);
    const weeksOf = (dates: string[]): number[] => dates.map((d) => Math.max(1, ranges.findIndex((r) => d >= r.start && d <= r.end) + 1));
    const kataWeeks = weeksOf(areaKataDates(plan, "backend"));
    const kataWeeksByArea = Object.fromEntries(practiceAreasOf(plan).map((a) => [a.areaId, weeksOf(areaKataDates(plan, a.areaId))]));
    return buildExecutionReport(
      {
        planId: plan.id,
        topics,
        areas: plan.subplans.map((s) => ({ key: areaKeyOf(s), area: s.area, ...(s.areaId ? { areaId: s.areaId } : {}) })),
        designs,
        review: plan.coverageReview ?? null,
        ppReady: !!ppDir,
        areaFiles: (areaId, katas, fromDay) =>
          areaFiles(areaId, { katasPerArea: katas, fromDay }).map((f) => ({ rel: f.rel, exists: fs.existsSync(path.join(ppDir ?? path.join(app.root, space, "programming_practice"), ...f.rel.split("/"))) })),
        kataWeeks,
        kataWeeksByArea,
        aiConfigured: aiOn(),
        now: now(),
      },
      scope,
    );
  }

  const view = (s: ExecutionState | null) => (s ? { state: s, progress: progressOf(s) } : null);

  /** El estado guardado; una ejecución que quedó «en curso» sin proceso detrás (la app se cerró) se devuelve en pausa. */
  function current(planId: string): ExecutionState | null {
    const runner = runnersOf(app).get(planId);
    if (runner) return runner.state;
    const s = execStore().load(planId);
    if (!s) return null;
    const rec = recoverInterrupted(s);
    if (rec !== s) execStore().save(rec);
    return rec;
  }

  function runnerFor(state: ExecutionState): ExecutionRunner {
    const reg = runnersOf(app);
    const old = reg.get(state.planId);
    if (old) return old;
    const deps = hooks.depsFor?.(state.planId) ?? makeExecDeps(app, state.planId, hooks);
    const r = new ExecutionRunner(state, execStore(), deps, {
      retryDelayMs: hooks.retryDelayMs ?? 2000,
      ...(hooks.now ? { now: hooks.now } : {}),
      // al terminar la ejecución (con algo hecho) el plan queda con sus entregables y su práctica DEFINIDOS: deja de mostrarlos «por definir»
      onChange: (st) => {
        if (st.status !== "done" || !st.tasks.some((t) => t.status === "done")) return;
        const ps = new PlanStore(app.root);
        const p = ps.load(st.planId);
        if (p && !p.deliverablesDefinedAt) ps.save({ ...p, deliverablesDefinedAt: now() });
      },
    });
    reg.set(state.planId, r);
    return r;
  }

  /** Guarda la ejecución terminada en el historial antes de empezar otra (el registro de lo creado no se pierde). */
  function archive(s: ExecutionState): void {
    store.writeJson(path.join(app.root, ".notevault", "mentor", "executions", "history", s.planId, `${s.id}.json`), s);
  }

  return {
    mentor_execution_report(opts: unknown) {
      const plan = planOf(opts);
      if (studyIndexCold(app)) return { loading: true as const };
      const scope = sanitizeScope((opts as Record<string, unknown>)?.scope ?? DEFAULT_SCOPE);
      return { loading: false as const, report: reportOf(plan, scope), execution: view(current(plan.id)), aiConfigured: aiOn() };
    },

    mentor_execution_status(opts: unknown) {
      const plan = planOf(opts);
      const s = current(plan.id);
      return { execution: view(s), active: !!runnersOf(app).get(plan.id)?.active };
    },

    async mentor_execution_start(opts: unknown) {
      const o = (opts && typeof opts === "object" ? opts : {}) as Record<string, any>;
      if (o.confirm !== true) throw new ApiError("Falta la confirmación: «Ejecutar plan» solo se hace cuando la persona la da en el diálogo.");
      const plan = planOf(o);
      if (!aiOn()) throw new ApiError("La IA no está configurada: sin IA no se puede ejecutar el plan (el análisis sí funciona).");
      if (studyIndexCold(app)) return { loading: true as const };
      const prev = current(plan.id);
      if (prev && (prev.status === "running" || prev.status === "paused")) throw new ApiError(prev.status === "running" ? "Ya hay una ejecución en curso." : "Hay una ejecución en pausa: reanúdala o cancélala antes de empezar otra.");
      const scope = sanitizeScope(o.scope);
      const report = reportOf(plan, scope);
      if (!report.tasks.length) throw new ApiError("No hay nada que crear con ese alcance.");
      if (prev) archive(prev);
      runnersOf(app).delete(plan.id);
      const state = newExecution(plan.id, scope, report.tasks, now());
      execStore().save(state);
      const runner = runnerFor(state);
      void runner.start();
      return { loading: false as const, execution: view(runner.state) };
    },

    mentor_execution_pause(opts: unknown) {
      const plan = planOf(opts);
      const r = runnersOf(app).get(plan.id);
      if (!r || r.state.status !== "running") throw new ApiError("No hay una ejecución en curso.");
      r.pause();
      return { execution: view(r.state) };
    },

    mentor_execution_resume(opts: unknown) {
      const plan = planOf(opts);
      const s = current(plan.id);
      if (!s || (s.status !== "paused" && s.status !== "failed")) throw new ApiError("No hay una ejecución en pausa.");
      if (!aiOn()) throw new ApiError("La IA no está configurada.");
      const r = runnerFor(s);
      void r.resume();
      return { execution: view(r.state) };
    },

    mentor_execution_cancel(opts: unknown) {
      const plan = planOf(opts);
      const s = current(plan.id);
      if (!s || s.status === "done" || s.status === "cancelled") throw new ApiError("No hay una ejecución que cancelar.");
      const r = runnerFor(s);
      r.cancel();
      return { execution: view(r.state) };
    },
  };
}
