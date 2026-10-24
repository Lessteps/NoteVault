// API del plan por ÁREAS: «Reorganizar por áreas» (solo cuando se pide, deshacible con el historial, sin tocar el original antes), propósitos,
// entregables de la agenda (kata, semanal, mensual, de área) y la pregunta global de entregables con excepciones por área.

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
const pre = (over: Record<string, unknown> = {}) => ({
  start: START, end: END, minutesPerDay: 240, studyDays: [1, 2, 3, 4, 5, 6, 7], pace: "intenso", goalIds: [], subjects: ["Programación"], levels: {}, deliverables: "ask", ...over,
});
const seedOf = (name: string, n: number, objective: string) => ({ area: "Programación", objective, topics: Array.from({ length: n }, (_, i) => ({ folder: `Programación/${name}/${two(i + 1)} Tema`, title: `${name.replace(/^[\d.\s]+/, "")} ${i + 1}`, estMinutes: 60 })) });

/** Un plan de estructura ANTIGUA guardado en disco (un subplan por rama), como el del usuario. */
function writeLegacy(): string {
  const built = buildPlan(
    [seedOf("1 Fundamentals", 4, "Reforzar bases de programación"), seedOf("2.1 Python", 3, "Consolidar Python como soporte"), seedOf("4 Backend", 5, "Servicios backend"), seedOf("6 Databases", 3, "Modelado de datos")],
    { id: `${START}_${END}`, start: START, end: END, minutesPerDay: 240, studyDays: [1, 2, 3, 4, 5, 6, 7], pace: "intenso", from: START, preconditions: pre() as never, name: "Reforzar bases de programación +3 · 1 ene–1 mar" },
  ).plan;
  new PlanStore(dir).save({ ...built, proposed: true });
  return built.id;
}

beforeEach(() => {
  for (const k of Object.keys(hoisted.store)) delete hoisted.store[k];
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "nv_mentor_areas_"));
  branch("1 Fundamentals", 4);
  branch("2.1 Python", 3);
  branch("4 Backend", 5);
  branch("6 Databases", 3);
  clearVaultScanCache();
  app = new AppState(dir);
  vaultScan(app);
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe("Reorganizar por áreas (API)", () => {
  it("leer, listar y pedir cambios NO migran el plan: solo cambia cuando se pulsa «Reorganizar por áreas»", async () => {
    const id = writeLegacy();
    const file = path.join(plansDir(), `${id}.json`);
    const before = sha(file);
    const a = mentorApi(app, vi.fn());
    const got: any = a.mentor_plan_get({ id });
    expect(got.plan.structure).toBeUndefined(); // se lee tal cual (estructura antigua)
    expect(got.plan.subplans).toHaveLength(4);
    expect(got.derived.subplans).toHaveLength(4);
    a.mentor_plan_list();
    a.mentor_plan_get({});
    expect(sha(file)).toBe(before);
  });

  it("convierte el plan, queda en el historial y «Deshacer» lo restaura (incluido el nombre) sin perder nada", async () => {
    const id = writeLegacy();
    const file = path.join(plansDir(), `${id}.json`);
    const original = JSON.parse(fs.readFileSync(file, "utf-8"));
    const a = mentorApi(app, vi.fn());
    const r: any = a.mentor_plan_reorganize({ id });
    expect(r.applied).toBe(true);
    expect(r.plan.structure).toBe("areas");
    expect(r.plan.subplans.map((s: any) => s.area)).toEqual(["Backend", "Databases"]);
    expect(r.plan.name).toMatch(/^Backend \+ Databases · /); // sin «+3» ni el periodo repetido
    expect(r.plan.proposed).toBe(true); // el estado «propuesto» se conserva
    expect(r.entry).toMatchObject({ comment: "Reorganizar por áreas", status: "applied", source: "rules" });
    expect(r.entry.before).toBeUndefined();
    const saved = JSON.parse(fs.readFileSync(file, "utf-8"));
    expect(saved.structure).toBe("areas");
    expect(a.mentor_plan_changes({ id })).toHaveLength(1);
    expect(fs.existsSync(path.join(plansDir(), "_history", id, "1.json"))).toBe(true);
    // no se puede reorganizar dos veces
    expect(() => a.mentor_plan_reorganize({ id })).toThrow(/ya está organizado por áreas/);

    const undo: any = a.mentor_plan_change_undo({ id });
    expect(undo.history[0].status).toBe("undone");
    const restored = JSON.parse(fs.readFileSync(file, "utf-8"));
    expect(restored.structure).toBeUndefined();
    expect(restored.name).toBe(original.name); // el nombre antiguo vuelve (no se había renombrado a mano)
    expect(restored.subplans.map((s: any) => [s.id, s.objective, s.topics.length])).toEqual(original.subplans.map((s: any) => [s.id, s.objective, s.topics.length]));
    expect(restored.subplans.flatMap((s: any) => s.topics.map((t: any) => [t.folder, t.targetWeek]))).toEqual(original.subplans.flatMap((s: any) => s.topics.map((t: any) => [t.folder, t.targetWeek])));
  });

  it("si el usuario renombró el plan después de reorganizar, deshacer respeta su nombre", async () => {
    const id = writeLegacy();
    const a = mentorApi(app, vi.fn());
    a.mentor_plan_reorganize({ id });
    a.mentor_plan_rename({ id, name: "Mi plan" });
    a.mentor_plan_change_undo({ id });
    expect((a.mentor_plan_get({ id }) as any).plan.name).toBe("Mi plan");
    expect((a.mentor_plan_get({ id }) as any).plan.structure).toBeUndefined();
  });

  it("un id inexistente o inválido da error claro", () => {
    const a = mentorApi(app, vi.fn());
    expect(() => a.mentor_plan_reorganize({ id: "nada" })).toThrow(/ya no existe/);
    expect(() => a.mentor_plan_reorganize({ id: "../x" })).toThrow(/Plan inválido/);
  });
});

describe("propósitos, entregables y pregunta global (API)", () => {
  async function created(over: Record<string, unknown> = {}) {
    const a = mentorApi(app, vi.fn());
    const r: any = await a.mentor_plan_generate({ preconditions: pre({ practice: { kataMinutes: 30, sessionsPerWeek: 2, minutesPerSession: 60, monthly: true, focus: "rotate" }, ...over }) });
    return { a, id: r.planId as string };
  }

  it("el plan generado es por áreas, con UNA pregunta global de entregables y la práctica con sus katas hechos", async () => {
    const { a, id } = await created();
    const got: any = a.mentor_plan_get({ id });
    expect(got.plan.structure).toBe("areas");
    expect(got.plan.openQuestions).toHaveLength(1);
    expect(got.plan.openQuestions[0].subplanId).toBeUndefined();
    expect(got.practice.kataDoneDates).toEqual([]);
    expect(got.plan.name).toMatch(/^Backend \+ Databases · /);
  });

  it("guardar y borrar el propósito de un día, una semana y un mes; valida el ámbito y la fecha", async () => {
    const { a, id } = await created();
    const p1: any = a.mentor_plan_set_purpose({ id, scope: "day", key: START, text: "  Hoy:   HTTP y kata " });
    expect(p1.purposes).toEqual({ day: { [START]: "Hoy: HTTP y kata" } });
    a.mentor_plan_set_purpose({ id, scope: "week", key: "2", text: "Semana de APIs" });
    a.mentor_plan_set_purpose({ id, scope: "month", key: START.slice(0, 7), text: "Mes de bases" });
    const got: any = a.mentor_plan_get({ id });
    expect(got.plan.purposes).toMatchObject({ week: { "2": "Semana de APIs" }, month: { [START.slice(0, 7)]: "Mes de bases" } });
    const cleared: any = a.mentor_plan_set_purpose({ id, scope: "week", key: "2", text: "" });
    expect(cleared.purposes.week).toBeUndefined();
    expect(() => a.mentor_plan_set_purpose({ id, scope: "day", key: "2001-01-01", text: "x" })).toThrow(/no está en el plan/);
    expect(() => a.mentor_plan_set_purpose({ id, scope: "siglo", key: "1", text: "x" })).toThrow(/no está en el plan/);
  });

  it("los archivos de un entregable de la agenda se anotan y vuelven en el plan, pero su ESTADO no se puede fijar a mano (se calcula solo)", async () => {
    const { a, id } = await created({ deliverables: "yes" });
    const kata = `kata:${START}`;
    const p: any = a.mentor_plan_update_deliverable({ id, deliverableId: kata, files: [{ path: "katas/dia1.py", note: "solución" }] });
    expect(p.deliverables).toEqual([expect.objectContaining({ id: kata, kind: "kata", status: "pendiente", files: [{ path: "katas/dia1.py", note: "solución" }], source: "practice" })]);
    // marcar a mano (kata, proyecto semanal o de área) se rechaza
    expect(() => a.mentor_plan_update_deliverable({ id, deliverableId: kata, status: "hecho" })).toThrow(/se calcula solo/);
    expect(() => a.mentor_plan_update_deliverable({ id, deliverableId: "wp:1", status: "en_curso" })).toThrow(/se calcula solo/);
    const area = (a.mentor_plan_get({ id }) as any).plan.subplans[0];
    expect(() => a.mentor_plan_update_deliverable({ id, deliverableId: `area:${area.id}`, status: "en_curso" })).toThrow(/se calcula solo/);
    // el mismo estado que ya tiene (vocabulario antiguo «idea») no cambia nada
    expect((a.mentor_plan_update_deliverable({ id, deliverableId: `area:${area.id}`, status: "idea" }) as any).subplans[0].deliverable.status).toBe("idea");
    expect(() => a.mentor_plan_update_deliverable({ id, deliverableId: "kata:1999-01-01", status: "hecho" })).toThrow(/ya no existe/);
    expect(() => a.mentor_plan_update_deliverable({ id, deliverableId: kata, status: "quizá" })).toThrow(/inválido/);
  });

  it("pregunta global: «sí» añade el proyecto PROPIO de cada área; después, una excepción por área quita o añade el de una sola", async () => {
    const { a, id } = await created();
    const yes: any = a.mentor_plan_answer({ id, answer: "yes" });
    const titles = yes.subplans.map((s: any) => s.deliverable.title);
    expect(new Set(titles).size).toBe(titles.length); // distintos por área, no el mismo texto repetido
    expect(titles).toEqual(["API REST con persistencia y pruebas", "Esquema relacional con consultas y migraciones"]);
    expect(yes.openQuestions).toBeUndefined();
    const sid = yes.subplans[1].id;
    const without: any = a.mentor_plan_area_deliverable({ id, subplanId: sid, enabled: false });
    expect(without.subplans[1].deliverable).toBeUndefined();
    const again: any = a.mentor_plan_area_deliverable({ id, subplanId: sid, enabled: true });
    expect(again.subplans[1].deliverable.status).toBe("idea");
    // uno ya en marcha no se quita por error
    const st = new PlanStore(dir);
    const live: any = st.load(id);
    live.subplans.find((s: any) => s.id === sid).deliverable.status = "en_curso";
    st.save(live);
    expect(() => a.mentor_plan_area_deliverable({ id, subplanId: sid, enabled: false })).toThrow(/ya está en marcha/);
  });

  it("pedir cambios con comentarios opera por ÁREA (reordenar, fases, propósito, mover un grupo) y se puede deshacer", async () => {
    const { a, id } = await created({ practice: undefined });
    const get = () => (a.mentor_plan_get({ id }) as any).plan;
    expect(get().subplans.map((s: any) => s.areaId)).toEqual(["backend", "databases"]);
    // «más SQL antes del backend»: Databases pasa delante y sus fases se recalculan
    const r: any = await a.mentor_plan_change({ id, comment: "Más SQL antes del backend", noAi: true });
    expect(r.applied).toBe(true);
    expect(r.entry).toMatchObject({ source: "rules", delta: { structure: 1 } });
    expect(get().subplans.map((s: any) => s.areaId)).toEqual(["databases", "backend"]);
    expect(get().subplans[0].phase.fromWeek).toBe(1);
    // el grupo del lenguaje se mueve de área
    const m: any = await a.mentor_plan_change({ id, comment: "Pasa el lenguaje python a databases", noAi: true });
    expect(m.applied).toBe(true);
    expect(get().subplans.find((s: any) => s.areaId === "databases").groups.map((g: any) => g.id)).toContain("lang-python");
    // deshacer el último cambio y luego el anterior
    a.mentor_plan_change_undo({ id });
    expect(get().subplans.find((s: any) => s.areaId === "databases").groups.map((g: any) => g.id)).not.toContain("lang-python");
    a.mentor_plan_change_undo({ id });
    expect(get().subplans.map((s: any) => s.areaId)).toEqual(["backend", "databases"]);
  });

  it("«no» a la pregunta global la descarta y no añade nada; «después» la deja", async () => {
    const { a, id } = await created();
    expect((a.mentor_plan_answer({ id, answer: "later" }) as any).openQuestions).toHaveLength(1);
    const no: any = a.mentor_plan_answer({ id, answer: "no" });
    expect(no.openQuestions).toBeUndefined();
    expect(no.subplans.every((s: any) => !s.deliverable)).toBe(true);
  });
});
