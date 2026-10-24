// «Hoy» sobre la agenda por enfoque: los temas de hoy llevan su papel (teoría / práctica) y el enfoque, el proyecto diario del plan es un
// candidato conectado con los temas del día, y el currículo de práctica sobrevive a guardar y leer el plan (aditivo).

import { describe, expect, it } from "vitest";
import { buildCandidates } from "./candidates";
import { planItemsFor, sanitizePlan, type Plan } from "./plan";
import type { BriefSection, StudentBrief, TopicBrief, TopicsData } from "./brief";

const START = "2026-10-05";
const raw = (over: Record<string, unknown> = {}) => ({
  id: "p1", start: START, end: "2026-11-29", createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z", structure: "areas",
  preconditions: { start: START, end: "2026-11-29", minutesPerDay: 360, studyDays: [1, 2, 3, 4, 5], pace: "intenso", goalIds: [], subjects: [], levels: {}, deliverables: "no" },
  subplans: [
    { id: "s-be", area: "Backend", areaId: "backend", objective: "x", requiredGoals: [], weeks: [], phase: { fromWeek: 1, toWeek: 8 },
      groups: [{ id: "bases", title: "Bases", kind: "bases", order: 0 }, { id: "lang-python", title: "Lenguaje: Python", kind: "language", order: 10 }, { id: "core", title: "Backend", kind: "knowledge", order: 100 }],
      topics: [
        ...Array.from({ length: 4 }, (_, i) => ({ folder: `P/F${i + 1}`, title: `Fundamento ${i + 1}`, estMinutes: 60, targetWeek: 1, group: "bases" })),
        ...Array.from({ length: 4 }, (_, i) => ({ folder: `P/PY${i + 1}`, title: `Python ${i + 1}`, estMinutes: 60, targetWeek: 1, group: "lang-python" })),
        ...Array.from({ length: 4 }, (_, i) => ({ folder: `P/BE${i + 1}`, title: `Backend ${i + 1}`, estMinutes: 60, targetWeek: 1, group: "core" })),
      ] },
    { id: "s-db", area: "Databases", areaId: "databases", objective: "x", requiredGoals: [], weeks: [], phase: { fromWeek: 1, toWeek: 8 }, groups: [{ id: "core", title: "BD", kind: "knowledge", order: 100 }], topics: Array.from({ length: 4 }, (_, i) => ({ folder: `P/DB${i + 1}`, title: `SQL ${i + 1}`, estMinutes: 60, targetWeek: 1, group: "core" })) },
  ],
  ...over,
});
const plan = (over: Record<string, unknown> = {}): Plan => sanitizePlan(raw(over))!;

describe("planItemsFor sobre la agenda por enfoque", () => {
  it("los temas de hoy llevan su papel y el enfoque; teoría y práctica del mismo tema se marcan «both»", () => {
    const items = planItemsFor(START, [plan()]);
    const today = items.filter((i) => i.scheduledToday && i.kind === "topic");
    expect(today.length).toBeGreaterThanOrEqual(4);
    expect(today.every((i) => i.focus === "Backend")).toBe(true);
    const by = new Map(today.map((i) => [i.folder, i]));
    expect(by.get("P/BE1")!.role).toBe("theory");
    expect(by.get("P/PY1")!.role).toBe("practice");
    expect(by.get("P/DB1")!.role).toBe("both");
  });

  it("añade el proyecto diario del plan, conectado con los temas de hoy, con sus minutos", () => {
    const items = planItemsFor(START, [plan()]);
    const project = items.find((i) => i.kind === "project")!;
    expect(project).toMatchObject({ planId: "p1", scheduledToday: true, focus: "Backend" });
    expect(project.title).toMatch(/Mini-endpoint/);
    expect(project.estMinutes).toBeGreaterThanOrEqual(25);
    expect(project.connected!.length).toBeGreaterThanOrEqual(3);
    // un día sin estudio no tiene proyecto
    expect(planItemsFor("2026-10-10", [plan()]).some((i) => i.kind === "project")).toBe(false);
    // un plan de estructura antigua no añade proyecto
    const { structure: _s, ...old } = raw();
    expect(planItemsFor(START, [sanitizePlan(old)!]).some((i) => i.kind === "project")).toBe(false);
  });

  it("buildCandidates convierte el proyecto en un candidato «plan_item» y explica el papel del tema (teoría / práctica de <enfoque>)", () => {
    const items = planItemsFor(START, [plan()]);
    const tb = (folder: string): TopicBrief => ({ folder, subject: "programming", title: folder, status: "in_progress", completenessPct: 10, weakSkills: [], notStartedSkills: [], practicingSkills: [], masteredSkills: 0, totalSkills: 3, exam: "none", examScore: null, attempts: 1, exercises: 2, theoryNotes: 1, lastAttemptDays: 3, goalLinks: [], why: [] });
    const data: TopicsData = { topics: plan().subplans.flatMap((s) => s.topics.map((t) => tb(t.folder))) } as never;
    const sec: BriefSection = { id: "topics", title: "topics", priority: 1, summary: "", signals: [], lines: [], data };
    const brief: StudentBrief = { version: 1, date: START, weekday: "lunes", sections: [sec], skipped: [] };
    const cands = buildCandidates(brief, { availableMinutes: 600, planItems: items });
    const proj = cands.find((c) => c.id === "plan:p1:daily-project")!;
    expect(proj.kind).toBe("plan_item");
    expect(proj.reasons[0]).toMatch(/proyecto diario del plan \(.*enfoque Backend\): Mini-endpoint.*aplica/);
    const be = cands.find((c) => c.topicFolder === "P/BE1")!;
    expect(be.reasons[0]).toMatch(/toca hoy en la agenda del plan .*teoría de Backend/);
    expect(cands.find((c) => c.topicFolder === "P/PY1")!.reasons[0]).toMatch(/práctica de Backend/);
  });
});

describe("el currículo de práctica se lee y se guarda de forma aditiva", () => {
  it("un plan sin currículo no lo inventa; uno con currículo conserva solo lo válido", () => {
    expect(plan().practiceCurriculum).toBeUndefined();
    const p = plan({ practiceCurriculum: { generatedAt: "2026-10-05T10:00:00Z", weeks: [{ week: 1, source: "ai", exercises: [{ topic: "P/DB1", practice: "database", title: "Escribe la consulta con JOIN" }, { topic: "No/Existe", title: "x" }], weeklyProject: { title: "API de pedidos" } }, { week: 99, source: "ai" }], monthly: [{ month: "2026-10", title: "Mini tienda", source: "ai" }] } });
    expect(p.practiceCurriculum!.weeks).toHaveLength(1);
    expect(p.practiceCurriculum!.weeks[0]!.exercises).toHaveLength(1);
    expect(p.practiceCurriculum!.weeks[0]!.weeklyProject!.title).toBe("API de pedidos");
    expect(p.practiceCurriculum!.monthly[0]!.title).toBe("Mini tienda");
    expect(JSON.parse(JSON.stringify(p)).practiceCurriculum.source).toBe("ai");
  });
});

describe("planItemsFor con temas extra de hoy", () => {
  const TODAY = "2026-10-14";
  it("un tema de la ruta adelantado a hoy y un tema de la vault añadido a hoy salen en «Hoy» (para planear el día y el Pomodoro)", () => {
    const p = plan({ extraTopics: [
      { date: TODAY, folder: "P/BE4", addedAt: "2026-10-14T08:00:00Z", source: "manual" },
      { date: TODAY, folder: "Vault/Redis", area: "s-be", title: "Redis básico", estMinutes: 30, addedAt: "2026-10-14T08:00:00Z", source: "manual" },
      { date: TODAY, folder: "Vault/Suelto", title: "Tema suelto", estMinutes: 30, addedAt: "2026-10-14T08:00:00Z", source: "manual" },
    ] });
    // el tema de la ruta está en una semana posterior a la de hoy: sin extra no saldría
    const moved = sanitizePlan({ ...raw(), subplans: raw().subplans.map((s) => ({ ...s, topics: s.topics.map((t) => (t.folder === "P/BE4" ? { ...t, targetWeek: 6 } : t)) })), extraTopics: p.extraTopics })!;
    const without = sanitizePlan({ ...raw(), subplans: moved.subplans })!;
    expect(planItemsFor(TODAY, [without], undefined, true).some((i) => i.folder === "P/BE4" && i.scheduledToday)).toBe(false);
    const items = planItemsFor(TODAY, [moved], undefined, true).filter((i) => i.kind === "topic");
    const by = new Map(items.map((i) => [i.folder, i]));
    expect(by.get("P/BE4")).toMatchObject({ scheduledToday: true });
    expect(by.get("Vault/Redis")).toMatchObject({ scheduledToday: true, area: "Backend", title: "Redis básico", estMinutes: 30 });
    expect(by.get("Vault/Suelto")).toMatchObject({ scheduledToday: true, area: "Extra", subplanId: "extra" });
    // si ya está completo en vivo, no se ofrece
    expect(planItemsFor(TODAY, [moved], (f) => f === "Vault/Redis", true).some((i) => i.folder === "Vault/Redis")).toBe(false);
  });
});
