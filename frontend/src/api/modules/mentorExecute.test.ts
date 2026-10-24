// «Ejecutar plan» de punta a punta con la IA simulada y una vault temporal: el informe (agrupado, estimado, ordenado por semanas), la ejecución con
// las funciones REALES de generación de la app, la validación con el checklist, que NUNCA se sobrescribe nada, la cancelación y la reanudación.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({ store: {} as Record<string, unknown>, convDir: "", chat: vi.fn() }));
vi.mock("../appConfig.js", () => ({
  AppConfig: {
    get_ai_config: () => ({ ...hoisted.store }),
    set_ai_config: (d: Record<string, unknown>) => Object.assign(hoisted.store, d),
    get_conversations_dir: () => hoisted.convDir,
  },
}));
vi.mock("../../core/aiClient.js", async (orig) => ({ ...(await orig<typeof import("../../core/aiClient.js")>()), sendChat: (...a: unknown[]) => hoisted.chat(...a) }));

import { buildPlan, PlanStore } from "../../core/mentor/plan.js";
import { ExecutionStore, newExecution } from "../../core/mentor/planExecutor.js";
import { mentorExecuteApi } from "./mentorExecute.js";
import { THEORY, PRACTICA } from "../../core/mentor/designFixtures.js";
import { addDays } from "../../lib/planTime.js";
import { AppState } from "../appState.js";
import { clearVaultScanCache, vaultScan } from "../vaultScan.js";
import { mentorApi } from "./mentor.js";

let dir: string;
let app: AppState;
let id = "";
const two = (n: number) => String(n).padStart(2, "0");
const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
};
const START = todayIso();
const END = addDays(START, 60);
const put = (rel: string, text: string) => {
  const abs = path.join(dir, ...rel.split("/"));
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, text, "utf-8");
};
const read = (rel: string) => fs.readFileSync(path.join(dir, ...rel.split("/")), "utf-8");
const exists = (rel: string) => fs.existsSync(path.join(dir, ...rel.split("/")));
const walk = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));

const A = "Programación/4 Backend/4.1 Uno"; // teoría y manifiesto, sin canvas ni ejercicios
const B = "Programación/4 Backend/4.2 Dos"; // solo el manifiesto: sin teoría
const C = "Programación/4 Backend/4.3 Tres"; // la carpeta no existe
const MINE = "# MI NOTA ESCRITA A MANO\n\nNo se toca.\n";

/** La IA simulada responde según quién pregunta. */
let exerciseN = 0;
function fakeAi(messages: Array<{ role: string; content: string }>): string {
  const sys = messages[0]?.content ?? "";
  if (/rigorous programming teacher/.test(sys)) return THEORY("mixed").replace(/^---[\s\S]*?\n---\s*/, "").replace(/# 4\.3 T/, "# Tema");
  if (/practice designer/.test(sys)) return JSON.stringify({ topic_type: "mixed", skills: [{ skill: "pg_true_false", difficulties: { 1: 2, 2: 2, 3: 0 }, why: "x" }, { skill: "implement", difficulties: { 1: 2, 2: 2, 3: 1 }, why: "y" }], summary: "ok" });
  if (/exercise creator/.test(sys)) {
    return JSON.stringify(Array.from({ length: 4 }, (_, i) => ({ title: `Ejercicio ${++exerciseN}-${i}`, statement: "Given an input, return the output. Expected: 42.", hints: ["h1", "h2"], solution: "42", rubric: ["correct", "edge cases", "clear"] })));
  }
  return "{}";
}

beforeEach(() => {
  for (const k of Object.keys(hoisted.store)) delete hoisted.store[k];
  hoisted.convDir = fs.mkdtempSync(path.join(os.tmpdir(), "nv_conv_"));
  hoisted.chat.mockReset();
  hoisted.chat.mockImplementation(async (_cfg: unknown, msgs: Array<{ role: string; content: string }>) => fakeAi(msgs));
  exerciseN = 0;
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "nv_run_"));
  Object.assign(hoisted.store, { provider: "openai", api_key: "k", model: "m", base_url: "http://x" });
  put("Programación/Programación.resumen.md", "---\nsubject: programming\ntitle: Programación\n---\n# P\n");
  put(`${A}/4.1 Uno.md`, THEORY("mixed"));
  put(`${A}/4.1 Uno.practica.md`, PRACTICA(["pg_true_false", "implement"]));
  put(`${B}/4.2 Dos.practica.md`, PRACTICA(["pg_true_false", "implement"]));
  put("Programación/4 Backend/4.1 Uno/MI NOTA.md", MINE);
  clearVaultScanCache();
  app = new AppState(dir);
  vaultScan(app);
  const seed = { area: "Programación", objective: "Backend", topics: [A, B, C].map((f, i) => ({ folder: f, title: f.split("/").pop()!, estMinutes: 60, targetWeek: i + 1 })) };
  const built = buildPlan([seed], { id: `${START}_${END}`, start: START, end: END, minutesPerDay: 240, studyDays: [1, 2, 3, 4, 5, 6, 7], pace: "intenso", from: START, preconditions: { start: START, end: END, minutesPerDay: 240, studyDays: [1, 2, 3, 4, 5, 6, 7], pace: "intenso", goalIds: [], subjects: ["Programación"], levels: {}, deliverables: "no", freeObjective: "backend" } as never, name: "Plan" }).plan;
  new PlanStore(dir).save({
    ...built,
    structure: "areas",
    programmingPractice: { kata: { minutesPerDay: 25, days: [1, 2, 3, 4, 5] } },
    subplans: built.subplans.map((s) => ({ ...s, areaId: "backend", area: "Backend", groups: [{ id: "core", title: "Conocimientos de backend", kind: "knowledge" as const, order: 100 }], topics: s.topics.map((t, i) => ({ ...t, group: "core", targetWeek: i + 1 })) })),
  });
  id = built.id;
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.rmSync(hoisted.convDir, { recursive: true, force: true });
});

const api = () => mentorApi(app, vi.fn());
const waitDone = async (planId: string, ms = 20000) => {
  const t0 = Date.now();
  for (;;) {
    const r: any = api().mentor_execution_status({ id: planId });
    if (r.execution && !r.active && r.execution.state.status !== "running") return r.execution.state;
    if (Date.now() - t0 > ms) throw new Error("la ejecución no terminó: " + JSON.stringify(r.execution?.progress));
    await new Promise((ok) => setTimeout(ok, 40));
  }
};

describe("informe de ejecución", () => {
  it("lista lo que falta agrupado por tema, ordenado por semanas y con estimación; no escribe nada", () => {
    const before = walk(dir).length;
    const r: any = api().mentor_execution_report({ id });
    expect(r.loading).toBe(false);
    const report = r.report;
    const ids = report.tasks.map((t: any) => t.id);
    // semana 1: canvas de A y sus ejercicios; semana 2: teoría de B (+ ejercicios); semana 3: tema C que no existe; luego carpeta de práctica de Backend
    expect(ids.indexOf(`canvas:${A}`)).toBeLessThan(ids.indexOf(`practice:${A}`));
    expect(ids.indexOf(`practice:${A}`)).toBeLessThan(ids.indexOf(`theory:${B}`));
    expect(ids.indexOf(`theory:${B}`)).toBeLessThan(ids.indexOf(`topic_new:${C}`));
    const weeks = report.tasks.filter((t: any) => t.folder).map((t: any) => t.week);
    expect([...weeks].sort((a: number, b: number) => a - b)).toEqual(weeks);
    expect(ids).toContain("pp_init");
    expect(ids).toContain("area_folder:backend");
    expect(report.totals.aiCalls).toBeGreaterThan(0);
    expect(report.totals.minutes).toBeGreaterThan(0);
    expect(report.totals.files).toBeGreaterThan(5);
    expect(report.areas[0].topics.map((t: any) => t.title)).toEqual(["4.1 Uno", "4.2 Dos", "4.3 Tres"]);
    // el tema A tiene su nota sin canvas: la tarea de canvas no cuesta IA; A sin ejercicios pide sus 2 skills
    const practiceA = report.tasks.find((t: any) => t.id === `practice:${A}`);
    expect(practiceA.args.cells.map((c: any) => c.skill)).toEqual(["pg_true_false", "implement"]);
    expect(walk(dir).length).toBe(before);
  });

  it("el alcance filtra por semanas y por área", () => {
    const w: any = api().mentor_execution_report({ id, scope: { mode: "weeks", fromWeek: 1, toWeek: 1 } });
    expect(w.report.tasks.filter((t: any) => t.folder).every((t: any) => t.week === 1)).toBe(true);
    expect(w.report.tasks.some((t: any) => t.id === `theory:${B}`)).toBe(false);
    const none: any = api().mentor_execution_report({ id, scope: { mode: "area", areaKey: "otra" } });
    expect(none.report.tasks).toEqual([]);
    const noArea: any = api().mentor_execution_report({ id, scope: { includeAreaPractice: false } });
    expect(noArea.report.tasks.some((t: any) => t.kind === "area_folder")).toBe(false);
  });
});

describe("ejecutar el plan", () => {
  it("exige la confirmación y la IA configurada; no hace nada sin ellas", async () => {
    await expect(Promise.resolve().then(() => api().mentor_execution_start({ id }))).rejects.toThrow(/confirmación/);
    for (const k of Object.keys(hoisted.store)) delete hoisted.store[k];
    await expect(Promise.resolve().then(() => api().mentor_execution_start({ id, confirm: true }))).rejects.toThrow(/IA no está configurada/);
    expect(hoisted.chat).not.toHaveBeenCalled();
    expect(fs.existsSync(path.join(dir, ".notevault", "mentor", "executions"))).toBe(false);
  });

  it("crea lo que falta con las funciones de la app, valida y NO toca lo que ya existía", async () => {
    const mine = read(`${A}/MI NOTA.md`);
    const theoryA = read(`${A}/4.1 Uno.md`);
    const practicaA = read(`${A}/4.1 Uno.practica.md`);
    const practicaB = read(`${B}/4.2 Dos.practica.md`);
    const started: any = await api().mentor_execution_start({ id, confirm: true, scope: { mode: "all", includeAreaPractice: true } });
    expect(started.loading).toBe(false);
    const state = await waitDone(id);
    expect(state.tasks.map((t: any) => `${t.id}:${t.status}`).filter((s: string) => !/done$/.test(s))).toEqual([]);
    // A: canvas generado de su nota + ejercicios; la nota y el manifiesto intactos
    expect(walk(path.join(dir, ...A.split("/"))).some((f) => f.endsWith("— mapa.canvas"))).toBe(true);
    expect(read(`${A}/MI NOTA.md`)).toBe(mine);
    expect(read(`${A}/4.1 Uno.md`)).toBe(theoryA);
    expect(read(`${A}/4.1 Uno.practica.md`)).toBe(practicaA);
    // B: ahora tiene teoría + canvas + ejercicios; su manifiesto escrito a mano sigue igual
    expect(walk(path.join(dir, ...B.split("/"))).some((f) => /4\.2 Dos\.md$/.test(f))).toBe(true);
    expect(read(`${B}/4.2 Dos.practica.md`)).toBe(practicaB);
    // C: tema nuevo con teoría y manifiesto
    expect(exists(`${C}/4.3 Tres.md`)).toBe(true);
    expect(exists(`${C}/4.3 Tres.practica.md`)).toBe(true);
    // carpeta de práctica del área
    expect(exists("Programación/programming_practice/backend/README.md")).toBe(true);
    expect(exists("Programación/programming_practice/backend/skills.md")).toBe(true);
    expect(walk(path.join(dir, "Programación", "programming_practice", "backend", "katas")).length).toBeGreaterThan(3);
    // el registro lista los archivos creados por tarea
    const created = state.tasks.flatMap((t: any) => t.created);
    expect(created.length).toBeGreaterThan(10);
    expect(created.every((f: string) => exists(f))).toBe(true);
    expect(new Set(created).size).toBe(created.length);
    expect(state.status).toBe("done");
    // el diseño de A y B queda completo en lo obligatorio
    vaultScan(app);
    const after: any = api().mentor_plan_coverage({ id });
    expect(after.coverage.areas[0].design.requiredGaps).toBe(0);
    // el registro está en disco, y un segundo informe ya no pide lo hecho
    expect(fs.existsSync(path.join(dir, ".notevault", "mentor", "executions", `${id}.json`))).toBe(true);
    const again: any = api().mentor_execution_report({ id });
    expect(again.report.tasks).toEqual([]);
  }, 40000);

  it("si la generación intenta modificar un archivo que ya existía, se restaura tal cual", async () => {
    // la IA de teoría «reescribe» la nota de B si existiera; aquí además fuerza escribir en un archivo ajeno del tema
    const victim = `${B}/notas propias.txt`;
    put(victim, MINE);
    hoisted.chat.mockImplementation(async (_c: unknown, msgs: Array<{ role: string; content: string }>) => {
      if (/rigorous programming teacher/.test(msgs[0]!.content)) fs.writeFileSync(path.join(dir, ...victim.split("/")), "SOBRESCRITO POR LA IA", "utf-8");
      return fakeAi(msgs);
    });
    await api().mentor_execution_start({ id, confirm: true, scope: { mode: "weeks", fromWeek: 2, toWeek: 2, includeAreaPractice: false } });
    const state = await waitDone(id);
    expect(read(victim)).toBe(MINE);
    const t = state.tasks.find((x: any) => x.id === `theory:${B}`);
    expect(t.warnings.join(" ")).toMatch(/Se restauró/);
  }, 40000);

  it("cancelar mata la llamada en curso (señal), deja el resto cancelado y no crea nada más", async () => {
    let signal: AbortSignal | undefined;
    hoisted.chat.mockImplementation((_c: unknown, msgs: Array<{ role: string; content: string }>, opts?: { signal?: AbortSignal }) => {
      if (/rigorous programming teacher/.test(msgs[0]!.content)) {
        signal = opts?.signal;
        return new Promise((_ok, bad) => opts?.signal?.addEventListener("abort", () => bad(new Error("Cancelado."))));
      }
      return Promise.resolve(fakeAi(msgs));
    });
    await api().mentor_execution_start({ id, confirm: true, scope: { mode: "weeks", fromWeek: 2, toWeek: 3, includeAreaPractice: false } });
    for (let i = 0; i < 100 && !signal; i++) await new Promise((ok) => setTimeout(ok, 20));
    expect(signal).toBeDefined();
    api().mentor_execution_cancel({ id });
    const state = await waitDone(id);
    expect(signal!.aborted).toBe(true);
    expect(state.status).toBe("cancelled");
    expect(state.tasks.every((t: any) => t.status === "cancelled" || t.status === "done")).toBe(true);
    expect(exists(`${B}/4.2 Dos.md`)).toBe(false);
    expect(exists(`${C}/4.3 Tres.md`)).toBe(false);
  }, 30000);

  it("pausa y reanudación: lo hecho no se repite y al final todo está hecho", async () => {
    let gate: (() => void) | undefined;
    let theoryCalls = 0;
    hoisted.chat.mockImplementation((_c: unknown, msgs: Array<{ role: string; content: string }>, opts?: { signal?: AbortSignal }) => {
      if (/rigorous programming teacher/.test(msgs[0]!.content) && theoryCalls++ === 0) {
        return new Promise((_ok, bad) => {
          gate = () => bad(new Error("Cancelado."));
          opts?.signal?.addEventListener("abort", () => bad(new Error("Cancelado.")));
        });
      }
      return Promise.resolve(fakeAi(msgs));
    });
    await api().mentor_execution_start({ id, confirm: true, scope: { mode: "all", includeAreaPractice: false } });
    for (let i = 0; i < 100 && !gate; i++) await new Promise((ok) => setTimeout(ok, 20));
    api().mentor_execution_pause({ id });
    const paused = await waitDone(id);
    expect(paused.status).toBe("paused");
    const doneBefore = paused.tasks.filter((t: any) => t.status === "done").map((t: any) => t.id);
    api().mentor_execution_resume({ id });
    const fin = await waitDone(id);
    expect(fin.status).toBe("done");
    expect(doneBefore.every((x: string) => fin.tasks.find((t: any) => t.id === x).attempts === 1)).toBe(true);
    expect(exists(`${B}/4.2 Dos.md`)).toBe(true);
  }, 40000);

  it("katas por área con IA: bloques validados; el kata que la IA no devuelve (o devuelve mal) usa la plantilla; no se duplican", async () => {
    const good = { day: 1, title: "Idempotent order import", statement: "A small shop imports orders from a CSV every night. Design the import so that running it twice never duplicates an order, and list the checks you run before writing.", criteria: ["Running twice gives the same result", "Bad rows are reported", "Totals add up"], hints: ["Decide what identifies an order", "Write to a staging table first"], solution: "Use the order number as a natural key and upsert inside one transaction." };
    const bad = { day: 2, title: "x", statement: "corto", criteria: [], hints: [], solution: "" };
    const send = vi.fn().mockResolvedValue(JSON.stringify({ katas: [good, bad] }));
    const apiAi = mentorApi(app, send);
    const rep: any = apiAi.mentor_execution_report({ id, scope: { mode: "all", includeKatasAi: true } });
    const kt = rep.report.tasks.filter((t: any) => t.kind === "area_katas_ai");
    expect(kt.length).toBeGreaterThan(0);
    expect(rep.report.tasks.find((t: any) => t.id === "area_folder:backend").args.katas).toBe(0);
    await apiAi.mentor_execution_start({ id, confirm: true, scope: { mode: "all", includeKatasAi: true, includeRecommended: false } });
    const state = await waitDone(id);
    expect(state.status).toBe("done");
    expect(send).toHaveBeenCalled();
    expect(JSON.stringify(send.mock.calls[0]![1])).toContain("Backend");
    const katas = fs.readdirSync(path.join(dir, "Programación", "programming_practice", "backend", "katas")).filter((f) => /^\d{3} /.test(f));
    expect(katas.some((f) => f.startsWith("001 Idempotent order import"))).toBe(true);
    expect(katas.filter((f) => f.startsWith("002 "))).toHaveLength(1); // plantilla de respaldo
    expect(new Set(katas.map((f) => f.slice(0, 3))).size).toBe(katas.length); // un archivo por día
    const k1 = read(`Programación/programming_practice/backend/katas/${katas.find((f) => f.startsWith("001"))!}`);
    expect(k1).toContain("kata_skill: pp_kata:backend");
    expect(k1).toContain("A small shop imports orders");
  }, 60000);

  it("una ejecución que quedó «en curso» al cerrar la app se devuelve en pausa y se puede reanudar", async () => {
    const report: any = api().mentor_execution_report({ id, scope: { includeAreaPractice: false } }).report;
    const { newExecution, ExecutionStore } = await import("../../core/mentor/planExecutor.js");
    const s = newExecution(id, report.scope, report.tasks, "2026-10-09T10:00:00.000Z");
    s.tasks[0]!.status = "running";
    new ExecutionStore(dir).save(s);
    const st: any = api().mentor_execution_status({ id });
    expect(st.execution.state.status).toBe("paused");
    expect(st.execution.state.tasks[0].status).toBe("pending");
    api().mentor_execution_resume({ id });
    const fin = await waitDone(id);
    expect(fin.status).toBe("done");
  }, 40000);
});

describe("plan para Antigravity: esquema de lo que falta y planes bajo demanda", () => {
  const scheme = async (opts: Record<string, unknown> = {}): Promise<any> => ((await mentorApi(app).mentor_handoff_scheme({ id, ai: false, ...opts })) as any).scheme;

  it("reparte lo que falta en planes: primero la teoría y luego los ejercicios, con los archivos exactos y sin tocar la vault", async () => {
    const notes = (): string[] => walk(dir).filter((f) => !f.includes(`${path.sep}.notevault${path.sep}`)).sort();
    const before = notes();
    const sc = await scheme();
    expect(sc.packages.length).toBeGreaterThanOrEqual(2);
    const kinds = sc.packages.map((p: any) => p.kind);
    expect(kinds.indexOf("theory")).toBeLessThan(kinds.lastIndexOf("exercises"));
    expect(sc.packages.map((p: any) => p.order)).toEqual(sc.packages.map((_: unknown, i: number) => i + 1));
    expect(sc.source).toBe("rules");
    const ex = sc.packages.filter((p: any) => p.kind === "exercises");
    expect(ex.length).toBeGreaterThan(0);
    // cada celda de ejercicios lleva cuántos escribir (3 por defecto) y suma los archivos del plan
    const cell = ex[0].topics[0].cells[0];
    expect(cell).toMatchObject({ write: 3 });
    expect(ex[0].files).toBe(ex[0].topics.reduce((n: number, t: any) => n + t.cells.reduce((m: number, c: any) => m + c.write, 0), 0));
    expect(sc.totals.files).toBe(sc.packages.reduce((n: number, p: any) => n + p.files, 0));
    // solo escribió el esquema guardado: ninguna nota ni ejercicio cambió
    expect(notes()).toEqual(before);
    expect(exists(`.notevault/mentor/handoff/${id}.json`)).toBe(true);
  });

  it("con menos archivos por plan la práctica se parte en más planes y 1 ejercicio por celda baja el total", async () => {
    const big = await scheme({ maxFiles: 400 });
    const small = await scheme({ maxFiles: 30 });
    const one = await scheme({ perCell: 1, maxFiles: 400 });
    expect(small.packages.filter((p: any) => p.kind === "exercises").length).toBeGreaterThanOrEqual(big.packages.filter((p: any) => p.kind === "exercises").length);
    expect(one.totals.files).toBeLessThan(big.totals.files);
  });

  it("escribe el documento de UN plan en _handoff, en inglés, con la lista exacta y la instrucción para pegar", async () => {
    const sc = await scheme();
    const pkg = sc.packages.find((p: any) => p.kind === "exercises");
    const r: any = mentorApi(app).mentor_handoff_write({ id, packageId: pkg.id });
    expect(r.rel).toMatch(new RegExp(`^Programación/_handoff/${id}/\\d\\d-${pkg.id}\\.md$`));
    const md = read(r.rel);
    expect(md).toContain("# Antigravity plan");
    expect(md).toContain(pkg.topics[0].folder);
    expect(md).toContain("exercises_check.mjs");
    expect(md).toContain("ANTIGRAVITY_PLAN_CONTENT_GENERATION.md");
    expect(r.prompt).toContain("execute it");
    expect(r.scheme.packages.find((p: any) => p.id === pkg.id).written.path).toBe(r.path);
    // los demás planes siguen sin escribir
    expect(r.scheme.pending.packages).toBe(sc.packages.length - 1);
    expect(() => mentorApi(app).mentor_handoff_write({ id, packageId: "nope" })).toThrow(/ya no está/);
  });

  it("volver a esquematizar conserva lo ya escrito", async () => {
    const sc = await scheme();
    const pkg = sc.packages[0];
    mentorApi(app).mentor_handoff_write({ id, packageId: pkg.id });
    const again = await scheme();
    expect(again.packages.find((p: any) => p.id === pkg.id).written).toBeTruthy();
    expect(((mentorApi(app).mentor_handoff_get({ id }) as any).scheme.pending.packages)).toBe(again.packages.length - 1);
  });

  it("con IA: ordena y nombra los planes; si responde algo inválido cae a reglas y lo dice", async () => {
    const base = await scheme();
    const ids = base.packages.map((p: any) => p.id) as string[];
    const reversed = [...ids].reverse();
    hoisted.chat.mockImplementation(async () => JSON.stringify({ order: reversed, packages: [{ id: ids[0], title: "Primero lo primero", why: "Desbloquea el resto" }] }));
    const ai = await scheme({ ai: true });
    expect(ai.source).toBe("ai");
    expect(ai.packages.map((p: any) => p.id)).toEqual(reversed);
    expect(ai.packages.find((p: any) => p.id === ids[0]).title).toBe("Primero lo primero");
    // el contenido de los planes no cambia: solo el orden y el nombre
    expect(ai.totals.files).toBe(base.totals.files);
    hoisted.chat.mockImplementation(async () => "no es json");
    const bad = await scheme({ ai: true });
    expect(bad.source).toBe("rules");
    expect(bad.note).toContain("reglas");
  });
});

describe("reanudar sola al abrir la app", () => {
  const savedRunning = (status: "running" | "paused") => {
    const rep: any = api().mentor_execution_report({ id });
    const st = { ...newExecution(id, rep.report.scope, rep.report.tasks, new Date().toISOString()), status };
    new ExecutionStore(dir).save(st);
    return st;
  };
  const untilDone = async (app2: AppState, ms = 20000) => {
    const t0 = Date.now();
    for (;;) {
      const s = new ExecutionStore(dir).load(id);
      if (s && s.status !== "running") return s;
      if (Date.now() - t0 > ms) throw new Error("no terminó");
      await new Promise((ok) => setTimeout(ok, 40));
    }
    void app2;
  };

  it("una ejecución que quedó «en curso» en disco NO se reanuda sola al abrir la app: figura en pausa y espera a la persona", async () => {
    savedRunning("running");
    const app2 = new AppState(dir); // la app se vuelve a abrir: no hay ningún runner en memoria
    const api2 = mentorExecuteApi(app2, { autoResumeDelayMs: 5, retryDelayMs: 1 }); // sin `autoResume`: el valor por defecto
    await new Promise((ok) => setTimeout(ok, 200));
    expect(hoisted.chat).not.toHaveBeenCalled();
    const status = api2.mentor_execution_status({ id }) as { execution: { state: { status: string } } };
    expect(status.execution.state.status).toBe("paused"); // el banner «¿reanudar?» la ofrece
    // y solo con la acción explícita de la persona sigue
    api2.mentor_execution_resume({ id });
    const done = await untilDone(app2);
    expect(done.status).toBe("done");
  }, 40_000);

  it("con `autoResume: true` explícito (ya no es el valor por defecto) sí se reanuda sola", async () => {
    savedRunning("running");
    const app2 = new AppState(dir);
    mentorExecuteApi(app2, { autoResume: true, autoResumeDelayMs: 5, retryDelayMs: 1 });
    const done = await untilDone(app2);
    expect(done.status).toBe("done");
  }, 40_000);

  it("una pausada por la persona (o por un límite de uso) NO se toca", async () => {
    savedRunning("paused");
    const app2 = new AppState(dir);
    mentorExecuteApi(app2, { autoResume: true, autoResumeDelayMs: 5, retryDelayMs: 1 });
    await new Promise((ok) => setTimeout(ok, 150));
    expect(new ExecutionStore(dir).load(id)!.status).toBe("paused");
    expect(hoisted.chat).not.toHaveBeenCalled();
  });

  it("sin IA configurada no arranca nada", async () => {
    savedRunning("running");
    for (const k of Object.keys(hoisted.store)) delete hoisted.store[k];
    const app2 = new AppState(dir);
    mentorExecuteApi(app2, { autoResume: true, autoResumeDelayMs: 5, retryDelayMs: 1 });
    await new Promise((ok) => setTimeout(ok, 150));
    expect(hoisted.chat).not.toHaveBeenCalled();
    expect(new ExecutionStore(dir).load(id)!.status).toBe("running"); // sigue figurando en curso: se reanudará cuando haya IA
  });
});

