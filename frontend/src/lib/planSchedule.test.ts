// Agenda del plan: asignación DIARIA determinista (días de estudio, bloqueados, minutos, semana parcial, temas de varios días, práctica reservada,
// temas fijados), propósito por plantillas, entregables por día/semana/mes y navegación por periodos.

import { describe, expect, it } from "vitest";
import { buildPracticeTrack } from "./practiceTrack";
import {
  buildSchedule,
  canShift,
  clampToPlan,
  dayPurpose,
  deliverablesBetween,
  deliverablesOf,
  deliverablesText,
  monthSummary,
  periodTitle,
  planMonths,
  shiftAnchor,
  topicsText,
  weekSummary,
  type SchedulePlan,
  type ScheduleTopic,
} from "./planSchedule";

const START = "2026-10-05"; // lunes
const topic = (n: number, week: number, est: number, extra: Partial<ScheduleTopic> = {}): ScheduleTopic => ({ folder: `A/T${n}`, title: `Tema ${n}`, estMinutes: est, targetWeek: week, ...extra });
const area = (id: string, name: string, topics: ScheduleTopic[], extra: Record<string, unknown> = {}) => ({ id: `s-${id}`, areaId: id, area: name, objective: `Objetivo de ${name}`, topics, ...extra });
const plan = (over: Partial<SchedulePlan> = {}): SchedulePlan => ({
  id: "p1",
  start: START,
  end: "2026-10-25",
  preconditions: { minutesPerDay: 120, studyDays: [1, 2, 3, 4, 5], pace: "intenso" },
  subplans: [area("backend", "Backend", [topic(1, 1, 60), topic(2, 1, 60), topic(3, 2, 60), topic(4, 3, 60)])],
  ...over,
});
const placed = (s: ReturnType<typeof buildSchedule>) => s.days.flatMap((d) => d.topics.filter((t) => !t.done).map((t) => ({ date: d.date, ...t })));

describe("asignación diaria: días de estudio, bloqueados y minutos", () => {
  it("solo se estudia en los días de estudio no bloqueados; fines de semana y fechas bloqueadas quedan sin temas", () => {
    const s = buildSchedule(plan({ preconditions: { minutesPerDay: 120, studyDays: [1, 2, 3, 4, 5], pace: "intenso", blockedDates: ["2026-10-07"] } }));
    expect(s.byDate.get("2026-10-10")!.study).toBe(false); // sábado
    expect(s.byDate.get("2026-10-07")).toMatchObject({ study: false, blocked: true, capacityMinutes: 0 });
    for (const t of placed(s)) {
      expect(s.byDate.get(t.date)!.study, t.date).toBe(true);
      expect(t.date).not.toBe("2026-10-07");
    }
    expect(placed(s).length).toBeGreaterThanOrEqual(4);
  });

  it("nunca se pasa de los minutos del día (tiempo × ritmo) y todo lo que cabe queda asignado", () => {
    const p = plan({ preconditions: { minutesPerDay: 100, studyDays: [1, 2, 3, 4, 5], pace: "normal" }, subplans: [area("backend", "Backend", Array.from({ length: 8 }, (_, i) => topic(i + 1, 1 + Math.floor(i / 4), 70)))] });
    const s = buildSchedule(p);
    for (const d of s.days) expect(d.topicMinutes, d.date).toBeLessThanOrEqual(d.capacityMinutes + 1);
    expect(s.byDate.get("2026-10-05")!.capacityMinutes).toBe(85); // 100 × 85 %
    const total = placed(s).reduce((n, t) => n + t.minutes, 0);
    expect(Math.abs(total - 8 * 70)).toBeLessThanOrEqual(8);
  });

  it("un tema que supera los minutos del día ocupa varios días (parte 1/n, 2/n…) y la suma de sus partes es su duración", () => {
    const p = plan({ preconditions: { minutesPerDay: 60, studyDays: [1, 2, 3, 4, 5], pace: "intenso" }, subplans: [area("backend", "Backend", [topic(1, 1, 150)])] });
    const s = buildSchedule(p);
    const parts = placed(s).filter((t) => t.folder === "A/T1");
    expect(parts.length).toBeGreaterThanOrEqual(3);
    expect(parts.map((x) => x.part)).toEqual(parts.map((_, i) => i + 1));
    expect(new Set(parts.map((x) => x.parts))).toEqual(new Set([parts.length]));
    expect(parts.reduce((n, x) => n + x.minutes, 0)).toBeGreaterThanOrEqual(148);
    expect(new Set(parts.map((x) => x.date)).size).toBe(parts.length); // un trozo por día
  });

  it("la semana parcial (el periodo empieza a mitad de semana y acaba antes del domingo) también se reparte", () => {
    const p = plan({ start: "2026-10-07", end: "2026-10-14", subplans: [area("backend", "Backend", [topic(1, 1, 60), topic(2, 2, 60)])] }); // miércoles → miércoles
    const s = buildSchedule(p);
    expect(s.days.map((d) => d.date)[0]).toBe("2026-10-07");
    expect(s.weeks).toBe(2);
    expect(placed(s).filter((t) => t.folder === "A/T1").every((t) => t.date <= "2026-10-13")).toBe(true);
    expect(placed(s).filter((t) => t.folder === "A/T2").every((t) => t.date >= "2026-10-14")).toBe(true);
  });

  it("un tema nunca se coloca antes de su semana objetivo", () => {
    const s = buildSchedule(plan());
    for (const t of placed(s)) {
      const w = s.byDate.get(t.date)!.week;
      const target = { "A/T1": 1, "A/T2": 1, "A/T3": 2, "A/T4": 3 }[t.folder]!;
      expect(w, `${t.folder} en ${t.date}`).toBeGreaterThanOrEqual(target);
    }
  });

  it("con holgura reparte de forma pareja por los días (no todo el lunes) y con sobrecarga arrastra a la semana siguiente", () => {
    const slack = buildSchedule(plan({ subplans: [area("backend", "Backend", [topic(1, 1, 60), topic(2, 1, 60), topic(3, 1, 60), topic(4, 1, 60)])] }));
    const days = new Set(placed(slack).filter((t) => slack.byDate.get(t.date)!.week === 1).map((t) => t.date));
    expect(days.size).toBeGreaterThanOrEqual(3);
    // sobrecarga: 5 días × 120 = 600 de capacidad en la semana 1 y 900 de temas → lo que sobra pasa a la semana 2
    const over = buildSchedule(plan({ subplans: [area("backend", "Backend", Array.from({ length: 9 }, (_, i) => topic(i + 1, 1, 100)))] }));
    const w1 = over.days.filter((d) => d.week === 1).reduce((n, d) => n + d.topicMinutes, 0);
    const w2 = over.days.filter((d) => d.week === 2).reduce((n, d) => n + d.topicMinutes, 0);
    expect(w1).toBeLessThanOrEqual(605);
    expect(w2).toBeGreaterThan(200);
  });

  it("lo que no cabe en todo el plan se amontona en el último día de estudio y queda marcado como desbordado", () => {
    const s = buildSchedule(plan({ end: "2026-10-09", subplans: [area("backend", "Backend", Array.from({ length: 12 }, (_, i) => topic(i + 1, 1, 100)))] }));
    const over = placed(s).filter((t) => t.overflow);
    expect(over.length).toBeGreaterThan(0);
    expect(new Set(over.map((t) => t.date))).toEqual(new Set(["2026-10-09"]));
  });

  it("dos áreas en la misma semana se reparten la capacidad del día en proporción a lo que cada una tiene que hacer", () => {
    const p = plan({ subplans: [area("backend", "Backend", [topic(1, 1, 120), topic(2, 1, 120)]), area("frontend", "Frontend", [{ ...topic(9, 1, 40), folder: "F/T9" }])] });
    const s = buildSchedule(p);
    for (const d of s.days) expect(d.topicMinutes).toBeLessThanOrEqual(d.capacityMinutes + 1);
    const areas = new Set(placed(s).map((t) => t.area));
    expect(areas).toEqual(new Set(["Backend", "Frontend"]));
  });
});

describe("práctica reservada, temas fijados y completados", () => {
  const pre = { start: START, end: "2026-10-25", minutesPerDay: 120, studyDays: [1, 2, 3, 4, 5], pace: "intenso" as const, goalIds: [], subjects: [], levels: {}, deliverables: "no" as const, practice: { kataMinutes: 30, sessionsPerWeek: 2, minutesPerSession: 45, monthly: false, focus: "rotate" as const } };
  const track = buildPracticeTrack(pre)!;

  it("los minutos de práctica (kata + sesión del proyecto) se restan a lo que queda para temas y se ven en cada día", () => {
    const s = buildSchedule(plan({ programmingPractice: track, subplans: [area("backend", "Backend", Array.from({ length: 6 }, (_, i) => topic(i + 1, 1 + Math.floor(i / 3), 100)))] }));
    const mon = s.byDate.get("2026-10-05")!;
    expect(mon.practice.kata).toEqual({ minutes: 30 });
    expect(mon.practice.project).toBeTruthy();
    for (const d of s.days.filter((x) => x.study)) {
      expect(d.topicMinutes, d.date).toBeLessThanOrEqual(d.capacityMinutes + 1);
      expect(d.capacityMinutes, d.date).toBe(120 - (d.practice.kata?.minutes ?? 0) - (d.practice.project?.minutes ?? 0)); // lo reservado a la práctica no se reparte en temas
      if (d.practice.project) expect(d.capacityMinutes).toBe(120 - 30 - 45);
      expect(d.practiceMinutes).toBe((d.practice.kata?.minutes ?? 0) + (d.practice.project?.minutes ?? 0));
    }
    expect(s.days.some((d) => d.practice.project)).toBe(true);
    expect(s.byDate.get("2026-10-10")!.practice.kata).toBeUndefined(); // sábado: sin kata
  });

  it("un tema fijado (pinned) a una semana se coloca en ella, por delante de lo que se arrastra", () => {
    const p = plan({
      subplans: [area("backend", "Backend", [...Array.from({ length: 8 }, (_, i) => topic(i + 1, 1, 100)), topic(99, 2, 100, { pinned: true, title: "Fijado" })])],
    });
    const s = buildSchedule(p);
    const fixed = placed(s).filter((t) => t.folder === "A/T99");
    expect(fixed.length).toBeGreaterThan(0);
    expect(s.byDate.get(fixed[0]!.date)!.week).toBe(2);
    // y es de lo primero que se ve en la semana 2
    const first = s.days.filter((d) => d.week === 2).flatMap((d) => d.topics)[0]!;
    expect(first.folder).toBe("A/T99");
  });

  it("un tema completado se anota el día en que se completó y no ocupa capacidad", () => {
    const p = plan({ subplans: [area("backend", "Backend", [topic(1, 1, 60, { completedAt: "2026-10-06" }), topic(2, 1, 60)])] });
    const s = buildSchedule(p);
    const done = s.byDate.get("2026-10-06")!.topics.find((t) => t.folder === "A/T1")!;
    expect(done.done).toBe(true);
    expect(s.byDate.get("2026-10-06")!.topicMinutes).toBeLessThanOrEqual(s.byDate.get("2026-10-06")!.capacityMinutes);
    expect(placed(s).some((t) => t.folder === "A/T1")).toBe(false);
  });

  it("es determinista: la misma entrada da exactamente la misma agenda", () => {
    const a = buildSchedule(plan());
    const b = buildSchedule(plan());
    expect(JSON.stringify(a.days)).toBe(JSON.stringify(b.days));
  });
});

describe("propósito por plantillas y entregables", () => {
  const pre = { start: START, end: "2026-10-25", minutesPerDay: 120, studyDays: [1, 2, 3, 4, 5], pace: "intenso" as const, goalIds: [], subjects: [], levels: {}, deliverables: "no" as const, practice: { kataMinutes: 30, sessionsPerWeek: 2, minutesPerSession: 45, monthly: true, focus: "rotate" as const } };
  const track = buildPracticeTrack(pre)!;
  const p = (over: Partial<SchedulePlan> = {}): SchedulePlan =>
    plan({
      programmingPractice: track,
      subplans: [
        area("backend", "Backend", [topic(1, 1, 60, { title: "1.1 HTTP y REST", group: "core" }), topic(2, 2, 60, { title: "1.2 Diseño de APIs", group: "core" })], {
          groups: [{ id: "core", title: "Conocimientos de backend", kind: "knowledge", order: 100 }],
          deliverable: { title: "Mini API CRUD", description: "d", criteria: ["c"], status: "idea" },
          phase: { fromWeek: 1, toWeek: 2 },
        }),
      ],
      ...over,
    });

  it("el propósito de un día sale del contenido (área, temas, práctica) y es siempre el mismo; el escrito a mano lo sustituye", () => {
    const plan1 = p();
    const s = buildSchedule(plan1);
    const day = s.days.find((d) => d.topics.length)!;
    const a = dayPurpose(plan1, day);
    expect(a.manual).toBe(false);
    expect(a.text).toContain("Backend");
    expect(a.text).toMatch(/HTTP y REST|Diseño de APIs/); // sin la numeración de la carpeta
    expect(a.text).toContain("kata de lógica");
    expect(dayPurpose(plan1, day).text).toBe(a.text);
    const manual = dayPurpose({ ...plan1, purposes: { day: { [day.date]: "Mi propósito" } } }, day);
    expect(manual).toMatchObject({ text: "Mi propósito", manual: true, auto: a.auto });
    expect(dayPurpose(plan1, s.byDate.get("2026-10-10")!).text).toBe("Día de descanso.");
    expect(dayPurpose({ ...plan1, preconditions: { ...plan1.preconditions!, blockedDates: ["2026-10-06"] } }, buildSchedule({ ...plan1, preconditions: { ...plan1.preconditions!, blockedDates: ["2026-10-06"] } }).byDate.get("2026-10-06")!).text).toBe("Día bloqueado: sin estudio.");
  });

  it("el propósito de una semana y de un mes menciona áreas, temas y lo que se entrega", () => {
    const plan1 = p();
    const s = buildSchedule(plan1);
    const dl = deliverablesOf(plan1);
    const w1 = weekSummary(plan1, s, 1, dl)!;
    expect(w1.purpose).toMatch(/^Semana 1 · Backend: /);
    expect(w1.purpose).toContain("entrega:");
    const w2 = weekSummary({ ...plan1, purposes: { week: { "2": "Semana de APIs" } } }, s, 2, dl)!;
    expect(w2.purpose).toBe("Semana de APIs");
    expect(w2.autoPurpose).toMatch(/^Semana 2 · Backend/);
    const m = monthSummary(plan1, s, "2026-10", dl)!;
    expect(m.purpose).toContain("Octubre 2026");
    expect(m.purpose).toContain("Backend");
    expect(m.milestones.some((x) => x.includes("Termina Backend"))).toBe(true);
  });

  it("los entregables salen de la práctica (un kata por día de estudio, un proyecto por semana, uno mensual) y de las áreas, con su recuento por día", () => {
    const plan1 = p();
    const dl = deliverablesOf(plan1);
    expect(dl.filter((d) => d.kind === "kata")).toHaveLength(15); // 3 semanas × 5 días
    expect(dl.filter((d) => d.kind === "weekly_project")).toHaveLength(3);
    expect(dl.filter((d) => d.kind === "monthly_project").length).toBeGreaterThanOrEqual(1);
    expect(dl.filter((d) => d.kind === "area_project").map((d) => d.title)).toEqual(["Mini API CRUD"]);
    expect(dl.find((d) => d.kind === "area_project")!.dueDate).toBe("2026-10-18"); // fin de la semana 2, donde acaba el área
    const s = buildSchedule(plan1);
    // un día de estudio con kata: 1 entregable
    expect(deliverablesBetween(dl, "2026-10-05", "2026-10-05")).toHaveLength(1);
    expect(deliverablesText(deliverablesBetween(dl, "2026-10-05", "2026-10-05").length)).toBe("1 entregable");
    expect(deliverablesText(0)).toBe("sin entregables");
    expect(topicsText(3)).toBe("3 temas");
    // semana: sus katas + el proyecto semanal (+ el de área / mensual si caen en ella)
    const w1 = weekSummary(plan1, s, 1, dl)!;
    expect(w1.deliverables.filter((d) => d.kind === "kata")).toHaveLength(5);
    expect(w1.deliverables.filter((d) => d.kind === "weekly_project")).toHaveLength(1);
    // mes: la suma de todo lo de octubre
    expect(monthSummary(plan1, s, "2026-10", dl)!.deliverables).toHaveLength(dl.length);
  });

  it("el estado sale de la práctica (kata hecho, fases del proyecto) y lo anotado a mano NO cambia el estado (solo aporta archivos)", () => {
    const plan1 = p();
    const status = {
      kataDoneDates: ["2026-10-05"],
      weeks: [{ week: 1, phases: { build: "hecho" as const, construct: "en_curso" as const, defend: "pendiente" as const, postmortem: "pendiente" as const } }],
    };
    const dl = deliverablesOf(plan1, status);
    expect(dl.find((d) => d.id === "kata:2026-10-05")!.status).toBe("hecho");
    expect(dl.find((d) => d.id === "kata:2026-10-06")!.status).toBe("pendiente");
    expect(dl.find((d) => d.id === "wp:1")!.status).toBe("en_curso");
    expect(dl.find((d) => d.id === "wp:2")!.status).toBe("pendiente");
    const manual = deliverablesOf({ ...plan1, deliverables: [{ id: "kata:2026-10-06", kind: "kata", title: "x", description: "", dueDate: "2026-10-06", criteria: [], status: "hecho", source: "practice", files: [{ note: "kata.py" }] }] }, status);
    const k = manual.find((d) => d.id === "kata:2026-10-06")!;
    expect(k.status).toBe("pendiente");
    expect(k.files).toEqual([{ note: "kata.py" }]);
    // un entregable extra guardado aparece aunque no se derive de nada
    const extra = deliverablesOf({ ...plan1, deliverables: [{ id: "x:1", kind: "area_project", title: "Extra", description: "", dueDate: "2026-10-20", criteria: [], status: "pendiente", source: "ai" }] });
    expect(extra.some((d) => d.id === "x:1")).toBe(true);
  });
});

describe("navegación por periodos", () => {
  const pl = { start: "2026-10-06", end: "2027-04-05" };

  it("avanza y retrocede por día, semana del plan y mes; nunca sale del plan; salta al futuro y al pasado", () => {
    expect(shiftAnchor("dia", "2026-10-06", 1, pl)).toBe("2026-10-07");
    expect(shiftAnchor("dia", "2026-10-06", -1, pl)).toBe("2026-10-06"); // ya es el primero
    expect(shiftAnchor("semana", "2026-10-15", 1, pl)).toBe("2026-10-20");
    expect(shiftAnchor("semana", "2026-10-15", -1, pl)).toBe("2026-10-06");
    expect(shiftAnchor("mes", "2026-10-15", 1, pl)).toBe("2026-11-01");
    expect(shiftAnchor("mes", "2027-03-20", 1, pl)).toBe("2027-04-01");
    expect(shiftAnchor("mes", "2027-04-02", 1, pl)).toBe("2027-04-05"); // el último mes se recorta al fin del plan
    expect(canShift("dia", "2026-10-06", -1, pl)).toBe(false);
    expect(canShift("dia", "2027-04-05", 1, pl)).toBe(false);
    expect(canShift("mes", "2026-10-10", 1, pl)).toBe(true);
    expect(canShift("mes", "2027-04-02", 1, pl)).toBe(false);
    expect(clampToPlan("2026-01-01", pl)).toBe(pl.start);
    expect(clampToPlan("2030-01-01", pl)).toBe(pl.end);
  });

  it("los títulos de periodo son legibles y los meses del plan se listan en orden", () => {
    expect(periodTitle("dia", "2026-10-06", pl)).toBe("martes 6 de octubre");
    expect(periodTitle("semana", "2026-10-15", pl)).toBe("Semana 2 · 13–19 oct");
    expect(periodTitle("mes", "2026-10-15", pl)).toBe("Octubre 2026");
    expect(planMonths(pl)).toEqual(["2026-10", "2026-11", "2026-12", "2027-01", "2027-02", "2027-03", "2027-04"]);
  });
});
