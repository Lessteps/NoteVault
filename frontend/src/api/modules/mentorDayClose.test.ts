// Cierre del día y memoria del Mentor (API): el registro del día no usa IA, el cierre hace UNA llamada que guarda la revisión y la memoria,
// sin IA hay revisión por reglas, las correcciones se convierten en tareas solo al pedirlo y la memoria llega al informe del Mentor.

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
const two = (n: number) => String(n).padStart(2, "0");
const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
};
function topic(rel: string) {
  const abs = path.join(dir, ...rel.split("/"));
  fs.mkdirSync(abs, { recursive: true });
  fs.writeFileSync(path.join(abs, "_tema.md"), MANIFEST(rel.split("/").pop()!), "utf-8");
}
const START = todayIso();
const END = addDays(START, 60);
const F = (n: number) => `Programación/4 Backend/0${n} Tema${n}`;
const AI = { provider: "openai", api_key: "k", model: "m", base_url: "http://x" };

beforeEach(() => {
  for (const k of Object.keys(hoisted.store)) delete hoisted.store[k];
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "nv_dayclose_api_"));
  for (const n of [1, 2, 3, 4]) topic(F(n));
  clearVaultScanCache();
  app = new AppState(dir);
  vaultScan(app);
  const seed = { area: "Programación", objective: "4 Backend", topics: [1, 2, 3, 4].map((n) => ({ folder: F(n), title: `Tema${n}`, estMinutes: 60 })) };
  const pre = { start: START, end: END, minutesPerDay: 240, studyDays: [1, 2, 3, 4, 5, 6, 7], pace: "intenso", goalIds: [], subjects: ["Programación"], levels: {}, deliverables: "no", freeObjective: "full stack" };
  const built = buildPlan([seed], { id: `${START}_${END}`, start: START, end: END, minutesPerDay: 240, studyDays: [1, 2, 3, 4, 5, 6, 7], pace: "intenso", from: START, preconditions: pre as never, name: "Plan" }).plan;
  new PlanStore(dir).save({ ...built, subplans: built.subplans.map((s) => ({ ...s, areaId: "backend", area: "Backend" })), structure: "areas" });
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

const dayFile = () => path.join(dir, ".notevault", "mentor", "daily", `${todayIso()}.json`);
const memFile = () => path.join(dir, ".notevault", "mentor", "memory.json");

describe("registro del día sin IA", () => {
  it("calcula y guarda lo previsto para hoy sin llamar a la IA", () => {
    Object.assign(hoisted.store, AI);
    const send = vi.fn();
    const api = mentorApi(app, send);
    const r: any = api.mentor_day_record({});
    expect(r.loading).toBe(false);
    expect(r.record.planned.topics).toBeGreaterThan(0);
    expect(r.record.planned.done).toBe(0);
    expect(r.review).toBeNull();
    expect(send).not.toHaveBeenCalled();
    expect(fs.existsSync(dayFile())).toBe(true);
  });

  it("rechaza fechas inválidas y días que aún no llegaron", () => {
    const api = mentorApi(app);
    expect(() => api.mentor_day_record({ date: "ayer" })).toThrow(/Fecha inválida/);
    expect(() => api.mentor_day_record({ date: addDays(todayIso(), 3) })).toThrow(/aún no llegó/);
  });
});

describe("cierre del día", () => {
  it("con IA simulada hace UNA llamada, guarda la revisión y alimenta la memoria y el informe", async () => {
    Object.assign(hoisted.store, AI);
    const first = F(1);
    const send = vi.fn().mockResolvedValue(
      "```json\n" + JSON.stringify({
        summary: "Día flojo: no se terminó nada.",
        observations: ["Se atasca al empezar los temas de backend."],
        studentSaid: ["Dice que no entiende las rutas."],
        corrections: [{ title: "Rehacer el primer tema", why: "No se terminó", kind: "redo", topic: first }, { title: "Tema inventado", kind: "redo", topic: "Programación/NOEXISTE" }],
      }) + "\n```",
    );
    const api = mentorApi(app, send);
    const r: any = await api.mentor_day_close({ feeling: "No entendí las rutas", notes: "Prefiero ejemplos cortos", mood: 2 });
    expect(send).toHaveBeenCalledTimes(1);
    const prompt = JSON.stringify(send.mock.calls[0]![1]);
    expect(prompt).toContain("No entendí las rutas");
    expect(prompt).toContain("Prefiero ejemplos cortos");
    expect(r.source).toBe("ai");
    expect(r.review.corrections.map((c: any) => c.title)).toEqual(["Rehacer el primer tema", "Tema inventado"]);
    // un tema que no estaba en el registro no se enlaza
    expect(r.review.corrections[0].topic).toBe(first);
    expect(r.review.corrections[1].topic).toBeUndefined();
    expect(r.closedAt).toBeTruthy();
    expect(fs.existsSync(memFile())).toBe(true);
    const mem = (api.mentor_memory_get() as any).memory;
    expect(mem.studentSaid.map((s: any) => s.text)).toEqual(["Dice que no entiende las rutas."]);
    expect(mem.corrections.every((c: any) => c.status === "open")).toBe(true);
    // la memoria llega al informe del Mentor
    const brief: any = await api.mentor_brief({ only: ["mentor_memory"] });
    expect(JSON.stringify(brief)).toContain("Rehacer el primer tema");
  });

  it("sin IA guarda una revisión por reglas con lo pendiente", async () => {
    const send = vi.fn();
    const api = mentorApi(app, send);
    const r: any = await api.mentor_day_close({ feeling: "Me costó concentrarme" });
    expect(send).not.toHaveBeenCalled();
    expect(r.source).toBe("rules");
    expect(r.review.source).toBe("rules");
    expect(r.review.corrections[0].title).toContain("Retomar");
    expect(r.review.studentSaid).toEqual(["Me costó concentrarme"]);
  });

  it("si la IA falla cae a reglas y lo dice", async () => {
    Object.assign(hoisted.store, AI);
    const api = mentorApi(app, vi.fn().mockRejectedValue(new Error("boom")));
    const r: any = await api.mentor_day_close({});
    expect(r.source).toBe("rules");
    expect(r.note).toContain("falló");
  });
});

describe("correcciones", () => {
  it("«Crear tarea» la convierte en una tarea real y solo una vez; «Descartar» la saca de la memoria activa", async () => {
    const api = mentorApi(app);
    await api.mentor_day_close({ feeling: "x" });
    const mem0 = (api.mentor_memory_get() as any).memory;
    const [a, b] = mem0.corrections;
    expect(a).toBeTruthy();
    const t1: any = api.mentor_correction_task({ id: a.id });
    expect(t1.taskId).toBeTruthy();
    expect(t1.memory.corrections.find((c: any) => c.id === a.id)).toMatchObject({ status: "task", taskId: t1.taskId });
    const t2: any = api.mentor_correction_task({ id: a.id });
    expect(t2.taskId).toBe(t1.taskId);
    expect(app.mgrs().tasks.get(t1.taskId)?.name).toBe(a.title);
    if (b) {
      const d: any = api.mentor_correction_set({ id: b.id, status: "dismissed" });
      expect(d.memory.corrections.find((c: any) => c.id === b.id).status).toBe("dismissed");
    }
    expect(() => api.mentor_correction_set({ id: "nope", status: "done" })).toThrow(/ya no existe/);
  });
});
