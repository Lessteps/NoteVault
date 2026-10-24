// Registro de horas por área: guarda, lee y quita bloques en `.notevault/mentor/timelog/<plan>.json` y rechaza lo inválido.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildPlan, PlanStore } from "../../core/mentor/plan.js";
import { AppState } from "../appState.js";
import { mentorTimeLogApi } from "./mentorTimeLog.js";

let dir: string;
let id = "";
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "nv_tl_"));
  const seed = { area: "Programación", objective: "x", topics: [{ folder: "Programación/1/1.1 A", title: "1.1 A", estMinutes: 60, targetWeek: 1 }] };
  const built = buildPlan([seed], { id: "2026-10-06_2027-04-05", start: "2026-10-06", end: "2027-04-05", minutesPerDay: 120, studyDays: [1, 2, 3, 4, 5], pace: "intenso", from: "2026-10-06", preconditions: { start: "2026-10-06", end: "2027-04-05", minutesPerDay: 120, studyDays: [1, 2, 3, 4, 5], pace: "intenso", goalIds: [], subjects: ["Programación"], levels: {}, deliverables: "no" } as never, name: "Plan" }).plan;
  new PlanStore(dir).save(built);
  id = built.id;
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

const api = () => mentorTimeLogApi(new AppState(dir), () => "2026-10-16T10:00:00.000Z");
const file = () => path.join(dir, ".notevault", "mentor", "timelog", `${id}.json`);

describe("mentor_timelog", () => {
  it("sin nada guardado devuelve una lista vacía y no crea el archivo", () => {
    expect((api().mentor_timelog_get({ id }) as any).entries).toEqual([]);
    expect(fs.existsSync(file())).toBe(false);
  });

  it("añade bloques, los lee y quita uno", () => {
    const a: any = api().mentor_timelog_add({ id, areaKey: "backend", date: "2026-10-16", minutes: 25, kind: "pomodoro" });
    expect(a.entry).toMatchObject({ areaKey: "backend", minutes: 25, kind: "pomodoro", at: "2026-10-16T10:00:00.000Z" });
    api().mentor_timelog_add({ id, areaKey: "bases", date: "2026-10-16", minutes: 40, note: "repaso" });
    const list: any = api().mentor_timelog_get({ id });
    expect(list.entries.map((e: any) => [e.areaKey, e.minutes, e.kind])).toEqual([["backend", 25, "pomodoro"], ["bases", 40, "manual"]]);
    const after: any = api().mentor_timelog_delete({ id, entryId: a.entry.id });
    expect(after.entries.map((e: any) => e.areaKey)).toEqual(["bases"]);
    expect(JSON.parse(fs.readFileSync(file(), "utf-8")).entries).toHaveLength(1);
  });

  it("rechaza minutos fuera de rango, fecha rara, plan inválido o inexistente", () => {
    expect(() => api().mentor_timelog_add({ id, areaKey: "backend", date: "2026-10-16", minutes: 0 })).toThrow(/no es válido/);
    expect(() => api().mentor_timelog_add({ id, areaKey: "backend", date: "hoy", minutes: 10 })).toThrow(/no es válido/);
    expect(() => api().mentor_timelog_get({ id: "../x" })).toThrow(/Plan inválido/);
    expect(() => api().mentor_timelog_get({ id: "2020-01-01_2020-02-01" })).toThrow(/ya no existe/);
  });

  it("guarda la evaluación de un bloque (qué aprendí, qué duda queda, comprensión) sin tocar los bloques, y rechaza las incompletas", () => {
    api().mentor_timelog_add({ id, areaKey: "backend", date: "2026-10-16", minutes: 25 });
    const r: any = api().mentor_timelog_assess({ id, areaKey: "backend", date: "2026-10-16", minutes: 25, topics: ["4.2 HTTP"], understanding: 4, learned: "Cómo funciona un 422", doubt: "Qué pasa cuando el token expira" });
    expect(r.assessment).toMatchObject({ areaKey: "backend", minutes: 25, understanding: 4, topics: ["4.2 HTTP"], at: "2026-10-16T10:00:00.000Z" });
    const got: any = api().mentor_timelog_get({ id });
    expect(got.entries).toHaveLength(1);
    expect(got.assessments.map((a: any) => a.learned)).toEqual(["Cómo funciona un 422"]);
    // añadir o quitar bloques conserva las evaluaciones
    api().mentor_timelog_delete({ id, entryId: got.entries[0].id });
    expect((api().mentor_timelog_get({ id }) as any).assessments).toHaveLength(1);
    const bad = { id, areaKey: "backend", date: "2026-10-16", minutes: 25, topics: [], understanding: 4, learned: "algo", doubt: "" };
    expect(() => api().mentor_timelog_assess(bad)).toThrow(/no es válida/);
    expect(() => api().mentor_timelog_assess({ ...bad, doubt: "x", understanding: 9 })).toThrow(/no es válida/);
  });

  it("guarda el tipo de trabajo y los temas, conserva las entradas antiguas sin tipo y resume por área, tipo y rango", () => {
    // entrada antigua escrita a mano en el archivo: sin `work`
    fs.mkdirSync(path.dirname(file()), { recursive: true });
    fs.writeFileSync(file(), JSON.stringify({ version: 1, entries: [{ id: "old", areaKey: "backend", date: "2026-10-15", minutes: 20, kind: "pomodoro", at: "x" }] }));
    api().mentor_timelog_add({ id, areaKey: "backend", date: "2026-10-16", minutes: 45, kind: "pomodoro", work: "theory", topics: ["P/4.2 HTTP"] });
    api().mentor_timelog_add({ id, areaKey: "frontend", date: "2026-10-16", minutes: 35, kind: "pomodoro", work: "practice" });
    const got: any = api().mentor_timelog_get({ id });
    expect(got.entries[0].work).toBeUndefined();
    expect(got.entries[1]).toMatchObject({ work: "theory", topics: ["P/4.2 HTTP"] });
    const s: any = api().mentor_timelog_summary({ id, from: "2026-10-16", to: "2026-10-16" });
    expect(s).toMatchObject({ totalMinutes: 80, sessions: 2, byArea: { backend: 45, frontend: 35 }, byKind: { theory: 45, practice: 35, unclassified: 0 } });
    expect(api().mentor_timelog_summary({ id }) as any).toMatchObject({ totalMinutes: 100, byKind: { unclassified: 20 } });
    expect(api().mentor_timelog_summary({ id, areaKey: "frontend" }) as any).toMatchObject({ totalMinutes: 35 });
    expect((api().mentor_timelog_summary({ id, from: "2027-01-01" }) as any).hasAny).toBe(false);
  });
});

