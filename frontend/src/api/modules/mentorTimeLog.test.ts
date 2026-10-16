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
});
