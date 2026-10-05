import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ApiError } from "../../core/errors.js";
import { StudySRSManager } from "../../core/studySrsManager.js";
import * as store from "../../core/store.js";
import { AppState } from "../appState.js";
import { buildRegistry } from "../registry.js";
import { mentorApi } from "./mentor.js";

let dir: string;
let app: AppState;
let api: ReturnType<typeof mentorApi>;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "nv_mentor_api_"));
  app = new AppState(dir);
  api = mentorApi(app);
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe("mentorApi", () => {
  it("is part of the registry", () => {
    const reg = buildRegistry(app);
    for (const m of ["mentor_brief", "mentor_candidates", "mentor_session_save", "mentor_session_load", "mentor_session_recent", "mentor_session_mark_block", "mentor_adherence"]) {
      expect(typeof reg[m]).toBe("function");
    }
  });

  it("brief + candidates on an empty vault are valid and empty", () => {
    const { brief, text } = api.mentor_brief({});
    expect(brief.sections.map((s) => s.id)).toEqual(["study_pending", "goals", "topics", "tasks", "habits_activity"]);
    expect(text).toContain("INFORME DEL ESTUDIANTE");
    expect(JSON.parse(JSON.stringify(brief))).toEqual(brief);
    const res = api.mentor_candidates({ availableMinutes: 60 });
    expect(res).toMatchObject({ availableMinutes: 60, candidates: [], plan: [], plannedMinutes: 0 });
  });

  it("turns an overdue SRS item and a task into a plan, never writing outside .notevault", () => {
    const srs = new StudySRSManager(dir);
    const item = srs.registerItem("c1", "concept", "mathematics", "limits");
    store.writeJson(path.join(srs.dir, `${item.id}.json`), { ...item, next_review: "2020-01-01" });
    app.mgrs().tasks.create("Entrega", { due: new Date(), subject: "Historia", priority: 3 });

    const res = api.mentor_candidates({ availableMinutes: 60, maxSubjects: 3 });
    expect(res.candidates.map((c) => c.kind)).toEqual(["srs_review", "task_deadline"]);
    expect(res.plan.map((c) => c.id)).toEqual(res.candidates.map((c) => c.id));
    expect(res.plannedMinutes).toBe(res.plan.reduce((n, c) => n + c.estMinutes, 0));
    expect(api.mentor_brief({ maxChars: 600 }).text.length).toBeLessThanOrEqual(600);
  });

  it("saves, loads, marks blocks and reports adherence", () => {
    const record = {
      date: "2026-10-05",
      availableMinutes: 60,
      createdAt: "2026-10-05T08:00:00",
      blocks: [
        { candidateId: "a", kind: "srs_review", subject: "mathematics", minutes: 20, status: "planned" as const },
        { candidateId: "b", kind: "continue_topic", subject: "english", minutes: 30, status: "planned" as const },
      ],
    };
    api.mentor_session_save(record);
    expect(api.mentor_session_load("2026-10-05")).toEqual(record);
    expect(api.mentor_session_recent(5)).toHaveLength(1);

    api.mentor_session_mark_block("2026-10-05", "a", "done");
    api.mentor_session_mark_block("2026-10-05", "b", "skipped", "sin ganas");
    const adh = api.mentor_adherence(30);
    expect(adh.overall).toMatchObject({ done: 1, skipped: 1, pct: 50 });

    // el brief ya ve las sesiones
    const habits = api.mentor_brief({ only: ["habits_activity"] }).brief.sections[0]!;
    expect((habits.data as any).sessions).toBe(1);

    expect(fs.readdirSync(dir)).toEqual([".notevault"]);
  });

  it("validates input", () => {
    expect(() => api.mentor_session_save({ date: "mañana", blocks: [] })).toThrow(ApiError);
    expect(() => api.mentor_session_load("x")).toThrow(ApiError);
    expect(() => api.mentor_session_mark_block("2026-10-05", "a", "bogus")).toThrow(ApiError);
    expect(() => api.mentor_session_mark_block("2026-10-05", "a", "done")).toThrow(ApiError); // no existe el bloque
  });
});
