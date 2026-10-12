// Pedir cambios con el modelo por ÁREAS: operaciones por área y grupo (mover un tema o grupo de área, añadir/quitar un área, fases, orden,
// entregables propios, propósitos), intérprete por palabras clave y validación estricta del parche de la IA.

import { describe, expect, it } from "vitest";
import { maxOverlap } from "../../lib/planAreas.js";
import type { CatalogTopic } from "./goalDraft.js";
import { buildPlan, type Plan, type SubplanSeed } from "./plan.js";
import { applyOps, opsFromText, parseChangeReply, summaryOfPlan, type ChangeCtx } from "./planChange.js";
import { reorganizeByAreas } from "./planReorganize.js";

const START = "2026-10-06";
const END = "2027-04-05";
const topics = (branch: string, n: number) => Array.from({ length: n }, (_, i) => ({ folder: `Programación/${branch}/T${String(i + 1).padStart(2, "0")}`, title: `${branch.replace(/^[\d.\s]+/, "")} ${i + 1}`, estMinutes: 60 }));
const seed = (branch: string, n: number, extra: Partial<SubplanSeed> = {}): SubplanSeed => ({ area: "Programación", objective: `Avanzar en ${branch}`, topics: topics(branch, n), ...extra });

function areasPlan(): Plan {
  const pre = { start: START, end: END, minutesPerDay: 240, studyDays: [1, 2, 3, 4, 5, 6, 7], pace: "intenso" as const, goalIds: [], subjects: ["Programación"], levels: {}, deliverables: "ask" as const, areaMode: "phased" as const };
  const legacy = buildPlan([seed("1 Fundamentals", 8), seed("2.1 Python", 6), seed("4 Backend", 8), seed("5 Frontend", 6), seed("6 Databases", 5), seed("2.2 JavaScript", 4)], { start: START, end: END, minutesPerDay: 240, studyDays: pre.studyDays, pace: "intenso", from: START, id: `${START}_${END}`, preconditions: pre }).plan;
  return reorganizeByAreas(legacy, { today: START })!.plan;
}
const cat = (folder: string, over: Partial<CatalogTopic> = {}): CatalogTopic => ({ folder, title: folder.split("/").pop()!, subject: "Programación", skills: ["a"], completenessPct: 0, estMinutes: 60, ...over });
const ctx = (extra: CatalogTopic[] = []): ChangeCtx => ({ today: START, all: [...topics("3 Desktop Apps (Electron)", 5).map((t) => cat(t.folder)), ...extra] });
const area = (p: Plan, id: string) => p.subplans.find((s) => s.areaId === id)!;

describe("operaciones por área y grupo", () => {
  it("el plan de partida está organizado por áreas con fases", () => {
    const p = areasPlan();
    expect(p.subplans.map((s) => s.areaId)).toEqual(["backend", "databases", "frontend"]);
    expect(maxOverlap(Object.fromEntries(p.subplans.map((s) => [s.id, s.phase!])))).toBeLessThanOrEqual(2);
  });

  it("mover un GRUPO entero de un área a otra («el lenguaje Python va a Automation») conserva sus temas y actualiza los grupos de ambas", () => {
    const p = areasPlan();
    const withAuto = applyOps(p, [{ op: "add_area", areaId: "automation" }], { today: START, all: [...ctx().all, ...topics("7 Automation", 4).map((t) => cat(t.folder))] }).plan;
    expect(withAuto.subplans.map((s) => s.areaId)).toContain("automation");
    const r = applyOps(withAuto, [{ op: "move_group", subplan: area(withAuto, "backend").id, group: "lang-python", to: "automation" }], ctx());
    expect(r.applied).toBe(1);
    expect(r.delta.structure).toBe(1);
    const be = area(r.plan, "backend");
    const au = area(r.plan, "automation");
    expect(be.groups!.map((g) => g.id)).toEqual(["bases", "core"]);
    expect(be.topics.some((t) => /Python/.test(t.folder))).toBe(false);
    expect(au.groups!.map((g) => g.id)).toContain("lang-python");
    expect(au.topics.filter((t) => t.group === "lang-python")).toHaveLength(6);
    // ningún tema se perdió
    const count = (pl: Plan) => pl.subplans.reduce((n, s) => n + s.topics.length, 0);
    expect(count(r.plan)).toBe(count(withAuto));
  });

  it("mover un tema a otra área le da el grupo «Conocimientos» de ella", () => {
    const p = areasPlan();
    const folder = area(p, "frontend").topics.find((t) => t.group === "core")!.folder;
    const r = applyOps(p, [{ op: "move_topic_area", folder, to: "databases" }], ctx());
    expect(area(r.plan, "databases").topics.find((t) => t.folder === folder)).toMatchObject({ group: "core" });
    expect(area(r.plan, "frontend").topics.some((t) => t.folder === folder)).toBe(false);
  });

  it("añadir un área que no está (Desktop) trae sus temas pendientes del catálogo y recalcula las fases (≤ 2 en paralelo); quitar un área la saca", () => {
    const p = areasPlan();
    const r = applyOps(p, [{ op: "add_area", areaId: "desktop" }], ctx());
    expect(r.plan.subplans.map((s) => s.areaId)).toContain("desktop");
    expect(area(r.plan, "desktop").topics).toHaveLength(5);
    expect(maxOverlap(Object.fromEntries(r.plan.subplans.map((s) => [s.id, s.phase!])))).toBeLessThanOrEqual(2);
    const gone = applyOps(r.plan, [{ op: "remove_subplan", subplan: "desktop" }], ctx()); // por id de área
    expect(gone.plan.subplans.map((s) => s.areaId)).not.toContain("desktop");
    // un área sin temas pendientes no se añade
    expect(applyOps(p, [{ op: "add_area", areaId: "mobile" }], ctx()).applied).toBe(0);
  });

  it("reordenar las áreas («más SQL antes del backend») recalcula las fases con el nuevo orden y no pierde temas", () => {
    const p = areasPlan();
    const before = p.subplans.reduce((n, s) => n + s.topics.length, 0);
    const r = applyOps(p, [{ op: "set_area_order", order: ["databases", "backend"] }], ctx());
    expect(r.applied).toBe(1);
    expect(r.plan.subplans.map((s) => s.areaId).slice(0, 2)).toEqual(["databases", "backend"]);
    expect(r.plan.subplans.reduce((n, s) => n + s.topics.length, 0)).toBe(before);
    expect(maxOverlap(Object.fromEntries(r.plan.subplans.map((s) => [s.id, s.phase!])))).toBeLessThanOrEqual(2);
    // el que va primero empieza en la semana 1
    expect(area(r.plan, "databases").phase!.fromWeek).toBe(1);
  });

  it("cambiar la fase de un área mueve sus temas a esas semanas; más de 2 áreas en paralelo se rechaza y se recalcula", () => {
    const p = areasPlan();
    const fe = area(p, "frontend");
    // detrás de las otras dos áreas: sin solaparse
    const from = Math.max(area(p, "backend").phase!.toWeek, area(p, "databases").phase!.toWeek) + 1;
    const r = applyOps(p, [{ op: "set_phase", subplan: "frontend", fromWeek: from, toWeek: from + 3 }], ctx());
    expect(r.applied).toBe(1);
    expect(area(r.plan, "frontend").phase).toEqual({ fromWeek: from, toWeek: from + 3 });
    expect(area(r.plan, "frontend").topics.filter((t) => !t.pinned).every((t) => t.targetWeek >= from && t.targetWeek <= from + 3)).toBe(true);
    expect(area(r.plan, "frontend").id).toBe(fe.id);
    // solapada con las otras dos (3 áreas en las mismas semanas): se rechaza y se recalculan las fases, con aviso
    const three = applyOps(p, [{ op: "set_phase", subplan: "frontend", fromWeek: 1, toWeek: 4 }], ctx());
    expect(three.warnings.join()).toContain("más de 2 áreas en paralelo");
    expect(maxOverlap(Object.fromEntries(three.plan.subplans.map((s) => [s.id, s.phase!])))).toBeLessThanOrEqual(2);
    // fuera del plan: se ignora
    expect(applyOps(p, [{ op: "set_phase", subplan: "frontend", fromWeek: 99, toWeek: 120 }], ctx()).applied).toBe(0);
  });

  it("un entregable propio y un propósito se guardan SIN tocar el reparto de los temas", () => {
    const p = areasPlan();
    const r = applyOps(
      p,
      [
        { op: "add_deliverable", title: "Mini API CRUD", description: "con tests", criteria: ["CRUD"], subplan: "backend", dueDate: "2026-11-20" },
        { op: "set_purpose", scope: "week", key: "3", text: "Semana de HTTP y APIs" },
        { op: "set_purpose", scope: "day", key: "2026-10-08", text: "Hoy: kata y repaso" },
        { op: "set_purpose", scope: "week", key: "99", text: "no existe" },
      ],
      ctx(),
    );
    expect(r.applied).toBe(3);
    expect(r.delta).toMatchObject({ added: 0, removed: 0, moved: 0, deliverables: 1, texts: 2 });
    expect(r.plan.deliverables).toEqual([expect.objectContaining({ id: "x:1", kind: "area_project", areaId: "backend", dueDate: "2026-11-20", status: "pendiente", source: "ai" })]);
    expect(r.plan.purposes).toEqual({ week: { "3": "Semana de HTTP y APIs" }, day: { "2026-10-08": "Hoy: kata y repaso" } });
    expect(JSON.stringify(r.plan.subplans)).toBe(JSON.stringify(p.subplans)); // los temas y sus semanas, intactos
    // texto vacío = volver al automático
    const back = applyOps(r.plan, [{ op: "set_purpose", scope: "week", key: "3", text: "" }], ctx());
    expect(back.plan.purposes).toEqual({ day: { "2026-10-08": "Hoy: kata y repaso" } });
    // la fecha del entregable se acota al plan
    expect(applyOps(p, [{ op: "add_deliverable", title: "T", description: "", criteria: [], dueDate: "2099-01-01" }], ctx()).plan.deliverables![0]!.dueDate).toBe(END);
  });

  it("el entregable de un área («un entregable al área de Backend») usa el proyecto propio del área, no el texto genérico", () => {
    const p = areasPlan();
    const r = applyOps(p, [{ op: "set_deliverable", subplan: "backend", enabled: true }, { op: "set_deliverable", subplan: "databases", enabled: true }], ctx());
    expect(area(r.plan, "backend").deliverable!.title).toBe("API REST con persistencia y pruebas");
    expect(area(r.plan, "databases").deliverable!.title).toBe("Esquema relacional con consultas y migraciones");
    expect(r.delta.deliverables).toBe(2);
  });
});

describe("intérprete por palabras clave (sin IA)", () => {
  const p = areasPlan();
  const ops = (text: string, c = ctx()) => opsFromText(text, p, c).ops;

  it("«Más SQL antes del backend» pone Databases antes que Backend", () => {
    const o = ops("Más SQL antes del backend");
    expect(o).toEqual([{ op: "set_area_order", order: [area(p, "databases").id, area(p, "backend").id, area(p, "frontend").id] }]);
  });

  it("«Pasa el frontend a la semana 10» cambia las semanas del área conservando su duración", () => {
    const fe = area(p, "frontend");
    const o = ops("Pasa el frontend a la semana 10");
    expect(o).toEqual([{ op: "set_phase", subplan: fe.id, fromWeek: 10, toWeek: 10 + (fe.phase!.toWeek - fe.phase!.fromWeek) }]);
    // un tema concreto sigue siendo un tema (move_topic)
    expect(ops("pasa 1.1 What programming is a la semana 4")).toEqual([]);
  });

  it("«Pasa el lenguaje Python a Frontend» mueve el grupo; «Añade desktop» añade el área; «Quita databases» la quita", () => {
    expect(ops("Pasa el lenguaje Python a Frontend")).toEqual([{ op: "move_group", subplan: area(p, "backend").id, group: "lang-python", to: area(p, "frontend").id }]);
    expect(ops("Añade desktop")).toEqual([{ op: "add_area", areaId: "desktop" }]);
    expect(ops("Quita databases")).toEqual([{ op: "remove_subplan", subplan: area(p, "databases").id }]);
  });

  it("«Añade un entregable al área de Backend» y «sin entregables» actúan sobre áreas", () => {
    expect(ops("Añade un entregable al área de Backend")).toEqual([{ op: "set_deliverable", subplan: area(p, "backend").id, enabled: true }]);
    expect(opsFromText("sin entregables", { ...p, subplans: p.subplans.map((s, i) => (i === 0 ? { ...s, deliverable: { title: "x", description: "", criteria: [], status: "idea" as const } } : s)) }, ctx()).ops).toEqual([{ op: "set_deliverable", subplan: p.subplans[0]!.id, enabled: false }]);
  });
});

describe("validación estricta del parche de la IA", () => {
  const p = areasPlan();
  const catalog = [cat("Programación/Otro/X1")];
  const parse = (ops: unknown[], comment = "cambia") => parseChangeReply(JSON.stringify({ ops, summary: "ok" }), p, catalog, comment);

  it("acepta ids de área (id del subplan, areaId o nombre) y descarta lo inventado", () => {
    const r = parse([
      { op: "move_group", subplan: "backend", group: "lang-python", to: "frontend" },
      { op: "move_group", subplan: "backend", group: "inventado", to: "frontend" },
      { op: "set_area_order", order: ["databases", "Backend", "nada"] },
      { op: "set_phase", subplan: "frontend", fromWeek: 3, toWeek: 9, minutes: 5 },
      { op: "set_phase", subplan: "frontend", fromWeek: 3, toWeek: 999 },
      { op: "add_area", areaId: "desktop" },
      { op: "add_area", areaId: "inventada" },
      { op: "add_area", areaId: "backend" },
      { op: "set_purpose", scope: "week", key: "3", text: "  Semana   de APIs  " },
      { op: "set_purpose", scope: "siglo", key: "3", text: "x" },
      { op: "add_deliverable", title: "Mini API", description: "d", criteria: ["a", "b"], subplan: "backend", dueDate: "2026-12-01", minutes: 9 },
      { op: "borrar_todo" },
    ]);
    expect(r.ok).toBe(true);
    expect(r.ops).toEqual([
      { op: "move_group", subplan: area(p, "backend").id, group: "lang-python", to: area(p, "frontend").id },
      { op: "set_area_order", order: [area(p, "databases").id, area(p, "backend").id] },
      { op: "set_phase", subplan: area(p, "frontend").id, fromWeek: 3, toWeek: 9 },
      { op: "add_area", areaId: "desktop" },
      { op: "set_purpose", scope: "week", key: "3", text: "Semana de APIs" },
      { op: "add_deliverable", title: "Mini API", description: "d", criteria: ["a", "b"], subplan: area(p, "backend").id, dueDate: "2026-12-01" },
    ]);
    expect(r.discarded).toEqual(expect.arrayContaining(["grupo inventado", "fase de un área", "área inventada", "propósito", "borrar_todo"]));
  });

  it("el prompt habla de áreas, grupos y fases, y el resumen del plan los lista", () => {
    const text = summaryOfPlan(p);
    expect(text).toContain("ÁREA id=");
    expect(text).toContain("areaId=backend");
    expect(text).toMatch(/semanas \d+-\d+/);
    expect(text).toContain("grupos:");
    expect(text).toContain("lang-python");
  });
});

describe("área «Lógica de programación» (logic)", () => {
  const logicTopics = (n: number) => topics("10 Programming Logic", n).map((t) => cat(t.folder));

  it("«Añade lógica de programación» la reconoce como área y la añade con sus temas, su grupo y su fase", () => {
    const p = areasPlan();
    expect(opsFromText("Añade lógica de programación", p, { today: START, all: logicTopics(6) }).ops).toEqual([{ op: "add_area", areaId: "logic" }]);
    const r = applyOps(p, [{ op: "add_area", areaId: "logic" }], { today: START, all: logicTopics(6) });
    expect(r.applied).toBe(1);
    const lg = area(r.plan, "logic");
    expect(lg.area).toBe("Lógica de programación");
    expect(lg.topics).toHaveLength(6);
    expect(lg.groups!.map((g) => g.title)).toEqual(["Problemas y patrones"]);
    expect(lg.phase).toBeTruthy();
    // sigue la regla de como mucho dos áreas en paralelo y no se pierde nada de las demás
    expect(maxOverlap(Object.fromEntries(r.plan.subplans.map((s) => [s.id, s.phase!])))).toBeLessThanOrEqual(2);
    expect(r.plan.subplans.map((s) => s.areaId)).toEqual(expect.arrayContaining(["backend", "databases", "frontend", "logic"]));
  });

  it("sin temas de esa rama en la vault no inventa el área", () => {
    expect(applyOps(areasPlan(), [{ op: "add_area", areaId: "logic" }], ctx()).applied).toBe(0);
  });

  it("la rama no se confunde con Fundamentals ni con un lenguaje: sigue su propia clase", async () => {
    const { classifyBranch } = await import("../../lib/planTime.js");
    expect(classifyBranch("10 Programming Logic")).toBe("logic");
    expect(classifyBranch("10 Lógica de programación")).toBe("logic");
    expect(classifyBranch("1 Fundamentals")).toBe("fundamentals");
    expect(classifyBranch("2.1 Python")).toBe("language");
  });
});
