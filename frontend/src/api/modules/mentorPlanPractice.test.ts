// «Generar la práctica del plan con el Mentor» (API): currículo guardado de forma aditiva, ejercicios de la vault priorizados, fallo por
// bloque → plantillas, sin IA → plantillas, historial con «Deshacer», cancelación y que leer/listar nunca modifica el plan.

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({ store: {} as Record<string, unknown> }));
vi.mock("../appConfig.js", () => ({
  AppConfig: {
    get_ai_config: () => ({ ...hoisted.store }),
    set_ai_config: (d: Record<string, unknown>) => Object.assign(hoisted.store, d),
  },
}));

import { buildPlan, PlanStore } from "../../core/mentor/plan.js";
import { addDays } from "../../lib/planTime.js";
import { AppState } from "../appState.js";
import { clearVaultScanCache, vaultScan } from "../vaultScan.js";
import { mentorApi } from "./mentor.js";

const MANIFEST = (title: string) => `---\ntype: topic\nsubject: programming\ntitle: "${title}"\nskills: [implement, debug]\nmastery:\n  min_per_skill: 6\n  target_difficulty: 3\n  exam: none\n---\n`;
let dir: string;
let app: AppState;

function topic(rel: string) {
  const abs = path.join(dir, ...rel.split("/"));
  fs.mkdirSync(abs, { recursive: true });
  const title = rel.split("/").pop()!;
  fs.writeFileSync(path.join(abs, "_tema.md"), MANIFEST(title), "utf-8");
  fs.writeFileSync(path.join(abs, `${title}.md`), "---\ntype: concept\n---\n# T\n", "utf-8");
}
const branch = (name: string, n: number) => Array.from({ length: n }, (_, i) => `Programación/${name}/${String(i + 1).padStart(2, "0")} Tema`).forEach(topic);
const two = (n: number) => String(n).padStart(2, "0");
const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
};
const plansDir = () => path.join(dir, ".notevault", "mentor", "plans");
const sha = (f: string) => crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex");
const START = todayIso();
const END = addDays(todayIso(), 60);
const pre = () => ({ start: START, end: END, minutesPerDay: 240, studyDays: [1, 2, 3, 4, 5, 6, 7], pace: "intenso", goalIds: [], subjects: ["Programación"], levels: {}, deliverables: "ask" });
const seedOf = (name: string, n: number, objective: string) => ({ area: "Programación", objective, topics: Array.from({ length: n }, (_, i) => ({ folder: `Programación/${name}/${two(i + 1)} Tema`, title: `${name.replace(/^[\d.\s]+/, "")} ${i + 1}`, estMinutes: 60 })) });

/** Un plan por áreas guardado en disco (la estructura antigua se reorganiza con la API, como hace el usuario). */
function writeAreasPlan(a: any): string {
  const built = buildPlan(
    [seedOf("1 Fundamentals", 4, "Bases"), seedOf("2.1 Python", 3, "Python"), seedOf("4 Backend", 5, "Backend"), seedOf("6 Databases", 3, "Datos")],
    { id: `${START}_${END}`, start: START, end: END, minutesPerDay: 240, studyDays: [1, 2, 3, 4, 5, 6, 7], pace: "intenso", from: START, preconditions: pre() as never },
  ).plan;
  new PlanStore(dir).save({ ...built });
  a.mentor_plan_reorganize({ id: built.id });
  return built.id;
}
const replyFor = (text: string): string => {
  const weeks = [...text.matchAll(/SEMANA (\d+)/g)].map((m) => Number(m[1]));
  const folder = /- (Programación\/6 Databases\/\d+ Tema) ·/.exec(text)?.[1] ?? "Programación/6 Databases/01 Tema";
  return JSON.stringify({
    weeks: weeks.map((w) => ({
      week: w,
      exercises: [{ topic: folder, practice: "database", title: `Semana ${w}: escribe la consulta con JOIN` }, { topic: "Programación/NoExiste/01", title: "inventado" }],
      logic: [{ title: "Dos sumas" }],
      weeklyProject: { title: `API semana ${w}` },
    })),
  });
};

beforeEach(() => {
  for (const k of Object.keys(hoisted.store)) delete hoisted.store[k];
  Object.assign(hoisted.store, { provider: "deepseek", api_key: "sk-test", model: "m" });
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "nv_mentor_practice_"));
  branch("1 Fundamentals", 4);
  branch("2.1 Python", 3);
  branch("4 Backend", 5);
  branch("6 Databases", 3);
  clearVaultScanCache();
  app = new AppState(dir);
  vaultScan(app);
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe("mentor_plan_practice_generate", () => {
  it("leer y listar no crean currículo; generar con IA lo guarda en el plan, valida temas y queda en el historial", async () => {
    const send = vi.fn(async (_cfg: unknown, m: Array<{ content: string }>) => replyFor(m[1]!.content));
    const a: any = mentorApi(app, send as never);
    const id = writeAreasPlan(a);
    const file = path.join(plansDir(), `${id}.json`);
    a.mentor_plan_get({ id });
    a.mentor_plan_list();
    expect(JSON.parse(fs.readFileSync(file, "utf-8")).practiceCurriculum).toBeUndefined();
    const r: any = await a.mentor_plan_practice_generate({ id, all: true });
    expect(r.loading).toBe(false);
    expect(r.aiUsed).toBe(true);
    expect(send).toHaveBeenCalled();
    const saved = JSON.parse(fs.readFileSync(file, "utf-8"));
    expect(saved.practiceCurriculum.source).toMatch(/ai|mixed/);
    expect(saved.practiceCurriculum.weeks[0].weeklyProject.title).toMatch(/API semana/);
    expect(JSON.stringify(saved.practiceCurriculum)).not.toContain("inventado");
    expect(r.entry).toMatchObject({ comment: "Generar la práctica del plan", status: "applied", source: "ai" });
    expect(a.mentor_plan_changes({ id })).toHaveLength(2); // reorganizar + práctica
    // «Deshacer» devuelve el plan sin currículo (la reorganización sigue aplicada)
    const undo: any = a.mentor_plan_change_undo({ id });
    expect(undo.plan.practiceCurriculum).toBeUndefined();
    expect(JSON.parse(fs.readFileSync(file, "utf-8")).structure).toBe("areas");
  });

  it("el currículo guardado vuelve al leer el plan (aditivo)", async () => {
    const a: any = mentorApi(app, vi.fn(async (_c: unknown, m: Array<{ content: string }>) => replyFor(m[1]!.content)) as never);
    const id = writeAreasPlan(a);
    await a.mentor_plan_practice_generate({ id, all: true });
    const got: any = a.mentor_plan_get({ id });
    expect(got.plan.practiceCurriculum.weeks.length).toBeGreaterThan(0);
  });

  it("sin IA (por petición o sin configurar) guarda plantillas automáticas sin llamar a nada", async () => {
    const send = vi.fn();
    const a: any = mentorApi(app, send as never);
    const id = writeAreasPlan(a);
    const r: any = await a.mentor_plan_practice_generate({ id, noAi: true, all: true });
    expect(send).not.toHaveBeenCalled();
    expect(r.aiUsed).toBe(false);
    const cur = new PlanStore(dir).load(id)!.practiceCurriculum!;
    expect(cur.source).toBe("template");
    expect(cur.weeks.every((w) => w.source === "template")).toBe(true);
    expect(r.entry.source).toBe("rules");
    for (const k of Object.keys(hoisted.store)) delete hoisted.store[k];
    const r2: any = await a.mentor_plan_practice_generate({ id, all: true });
    expect(r2.aiUsed).toBe(false);
  });

  it("si la IA falla, el bloque cae a plantillas y el plan se guarda igualmente con el aviso", async () => {
    const a: any = mentorApi(app, vi.fn(async () => { throw new Error("sin red"); }) as never);
    const id = writeAreasPlan(a);
    const r: any = await a.mentor_plan_practice_generate({ id, all: true });
    expect(r.aiUsed).toBe(false);
    expect(r.entry.warnings.join(" ")).toMatch(/plantillas porque la IA falló/);
    expect(new PlanStore(dir).load(id)!.practiceCurriculum!.source).toBe("template");
  });

  it("cancelar con mentor_ai_cancel aborta sin guardar nada", async () => {
    let started!: () => void;
    const go = new Promise<void>((ok) => (started = ok));
    const a: any = mentorApi(
      app,
      vi.fn((_c: unknown, _m: unknown, o?: { signal?: AbortSignal }) => new Promise<string>((_ok, rej) => {
        started();
        o?.signal?.addEventListener("abort", () => rej(new Error("abort")));
      })) as never,
    );
    const id = writeAreasPlan(a);
    const file = path.join(plansDir(), `${id}.json`);
    const before = sha(file);
    const p = a.mentor_plan_practice_generate({ id, all: true });
    await go;
    expect(a.mentor_ai_status({ key: `practice:${id}` }).busy).toBe(true);
    a.mentor_ai_cancel({ key: `practice:${id}`, mode: "abort" });
    await expect(p).rejects.toThrow(/Cancelado/);
    expect(sha(file)).toBe(before);
    expect(a.mentor_ai_status({ key: `practice:${id}` }).busy).toBe(false);
  });

  it("valida el id y el plan", async () => {
    const a: any = mentorApi(app, vi.fn() as never);
    await expect(a.mentor_plan_practice_generate({ id: "../x" })).rejects.toThrow(/Plan inválido/);
    await expect(a.mentor_plan_practice_generate({ id: "no-existe" })).rejects.toThrow(/ya no existe/);
  });
});
