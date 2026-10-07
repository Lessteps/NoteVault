// Agenda por ENFOQUE: plantillas de día (Backend exige teoría de backend + práctica de Python + teoría de BD + práctica de BD el MISMO día),
// proporciones de minutos, «no partir desde cero» (los fundamentos se intercalan, no se adelantan), temas de varios días, fijados, días
// bloqueados, práctica reservada, bloques sin temas (repaso u omitido) y propósito con la estructura del día.

import { describe, expect, it } from "vitest";
import { FOCUS_TEMPLATES, templateFor } from "./planDayFocus";
import { buildSchedule, dayPurposeAuto, focusStatsOf, type SchedulePlan, type ScheduleTopic } from "./planSchedule";
import { buildPracticeTrack } from "./practiceTrack";

const START = "2026-10-05"; // lunes
const BASES = { id: "bases", title: "Bases", kind: "bases" as const, order: 0 };
const PY = { id: "lang-python", title: "Lenguaje: Python", kind: "language" as const, order: 10 };
const JS = { id: "lang-javascript", title: "Lenguaje: JavaScript", kind: "language" as const, order: 11 };
const CORE = { id: "core", title: "Conocimientos", kind: "knowledge" as const, order: 100 };
const topic = (folder: string, title: string, est: number, week: number, group: string, extra: Partial<ScheduleTopic> = {}): ScheduleTopic => ({ folder, title, estMinutes: est, targetWeek: week, group, ...extra });
const nTopics = (prefix: string, n: number, est: number, group: string, week = 1): ScheduleTopic[] => Array.from({ length: n }, (_, i) => topic(`${prefix}/${i + 1}`, `${prefix} ${i + 1}`, est, week, group));

function backendPlan(over: Partial<SchedulePlan> = {}, o: { bases?: number; db?: boolean; python?: boolean } = {}): SchedulePlan {
  const subplans: SchedulePlan["subplans"] = [
    {
      id: "s-backend",
      areaId: "backend",
      area: "Backend",
      objective: "Servicios",
      groups: [BASES, ...(o.python === false ? [] : [PY]), CORE],
      phase: { fromWeek: 1, toWeek: 4 },
      topics: [...nTopics("F", o.bases ?? 12, 60, "bases"), ...(o.python === false ? [] : nTopics("PY", 6, 60, "lang-python")), ...nTopics("BE", 6, 60, "core")],
    },
  ];
  if (o.db !== false) subplans.push({ id: "s-db", areaId: "databases", area: "Databases", objective: "SQL", groups: [CORE], phase: { fromWeek: 1, toWeek: 4 }, topics: nTopics("DB", 6, 60, "core") });
  return { id: "p1", start: START, end: "2026-11-01", structure: "areas", preconditions: { minutesPerDay: 360, studyDays: [1, 2, 3, 4, 5], pace: "intenso" }, subplans, ...over };
}
const ids = (d: { blocks?: Array<{ id: string }> }): string[] => (d.blocks ?? []).map((b) => b.id);

describe("plantillas de día por enfoque (tabla de datos)", () => {
  it("la tabla define Backend, Databases, Frontend, Automation y Tooling con sus bloques obligatorios", () => {
    expect(FOCUS_TEMPLATES.backend!.blocks.map((b) => `${b.kind}:${b.id}`)).toEqual(["theory:backend-theory", "practice:backend-lang", "theory:db-theory", "practice:db-practice"]);
    expect(FOCUS_TEMPLATES.frontend!.blocks.map((b) => b.id)).toEqual(["frontend-theory", "frontend-lang", "frontend-ui"]);
    expect(FOCUS_TEMPLATES.automation!.blocks.map((b) => b.id)).toEqual(["automation-theory", "automation-script"]);
    expect(FOCUS_TEMPLATES.tooling!.blocks.map((b) => b.id)).toEqual(["tooling-theory", "tooling-practice"]);
    expect(templateFor("desktop").id).toBe("generic");
    for (const t of Object.values(FOCUS_TEMPLATES)) expect(t.blocks.every((b) => b.share > 0 && b.floor > 0)).toBe(true);
  });
});

describe("Backend: teoría de backend, práctica de Python, teoría de BD y práctica de BD el MISMO día", () => {
  it("cada día de estudio de Backend trae los 4 bloques, con temas reales de Backend, Python y Databases", () => {
    const s = buildSchedule(backendPlan());
    const study = s.days.filter((d) => d.study);
    expect(study.length).toBeGreaterThan(10);
    for (const d of study.slice(0, 5)) {
      expect(d.focus!.label).toBe("Backend");
      expect(ids(d)).toEqual(["backend-theory", "backend-lang", "db-theory", "db-practice"]);
      const byId = Object.fromEntries(d.blocks!.map((b) => [b.id, b]));
      expect(byId["backend-theory"]!.items[0]!.folder).toMatch(/^BE\//);
      expect(byId["backend-lang"]!.items.some((i) => i.folder.startsWith("PY/"))).toBe(true);
      expect(byId["db-theory"]!.items[0]!.folder).toMatch(/^DB\//);
      expect(byId["db-practice"]!.items[0]!.folder).toMatch(/^DB\//);
      expect(byId["backend-lang"]!.language).toBe("Python");
      expect(byId["db-practice"]!.language).toBe("SQL");
    }
  });

  it("la línea «Hoy:» y el propósito dicen la estructura: teoría de backend + práctica de Python + teoría y práctica de SQL", () => {
    const p = backendPlan();
    const s = buildSchedule(p);
    const d = s.byDate.get(START)!;
    expect(d.focus!.line).toBe("Hoy: teoría de backend + práctica de Python + teoría y práctica de SQL");
    const purpose = dayPurposeAuto(p, d);
    expect(purpose).toContain("Enfoque Backend");
    expect(purpose).toContain("teoría de backend");
    expect(purpose).toContain("práctica de Python");
    expect(purpose).toContain("proyecto diario");
    expect(d.focus!.practiceNote).toMatch(/Backend practicas cada día el lenguaje del servidor \(Python\) y SQL/);
  });

  it("el tema de BD aparece a la vez en teoría y en práctica (mismo tema, minutos repartidos por proporción)", () => {
    const d = buildSchedule(backendPlan()).byDate.get(START)!;
    const th = d.blocks!.find((b) => b.id === "db-theory")!;
    const pr = d.blocks!.find((b) => b.id === "db-practice")!;
    expect(th.items[0]!.folder).toBe(pr.items[0]!.folder);
    expect(th.minutes).toBeGreaterThan(pr.minutes); // 24 % vs 18 %
    // el tema (60 min) se reparte entre teoría y práctica sin duplicar minutos en el día
    const dayDb = d.topics.filter((t) => t.folder === th.items[0]!.folder).reduce((n, t) => n + t.minutes, 0);
    expect(dayDb).toBe(th.minutes + pr.minutes);
  });

  it("falta un tipo: sin temas de Databases en el plan, sus bloques se OMITEN con explicación; sin lenguaje, la práctica queda con fundamentos", () => {
    const noDb = buildSchedule(backendPlan({}, { db: false })).byDate.get(START)!;
    expect(noDb.blocks!.find((b) => b.id === "db-theory")).toMatchObject({ status: "omitted" });
    expect(noDb.blocks!.find((b) => b.id === "db-theory")!.note).toMatch(/se omite/);
    expect(noDb.focus!.line).toBe("Hoy: teoría de backend + práctica de Python");
    const noPy = buildSchedule(backendPlan({}, { python: false })).byDate.get(START)!;
    const lang = noPy.blocks!.find((b) => b.id === "backend-lang")!;
    expect(lang.status).toBe("topic");
    expect(lang.items.every((i) => i.applied)).toBe(true);
  });

  it("cuando el carril se agota el bloque queda como REPASO breve (no se rellena con temas inventados)", () => {
    const p = backendPlan();
    p.subplans[1]!.topics = nTopics("DB", 1, 40, "core"); // un solo tema de BD de 40 min
    const s = buildSchedule(p);
    const later = s.days.filter((d) => d.study && d.week >= 2)[0]!;
    const th = later.blocks!.find((b) => b.id === "db-theory")!;
    expect(th.status).toBe("review");
    expect(th.items).toHaveLength(0);
    expect(th.minutes).toBeLessThanOrEqual(20);
    expect(later.focus!.line).toContain("repaso (teoría de bases de datos)");
  });
});

describe("minutos: capacidad, proporciones y reserva", () => {
  it("la suma de los bloques + proyecto diario nunca pasa de la capacidad del día (tiempo × ritmo − práctica)", () => {
    const track = buildPracticeTrack({ start: START, end: "2026-11-01", minutesPerDay: 360, studyDays: [1, 2, 3, 4, 5], pace: "intenso", goalIds: [], subjects: [], levels: {}, deliverables: "no", practice: { kataMinutes: 60, sessionsPerWeek: 2, minutesPerSession: 60, monthly: false, focus: "rotate" } } as never)!;
    const s = buildSchedule(backendPlan({ programmingPractice: track }));
    for (const d of s.days.filter((x) => x.study)) {
      const blocksMin = d.blocks!.reduce((n, b) => n + b.minutes, 0);
      expect(blocksMin + (d.projectMinutes ?? 0), d.date).toBeLessThanOrEqual(d.capacityMinutes + 2);
      expect(d.practiceMinutes).toBeGreaterThanOrEqual(60); // kata reservado
      expect(d.capacityMinutes).toBeLessThanOrEqual(360 - 60 + 1);
    }
  });

  it("con sobrecarga los bloques se reparten por sus proporciones (teoría de backend > práctica de SQL) y todo cabe en el día", () => {
    const p = backendPlan({ preconditions: { minutesPerDay: 120, studyDays: [1, 2, 3, 4, 5], pace: "intenso" } });
    p.subplans[0]!.topics = [...nTopics("F", 30, 90, "bases"), ...nTopics("PY", 20, 90, "lang-python"), ...nTopics("BE", 20, 90, "core")];
    p.subplans[1]!.topics = nTopics("DB", 20, 90, "core");
    const d = buildSchedule(p).byDate.get(START)!;
    const m = Object.fromEntries(d.blocks!.map((b) => [b.id, b.minutes]));
    expect(m["backend-theory"]!).toBeGreaterThanOrEqual(m["db-practice"]!);
    expect(d.blocks!.reduce((n, b) => n + b.minutes, 0) + d.projectMinutes!).toBeLessThanOrEqual(d.capacityMinutes + 2);
    expect(d.projectMinutes!).toBeGreaterThanOrEqual(10);
  });

  it("todo lo estudiable queda colocado antes del fin del plan (nada se pierde) y es determinista", () => {
    const p = backendPlan();
    const a = buildSchedule(p);
    const b = buildSchedule(p);
    expect(JSON.stringify(a.days)).toBe(JSON.stringify(b.days));
    const placed = new Map<string, number>();
    for (const d of a.days) for (const t of d.topics) placed.set(t.folder, (placed.get(t.folder) ?? 0) + t.minutes);
    for (const s of p.subplans) for (const t of s.topics) expect(Math.abs((placed.get(t.folder) ?? 0) - t.estMinutes), t.folder).toBeLessThanOrEqual(2);
  });
});

describe("«no partir desde cero»: los fundamentos se intercalan, no se adelantan", () => {
  it("con 12 temas de Bases (la mayor parte del plan) la primera semana ya trae Backend, Python y SQL; Bases entra como lógica aplicada", () => {
    const s = buildSchedule(backendPlan({}, { bases: 40 }));
    const week1 = s.days.filter((d) => d.week === 1 && d.study);
    for (const d of week1) {
      expect(d.blocks!.find((b) => b.id === "backend-theory")!.items.length).toBeGreaterThan(0);
      expect(d.blocks!.find((b) => b.id === "db-theory")!.items.length).toBeGreaterThan(0);
    }
    const bases = s.days.flatMap((d) => d.topics.filter((t) => t.group === "bases").map((t) => ({ ...t, date: d.date })));
    expect(bases.length).toBeGreaterThan(0);
    expect(bases.every((t) => t.applied && t.role === "practice")).toBe(true);
    // Bases no ocupa un bloque propio ni todo el día: nunca más de la mitad del bloque de lenguaje
    for (const d of week1) {
      const lang = d.blocks!.find((b) => b.id === "backend-lang")!;
      const b = lang.items.filter((i) => i.applied).reduce((n, i) => n + i.minutes, 0);
      expect(b).toBeLessThan(d.capacityMinutes / 2);
    }
    // y se reparte por todo el periodo del área, no solo al principio
    const firstWeekBases = new Set(bases.filter((t) => t.date < "2026-10-12").map((t) => t.folder)).size;
    const lastBases = bases.at(-1)!.date;
    expect(firstWeekBases).toBeLessThan(new Set(bases.map((t) => t.folder)).size);
    expect(lastBases > "2026-10-20").toBe(true);
  });

  it("los temas de Backend no esperan a que acaben las Bases: su teoría empieza el primer día aunque su semana objetivo sea posterior", () => {
    const p = backendPlan();
    p.subplans[0]!.topics = [...nTopics("F", 12, 60, "bases", 1), ...nTopics("PY", 6, 60, "lang-python", 3), ...nTopics("BE", 6, 60, "core", 4)];
    const d = buildSchedule(p).byDate.get(START)!;
    expect(d.blocks!.find((b) => b.id === "backend-theory")!.items[0]!.folder).toBe("BE/1");
  });
});

describe("temas de varios días, fijados, bloqueados y completados", () => {
  it("un tema grande ocupa varios días (parte 1/n, 2/n…) y la suma es su duración", () => {
    const p = backendPlan({ preconditions: { minutesPerDay: 90, studyDays: [1, 2, 3, 4, 5], pace: "intenso" } });
    p.subplans[0]!.topics = [topic("BE/big", "Gran tema", 400, 1, "core"), ...nTopics("PY", 3, 60, "lang-python")];
    p.subplans[1]!.topics = nTopics("DB", 2, 60, "core");
    const s = buildSchedule(p);
    const chunks = s.days.flatMap((d) => d.topics.filter((t) => t.folder === "BE/big"));
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.map((c) => c.part)).toEqual(chunks.map((_, i) => i + 1));
    expect(chunks.every((c) => c.parts === chunks.length)).toBe(true);
    expect(Math.abs(chunks.reduce((n, c) => n + c.minutes, 0) - 400)).toBeLessThanOrEqual(chunks.length);
  });

  it("un tema fijado (pinned) a la semana 3 no se coloca antes de ella y pasa por delante de su carril", () => {
    const p = backendPlan();
    p.subplans[0]!.topics[p.subplans[0]!.topics.length - 1] = topic("BE/pin", "Fijado", 60, 3, "core", { pinned: true });
    const s = buildSchedule(p);
    const day = s.days.find((d) => d.topics.some((t) => t.folder === "BE/pin"))!;
    expect(day.week).toBeGreaterThanOrEqual(3);
    const w3 = s.days.filter((d) => d.week === 3 && d.study);
    expect(w3.some((d) => d.blocks!.find((b) => b.id === "backend-theory")!.items[0]?.folder === "BE/pin")).toBe(true);
  });

  it("los días bloqueados y de descanso no llevan enfoque ni bloques; el resto del plan los absorbe", () => {
    const p = backendPlan({ preconditions: { minutesPerDay: 360, studyDays: [1, 2, 3, 4, 5], pace: "intenso", blockedDates: ["2026-10-07"] } });
    const s = buildSchedule(p);
    expect(s.byDate.get("2026-10-07")).toMatchObject({ blocked: true, study: false });
    expect(s.byDate.get("2026-10-07")!.focus).toBeUndefined();
    expect(s.byDate.get("2026-10-07")!.topics).toHaveLength(0);
    expect(s.byDate.get("2026-10-10")!.focus).toBeUndefined(); // sábado
    expect(dayPurposeAuto(p, s.byDate.get("2026-10-07")!)).toMatch(/bloqueado/i);
  });

  it("un tema completado se anota el día en que se completó y no consume capacidad", () => {
    const p = backendPlan();
    p.subplans[0]!.topics[p.subplans[0]!.topics.length - 1] = topic("BE/done", "Hecho", 60, 1, "core", { completedAt: "2026-10-06" });
    const s = buildSchedule(p);
    expect(s.byDate.get("2026-10-06")!.topics.find((t) => t.folder === "BE/done")).toMatchObject({ done: true });
    expect(s.days.flatMap((d) => d.topics).filter((t) => t.folder === "BE/done" && !t.done)).toHaveLength(0);
  });
});

describe("otros enfoques y varios enfoques en el plan", () => {
  it("Frontend: teoría de frontend + práctica de JavaScript + práctica de UI y componentes", () => {
    const p: SchedulePlan = {
      id: "p2", start: START, end: "2026-10-25", structure: "areas",
      preconditions: { minutesPerDay: 300, studyDays: [1, 2, 3, 4, 5], pace: "intenso" },
      subplans: [{ id: "s-fe", areaId: "frontend", area: "Frontend", objective: "UI", groups: [JS, CORE], phase: { fromWeek: 1, toWeek: 3 }, topics: [...nTopics("JS", 6, 60, "lang-javascript"), ...nTopics("FE", 6, 60, "core")] }],
    };
    const d = buildSchedule(p).byDate.get(START)!;
    expect(ids(d)).toEqual(["frontend-theory", "frontend-lang", "frontend-ui"]);
    expect(d.focus!.line).toBe("Hoy: teoría de frontend + práctica de JavaScript + práctica de UI y componentes");
  });

  it("dos enfoques en fases distintas alternan: Backend las semanas 1–2 y Frontend las 3–4; cada día un solo enfoque", () => {
    const p = backendPlan();
    p.subplans[0]!.phase = { fromWeek: 1, toWeek: 2 };
    p.subplans[1]!.phase = { fromWeek: 1, toWeek: 2 };
    p.subplans.push({ id: "s-fe", areaId: "frontend", area: "Frontend", objective: "UI", groups: [JS, CORE], phase: { fromWeek: 3, toWeek: 4 }, topics: [...nTopics("JS", 4, 60, "lang-javascript", 3), ...nTopics("FE", 4, 60, "core", 3)] });
    const s = buildSchedule(p);
    expect(s.days.filter((d) => d.week <= 2 && d.focus).every((d) => d.focus!.id === "backend")).toBe(true);
    expect(s.days.filter((d) => d.week >= 3 && d.focus).every((d) => d.focus!.id === "frontend")).toBe(true);
    const st = focusStatsOf(s.days);
    expect(st.byFocus.map((f) => f.label)).toEqual(["Backend", "Frontend"]);
    expect(st.theoryMinutes).toBeGreaterThan(0);
    expect(st.practiceMinutes).toBeGreaterThan(0);
  });

  it("áreas en paralelo (Automation ‖ Tooling) se reparten los días de la semana en proporción a lo que les queda", () => {
    const p: SchedulePlan = {
      id: "p3", start: START, end: "2026-10-18", structure: "areas",
      preconditions: { minutesPerDay: 240, studyDays: [1, 2, 3, 4, 5], pace: "intenso" },
      subplans: [
        { id: "s-au", areaId: "automation", area: "Automation", objective: "x", groups: [CORE], phase: { fromWeek: 1, toWeek: 2 }, topics: nTopics("AU", 8, 90, "core") },
        { id: "s-to", areaId: "tooling", area: "Tooling and Quality", objective: "x", groups: [CORE], phase: { fromWeek: 1, toWeek: 2 }, topics: nTopics("TO", 8, 90, "core") },
      ],
    };
    const s = buildSchedule(p);
    const w1 = s.days.filter((d) => d.week === 1 && d.study).map((d) => d.focus!.id);
    expect(new Set(w1)).toEqual(new Set(["automation", "tooling"]));
    expect(Math.abs(w1.filter((x) => x === "automation").length - w1.filter((x) => x === "tooling").length)).toBeLessThanOrEqual(1);
  });

  it("un plan de estructura antigua conserva el reparto previo (sin enfoque ni bloques)", () => {
    const p = backendPlan();
    delete p.structure;
    const s = buildSchedule(p);
    expect(s.mode).toBe("legacy");
    expect(s.days.every((d) => !d.focus && !d.blocks)).toBe(true);
  });
});
