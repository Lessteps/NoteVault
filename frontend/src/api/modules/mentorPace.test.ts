// API del ritmo diario y de los extras del día: validación, persistencia en el plan y candidatos.

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
import { buildSchedule } from "../../lib/planSchedule.js";
import { addDays } from "../../lib/planTime.js";
import { AppState } from "../appState.js";
import { clearVaultScanCache, vaultScan } from "../vaultScan.js";
import { mentorApi } from "./mentor.js";

const MANIFEST = (title: string) => `---\ntype: topic\nsubject: programming\ntitle: "${title}"\nskills: [implement, debug]\nmastery:\n  min_per_skill: 6\n  target_difficulty: 3\n  exam: none\n---\n`;
let dir: string;
let app: AppState;

function topic(rel: string, title?: string) {
  const abs = path.join(dir, ...rel.split("/"));
  fs.mkdirSync(abs, { recursive: true });
  const t = title ?? rel.split("/").pop()!;
  fs.writeFileSync(path.join(abs, "_tema.md"), MANIFEST(t), "utf-8");
  fs.writeFileSync(path.join(abs, `${t}.md`), "---\ntype: concept\n---\n# T\n", "utf-8");
}
const two = (n: number) => String(n).padStart(2, "0");
const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
};
const START = todayIso();
const END = addDays(START, 40);
const folderOf = (name: string, i: number) => `Programación/${name}/${two(i + 1)} Tema`;
const seed = (name: string, n: number) => ({ area: name, objective: name, topics: Array.from({ length: n }, (_, i) => ({ folder: folderOf(name, i), title: `${name} ${i + 1}`, estMinutes: 40 })) });

function writePlan(): { id: string; sa: string; sb: string } {
  const built = buildPlan([seed("Alfa", 6), seed("Beta", 4)], {
    id: `${START}_${END}`, start: START, end: END, minutesPerDay: 200, studyDays: [1, 2, 3, 4, 5, 6, 7], pace: "intenso", from: START,
    preconditions: { start: START, end: END, minutesPerDay: 200, studyDays: [1, 2, 3, 4, 5, 6, 7], pace: "intenso", goalIds: [], subjects: ["Programación"], levels: {}, deliverables: "ask" } as never,
  }).plan;
  new PlanStore(dir).save(built);
  return { id: built.id, sa: built.subplans[0]!.id, sb: built.subplans[1]!.id };
}

beforeEach(() => {
  for (const k of Object.keys(hoisted.store)) delete hoisted.store[k];
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "nv_mentor_pace_"));
  for (let i = 0; i < 6; i++) topic(folderOf("Alfa", i));
  for (let i = 0; i < 4; i++) topic(folderOf("Beta", i));
  topic("Programación/Rust/01 Ownership", "Ownership");
  topic("Programación/Rust/02 Lifetimes", "Lifetimes");
  clearVaultScanCache();
  app = new AppState(dir);
  vaultScan(app);
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

const api = () => mentorApi(app, vi.fn());
const saved = (id: string) => new PlanStore(dir).load(id)!;

describe("mentor_plan_pace_set", () => {
  it("guarda el ritmo global y por área, y lo quita con vacío", () => {
    const { id, sa } = writePlan();
    const p: any = api().mentor_plan_pace_set({ id, pace: { perDay: 3, minPerDay: 2, areas: { [sa]: { perDay: 5 } } } });
    expect(p.pace).toEqual({ perDay: 3, minPerDay: 2, areas: { [sa]: { perDay: 5 } } });
    expect(saved(id).pace).toEqual(p.pace);
    // cambia el reparto: 3 temas de Beta el primer día, 5 de Alfa
    const sch = buildSchedule(saved(id) as never);
    const first = sch.days.find((d) => d.study)!;
    expect(new Set(first.topics.filter((t) => t.subplanId === sa).map((t) => t.folder)).size).toBe(5);
    const cleared: any = api().mentor_plan_pace_set({ id, pace: null });
    expect(cleared.pace).toBeUndefined();
    expect(saved(id).pace).toBeUndefined();
  });

  it("valida enteros 0..20, mínimo ≤ temas por día y áreas existentes, sin tocar el plan", () => {
    const { id } = writePlan();
    const file = path.join(dir, ".notevault", "mentor", "plans", `${id}.json`);
    const before = fs.readFileSync(file, "utf-8");
    expect(() => api().mentor_plan_pace_set({ id, pace: { perDay: 25 } })).toThrow(/entero de 0 a 20/);
    expect(() => api().mentor_plan_pace_set({ id, pace: { perDay: 1.5 } })).toThrow(/entero/);
    expect(() => api().mentor_plan_pace_set({ id, pace: { perDay: 2, minPerDay: 3 } })).toThrow(/no puede superar/);
    expect(() => api().mentor_plan_pace_set({ id, pace: { areas: { nope: { perDay: 2 } } } })).toThrow(/ya no existe/);
    expect(() => api().mentor_plan_pace_set({ id: "../x", pace: {} })).toThrow(/Plan inválido/);
    expect(fs.readFileSync(file, "utf-8")).toBe(before);
  });
});

describe("temas extra", () => {
  it("añade un tema de la ruta (más adelante) a hoy: aparece en el reparto una sola vez", () => {
    const { id, sa } = writePlan();
    const p: any = api().mentor_plan_extra_topic_add({ id, folder: folderOf("Alfa", 5) });
    expect(p.extraTopics).toHaveLength(1);
    expect(p.extraTopics[0]).toMatchObject({ date: START, folder: folderOf("Alfa", 5), source: "manual" });
    const sch = buildSchedule(saved(id) as never);
    const hits = sch.days.flatMap((d) => d.topics.filter((t) => t.folder === folderOf("Alfa", 5)).map((t) => ({ date: d.date, extra: !!t.extra, sub: t.subplanId })));
    expect(hits).toEqual([{ date: START, extra: true, sub: sa }]);
  });

  it("añade un tema de la vault que no está en el plan (cubo Extra) y lo quita", () => {
    const { id } = writePlan();
    const date = addDays(START, 2);
    const p: any = api().mentor_plan_extra_topic_add({ id, folder: "Programación/Rust/01 Ownership", date, estMinutes: 45 });
    expect(p.extraTopics[0]).toMatchObject({ folder: "Programación/Rust/01 Ownership", title: "Ownership", estMinutes: 45, date });
    const t = buildSchedule(saved(id) as never).byDate.get(date)!.topics.find((x) => x.folder === "Programación/Rust/01 Ownership")!;
    expect(t).toMatchObject({ subplanId: "extra", area: "Extra", extra: true, minutes: 45 });
    const left: any = api().mentor_plan_extra_topic_remove({ id, folder: "Programación/Rust/01 Ownership", date });
    expect(left.extraTopics).toBeUndefined();
    expect(saved(id).extraTopics).toBeUndefined();
    expect(() => api().mentor_plan_extra_topic_remove({ id, folder: "Programación/Rust/01 Ownership", date })).toThrow(/ya no está/);
  });

  it("rechaza fechas fuera del plan, repetidos, temas inexistentes, completados y áreas desconocidas", () => {
    const { id, sa } = writePlan();
    const a = api();
    expect(() => a.mentor_plan_extra_topic_add({ id, folder: folderOf("Alfa", 1), date: addDays(END, 3) })).toThrow(/no está en el plan/);
    expect(() => a.mentor_plan_extra_topic_add({ id, folder: folderOf("Alfa", 1), date: "ayer" })).toThrow(/Fecha inválida/);
    expect(() => a.mentor_plan_extra_topic_add({ id, folder: "" })).toThrow(/Falta el tema/);
    expect(() => a.mentor_plan_extra_topic_add({ id, folder: "Nada/Existe" })).toThrow(/no existe en la vault/);
    expect(() => a.mentor_plan_extra_topic_add({ id, folder: "Programación/Rust/02 Lifetimes", area: "zzz" })).toThrow(/ya no existe/);
    a.mentor_plan_extra_topic_add({ id, folder: folderOf("Alfa", 1) });
    expect(() => a.mentor_plan_extra_topic_add({ id, folder: folderOf("Alfa", 1) })).toThrow(/ya está añadido/);
    const st = new PlanStore(dir);
    const plan = st.load(id)!;
    plan.subplans.find((s) => s.id === sa)!.topics[0]!.completedAt = START;
    st.save(plan);
    expect(() => a.mentor_plan_extra_topic_add({ id, folder: folderOf("Alfa", 0) })).toThrow(/ya está completo/);
  });
});

describe("práctica extra", () => {
  it("alta, edición, marcar hecha y borrado, persistidas", () => {
    const { id, sa } = writePlan();
    const a = api();
    const p: any = a.mentor_plan_extra_practice_add({ id, title: "  Repasar   SQL ", kind: "custom", minutes: 25, note: "joins", area: sa });
    expect(p.extraPractice).toHaveLength(1);
    const x = p.extraPractice[0];
    expect(x).toMatchObject({ title: "Repasar SQL", kind: "custom", minutes: 25, note: "joins", area: sa, date: START });
    const day = buildSchedule(saved(id) as never).byDate.get(START)!;
    expect(day.practice.extra?.[0]).toMatchObject({ title: "Repasar SQL", minutes: 25 });
    const up: any = a.mentor_plan_extra_practice_update({ id, practiceId: x.id, done: true, minutes: 30, kind: "kata" });
    expect(up.extraPractice[0]).toMatchObject({ done: true, minutes: 30, kind: "kata", title: "Repasar SQL" });
    expect(saved(id).extraPractice![0]!.done).toBe(true);
    const gone: any = a.mentor_plan_extra_practice_remove({ id, practiceId: x.id });
    expect(gone.extraPractice).toBeUndefined();
    expect(() => a.mentor_plan_extra_practice_remove({ id, practiceId: x.id })).toThrow(/ya no existe/);
  });

  it("valida título, tipo, minutos y fecha", () => {
    const { id } = writePlan();
    const a = api();
    expect(() => a.mentor_plan_extra_practice_add({ id, title: "   " })).toThrow(/título/);
    expect(() => a.mentor_plan_extra_practice_add({ id, title: "x", kind: "otro" })).toThrow(/Tipo de práctica/);
    expect(() => a.mentor_plan_extra_practice_add({ id, title: "x", minutes: 2.5 })).toThrow(/minutos/);
    expect(() => a.mentor_plan_extra_practice_add({ id, title: "x", minutes: 9999 })).toThrow(/minutos/);
    expect(() => a.mentor_plan_extra_practice_add({ id, title: "x", date: addDays(END, 5) })).toThrow(/no está en el plan/);
    expect(() => a.mentor_plan_extra_practice_update({ id, practiceId: "nope", title: "y" })).toThrow(/ya no existe/);
  });
});

describe("mentor_plan_topic_candidates", () => {
  it("devuelve los siguientes de la ruta (intercalando áreas) y los temas de la vault fuera del plan, sin escribir", () => {
    const { id, sa } = writePlan();
    const file = path.join(dir, ".notevault", "mentor", "plans", `${id}.json`);
    const before = fs.readFileSync(file, "utf-8");
    const r: any = api().mentor_plan_topic_candidates({ id });
    expect(r.loading).toBe(false);
    expect(r.ahead.slice(0, 2).map((c: any) => c.title)).toEqual(["Alfa 1", "Beta 1"]);
    expect(r.ahead.every((c: any) => c.inPlan)).toBe(true);
    expect(r.vault.map((c: any) => c.title).sort()).toEqual(["Lifetimes", "Ownership"]);
    const q: any = api().mentor_plan_topic_candidates({ id, query: "ownershíp".replace("í", "i") });
    expect(q.vault.map((c: any) => c.title)).toEqual(["Ownership"]);
    expect(q.ahead).toEqual([]);
    const only: any = api().mentor_plan_topic_candidates({ id, area: sa, limit: 3 });
    expect(only.ahead.map((c: any) => c.title)).toEqual(["Alfa 1", "Alfa 2", "Alfa 3"]);
    api().mentor_plan_extra_topic_add({ id, folder: folderOf("Alfa", 2) });
    const again: any = api().mentor_plan_topic_candidates({ id, area: sa });
    expect(again.ahead.find((c: any) => c.title === "Alfa 3").addedDates).toEqual([START]);
    expect(fs.readFileSync(file, "utf-8")).not.toBe(before); // solo por el alta del extra
  });
});

describe("mentor_plan_topic_candidates (upcoming)", () => {
  it("con una asignatura elegida solo salen SUS temas, todos los pendientes, aunque caigan lejos (no solo las próximas semanas del área)", () => {
    const { id, sa } = writePlan();
    const st = new PlanStore(dir);
    const plan = st.load(id)!;
    const sub = plan.subplans.find((x) => x.id === sa)!;
    // Alfa se parte en dos asignaturas: las 2 primeras y las 4 últimas (que caen más tarde)
    sub.groups = [{ id: "uno", title: "Uno", kind: "knowledge", order: 100 }, { id: "dos", title: "Dos", kind: "knowledge", order: 110 }];
    sub.topics = sub.topics.map((t, i) => ({ ...t, group: i < 2 ? "uno" : "dos", targetWeek: i < 2 ? 1 : 20 }));
    st.save(plan);
    const dos: any = api().mentor_plan_topic_candidates({ id, upcoming: true, area: sa, group: "dos" });
    expect(dos.ahead.map((c: any) => c.title)).toEqual(["Alfa 3", "Alfa 4", "Alfa 5", "Alfa 6"]);
    expect(dos.ahead.every((c: any) => c.group === "Dos")).toBe(true);
    // la posición es dentro de la asignatura, no del área
    expect(dos.ahead.map((c: any) => `${c.position}/${c.total}`)).toEqual(["1/4", "2/4", "3/4", "4/4"]);
    const uno: any = api().mentor_plan_topic_candidates({ id, upcoming: true, area: sa, group: "uno" });
    expect(uno.ahead.map((c: any) => c.title)).toEqual(["Alfa 1", "Alfa 2"]);
  });

  it("devuelve los próximos temas por área en orden de ruta, con semana y bloqueo, y sin temas de la vault", () => {
    const { id, sa } = writePlan();
    const r: any = api().mentor_plan_topic_candidates({ id, upcoming: true, area: sa, horizon: 12 });
    expect(r.vault).toEqual([]);
    expect(r.ahead.every((c: any) => c.subplanId === sa && typeof c.week === "number")).toBe(true);
    expect(r.ahead.map((c: any) => c.position)).toEqual([...r.ahead.map((c: any) => c.position)].sort((a: number, b: number) => a - b));
    // el primero no tiene bloqueo; los que van detrás de un tema aún no planeado para ese día sí
    const blocked = r.ahead.filter((c: any) => c.blockedBy);
    for (const c of blocked) expect(c.onDay).toBe(false);
    const free = r.ahead.filter((c: any) => !c.blockedBy && !c.onDay);
    expect(free.length).toBeLessThanOrEqual(1);
    expect(Object.keys(r.weeks).length).toBeGreaterThan(0);
  });
});

describe("mentor_plan_extra_practice_add: práctica ligada", () => {
  it("guarda rel y kataDate y no repite la misma práctica en el día", () => {
    const { id, sa } = writePlan();
    const a = api() as any;
    const p: any = a.mentor_plan_extra_practice_add({ id, title: "Kata 3", kind: "kata", area: sa, kataDate: addDays(START, 5), rel: "programming_practice/x/katas/3.md" });
    expect(p.extraPractice[0]).toMatchObject({ kind: "kata", kataDate: addDays(START, 5), rel: "programming_practice/x/katas/3.md" });
    expect(() => a.mentor_plan_extra_practice_add({ id, title: "Kata 3", kind: "kata", area: sa, kataDate: addDays(START, 5) })).toThrow(/ya está añadida/);
    expect(() => a.mentor_plan_extra_practice_add({ id, title: "x", kataDate: "ayer" })).toThrow(/Fecha de kata/);
  });
});
