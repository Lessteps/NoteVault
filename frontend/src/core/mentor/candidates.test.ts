import { describe, expect, it } from "vitest";
import type {
  BriefSection,
  GoalBrief,
  GoalItemBrief,
  GoalsData,
  StudentBrief,
  StudyPendingData,
  TasksData,
  TopicBrief,
  TopicsData,
} from "./brief.js";
import { allocate, buildCandidates, planBlocksFrom, type Candidate } from "./candidates.js";

function brief(parts: { pending?: StudyPendingData; goals?: GoalsData; topics?: TopicsData; tasks?: TasksData }): StudentBrief {
  const sec = (id: string, data: unknown): BriefSection => ({ id, title: id, priority: 1, summary: "", signals: [], lines: [], data });
  const sections: BriefSection[] = [];
  if (parts.pending) sections.push(sec("study_pending", parts.pending));
  if (parts.goals) sections.push(sec("goals", parts.goals));
  if (parts.topics) sections.push(sec("topics", parts.topics));
  if (parts.tasks) sections.push(sec("tasks", parts.tasks));
  return { version: 1, date: "2026-10-05", weekday: "lunes", sections, skipped: [] };
}

const topic = (over: Partial<TopicBrief> & { folder: string }): TopicBrief => ({
  subject: "mathematics",
  title: over.folder,
  status: "in_progress",
  completenessPct: 40,
  weakSkills: [],
  notStartedSkills: [],
  practicingSkills: [],
  masteredSkills: 0,
  totalSkills: 3,
  exam: "required_pending",
  examScore: null,
  attempts: 5,
  exercises: 4,
  theoryNotes: 2,
  lastAttemptDays: 10,
  goalLinks: [],
  why: [],
  ...over,
});

const goal = (over: Partial<GoalBrief>): GoalBrief => ({
  id: "g",
  name: "Meta",
  area: "",
  priority: 2,
  deadline: null,
  daysLeft: null,
  overdue: false,
  progressPct: 0,
  why: [],
  moreItems: 0,
  items: [],
  ...over,
});
const item = (over: Partial<GoalItemBrief>): GoalItemBrief => ({
  id: "i",
  name: "Sub",
  status: "Por hacer",
  due: null,
  daysLeft: null,
  priority: 2,
  progressPct: 0,
  why: [],
  topics: [],
  ...over,
});

const noPending: StudyPendingData = { srs: { dueTotal: 0, bySubject: [] }, errors: { unresolved: 0, bySubject: {}, repeaters: [] }, queue: [] };
const ids = (c: Candidate[]) => c.map((x) => x.id);

describe("buildCandidates", () => {
  it("returns nothing without time", () => {
    const b = brief({ pending: { ...noPending, srs: { dueTotal: 5, bySubject: [{ subject: "mathematics", count: 5, oldestOverdueDays: 3, lapses: 0 }] } } });
    expect(buildCandidates(b, { availableMinutes: 0 })).toEqual([]);
    expect(buildCandidates(b, { availableMinutes: -5 })).toEqual([]);
  });

  it("puts overdue reviews and repeat errors before everything else", () => {
    const b = brief({
      pending: {
        srs: { dueTotal: 8, bySubject: [{ subject: "english", count: 8, oldestOverdueDays: 6, lapses: 2 }] },
        errors: {
          unresolved: 1,
          bySubject: { mathematics: 1 },
          repeaters: [{ id: "err_1", subject: "mathematics", topic: "induction", skill: "prove", category: "logical", repeatCount: 4, lastSeenDays: 1 }],
        },
        queue: [],
      },
      topics: { topics: [topic({ folder: "Mates/Algebra", completenessPct: 75, lastAttemptDays: 2 })] },
      tasks: { tasks: [{ id: "t1", name: "Ensayo", subject: "Historia", due: "2026-10-06", daysLeft: 1, priority: 2, status: "Sin empezar" }], projects: [], overdue: 0, bySubject: [] },
    });
    const c = buildCandidates(b, { availableMinutes: 120 });
    expect(ids(c).slice(0, 2)).toEqual(["err:err_1", "srs:english"]);
    expect(c[0]).toMatchObject({ kind: "error_fix", skills: ["prove"], estMinutes: 15 });
    expect(c[0]!.reasons[0]).toContain("reincidente (4 veces)");
    expect(c[1]).toMatchObject({ kind: "srs_review", estMinutes: 10 }); // 8 repasos -> 10 min
    expect(c.slice(2).every((x) => x.score < c[1]!.score)).toBe(true);
    expect(c.map((x) => x.kind)).toContain("task_deadline");
  });

  it("a near goal deadline lifts its topic above an equal topic without goal", () => {
    const link = { goalId: "g1", goalName: "Aprobar", goalPriority: 4, itemId: "i1", itemName: "Dominar", daysLeft: 2, overdue: false };
    const b = brief({
      topics: { topics: [topic({ folder: "Mates/Plano" }), topic({ folder: "Mates/Algebra", goalLinks: [link] })] },
      goals: {
        goals: [
          goal({
            id: "g1",
            name: "Aprobar",
            priority: 4,
            daysLeft: 2,
            items: [item({ id: "i1", name: "Dominar", topics: [{ folder: "Mates/Algebra", title: "Algebra", skills: [], pct: 33, done: false, broken: false, missing: ["prove", "exam"] }] })],
          }),
        ],
      },
    });
    const c = buildCandidates(b, { availableMinutes: 60 });
    expect(ids(c)).toEqual(["topic:Mates/Algebra", "topic:Mates/Plano"]);
    expect(c[0]!.links).toEqual({ topicFolder: "Mates/Algebra", goalId: "g1", itemId: "i1" });
    expect(c[0]!.skills).toEqual(["prove"]); // lo que pide la meta y falta (sin "exam")
    expect(c[0]!.reasons[0]).toContain('lo pide la meta "Aprobar"');
    // y como la submeta ya está cubierta por el tema, no duplica un goal_item
    expect(c.some((x) => x.kind === "goal_item")).toBe(false);
  });

  it("half-done topics come before new ones; untreated -> diagnostic when asked by a goal or alone", () => {
    const link = { goalId: "g1", goalName: "Geo", goalPriority: 2, itemId: "i1", itemName: "Ver geo", daysLeft: 20, overdue: false };
    const untreated = { status: "untreated" as const, attempts: 0, lastAttemptDays: null };
    const b = brief({
      topics: {
        topics: [
          topic({ folder: "Mates/Algebra", completenessPct: 50 }),
          topic({ folder: "Mates/Nuevo", ...untreated }), // misma materia con tema a medias: next_topic
          topic({ folder: "Mates/Geo", ...untreated, goalLinks: [link] }), // lo pide una meta
          topic({ folder: "Prog/Loops", subject: "programming", ...untreated }), // materia sin temas a medias
        ],
      },
    });
    const c = buildCandidates(b, { availableMinutes: 90 });
    const byId = Object.fromEntries(c.map((x) => [x.id, x]));
    expect(byId["topic:Mates/Algebra"]!.kind).toBe("continue_topic");
    expect(byId["topic:Mates/Nuevo"]!.kind).toBe("next_topic");
    expect(byId["topic:Mates/Geo"]!.kind).toBe("untreated_diagnostic");
    expect(byId["topic:Prog/Loops"]!.kind).toBe("untreated_diagnostic");
    expect(byId["topic:Prog/Loops"]!.reasons.join(" ")).toContain("no se asume dominio");
    expect(byId["topic:Prog/Loops"]!.estMinutes).toBe(20);
    expect(c.findIndex((x) => x.id === "topic:Mates/Algebra")).toBeLessThan(c.findIndex((x) => x.id === "topic:Mates/Nuevo"));
    expect(byId["topic:Mates/Nuevo"]!.score).toBeLessThan(byId["topic:Mates/Algebra"]!.score);
  });

  it("filters by available time: drops what does not fit, trims splittable blocks", () => {
    const b = brief({
      pending: {
        srs: { dueTotal: 30, bySubject: [{ subject: "mathematics", count: 30, oldestOverdueDays: 0, lapses: 0 }] },
        errors: { unresolved: 1, bySubject: {}, repeaters: [{ id: "e", subject: "mathematics", topic: "", skill: "", category: "logical", repeatCount: 2, lastSeenDays: 0 }] },
        queue: [],
      },
      topics: { topics: [topic({ folder: "Mates/Algebra" })] },
    });
    const wide = buildCandidates(b, { availableMinutes: 120 });
    expect(wide.find((x) => x.id === "srs:mathematics")!.estMinutes).toBe(30); // tope
    const narrow = buildCandidates(b, { availableMinutes: 12 });
    expect(narrow.map((x) => [x.id, x.estMinutes])).toEqual([["srs:mathematics", 12], ["topic:Mates/Algebra", 12]]); // error_fix (15) no cabe
    expect(buildCandidates(b, { availableMinutes: 8 })).toEqual([]);
  });

  it("goal items without topics only show up near a deadline; broken links get a repair hint", () => {
    const broken = { folder: "Mates/Borrado", title: "Borrado", skills: [], pct: 0, done: false, broken: true, missing: ["enlace roto"] };
    const b = brief({
      goals: {
        goals: [
          goal({ id: "far", items: [item({ id: "x", daysLeft: 40 })] }),
          goal({ id: "near", name: "Cercana", daysLeft: 3, deadline: "2026-10-08", items: [item({ id: "y", name: "Entregar" })] }),
          goal({ id: "bk", items: [item({ id: "z", name: "Roto", topics: [broken] })] }),
        ],
      },
    });
    const c = buildCandidates(b, { availableMinutes: 60 });
    expect(ids(c)).toEqual(["goal:near:y", "goal:bk:z"]);
    expect(c[1]!.reasons.join(" ")).toContain("repáralo");
  });

  it("is deterministic: ties break by kind then id", () => {
    const b = brief({
      pending: {
        ...noPending,
        srs: {
          dueTotal: 4,
          bySubject: [
            { subject: "b", count: 2, oldestOverdueDays: 1, lapses: 0 },
            { subject: "a", count: 2, oldestOverdueDays: 1, lapses: 0 },
          ],
        },
      },
    });
    const first = buildCandidates(b, { availableMinutes: 60 });
    expect(ids(first)).toEqual(["srs:a", "srs:b"]);
    expect(buildCandidates(b, { availableMinutes: 60 })).toEqual(first);
  });
});

describe("allocate", () => {
  const cand = (id: string, subject: string, score: number, estMinutes: number, kind: Candidate["kind"] = "continue_topic"): Candidate => ({
    id,
    kind,
    subject,
    estMinutes,
    score,
    reasons: [],
    links: {},
  });
  const total = (c: Candidate[]) => c.reduce((n, x) => n + x.estMinutes, 0);

  it("no time -> nothing", () => {
    expect(allocate([cand("a", "m", 90, 20)], 0)).toEqual([]);
  });

  it("a single subject may use the whole time", () => {
    const out = allocate([cand("a", "m", 90, 30), cand("b", "m", 80, 30), cand("c", "m", 70, 30)], 90);
    expect(ids(out)).toEqual(["a", "b", "c"]);
  });

  it("three subjects: no subject exceeds ~60% and the total fits", () => {
    const list = [
      cand("m1", "mathematics", 95, 30, "error_fix"),
      cand("m2", "mathematics", 90, 30, "error_fix"),
      cand("m3", "mathematics", 85, 30, "error_fix"),
      cand("e1", "english", 80, 20, "error_fix"),
      cand("p1", "programming", 70, 20, "error_fix"),
    ];
    const out = allocate(list, 100);
    expect(total(out.filter((x) => x.subject === "mathematics"))).toBeLessThanOrEqual(60);
    expect(total(out)).toBeLessThanOrEqual(100);
    expect(ids(out)).toEqual(["m1", "m2", "e1", "p1"]); // m3 haría 90 min de mates
    expect(out.map((x) => x.score)).toEqual([...out.map((x) => x.score)].sort((a, b) => b - a));
  });

  it("trims a splittable block into the subject's remaining budget, but not an unsplittable one", () => {
    const list = [cand("m1", "mathematics", 95, 30), cand("m2", "mathematics", 90, 40), cand("e1", "english", 50, 10)];
    // presupuesto de mates con 60 min: 36 -> m1 (30) y quedan 6 < mínimo 10: m2 no entra
    expect(allocate(list, 60).map((x) => [x.id, x.estMinutes])).toEqual([["m1", 30], ["e1", 10]]);
    // con 100 min el presupuesto es 60: m2 se acorta de 40 a 30
    expect(allocate(list, 100).map((x) => [x.id, x.estMinutes])).toEqual([["m1", 30], ["m2", 30], ["e1", 10]]);
    const fixed = [cand("m1", "mathematics", 95, 30, "error_fix"), cand("m2", "mathematics", 90, 40, "error_fix"), cand("e1", "english", 50, 10)];
    expect(ids(allocate(fixed, 100))).toEqual(["m1", "e1"]);
  });

  it("a big block of one subject cannot swallow the plan when others compete", () => {
    const out = allocate([cand("s", "mathematics", 99, 60, "srs_review"), cand("e", "english", 40, 30)], 60);
    expect(out.map((x) => [x.id, x.estMinutes])).toEqual([["s", 36], ["e", 24]]);
  });

  it("respects maxSubjects", () => {
    const list = [cand("m", "mathematics", 90, 10), cand("e", "english", 80, 10), cand("p", "programming", 70, 10)];
    expect(ids(allocate(list, 120, { maxSubjects: 2 }))).toEqual(["m", "e"]);
  });

  it("planBlocksFrom produces planned blocks for the session log", () => {
    const [b] = planBlocksFrom([{ ...cand("t", "mathematics", 80, 25), topicFolder: "Mates/Algebra" }]);
    expect(b).toEqual({ candidateId: "t", kind: "continue_topic", subject: "mathematics", topicFolder: "Mates/Algebra", minutes: 25, status: "planned" });
  });
});
