// Motor del plan v2: modo de áreas (juntas · fases · IA), lenguajes con práctica propia, proyecto de tema calibrado al nivel, sistemas de
// práctica por área, entregables por área y RUTA (temas fuera de ruta sin borrar nada).

import { describe, expect, it } from "vitest";
import { planTogetherPhases, resolveAreaMode, suggestAreaMode, maxOverlap, planAreaPhases } from "./planAreas";
import { AREA_PRACTICE, areaPracticeOf, atomicPieceOf, dailyPieceOf, integratedDaily, weeklyPieceOf } from "./planAreaPractice";
import { areaIdsOfBranches, pickLanguage, requiredLanguages, resolveLanguages } from "./planLanguages";
import { prerequisitesOf, reduceToEssentials, validateSkips, type RouteTopic } from "./planRoute";
import { buildSchedule, deliverableAreaRows, deliverablesBy, deliverablesOf, areaRowsText, effectiveAreaMode, type SchedulePlan, type ScheduleTopic } from "./planSchedule";
import { allowedProjectLevel, calibrateTopicProject, clampProject, projectsForSubplan } from "./planTopicProject";
import { dailyProjectOf, languageBlockExercises, weeklyProjectOf } from "./planCurriculum";
import { sanitizePreconditions } from "./planTime";

const START = "2026-10-05";
const BASES = { id: "bases", title: "Bases", kind: "bases" as const, order: 0 };
const PY = { id: "lang-python", title: "Lenguaje: Python", kind: "language" as const, order: 10 };
const JS = { id: "lang-javascript", title: "Lenguaje: JavaScript", kind: "language" as const, order: 11 };
const CORE = { id: "core", title: "Conocimientos", kind: "knowledge" as const, order: 100 };
const mk = (prefix: string, n: number, group: string, extra: Partial<ScheduleTopic> = {}): ScheduleTopic[] =>
  Array.from({ length: n }, (_, i) => ({ folder: `${prefix}/${i + 1}`, title: `${prefix} ${i + 1}`, estMinutes: 60, targetWeek: 1, group, ...extra }));

function fullstack(over: Partial<SchedulePlan> = {}, o: { languages?: boolean; auto?: boolean } = {}): SchedulePlan {
  const subplans: SchedulePlan["subplans"] = [
    { id: "s-backend", areaId: "backend", area: "Backend", objective: "", groups: [BASES, PY, CORE], phase: { fromWeek: 1, toWeek: 4 }, topics: [...mk("F", 8, "bases"), ...mk("PY", 4, "lang-python"), ...mk("BE", 8, "core")] },
    { id: "s-frontend", areaId: "frontend", area: "Frontend", objective: "", groups: [JS, CORE], phase: { fromWeek: 1, toWeek: 4 }, topics: [...mk("JS", 4, "lang-javascript"), ...mk("FE", 8, "core")] },
    { id: "s-db", areaId: "databases", area: "Databases", objective: "", groups: [CORE], phase: { fromWeek: 1, toWeek: 4 }, topics: mk("DB", 8, "core") },
    ...(o.auto ? [{ id: "s-auto", areaId: "automation", area: "Automation", objective: "", groups: [CORE], phase: { fromWeek: 4, toWeek: 4 }, topics: mk("AU", 3, "core", { targetWeek: 4 }) }] : []),
  ];
  const languages = o.languages ? [{ id: "python", weight: 3, required: true }, { id: "javascript", weight: 2, required: true }, { id: "typescript", weight: 2, required: true }] : undefined;
  return {
    id: "p",
    start: START,
    end: "2026-11-01",
    structure: "areas",
    areaMode: "together",
    preconditions: { minutesPerDay: 240, studyDays: [1, 2, 3, 4, 5], pace: "intenso", areaMode: "together", ...(languages ? { languages } : {}) },
    subplans,
    ...over,
  };
}

describe("modo de áreas: reglas", () => {
  it("juntas: todas activas todo el periodo y Automation al final; por fases como siempre", () => {
    const caps = [100, 100, 100, 100];
    const t = planTogetherPhases([{ key: "b", weight: 100, areaId: "backend" }, { key: "f", weight: 100, areaId: "frontend" }, { key: "a", weight: 40, areaId: "automation" }], caps);
    expect(t.b).toEqual({ fromWeek: 1, toWeek: t.f!.toWeek });
    expect(t.a!.fromWeek).toBe(t.b!.toWeek + 1);
    expect(t.a!.toWeek).toBe(4);
    expect(maxOverlap(t)).toBeLessThanOrEqual(3);
    const solo = planTogetherPhases([{ key: "b", weight: 1, areaId: "backend" }, { key: "f", weight: 1, areaId: "frontend" }], caps);
    expect(solo.b).toEqual({ fromWeek: 1, toWeek: 4 });
    const phased = planAreaPhases([{ key: "b", weight: 1, group: "datos" }, { key: "f", weight: 1 }, { key: "x", weight: 1 }], caps);
    expect(maxOverlap(phased)).toBeLessThanOrEqual(2);
  });

  it("resolveAreaMode: lo elegido manda; «ai» usa la propuesta validada o la regla (Frontend+Backend ⇒ juntas)", () => {
    expect(resolveAreaMode(undefined, ["backend"])).toBeUndefined();
    expect(resolveAreaMode("together", ["backend", "frontend"])!.mode).toBe("together");
    expect(resolveAreaMode("phased", ["backend", "frontend"])!.mode).toBe("phased");
    const ai = resolveAreaMode("ai", ["backend", "frontend"], { mode: "phased", why: "Poco tiempo" })!;
    expect(ai).toMatchObject({ mode: "phased", by: "ai", why: "Poco tiempo" });
    expect(resolveAreaMode("ai", ["backend", "frontend"], { mode: "otro", why: "x" })!).toMatchObject({ mode: "together", by: "rules" });
    expect(resolveAreaMode("ai", ["backend", "databases"])!.mode).toBe("phased");
    expect(suggestAreaMode(["frontend", "backend", "databases"])).toBe("together");
    expect(resolveAreaMode("together", ["backend", "automation"])!.why).toContain("Automation va siempre al final");
  });

  it("un plan sin areaMode se lee como siempre (por fases)", () => {
    expect(effectiveAreaMode({ structure: "areas", preconditions: undefined })).toBe("phased");
    expect(effectiveAreaMode({ structure: "areas", areaMode: "together" })).toBe("together");
    expect(sanitizePreconditions({ areaMode: "ai" }, START).areaMode).toBe("ai");
    expect(sanitizePreconditions({}, START).areaMode).toBeUndefined();
    expect(sanitizePreconditions({}, START).languages).toBeUndefined();
  });
});

describe("modo juntas en la agenda", () => {
  it("cada día incluye bloques de TODAS las áreas elegidas, con minutos proporcionales", () => {
    const s = buildSchedule(fullstack());
    const days = s.days.filter((d) => d.study).slice(0, 5);
    expect(days.length).toBe(5);
    for (const d of days) {
      expect(d.focus!.together).toBe(true);
      expect(d.focus!.label).toBe("Full stack");
      expect(d.focus!.areaIds).toEqual(expect.arrayContaining(["backend", "frontend", "databases"]));
      const ids = d.blocks!.map((b) => b.id);
      expect(ids).toEqual(expect.arrayContaining(["backend-theory", "db-theory", "db-practice", "frontend-theory", "frontend-ui"]));
      const areas = new Set(d.blocks!.map((b) => b.areaId));
      expect(areas.has("backend") && areas.has("frontend") && areas.has("databases")).toBe(true);
      const total = d.blocks!.reduce((n, b) => n + b.minutes, 0);
      expect(total).toBeGreaterThan(0);
      expect(total + (d.projectMinutes ?? 0)).toBeLessThanOrEqual(d.capacityMinutes + 1);
    }
  });

  it("por fases (sin juntas) el día tiene UN enfoque como siempre", () => {
    const s = buildSchedule(fullstack({ areaMode: "phased", preconditions: { minutesPerDay: 240, studyDays: [1, 2, 3, 4, 5], pace: "intenso" } }));
    expect(s.days.filter((d) => d.study && d.focus).every((d) => !d.focus!.together)).toBe(true);
  });

  it("Automation sigue al final también en juntas", () => {
    const p = fullstack({}, { auto: true });
    p.subplans[0]!.phase = { fromWeek: 1, toWeek: 3 };
    p.subplans[1]!.phase = { fromWeek: 1, toWeek: 3 };
    p.subplans[2]!.phase = { fromWeek: 1, toWeek: 3 };
    const s = buildSchedule(p);
    const firstAuto = s.days.find((d) => d.focus?.areaIds?.includes("automation"));
    const lastMain = [...s.days].reverse().find((d) => d.blocks?.some((b) => b.areaId === "backend" && b.status === "topic"));
    if (firstAuto && lastMain) expect(firstAuto.date >= lastMain.date).toBe(true);
    expect(s.days.slice(0, 10).every((d) => !d.focus?.areaIds?.includes("automation"))).toBe(true);
  });

  it("proyectos diario, semanal y mensual integran las áreas juntas", () => {
    const p = fullstack();
    const s = buildSchedule(p);
    const day = s.days.find((d) => d.study)!;
    const dp = dailyProjectOf(p, s, day)!;
    expect(dp.areaIds.length).toBeGreaterThan(1);
    expect(dp.title).toMatch(/Feature del día/);
    expect(dp.description).toMatch(/interfaz/);
    expect(weeklyProjectOf(p, s, 1)!.title).toMatch(/Vertical completa/);
    const list = deliverablesOf(p, null, s);
    const daily = list.find((d) => d.kind === "daily_project")!;
    expect(daily.areaId).toBe("all");
    expect(daily.areaIds).toEqual(expect.arrayContaining(["backend", "frontend"]));
    expect(list.find((d) => d.kind === "weekly_project")!.areaId).toBe("all");
  });
});

describe("lenguajes con práctica propia", () => {
  it("obligatorios: Backend ⇒ Python+JS+TS; Frontend ⇒ JS+TS; Automation ⇒ Python", () => {
    expect(requiredLanguages(["backend"]).map((l) => l.id)).toEqual(["python", "javascript", "typescript"]);
    expect(requiredLanguages(["frontend"]).map((l) => l.id)).toEqual(["javascript", "typescript"]);
    expect(requiredLanguages(["automation"]).map((l) => l.id)).toEqual(["python"]);
    expect(requiredLanguages(["databases"])).toEqual([]);
    const r = resolveLanguages([{ id: "python", required: false, why: "" }], ["databases"]);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ id: "python", required: true });
    const all = resolveLanguages([], ["backend", "frontend"]);
    expect(all.every((l) => l.required)).toBe(true);
    expect(all.map((l) => l.why).join(" ")).toContain("Backend");
    expect(areaIdsOfBranches(["4 Backend", "5 Frontend", "6 Databases", "2.1 Python"]).sort()).toEqual(["backend", "databases", "frontend"]);
  });

  it("la rotación diaria es proporcional (Python más frecuente)", () => {
    const langs = [{ id: "python" as const, weight: 3 }, { id: "javascript" as const, weight: 2 }, { id: "typescript" as const, weight: 2 }];
    const picks = Array.from({ length: 14 }, (_, i) => pickLanguage(langs, i));
    expect(picks.filter((p) => p === "python")).toHaveLength(6);
    expect(picks.filter((p) => p === "javascript")).toHaveLength(4);
    expect(picks.filter((p) => p === "typescript")).toHaveLength(4);
  });

  it("cada día de estudio lleva un bloque «Práctica de <lenguaje>» con minutos propios, ligado a los temas del día", () => {
    const p = fullstack({}, { languages: true });
    const s = buildSchedule(p);
    const study = s.days.filter((d) => d.study);
    for (const d of study) {
      const b = d.blocks!.find((x) => x.id === "lang-daily")!;
      expect(b).toBeTruthy();
      expect(b.status).toBe("free");
      expect(b.minutes).toBeGreaterThan(0);
      expect(b.label).toMatch(/^Práctica de (Python|JavaScript|TypeScript)$/);
      expect(d.focus!.line).toContain("práctica de");
    }
    const langs = new Set(study.map((d) => d.blocks!.find((x) => x.id === "lang-daily")!.language));
    expect(langs).toEqual(new Set(["Python", "JavaScript", "TypeScript"]));
    const day = study[0]!;
    const b = day.blocks!.find((x) => x.id === "lang-daily")!;
    const ex = languageBlockExercises(p as never, day, b);
    expect(ex.length).toBeGreaterThanOrEqual(3);
    expect(ex[0]!.title).toContain(b.language!);
    // los temas del grupo «Lenguaje: Python» no se duplican: siguen siendo temas
    expect(study.some((d) => d.blocks!.some((x) => x.id === "backend-lang" && x.items.some((i) => i.folder.startsWith("PY/"))))).toBe(true);
  });

  it("sin languages en las precondiciones no hay bloque diario de lenguaje (planes antiguos)", () => {
    const s = buildSchedule(fullstack());
    expect(s.days.every((d) => !d.blocks?.some((b) => b.id === "lang-daily"))).toBe(true);
  });
});

describe("proyecto de tema calibrado al nivel", () => {
  const topic = { folder: "P/Funciones", title: "Funciones", areaId: "backend", groupKind: "language", language: "Python" };
  it("sin base (nada medido, nivel «empezando») ⇒ micro", () => {
    const p = calibrateTopicProject(topic, "empezando", { required: [] });
    expect(p.level).toBe("micro");
    expect(p.basis).toBe("declarado");
    expect(p.title).toMatch(/Imprime tu nombre/);
  });
  it("sin actividad medida y nivel avanzado, un tema sin previos nunca pasa de guiado", () => {
    expect(calibrateTopicProject(topic, "avanzado", { required: [] }).level).toBe("guiado");
  });
  it("con dominio medido de los temas requeridos ⇒ aplicado (calculadora)", () => {
    const req = [1, 2].map((i) => ({ folder: `P/${i}`, pct: 90, attempts: 12 }));
    const p = calibrateTopicProject(topic, "intermedio", { own: { folder: topic.folder, pct: 80, attempts: 5 }, required: req });
    expect(p.level).toBe("aplicado");
    expect(p.basis).toBe("medido");
    expect(p.title).toMatch(/Calculadora/);
    expect(p.requires).toEqual(["P/1", "P/2"]);
  });
  it("lo medido manda sobre lo declarado: avanzado declarado pero casi nada medido ⇒ micro/guiado", () => {
    const req = [1, 2, 3].map((i) => ({ folder: `P/${i}`, pct: 10, attempts: 3 }));
    expect(allowedProjectLevel("avanzado", { required: req }).level).toBe("micro");
  });
  it("la IA NO puede subir el nivel: se recorta al permitido", () => {
    const base = calibrateTopicProject(topic, "empezando", { required: [] });
    const clipped = clampProject({ title: "Plataforma completa", description: "x", level: "integrador" }, base);
    expect(clipped).toEqual(base);
    const ok = clampProject({ title: "Saludo en 3 formatos", description: "ok", level: "micro" }, base);
    expect(ok.source).toBe("ai");
    expect(ok.title).toBe("Saludo en 3 formatos");
  });
  it("projectsForSubplan: solo temas vivos y pendientes, con previos del mismo grupo", () => {
    const sub = { id: "s", area: "Backend", areaId: "backend", groups: [{ id: "bases", kind: "bases", title: "Bases" }], topics: [{ folder: "a", title: "A", group: "bases" }, { folder: "b", title: "B", group: "bases" }, { folder: "c", title: "C", group: "bases", route: "skipped" }, { folder: "d", title: "D", group: "bases", completedAt: "2026-10-01" }] };
    const m = projectsForSubplan(sub, () => "basico", (f) => (f === "a" ? { pct: 100, attempts: 9 } : undefined));
    expect([...m.keys()]).toEqual(["a", "b"]);
    expect(m.get("b")!.requires).toEqual(["a"]);
  });
  it("aparece como bloque del día en que se completa el tema y cuenta como entregable", () => {
    const p = fullstack({}, {});
    p.subplans[2]!.topics = p.subplans[2]!.topics.map((t) => ({ ...t, topicProject: calibrateTopicProject({ folder: t.folder, title: t.title, areaId: "databases" }, "basico", { required: [] }) }));
    const s = buildSchedule(p);
    const withTp = s.days.filter((d) => d.topicProjects?.length);
    expect(withTp.length).toBeGreaterThan(0);
    const list = deliverablesOf(p, null, s);
    const tps = list.filter((d) => d.kind === "topic_project");
    expect(tps.length).toBe(s.days.reduce((n, d) => n + (d.topicProjects?.length ?? 0), 0));
    expect(tps[0]!.areaId).toBe("databases");
    expect(tps[0]!.title).toContain("Proyecto del tema");
  });
});

describe("sistema de práctica por área", () => {
  it("la tabla cubre las 8 áreas con diario, semanal, mensual, medida y lenguajes", () => {
    for (const a of ["backend", "frontend", "databases", "logic", "automation", "tooling", "desktop", "mobile"]) {
      const s = areaPracticeOf(a)!;
      expect(s.daily.examples.length).toBeGreaterThan(1);
      expect(s.weekly.title && s.monthly.title && s.measure).toBeTruthy();
      expect(s.languages.length).toBeGreaterThan(0);
    }
    expect(Object.keys(AREA_PRACTICE)).toHaveLength(8);
  });
  it("Frontend: componente atómico diario (átomos → moléculas → organismos) y página completa semanal", () => {
    expect(atomicPieceOf(0).level).toBe("átomo");
    expect(new Set(Array.from({ length: 12 }, (_, i) => atomicPieceOf(i).level))).toEqual(new Set(["átomo", "molécula", "organismo"]));
    const d = dailyPieceOf("frontend", 4, ["Flexbox"], { lang: "JavaScript" })!;
    expect(d.title).toMatch(/Componente organismo: navbar/);
    expect(d.description).toMatch(/Atomic Design/);
    expect(weeklyPieceOf("frontend", 2, ["navbar", "hero"])!.title).toMatch(/Página completa/);
    expect(integratedDaily(["frontend", "backend", "databases"], ["Rutas"], 0).description).toMatch(/endpoint.*tabla/);
  });
  it("un plan solo de Frontend usa el sistema Atomic Design en sus proyectos", () => {
    const p: SchedulePlan = { id: "f", start: START, end: "2026-10-18", structure: "areas", preconditions: { minutesPerDay: 180, studyDays: [1, 2, 3, 4, 5], pace: "intenso" }, subplans: [{ id: "s-fe", areaId: "frontend", area: "Frontend", objective: "", groups: [JS, CORE], phase: { fromWeek: 1, toWeek: 2 }, topics: [...mk("JS", 3, "lang-javascript"), ...mk("FE", 8, "core")] }] };
    const s = buildSchedule(p);
    const day = s.days.find((d) => d.study)!;
    expect(dailyProjectOf(p, s, day)!.title).toMatch(/Componente (átomo|molécula|organismo)/);
    expect(weeklyProjectOf(p, s, 1)!.title).toMatch(/Página completa/);
  });
});

describe("entregables por área, día, semana y mes", () => {
  it("deliverablesBy filtra por día/semana/mes/área y el desglose por área particiona el total", () => {
    const p = fullstack({}, { languages: false });
    p.subplans[0]!.deliverable = { title: "API", description: "", criteria: [], status: "idea" };
    p.subplans[1]!.deliverable = { title: "Web", description: "", criteria: [], status: "hecho" };
    const s = buildSchedule(p);
    const all = deliverablesBy(p, {}, null, s);
    expect(all.length).toBeGreaterThan(10);
    const w1 = deliverablesBy(p, { week: 1 }, null, s);
    expect(w1.every((d) => d.dueDate >= START && d.dueDate <= "2026-10-11")).toBe(true);
    const day = deliverablesBy(p, { day: START }, null, s);
    expect(day.every((d) => d.dueDate === START)).toBe(true);
    expect(deliverablesBy(p, { month: "2026-11" }, null, s).every((d) => d.dueDate.startsWith("2026-11"))).toBe(true);
    const be = deliverablesBy(p, { area: "backend" }, null, s);
    expect(be.some((d) => d.kind === "area_project" && d.areaId === "backend")).toBe(true);
    expect(be.some((d) => d.areaId === "all")).toBe(true);
    expect(deliverablesBy(p, { area: "frontend", kind: "area_project" }, null, s)).toHaveLength(1);
    const names = p.subplans.map((x) => ({ id: x.areaId!, name: x.area }));
    const rows = deliverableAreaRows(all, names);
    expect(rows.reduce((n, r) => n + r.total, 0)).toBe(all.length);
    expect(rows.find((r) => r.id === "frontend")!.done).toBe(0); // el estado del proyecto de área se deriva de la cadena: un «hecho» guardado a mano no cuenta
    expect(areaRowsText(rows)).toMatch(/Backend \d+ · Frontend \d+/);
  });
});

describe("ruta: reducir a lo esencial sin borrar", () => {
  const T = (i: number, extra: Partial<RouteTopic> = {}): RouteTopic => ({ folder: `B/${i}`, title: `Concepto ${String.fromCharCode(97 + (i % 26))}${String.fromCharCode(97 + Math.floor(i / 26))}${i % 7 === 0 ? "x" : "y"}`, group: "bases", groupKind: "bases", estMinutes: 30, ...extra });
  const bases = Array.from({ length: 75 }, (_, i) => T(i + 1));

  it("75 → ≤30: salta los menos necesarios y respeta lo en curso, lo completado y lo fijado", () => {
    const topics = bases.map((t, i) => (i === 74 ? { ...t, attempts: 5, pct: 20 } : i === 0 ? { ...t, completedAt: "2026-10-01" } : i === 73 ? { ...t, pinned: true } : t));
    const r = reduceToEssentials(topics, { max: 30, level: "basico" });
    expect(r.live).toBeLessThanOrEqual(30);
    expect(r.skip.length).toBe(75 - r.live);
    const skipped = new Set(r.skip.map((s) => s.folder));
    expect(skipped.has("B/75")).toBe(false);
    expect(skipped.has("B/74")).toBe(false);
    expect(skipped.has("B/1")).toBe(false);
    expect(r.skip.every((s) => s.reason.length > 3)).toBe(true);
  });
  it("lo dominado se salta primero", () => {
    const topics = bases.map((t, i) => (i === 3 ? { ...t, pct: 95 } : t));
    expect(reduceToEssentials(topics, { max: 74 }).skip[0]!.folder).toBe("B/4");
  });
  it("nunca salta un prerrequisito de un tema que se queda (series «X», «X 2»)", () => {
    const series: RouteTopic[] = [T(1, { title: "Bucles" }), T(2, { title: "Bucles 2" }), T(3, { title: "Bucles 3" }), T(4, { title: "Otro" })];
    expect([...(prerequisitesOf(series).get("B/3") ?? [])]).toEqual(["B/2"]);
    const r = reduceToEssentials(series, { max: 3 });
    const gone = r.skip.map((s) => s.folder);
    expect(gone).toHaveLength(1);
    expect(gone[0]).not.toBe("B/1");
    expect(gone[0]).not.toBe("B/2");
    const v = validateSkips(series, ["B/1", "B/4", "nope"]);
    expect(v.ok).toEqual(["B/4"]);
    expect(v.rejected.map((x) => x.folder).sort()).toEqual(["B/1", "nope"]);
    expect(validateSkips(series, ["B/1", "B/2", "B/3"]).ok).toHaveLength(3);
  });
  it("los saltados no cuentan en el reparto ni en la agenda, pero siguen en el plan (reactivables)", () => {
    const p = fullstack();
    const before = buildSchedule(p).days.reduce((n, d) => n + d.topicMinutes, 0);
    const skipped = { ...p, subplans: p.subplans.map((s, i) => (i === 0 ? { ...s, topics: s.topics.map((t, j) => (j < 4 ? { ...t, route: "skipped" } : t)) } : s)) };
    const sch = buildSchedule(skipped);
    const gone = new Set(skipped.subplans[0]!.topics.filter((t) => t.route === "skipped").map((t) => t.folder));
    expect(sch.days.every((d) => d.topics.every((t) => !gone.has(t.folder)))).toBe(true);
    expect(sch.days.reduce((n, d) => n + d.topicMinutes, 0)).toBeLessThan(before);
    expect(skipped.subplans[0]!.topics).toHaveLength(p.subplans[0]!.topics.length);
  });
});
