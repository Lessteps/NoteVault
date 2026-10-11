import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Managers } from "../../api/context.js";
import { ITEM_DONE } from "../goalManager.js";
import { P_ACTIVE } from "../projectManager.js";
import { StudyErrorManager } from "../studyErrorManager.js";
import { StudySRSManager } from "../studySrsManager.js";
import * as store from "../store.js";
import {
  briefProviders,
  buildStudentBrief,
  registerBriefProvider,
  sectionData,
  toPromptText,
  unregisterBriefProvider,
  type BriefContext,
  type GoalsData,
  type HabitsActivityData,
  type StudentBrief,
  type StudyPendingData,
  type TasksData,
  type TopicsData,
} from "./brief.js";
import type { SessionRecord } from "./sessionLog.js";
import type { TopicSnap } from "./topics.js";

const TODAY = new Date(2026, 9, 5); // 2026-10-05

function skill(mastered: boolean, attempts: number, best: number | null, status = mastered ? "consolidated" : attempts ? "practicing" : "not_started") {
  return { mastered, status, totalAttempts: attempts, bestScore: best };
}

function snap(over: Partial<TopicSnap> & { folder: string }): TopicSnap {
  return {
    subject: "mathematics",
    title: over.folder.split("/").pop()!,
    exerciseCount: 4,
    theoryNotes: 2,
    attemptCount: 0,
    lastAttemptAt: null,
    progress: {
      topic: { title: over.folder.split("/").pop()!, subject: "mathematics", mastery: { exam: "required" } },
      skills: { solve: skill(false, 0, null), prove: skill(false, 0, null) },
      examPassed: false,
      examScore: null,
      completenessPct: 0,
    },
    ...over,
  };
}

const TOPICS: TopicSnap[] = [
  // a medias, con skill débil, intento reciente
  snap({
    folder: "Mates/Algebra",
    attemptCount: 6,
    lastAttemptAt: "2026-10-03T18:00:00",
    progress: {
      topic: { title: "Algebra", subject: "mathematics", mastery: { exam: "required" } },
      skills: { solve: skill(true, 4, 90), prove: skill(false, 2, 40), explain: skill(false, 0, null) },
      examPassed: false,
      examScore: null,
      completenessPct: 55,
    },
  }),
  // sin tratar: hay material pero 0 intentos
  snap({ folder: "Mates/Geometria" }),
  // completo y sin meta: no debe aparecer
  snap({
    folder: "Mates/Aritmetica",
    attemptCount: 9,
    lastAttemptAt: "2026-08-01T10:00:00",
    progress: {
      topic: { title: "Aritmetica", subject: "mathematics", mastery: { exam: "required" } },
      skills: { solve: skill(true, 5, 95) },
      examPassed: true,
      examScore: 90,
      completenessPct: 100,
    },
  }),
];

let dir: string;
let mgrs: Managers;
let sessions: SessionRecord[];

function ctx(over: Partial<BriefContext> = {}): BriefContext {
  return {
    today: TODAY,
    goals: mgrs.goals,
    tasks: mgrs.tasks,
    projects: mgrs.projects,
    srs: new StudySRSManager(dir),
    errors: new StudyErrorManager(dir),
    topics: () => TOPICS,
    sessions: () => sessions,
    ...over,
  };
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "nv_brief_"));
  mgrs = new Managers(dir);
  sessions = [];
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("goals provider", () => {
  it("derives progress, deadline and broken/missing topic links", () => {
    // El álgebra está a medias (solve dominada, prove no); "Mates/Borrado" no existe.
    mgrs.goals.topicLookup = (f) =>
      f === "Mates/Algebra"
        ? ({
            topic: { title: "Algebra", mastery: { exam: "none" } },
            skills: { solve: { mastered: true }, prove: { mastered: false } },
            examPassed: false,
          } as never)
        : null;
    const goal = mgrs.goals.createGoal("Aprobar álgebra", { priority: 4, start: new Date(2026, 8, 1), end: new Date(2026, 9, 10) });
    mgrs.goals.createItem(goal.id, "Dominar álgebra", "", { topic_links: ["Mates/Algebra", "Mates/Borrado"] });
    mgrs.goals.createItem(goal.id, "Entregar informe", "", { due: new Date(2026, 9, 7) });
    const done = mgrs.goals.createItem(goal.id, "Ya hecha", "", { status: ITEM_DONE });
    expect(done.status).toBe(ITEM_DONE);
    mgrs.goals.createGoal("Meta pausada", { status: "pausa" });

    const brief = buildStudentBrief(ctx(), { only: ["goals"] });
    const data = sectionData<GoalsData>(brief, "goals")!;
    expect(data.goals).toHaveLength(1); // la pausada no sale, ni la submeta hecha
    const g = data.goals[0]!;
    expect(g).toMatchObject({ name: "Aprobar álgebra", daysLeft: 5, deadline: "2026-10-10", overdue: false, priority: 4 });
    expect(g.why.join(" ")).toContain("vence en 5 d");
    expect(g.why).toContain("prioridad alta");
    expect(g.items.map((i) => i.name)).toEqual(["Entregar informe", "Dominar álgebra"]); // por fecha, luego enlazadas

    const linked = g.items.find((i) => i.name === "Dominar álgebra")!;
    expect(linked.topics).toHaveLength(2);
    const alg = linked.topics.find((t) => t.folder === "Mates/Algebra")!;
    expect(alg).toMatchObject({ pct: 50, done: false, broken: false, missing: ["prove"] });
    expect(linked.topics.find((t) => t.folder === "Mates/Borrado")).toMatchObject({ broken: true, missing: ["enlace roto"] });
    expect(linked.why).toContain("1 enlace roto");

    const text = toPromptText(brief);
    expect(text).toContain("Aprobar álgebra");
    expect(text).toContain("faltan: prove");
  });

  it("is omitted without a goals source and survives provider failures", () => {
    const b1 = buildStudentBrief(ctx({ goals: undefined }), { only: ["goals"] });
    expect(b1.sections).toEqual([]);
    const boom = { id: "boom", collect() { throw new Error("x"); } };
    const b2 = buildStudentBrief(ctx(), { providers: [boom] });
    expect(b2.skipped).toEqual(["boom"]);
    expect(b2.sections).toEqual([]);
  });
});

describe("topics provider", () => {
  it("flags untreated, weak and goal-linked topics; hides finished unlinked ones", () => {
    const goal = mgrs.goals.createGoal("Geometría ya", { end: new Date(2026, 9, 8) });
    mgrs.goals.createItem(goal.id, "Ver geometría", "", { topic_links: ["Mates/Geometria"] });

    const data = sectionData<TopicsData>(buildStudentBrief(ctx(), { only: ["topics"] }), "topics")!;
    const byFolder = Object.fromEntries(data.topics.map((t) => [t.folder, t]));
    expect(Object.keys(byFolder).sort()).toEqual(["Mates/Algebra", "Mates/Geometria"]);

    expect(byFolder["Mates/Algebra"]).toMatchObject({
      status: "in_progress",
      completenessPct: 55,
      weakSkills: ["prove"],
      notStartedSkills: ["explain"],
      masteredSkills: 1,
      totalSkills: 3,
      exam: "required_pending",
      lastAttemptDays: 2,
    });
    const geo = byFolder["Mates/Geometria"]!;
    expect(geo.status).toBe("untreated");
    expect(geo.attempts).toBe(0);
    expect(geo.goalLinks).toHaveLength(1);
    expect(geo.goalLinks[0]).toMatchObject({ goalName: "Geometría ya", daysLeft: 3 });
    expect(geo.why.join(" ")).toContain("sin tratar");
    expect(geo.why.join(" ")).toContain('lo pide la meta "Geometría ya"');
    // lo enlazado por metas va primero
    expect(data.topics[0]!.folder).toBe("Mates/Geometria");
  });
});

describe("study_pending provider", () => {
  it("summarises overdue SRS reviews, repeat errors and the recommender queue", () => {
    const srs = new StudySRSManager(dir);
    const a = srs.registerItem("c1", "concept", "mathematics", "limits");
    const b = srs.registerItem("c2", "concept", "mathematics", "limits");
    const future = srs.registerItem("c3", "concept", "english", "verbs");
    store.writeJson(path.join(srs.dir, `${a.id}.json`), { ...a, next_review: "2026-09-25", lapses: 2 });
    // `registerItem` fecha el repaso con el día real: se fija para que el test no dependa de qué día se ejecute
    store.writeJson(path.join(srs.dir, `${b.id}.json`), { ...b, next_review: "2026-10-05" });
    store.writeJson(path.join(srs.dir, `${future.id}.json`), { ...future, next_review: "2026-10-20" });

    const errs = new StudyErrorManager(dir);
    errs.recordError("logical", "mathematics", "induction", "x", { skill: "prove", anchor: "base case" });
    errs.recordError("logical", "mathematics", "induction", "x", { skill: "prove", anchor: "base case" });
    errs.recordError("syntax", "programming", "loops", "y");

    const brief = buildStudentBrief(
      ctx({
        srs: new StudySRSManager(dir),
        errors: new StudyErrorManager(dir),
        queue: () => [{ kind: "remediation", subject: "mathematics", title: "Debug prove", reason: "reincidente" }],
      }),
      { only: ["study_pending"] },
    );
    const data = sectionData<StudyPendingData>(brief, "study_pending")!;
    expect(data.srs.dueTotal).toBe(2);
    expect(data.srs.bySubject).toEqual([{ subject: "mathematics", count: 2, oldestOverdueDays: 10, lapses: 2 }]);
    expect(data.errors.unresolved).toBe(2);
    expect(data.errors.repeaters).toHaveLength(1);
    expect(data.errors.repeaters[0]).toMatchObject({ subject: "mathematics", skill: "prove", repeatCount: 2 });
    expect(data.queue[0]!.title).toBe("Debug prove");

    const s = brief.sections[0]!;
    expect(s.signals).toEqual(["2 repasos vencidos", "1 error reincidente sin resolver"]);
    expect(toPromptText(brief)).toContain("Repasos vencidos mathematics: 2");
  });
});

describe("tasks provider", () => {
  it("lists pending tasks with deadlines and active projects with due issues", () => {
    mgrs.tasks.create("Ensayo", { due: new Date(2026, 9, 3), subject: "Historia", priority: 2 });
    mgrs.tasks.create("Lejana", { due: new Date(2026, 11, 30), subject: "Historia" });
    mgrs.tasks.create("Hecha", { due: new Date(2026, 9, 4), status: "Completado" });
    const p = mgrs.projects.create("Proyecto Alfa", { status: P_ACTIVE, deadline: new Date(2026, 9, 20), area: "uni" });
    mgrs.projects.createIssue(p.id, "Escribir intro", { due: new Date(2026, 9, 6), estimate_min: 45 });
    mgrs.projects.createIssue(p.id, "Sin fecha");

    const data = sectionData<TasksData>(buildStudentBrief(ctx(), { only: ["tasks"] }), "tasks")!;
    expect(data.tasks.map((t) => t.name)).toEqual(["Ensayo"]); // la lejana y la hecha no entran
    expect(data.tasks[0]).toMatchObject({ daysLeft: -2, subject: "Historia" });
    expect(data.overdue).toBe(1);
    expect(data.bySubject[0]).toMatchObject({ subject: "Historia", count: 2, overdue: 1 });
    expect(data.projects).toHaveLength(1);
    expect(data.projects[0]).toMatchObject({ name: "Proyecto Alfa", openIssues: 2, daysLeft: 15 });
    expect(data.projects[0]!.dueSoon).toEqual([expect.objectContaining({ title: "Escribir intro", daysLeft: 1, estimateMin: 45 })]);
  });
});

describe("habits_activity provider", () => {
  it("is a valid empty section without sessions", () => {
    const s = buildStudentBrief(ctx(), { only: ["habits_activity"] }).sections[0]!;
    expect(s.summary).toMatch(/Sin sesiones/);
    expect(s.data).toMatchObject({ sessions: 0, adherencePct: null, typicalSessionMinutes: null, skippedSubjects: [] });
    expect(s.lines).toEqual([]);
  });

  it("reports what is skipped and the typical session length", () => {
    const day = (date: string, blocks: Array<[string, string, number, "done" | "skipped"]>): SessionRecord => ({
      date,
      availableMinutes: 60,
      createdAt: `${date}T08:00:00`,
      blocks: blocks.map(([subject, kind, minutes, status], i) => ({ candidateId: `${subject}${i}`, kind, subject, minutes, status })),
    });
    sessions = [
      day("2026-10-04", [["mathematics", "srs_review", 20, "done"], ["english", "continue_topic", 30, "skipped"]]),
      day("2026-10-03", [["mathematics", "continue_topic", 30, "done"], ["english", "continue_topic", 30, "skipped"]]),
    ];
    const s = buildStudentBrief(ctx(), { only: ["habits_activity"] }).sections[0]!;
    const d = s.data as HabitsActivityData;
    expect(d).toMatchObject({ sessions: 2, adherencePct: 50, typicalSessionMinutes: 25, skippedSubjects: ["english"], lastSessionDate: "2026-10-04" });
    expect(d.skippedKinds[0]).toEqual({ kind: "continue_topic", pct: 33 });
    expect(s.signals).toContain("salta english");
  });
});

describe("registry", () => {
  it("lets a new provider plug in without touching the rest", () => {
    expect(briefProviders().map((p) => p.id)).toEqual(["study_pending", "goals", "topics", "tasks", "habits_activity", "mentor_memory"]);
    registerBriefProvider({
      id: "finance",
      collect: () => ({ id: "finance", title: "Finanzas", priority: 6, summary: "Presupuesto al día", signals: [], lines: [], data: {} }),
    });
    try {
      const brief = buildStudentBrief(ctx());
      expect(brief.sections.map((s) => s.id)).toEqual(["study_pending", "goals", "topics", "tasks", "habits_activity", "finance"]);
      expect(JSON.parse(JSON.stringify(brief))).toEqual(brief); // serializable
    } finally {
      unregisterBriefProvider("finance");
    }
  });
});

describe("toPromptText truncation by priority", () => {
  const pad = "·".repeat(40);
  const section = (id: string, priority: number, lines: Array<[string, number]>) => ({
    id,
    title: id.toUpperCase(),
    priority,
    summary: `resumen ${id}`,
    signals: [],
    lines: lines.map(([text, weight]) => ({ text: text + pad, weight })),
    data: {},
  });
  const brief: StudentBrief = {
    version: 1,
    date: "2026-10-05",
    weekday: "lunes",
    skipped: [],
    sections: [
      section("alta", 1, [["alta-importante", 90], ["alta-menor", 10]]),
      section("baja", 5, [["baja-importante", 99], ["baja-menor", 5]]),
    ],
  };

  it("keeps everything when there is room", () => {
    const text = toPromptText(brief, 2000);
    for (const t of ["alta-importante", "alta-menor", "baja-importante", "baja-menor"]) expect(text).toContain(t);
    expect(text.indexOf("ALTA")).toBeLessThan(text.indexOf("BAJA"));
  });

  it("drops low-priority lines first, then reports the omission", () => {
    const full = toPromptText(brief, 2000);
    const max = full.length - 60; // cabe todo menos la última línea de la sección baja
    const text = toPromptText(brief, max);
    expect(text.length).toBeLessThanOrEqual(max);
    expect(text).toContain("alta-importante");
    expect(text).toContain("alta-menor"); // la sección prioritaria se conserva entera antes que la baja
    expect(text).not.toContain("baja-menor");
    expect(text).toMatch(/\(\+\d+ omitidas\)/);
  });

  it("falls back to the skeleton, then to dropping whole sections, never exceeding the budget", () => {
    const skeleton = toPromptText(brief, 140);
    expect(skeleton.length).toBeLessThanOrEqual(140);
    expect(skeleton).toContain("ALTA");
    const tiny = toPromptText(brief, 70);
    expect(tiny.length).toBeLessThanOrEqual(70);
    expect(tiny).toContain("ALTA");
    expect(tiny).not.toContain("BAJA");
  });
});
