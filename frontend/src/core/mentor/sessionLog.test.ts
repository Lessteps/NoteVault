import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { adherence, SessionLog, type PlanBlock, type SessionRecord } from "./sessionLog.js";

let dir: string;
let log: SessionLog;

const block = (candidateId: string, subject: string, kind: string, status: PlanBlock["status"], minutes = 20): PlanBlock => ({
  candidateId,
  kind,
  subject,
  minutes,
  status,
});
const rec = (date: string, blocks: PlanBlock[]): SessionRecord => ({ date, availableMinutes: 60, blocks, createdAt: `${date}T08:00:00` });

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "nv_mentor_log_"));
  log = new SessionLog(dir);
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe("SessionLog", () => {
  it("round-trips a day under .notevault/mentor/sessions and nowhere else", () => {
    const r: SessionRecord = {
      ...rec("2026-10-05", [{ ...block("srs:mathematics", "mathematics", "srs_review", "planned"), topicFolder: "Mates/Algebra", note: "ojo" }]),
      objective: "Cerrar álgebra",
      acceptedAt: "2026-10-05T08:02:00",
    };
    log.save(r);
    expect(fs.existsSync(path.join(dir, ".notevault", "mentor", "sessions", "2026-10-05.json"))).toBe(true);
    expect(fs.readdirSync(dir)).toEqual([".notevault"]);
    expect(log.load("2026-10-05")).toEqual(r);
    expect(log.load("2026-10-06")).toBeNull();
    expect(log.load("../x")).toBeNull();
  });

  it("rejects a record without a valid date and cleans bad blocks", () => {
    expect(() => log.save({ ...rec("hoy", []) })).toThrow();
    const saved = log.save({
      ...rec("2026-10-05", [
        block("a", "m", "srs_review", "done"),
        { candidateId: "", kind: "x", subject: "m", minutes: 5, status: "done" },
        { ...block("b", "m", "x", "planned"), status: "bogus" as never },
      ]),
    });
    expect(saved.blocks.map((b) => [b.candidateId, b.status])).toEqual([["a", "done"], ["b", "planned"]]);
  });

  it("recent() returns the newest first and honours n", () => {
    for (const d of ["2026-10-01", "2026-10-03", "2026-10-02", "2026-09-30"]) log.save(rec(d, []));
    expect(log.recent(3).map((r) => r.date)).toEqual(["2026-10-03", "2026-10-02", "2026-10-01"]);
    expect(log.recent(0)).toEqual([]);
    expect(new SessionLog(path.join(dir, "vacia")).recent()).toEqual([]);
  });

  it("markBlock updates one block and persists it", () => {
    log.save(rec("2026-10-05", [block("a", "m", "srs_review", "planned"), block("b", "m", "error_fix", "planned")]));
    const r = log.markBlock("2026-10-05", "b", "partial", "solo la mitad")!;
    expect(r.blocks.map((b) => b.status)).toEqual(["planned", "partial"]);
    expect(log.load("2026-10-05")!.blocks[1]!.note).toBe("solo la mitad");
    expect(log.markBlock("2026-10-05", "b", "done", "")!.blocks[1]!.note).toBeUndefined();
    expect(log.markBlock("2026-10-05", "zzz", "done")).toBeNull();
    expect(log.markBlock("2026-01-01", "a", "done")).toBeNull();
    expect(() => log.markBlock("2026-10-05", "a", "nope" as never)).toThrow();
  });
});

describe("adherence", () => {
  const records = [
    rec("2026-10-04", [
      block("a", "mathematics", "srs_review", "done", 20),
      block("b", "english", "continue_topic", "skipped", 30),
      block("c", "programming", "error_fix", "partial", 20),
    ]),
    rec("2026-10-03", [
      block("d", "mathematics", "continue_topic", "done", 40),
      block("e", "English", "continue_topic", "skipped", 30), // misma materia con otra capitalización
      block("f", "programming", "error_fix", "planned", 15),
    ]),
  ];

  it("computes percentages by subject and kind, ignoring unresolved blocks", () => {
    const a = adherence(records);
    expect(a.sessions).toBe(2);
    expect(a.overall).toMatchObject({ total: 6, done: 2, partial: 1, skipped: 2, planned: 1, pct: 50 }); // (2+0.5)/5
    expect(a.bySubject.mathematics!.pct).toBe(100);
    expect(a.bySubject.english).toMatchObject({ skipped: 2, pct: 0 });
    expect(a.bySubject.programming).toMatchObject({ partial: 1, planned: 1, pct: 50 });
    expect(a.byKind.continue_topic).toMatchObject({ total: 3, done: 1, skipped: 2, pct: 33 });
    expect(a.byKind.error_fix!.pct).toBe(50);
  });

  it("names the subjects that get skipped and the typical real session length", () => {
    const a = adherence(records);
    expect(a.skippedSubjects).toEqual(["english"]); // programming: una sola resuelta, no cuenta
    // día 1: 20 + 10 (mitad del parcial) = 30; día 2: 40 -> mediana 35
    expect(a.typicalSessionMinutes).toBe(35);
  });

  it("is valid with no data", () => {
    expect(adherence([])).toMatchObject({ sessions: 0, overall: { total: 0, pct: null }, skippedSubjects: [], typicalSessionMinutes: null });
  });
});
