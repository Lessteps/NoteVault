// La cola de «Ejecutar plan» con trabajos simulados: orden y dependencias, concurrencia 2, persistencia, reintentos, validación, pausa que aborta de
// verdad, reanudación (también tras un cierre de la app) y cancelación.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_SCOPE, progressOf, runnable, type ExecTask } from "../../lib/planExecution.js";
import { ExecutionRunner, ExecutionStore, newExecution, recoverInterrupted, type ExecDeps, type TaskRunResult } from "./planExecutor.js";

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "nv_exec_"));
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

const task = (id: string, o: Partial<ExecTask> = {}): ExecTask => ({
  id,
  kind: "theory",
  areaKey: "backend",
  area: "Backend",
  folder: `Programación/4 Backend/${id}`,
  title: id,
  week: 1,
  required: true,
  aiCalls: 1,
  files: 1,
  label: `Tarea ${id}`,
  dependsOn: [],
  ...o,
});

/** Trabajos simulados: cada tarea termina cuando se llama a `gate(id).release()`, o al instante si `auto`. */
function fakeDeps(opts: { auto?: boolean; failFirst?: string[]; failAlways?: string[]; invalid?: string[] } = {}) {
  const calls: string[] = [];
  const aborted: string[] = [];
  const started: string[] = [];
  let active = 0;
  let peak = 0;
  const gates = new Map<string, () => void>();
  const failedOnce = new Set<string>();
  const deps: ExecDeps = {
    async run(t, ctx): Promise<TaskRunResult> {
      calls.push(t.id);
      started.push(t.id);
      active++;
      peak = Math.max(peak, active);
      try {
        if (opts.failAlways?.includes(t.id)) throw new Error("la IA falló");
        if (opts.failFirst?.includes(t.id) && !failedOnce.has(t.id)) {
          failedOnce.add(t.id);
          throw new Error("timeout");
        }
        if (!opts.auto) {
          await new Promise<void>((ok, bad) => {
            gates.set(t.id, ok);
            ctx.signal.addEventListener("abort", () => {
              aborted.push(t.id);
              bad(Object.assign(new Error("Cancelado."), { name: "AbortError" }));
            });
          });
        }
        return { created: [`${t.folder}/${t.id}.md`] };
      } finally {
        active--;
      }
    },
    async validate(t) {
      return opts.invalid?.includes(t.id) ? { problems: ["no se creó la nota"], warnings: [] } : { problems: [], warnings: t.id === "w" ? ["no cumple el contrato"] : [] };
    },
  };
  return { deps, calls, aborted, started, gates, peak: () => peak };
}
const tick = (ms = 5) => new Promise((ok) => setTimeout(ok, ms));
const NOW = "2026-10-09T10:00:00.000Z";
const mk = (tasks: ExecTask[]) => newExecution("2026-10-06_2027-04-05", DEFAULT_SCOPE, tasks, NOW);

describe("la cola de ejecución", () => {
  it("ejecuta todo en orden de dependencias, con 2 a la vez como mucho, y persiste el estado", async () => {
    const f = fakeDeps({ auto: true });
    const st = new ExecutionStore(dir);
    const tasks = [task("a"), task("b", { kind: "canvas", folder: task("a").folder, dependsOn: ["a"] }), task("c"), task("d"), task("e")];
    const r = new ExecutionRunner(mk(tasks), st, f.deps, { retryDelayMs: 0 });
    await r.start();
    expect(r.state.status).toBe("done");
    expect(r.state.tasks.every((t) => t.status === "done")).toBe(true);
    expect(f.calls.indexOf("a")).toBeLessThan(f.calls.indexOf("b"));
    const disk = st.load("2026-10-06_2027-04-05")!;
    expect(disk.status).toBe("done");
    expect(disk.tasks.find((t) => t.id === "c")!.created).toEqual(["Programación/4 Backend/c/c.md"]);
    expect(progressOf(disk)).toMatchObject({ total: 5, done: 5, pct: 100, created: 5 });
    expect(fs.existsSync(path.join(dir, ".notevault", "mentor", "executions", "2026-10-06_2027-04-05.json"))).toBe(true);
    expect(f.peak()).toBeLessThanOrEqual(2);
  });

  it("la concurrencia es 2: nunca arranca una tercera tarea a la vez y una misma carpeta se toca de una en una", async () => {
    const f = fakeDeps();
    const same = "Programación/4 Backend/mismo";
    const r = new ExecutionRunner(mk([task("a"), task("b"), task("c"), task("x", { folder: same }), task("y", { folder: same, kind: "canvas" })]), new ExecutionStore(dir), f.deps, { retryDelayMs: 0 });
    void r.start();
    await tick();
    expect(f.started).toEqual(["a", "b"]);
    expect(runnable(r.state.tasks)).toEqual([]);
    f.gates.get("a")!();
    await tick();
    expect(f.started).toEqual(["a", "b", "c"]);
    for (const id of ["b", "c"]) f.gates.get(id)!();
    await tick();
    expect(f.started.slice(3)).toEqual(["x"]); // y espera: es la misma carpeta que x
    f.gates.get("x")!();
    await tick();
    f.gates.get("y")!();
    await r.whenIdle();
    expect(r.state.status).toBe("done");
    expect(f.peak()).toBe(2);
  });

  it("respeta el orden del informe (semanas primero): lo de la semana 1 antes que lo de la 3", async () => {
    const f = fakeDeps({ auto: true });
    const ordered = [task("s1", { week: 1 }), task("s2", { week: 2 }), task("s3", { week: 3 })];
    const r = new ExecutionRunner(mk(ordered), new ExecutionStore(dir), f.deps, { concurrency: 1, retryDelayMs: 0 });
    await r.start();
    expect(f.calls).toEqual(["s1", "s2", "s3"]);
  });

  it("reintenta una tarea que falla una vez; si falla siempre queda «falló» y sus dependientes se omiten", async () => {
    const f = fakeDeps({ auto: true, failFirst: ["a"], failAlways: ["b"] });
    const r = new ExecutionRunner(mk([task("a"), task("b"), task("c", { dependsOn: ["b"], folder: "Programación/4 Backend/c" }), task("d")]), new ExecutionStore(dir), f.deps, { retryDelayMs: 0 });
    await r.start();
    const by = (id: string) => r.state.tasks.find((t) => t.id === id)!;
    expect(by("a")).toMatchObject({ status: "done", attempts: 2 });
    expect(by("b")).toMatchObject({ status: "failed", attempts: 2, error: "la IA falló" });
    expect(by("c").status).toBe("skipped");
    expect(by("c").error).toMatch(/depende de/);
    expect(by("d").status).toBe("done");
    expect(r.state.status).toBe("failed");
    expect(f.calls.filter((c) => c === "c")).toEqual([]);
  });

  it("la validación decide: sin el artefacto la tarea se reintenta y falla; los avisos no la hacen fallar", async () => {
    const f = fakeDeps({ auto: true, invalid: ["a"] });
    const r = new ExecutionRunner(mk([task("a"), task("w")]), new ExecutionStore(dir), f.deps, { retryDelayMs: 0 });
    await r.start();
    expect(r.state.tasks.find((t) => t.id === "a")).toMatchObject({ status: "failed", attempts: 2 });
    expect(r.state.tasks.find((t) => t.id === "a")!.error).toContain("La validación falló");
    expect(r.state.tasks.find((t) => t.id === "w")).toMatchObject({ status: "done", warnings: ["no cumple el contrato"] });
  });

  it("pausar ABORTA las tareas en curso (señal), reanudar las repite y las hechas no se repiten", async () => {
    const f = fakeDeps();
    const st = new ExecutionStore(dir);
    const r = new ExecutionRunner(mk([task("a"), task("b"), task("c")]), st, f.deps, { retryDelayMs: 0 });
    void r.start();
    await tick();
    f.gates.get("a")!(); // a termina
    await tick();
    expect(r.state.tasks.find((t) => t.id === "a")!.status).toBe("done");
    expect(f.started).toEqual(["a", "b", "c"]);
    r.pause();
    await r.whenIdle();
    expect(f.aborted.sort()).toEqual(["b", "c"]);
    expect(r.state.status).toBe("paused");
    expect(r.state.tasks.map((t) => t.status)).toEqual(["done", "pending", "pending"]);
    expect(st.load("2026-10-06_2027-04-05")!.status).toBe("paused");
    // reanudar: b y c vuelven a correr, a no
    void r.resume();
    await tick();
    expect(f.started).toEqual(["a", "b", "c", "b", "c"]);
    f.gates.get("b")!();
    f.gates.get("c")!();
    await r.whenIdle();
    expect(r.state.status).toBe("done");
    expect(r.state.tasks.every((t) => t.status === "done" && t.attempts === 1 + (t.id === "a" ? 0 : 0))).toBe(true);
  });

  it("cancelar aborta lo que corre, cancela el resto y deja el registro de lo ya creado", async () => {
    const f = fakeDeps();
    const st = new ExecutionStore(dir);
    const r = new ExecutionRunner(mk([task("a"), task("b"), task("c"), task("d")]), st, f.deps, { retryDelayMs: 0 });
    void r.start();
    await tick();
    f.gates.get("a")!();
    await tick();
    r.cancel();
    await r.whenIdle();
    expect(f.aborted.length).toBe(2);
    expect(r.state.status).toBe("cancelled");
    expect(r.state.tasks.map((t) => t.status)).toEqual(["done", "cancelled", "cancelled", "cancelled"]);
    expect(st.load("2026-10-06_2027-04-05")!.tasks[0]!.created).toEqual(["Programación/4 Backend/a/a.md"]);
    expect(progressOf(r.state)).toMatchObject({ done: 1, skipped: 3 });
  });

  it("reanudar tras cerrar la app: lo «en curso» vuelve a pendiente y lo hecho no se repite", async () => {
    const st = new ExecutionStore(dir);
    const f1 = fakeDeps();
    const r1 = new ExecutionRunner(mk([task("a"), task("b"), task("c")]), st, f1.deps, { retryDelayMs: 0 });
    void r1.start();
    await tick();
    f1.gates.get("a")!();
    await tick();
    // la app se cierra aquí: en disco quedan a hecha, b y c en curso
    const onDisk = st.load("2026-10-06_2027-04-05")!;
    expect(onDisk.status).toBe("running");
    expect(onDisk.tasks.map((t) => t.status)).toEqual(["done", "running", "running"]);
    r1.cancel();
    await r1.whenIdle();
    // proceso nuevo
    const recovered = recoverInterrupted({ ...onDisk, tasks: onDisk.tasks });
    expect(recovered.status).toBe("paused");
    expect(recovered.tasks.map((t) => t.status)).toEqual(["done", "pending", "pending"]);
    const f2 = fakeDeps({ auto: true });
    const r2 = new ExecutionRunner(recovered, st, f2.deps, { retryDelayMs: 0 });
    await r2.resume();
    expect(f2.calls).toEqual(["b", "c"]);
    expect(r2.state.status).toBe("done");
  });
});

describe("reintentar lo que falló", () => {
  it("reanudar una ejecución con errores vuelve a intentar las tareas caídas y sus dependientes, sin repetir lo hecho", async () => {
    const st = new ExecutionStore(dir);
    const f1 = fakeDeps({ auto: true, failAlways: ["b"] });
    const r1 = new ExecutionRunner(mk([task("a"), task("b"), task("c", { dependsOn: ["b"], folder: "F/c" })]), st, f1.deps, { retryDelayMs: 0 });
    await r1.start();
    expect(r1.state.status).toBe("failed");
    const f2 = fakeDeps({ auto: true });
    const r2 = new ExecutionRunner(st.load("2026-10-06_2027-04-05")!, st, f2.deps, { retryDelayMs: 0 });
    await r2.resume();
    expect(f2.calls).toEqual(["b", "c"]);
    expect(r2.state.status).toBe("done");
  });
});
