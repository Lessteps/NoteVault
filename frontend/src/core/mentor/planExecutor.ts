/**
 * La COLA de «Ejecutar plan»: ejecuta las tareas del informe en segundo plano, con concurrencia limitada, pausa / reanudación / cancelación de
 * verdad (una `AbortSignal` por tarea, que mata la petición o el proceso de Claude Code), reintentos por tarea y estado persistido en
 * `.notevault/mentor/executions/<planId>.json` (aditivo, ver docs/VAULT_FORMAT.md). El trabajo real lo hace `ExecDeps` (en la app, las funciones
 * existentes de generación de temas y de práctica; en los tests, una IA simulada), así este módulo no sabe nada de la vault: solo ordena, reintenta,
 * valida y registra.
 *
 * Garantías:
 *  - NUNCA sobrescribe: lo garantizan las `deps` (cada tarea protege la carpeta del tema) y se verifica aquí con la validación.
 *  - Reanudable: tras un cierre de la app, las tareas «en curso» vuelven a «pendiente» y las hechas no se repiten.
 *  - Cancelar no deja basura a medias: la tarea en vuelo se aborta y las demás quedan «canceladas»; lo ya creado queda en el registro.
 */

import * as path from "node:path";
import {
  blockedBy,
  EXEC_CONCURRENCY,
  MAX_ATTEMPTS,
  MAX_LOG_LINES,
  progressOf,
  RUN_STATUSES,
  runnable,
  TASK_STATUSES,
  type ExecutionScope,
  type ExecutionState,
  type ExecTask,
  type RunStatus,
  type TaskState,
  DEFAULT_SCOPE,
} from "../../lib/planExecution.js";
import * as store from "../store.js";

export const PLAN_ID_OK = /^[A-Za-z0-9_-]{1,60}$/;

// ── Almacén ─────────────────────────────────────────────────────────────

const oneLine = (v: unknown, max: number): string => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const strs = (v: unknown, max = 200): string[] => (Array.isArray(v) ? v.map((x) => oneLine(x, 400)).filter(Boolean).slice(0, max) : []);

function sanitizeScope(raw: unknown): ExecutionScope {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, any>;
  const mode = o.mode === "weeks" || o.mode === "area" ? o.mode : "all";
  const n = (v: unknown): number | undefined => (Number.isFinite(Number(v)) && Number(v) >= 1 ? Math.min(1000, Math.round(Number(v))) : undefined);
  return {
    mode,
    ...(mode === "weeks" ? { fromWeek: n(o.fromWeek) ?? 1, toWeek: n(o.toWeek) ?? 1000 } : {}),
    ...(mode === "area" && oneLine(o.areaKey, 60) ? { areaKey: oneLine(o.areaKey, 60) } : {}),
    includeRecommended: o.includeRecommended === true,
    includeNewTopics: o.includeNewTopics === true,
    includeAreaPractice: o.includeAreaPractice !== false,
    includeKatasAi: o.includeKatasAi === true,
  };
}

function sanitizeTask(raw: unknown): TaskState | null {
  const t = raw as Record<string, any> | null;
  if (!t || typeof t !== "object") return null;
  const id = oneLine(t.id, 300);
  const kind = oneLine(t.kind, 30);
  if (!id || !kind) return null;
  const status = (TASK_STATUSES as readonly string[]).includes(t.status) ? t.status : "pending";
  return {
    id,
    kind: kind as TaskState["kind"],
    areaKey: oneLine(t.areaKey, 60),
    area: oneLine(t.area, 80),
    ...(oneLine(t.folder, 400) ? { folder: oneLine(t.folder, 400) } : {}),
    title: oneLine(t.title, 200),
    week: Number.isFinite(Number(t.week)) ? Number(t.week) : 0,
    required: t.required !== false,
    aiCalls: Math.max(0, Math.round(Number(t.aiCalls) || 0)),
    files: Math.max(0, Math.round(Number(t.files) || 0)),
    label: oneLine(t.label, 300),
    dependsOn: strs(t.dependsOn, 10),
    ...(t.args && typeof t.args === "object" ? { args: t.args as Record<string, unknown> } : {}),
    status,
    attempts: Math.max(0, Math.round(Number(t.attempts) || 0)),
    created: strs(t.created),
    skippedFiles: strs(t.skippedFiles),
    warnings: strs(t.warnings, 20),
    ...(oneLine(t.error, 500) ? { error: oneLine(t.error, 500) } : {}),
    ...(oneLine(t.note, 300) ? { note: oneLine(t.note, 300) } : {}),
    ...(oneLine(t.startedAt, 40) ? { startedAt: oneLine(t.startedAt, 40) } : {}),
    ...(oneLine(t.endedAt, 40) ? { endedAt: oneLine(t.endedAt, 40) } : {}),
  };
}

export function sanitizeExecution(raw: unknown): ExecutionState | null {
  const o = raw as Record<string, any> | null;
  if (!o || typeof o !== "object" || !PLAN_ID_OK.test(String(o.planId ?? ""))) return null;
  const tasks = (Array.isArray(o.tasks) ? o.tasks : []).map(sanitizeTask).filter((t): t is TaskState => !!t);
  const status = (RUN_STATUSES as readonly string[]).includes(o.status) ? (o.status as RunStatus) : "paused";
  return {
    version: 1,
    planId: String(o.planId),
    id: oneLine(o.id, 60) || "run",
    status,
    scope: sanitizeScope(o.scope ?? DEFAULT_SCOPE),
    createdAt: oneLine(o.createdAt, 40),
    updatedAt: oneLine(o.updatedAt, 40),
    tasks,
    log: strs(o.log, MAX_LOG_LINES),
  };
}

export class ExecutionStore {
  constructor(private readonly root: string) {}
  file(planId: string): string {
    if (!PLAN_ID_OK.test(planId)) throw new Error("Plan inválido.");
    return path.join(this.root, ".notevault", "mentor", "executions", `${planId}.json`);
  }
  load(planId: string): ExecutionState | null {
    return sanitizeExecution(store.loadJson<unknown>(this.file(planId), null));
  }
  save(state: ExecutionState): void {
    store.writeJson(this.file(state.planId), state);
  }
}

/** Una ejecución nueva a partir de las tareas del informe. */
export function newExecution(planId: string, scope: ExecutionScope, tasks: readonly ExecTask[], now: string, id = `run-${now.replace(/\D/g, "").slice(0, 14)}`): ExecutionState {
  return {
    version: 1,
    planId,
    id,
    status: "running",
    scope,
    createdAt: now,
    updatedAt: now,
    tasks: tasks.map((t) => ({ ...t, dependsOn: [...t.dependsOn], status: "pending" as const, attempts: 0, created: [], skippedFiles: [], warnings: [] })),
    log: [],
  };
}

/** Lo que una ejecución guardada con tareas «en curso» (la app se cerró) vuelve a ser: tareas pendientes y ejecución en pausa. */
export function recoverInterrupted(s: ExecutionState): ExecutionState {
  if (s.status !== "running" && !s.tasks.some((t) => t.status === "running")) return s;
  return {
    ...s,
    status: s.status === "running" ? "paused" : s.status,
    tasks: s.tasks.map((t) => (t.status === "running" ? { ...t, status: "pending" as const, attempts: Math.max(0, t.attempts - 1) } : t)),
  };
}

export interface ReconcileResult {
  state: ExecutionState;
  /** tareas que ya estaban hechas en la vault (las marca «hecha», sin llamar a la IA) */
  verified: number;
  /** tareas de ejercicios a las que solo les quedan algunas celdas */
  trimmed: number;
  /** tareas que siguen sin estar */
  remaining: number;
}

/**
 * «Verificar»: contrasta una ejecución guardada con lo que HAY en la vault ahora. `fresh` es el informe recalculado con el mismo alcance:
 * una tarea pendiente (o fallida / omitida) que ya no figura en él está cubierta (la hizo la app, otra IA o la persona) y se marca «hecha»;
 * una de ejercicios a la que ya solo le faltan algunas celdas se recorta a las que faltan. No ejecuta nada ni toca la vault.
 */
export function reconcileExecution(s: ExecutionState, fresh: readonly ExecTask[], now: string): ReconcileResult {
  const byId = new Map(fresh.map((t) => [t.id, t]));
  let verified = 0;
  let trimmed = 0;
  const tasks = s.tasks.map((t): TaskState => {
    if (t.status === "done" || t.status === "running" || t.status === "cancelled") return t;
    const f = byId.get(t.id);
    if (!f) {
      verified++;
      const { error: _e, ...rest } = t;
      return { ...rest, status: "done", note: "Ya estaba en la vault (verificado)", endedAt: now };
    }
    const have = Array.isArray(t.args?.cells) ? (t.args!.cells as unknown[]).length : 0;
    const left = Array.isArray(f.args?.cells) ? (f.args!.cells as unknown[]).length : 0;
    if (t.kind === "practice" && have > 0 && left > 0 && left < have) {
      trimmed++;
      return { ...t, args: f.args, files: f.files, aiCalls: f.aiCalls, label: f.label, required: f.required };
    }
    return t;
  });
  const remaining = tasks.filter((t) => t.status === "pending" || t.status === "failed" || t.status === "skipped").length;
  const anyOpen = tasks.some((t) => t.status === "pending" || t.status === "running");
  const failed = tasks.some((t) => t.status === "failed" || (t.status === "skipped" && t.error));
  const status: RunStatus = s.status === "cancelled" ? "cancelled" : anyOpen ? (s.status === "failed" ? "paused" : s.status) : failed ? "failed" : "done";
  const line = `${now.slice(11, 19)} Verificación: ${verified} ya estaban en la vault, ${trimmed} recortadas, ${remaining} siguen pendientes.`;
  return { state: { ...s, status, tasks, updatedAt: now, log: [...s.log, line].slice(-MAX_LOG_LINES) }, verified, trimmed, remaining };
}

// ── Dependencias del trabajo real ───────────────────────────────────────

export interface TaskRunResult {
  /** archivos nuevos (rutas relativas a la vault, POSIX) */
  created: string[];
  /** archivos que ya existían y se dejaron como estaban */
  skippedFiles?: string[];
  note?: string;
  warnings?: string[];
}

export interface TaskContext {
  signal: AbortSignal;
  say: (line: string) => void;
}

export interface ExecDeps {
  /** hace el trabajo de una tarea; lanza si falla. Debe respetar `ctx.signal` (cancelar mata la petición). */
  run(task: TaskState, ctx: TaskContext): Promise<TaskRunResult>;
  /** comprueba el resultado con el checklist: `problems` hacen fallar la tarea (se reintenta); `warnings` solo se anotan */
  validate(task: TaskState, result: TaskRunResult): Promise<{ problems: string[]; warnings: string[] }>;
}

export interface RunnerOptions {
  concurrency?: number;
  maxAttempts?: number;
  /** espera antes de reintentar (ms); 0 en los tests */
  retryDelayMs?: number;
  now?: () => string;
  /** se llama cada vez que cambia el estado (tras guardarlo) */
  onChange?: (s: ExecutionState) => void;
}

const isAbort = (e: unknown): boolean => e instanceof Error && (e.name === "AbortError" || /cancelad/i.test(e.message));

/**
 * Ejecuta una `ExecutionState`. Un runner por plan. `start()` devuelve una promesa que se resuelve cuando la cola queda quieta (terminada,
 * pausada o cancelada).
 */
export class ExecutionRunner {
  state: ExecutionState;
  private readonly controllers = new Map<string, AbortController>();
  private idle: Promise<void> = Promise.resolve();
  private wake: (() => void) | null = null;
  private stopping: "pause" | "cancel" | null = null;
  private readonly conc: number;
  private readonly maxAttempts: number;
  private readonly delay: number;
  private readonly now: () => string;

  constructor(
    state: ExecutionState,
    private readonly io: { save(s: ExecutionState): void },
    private readonly deps: ExecDeps,
    private readonly opts: RunnerOptions = {},
  ) {
    this.state = state;
    this.conc = Math.max(1, opts.concurrency ?? EXEC_CONCURRENCY);
    this.maxAttempts = Math.max(1, opts.maxAttempts ?? MAX_ATTEMPTS);
    this.delay = opts.retryDelayMs ?? 2000;
    this.now = opts.now ?? ((): string => new Date().toISOString());
  }

  /** ¿está el bucle de ejecución en marcha? */
  get active(): boolean {
    return this.loopActive;
  }
  private loopActive = false;

  private commit(mut: (s: ExecutionState) => ExecutionState | void): void {
    const next = mut(this.state);
    if (next) this.state = next;
    this.state = { ...this.state, updatedAt: this.now() };
    this.io.save(this.state);
    this.opts.onChange?.(this.state);
  }
  private say(line: string): void {
    this.commit((s) => ({ ...s, log: [...s.log, `${this.now().slice(11, 19)} ${line}`.slice(0, 400)].slice(-MAX_LOG_LINES) }));
  }
  private patch(id: string, p: Partial<TaskState>): void {
    this.commit((s) => ({ ...s, tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...p } : t)) }));
  }

  /** Empieza (o continúa) la ejecución. */
  start(): Promise<void> {
    if (this.loopActive) return this.idle;
    this.stopping = null;
    this.commit((s) => ({ ...s, status: "running" }));
    this.idle = this.loop();
    return this.idle;
  }

  pause(): void {
    if (this.state.status !== "running") return;
    this.stopping = "pause";
    this.say("Pausa pedida: se detienen las tareas en curso (volverán a empezar al reanudar).");
    for (const c of this.controllers.values()) c.abort();
    this.wake?.();
  }

  /** Reanuda una ejecución en pausa (o interrumpida). */
  resume(): Promise<void> {
    if (this.state.status === "done" || this.state.status === "cancelled") return this.idle;
    // «Reintentar lo que falló»: las tareas que fallaron (y las omitidas por ellas) vuelven a pendiente con intentos nuevos; lo hecho no se repite
    this.commit((s) => {
      const r = recoverInterrupted(s);
      return {
        ...r,
        status: "running",
        tasks: r.tasks.map((t) => (t.status === "failed" || (t.status === "skipped" && t.error) ? { ...t, status: "pending" as const, attempts: 0, error: undefined } : t)),
      };
    });
    this.say("Reanudada.");
    return this.start();
  }

  cancel(): void {
    if (this.state.status === "cancelled" || this.state.status === "done") return;
    this.stopping = "cancel";
    for (const c of this.controllers.values()) c.abort();
    if (!this.loopActive) this.finishCancel();
    this.wake?.();
  }

  /** Espera a que la cola quede quieta. */
  whenIdle(): Promise<void> {
    return this.idle;
  }

  private finishCancel(): void {
    this.commit((s) => ({
      ...s,
      status: "cancelled",
      tasks: s.tasks.map((t) => (t.status === "pending" || t.status === "running" ? { ...t, status: "cancelled" as const, endedAt: this.now() } : t)),
    }));
    this.say("Ejecución cancelada. Lo ya creado se queda en la vault y en el registro.");
  }

  private async loop(): Promise<void> {
    this.loopActive = true;
    try {
      const inflight = new Set<Promise<void>>();
      for (;;) {
        if (this.stopping) break;
        // las tareas bloqueadas por una dependencia que falló no se pueden hacer
        for (const { task, dep } of blockedBy(this.state.tasks)) {
          this.patch(task.id, { status: "skipped", error: `Omitida: depende de «${dep.label}», que no se completó.`, endedAt: this.now() });
        }
        const next = this.stopping ? [] : runnable(this.state.tasks, this.conc);
        for (const t of next) {
          const p = this.runOne(t).finally(() => inflight.delete(p));
          inflight.add(p);
        }
        if (!inflight.size) break; // nada en curso y nada que arrancar
        await Promise.race([...inflight, new Promise<void>((ok) => (this.wake = ok))]);
        this.wake = null;
      }
      await Promise.allSettled([...inflight]);
    } finally {
      this.loopActive = false;
    }
    if (this.stopping === "cancel") {
      this.finishCancel();
      return;
    }
    if (this.stopping === "pause") {
      this.commit((s) => ({ ...s, status: "paused", tasks: s.tasks.map((t) => (t.status === "running" ? { ...t, status: "pending" as const } : t)) }));
      return;
    }
    const failed = this.state.tasks.some((t) => t.status === "failed" || (t.status === "skipped" && t.error));
    const left = this.state.tasks.some((t) => t.status === "pending" || t.status === "running");
    this.commit((s) => ({ ...s, status: left ? "paused" : failed ? "failed" : "done" }));
    const p = progressOf(this.state);
    this.say(`Terminada: ${p.done} hechas, ${p.failed} con error, ${p.skipped} omitidas; ${p.created} archivos creados.`);
  }

  private async runOne(task: TaskState): Promise<void> {
    const ac = new AbortController();
    this.controllers.set(task.id, ac);
    const attempt = task.attempts + 1;
    this.patch(task.id, { status: "running", attempts: attempt, startedAt: this.now(), error: undefined });
    this.say(`${progressOf(this.state).label}: ${task.label}${attempt > 1 ? ` (intento ${attempt})` : ""}`);
    try {
      const result = await this.deps.run({ ...task, attempts: attempt }, { signal: ac.signal, say: (l) => this.say(`  ${l}`) });
      if (ac.signal.aborted) throw Object.assign(new Error("Cancelado."), { name: "AbortError" });
      const v = await this.deps.validate(task, result);
      if (v.problems.length) throw new Error(`La validación falló: ${v.problems.join("; ")}`);
      this.patch(task.id, {
        status: "done",
        created: [...new Set([...task.created, ...result.created])],
        skippedFiles: [...new Set([...task.skippedFiles, ...(result.skippedFiles ?? [])])],
        warnings: [...new Set([...(result.warnings ?? []), ...v.warnings])].slice(0, 20),
        ...(result.note ? { note: result.note } : {}),
        error: undefined,
        endedAt: this.now(),
      });
      if (v.warnings.length) this.say(`  Aviso: ${v.warnings[0]}`);
    } catch (e) {
      if (ac.signal.aborted || isAbort(e)) {
        // pausa o cancelación: la tarea no cuenta como intento fallido
        this.patch(task.id, { status: "pending", attempts: Math.max(0, attempt - 1) });
        return;
      }
      const msg = (e instanceof Error ? e.message : String(e)).slice(0, 400);
      if (attempt < this.maxAttempts) {
        this.say(`  Falló (${msg}); se reintenta.`);
        this.patch(task.id, { status: "pending", error: msg });
        if (this.delay > 0) await new Promise((ok) => setTimeout(ok, this.delay));
      } else {
        this.say(`  Falló definitivamente: ${msg}`);
        this.patch(task.id, { status: "failed", error: msg, endedAt: this.now() });
      }
    } finally {
      this.controllers.delete(task.id);
    }
  }
}
