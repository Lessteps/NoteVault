// Currículo de práctica del plan y proyectos diario / semanal / mensual: validación estricta, plantillas por tipo de tema, ejercicios del vault
// priorizados, conexión de los proyectos con los temas del día, acumulación semanal/mensual y conteo como entregables.

import { describe, expect, it } from "vitest";
import {
  dailyProjectOf,
  dayExercisesOf,
  dayLogicOf,
  monthlyBlocksOf,
  sanitizeCurriculum,
  sanitizeCurriculumWeek,
  scopeOfPlan,
  templateCurriculumWeek,
  templateExercise,
  weeklyProjectOf,
  weekPracticeTopics,
} from "./planCurriculum";
import { buildSchedule, countDeliverables, deliverablesBetween, deliverablesOf, type SchedulePlan, type ScheduleTopic } from "./planSchedule";
import { buildPracticeTrack } from "./practiceTrack";

const START = "2026-10-05";
const BASES = { id: "bases", title: "Bases", kind: "bases" as const, order: 0 };
const PY = { id: "lang-python", title: "Lenguaje: Python", kind: "language" as const, order: 10 };
const CORE = { id: "core", title: "Conocimientos", kind: "knowledge" as const, order: 100 };
const t = (folder: string, title: string, est: number, group: string): ScheduleTopic => ({ folder, title, estMinutes: est, targetWeek: 1, group });

function plan(over: Partial<SchedulePlan> = {}): SchedulePlan {
  return {
    id: "p1",
    start: START,
    end: "2026-11-29", // 8 semanas: cruza octubre y noviembre
    structure: "areas",
    preconditions: { minutesPerDay: 360, studyDays: [1, 2, 3, 4, 5], pace: "intenso" },
    subplans: [
      { id: "s-be", areaId: "backend", area: "Backend", objective: "x", groups: [BASES, PY, CORE], phase: { fromWeek: 1, toWeek: 8 }, topics: [t("F/1", "1.1 Qué es programar", 60, "bases"), t("PY/1", "2.1.4 Funciones", 60, "lang-python"), t("PY/2", "2.1.5 Clases", 60, "lang-python"), t("BE/1", "4.1 What the backend is", 60, "core"), t("BE/2", "4.2 HTTP in depth", 60, "core")] },
      { id: "s-db", areaId: "databases", area: "Databases", objective: "x", groups: [CORE], phase: { fromWeek: 1, toWeek: 8 }, topics: [t("DB/1", "6.1 El modelo relacional", 60, "core"), t("DB/2", "6.5 JOINs and aggregations", 60, "core")] },
    ],
    ...over,
  };
}
const folders = (p: SchedulePlan) => new Set(p.subplans.flatMap((s) => s.topics.map((x) => x.folder)));

describe("validación estricta del currículo", () => {
  it("descarta temas que no son del plan, semanas fuera del plan y recorta textos; ignora fechas y minutos", () => {
    const p = plan();
    const scope = scopeOfPlan(p);
    const w = sanitizeCurriculumWeek(
      {
        week: 2,
        exercises: [
          { topic: "PY/1", practice: "language", language: "Python", title: "Escribe un cliente HTTP en Python que " + "x".repeat(300), statement: "y".repeat(500), date: "2030-01-01", minutes: 999 },
          { topic: "INVENTADO/9", title: "No existe" },
          { topic: "DB/1", practice: "database", title: "Diseña la tabla y escribe la consulta con JOIN que cruce pedidos y clientes" },
          { topic: "DB/1", practice: "database", title: "Diseña la tabla y escribe la consulta con JOIN que cruce pedidos y clientes" },
          { topic: "BE/1", title: "" },
        ],
        logic: [{ title: "Dos sumas" }, { title: "" }],
        weeklyProject: { title: "API de pedidos", description: "d".repeat(900) },
        dailyProjects: [{ topic: "BE/2", title: "Endpoint GET /productos" }, { topic: "NOPE", title: "x" }, { topic: "BE/2", title: "repetido" }],
        startDate: "2020-01-01",
      },
      scope,
      "ai",
    )!;
    expect(w.week).toBe(2);
    expect(w.exercises).toHaveLength(2);
    expect(w.exercises[0]!.title.length).toBeLessThanOrEqual(120);
    expect(w.exercises[0]!.statement!.length).toBeLessThanOrEqual(280);
    expect(JSON.stringify(w)).not.toMatch(/2030|999|2020/);
    expect(w.exercises.every((e) => folders(p).has(e.topic) && e.source === "ai")).toBe(true);
    expect(w.logic).toHaveLength(1);
    expect(w.weeklyProject!.description!.length).toBeLessThanOrEqual(320);
    expect(w.dailyProjects).toEqual([expect.objectContaining({ topic: "BE/2", title: "Endpoint GET /productos" })]);
    expect(sanitizeCurriculumWeek({ week: 99, exercises: [] }, scope, "ai")).toBeNull();
    expect(sanitizeCurriculumWeek("x", scope, "ai")).toBeNull();
  });

  it("leer de disco nunca lanza: lo inválido se descarta y lo vacío da undefined", () => {
    const scope = scopeOfPlan(plan());
    expect(sanitizeCurriculum(null, scope)).toBeUndefined();
    expect(sanitizeCurriculum({ weeks: [{ week: 1 }], monthly: [{ month: "2031-01", title: "x" }] }, scope)).toBeUndefined();
    const ok = sanitizeCurriculum({ generatedAt: "2026-10-06T10:00:00Z", weeks: [{ week: 3, source: "ai", exercises: [{ topic: "BE/1", title: "Ejercicio", practice: "area" }] }], monthly: [{ month: "2026-10", title: "Mini plataforma", source: "ai" }] }, scope)!;
    expect(ok.weeks).toHaveLength(1);
    expect(ok.source).toBe("ai");
    expect(ok.monthly[0]!.title).toBe("Mini plataforma");
  });
});

describe("plantillas deterministas por tipo de tema (sin IA)", () => {
  it("«Practica <tema> en <lenguaje>: 3 ejercicios del tema» y equivalentes por tipo", () => {
    expect(templateExercise("language", "2.1.4 Funciones", "Python").title).toBe("Practica Funciones en Python: 3 ejercicios del tema");
    expect(templateExercise("database", "6.5 JOINs and aggregations").title).toMatch(/tabla y escribe la consulta.*JOINs and aggregations.*SQL/);
    expect(templateExercise("ui", "5.4 DOM").title).toMatch(/componente/);
    expect(templateExercise("scripting", "7.2 Scripts", "Python").title).toMatch(/Automatiza.*Python/);
    expect(templateExercise("tooling", "9.2 Git").title).toMatch(/repositorio de práctica/);
  });

  it("la semana de plantilla cubre los temas que se practican esa semana y deja las marcas «template»", () => {
    const s = buildSchedule(plan());
    const topics = weekPracticeTopics(s, 1);
    expect(topics.some((x) => x.practice === "language" && x.language === "Python")).toBe(true);
    expect(topics.some((x) => x.practice === "database" && x.language === "SQL")).toBe(true);
    const w = templateCurriculumWeek(s, 1);
    expect(w.source).toBe("template");
    expect(w.exercises.every((e) => e.source === "template")).toBe(true);
    expect(w.logic.length).toBeGreaterThanOrEqual(3);
  });

  it("los temas que ya tienen ejercicios en la vault se priorizan y se enlazan; la plantilla no los reemplaza", () => {
    const p = plan();
    const s = buildSchedule(p);
    const existing = { count: (f: string) => (f === "DB/1" ? 4 : 0) };
    const w = templateCurriculumWeek(s, 1, existing);
    const db1 = w.exercises.filter((e) => e.topic === "DB/1");
    expect(db1.every((e) => e.source === "vault" && e.existing === 4)).toBe(true);
    const day = s.byDate.get(START)!;
    const block = day.blocks!.find((b) => b.id === "db-practice")!;
    const ex = dayExercisesOf({ practiceCurriculum: undefined }, day, block, existing);
    expect(ex[0]).toMatchObject({ source: "vault", existing: 4, folder: "DB/1", auto: false });
    expect(ex[0]!.title).toMatch(/4 en tu vault/);
    // con 4 temas al día, los demás temas del bloque (sin ejercicios en la vault) sí llevan plantilla; el que ya tiene ejercicios, no
    expect(ex.filter((e) => e.source === "template").every((e) => e.folder !== "DB/1")).toBe(true);
    // sin ejercicios en la vault: plantilla marcada como automática
    const auto = dayExercisesOf({ practiceCurriculum: undefined }, day, block);
    expect(auto[0]).toMatchObject({ source: "template", auto: true });
  });

  it("con currículo de la IA, el ejercicio del día es el del tema que se practica ese día (la app decide el día)", () => {
    const p = plan();
    const s = buildSchedule(p);
    const day = s.byDate.get(START)!;
    const first = day.blocks!.find((b) => b.id === "db-practice")!.items[0]!;
    const cur = sanitizeCurriculum({ weeks: [{ week: 1, source: "ai", exercises: [{ topic: first.folder, practice: "database", title: "Diseña la tabla clientes y escribe la consulta con JOIN que liste sus pedidos" }] }] }, scopeOfPlan(p))!;
    const ex = dayExercisesOf({ practiceCurriculum: cur }, day, day.blocks!.find((b) => b.id === "db-practice")!);
    expect(ex[0]).toMatchObject({ source: "ai", auto: false, folder: first.folder });
    expect(ex[0]!.title).toMatch(/JOIN/);
    // reto de lógica del día: del currículo si lo hay, si no de plantilla marcada como automática
    const track = buildPracticeTrack({ start: START, end: "2026-11-29", minutesPerDay: 360, studyDays: [1, 2, 3, 4, 5], pace: "intenso", goalIds: [], subjects: [], levels: {}, deliverables: "no", practice: { kataMinutes: 30, sessionsPerWeek: 2, minutesPerSession: 60, monthly: true, focus: "rotate" } } as never)!;
    const p2 = plan({ programmingPractice: track });
    const s2 = buildSchedule(p2);
    const d2 = s2.byDate.get(START)!;
    expect(dayLogicOf(p2, s2, d2)).toMatchObject({ auto: true, source: "template" });
    const cur2 = sanitizeCurriculum({ weeks: [{ week: 1, source: "ai", logic: [{ title: "Agrupa pedidos por cliente" }] }] }, scopeOfPlan(p2))!;
    expect(dayLogicOf({ ...p2, practiceCurriculum: cur2 }, s2, d2)).toMatchObject({ title: "Agrupa pedidos por cliente", auto: false });
  });
});

describe("proyectos diario, semanal y mensual conectados a lo estudiado", () => {
  it("el proyecto diario aplica los temas de teoría y práctica de ESE día (Backend: endpoint + BD)", () => {
    const p = plan();
    const s = buildSchedule(p);
    const day = s.byDate.get(START)!;
    const dp = dailyProjectOf(p, s, day)!;
    expect(dp.id).toBe(`dp:${START}`);
    expect(dp.title).toMatch(/Mini-endpoint/);
    const dayTopics = new Set(day.topics.map((x) => x.folder));
    expect(dp.topics.length).toBeGreaterThanOrEqual(3);
    expect(dp.topics.every((x) => dayTopics.has(x.folder))).toBe(true);
    expect(dp.topics.some((x) => x.role === "theory") && dp.topics.some((x) => x.role === "practice")).toBe(true);
    expect(dp.minutes).toBe(day.projectMinutes);
    expect(dp.weeklyPart).toMatch(/Pieza 1 de \d+ del proyecto semanal/);
    // un día sin estudio no tiene proyecto
    expect(dailyProjectOf(p, s, s.byDate.get("2026-10-10")!)).toBeNull();
  });

  it("el título del proyecto diario puede venir de la IA si apunta a un tema del día; si no, plantilla", () => {
    const p = plan();
    const s = buildSchedule(p);
    const day = s.byDate.get(START)!;
    const be = day.blocks!.find((b) => b.id === "backend-theory")!.items[0]!.folder;
    const cur = sanitizeCurriculum({ weeks: [{ week: 1, source: "ai", dailyProjects: [{ topic: be, title: "Endpoint GET /productos que lee de PostgreSQL con JOIN", description: "Aplica HTTP y SQL" }] }] }, scopeOfPlan(p))!;
    const dp = dailyProjectOf({ ...p, practiceCurriculum: cur }, s, day)!;
    expect(dp).toMatchObject({ title: "Endpoint GET /productos que lee de PostgreSQL con JOIN", source: "ai" });
  });

  it("el semanal acumula los diarios de la semana y el mensual integra los semanales del mes", () => {
    const p = plan();
    const s = buildSchedule(p);
    const wp = weeklyProjectOf(p, s, 1)!;
    expect(wp.id).toBe("ww:1");
    expect(wp.dailyIds).toHaveLength(5);
    expect(wp.dailyTitles).toHaveLength(5);
    expect(wp.title).toMatch(/Proyecto semanal 1/);
    const months = monthlyBlocksOf(p, s);
    expect(months.map((m) => m.id)).toEqual(["mm:2026-10", "mm:2026-11"]);
    expect(months[0]!.weeklyIds).toContain("ww:1");
    expect(months[1]!.weeklyIds.length).toBeGreaterThan(0);
  });

  it("con Programming practice, el semanal y el mensual son los de la pista (wp / mp) y no se duplican", () => {
    const track = buildPracticeTrack({ start: START, end: "2026-11-29", minutesPerDay: 360, studyDays: [1, 2, 3, 4, 5], pace: "intenso", goalIds: [], subjects: [], levels: {}, deliverables: "no", practice: { kataMinutes: 30, sessionsPerWeek: 2, minutesPerSession: 60, monthly: true, focus: "rotate" } } as never)!;
    const p = plan({ programmingPractice: track });
    const s = buildSchedule(p);
    const all = deliverablesOf(p, null, s);
    expect(weeklyProjectOf(p, s, 1)!.id).toBe("wp:1");
    expect(all.filter((d) => d.kind === "weekly_project" && d.id.startsWith("ww:"))).toHaveLength(0);
    expect(all.filter((d) => d.id === "wp:1")).toHaveLength(1);
    expect(all.filter((d) => d.kind === "monthly_project").every((d) => d.id.startsWith("mp:"))).toBe(true);
  });

  it("los proyectos son entregables y cuentan por día, semana y mes; un estado anotado a mano NO cuenta: el estado se deriva de lo completado", () => {
    const p = plan();
    const s = buildSchedule(p);
    const all = deliverablesOf(p, null, s);
    expect(all.filter((d) => d.kind === "daily_project")).toHaveLength(s.days.filter((d) => d.projectMinutes).length);
    expect(deliverablesBetween(all, START, START).map((d) => d.kind)).toContain("daily_project");
    const week1 = deliverablesBetween(all, START, "2026-10-11");
    expect(week1.filter((d) => d.kind === "daily_project")).toHaveLength(5);
    expect(week1.some((d) => d.id === "ww:1")).toBe(true);
    expect(countDeliverables(week1).total).toBe(week1.length);
    const month = deliverablesBetween(all, "2026-10-01", "2026-10-31");
    expect(month.some((d) => d.id === "mm:2026-10")).toBe(true);
    // un estado guardado a mano se ignora (solo se conservan los archivos)
    const done = deliverablesOf({ ...p, deliverables: [{ ...all.find((d) => d.id === `dp:${START}`)!, title: "viejo", status: "hecho" }] }, null, s);
    const dp = done.find((d) => d.id === `dp:${START}`)!;
    expect(dp.status).toBe("pendiente");
    expect(dp.title).not.toBe("viejo"); // el título se deriva siempre del reparto actual
  });

  it("el título del proyecto semanal y mensual puede venir del currículo", () => {
    const p = plan();
    const s = buildSchedule(p);
    const cur = sanitizeCurriculum({ weeks: [{ week: 1, source: "ai", weeklyProject: { title: "API de pedidos", description: "CRUD + SQL" } }], monthly: [{ month: "2026-10", title: "Mini tienda", description: "Integra los semanales", source: "ai" }] }, scopeOfPlan(p))!;
    const wp = weeklyProjectOf({ ...p, practiceCurriculum: cur }, s, 1)!;
    expect(wp).toMatchObject({ title: "API de pedidos", source: "ai" });
    const m = monthlyBlocksOf({ ...p, practiceCurriculum: cur }, s)[0]!;
    expect(m).toMatchObject({ title: "Mini tienda", source: "ai" });
    const all = deliverablesOf({ ...p, practiceCurriculum: cur }, null, s);
    expect(all.find((d) => d.id === "ww:1")!.title).toBe("API de pedidos");
    expect(all.find((d) => d.id === "mm:2026-10")!.title).toBe("Mini tienda");
  });
});
