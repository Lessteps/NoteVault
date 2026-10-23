// Estructura del plan POR ÁREA: todas las áreas desde el día 1 (Tooling incluida; Automation siempre al final y el resto sigue como
// mantenimiento), temas por semana separados por área (`topicsByWeekArea`), día por área (`dayByArea`), entregables «por definir»
// (`deliverablesDefined`) y la vista previa de «Poner todas las áreas desde el día 1».

import { describe, expect, it } from "vitest";
import { AUTOMATION_TAIL_MAX, AUTOMATION_TAIL_MIN, planTogetherPhases, resolveAreaMode } from "./planAreas";
import { buildSchedule, type SchedulePlan, type ScheduleTopic } from "./planSchedule";
import {
  AREA_DISPLAY_ORDER,
  areaWeeksOf,
  areaShort,
  dayAreasText,
  dayByArea,
  deliverablesDefined,
  offersTogether,
  orderedAreas,
  previewTogether,
  topicsByWeekArea,
  weeksRangeText,
} from "./planTopicsByArea";

const START = "2026-10-05"; // lunes
const END = "2027-01-03"; // 13 semanas
const BASES = { id: "bases", title: "Bases", kind: "bases" as const, order: 0 };
const PY = { id: "lang-python", title: "Lenguaje: Python", kind: "language" as const, order: 10 };
const CORE = { id: "core", title: "Conocimientos", kind: "knowledge" as const, order: 100 };
const mk = (prefix: string, n: number, group: string, week = 1): ScheduleTopic[] =>
  Array.from({ length: n }, (_, i) => ({ folder: `${prefix}/${i + 1}`, title: `${prefix} ${i + 1}`, estMinutes: 60, targetWeek: week, group }));

/** El plan real del usuario en pequeño: por fases, Backend+Databases primero, luego Frontend y al final Automation+Tooling. */
function phasedPlan(over: Partial<SchedulePlan> = {}): SchedulePlan {
  return {
    id: "p",
    start: START,
    end: END,
    structure: "areas",
    preconditions: { minutesPerDay: 300, studyDays: [1, 2, 3, 4, 5, 6], pace: "intenso" },
    subplans: [
      { id: "s-be", areaId: "backend", area: "Backend", objective: "", groups: [BASES, PY, CORE], phase: { fromWeek: 1, toWeek: 6 }, topics: [...mk("F", 6, "bases"), ...mk("PY", 4, "lang-python"), ...mk("BE", 10, "core")] },
      { id: "s-db", areaId: "databases", area: "Databases", objective: "", groups: [CORE], phase: { fromWeek: 1, toWeek: 6 }, topics: mk("DB", 8, "core") },
      { id: "s-fe", areaId: "frontend", area: "Frontend", objective: "", groups: [CORE], phase: { fromWeek: 7, toWeek: 10 }, topics: mk("FE", 8, "core", 7) },
      { id: "s-au", areaId: "automation", area: "Automation", objective: "", groups: [CORE], phase: { fromWeek: 11, toWeek: 13 }, topics: mk("AU", 5, "core", 11) },
      { id: "s-to", areaId: "tooling", area: "Tooling and Quality", objective: "", groups: [CORE], phase: { fromWeek: 11, toWeek: 13 }, topics: mk("TO", 5, "core", 11) },
    ],
    ...over,
  };
}
/** Lo mismo con las áreas juntas desde el día 1 y Automation al final (lo que dejaría «Poner todas las áreas desde el día 1»). */
function togetherPlan(): SchedulePlan {
  const p = phasedPlan({ areaMode: "together", preconditions: { minutesPerDay: 300, studyDays: [1, 2, 3, 4, 5, 6], pace: "intenso", areaMode: "together" } });
  const caps = Array.from({ length: 13 }, () => 100);
  const ph = planTogetherPhases(p.subplans.map((s) => ({ key: s.id, weight: s.topics.reduce((n, t) => n + t.estMinutes, 0), areaId: s.areaId })), caps);
  return {
    ...p,
    subplans: p.subplans.map((s) => ({
      ...s,
      phase: ph[s.id]!,
      topics: s.topics.map((t, i, all) => ({ ...t, targetWeek: Math.max(ph[s.id]!.fromWeek, Math.min(ph[s.id]!.toWeek, ph[s.id]!.fromWeek + Math.floor((i / all.length) * (ph[s.id]!.toWeek - ph[s.id]!.fromWeek + 1)))) })),
    })),
  };
}

describe("modo «juntas»: todas las áreas desde el día 1, Automation al final", () => {
  const caps = Array.from({ length: 26 }, () => 100);
  const input = [
    { key: "be", weight: 16830, areaId: "backend" },
    { key: "db", weight: 2430, areaId: "databases" },
    { key: "fe", weight: 7460, areaId: "frontend" },
    { key: "to", weight: 2230, areaId: "tooling" },
    { key: "au", weight: 2040, areaId: "automation" },
  ];

  it("Backend, Databases, Frontend y Tooling empiezan en la semana 1; solo Automation empieza tarde y termina el último día", () => {
    const ph = planTogetherPhases(input, caps);
    for (const k of ["be", "db", "fe", "to"]) expect(ph[k]!.fromWeek).toBe(1);
    expect(ph.au!.fromWeek).toBeGreaterThan(1);
    expect(ph.au!.toWeek).toBe(26);
    expect(ph.be!.toWeek).toBe(ph.au!.fromWeek - 1);
  });

  it("Automation ocupa al menos el ~15 % final del periodo (y nunca más del 35 %)", () => {
    const ph = planTogetherPhases(input, caps);
    const share = (26 - ph.au!.fromWeek + 1) / 26;
    expect(share).toBeGreaterThanOrEqual(AUTOMATION_TAIL_MIN - 0.04);
    expect(share).toBeLessThanOrEqual(AUTOMATION_TAIL_MAX + 0.04);
    // con mucho peso de Automation se respeta su peso natural hasta el máximo
    const heavy = planTogetherPhases([{ key: "be", weight: 100, areaId: "backend" }, { key: "au", weight: 900, areaId: "automation" }], caps);
    expect((26 - heavy.au!.fromWeek + 1) / 26).toBeLessThanOrEqual(AUTOMATION_TAIL_MAX + 0.04);
  });

  it("sin Automation (o con una sola semana) todas ocupan el periodo entero", () => {
    const ph = planTogetherPhases(input.filter((a) => a.key !== "au"), caps);
    expect(Object.values(ph).every((p) => p.fromWeek === 1 && p.toWeek === 26)).toBe(true);
    expect(planTogetherPhases(input, [100])["au"]).toEqual({ fromWeek: 1, toWeek: 1 });
  });

  it("cuando empieza Automation el resto sigue en el día como repaso y práctica de mantenimiento (no desaparece)", () => {
    const s = buildSchedule(togetherPlan());
    const last = s.days.filter((d) => d.week === 13 && d.study);
    expect(last.length).toBeGreaterThan(3);
    for (const d of last) {
      const ids = (d.blocks ?? []).filter((b) => b.status !== "omitted").map((b) => b.areaId);
      expect(ids).toContain("automation");
      expect(ids).toEqual(expect.arrayContaining(["backend", "frontend", "tooling"]));
    }
    const maint = last[0]!.blocks!.filter((b) => b.areaId === "backend" && b.status === "review");
    expect(maint.length).toBeGreaterThan(0);
    // y en la semana 1 Tooling ya está presente (día 1)
    const first = s.days.find((d) => d.study)!;
    expect((first.blocks ?? []).some((b) => b.areaId === "tooling" && b.status !== "omitted")).toBe(true);
    expect((first.blocks ?? []).some((b) => b.areaId === "automation" && b.status === "topic")).toBe(false);
    // Frontend está en el DÍA 1 con teoría y práctica (UI y componentes) de temas reales de Frontend
    const fe = (first.blocks ?? []).filter((b) => b.areaId === "frontend" && b.status === "topic");
    expect(fe.filter((b) => b.kind === "theory")).toHaveLength(1);
    expect(fe.some((b) => b.kind === "practice" && b.practice === "ui")).toBe(true);
    expect(fe.filter((b) => b.kind === "theory").every((b) => b.items.length > 0 && b.items.every((i) => i.folder.startsWith("FE/")))).toBe(true);
    expect(first.focus!.line).toContain("teoría de frontend");
  });
});

describe("modo por defecto", () => {
  it("sin elección y con 2 o más áreas es «juntas desde el día 1»; con una sola, el plan no declara modo", () => {
    expect(resolveAreaMode(undefined, ["backend", "frontend", "automation"])).toMatchObject({ mode: "together", by: "rules" });
    expect(resolveAreaMode(undefined, ["backend", "frontend", "automation"])!.why).toContain("Automation va siempre al final");
    expect(resolveAreaMode(undefined, ["backend"])).toBeUndefined();
    // «ai» y «phased» siguen disponibles; un plan que ya declara su modo lo conserva al recalcularse
    expect(resolveAreaMode("phased", ["backend", "frontend"])!.mode).toBe("phased");
    expect(resolveAreaMode(undefined, ["backend", "frontend"], { mode: "phased", why: "fases", by: "user" })).toMatchObject({ mode: "phased", by: "user" });
  });
});

describe("orden fijo de las áreas", () => {
  it("Backend · Frontend · Databases · Tooling and Quality · Automation, aunque el plan las guarde en otro orden", () => {
    expect(AREA_DISPLAY_ORDER.slice(0, 6)).toEqual(["backend", "frontend", "databases", "logic", "tooling", "automation"]);
    const p = phasedPlan();
    expect(p.subplans.map((s) => s.areaId)).toEqual(["backend", "databases", "frontend", "automation", "tooling"]);
    expect(orderedAreas(p).map((a) => a.areaId)).toEqual(["backend", "frontend", "databases", "tooling", "automation"]);
    expect(areaShort("databases", "Databases")).toBe("BD");
    expect(areaShort(undefined, "Cálculo diferencial")).toBe("Cálcu");
  });
});

describe("topicsByWeekArea", () => {
  const p = togetherPlan();
  const sch = buildSchedule(p);
  const data = topicsByWeekArea(p, sch);

  it("una celda por área (orden fijo) en cada semana, y cada tema pendiente cae en la celda de SU área", () => {
    expect(data.weeks).toHaveLength(13);
    for (const w of data.weeks) expect(w.cells.map((c) => c.areaId)).toEqual(["backend", "frontend", "databases", "tooling", "automation"]);
    // los temas de Frontend no aparecen en ninguna otra área
    const feFolders = new Set(data.weeks.flatMap((w) => w.cells.filter((c) => c.areaId === "frontend").flatMap((c) => c.topics.map((t) => t.folder))));
    for (const w of data.weeks) for (const c of w.cells.filter((c) => c.areaId !== "frontend")) for (const t of c.topics) expect(feFolders.has(t.folder)).toBe(false);
  });

  it("con las áreas juntas, TODAS las áreas (Tooling incluida) tienen temas en las primeras semanas y Automation solo al final", () => {
    const firstWeeks = data.weeks.slice(0, 3);
    for (const id of ["backend", "frontend", "databases", "tooling"]) expect(firstWeeks.some((w) => w.cells.find((c) => c.areaId === id)!.topics.length > 0), id).toBe(true);
    const autoWeeks = data.weeks.filter((w) => w.cells.find((c) => c.areaId === "automation")!.topics.length > 0).map((w) => w.week);
    expect(Math.min(...autoWeeks)).toBeGreaterThan(8);
  });

  it("totales: la suma de las celdas es la de la semana y los totales por área cuentan los temas distintos y los minutos", () => {
    for (const w of data.weeks) {
      expect(w.topics).toBe(w.cells.reduce((n, c) => n + c.topics.length, 0));
      expect(w.minutes).toBe(w.cells.reduce((n, c) => n + c.minutes, 0));
      for (const c of w.cells) expect(c.minutes).toBe(c.topics.reduce((n, t) => n + t.minutes, 0));
    }
    const be = p.subplans.find((s) => s.areaId === "backend")!;
    // los fundamentos (Bases) no cuentan en el área: van a su propio cubo
    const own = be.topics.filter((t) => t.group !== "bases");
    expect(data.totals[be.id]!.topics).toBe(own.length);
    expect(data.totals[be.id]!.minutes).toBeGreaterThanOrEqual(own.length * 59);
    expect(data.basesTotal.topics).toBe(be.topics.length - own.length);
    expect(data.areas).toHaveLength(5);
  });

  it("cada tema lleva los días de la semana en que se trabaja (el día asignado de la Agenda), en orden", () => {
    const cell = data.weeks[0]!.cells.find((c) => c.areaId === "backend")!;
    expect(cell.topics.length).toBeGreaterThan(0);
    for (const t of cell.topics) {
      expect(t.dates.length).toBeGreaterThan(0);
      expect([...t.dates].sort()).toEqual(t.dates);
      for (const d of t.dates) {
        expect(d >= data.weeks[0]!.start && d <= data.weeks[0]!.end).toBe(true);
        expect(sch.byDate.get(d)!.topics.some((x) => x.folder === t.folder)).toBe(true);
      }
    }
  });

  it("en la última semana (Automation al final) las demás áreas no tienen temas nuevos pero aparecen como repaso de mantenimiento", () => {
    const last = data.weeks[12]!;
    const be = last.cells.find((c) => c.areaId === "backend")!;
    expect(be.topics).toHaveLength(0);
    expect(be.review).toBe(true);
    expect(last.cells.find((c) => c.areaId === "automation")!.topics.length).toBeGreaterThan(0);
    expect(data.weeks[0]!.cells.find((c) => c.areaId === "automation")!.review).toBe(false);
  });

  it("los temas hechos se marcan como tales y las áreas fuera de fase quedan sin temas", () => {
    const done = phasedPlan();
    const i = done.subplans[0]!.topics.findIndex((t) => t.group === "core");
    done.subplans[0]!.topics[i] = { ...done.subplans[0]!.topics[i]!, completedAt: "2026-10-06" };
    const d = topicsByWeekArea(done);
    expect(d.weeks[0]!.cells.find((c) => c.areaId === "backend")!.topics.some((t) => t.done)).toBe(true);
    const w1auto = d.weeks[0]!.cells.find((c) => c.areaId === "automation")!;
    expect(w1auto.topics).toHaveLength(0);
    expect(w1auto.active).toBe(false);
  });
});

describe("dayByArea", () => {
  it("separa el día por área en el orden fijo, con teoría, práctica y proyecto, y no incluye la práctica de lenguaje", () => {
    const p = togetherPlan();
    const sch = buildSchedule(p);
    const day = sch.days.find((d) => d.study && d.week === 2)!;
    const entries = dayByArea(p, day);
    expect(entries.map((e) => e.areaId)).toEqual(expect.arrayContaining(["backend", "frontend", "databases", "tooling"]));
    const order = entries.map((e) => AREA_DISPLAY_ORDER.indexOf(e.areaId!));
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    for (const e of entries) {
      expect(e.blocks!.every((b) => !b.daily)).toBe(true);
      expect(e.practiceBlocks).toBeGreaterThan(0);
    }
    const text = dayAreasText(entries);
    expect(text).toMatch(/^Backend \d+ temas? y práctica; Frontend/);
    expect(text).toContain("Databases");
    expect(text).toContain("Tooling and Quality");
  });
});

describe("deliverablesDefined (entregables «por definir» hasta que se definen)", () => {
  const base = { subplans: [{}, {}] };
  it("sin entregables manuales, de área, currículo ni ejecución están por definir", () => {
    expect(deliverablesDefined(base)).toBe(false);
    expect(deliverablesDefined({ ...base, deliverables: [] })).toBe(false);
  });
  it("manuales, de área, currículo o la marca de ejecución los dejan definidos", () => {
    expect(deliverablesDefined({ ...base, deliverables: [{ id: "x:1" }] })).toBe(true);
    expect(deliverablesDefined({ subplans: [{}, { deliverable: { title: "API" } }] })).toBe(true);
    expect(deliverablesDefined({ ...base, practiceCurriculum: { weeks: [] } })).toBe(true);
    expect(deliverablesDefined({ ...base, deliverablesDefinedAt: "2026-10-09T00:00:00Z" } as never)).toBe(true);
  });
});

describe("«Poner todas las áreas desde el día 1»: vista previa", () => {
  const p = phasedPlan();
  it("se ofrece solo a planes por áreas con 2 o más áreas que estudian por fases", () => {
    expect(offersTogether(p)).toBe(true);
    expect(offersTogether({ ...p, areaMode: "together" })).toBe(false);
    expect(offersTogether({ ...p, subplans: [p.subplans[0]!] })).toBe(false);
    const { structure: _s, ...legacy } = p;
    expect(offersTogether(legacy)).toBe(false);
  });

  it("antes: las semanas por fases de cada área; después: todas desde la 1 y Automation al final", () => {
    const before = areaWeeksOf(p);
    expect(before.map((r) => `${r.areaId}:${r.fromWeek}-${r.toWeek}`)).toEqual(["backend:1-6", "frontend:7-10", "databases:1-6", "tooling:11-13", "automation:11-13"]);
    const after = previewTogether(p);
    const get = (id: string) => after.find((r) => r.areaId === id)!;
    for (const id of ["backend", "frontend", "databases", "tooling"]) expect(get(id).fromWeek, id).toBe(1);
    expect(get("automation").fromWeek).toBeGreaterThan(1);
    expect(get("automation").toWeek).toBe(13);
    expect(after.map((r) => r.areaId)).toEqual(["backend", "frontend", "databases", "tooling", "automation"]);
    expect(weeksRangeText(get("automation"))).toMatch(/^semanas \d+–13$/);
    // Frontend (antes semanas 7–10) pasa a estar activo desde la semana 1 y hasta el final (repaso y mantenimiento tras sus temas nuevos)
    expect(before.find((r) => r.areaId === "frontend")).toMatchObject({ fromWeek: 7, toWeek: 10 });
    expect(get("frontend").fromWeek).toBe(1);
    expect(get("frontend").activeToWeek).toBe(13);
    expect(get("automation").activeToWeek).toBeUndefined();
    expect(weeksRangeText({ fromWeek: 5, toWeek: 5 })).toBe("semana 5");
  });
});
