import { describe, expect, it } from "vitest";
import type { BriefSection, GoalsData, StudentBrief, StudyPendingData, TasksData, TopicBrief, TopicsData } from "./brief.js";
import { buildCandidates } from "./candidates.js";
import { objectiveText, resolveObjective, sanitizeObjective } from "./objective.js";
import { buildPlan, planItemsFor } from "./plan.js";

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
  exam: "none",
  examScore: null,
  attempts: 5,
  exercises: 4,
  theoryNotes: 2,
  lastAttemptDays: 10,
  goalLinks: [],
  why: [],
  ...over,
});

const pending: StudyPendingData = {
  srs: { dueTotal: 6, bySubject: [{ subject: "mathematics", count: 6, oldestOverdueDays: 4, lapses: 1 }] },
  errors: { unresolved: 0, bySubject: {}, repeaters: [] },
  queue: [],
};

const goals: GoalsData = {
  goals: [
    {
      id: "g-back", name: "Desarrollo Backend", area: "", priority: 2, deadline: null, daysLeft: null, overdue: false, progressPct: 10, why: [], moreItems: 0,
      items: [{ id: "i1", name: "APIs", status: "Por hacer", due: null, daysLeft: null, priority: 2, progressPct: 0, why: [], topics: [{ folder: "Prog/APIs", title: "APIs", skills: [], pct: 0, done: false, broken: false, missing: [] }] }],
    },
    {
      id: "g-ing", name: "Inglés B2", area: "", priority: 2, deadline: null, daysLeft: null, overdue: false, progressPct: 10, why: [], moreItems: 0,
      items: [{ id: "i2", name: "Reading", status: "Por hacer", due: null, daysLeft: null, priority: 2, progressPct: 0, why: [], topics: [{ folder: "Ing/Reading", title: "Reading", skills: [], pct: 0, done: false, broken: false, missing: [] }] }],
    },
  ],
};

const world = (): StudentBrief =>
  brief({
    pending,
    goals,
    topics: {
      topics: [
        topic({ folder: "Prog/APIs", subject: "programming", completenessPct: 30 }),
        topic({ folder: "Prog/Python", subject: "programming", completenessPct: 60 }),
        topic({ folder: "Ing/Reading", subject: "english", completenessPct: 50 }),
        topic({ folder: "Mat/Algebra", subject: "mathematics", completenessPct: 50 }),
      ],
    },
    tasks: {
      tasks: [
        { id: "t1", name: "Ensayo", subject: "Historia", due: "2026-10-06", daysLeft: 1, priority: 2, status: "Sin empezar" },
        { id: "t2", name: "Leer capítulo", subject: "Historia", due: null, daysLeft: null, priority: 1, status: "Sin empezar" },
      ],
      projects: [],
      overdue: 0,
      bySubject: [],
    },
  });

const ids = (b: StudentBrief, opts: Parameters<typeof buildCandidates>[1]) => buildCandidates(b, opts).map((c) => c.id);

describe("objetivo de la sesión → candidatos", () => {
  it("sin objetivo no cambia nada; 'none' tampoco", () => {
    const base = ids(world(), { availableMinutes: 480 });
    expect(ids(world(), { availableMinutes: 480, objective: { type: "none" } })).toEqual(base);
  });

  it("subject: lo de esa materia va primero y lo demás se relega sin eliminarse", () => {
    const base = ids(world(), { availableMinutes: 480 });
    expect(base[0]).toBe("srs:mathematics"); // sin objetivo manda el repaso
    const c = buildCandidates(world(), { availableMinutes: 480, objective: { type: "subject", subject: "programming" } });
    expect(c.slice(0, 2).map((x) => x.topicFolder)).toEqual(expect.arrayContaining(["Prog/APIs", "Prog/Python"]));
    expect(c.slice(0, 2).every((x) => x.subject === "programming")).toBe(true);
    expect(c[0]!.reasons[0]).toContain("objetivo de la sesión");
    // los demás siguen ahí
    expect(c.map((x) => x.id)).toEqual(expect.arrayContaining(base));
    expect(c.find((x) => x.id === "srs:mathematics")!.score).toBeLessThan(c[1]!.score);
  });

  it("goal: lo enlazado a esa meta (por tema o submeta) va primero", () => {
    const c = buildCandidates(world(), { availableMinutes: 480, objective: { type: "goal", goalId: "g-ing", label: "Inglés B2" } });
    expect(c[0]).toMatchObject({ topicFolder: "Ing/Reading" });
    expect(c.length).toBe(buildCandidates(world(), { availableMinutes: 480 }).length);
    // con itemIds restringe a esas submetas
    const c2 = buildCandidates(world(), { availableMinutes: 480, objective: { type: "goal", goalId: "g-back", itemIds: ["i1"] } });
    expect(c2[0]!.topicFolder).toBe("Prog/APIs");
  });

  it("tasks: las tareas pendientes (también sin fecha) van primero", () => {
    const base = buildCandidates(world(), { availableMinutes: 480 }).filter((c) => c.kind === "task_deadline");
    expect(base).toHaveLength(1); // sin objetivo solo entra la que tiene plazo
    const c = buildCandidates(world(), { availableMinutes: 480, objective: { type: "tasks" } });
    expect(c.slice(0, 2).every((x) => x.kind === "task_deadline")).toBe(true);
    expect(c.filter((x) => x.kind === "task_deadline").map((x) => x.id).sort()).toEqual(["task:t1", "task:t2"]);
  });

  it("review: repasos y errores primero", () => {
    const b = brief({ ...{ pending: { ...pending, errors: { unresolved: 1, bySubject: { programming: 1 }, repeaters: [{ id: "e1", subject: "programming", topic: "x", skill: "debug", category: "c", repeatCount: 3, lastSeenDays: 1 }] } } }, topics: world().sections.find((s) => s.id === "topics")!.data as TopicsData });
    const c = buildCandidates(b, { availableMinutes: 480, objective: { type: "review" } });
    expect(c.slice(0, 2).map((x) => x.kind).sort()).toEqual(["error_fix", "srs_review"]);
    expect(c.length).toBeGreaterThan(2);
  });

  it("plan: lo del plan del mes primero", () => {
    const plan = buildPlan([{ area: "Programación", objective: "Backend", topics: [{ folder: "Prog/Python", title: "Python", estMinutes: 60 }] }], { month: "2026-10", hoursPerWeek: 4 }).plan;
    const planItems = planItemsFor("2026-10-05", [plan]);
    const c = buildCandidates(world(), { availableMinutes: 480, planItems, objective: { type: "plan" } });
    expect(c[0]).toMatchObject({ kind: "plan_item", topicFolder: "Prog/Python" });
  });

  it("custom: casa con una meta por palabras clave, con una materia, y si no con las palabras en los candidatos", () => {
    const b = world();
    expect(resolveObjective({ type: "custom", text: "avanzar mi meta de desarrollo backend" }, b)).toMatchObject({ type: "goal", goalId: "g-back" });
    expect(resolveObjective({ type: "custom", text: "estudiar programación" }, b)).toMatchObject({ type: "subject", subject: "programming" });
    expect(resolveObjective({ type: "custom", text: "english" }, b)).toMatchObject({ type: "subject", subject: "english" });
    expect(resolveObjective({ type: "custom", text: "inglés" }, b)).toMatchObject({ type: "goal", goalId: "g-ing" }); // la meta gana a la materia
    expect(resolveObjective({ type: "custom", text: "cosa rara" }, b)).toEqual({ type: "custom", text: "cosa rara" });

    const viaGoal = buildCandidates(b, { availableMinutes: 480, objective: { type: "custom", text: "mi meta de Inglés B2" } });
    expect(viaGoal[0]!.topicFolder).toBe("Ing/Reading");
    // sin casar con meta ni materia: las palabras buscan en carpeta/materia/razones
    const viaWords = buildCandidates(b, { availableMinutes: 480, objective: { type: "custom", text: "algebra" } });
    expect(viaWords[0]!.topicFolder).toBe("Mat/Algebra");
    expect(viaWords.length).toBe(buildCandidates(b, { availableMinutes: 480 }).length);
  });

  it("si nada cumple el objetivo, el orden relativo se conserva y no se pierde ningún candidato", () => {
    const base = ids(world(), { availableMinutes: 480 });
    expect(ids(world(), { availableMinutes: 480, objective: { type: "subject", subject: "history" } })).toEqual(base);
  });
});

describe("objectiveText / sanitizeObjective", () => {
  it("da el texto que ve la IA", () => {
    const b = world();
    expect(objectiveText({ type: "tasks" })).toBe("Terminar todas mis tareas pendientes");
    expect(objectiveText({ type: "subject", subject: "programming" })).toBe("Estudiar Programación");
    expect(objectiveText({ type: "goal", goalId: "g-back" }, b)).toBe("Meta: Desarrollo Backend");
    expect(objectiveText({ type: "review" })).toContain("Repasar lo vencido");
    expect(objectiveText({ type: "custom", text: "cerrar límites" })).toBe("cerrar límites");
    expect(objectiveText({ type: "none" })).toBe("");
  });

  it("valida lo que llega de la UI", () => {
    expect(sanitizeObjective(null)).toBeNull();
    expect(sanitizeObjective({ type: "raro" })).toBeNull();
    expect(sanitizeObjective({ type: "goal" })).toBeNull();
    expect(sanitizeObjective({ type: "custom", text: "  hola   mundo " })).toEqual({ type: "custom", text: "hola mundo" });
    expect(sanitizeObjective({ type: "goal", goalId: "g1", itemIds: ["a", 3] })).toEqual({ type: "goal", goalId: "g1", itemIds: ["a"] });
  });
});

describe("plan mensual → candidatos (plan_item)", () => {
  const plan = buildPlan(
    [{ area: "Programación", objective: "Backend", topics: [{ folder: "Prog/APIs", title: "APIs", estMinutes: 90 }, { folder: "Prog/Python", title: "Python", estMinutes: 60 }], deliverable: { title: "API de inventario" } }],
    { month: "2026-10", hoursPerWeek: 4 },
  ).plan;

  it("los temas del plan salen primero, con el subplan de origen, sustituyendo al candidato normal del tema", () => {
    const planItems = planItemsFor("2026-10-05", [plan]);
    const c = buildCandidates(world(), { availableMinutes: 480, planItems });
    expect(c.slice(0, 2).map((x) => x.kind)).toEqual(["plan_item", "plan_item"]);
    expect(c[0]!.links.subplan).toBe("Programación: Backend");
    expect(c[0]!.reasons[0]).toContain("lo pide el plan");
    expect(c.filter((x) => x.topicFolder === "Prog/APIs")).toHaveLength(1); // sin duplicar `topic:`
    expect(c.find((x) => x.id === "srs:mathematics")!.score).toBeLessThan(c[0]!.score);
  });

  it("omite temas rotos o ya completos y mete el entregable en la última semana", () => {
    const b = brief({ topics: { topics: [topic({ folder: "Prog/APIs", subject: "programming", status: "complete", completenessPct: 100 })] } });
    const items = planItemsFor("2026-10-30", [plan]);
    const c = buildCandidates(b, { availableMinutes: 480, planItems: items });
    expect(c.map((x) => x.id)).not.toContain(expect.stringContaining("Prog/APIs"));
    expect(c.find((x) => x.id.endsWith(":deliverable"))).toMatchObject({ kind: "plan_item", subject: "Programación" });
  });
});
