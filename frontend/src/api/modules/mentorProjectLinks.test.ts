// El proyecto mensual del Mentor como proyecto real del módulo Proyectos.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildPlan, PlanStore, type Plan } from "../../core/mentor/plan.js";
import { addDays } from "../../lib/planTime.js";
import { depthGaps } from "../../lib/areaDepth.js";
import { AppState } from "../appState.js";
import { mentorProjectLinksApi, projectDescription } from "./mentorProjectLinks.js";

let dir: string;
let app: AppState;
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

function savePlan(): Plan {
  const start = today();
  const end = addDays(start, 100);
  const CORE = [{ id: "core", title: "Conocimientos", kind: "knowledge" as const, order: 100 }];
  const seeds = [
    { area: "Backend", areaId: "backend", objective: "Servicios", groups: CORE, topics: Array.from({ length: 12 }, (_, i) => ({ folder: `Programación/4 Backend/4.${i + 1} Tema ${i + 1}`, title: `Tema ${i + 1}`, estMinutes: 60, group: "core" })) },
    { area: "Frontend", areaId: "frontend", objective: "Interfaces", groups: CORE, topics: Array.from({ length: 12 }, (_, i) => ({ folder: `Programación/5 Frontend/5.${i + 1} Pieza ${i + 1}`, title: `Pieza ${i + 1}`, estMinutes: 60, group: "core" })) },
  ];
  const built = buildPlan(seeds, { id: `${start}_${end}`, start, end, minutesPerDay: 240, studyDays: [1, 2, 3, 4, 5, 6, 7], pace: "intenso", from: start, name: "Plan" }).plan;
  const plan: Plan = { ...built, structure: "areas", areaMode: "together" };
  new PlanStore(dir).save(plan);
  return plan;
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "nv_projlink_"));
  fs.mkdirSync(path.join(dir, ".notevault"), { recursive: true });
  app = new AppState(dir);
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe("mentor_plan_project_create / links", () => {
  it("crea un proyecto REAL por mes, con hitos semanales y piezas diarias como issues, y es idempotente", () => {
    const plan = savePlan();
    const api = mentorProjectLinksApi(app);
    expect(api.mentor_plan_project_links({ planId: plan.id }).links).toEqual({});
    const monthId = `mm:${plan.start.slice(0, 7)}`;
    const r = api.mentor_plan_project_create({ planId: plan.id, monthId });
    expect(r.created).toBe(true);
    expect(r.link.name).toMatch(/^Mes 1 · La primera versión del producto/);
    const pm = app.mgrs().projects;
    const project = pm.get(r.link.projectId)!;
    expect(project.description).toMatch(/## Hitos \(uno por semana\)/);
    const issues = pm.issues(project.id);
    expect(issues.length).toBe(r.link.issues.total);
    expect(issues.filter((i) => !i.parent).length).toBeGreaterThanOrEqual(2); // un hito por semana
    expect(issues.filter((i) => i.parent).length).toBeGreaterThan(issues.filter((i) => !i.parent).length); // piezas diarias colgando de su hito

    const again = api.mentor_plan_project_create({ planId: plan.id, monthId });
    expect(again.created).toBe(false);
    expect(again.link.projectId).toBe(r.link.projectId);
    expect(pm.projects().length).toBe(1);
    expect(api.mentor_plan_project_links({ planId: plan.id }).links[monthId]!.projectId).toBe(r.link.projectId);
  });

  it("si borran el proyecto el enlace deja de enseñarse; un mes que no existe se rechaza", () => {
    const plan = savePlan();
    const api = mentorProjectLinksApi(app);
    const monthId = `mm:${plan.start.slice(0, 7)}`;
    const r = api.mentor_plan_project_create({ planId: plan.id, monthId });
    app.mgrs().projects.delete(r.link.projectId);
    expect(api.mentor_plan_project_links({ planId: plan.id }).links).toEqual({});
    expect(() => api.mentor_plan_project_create({ planId: plan.id, monthId: "mm:1999-01" })).toThrow(/ya no está en el plan/);
    expect(() => api.mentor_plan_project_create({ planId: "../x", monthId })).toThrow(/Plan inválido/);
  });

  it("la descripción enseña producto, hitos y criterios", () => {
    const plan = savePlan();
    const api = mentorProjectLinksApi(app);
    const r = api.mentor_plan_project_create({ planId: plan.id, monthId: `mm:${plan.start.slice(0, 7)}` });
    const d = app.mgrs().projects.get(r.link.projectId)!.description;
    expect(d).toContain("Se considera hecho cuando");
    expect(typeof projectDescription).toBe("function");
  });
});

import { mentorPlanDossierApi } from "./mentorPlanDossier.js";

describe("mentor_plan_dossier", () => {
  it("escribe el dosier en la vault con la pregunta, el plan, los proyectos y la ruta de la respuesta, y no toca el plan", () => {
    const plan = savePlan();
    const before = JSON.stringify(new PlanStore(dir).load(plan.id));
    const api = mentorPlanDossierApi(app, { now: () => new Date("2026-10-29T10:30:00") });
    const r = api.mentor_plan_dossier({ id: plan.id, question: "¿Cuánto falta para terminar?" });
    expect(r.rel).toMatch(/^Programación\/_handoff\/preguntas\/2026-10-29_10-30_plan\.md$/);
    const md = fs.readFileSync(r.abs, "utf-8");
    expect(md).toContain("¿Cuánto falta para terminar?");
    expect(md).toContain(r.answerAbs);
    expect(md).toContain("### Backend");
    expect(md).toContain("## 5. Projects");
    expect(md).toMatch(/Mes 1 · La primera versión del producto/);
    expect(r.shortPrompt).toContain("NEW TASK");
    expect(r.shortPrompt).toContain(r.abs);
    expect(r.topics).toBe(24);
    expect(JSON.stringify(new PlanStore(dir).load(plan.id))).toBe(before);
    expect(() => api.mentor_plan_dossier({ id: "../x" })).toThrow(/Plan inválido/);
  });
});

import { vi } from "vitest";
import { mentorApi } from "./mentor.js";
import { clearStudySnapshotCache, setWarmApp, warmStudyIndex } from "./study.js";

describe("Nuevo proyecto (add_deliverable por la API directa)", () => {
  it("añade un proyecto propio al plan, con sus criterios y fecha dentro del plan, y queda guardado", async () => {
    const plan = savePlan();
    setWarmApp(app);
    await warmStudyIndex();
    const m = mentorApi(app, vi.fn());
    const r: any = await m.mentor_plan_change({ id: plan.id, label: "Añadir el proyecto «API de reservas»", ops: [{ op: "add_deliverable", title: "API de reservas", description: "Reservas con auth", criteria: ["Tiene pruebas", "Se arranca con un comando", ""], subplan: plan.subplans[0]!.id, dueDate: "2099-01-01" }] });
    expect(r.applied).toBeTruthy();
    const saved = new PlanStore(dir).load(plan.id)!;
    const own = (saved.deliverables ?? []).filter((d) => d.id.startsWith("x:"));
    expect(own).toHaveLength(1);
    expect(own[0]!.title).toBe("API de reservas");
    expect(own[0]!.criteria).toEqual(["Tiene pruebas", "Se arranca con un comando"]);
    expect(own[0]!.dueDate).toBe(plan.end); // una fecha fuera del plan se recorta al fin del plan
    expect(own[0]!.areaId).toBe("backend");
  });
});

describe("proyectos propios: editar, quitar y crear como proyecto real", () => {
  const addOwn = async (plan: Plan) => {
    setWarmApp(app);
    await warmStudyIndex();
    const m = mentorApi(app, vi.fn());
    await m.mentor_plan_change({ id: plan.id, ops: [{ op: "add_deliverable", title: "API de reservas", description: "d", criteria: ["Tiene pruebas", "Se arranca con un comando"], dueDate: plan.end }] });
    return m;
  };
  const own = () => (new PlanStore(dir).load(savedId)!.deliverables ?? []).filter((d) => d.id.startsWith("x:"));
  let savedId = "";

  it("edita título, criterios y fecha; los derivados del plan no se pueden editar ni quitar", async () => {
    const plan = savePlan();
    savedId = plan.id;
    const m = await addOwn(plan);
    const r: any = await m.mentor_plan_change({ id: plan.id, ops: [{ op: "edit_deliverable", id: "x:1", title: "API de reservas v2", criteria: ["Solo una"], dueDate: addDays(plan.start, 30) }] });
    expect(r.applied).toBeTruthy();
    expect(own()[0]).toMatchObject({ title: "API de reservas v2", criteria: ["Solo una"], dueDate: addDays(plan.start, 30), description: "d" });
    const bad: any = await m.mentor_plan_change({ id: plan.id, ops: [{ op: "remove_deliverable", id: `mm:${plan.start.slice(0, 7)}` }, { op: "edit_deliverable", id: "dp:2026-01-01", title: "x" }] });
    expect(bad.applied).toBeFalsy();
    expect(own()).toHaveLength(1);
  });

  it("quitar lo saca del plan", async () => {
    const plan = savePlan();
    savedId = plan.id;
    const m = await addOwn(plan);
    const r: any = await m.mentor_plan_change({ id: plan.id, ops: [{ op: "remove_deliverable", id: "x:1" }] });
    expect(r.applied).toBeTruthy();
    expect(own()).toHaveLength(0);
  });

  it("crear como proyecto real: un issue por criterio, idempotente, y su avance sale de los issues", async () => {
    const plan = savePlan();
    savedId = plan.id;
    await addOwn(plan);
    const api = mentorProjectLinksApi(app);
    const r = api.mentor_plan_project_create({ planId: plan.id, monthId: "x:1" });
    expect(r.created).toBe(true);
    expect(r.link.name).toBe("API de reservas");
    expect(r.link.issues).toEqual({ total: 2, done: 0 });
    expect(api.mentor_plan_project_create({ planId: plan.id, monthId: "x:1" }).created).toBe(false);
    const pm = app.mgrs().projects;
    const first = pm.issues(r.link.projectId)[0]!;
    pm.setIssueStatus(r.link.projectId, first.id, pm.get(r.link.projectId)!.done_column);
    expect(api.mentor_plan_project_links({ planId: plan.id }).links["x:1"]!.issues).toEqual({ total: 2, done: 1 });
    // si el proyecto propio se quita del plan, su enlace deja de enseñarse
    await mentorApi(app, vi.fn()).mentor_plan_change({ id: plan.id, ops: [{ op: "remove_deliverable", id: "x:1" }] });
    expect(api.mentor_plan_project_links({ planId: plan.id }).links["x:1"]).toBeUndefined();
    expect(() => api.mentor_plan_project_create({ planId: plan.id, monthId: "x:9" })).toThrow(/ya no está en el plan/);
  });
});

describe("mentor_plan_sync_reference: lo nuevo de la vault entra solo al plan", () => {
  const MANIFEST = (t: string) => `---\ntype: practica\nsubject: programming\ntitle: ${t}\ntopic_type: mixed\nskills: ["explain"]\nmin_per_skill: 6\ntarget_difficulty: 3\nexam: required\n---\n`;
  const html = (n: string, t: string) => `Programación/5 Frontend/HTML/${n} ${t}`;
  const make = (rel: string) => {
    const name = rel.split("/").pop()!;
    fs.mkdirSync(path.join(dir, ...rel.split("/")), { recursive: true });
    fs.writeFileSync(path.join(dir, ...rel.split("/"), `${name}.practica.md`), MANIFEST(name));
    fs.writeFileSync(path.join(dir, ...rel.split("/"), `${name}.md`), `---\ntype: teorica\ntitle: ${name}\n---\n# ${name}\n`);
  };
  const frontendHtml = (id: string) => (new PlanStore(dir).load(id)!.subplans.find((s) => s.areaId === "frontend")!.topics.filter((t) => t.group === "html").map((t) => t.folder.split("/").pop()));

  it("detecta los temas de HTML nuevos, los añade a su asignatura, no vuelve a meter lo que se quitó y recoge lo siguiente", async () => {
    const plan = savePlan();
    setWarmApp(app);
    make(html("5.18.4", "Skeleton"));
    make(html("5.18.4.1", "html element"));
    await warmStudyIndex();
    const m = mentorApi(app, vi.fn());
    const r1: any = m.mentor_plan_sync_reference({ planId: plan.id });
    expect(r1.added.map((f: string) => f.split("/").pop())).toEqual(["5.18.4 Skeleton", "5.18.4.1 html element"]);
    expect(frontendHtml(plan.id)).toEqual(["5.18.4 Skeleton", "5.18.4.1 html element"]);

    // idempotente: sin nada nuevo no cambia nada
    expect((m.mentor_plan_sync_reference({ planId: plan.id }) as { added: string[] }).added).toEqual([]);

    // la persona quita uno a mano: no vuelve
    await m.mentor_plan_route_set({ id: plan.id, folders: [html("5.18.4.1", "html element")], route: "skipped" });
    expect((m.mentor_plan_sync_reference({ planId: plan.id }) as { added: string[] }).added).toEqual([]);

    // un tema nuevo que aparece después SÍ entra
    make(html("5.18.5", "Metadata"));
    clearStudySnapshotCache();
    await warmStudyIndex();
    const r3: any = m.mentor_plan_sync_reference({ planId: plan.id });
    expect(r3.added.map((f: string) => f.split("/").pop())).toEqual(["5.18.5 Metadata"]);
  });

  it("un tema nuevo de conocimiento (6.4.1 SELECT de Databases) entra solo a su área, si el plan la tiene", async () => {
    const plan = savePlan();
    const store = new PlanStore(dir);
    const fe = plan.subplans.find((s) => s.areaId === "frontend")!;
    store.save({ ...plan, createdAt: "2000-01-01T00:00:00.000Z", subplans: [...plan.subplans, { ...fe, id: "s9-databases", area: "Databases", areaId: "databases", topics: [], weeks: [], groups: undefined as never }] });
    setWarmApp(app);
    make("Programación/6 Databases/6.4.1 SELECT");
    make("Programación/3 Desktop Apps (Electron)/3.9 Algo"); // su área no está en el plan: no entra
    await warmStudyIndex();
    const m = mentorApi(app, vi.fn());
    const r: any = m.mentor_plan_sync_reference({ planId: plan.id });
    expect(r.added.map((f: string) => f.split("/").pop())).toEqual(["6.4.1 SELECT"]);
    expect(store.load(plan.id)!.subplans.find((s) => s.areaId === "databases")!.topics.map((t) => t.folder.split("/").pop())).toEqual(["6.4.1 SELECT"]);
  });

  // Un plan real: el lenguaje Python vive en el subplan Backend, en su propio grupo (`lang-python`), con sus capítulos de 150 min y sin piezas.
  const planWithPython = (chapters = 3): Plan => {
    const plan = savePlan();
    const be = plan.subplans.find((s) => s.areaId === "backend")!;
    const py = Array.from({ length: chapters }, (_, i) => ({ folder: `Programación/2.1 Python/2.1.${i + 1} Capítulo ${i + 1}`, title: `Capítulo ${i + 1}`, estMinutes: 150, targetWeek: 1, group: "lang-python" }));
    const next: Plan = {
      ...plan,
      createdAt: "2000-01-01T00:00:00.000Z",
      subplans: plan.subplans.map((s) => (s.id === be.id ? { ...s, groups: [...(s.groups ?? []), { id: "lang-python", title: "Lenguaje: Python", kind: "language" as const, order: 20 }], topics: [...s.topics, ...py] } : s)),
    };
    new PlanStore(dir).save(next);
    return next;
  };
  const piece = (ch: number, n: number) => `Programación/2.1 Python/2.1.${ch}.${n} Pieza ${ch}.${n}`;
  const pythonOf = (id: string) => new PlanStore(dir).load(id)!.subplans.find((s) => s.areaId === "backend")!.topics.filter((t) => t.folder.includes("/2.1 Python/"));

  it("las piezas nuevas de un LENGUAJE (2.1 Python) entran solas, en el mismo subplan y grupo que sus capítulos, y el aviso de capítulos gruesos se apaga", async () => {
    const plan = planWithPython();
    expect(depthGaps(new PlanStore(dir).load(plan.id)!.subplans).find((g) => g.groupId === "lang-python")?.coarse).toHaveLength(3);
    setWarmApp(app);
    for (const ch of [1, 2, 3]) for (const n of [1, 2, 3]) make(piece(ch, n));
    await warmStudyIndex();
    const m = mentorApi(app, vi.fn());
    const r: any = m.mentor_plan_sync_reference({ planId: plan.id });
    expect(r.added).toHaveLength(9);
    const py = pythonOf(plan.id);
    expect(py.filter((t) => /\/2\.1\.\d+\.\d+ /.test(t.folder)).every((t) => t.group === "lang-python")).toBe(true);
    expect(py).toHaveLength(12);
    // ya no hay capítulos gruesos en ese grupo: la app deja de avisar
    expect(depthGaps(new PlanStore(dir).load(plan.id)!.subplans).filter((g) => g.groupId === "lang-python")).toEqual([]);
    // idempotente
    expect((m.mentor_plan_sync_reference({ planId: plan.id }) as { added: string[] }).added).toEqual([]);
  });

  it("no mete un lenguaje que el plan no tiene (lo que la persona quitó antes del plan no vuelve)", async () => {
    const plan = planWithPython();
    setWarmApp(app);
    make("Programación/2.2 JavaScript/2.2.1.1 Pieza"); // el plan no tiene nada de 2.2 JavaScript
    await warmStudyIndex();
    const r: any = mentorApi(app, vi.fn()).mentor_plan_sync_reference({ planId: plan.id });
    expect(r.added).toEqual([]);
  });

  it("una pieza cuelga del grupo de SU capítulo aunque el área tenga varios grupos", async () => {
    const plan = planWithPython(2);
    const store = new PlanStore(dir);
    const cur = store.load(plan.id)!;
    store.save({
      ...cur,
      subplans: cur.subplans.map((s) => ({ ...s, topics: s.topics.map((t) => (t.folder.endsWith("2.1.2 Capítulo 2") ? { ...t, group: "otro" } : t)), ...(s.areaId === "backend" ? { groups: [...(s.groups ?? []), { id: "otro", title: "Otro grupo", kind: "knowledge" as const, order: 25 }] } : {}) })),
    });
    setWarmApp(app);
    make(piece(2, 1));
    make(piece(1, 1));
    await warmStudyIndex();
    mentorApi(app, vi.fn()).mentor_plan_sync_reference({ planId: plan.id });
    const py = pythonOf(plan.id);
    expect(py.find((t) => t.folder.endsWith("2.1.2.1 Pieza 2.1"))!.group).toBe("otro");
    expect(py.find((t) => t.folder.endsWith("2.1.1.1 Pieza 1.1"))!.group).toBe("lang-python");
  });

  it("el tope de 400 por vuelta no pierde temas: lo que no cupo se añade en la siguiente", async () => {
    const plan = planWithPython(1);
    setWarmApp(app);
    for (let n = 1; n <= 405; n++) make(piece(1, n));
    await warmStudyIndex();
    const m = mentorApi(app, vi.fn());
    expect((m.mentor_plan_sync_reference({ planId: plan.id }) as { added: string[] }).added).toHaveLength(400);
    expect((m.mentor_plan_sync_reference({ planId: plan.id }) as { added: string[] }).added).toHaveLength(5);
    expect(pythonOf(plan.id)).toHaveLength(406);
  }, 60000);

  it("si el plan no tiene el área (Frontend) no mete nada; en planes archivados tampoco", async () => {
    const plan = savePlan();
    const store = new PlanStore(dir);
    store.save({ ...plan, subplans: plan.subplans.filter((s) => s.areaId !== "frontend") });
    setWarmApp(app);
    make(html("5.18.4", "Skeleton"));
    await warmStudyIndex();
    const m = mentorApi(app, vi.fn());
    expect((m.mentor_plan_sync_reference({ planId: plan.id }) as { added: string[] }).added).toEqual([]);
    store.save({ ...plan, archived: true });
    expect((m.mentor_plan_sync_reference({ planId: plan.id }) as { added: string[] }).added).toEqual([]);
  });
});
