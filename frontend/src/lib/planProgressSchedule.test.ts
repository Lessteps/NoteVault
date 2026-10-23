// Reparto POR AVANCE: el mentor no puede hacer estudiar temas de más adelante si los primeros de la ruta no se han terminado. La agenda es una
// función pura de (ruta del plan, avance real por tema, hoy): lo hecho se queda donde se hizo y lo que falta se coloca desde hoy en el orden de
// la ruta de cada área; nada se «atrasa» por haber pasado los días, y la Agenda y la Ejecución muestran los mismos temas.

import { describe, expect, it } from "vitest";
import { areaSets, executionLists } from "./planAreaLists";
import { catchUpOf } from "./planCatchUp";
import { buildSchedule, progressPlan, type PlanSchedule, type SchedulePlan, type ScheduleTopic } from "./planSchedule";
import { basesClassifier, dayByArea, topicsByWeekArea } from "./planTopicsByArea";

const START = "2026-10-06";
const END = "2027-04-05";
const TODAY = "2026-10-23";
const BASES = { id: "bases", title: "Bases", kind: "bases" as const, order: 0 };
const PY = { id: "lang-python", title: "Lenguaje: Python", kind: "language" as const, order: 10 };
const JS = { id: "lang-js", title: "Lenguaje: JavaScript", kind: "language" as const, order: 11 };
const CORE = { id: "core", title: "Conocimientos", kind: "knowledge" as const, order: 100 };
const mk = (prefix: string, n: number, group: string, est = 60): ScheduleTopic[] =>
  Array.from({ length: n }, (_, i) => ({ folder: `${prefix}/${String(i + 1).padStart(2, "0")}`, title: `${prefix} ${i + 1}`, estMinutes: est, targetWeek: 1 + Math.floor(i / 3), group }));

function plan(over: Partial<SchedulePlan> = {}, o: { n?: number } = {}): SchedulePlan {
  const n = o.n ?? 24;
  return {
    id: "p",
    start: START,
    end: END,
    structure: "areas",
    areaMode: "together",
    preconditions: { minutesPerDay: 300, studyDays: [1, 2, 3, 4, 5], pace: "intenso" },
    subplans: [
      { id: "s-be", areaId: "backend", area: "Backend", objective: "", groups: [BASES, PY, CORE], phase: { fromWeek: 1, toWeek: 12 }, topics: [...mk("F", 4, "bases"), ...mk("PY", Math.round(n / 2), "lang-python"), ...mk("BE", n, "core")] },
      { id: "s-fe", areaId: "frontend", area: "Frontend", objective: "", groups: [JS, CORE], phase: { fromWeek: 1, toWeek: 12 }, topics: [...mk("JS", Math.round(n / 2), "lang-js"), ...mk("FE", n, "core")] },
    ],
    ...over,
  };
}

const withDone = (p: SchedulePlan, done: readonly string[], date = "2026-10-20"): SchedulePlan => ({ ...p, subplans: p.subplans.map((s) => ({ ...s, topics: s.topics.map((t) => (done.includes(t.folder) ? { ...t, completedAt: date } : t)) })) });
const schedule = (p: SchedulePlan, today = TODAY): PlanSchedule => buildSchedule(progressPlan(p, { today }));
const pendingOn = (s: PlanSchedule, date: string, sub: string, prefix: string): string[] =>
  [...new Set((s.byDate.get(date)?.topics ?? []).filter((t) => !t.done && t.subplanId === sub && t.folder.startsWith(`${prefix}/`)).map((t) => t.folder))];
const route = (p: SchedulePlan, sub: string, prefix: string): string[] => p.subplans.find((s) => s.id === sub)!.topics.filter((t) => t.folder.startsWith(`${prefix}/`) && !t.completedAt).map((t) => t.folder);
const isPrefix = (xs: readonly string[], of: readonly string[]): boolean => xs.every((x, i) => of[i] === x);

describe("reparto por avance: hoy es lo primero que falta de la ruta", () => {
  it("causa raíz: por calendario, a los 17 días del plan sin haber hecho nada, hoy tocan temas de más adelante en la ruta", () => {
    const cal = buildSchedule(plan());
    const today = pendingOn(cal, TODAY, "s-be", "BE");
    expect(today.length).toBeGreaterThan(0);
    expect(isPrefix(today, route(plan(), "s-be", "BE"))).toBe(false);
  });

  it("sin nada hecho (6 oct – 5 abr, hoy 23 oct): los temas de hoy de cada carril de cada área son los primeros de su ruta, en orden", () => {
    const p = plan();
    const s = schedule(p);
    for (const [sub, prefix] of [["s-be", "BE"], ["s-be", "PY"], ["s-fe", "FE"], ["s-fe", "JS"]] as const) {
      const today = pendingOn(s, TODAY, sub, prefix);
      expect(today.length, `${sub} ${prefix}`).toBeGreaterThan(0);
      expect(isPrefix(today, route(p, sub, prefix)), `${sub} ${prefix}: ${today.join(",")}`).toBe(true);
    }
    // nada pendiente en los días anteriores: no hay «atrasados»
    for (const d of s.days) if (d.date < TODAY) expect(d.topics.filter((t) => !t.done)).toEqual([]);
  });

  it("al completar los dos primeros temas de Backend, en la siguiente carga entran los siguientes de la ruta; lo hecho no vuelve a salir pendiente", () => {
    const p = plan();
    const first = pendingOn(schedule(p), TODAY, "s-be", "BE");
    const done = first.slice(0, 2);
    const p2 = withDone(p, done);
    const s2 = schedule(p2);
    const next = pendingOn(s2, TODAY, "s-be", "BE");
    expect(isPrefix(next, route(p2, "s-be", "BE"))).toBe(true);
    expect(next.some((f) => done.includes(f))).toBe(false);
    expect(next.length).toBeGreaterThan(0);
    for (const d of s2.days) for (const t of d.topics) if (done.includes(t.folder)) expect(t.done, `${t.folder} el ${d.date}`).toBe(true);
    // lo hecho se queda en el día en que se hizo
    expect(s2.byDate.get("2026-10-20")!.topics.filter((t) => t.done).map((t) => t.folder).sort()).toEqual([...done].sort());
    // lo mismo con el avance real (live) sin `completedAt` en el plan
    const live = buildSchedule(progressPlan(p, { today: TODAY, isDone: (f) => done.includes(f) }));
    expect(pendingOn(live, TODAY, "s-be", "BE")).toEqual(next);
  });

  it("un tema posterior de un carril nunca se coloca antes que uno anterior sin terminar (en todo el plan, con cualquier avance)", () => {
    for (const doneN of [0, 3, 9]) {
      const base = plan();
      const done = route(base, "s-be", "BE").slice(0, doneN);
      const p = withDone(base, done);
      const s = schedule(p, "2026-11-04");
      for (const [sub, prefix] of [["s-be", "BE"], ["s-be", "PY"], ["s-fe", "FE"], ["s-fe", "JS"]] as const) {
        const first = new Map<string, string>();
        for (const d of s.days) for (const t of d.topics) if (!t.done && t.folder.startsWith(`${prefix}/`) && t.subplanId === sub && !first.has(t.folder)) first.set(t.folder, d.date);
        const order = route(p, sub, prefix);
        const dates = order.map((f) => first.get(f)).filter((x): x is string => !!x);
        expect(dates, `${sub} ${prefix} done=${doneN}`).toEqual([...dates].sort());
        expect(dates.length).toBe(order.length); // no se pierde ningún tema
      }
    }
  });

  it("es determinista: la misma ruta, avance y día dan la misma agenda; y antes de empezar el plan (o el primer día) coincide con el calendario", () => {
    const p = plan();
    expect(schedule(p).days).toEqual(schedule(p).days);
    expect(schedule(p, START).days).toEqual(buildSchedule(p).days);
    expect(schedule(p, "2026-09-01").days).toEqual(buildSchedule(p).days);
  });
});

describe("Agenda y Ejecución muestran lo mismo", () => {
  it("hoy, la semana y la ruta salen del mismo reparto: los temas de hoy de Backend son iguales en los selectores de la Agenda y de la Ejecución", () => {
    const p = plan();
    const s = schedule(p);
    const data = topicsByWeekArea(p, s);
    const day = s.byDate.get(TODAY)!;
    const isBases = basesClassifier(p);
    for (const sub of ["s-be", "s-fe"]) {
      const agenda = new Set(dayByArea(p, day).find((e) => e.subplanId === sub)!.blocks!.flatMap((b) => b.items.map((i) => i.folder)));
      const sets = areaSets(s.days, sub, TODAY, day.week, true, (t) => !isBases(t));
      const lists = executionLists(
        [...new Set(s.days.flatMap((d) => d.topics.filter((t) => t.subplanId === sub && !isBases(t)).map((t) => t.folder)))].map((folder) => ({ folder, done: false })),
        [...agenda].map((folder) => ({ folder, done: false })),
        sets,
      );
      expect(new Set(lists.hoy.map((r) => r.folder))).toEqual(new Set([...sets.today].filter((f) => agenda.has(f))));
      expect(agenda.size).toBeGreaterThan(0);
      for (const f of agenda) expect(sets.today.has(f)).toBe(true);
      expect(lists.pendientes).toEqual([]); // nada atrasado
      // Semana: los temas del área de la semana en curso son los de la Agenda (Semana)
      const cell = data.weeks[day.week - 1]!.cells.find((c) => c.subplanId === sub)!;
      expect(new Set(cell.topics.map((t) => t.folder))).toEqual(new Set([...sets.week].filter((f) => cell.topics.some((t) => t.folder === f))));
      for (const f of sets.week) expect(cell.topics.some((t) => t.folder === f)).toBe(true);
    }
  });
});

describe("la fecha de fin se mantiene", () => {
  it("si lo que falta no cabe antes del fin, se mantiene el orden, se amontona lo que sobra en el último día (desbordado) y el aviso de constancia dice el ritmo", () => {
    const p = plan({ end: "2026-11-13" }, { n: 40 });
    const s = schedule(p);
    const lastStudy = [...s.days].reverse().find((d) => d.study)!.date;
    const all = new Set<string>();
    for (const d of s.days) for (const t of d.topics) if (!t.done) all.add(t.folder);
    for (const sp of p.subplans) for (const t of sp.topics) expect(all.has(t.folder), t.folder).toBe(true); // ninguno se pierde
    const over = s.days.flatMap((d) => d.topics.filter((t) => t.overflow));
    expect(over.length).toBeGreaterThan(0);
    expect(over.every((t) => t.parts >= 1 && s.byDate.get(lastStudy)!.topics.includes(t))).toBe(true);
    // el orden de la ruta se respeta también con el desborde
    const first = new Map<string, string>();
    for (const d of s.days) for (const t of d.topics) if (t.folder.startsWith("BE/") && !first.has(t.folder)) first.set(t.folder, d.date);
    const dates = route(p, "s-be", "BE").map((f) => first.get(f)!);
    expect(dates).toEqual([...dates].sort());
    const cu = catchUpOf(s.days.map((d) => ({ date: d.date, study: d.study, topics: d.topics.map((t) => ({ folder: t.folder, title: t.title, minutes: t.minutes, done: t.done, area: t.area })) })), TODAY, p.end);
    expect(cu.late).toEqual([]);
    expect(cu.remaining).toBe(all.size);
    expect(cu.perDay).toBeGreaterThan(0);
    expect(cu.daysLeft).toBeGreaterThan(0);
  });
});
