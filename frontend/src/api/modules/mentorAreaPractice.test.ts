// API del Sistema de práctica por área: estado por área, la práctica que toca en una fecha y las marcas manuales (solo datos de la app).

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({ store: {} as Record<string, unknown> }));
vi.mock("../appConfig.js", () => ({
  AppConfig: { get_ai_config: () => ({ ...hoisted.store }), set_ai_config: (d: Record<string, unknown>) => Object.assign(hoisted.store, d) },
}));

import { createAreaPracticeFolders } from "../../core/mentor/areaPracticeFolders.js";
import { buildPlan, PlanStore } from "../../core/mentor/plan.js";
import { addDays } from "../../lib/planTime.js";
import { AppState } from "../appState.js";
import { clearVaultScanCache } from "../vaultScan.js";
import { mentorApi } from "./mentor.js";

let dir: string;
let app: AppState;
let id = "";
const two = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
const TODAY = iso(new Date());
const START = addDays(TODAY, -9);
const END = addDays(TODAY, 40);

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "nv_areaapi_"));
  fs.mkdirSync(path.join(dir, "Programación", "programming_practice"), { recursive: true });
  fs.writeFileSync(path.join(dir, "Programación", "Programación.resumen.md"), "---\nsubject: programming\n---\n", "utf-8");
  clearVaultScanCache();
  app = new AppState(dir);
  const seed = (n: string) => ({ area: "Programación", objective: n, topics: [{ folder: `Programación/${n}/01 T`, title: `${n} 1`, estMinutes: 60 }] });
  const built = buildPlan([seed("Backend"), seed("Frontend")], { id: `${START}_${END}`, start: START, end: END, minutesPerDay: 240, studyDays: [1, 2, 3, 4, 5, 6, 7], pace: "intenso", from: START, preconditions: { start: START, end: END, minutesPerDay: 240, studyDays: [1, 2, 3, 4, 5, 6, 7], pace: "intenso", goalIds: [], subjects: ["Programación"], levels: {}, deliverables: "no", freeObjective: "x" } as never, name: "Plan" }).plan;
  new PlanStore(dir).save({
    ...built,
    structure: "areas",
    programmingPractice: { kata: { minutesPerDay: 25, days: [1, 2, 3, 4, 5, 6, 7] } },
    subplans: built.subplans.map((s, i) => ({ ...s, areaId: i === 0 ? "backend" : "frontend", area: i === 0 ? "Backend" : "Frontend" })),
  });
  id = built.id;
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

const api = () => mentorApi(app, vi.fn());

describe("mentor_area_practice", () => {
  it("devuelve el sistema de cada área del plan: carpeta aún no creada, katas, habilidades y semanas; solo lee", () => {
    const before = fs.readdirSync(path.join(dir, "Programación", "programming_practice")).length;
    const r: any = api().mentor_area_practice({ id });
    expect(r.today).toBe(TODAY);
    expect(r.ppReady).toBe(true);
    expect(r.ppBase).toBe("Programación/programming_practice");
    expect(r.areas.map((a: any) => a.areaId)).toEqual(["backend", "frontend"]);
    const b = r.areas[0];
    expect(b.folderReady).toBe(false);
    expect(b.kata.plannedDays).toBe(10);
    expect(b.kata.doneDays).toBe(0);
    expect(b.kata.todayPlanned).toBe(true);
    expect(b.kata.next).toMatchObject({ date: TODAY, fileReady: false });
    expect(b.kata.next.kata.skillName).toBeTruthy();
    expect(b.skills.length).toBeGreaterThanOrEqual(5);
    expect(b.weeks.length).toBeGreaterThan(5);
    expect(fs.readdirSync(path.join(dir, "Programación", "programming_practice")).length).toBe(before);
    expect(() => api().mentor_area_practice({ id: "../x" })).toThrow(/Plan inválido/);
  });

  it("cuando la carpeta existe (creada por «Ejecutar plan») lo refleja y el kata de hoy tiene archivo", () => {
    createAreaPracticeFolders({ ppDir: path.join(dir, "Programación", "programming_practice"), areas: ["backend"], katasPerArea: 12 });
    const b = (api().mentor_area_practice({ id }) as any).areas[0];
    expect(b.folderReady).toBe(true);
    expect(b.kata.next.fileReady).toBe(true);
  });

  it("mentor_area_practice_on: un kata por área en una fecha, y nada en una fecha sin kata", () => {
    const on: any = api().mentor_area_practice_on({ id, date: TODAY });
    expect(on.items.map((i: any) => i.areaId)).toEqual(["backend", "frontend"]);
    expect(on.items[0]).toMatchObject({ day: 10, minutes: expect.any(Number), rel: expect.stringMatching(/^backend\/katas\/010 /) });
    expect((api().mentor_area_practice_on({ id, date: addDays(END, 5) }) as any).items).toEqual([]);
    expect(() => api().mentor_area_practice_on({ id, date: "mañana" })).toThrow(/Fecha inválida/);
  });
});

describe("mentor_area_kata_mark", () => {
  it("marca hecho / saltado, se refleja en el estado y se quita; solo escribe datos de la app", () => {
    const done: any = api().mentor_area_kata_mark({ id, areaId: "frontend", date: TODAY, status: "done" });
    const f = done.areas.find((a: any) => a.areaId === "frontend");
    expect(f.kata).toMatchObject({ doneDays: 1, todayDone: true });
    expect(done.areas.find((a: any) => a.areaId === "backend").kata.doneDays).toBe(0);
    expect(fs.existsSync(path.join(dir, ".notevault", "mentor", "area-practice", `${id}.json`))).toBe(true);
    const gone: any = api().mentor_area_kata_mark({ id, areaId: "frontend", date: TODAY, status: null });
    expect(gone.areas.find((a: any) => a.areaId === "frontend").kata.doneDays).toBe(0);
    // ninguna nota de la vault se tocó
    expect(fs.readdirSync(path.join(dir, "Programación")).sort()).toEqual(["Programación.resumen.md", "programming_practice"]);
  });

  it("rechaza fechas futuras, áreas que no son del plan y estados inválidos", () => {
    expect(() => api().mentor_area_kata_mark({ id, areaId: "backend", date: addDays(TODAY, 1), status: "done" })).toThrow(/hoy o de días pasados/);
    expect(() => api().mentor_area_kata_mark({ id, areaId: "databases", date: TODAY, status: "done" })).toThrow(/no está en el plan/);
    expect(() => api().mentor_area_kata_mark({ id, areaId: "backend", date: TODAY, status: "raro" })).toThrow(/Estado inválido/);
  });
});
