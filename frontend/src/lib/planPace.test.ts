// Ritmo diario manual y extras del día: validación, reparto (legacy y por áreas) y compatibilidad con el reparto automático.

import { describe, expect, it } from "vitest";
import { catchUpOf } from "./planCatchUp";
import { paceFor, parsePace, sanitizeExtraPractice, sanitizeExtraTopics, sanitizePace } from "./planPace";
import { buildSchedule, progressPlan, type SchedulePlan, type ScheduleTopic } from "./planSchedule";
import { dayByArea } from "./planTopicsByArea";

const START = "2026-10-05"; // lunes
const END = "2026-10-30";
const mk = (prefix: string, n: number, extra: Partial<ScheduleTopic> = {}): ScheduleTopic[] =>
  Array.from({ length: n }, (_, i) => ({ folder: `${prefix}/${i + 1}`, title: `${prefix} ${i + 1}`, estMinutes: 40, targetWeek: 1, ...extra }));

function plan(over: Partial<SchedulePlan> = {}): SchedulePlan {
  return {
    id: "p",
    start: START,
    end: END,
    preconditions: { minutesPerDay: 200, studyDays: [1, 2, 3, 4, 5], pace: "intenso" },
    subplans: [
      { id: "s-a", area: "Alfa", objective: "", topics: mk("A", 12) },
      { id: "s-b", area: "Beta", objective: "", topics: mk("B", 12) },
    ],
    ...over,
  };
}
const areasPlan = (over: Partial<SchedulePlan> = {}): SchedulePlan =>
  plan({
    structure: "areas",
    subplans: [
      { id: "s-backend", areaId: "backend", area: "Backend", objective: "", groups: [{ id: "core", title: "Conocimientos", kind: "knowledge", order: 1 }], topics: mk("BE", 12, { group: "core" }) },
      { id: "s-frontend", areaId: "frontend", area: "Frontend", objective: "", groups: [{ id: "core", title: "Conocimientos", kind: "knowledge", order: 1 }], topics: mk("FE", 12, { group: "core" }) },
    ],
    ...over,
  });

const pending = (s: ReturnType<typeof buildSchedule>, sub: string) => s.days.flatMap((d) => d.topics.filter((t) => t.subplanId === sub && !t.done).map((t) => ({ date: d.date, folder: t.folder, overflow: !!t.overflow, extra: !!t.extra })));
const countOn = (s: ReturnType<typeof buildSchedule>, date: string, sub: string) => new Set(s.byDate.get(date)!.topics.filter((t) => t.subplanId === sub && !t.done).map((t) => t.folder)).size;

describe("validación del ritmo", () => {
  it("enteros 0..20, mínimo ≤ temas por día, áreas conocidas", () => {
    expect(parsePace({ perDay: 3, minPerDay: 2 })).toEqual({ perDay: 3, minPerDay: 2 });
    expect(parsePace({})).toBeUndefined();
    expect(parsePace({ perDay: 0, minPerDay: 0 })).toBeUndefined();
    expect(() => parsePace({ perDay: 21 })).toThrow(/entero de 0 a 20/);
    expect(() => parsePace({ perDay: 2.5 })).toThrow(/entero/);
    expect(() => parsePace({ minPerDay: -1 })).toThrow(/entero/);
    expect(() => parsePace({ perDay: 2, minPerDay: 3 })).toThrow(/no puede superar/);
    expect(() => parsePace({ areas: { x: { perDay: 2 } } }, ["s-a"])).toThrow(/ya no existe/);
    // el área se mezcla con el global: mínimo 4 del global con perDay 2 del área es inválido
    expect(() => parsePace({ minPerDay: 4, areas: { "s-a": { perDay: 2 } } }, ["s-a"])).toThrow(/no puede superar/);
  });

  it("el valor del área gana campo a campo; 0 en el área = automático", () => {
    const p = parsePace({ perDay: 3, minPerDay: 2, areas: { "s-a": { perDay: 5 }, "s-b": { perDay: 0, minPerDay: 0 } } }, ["s-a", "s-b", "s-c"])!;
    expect(paceFor(p, "s-a")).toEqual({ perDay: 5, minPerDay: 2 });
    expect(paceFor(p, "s-b")).toEqual({});
    expect(paceFor(p, "s-c")).toEqual({ perDay: 3, minPerDay: 2 });
    expect(paceFor(undefined, "s-a")).toEqual({});
  });

  it("la lectura tolerante acota en lugar de lanzar", () => {
    expect(sanitizePace({ perDay: 99, minPerDay: 50 })).toEqual({ perDay: 20, minPerDay: 20 });
    expect(sanitizePace("x")).toBeUndefined();
    expect(sanitizeExtraTopics([{ date: "2026-10-06", folder: "a/b/", source: "x" }, { date: "mal", folder: "c" }, { date: "2026-10-06", folder: "a/b" }])).toHaveLength(1);
    expect(sanitizeExtraPractice([{ date: "2026-10-06", title: "Kata", kind: "zz" }, { date: "2026-10-06", title: "" }])[0]).toMatchObject({ kind: "custom", title: "Kata" });
  });
});

describe("ritmo: reparto por temas (plan clásico)", () => {
  it("sin ritmo el reparto no cambia (mismo resultado que sin los campos)", () => {
    const base = buildSchedule(plan());
    const same = buildSchedule(plan({ extraTopics: [], extraPractice: [] }));
    expect(JSON.stringify(same.days)).toBe(JSON.stringify(base.days));
    expect(buildSchedule(plan({ pace: {} as never })).days).toEqual(base.days);
  });

  it("perDay=3: exactamente 3 temas por área cada día de estudio, en el orden de la ruta", () => {
    const s = buildSchedule(plan({ pace: { perDay: 3 } }));
    const a = pending(s, "s-a");
    expect(a.map((x) => x.folder)).toEqual(Array.from({ length: 12 }, (_, i) => `A/${i + 1}`));
    const studyDates = s.days.filter((d) => d.study).map((d) => d.date);
    studyDates.slice(0, 4).forEach((d) => {
      expect(countOn(s, d, "s-a")).toBe(3);
      expect(countOn(s, d, "s-b")).toBe(3);
    });
    expect(countOn(s, studyDates[4]!, "s-a")).toBe(0);
    // el día sigue a los temas: 3 + 3 temas de 40 min = 240 > capacidad de 200
    const day = s.byDate.get(studyDates[0]!)!;
    expect(day.topicMinutes).toBe(240);
    expect(day.capacityMinutes).toBeGreaterThanOrEqual(240);
    expect(day.paced).toBe(true);
    // el orden estricto: nunca un tema posterior antes de uno anterior sin terminar
    const days = a.map((x) => x.date);
    expect([...days].sort()).toEqual(days);
  });

  it("un área con su propio ritmo gana sobre el global y deja la otra en automático", () => {
    const s = buildSchedule(plan({ pace: { areas: { "s-a": { perDay: 2 } } } }));
    const d0 = s.days.find((d) => d.study)!.date;
    expect(countOn(s, d0, "s-a")).toBe(2);
    const auto = buildSchedule(plan());
    // el área en automático sigue repartiéndose por minutos (con la capacidad que libera la otra)
    expect([...new Set(pending(s, "s-b").map((x) => x.folder))]).toEqual([...new Set(pending(auto, "s-b").map((x) => x.folder))]);
  });

  it("solo mínimo: nunca menos del mínimo por día mientras queden temas", () => {
    const s = buildSchedule(plan({ pace: { minPerDay: 5 } }));
    const dates = s.days.filter((d) => d.study).map((d) => d.date);
    expect(countOn(s, dates[0]!, "s-a")).toBeGreaterThanOrEqual(5);
    expect(countOn(s, dates[1]!, "s-a")).toBeGreaterThanOrEqual(5);
    expect(pending(s, "s-a")).toHaveLength(12);
  });

  it("desbordamiento: si no cabe antes del fin se mantiene el orden y el resto se amontona en el último día (nada se pierde)", () => {
    const p = plan({ end: "2026-10-09", pace: { perDay: 2 } }); // 5 días de estudio × 2 = 10 de 12
    const s = buildSchedule(p);
    const a = pending(s, "s-a");
    expect(a).toHaveLength(12);
    expect(a.map((x) => x.folder)).toEqual(Array.from({ length: 12 }, (_, i) => `A/${i + 1}`));
    expect(a.filter((x) => x.overflow).map((x) => x.folder)).toEqual(["A/11", "A/12"]);
    expect(new Set(a.filter((x) => x.overflow).map((x) => x.date)).size).toBe(1);
    // el aviso de constancia dice el ritmo que hace falta
    const cu = catchUpOf(s.days.map((d) => ({ date: d.date, study: d.study, topics: d.topics.map((t) => ({ folder: t.folder, title: t.title, minutes: t.minutes, done: t.done, area: t.area })) })), p.start, p.end);
    expect(cu.remaining).toBe(24);
  });

  it("por avance: lo hecho se queda, lo pendiente empieza hoy y el ritmo cuenta desde hoy", () => {
    const base = plan({ pace: { perDay: 3 } });
    const today = "2026-10-14";
    const done = new Set(["A/1", "A/2", "A/3", "A/4"]);
    const s = buildSchedule(progressPlan(base, { today, isDone: (f) => done.has(f) }));
    const a = pending(s, "s-a");
    expect(a[0]).toMatchObject({ folder: "A/5", date: today });
    expect(countOn(s, today, "s-a")).toBe(3);
    expect(a.every((x) => x.date >= today)).toBe(true);
    expect(s.days.flatMap((d) => d.topics).filter((t) => t.done && t.subplanId === "s-a")).toHaveLength(4);
  });

  it("los temas completados no se vuelven a colocar", () => {
    const p = plan({ pace: { perDay: 3 }, subplans: [{ id: "s-a", area: "Alfa", objective: "", topics: mk("A", 6).map((t, i) => (i < 2 ? { ...t, completedAt: "2026-10-05" } : t)) }] });
    const s = buildSchedule(p);
    expect(pending(s, "s-a").map((x) => x.folder)).toEqual(["A/3", "A/4", "A/5", "A/6"]);
  });
});

describe("ritmo en planes por áreas (agenda por enfoque)", () => {
  it("las áreas con ritmo ponen sus temas en sus bloques del día y la Agenda los ve por área", () => {
    const p = areasPlan({ pace: { perDay: 3 } });
    const s = buildSchedule(p);
    const d0 = s.days.find((d) => d.study)!;
    expect(countOn(s, d0.date, "s-backend")).toBe(3);
    expect(countOn(s, d0.date, "s-frontend")).toBe(3);
    const byArea = dayByArea(p, d0);
    expect(byArea.find((a) => a.subplanId === "s-backend")!.topics).toBe(3);
    expect(byArea.find((a) => a.subplanId === "s-frontend")!.topics).toBe(3);
    // las vistas Agenda (dayByArea) y Ejecución (day.topics) coinciden
    const fromBlocks = new Set(byArea.flatMap((a) => (a.blocks ?? []).flatMap((b) => b.items.map((i) => i.folder))));
    const fromTopics = new Set(d0.topics.filter((t) => !t.done).map((t) => t.folder));
    expect(fromBlocks).toEqual(fromTopics);
  });

  it("orden estricto de la ruta en cada área", () => {
    const s = buildSchedule(areasPlan({ pace: { perDay: 4, areas: { "s-frontend": { perDay: 1 } } } }));
    const be = pending(s, "s-backend").map((x) => x.folder);
    expect(be).toEqual(Array.from({ length: 12 }, (_, i) => `BE/${i + 1}`));
    const fe = pending(s, "s-frontend");
    expect(fe.map((x) => x.folder)).toEqual(Array.from({ length: 12 }, (_, i) => `FE/${i + 1}`));
    expect(countOn(s, s.days.find((d) => d.study)!.date, "s-frontend")).toBe(1);
  });
});

describe("temas extra de un día", () => {
  const extra = (e: Partial<NonNullable<SchedulePlan["extraTopics"]>[number]>) => ({ date: "2026-10-06", folder: "A/9", addedAt: "2026-10-05T10:00:00Z", source: "manual" as const, ...e });

  it("un tema de la ruta más adelante aparece en la fecha, cuenta en los totales y no se duplica después", () => {
    const base = buildSchedule(plan());
    const s = buildSchedule(plan({ extraTopics: [extra({})] }));
    const occurrences = s.days.flatMap((d) => d.topics.filter((t) => t.folder === "A/9").map((t) => ({ date: d.date, extra: !!t.extra })));
    expect(occurrences).toEqual([{ date: "2026-10-06", extra: true }]);
    const day = s.byDate.get("2026-10-06")!;
    expect(day.topics.find((t) => t.folder === "A/9")).toMatchObject({ extra: true, subplanId: "s-a", position: 9, total: 12, done: false });
    const withMin = day.topics.filter((t) => !t.done).reduce((n, t) => n + t.minutes, 0);
    expect(day.topicMinutes).toBe(withMin);
    // el resto conserva su orden estricto
    const rest = pending(s, "s-a").filter((x) => !x.extra).map((x) => x.folder);
    expect(rest).toEqual(Array.from({ length: 12 }, (_, i) => `A/${i + 1}`).filter((f) => f !== "A/9"));
    expect(new Set(pending(base, "s-a").map((x) => x.folder)).size).toBe(12);
  });

  it("un tema de la vault fuera del plan va al cubo «Extra» con su etiqueta", () => {
    const p = areasPlan({ extraTopics: [extra({ folder: "Vault/Rust/Ownership", title: "Ownership", estMinutes: 50 })] });
    const s = buildSchedule(p);
    const day = s.byDate.get("2026-10-06")!;
    const t = day.topics.find((x) => x.folder === "Vault/Rust/Ownership")!;
    expect(t).toMatchObject({ subplanId: "extra", area: "Extra", extra: true, minutes: 50 });
    const entry = dayByArea(p, day).find((a) => a.subplanId === "extra")!;
    expect(entry).toMatchObject({ area: "Extra", topics: 1 });
    expect(day.topicMinutes).toBeGreaterThanOrEqual(50);
  });

  it("un tema de la vault puede atribuirse a un área del plan", () => {
    const s = buildSchedule(plan({ extraTopics: [extra({ folder: "Vault/X/Y", area: "s-b" })] }));
    expect(s.byDate.get("2026-10-06")!.topics.find((t) => t.folder === "Vault/X/Y")).toMatchObject({ subplanId: "s-b", extra: true });
  });

  it("en un plan por áreas el tema extra de la ruta entra en el bloque de su área y sale de la cola", () => {
    const p = areasPlan({ extraTopics: [extra({ folder: "BE/10" })] });
    const s = buildSchedule(p);
    const day = s.byDate.get("2026-10-06")!;
    expect(dayByArea(p, day).find((a) => a.subplanId === "s-backend")!.blocks!.flatMap((b) => b.items).some((i) => i.folder === "BE/10" && i.extra)).toBe(true);
    expect(pending(s, "s-backend").filter((x) => x.folder === "BE/10")).toHaveLength(1);
  });

  it("un tema completado no se duplica: solo se marca en su día", () => {
    const done = plan({ subplans: [{ id: "s-a", area: "Alfa", objective: "", topics: mk("A", 4).map((t) => (t.folder === "A/1" ? { ...t, completedAt: "2026-10-07" } : t)) }], extraTopics: [extra({ folder: "A/1", date: "2026-10-07" }), extra({ folder: "A/1", date: "2026-10-08" })] });
    const s = buildSchedule(done);
    const hits = s.days.flatMap((d) => d.topics.filter((t) => t.folder === "A/1").map((t) => ({ d: d.date, extra: !!t.extra, done: t.done })));
    expect(hits).toEqual([{ d: "2026-10-07", extra: true, done: true }]);
  });

  it("combina con el ritmo: el extra de la ruta sale de la cola del ritmo", () => {
    const s = buildSchedule(plan({ pace: { perDay: 3 }, extraTopics: [extra({ folder: "A/2" })] }));
    const hits = pending(s, "s-a").filter((x) => x.folder === "A/2");
    expect(hits).toEqual([{ date: "2026-10-06", folder: "A/2", overflow: false, extra: true }]);
    expect(pending(s, "s-a")).toHaveLength(12);
  });
});

describe("práctica extra del día", () => {
  it("se añade a la práctica del día y a sus minutos", () => {
    const base = buildSchedule(plan());
    const s = buildSchedule(plan({ extraPractice: [{ id: "xp-1", date: "2026-10-06", title: "Repasar SQL", kind: "custom", minutes: 25 }, { id: "xp-2", date: "2026-10-06", title: "Kata de listas", kind: "kata" }] }));
    const day = s.byDate.get("2026-10-06")!;
    expect(day.practice.extra?.map((x) => x.title)).toEqual(["Repasar SQL", "Kata de listas"]);
    expect(day.practiceMinutes).toBe(base.byDate.get("2026-10-06")!.practiceMinutes + 25 + 15);
  });
});
