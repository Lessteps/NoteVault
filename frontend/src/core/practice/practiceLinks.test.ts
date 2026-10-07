import { describe, expect, it } from "vitest";
import {
  combineLinkProgress,
  formatPracticeLink,
  normalizePracticeLinks,
  parsePracticeLink,
  practiceLinkProgress,
  type PracticeData,
} from "./practiceLinks";

const TODAY = new Date(2026, 9, 7); // Wednesday; week 2026-10-05 .. 2026-10-11

const data = (over: Partial<PracticeData> = {}): PracticeData => ({
  ready: true,
  kataDates: new Set<string>(),
  projects: [],
  ...over,
});
const prog = (links: string[], d: PracticeData | null, today = TODAY) => practiceLinkProgress(links, () => d, today);

describe("practiceLinks strings", () => {
  it("parses every kind and rejects the rest", () => {
    expect(parsePracticeLink("kata:daily")).toEqual({ kind: "kata" });
    expect(parsePracticeLink(" KATA:Daily#week=3 ")).toEqual({ kind: "kata", week: 3 });
    expect(parsePracticeLink("kata:daily#streak=30")).toEqual({ kind: "kata", streak: 30 });
    expect(parsePracticeLink("kata:daily#week=8")).toBeNull();
    expect(parsePracticeLink("kata:daily#week=0")).toBeNull();
    expect(parsePracticeLink("kata:weekly")).toBeNull();
    expect(parsePracticeLink("project:weekly")).toEqual({ kind: "project", scope: "weekly" });
    expect(parsePracticeLink("project:monthly#Backend")).toEqual({ kind: "project", scope: "monthly", focus: "backend" });
    expect(parsePracticeLink("project:weekly#cobol")).toBeNull();
    expect(parsePracticeLink("skill:pp_kata")).toBeNull();
    expect(parsePracticeLink("")).toBeNull();
    expect(parsePracticeLink(null)).toBeNull();
  });

  it("escapes the folder of a concrete project (%, comma, #)", () => {
    const l = { kind: "project", scope: "folder", folder: "my, app#1 100%" } as const;
    const s = formatPracticeLink(l);
    expect(s).toBe("project:folder:my%2C app%231 100%25");
    expect(s).not.toContain(",");
    expect(parsePracticeLink(s)).toEqual(l);
  });

  it("format(parse(x)) is stable and normalize drops duplicates and garbage", () => {
    for (const s of ["kata:daily", "kata:daily#week=3", "kata:daily#streak=7", "project:weekly#frontend", "project:folder:a/b"]) {
      expect(formatPracticeLink(parsePracticeLink(s)!)).toBe(s);
    }
    expect(normalizePracticeLinks(["KATA:daily", "kata:daily", "nada", "project:weekly#x", "project:weekly"])).toEqual(["kata:daily", "project:weekly"]);
    expect(normalizePracticeLinks("kata:daily#week=2,project:monthly")).toEqual(["kata:daily#week=2", "project:monthly"]);
  });
});

describe("practiceLinkProgress", () => {
  it("kata: days with an attempt this week against the target (default 5)", () => {
    const d = data({ kataDates: new Set(["2026-10-05", "2026-10-06", "2026-09-30"]) }); // last week does not count
    const p = prog(["kata:daily"], d);
    expect(p.links[0]).toMatchObject({ pct: 40, done: false, noData: false, detail: "2 de 5 días esta semana" });
    expect(prog(["kata:daily#week=2"], d).links[0]).toMatchObject({ pct: 100, done: true });
    expect(prog(["kata:daily#week=2"], d).done).toBe(true);
  });

  it("kata streak: consecutive days ending today, or yesterday while today is still open", () => {
    const d = data({ kataDates: new Set(["2026-10-04", "2026-10-05", "2026-10-06"]) }); // today (07) not yet
    expect(prog(["kata:daily#streak=4"], d).links[0]).toMatchObject({ pct: 75, done: false, detail: "racha de 3 de 4 días" });
    const d2 = data({ kataDates: new Set(["2026-10-04", "2026-10-05", "2026-10-06", "2026-10-07"]) });
    expect(prog(["kata:daily#streak=4"], d2).links[0]).toMatchObject({ pct: 100, done: true });
    const broken = data({ kataDates: new Set(["2026-10-03", "2026-10-05"]) });
    expect(prog(["kata:daily#streak=3"], broken).links[0]!.pct).toBe(0);
  });

  const proj = (folder: string, state: "spec" | "building" | "defended" | "done", date: string, focus?: string, graded = false) => ({
    folder, title: folder.toUpperCase(), state, date, graded, ...(focus ? { focus } : {}),
  });

  it("project weekly/monthly: best project of the period by phases, done only when finished", () => {
    const d = data({
      projects: [
        proj("old", "done", "2026-09-28", "backend"), // another week and month
        proj("a", "building", "2026-10-06", "backend"), // build done + construct half = 1.5/4
        proj("b", "spec", "2026-10-07", "frontend"), // 1/4
      ],
    });
    expect(prog(["project:weekly"], d).links[0]).toMatchObject({ pct: 38, done: false });
    expect(prog(["project:weekly#frontend"], d).links[0]).toMatchObject({ pct: 25, done: false });
    expect(prog(["project:weekly#databases"], d).links[0]).toMatchObject({ pct: 0, detail: "sin proyecto esta semana" });
    expect(prog(["project:monthly#backend"], d).links[0]).toMatchObject({ pct: 38 }); // September's finished one is out
    const finished = data({ projects: [proj("c", "done", "2026-10-02")] });
    expect(prog(["project:monthly"], finished).links[0]).toMatchObject({ pct: 100, done: true });
    expect(prog(["project:weekly"], finished).links[0]).toMatchObject({ pct: 0, done: false });
  });

  it("defended and graded counts three phases, ungraded two and a half", () => {
    expect(prog(["project:weekly"], data({ projects: [proj("x", "defended", "2026-10-06", undefined, true)] })).links[0]!.pct).toBe(75);
    expect(prog(["project:weekly"], data({ projects: [proj("x", "defended", "2026-10-06")] })).links[0]!.pct).toBe(63);
  });

  it("concrete project by folder, broken when it no longer exists", () => {
    const d = data({ projects: [proj("shop", "defended", "2026-08-01", undefined, true)] });
    expect(prog(["project:folder:shop"], d).links[0]).toMatchObject({ pct: 75, broken: false });
    const gone = prog(["project:folder:nope"], d);
    expect(gone.links[0]).toMatchObject({ pct: 0, done: false, broken: true });
    expect(gone.done).toBe(false);
  });

  it("without the practice module every link says no data and nothing throws", () => {
    for (const d of [null, data({ ready: false })]) {
      const p = prog(["kata:daily", "project:weekly"], d);
      expect(p.noData).toBe(true);
      expect(p.done).toBe(false);
      expect(p.pct).toBe(0);
      expect(p.links.every((l) => l.noData && l.detail === "sin datos de práctica")).toBe(true);
    }
    expect(practiceLinkProgress(["kata:daily"], () => { throw new Error("boom"); }, TODAY).noData).toBe(true);
  });

  it("the whole list is the mean of its links; done needs all of them", () => {
    const d = data({ kataDates: new Set(["2026-10-05"]), projects: [proj("c", "done", "2026-10-06")] });
    const p = prog(["kata:daily#week=1", "project:weekly"], d);
    expect(p.pct).toBe(100);
    expect(p.done).toBe(true);
    const half = prog(["kata:daily#week=2", "project:weekly"], d);
    expect(half.pct).toBe(75);
    expect(half.done).toBe(false);
  });
});

describe("combineLinkProgress", () => {
  const t = (pct: number, n: number, done = false) => ({ pct, done, links: new Array(n).fill(0) });
  it("is null without links and equals the only group otherwise", () => {
    expect(combineLinkProgress(null, null)).toBeNull();
    expect(combineLinkProgress(t(0, 0), t(0, 0))).toBeNull();
    expect(combineLinkProgress(t(40, 2), null)).toEqual({ pct: 40, done: false });
    expect(combineLinkProgress(null, t(60, 1, true))).toEqual({ pct: 60, done: true });
  });
  it("weights every link equally across topics and practice", () => {
    expect(combineLinkProgress(t(100, 2, true), t(0, 1))).toEqual({ pct: 67, done: false });
    expect(combineLinkProgress(t(100, 1, true), t(100, 3, true))).toEqual({ pct: 100, done: true });
  });
});
