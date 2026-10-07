import { describe, expect, it } from "vitest";
import { basesWarning, groupSummaries, phasesByMonth, weekMonths, weeksText } from "./planMonths";

const topic = (i: number, week: number, group: string, over: Record<string, unknown> = {}) => ({ folder: `P/${group}/T${i}`, title: `${group} ${i}`, targetWeek: week, estMinutes: 60, group, ...over });
const GROUPS = [
  { id: "bases", title: "Bases", kind: "bases" as const, order: 0 },
  { id: "lang-python", title: "Lenguaje: Python", kind: "language" as const, order: 10 },
  { id: "core", title: "Conocimientos", kind: "knowledge" as const, order: 100 },
];
// 2026-10-06 (martes) → 2026-12-06: 9 semanas
const plan = {
  start: "2026-10-06",
  end: "2026-12-06",
  subplans: [
    { id: "s1", area: "Backend", areaId: "backend", phase: { fromWeek: 1, toWeek: 9 }, groups: GROUPS, topics: [topic(1, 1, "bases"), topic(2, 2, "bases"), topic(3, 4, "lang-python"), topic(4, 9, "core", { completedAt: "2026-11-30" })] },
    { id: "s2", area: "Databases", areaId: "databases", phase: { fromWeek: 5, toWeek: 9 }, groups: [GROUPS[2]!], topics: [topic(5, 6, "core")] },
  ],
};

describe("phasesByMonth", () => {
  it("cada semana cae en un solo mes (el de su día central) y los meses parciales cuentan", () => {
    const wm = weekMonths(plan.start, plan.end);
    expect(wm.get(1)).toBe("2026-10");
    expect(wm.get(4)).toBe("2026-10");
    expect(wm.get(9)).toBe("2026-12");
    const m = phasesByMonth(plan);
    expect(m.months.map((x) => x.key)).toEqual(["2026-10", "2026-11", "2026-12"]);
    expect(m.months[0]!.start).toBe("2026-10-06");
    expect(m.months.flatMap((x) => x.weeks).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it("áreas en paralelo: temas, horas, semanas activas y grupos por celda; vacías marcadas", () => {
    const m = phasesByMonth(plan);
    const be = m.rows[0]!;
    expect(be.cells[0]).toMatchObject({ topics: 3, minutes: 180, empty: false });
    expect(be.cells[0]!.groups).toEqual([{ id: "bases", title: "Bases", count: 2 }, { id: "lang-python", title: "Lenguaje: Python", count: 1 }]);
    expect(be.cells[1]!.topics).toBe(0);
    expect(be.cells[1]!.empty).toBe(false); // activa (fase) aunque sin temas nuevos
    const db = m.rows[1]!;
    expect(db.cells[0]!.empty).toBe(true); // Databases arranca en la semana 5
    expect(db.cells[1]!.weeks.length).toBeGreaterThan(0);
    expect(db.cells[1]!.topics).toBe(1);
  });

  it("totales por mes (temas, horas, hechos, entregables, áreas) y mes actual", () => {
    const m = phasesByMonth(plan, { today: "2026-11-10", deliverables: [{ dueDate: "2026-11-20" }, { dueDate: "2026-12-01" }], done: (f) => f === "P/bases/T1" });
    expect(m.current).toBe("2026-11");
    expect(m.months.map((x) => x.current)).toEqual([false, true, false]);
    expect(m.totals.map((t) => t.topics)).toEqual([3, 1, 1]);
    expect(m.totals.reduce((n, t) => n + t.minutes, 0)).toBe(300);
    expect(m.totals.reduce((n, t) => n + t.done, 0)).toBe(2);
    expect(m.totals.map((t) => t.deliverables)).toEqual([0, 1, 1]);
    expect(phasesByMonth(plan, { today: "2030-01-01" }).current).toBeNull();
    expect(phasesByMonth(plan).totals[0]!.deliverables).toBeNull();
  });

  it("weeksText agrupa rangos", () => {
    expect(weeksText([1, 2, 3, 4])).toBe("1–4");
    expect(weeksText([5, 1, 2, 7])).toBe("1–2, 5, 7");
  });
});

describe("groupSummaries y aviso de Bases", () => {
  it("resume cada grupo con temas, hechos, horas, semanas y meses", () => {
    const g = groupSummaries(plan, plan.subplans[0]!);
    expect(g.map((x) => [x.id, x.total, x.done, x.minutes, x.fromWeek, x.toWeek])).toEqual([["bases", 2, 0, 120, 1, 2], ["lang-python", 1, 0, 60, 4, 4], ["core", 1, 1, 60, 9, 9]]);
    expect(g[2]!.months).toEqual(["2026-12"]);
  });

  it("avisa si Bases tiene muchos temas o acapara el arranque; no avisa si es corto", () => {
    const many = { ...plan.subplans[0]!, topics: Array.from({ length: 75 }, (_, i) => topic(i, 1 + Math.floor(i / 5), "bases")) };
    const w = basesWarning(many)!;
    expect(w.count).toBe(75);
    expect(w.text).toContain("75 temas");
    expect(w.request).toBe("Reduce Bases a lo esencial y aplícalas junto al lenguaje");
    expect(basesWarning(plan.subplans[0]!)).toBeNull();
    const hog = { ...plan.subplans[0]!, topics: [...Array.from({ length: 14 }, (_, i) => topic(i, 1 + Math.floor(i / 3), "bases")), topic(99, 9, "core")] };
    expect(basesWarning(hog)).not.toBeNull();
  });
});
