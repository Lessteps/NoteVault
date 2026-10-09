// API del motor v2: crear el plan con modo de áreas y lenguajes, proyectos de tema, ruta (`mentor_route`, `mentor_plan_reduce`,
// `mentor_plan_route_set`) con historial/Deshacer, cambio de modo (`set_area_mode`) y compatibilidad con planes antiguos.

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

import { applyOps } from "../../core/mentor/planChange.js";
import { PlanStore } from "../../core/mentor/plan.js";
import { addDays } from "../../lib/planTime.js";
import { buildSchedule } from "../../lib/planSchedule.js";
import { AppState } from "../appState.js";
import { clearVaultScanCache, vaultScan } from "../vaultScan.js";
import { mentorApi } from "./mentor.js";

const MANIFEST = (title: string) => `---\ntype: topic\nsubject: programming\ntitle: "${title}"\nskills: [implement, debug]\nmastery:\n  min_per_skill: 6\n  target_difficulty: 3\n  exam: none\n---\n`;
let dir: string;
let app: AppState;
const two = (n: number) => String(n).padStart(2, "0");
const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
};
function topic(rel: string, title: string) {
  const abs = path.join(dir, ...rel.split("/"));
  fs.mkdirSync(abs, { recursive: true });
  fs.writeFileSync(path.join(abs, "_tema.md"), MANIFEST(title), "utf-8");
  fs.writeFileSync(path.join(abs, `${title}.md`), "---\ntype: concept\n---\n# T\n", "utf-8");
}
const NAMES = ["Alfa", "Beta", "Gamma", "Delta", "Epsilon", "Zeta", "Eta", "Theta", "Iota", "Kappa", "Lambda", "Mu"];
const branch = (name: string, n: number) => NAMES.slice(0, n).forEach((nm, i) => topic(`Programación/${name}/${two(i + 1)} ${nm}`, `${nm} ${name.replace(/^[\d.\s]+/, "").slice(0, 3)}`));
const plansDir = () => path.join(dir, ".notevault", "mentor", "plans");
const sha = (f: string) => crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex");
const START = todayIso();
const END = addDays(START, 55);
const pre = (over: Record<string, unknown> = {}) => ({ start: START, end: END, minutesPerDay: 240, studyDays: [1, 2, 3, 4, 5, 6, 7], pace: "intenso", goalIds: [], subjects: ["Programación"], levels: { Programación: "empezando" }, deliverables: "no", ...over });

beforeEach(() => {
  for (const k of Object.keys(hoisted.store)) delete hoisted.store[k];
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "nv_mentor_motor_"));
  branch("1 Fundamentals", 10);
  branch("2.1 Python", 3);
  branch("4 Backend", 6);
  branch("5 Frontend", 6);
  branch("6 Databases", 4);
  clearVaultScanCache();
  app = new AppState(dir);
  vaultScan(app);
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

async function create(over: Record<string, unknown> = {}) {
  const a = mentorApi(app, vi.fn());
  const r: any = await a.mentor_plan_generate({ preconditions: pre(over), noAi: true });
  const id = r.planId as string;
  return { a, id, plan: () => new PlanStore(dir).load(id)! };
}

describe("crear el plan con modo de áreas y lenguajes", () => {
  it("juntas: el plan declara el modo, sus lenguajes obligatorios y todas las áreas activas todo el periodo", async () => {
    const { plan } = await create({ areaMode: "together", languages: [] });
    const p = plan();
    expect(p.areaMode).toBe("together");
    expect(p.areaModeBy).toBe("user");
    expect(p.areaModeWhy).toMatch(/juntas/);
    const weeks = Math.ceil((Date.parse(END) - Date.parse(START)) / 86400000 / 7);
    const main = p.subplans.filter((s) => s.areaId !== "automation");
    expect(main.length).toBeGreaterThanOrEqual(3);
    for (const s of main) expect(s.phase).toEqual({ fromWeek: 1, toWeek: weeks });
    expect(p.preconditions!.languages!.map((l) => l.id)).toEqual(["python", "javascript", "typescript"]);
    expect(p.preconditions!.languages!.every((l) => l.required)).toBe(true);
    const sch = buildSchedule(p);
    const day = sch.days.find((d) => d.study)!;
    expect(day.focus!.together).toBe(true);
    expect(day.blocks!.some((b) => b.id === "lang-daily")).toBe(true);
  });

  it("por fases: como siempre (como máximo 2 en paralelo); «ai» sin IA decide por regla y deja la justificación", async () => {
    const ph = (await create({ areaMode: "phased" })).plan();
    expect(ph.areaMode).toBe("phased");
    const ai = (await create({ areaMode: "ai", start: START })).plan();
    expect(ai.areaModeBy).toBe("rules");
    expect(ai.areaMode).toBe("together");
    expect(ai.areaModeWhy).toBeTruthy();
  });

  it("sin areaMode (API antigua o formulario nuevo) con 2 o más áreas el modo por defecto es «juntas»; sin languages no hay bloque diario de lenguaje", async () => {
    const p = (await create()).plan();
    expect(p.areaMode).toBe("together");
    expect(p.areaModeBy).toBe("rules");
    expect(p.preconditions!.languages).toBeUndefined();
    expect(buildSchedule(p).days.every((d) => !d.blocks?.some((b) => b.id === "lang-daily"))).toBe(true);
  });

  it("los temas llevan su proyecto de aplicación calibrado (nivel «empezando» ⇒ micro)", async () => {
    const p = (await create({ areaMode: "together" })).plan();
    const tps = p.subplans.flatMap((s) => s.topics.filter((t) => t.topicProject));
    expect(tps.length).toBeGreaterThan(10);
    expect(tps.every((t) => t.topicProject!.level === "micro" || t.topicProject!.level === "guiado")).toBe(true);
    expect(tps[0]!.topicProject!.basis).toBe("declarado");
  });

  it("cambiar el modo con «Pedir cambios» (set_area_mode) recalcula y se deshace", async () => {
    const { a, id, plan } = await create({ areaMode: "together" });
    const before = plan();
    const res = applyOps(before, [{ op: "set_area_mode", mode: "phased" }], { today: START, all: [] });
    expect(res.applied).toBe(1);
    expect(res.plan.areaMode).toBe("phased");
    expect(res.plan.preconditions!.areaMode).toBe("phased");
    // por la API de cambios (determinista) y con historial
    const ch: any = await a.mentor_plan_change({ id, comment: "ordena las áreas por fases", noAi: true });
    expect(ch.applied).toBe(true);
    expect(plan().areaMode).toBe("phased");
    a.mentor_plan_change_undo({ id });
    expect(plan().areaMode).toBe("together");
  });
});

describe("ruta: mentor_route, mentor_plan_reduce y mentor_plan_route_set", () => {
  it("reducir NO borra nada: los temas quedan fuera de ruta, mentor_route lo cuenta y Deshacer lo restaura", async () => {
    const { a, id, plan } = await create({ areaMode: "phased" });
    const file = path.join(plansDir(), `${id}.json`);
    const sub = plan().subplans.find((s) => s.groups?.some((g) => g.kind === "bases"))!;
    const group = sub.groups!.find((g) => g.kind === "bases")!;
    const total = plan().subplans.reduce((n, s) => n + s.topics.length, 0);
    const baseCount = sub.topics.filter((t) => t.group === group.id).length;
    expect(baseCount).toBeGreaterThan(5);
    const r: any = a.mentor_plan_reduce({ id, areaId: sub.areaId, groupId: group.id, max: 5 });
    expect(r.changed).toBeGreaterThan(0);
    expect(r.live).toBeLessThanOrEqual(5);
    expect(r.skipped.every((s: any) => s.reason && s.title)).toBe(true);
    const saved = plan();
    expect(saved.subplans.reduce((n, s) => n + s.topics.length, 0)).toBe(total); // nada se borra del plan
    expect(saved.subplans.flatMap((s) => s.topics).filter((t) => t.route === "skipped").length).toBe(r.changed);
    expect(r.entry.before).toBeUndefined();
    // mentor_route
    const route: any = a.mentor_route({});
    expect(route.plans).toHaveLength(0); // el plan es futuro/propuesto: no es activo
    const one: any = a.mentor_route({ planId: id });
    expect(one.plans[0].counts.skipped).toBe(r.changed);
    expect(one.plans[0].topics.find((t: any) => t.route === "skipped").skippedReason).toBeTruthy();
    const f = r.skipped[0].folder;
    expect(one.byFolder[f].route).toBe("skipped");
    // las notas siguen en disco
    expect(fs.existsSync(path.join(dir, ...f.split("/")))).toBe(true);
    // reactivar uno
    const back: any = a.mentor_plan_route_set({ id, folders: [f], route: "core" });
    expect(back.changed).toBe(1);
    expect((a.mentor_route({ planId: id }) as any).byFolder[f].route).toBe("core");
    // deshacer el último cambio (reactivar) y luego la reducción
    a.mentor_plan_change_undo({ id });
    a.mentor_plan_change_undo({ id });
    expect(plan().subplans.flatMap((s) => s.topics).filter((t) => t.route === "skipped")).toHaveLength(0);
    expect(fs.existsSync(file)).toBe(true);
  });

  it("route_set no salta prerrequisitos ni completados", async () => {
    const { a, id, plan } = await create({ areaMode: "phased" });
    const t = plan().subplans[0]!.topics[0]!;
    new PlanStore(dir).save({ ...plan(), subplans: plan().subplans.map((s, i) => (i === 0 ? { ...s, topics: s.topics.map((x, j) => (j === 0 ? { ...x, completedAt: START } : x)) } : s)) });
    expect(() => a.mentor_plan_route_set({ id, folders: [t.folder], route: "skipped" })).toThrow(/completado/);
    expect(() => a.mentor_plan_route_set({ id, folders: ["no/existe"], route: "skipped" })).toThrow();
  });

  it("leer la ruta no modifica el plan", async () => {
    const { a, id } = await create({ areaMode: "phased" });
    const file = path.join(plansDir(), `${id}.json`);
    const h = sha(file);
    a.mentor_route({ planId: id });
    a.mentor_route({});
    expect(sha(file)).toBe(h);
  });
});
