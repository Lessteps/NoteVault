import { describe, expect, it } from "vitest";
import { sanitizePreconditions, sanitizePractice, normalizeDeliverables, type PlanPreconditions } from "./planTime";
import {
  buildPracticeTrack,
  capacityWithPractice,
  kataBlockId,
  parseProjectBlockId,
  phasesForSessions,
  practiceDayMinutes,
  practiceItemsFor,
  projectBlockId,
  rotateFocuses,
  sanitizePracticeTrack,
  suggestionsOf,
  weekTitle,
} from "./practiceTrack";

// 2026-10-05 es lunes: dos semanas completas
const pre = (over: Partial<PlanPreconditions> = {}): PlanPreconditions => ({
  start: "2026-10-05",
  end: "2026-10-18",
  minutesPerDay: 180,
  studyDays: [1, 2, 3, 4, 5, 6],
  pace: "intenso",
  goalIds: [],
  subjects: ["Programación"],
  levels: {},
  deliverables: "ask",
  practice: { kataMinutes: 30, sessionsPerWeek: 3, minutesPerSession: 90, monthly: false, focus: "rotate" },
  ...over,
});

describe("entregables en tres estados", () => {
  it("por defecto «no» (entregables por definir); «ask» y los booleanos antiguos se leen sin migrar", () => {
    expect(normalizeDeliverables(undefined)).toBe("no");
    expect(normalizeDeliverables("ask")).toBe("ask");
    expect(normalizeDeliverables(true)).toBe("yes");
    expect(normalizeDeliverables(false)).toBe("no");
    expect(normalizeDeliverables("no")).toBe("no");
    expect(normalizeDeliverables("raro")).toBe("no");
    expect(sanitizePreconditions({ start: "2026-10-05", end: "2026-10-18" }, "2026-10-05").deliverables).toBe("no");
    expect(sanitizePreconditions({ deliverables: true }, "2026-10-05").deliverables).toBe("yes");
    expect(sanitizePreconditions({ deliverables: false }, "2026-10-05").deliverables).toBe("no");
  });
});

describe("preferencias de práctica", () => {
  it("se sanean y sin kata ni proyecto no hay práctica", () => {
    expect(sanitizePractice(undefined)).toBeUndefined();
    expect(sanitizePractice({ kataMinutes: 0, sessionsPerWeek: 0 })).toBeUndefined();
    expect(sanitizePractice({})).toEqual({ kataMinutes: 30, sessionsPerWeek: 3, minutesPerSession: 90, monthly: false, focus: "rotate" });
    expect(sanitizePractice({ kataMinutes: 45, sessionsPerWeek: 99, minutesPerSession: 1, focus: "frontend", monthly: true })).toEqual({ kataMinutes: 45, sessionsPerWeek: 7, minutesPerSession: 15, monthly: true, focus: "frontend" });
    // sin proyecto semanal no hay proyecto mensual
    expect(sanitizePractice({ kataMinutes: 30, sessionsPerWeek: 0, monthly: true })!.monthly).toBe(false);
    expect(sanitizePractice({ focus: "inventado" })!.focus).toBe("rotate");
  });
});

describe("fases por sesión y rotación de focos", () => {
  it("las cuatro fases siempre aparecen una vez y en orden", () => {
    for (const n of [1, 2, 3, 4, 5, 7]) {
      const flat = phasesForSessions(n).flat();
      expect(flat.filter((p) => p === "build")).toHaveLength(1);
      expect(flat.filter((p) => p === "defend")).toHaveLength(1);
      expect(flat.filter((p) => p === "postmortem")).toHaveLength(1);
      expect(flat[0]).toBe("build");
      expect(flat[flat.length - 1]).toBe("postmortem");
      expect(phasesForSessions(n)).toHaveLength(n);
    }
    expect(phasesForSessions(4)).toEqual([["build"], ["construct"], ["defend"], ["postmortem"]]);
    expect(phasesForSessions(2)).toEqual([["build", "construct"], ["defend", "postmortem"]]);
    expect(phasesForSessions(6).filter((p) => p[0] === "construct")).toHaveLength(3);
  });

  it("el foco rota de forma determinista por el stack, o se fija", () => {
    expect(rotateFocuses(7, "rotate")).toEqual(["backend", "databases", "frontend", "desktop", "mobile", "automation", "backend"]);
    expect(rotateFocuses(3, "rotate", "frontend")).toEqual(["frontend", "desktop", "mobile"]);
    expect(rotateFocuses(2, "databases")).toEqual(["databases", "databases"]);
  });
});

describe("pista del plan", () => {
  it("kata en los días de estudio y proyecto semanal con sus sesiones, fases y foco por semana", () => {
    const t = buildPracticeTrack(pre())!;
    expect(t.kata).toEqual({ minutesPerDay: 30, days: [1, 2, 3, 4, 5, 6] });
    const wp = t.weeklyProject!;
    expect(wp.weeks).toHaveLength(2);
    expect(wp.weeks.map((w) => w.focus)).toEqual(["backend", "databases"]);
    for (const w of wp.weeks) {
      expect(w.sessions).toHaveLength(3);
      expect(w.sessions.every((s) => s.minutes === 90)).toBe(true);
      expect(w.sessions.flatMap((s) => s.phases)).toEqual(["build", "construct", "defend", "postmortem"]);
      expect(w.sessions.every((s) => s.date >= w.start && s.date <= w.end)).toBe(true);
    }
    expect(weekTitle(wp.weeks[1]!)).toBe("Proyecto semanal 2 · foco Databases");
  });

  it("sin kata o sin proyecto solo lleva lo que se pidió, y sin práctica no hay pista", () => {
    expect(buildPracticeTrack(pre({ practice: undefined }))).toBeUndefined();
    const k = buildPracticeTrack(pre({ practice: { kataMinutes: 15, sessionsPerWeek: 0, minutesPerSession: 60, monthly: false, focus: "rotate" } }))!;
    expect(k.weeklyProject).toBeUndefined();
    const p = buildPracticeTrack(pre({ practice: { kataMinutes: 0, sessionsPerWeek: 2, minutesPerSession: 60, monthly: false, focus: "mobile" } }))!;
    expect(p.kata).toBeUndefined();
    expect(p.weeklyProject!.weeks.every((w) => w.focus === "mobile")).toBe(true);
  });

  it("respeta días bloqueados y desde cuándo (hoy), y no inventa sesiones en semanas sin días", () => {
    const t = buildPracticeTrack(pre({ blockedDates: ["2026-10-06", "2026-10-07"] }), { from: "2026-10-08" })!;
    const w1 = t.weeklyProject!.weeks[0]!;
    expect(w1.sessions.every((s) => s.date >= "2026-10-08")).toBe(true);
    expect(w1.sessions.length).toBeLessThanOrEqual(3);
    // toda la primera semana pasada: sin sesiones y la rotación empieza en la segunda
    const late = buildPracticeTrack(pre(), { from: "2026-10-12" })!.weeklyProject!.weeks;
    expect(late[0]!.sessions).toEqual([]);
    expect(late[1]!.focus).toBe("backend");
  });

  it("con pocos días, menos sesiones; las fases se funden pero no se pierden", () => {
    const t = buildPracticeTrack(pre({ studyDays: [2, 5] }))!;
    const w = t.weeklyProject!.weeks[0]!;
    expect(w.sessions).toHaveLength(2);
    expect(w.sessions.flatMap((s) => s.phases)).toEqual(["build", "construct", "defend", "postmortem"]);
  });

  it("la IA solo sugiere temas y (con foco rotativo) focos válidos; nunca minutos ni fases", () => {
    const t = buildPracticeTrack(pre(), {
      suggestions: { weeks: [{ week: 1, theme: "  Gestor de gastos \n con roles ", focus: "frontend" }, { week: 2, theme: "x".repeat(200), focus: "inventado" }, { week: 9, theme: "fuera" }], monthlyTheme: "Portafolio" },
    })!;
    const [a, b] = t.weeklyProject!.weeks;
    expect(a!.theme).toBe("Gestor de gastos con roles");
    expect(a!.focus).toBe("frontend");
    expect(b!.theme).toHaveLength(80);
    expect(b!.focus).toBe("databases"); // foco inválido: se queda la rotación
    expect(a!.sessions).toHaveLength(3);
    expect(a!.sessions[0]!.minutes).toBe(90);
    // con foco fijo, el de la IA se ignora
    const fixed = buildPracticeTrack(pre({ practice: { kataMinutes: 30, sessionsPerWeek: 3, minutesPerSession: 90, monthly: false, focus: "desktop" } }), { suggestions: { weeks: [{ week: 1, focus: "frontend", theme: "T" }] } })!;
    expect(fixed.weeklyProject!.weeks[0]!.focus).toBe("desktop");
    expect(weekTitle(fixed.weeklyProject!.weeks[0]!)).toBe("T · foco Desktop");
    expect(suggestionsOf(t)!.weeks![0]).toMatchObject({ week: 1, focus: "frontend", theme: "Gestor de gastos con roles" });
  });

  it("proyecto mensual: bloques de 4 semanas que integran los semanales", () => {
    const p = pre({ end: "2026-11-15", practice: { kataMinutes: 30, sessionsPerWeek: 2, minutesPerSession: 60, monthly: true, focus: "rotate" } });
    const t = buildPracticeTrack(p, { suggestions: { monthlyTheme: "Portafolio" } })!;
    expect(t.monthlyProject!.blocks).toEqual([{ fromWeek: 1, toWeek: 4, theme: "Portafolio" }, { fromWeek: 5, toWeek: 6 }]);
    expect(buildPracticeTrack(pre({ end: "2026-10-11", practice: { kataMinutes: 30, sessionsPerWeek: 2, minutesPerSession: 60, monthly: true, focus: "rotate" } }))!.monthlyProject).toBeUndefined();
  });
});

describe("tiempo reservado", () => {
  it("la capacidad de temas es la efectiva menos la práctica, día a día", () => {
    const p = pre({ end: "2026-10-11" }); // una semana, 6 días, 180 min/día, ritmo intenso
    const cap = capacityWithPractice(p, "2026-10-05");
    expect(cap.effectiveMinutes).toBe(1080);
    expect(cap.kataMinutes).toBe(180); // 6 × 30
    expect(cap.projectMinutes).toBe(270); // 3 × 90
    expect(cap.practiceMinutes).toBe(450);
    expect(cap.topicMinutes).toBe(630);
    expect(cap.overflowDays).toBe(0);
    const f = practiceDayMinutes(cap.track, { from: "2026-10-05", blockedDates: [] });
    expect(["05", "06", "07", "08", "09", "10", "11"].map((d) => f(`2026-10-${d}`)).reduce((a, b) => a + b, 0)).toBe(450);
  });

  it("el ritmo recorta la capacidad pero no la práctica (compromiso fijo) y avisa si no cabe", () => {
    const cap = capacityWithPractice(pre({ end: "2026-10-11", minutesPerDay: 90, pace: "suave" }), "2026-10-05");
    expect(cap.effectiveMinutes).toBe(Math.round(6 * 90 * 0.7));
    expect(cap.overflowDays).toBeGreaterThan(0);
    expect(cap.topicMinutes).toBeLessThan(cap.effectiveMinutes - cap.kataMinutes + 1);
  });

  it("sin práctica no reserva nada", () => {
    const cap = capacityWithPractice(pre({ practice: undefined }), "2026-10-05");
    expect(cap.practiceMinutes).toBe(0);
    expect(cap.topicMinutes).toBe(cap.effectiveMinutes);
    expect(cap.track).toBeUndefined();
  });
});

describe("de la pista a Hoy", () => {
  const track = buildPracticeTrack(pre())!;
  const plan = { id: "p1", start: "2026-10-05", end: "2026-10-18", name: "Backend", programmingPractice: track };
  const sessionDay = track.weeklyProject!.weeks[0]!.sessions[1]!;

  it("el kata del día y la sesión del proyecto que toca según el calendario", () => {
    const items = practiceItemsFor(sessionDay.date, [plan]);
    expect(items.map((i) => i.kind)).toEqual(["kata", "project"]);
    expect(items[0]).toMatchObject({ estMinutes: 30, planId: "p1", week: 1 });
    expect(items[1]).toMatchObject({ estMinutes: 90, focus: "backend", phases: sessionDay.phases });
  });

  it("domingo: ni kata ni sesión; fuera del plan o archivado: nada; lo hecho se omite", () => {
    expect(practiceItemsFor("2026-10-11", [plan])).toEqual([]);
    expect(practiceItemsFor("2026-10-20", [plan])).toEqual([]);
    expect(practiceItemsFor(sessionDay.date, [{ ...plan, archived: true }])).toEqual([]);
    const done = practiceItemsFor(sessionDay.date, [plan], { kata: () => true, project: () => true });
    expect(done).toEqual([]);
    expect(practiceItemsFor(sessionDay.date, [{ ...plan, programmingPractice: undefined }])).toEqual([]);
  });

  it("los ids de bloque son estables y se pueden leer de vuelta", () => {
    expect(kataBlockId("p1")).toBe("practice:p1:kata");
    const id = projectBlockId("p1", 2, ["defend", "postmortem"]);
    expect(id).toBe("practice:p1:project:w2:defend+postmortem");
    expect(parseProjectBlockId(id)).toEqual({ planId: "p1", week: 2, phases: ["defend", "postmortem"] });
    expect(parseProjectBlockId("practice:p1:kata")).toBeNull();
  });
});

describe("lectura segura", () => {
  it("normaliza lo que llegue de disco y descarta lo inválido; sin pista, undefined", () => {
    const track = buildPracticeTrack(pre())!;
    expect(sanitizePracticeTrack(JSON.parse(JSON.stringify(track)), "2026-10-05", "2026-10-18")).toEqual(track);
    expect(sanitizePracticeTrack(undefined, "2026-10-05", "2026-10-18")).toBeUndefined();
    expect(sanitizePracticeTrack({ kata: { minutesPerDay: -3, days: [9] }, weeklyProject: { weeks: [{ week: 5, sessions: [] }] } }, "2026-10-05", "2026-10-18")).toBeUndefined();
    const dirty = sanitizePracticeTrack({ weeklyProject: { sessionsPerWeek: 2, minutesPerSession: 60, weeks: [{ week: 1, focus: "raro", sessions: [{ date: "2026-12-01", minutes: 60, phases: ["build"] }, { date: "2026-10-06", minutes: 60, phases: ["x", "build"] }] }] } }, "2026-10-05", "2026-10-18")!;
    expect(dirty.weeklyProject!.weeks[0]).toMatchObject({ focus: "backend", sessions: [{ date: "2026-10-06", minutes: 60, phases: ["build"] }] });
  });
});
