import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  addMonths,
  buildPlan,
  deriveView,
  distributeTopics,
  mergePlans,
  PlanStore,
  planItemsFor,
  refreshPlanProgress,
  sanitizePlan,
  topicState,
  weekOf,
  weekRanges,
  type MonthlyPlan,
  type TopicLite,
} from "./plan.js";

const lite = (over: { pct?: number; attempts?: number; exam?: string; examPassed?: boolean; mastered?: boolean[] } = {}): TopicLite => ({
  attemptCount: over.attempts ?? 3,
  progress: {
    topic: { title: "T", subject: "programming", mastery: { exam: over.exam ?? "none" } },
    skills: Object.fromEntries((over.mastered ?? [false]).map((m, i) => [`s${i}`, { mastered: m, status: "", totalAttempts: 1, bestScore: null }])),
    examPassed: over.examPassed ?? false,
    examScore: null,
    completenessPct: over.pct ?? 40,
  },
});

const T = (n: number, est = 60) => ({ folder: `P/T${n}`, title: `Tema ${n}`, estMinutes: est });

describe("semanas del mes", () => {
  it("trocea el mes en semanas de 7 días desde el día 1", () => {
    const w = weekRanges("2026-10");
    expect(w.map((x) => [x.week, x.start, x.end])).toEqual([
      [1, "2026-10-01", "2026-10-07"],
      [2, "2026-10-08", "2026-10-14"],
      [3, "2026-10-15", "2026-10-21"],
      [4, "2026-10-22", "2026-10-28"],
      [5, "2026-10-29", "2026-10-31"],
    ]);
    expect(weekRanges("2026-02")).toHaveLength(4);
    expect(weekOf("2026-10-08", "2026-10")).toBe(2);
    expect(weekOf("2026-09-30", "2026-10")).toBe(0);
    expect(addMonths("2026-12", 1)).toBe("2027-01");
  });
});

describe("topicState (derivado en vivo)", () => {
  it("clasifica sin tratar / practicando / consolidado / completo / examen pendiente / no encontrado", () => {
    expect(topicState(null)).toBe("no_encontrado");
    expect(topicState(lite({ pct: 0, attempts: 0 }))).toBe("sin_tratar");
    expect(topicState(lite({ pct: 35 }))).toBe("practicando");
    expect(topicState(lite({ pct: 80 }))).toBe("consolidado");
    expect(topicState(lite({ pct: 100, mastered: [true] }))).toBe("completo");
    expect(topicState(lite({ pct: 100, mastered: [true], exam: "required" }))).toBe("examen_pendiente");
    expect(topicState(lite({ pct: 100, mastered: [true], exam: "required", examPassed: true }))).toBe("completo");
    // dominó todas las skills pero falta aprobar el examen
    expect(topicState(lite({ pct: 90, mastered: [true, true], exam: "required" }))).toBe("examen_pendiente");
  });
});

describe("distributeTopics: reparto semanal", () => {
  it("reparte los temas por semanas según las horas por semana y avisa de cuántos hay en cada una", () => {
    // 4 h/semana = 240 min; 4 temas de 60 min -> 4 por semana
    const d = distributeTopics({ month: "2026-10", hoursPerWeek: 4, topics: Array.from({ length: 10 }, (_, i) => T(i + 1)) });
    expect(d.fits).toBe(true);
    expect(d.topics.map((t) => t.targetWeek)).toEqual([1, 1, 1, 1, 2, 2, 2, 2, 3, 3]);
    expect(d.weeks[0]!.topics).toEqual(["P/T1", "P/T2", "P/T3", "P/T4"]);
    expect(d.weeks[0]!.minutes).toBe(240);
    expect(d.weeks[4]!.topics).toEqual([]);
    expect(d.totalMinutes).toBe(600);
  });

  it("conserva el orden de los temas y sus skills", () => {
    const d = distributeTopics({ month: "2026-10", hoursPerWeek: 2, topics: [{ ...T(1), skills: ["debug"] }, T(2), T(3)] });
    expect(d.topics.map((t) => t.folder)).toEqual(["P/T1", "P/T2", "P/T3"]);
    expect(d.topics[0]!.skills).toEqual(["debug"]);
    expect(d.topics.map((t) => t.targetWeek)).toEqual([1, 1, 2]);
  });

  it("avisa si no cabe y deja lo que sobra en la última semana", () => {
    // 1 h/semana x ~4,4 semanas = ~264 min; 10 temas de 60 = 600
    const d = distributeTopics({ month: "2026-10", hoursPerWeek: 1, topics: Array.from({ length: 10 }, (_, i) => T(i + 1)) });
    expect(d.fits).toBe(false);
    expect(d.warnings[0]).toContain("No cabe en el mes");
    expect(d.requiredHoursPerWeek).toBeGreaterThan(2);
    expect(Math.max(...d.topics.map((t) => t.targetWeek))).toBe(5);
    expect(d.topics).toHaveLength(10);
  });

  it("el mes en curso reparte desde hoy: las semanas pasadas no reciben temas", () => {
    const d = distributeTopics({ month: "2026-10", hoursPerWeek: 4, topics: [T(1), T(2)], from: "2026-10-16" });
    expect(d.weeks[0]!.capacityMinutes).toBe(0);
    expect(d.weeks[1]!.capacityMinutes).toBe(0);
    expect(d.topics.every((t) => t.targetWeek >= 3)).toBe(true);
  });

  it("rechaza horas no positivas o un mes inválido", () => {
    expect(() => distributeTopics({ month: "2026-10", hoursPerWeek: 0, topics: [] })).toThrow();
    expect(() => distributeTopics({ month: "2026-13", hoursPerWeek: 3, topics: [] })).toThrow();
  });
});

describe("buildPlan / mergePlans", () => {
  const seeds = [
    { area: "Programación", objective: "Backend", topics: [T(1), T(2)], deliverable: { title: "API", criteria: ["CRUD"] } },
    { area: "Inglés", objective: "B2", topics: [{ folder: "E/T1", title: "Reading", estMinutes: 60 }] },
  ];

  it("reparte las horas entre subplanes y genera ids únicos y semanas por subplan", () => {
    const b = buildPlan(seeds, { month: "2026-10", hoursPerWeek: 6, now: "2026-10-01T00:00:00Z" });
    expect(b.plan.subplans.map((s) => s.id)).toEqual(["s1-programacion", "s2-ingles"]);
    expect(b.plan.subplans[0]!.weeks).toHaveLength(5);
    expect(b.plan.subplans[0]!.deliverable).toMatchObject({ title: "API", status: "idea", criteria: ["CRUD"] });
    expect(b.fits).toBe(true);
    expect(b.plan.hoursPerWeek).toBe(6);
  });

  it("mergePlans sustituye el subplan del mismo área+objetivo conservando completedAt y el estado del entregable", () => {
    const first = buildPlan(seeds, { month: "2026-10", hoursPerWeek: 6, now: "2026-10-01T00:00:00Z" }).plan;
    first.subplans[0]!.topics[0]!.completedAt = "2026-10-03";
    first.subplans[0]!.deliverable!.status = "en_curso";
    const incoming = buildPlan([{ ...seeds[0]!, topics: [T(1), T(3)] }], { month: "2026-10", hoursPerWeek: 6 }).plan;
    const merged = mergePlans(first, incoming);
    expect(merged.subplans).toHaveLength(2); // el de Inglés se mantiene
    const back = merged.subplans.find((s) => s.area === "Programación")!;
    expect(back.id).toBe("s1-programacion");
    expect(back.topics.map((t) => t.folder)).toEqual(["P/T1", "P/T3"]);
    expect(back.topics[0]!.completedAt).toBe("2026-10-03");
    expect(back.deliverable!.status).toBe("en_curso");
  });
});

describe("refreshPlanProgress: registro de temas completados", () => {
  const plan = (): MonthlyPlan => buildPlan([{ area: "A", objective: "o", topics: [T(1), T(2)] }], { month: "2026-10", hoursPerWeek: 6 }).plan;
  const world: Record<string, TopicLite> = { "P/T1": lite({ pct: 100, mastered: [true] }), "P/T2": lite({ pct: 30 }) };

  it("anota completedAt solo de los temas completos y una única vez", () => {
    const first = refreshPlanProgress(plan(), (f) => world[f], "2026-10-09");
    expect(first.changed).toBe(true);
    expect(first.completed).toEqual(["P/T1"]);
    expect(first.plan.subplans[0]!.topics.map((t) => t.completedAt)).toEqual(["2026-10-09", undefined]);
    // otro día: no pisa la fecha
    const second = refreshPlanProgress(first.plan, (f) => world[f], "2026-10-20");
    expect(second.changed).toBe(false);
    expect(second.plan.subplans[0]!.topics[0]!.completedAt).toBe("2026-10-09");
  });

  it("no borra la fecha si el avance baja después, y el tema sigue contando como hecho", () => {
    const first = refreshPlanProgress(plan(), (f) => world[f], "2026-10-09").plan;
    const regress = refreshPlanProgress(first, () => lite({ pct: 20 }), "2026-10-21");
    expect(regress.changed).toBe(false);
    const view = deriveView(first, () => lite({ pct: 20 }), "2026-10-21");
    expect(view.subplans[0]!.done).toBe(1);
  });
});

describe("deriveView", () => {
  it("deriva estado, % y progreso global del plan", () => {
    const p = buildPlan([{ area: "A", objective: "o", topics: [T(1), T(2)] }], { month: "2026-10", hoursPerWeek: 6 }).plan;
    const v = deriveView(p, (f) => (f === "P/T1" ? lite({ pct: 100, mastered: [true] }) : f === "P/T2" ? lite({ pct: 40 }) : null), "2026-10-09");
    expect(v.subplans[0]!.topics.map((t) => [t.state, t.pct])).toEqual([["completo", 100], ["practicando", 40]]);
    expect(v.summary).toMatchObject({ subplans: 1, topics: 2, done: 1, pct: 70, currentWeek: 2, weeks: 5 });
    const missing = deriveView(p, () => null, "2026-10-09");
    expect(missing.subplans[0]!.topics.every((t) => t.state === "no_encontrado" && !t.found)).toBe(true);
  });
});

describe("planItemsFor: del plan mensual al plan diario", () => {
  const p = (): MonthlyPlan =>
    buildPlan(
      [{ area: "Programación", objective: "Backend", topics: Array.from({ length: 6 }, (_, i) => T(i + 1)), deliverable: { title: "API de inventario" } }],
      { month: "2026-10", hoursPerWeek: 3 },
    ).plan;

  it("devuelve los temas de esta semana y los atrasados primero", () => {
    const plan = p();
    const wk = plan.subplans[0]!.topics.map((t) => t.targetWeek);
    expect(wk).toEqual([1, 1, 1, 2, 2, 2]);
    const w2 = planItemsFor("2026-10-09", [plan]);
    expect(w2.map((i) => i.folder)).toEqual(["P/T1", "P/T2", "P/T3", "P/T4", "P/T5", "P/T6"]);
    expect(w2.slice(0, 3).every((i) => i.overdue)).toBe(true); // la semana 1 ya pasó
    expect(w2[3]!.overdue).toBe(false);
    expect(w2.every((i) => i.label === "Programación: Backend")).toBe(true);
    // el primer día del mes solo toca la semana 1
    expect(planItemsFor("2026-10-02", [plan]).map((i) => i.folder)).toEqual(["P/T1", "P/T2", "P/T3"]);
  });

  it("omite lo completado (registro o en vivo) y otro mes", () => {
    const plan = p();
    plan.subplans[0]!.topics[0]!.completedAt = "2026-10-03";
    const items = planItemsFor("2026-10-09", [plan], (f) => f === "P/T2");
    expect(items.map((i) => i.folder)).not.toContain("P/T1");
    expect(items.map((i) => i.folder)).not.toContain("P/T2");
    expect(planItemsFor("2026-11-02", [plan])).toEqual([]);
  });

  it("el entregable toca en la última semana, o cuando ya no quedan temas, hasta marcarlo hecho", () => {
    const plan = p();
    expect(planItemsFor("2026-10-09", [plan]).some((i) => i.kind === "deliverable")).toBe(false);
    expect(planItemsFor("2026-10-30", [plan]).find((i) => i.kind === "deliverable")).toMatchObject({ title: "API de inventario" });
    for (const t of plan.subplans[0]!.topics) t.completedAt = "2026-10-05";
    expect(planItemsFor("2026-10-09", [plan]).map((i) => i.kind)).toEqual(["deliverable"]);
    plan.subplans[0]!.deliverable!.status = "hecho";
    expect(planItemsFor("2026-10-09", [plan])).toEqual([]);
  });
});

describe("PlanStore / sanitizePlan", () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "nv_plan_"));
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it("guarda y carga en .notevault/mentor/plans/<mes>.json y lista los meses", () => {
    const st = new PlanStore(dir);
    expect(st.months()).toEqual([]);
    const plan = buildPlan([{ area: "A", objective: "o", topics: [T(1)] }], { month: "2026-10", hoursPerWeek: 3 }).plan;
    st.save(plan);
    st.save({ ...plan, month: "2026-11" });
    expect(fs.existsSync(path.join(dir, ".notevault", "mentor", "plans", "2026-10.json"))).toBe(true);
    expect(st.months()).toEqual(["2026-11", "2026-10"]);
    expect(st.load("2026-10")!.subplans[0]!.topics[0]!.folder).toBe("P/T1");
    expect(st.load("nope")).toBeNull();
    expect(() => st.save({ ...plan, month: "oct" })).toThrow();
  });

  it("sanea un archivo corrupto o editado a mano sin romperse", () => {
    expect(sanitizePlan(null)).toBeNull();
    expect(sanitizePlan({ month: "x" })).toBeNull();
    const p = sanitizePlan({
      month: "2026-10",
      subplans: [{ id: "a b", area: "", topics: [{ folder: "P\\T1", targetWeek: 99, estMinutes: "30", completedAt: "ayer" }, {}], deliverable: { title: "X", status: "raro" } }, 7],
    })!;
    expect(p.subplans).toHaveLength(1);
    expect(p.subplans[0]).toMatchObject({ id: "s1", area: "General" });
    expect(p.subplans[0]!.topics).toEqual([{ folder: "P/T1", title: "T1", targetWeek: 5, estMinutes: 30 }]);
    expect(p.subplans[0]!.deliverable!.status).toBe("idea");
  });
});
