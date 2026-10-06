// Plan mensual del Mentor: conversación con IA simulada (plan_draft), aceptar/descartar, lectura con estado
// derivado, entregable editable y la integración con "Hoy" (plan_item y objetivo de la sesión).

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({ store: {} as Record<string, unknown> }));

vi.mock("../appConfig.js", () => ({
  AppConfig: {
    get_ai_config: () => ({ ...hoisted.store }),
    set_ai_config: (d: Record<string, unknown>) => Object.assign(hoisted.store, d),
  },
}));

import { ApiError } from "../../core/errors.js";
import { PlanStore } from "../../core/mentor/plan.js";
import { AppState } from "../appState.js";
import { vaultScan } from "../vaultScan.js";
import { mentorApi } from "./mentor.js";

const MANIFEST = (title: string) => `---
type: topic
subject: programming
title: "${title}"
skills: [implement, debug]
mastery:
  min_per_skill: 6
  target_difficulty: 3
  exam: none
---
`;

const FUND = "Programación/Python/1 Fundamentos";
const APIS = "Programación/Python/2 APIs web";
const DB = "Programación/Python/3 Bases de datos";

let dir: string;
let app: AppState;
let goalId: string;
let itemId: string;
let projectId: string;

function topic(rel: string, title: string) {
  const abs = path.join(dir, ...rel.split("/"));
  fs.mkdirSync(abs, { recursive: true });
  fs.writeFileSync(path.join(abs, "_tema.md"), MANIFEST(title), "utf-8");
  fs.writeFileSync(path.join(abs, `${title}.md`), "---\ntype: concept\n---\n# T\n", "utf-8");
}

const plansDir = () => path.join(dir, ".notevault", "mentor", "plans");
const monthNow = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

beforeEach(() => {
  for (const k of Object.keys(hoisted.store)) delete hoisted.store[k];
  Object.assign(hoisted.store, { provider: "deepseek", api_key: "sk-test", model: "m" });
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "nv_mentor_month_"));
  topic(FUND, "1 Fundamentos");
  topic(APIS, "2 APIs web");
  topic(DB, "3 Bases de datos");
  app = new AppState(dir);
  const goal = app.mgrs().goals.create_goal("Desarrollo Backend", { priority: 2 });
  goalId = goal.id;
  itemId = app.mgrs().goals.create_item(goal.id, "Practicar APIs a diario", "", { repeat: "daily" }).id;
  projectId = app.mgrs().projects.create("API de inventario", {}).id;
  vaultScan(app); // índice caliente: si no, la API responde `loading`
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

const planJson = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    type: "plan_draft",
    rationale: "Primero bases y luego APIs y datos.",
    hoursPerWeek: 6,
    subplans: [
      {
        area: "Programación",
        objective: "Desarrollo Backend",
        goalId,
        topics: [
          { folder: FUND, why: "base del lenguaje" },
          { folder: "Programación/Django/Inventado", why: "no existe" },
          { folder: APIS, why: "tu primer backend" },
          { folder: DB, skills: ["debug", "skill_falsa"], why: "persistencia" },
        ],
        requiredGoals: [
          { goalId, itemId, note: "submeta diaria" },
          { goalId: "g-inventada", note: "no existe" },
        ],
        deliverable: { title: "API de inventario", description: "CRUD con tests", criteria: ["CRUD completo", "tests pasan"], projectId },
      },
      {
        area: "Inglés",
        objective: "Hablar con confianza",
        topics: [{ folder: "Inglés/Inventado", why: "no existe" }],
        deliverable: { title: "Presentación en inglés", description: "5 min", criteria: ["sin leer"], projectId: "p-inventado" },
      },
    ],
    ...over,
  });

async function draft(send = vi.fn().mockResolvedValueOnce(planJson())) {
  const api = mentorApi(app, send);
  const d: any = await api.mentor_chat({ message: "quiero un plan para este mes, 6 h por semana", mode: "plan" });
  return { api, send, res: d, turnId: d.pending as string };
}

describe("mentor_chat: plan_draft", () => {
  it("la IA ve el catálogo, las metas y los proyectos reales; el borrador solo contiene lo que existe", async () => {
    const { send, res } = await draft();
    const system = (send.mock.calls[0]![1] as any[])[0].content as string;
    expect(system).toContain(`folder=${FUND}`);
    expect(system).toContain(`goalId=${goalId}`);
    expect(system).toContain(`projectId=${projectId}`);
    expect(system).toContain("plan_draft");
    expect(system).toContain("PLAN DEL MES");

    expect(res.kind).toBe("plan_draft");
    const d = res.planDraft;
    expect(d.month).toBe(monthNow());
    expect(d.subplans).toHaveLength(2);
  });

  it("descarta temas, metas y proyectos inventados y calcula el reparto semanal", async () => {
    const { res } = await draft();
    const d = res.planDraft;
    // el subplan de Inglés conserva su entregable (propuesta sin proyecto) aunque su tema era inventado
    expect(d.subplans.map((s: any) => s.area)).toEqual(["Programación", "Inglés"]);
    const prog = d.subplans[0];
    expect(prog.topics.map((t: any) => t.folder)).toEqual([FUND, APIS, DB]);
    expect(prog.topics.find((t: any) => t.folder === DB).skills).toEqual(["debug"]);
    expect(prog.topics.every((t: any) => t.targetWeek >= 1 && t.estMinutes > 0)).toBe(true);
    expect(prog.weeks.length).toBeGreaterThanOrEqual(4);
    expect(prog.requiredGoals).toEqual([{ goalId, itemId, note: "submeta diaria" }]);
    expect(prog.deliverable).toMatchObject({ title: "API de inventario", projectId, status: "idea" });
    const eng = d.subplans[1];
    expect(eng.topics).toEqual([]);
    expect(eng.deliverable.projectId).toBeUndefined(); // propuesta: no existe ese proyecto
    expect(d.discarded).toEqual(expect.arrayContaining(["Programación/Django/Inventado", "Inglés/Inventado", "meta g-inventada", "proyecto p-inventado"]));
    expect(d.hoursPerWeek).toBe(6);
  });

  it("no escribe nada: ni plan, ni metas nuevas, ni proyectos nuevos", async () => {
    const goalsBefore = app.mgrs().goals.goals().length;
    const projectsBefore = app.mgrs().projects.projects().length;
    await draft();
    expect(fs.existsSync(plansDir())).toBe(false);
    expect(app.mgrs().goals.goals().length).toBe(goalsBefore);
    expect(app.mgrs().projects.projects().length).toBe(projectsBefore);
  });

  it("si faltan las horas por semana pregunta en vez de inventar", async () => {
    const send = vi.fn().mockResolvedValueOnce(planJson({ hoursPerWeek: undefined }));
    const res: any = await mentorApi(app, send).mentor_chat({ message: "plan del mes", mode: "plan" });
    expect(res.kind).toBe("question");
    expect(res.text).toContain("horas por semana");
    expect(res.planDraft).toBeUndefined();
  });

  it("sin ningún tema real ni entregable lo informa como error", async () => {
    const send = vi.fn().mockResolvedValueOnce(planJson({ subplans: [{ area: "X", objective: "y", topics: [{ folder: "No/existe" }] }] }));
    const res: any = await mentorApi(app, send).mentor_chat({ message: "plan", mode: "plan" });
    expect(res.kind).toBe("error");
    expect(res.text).toContain("ningún subplan");
  });

  it("sin IA lo dice y no inventa un plan", async () => {
    for (const k of Object.keys(hoisted.store)) delete hoisted.store[k];
    const send = vi.fn();
    const res: any = await mentorApi(app, send).mentor_chat({ message: "plan del mes", mode: "plan" });
    expect(res).toMatchObject({ kind: "no_ai" });
    expect(send).not.toHaveBeenCalled();
  });

  it("el borrador pendiente va en el historial para los ajustes siguientes", async () => {
    const { api, send } = await draft(vi.fn().mockResolvedValueOnce(planJson()).mockResolvedValueOnce(planJson({ hoursPerWeek: 3 })));
    await api.mentor_chat({ message: "mejor 3 horas por semana", mode: "plan" });
    const hist = (send.mock.calls[1]![1] as any[])[2].content as string;
    expect(hist).toContain('"plan_draft"');
    expect(hist).toContain(FUND);
  });
});

describe("mentor_plan_draft_accept / discard", () => {
  it("aceptar escribe .notevault/mentor/plans/<mes>.json recalculando todo y marca el borrador", async () => {
    const { api, res, turnId } = await draft();
    const tampered = { ...res.planDraft, subplans: [{ ...res.planDraft.subplans[0], topics: [...res.planDraft.subplans[0].topics, { folder: "Falso/Tema", title: "Falso", targetWeek: 1, estMinutes: 99999 }] }] };
    // la UI no manda el borrador: se usa el guardado en el turno
    const out = api.mentor_plan_draft_accept({ turnId, draft: tampered });
    expect(out).toMatchObject({ month: monthNow(), subplans: 2, topics: 3 });

    const file = path.join(plansDir(), `${monthNow()}.json`);
    expect(fs.existsSync(file)).toBe(true);
    const saved = JSON.parse(fs.readFileSync(file, "utf-8"));
    expect(saved.hoursPerWeek).toBe(6);
    expect(saved.subplans[0].topics.map((t: any) => t.folder)).toEqual([FUND, APIS, DB]);
    expect(saved.subplans[0].requiredGoals).toEqual([{ goalId, itemId, note: "submeta diaria" }]);
    expect(saved.subplans[1].deliverable).toMatchObject({ title: "Presentación en inglés", status: "idea" });
    expect(saved.subplans[1].deliverable.projectId).toBeUndefined();

    const turn = api.mentor_chat_load().turns.find((t) => t.id === turnId)!;
    expect(turn.acceptedPlan).toBe(monthNow());
    expect(api.mentor_chat_load().pending).toBeNull();
    // no se creó nada más
    expect(app.mgrs().projects.projects()).toHaveLength(1);
    expect(api.mentor_plan_list()).toEqual([expect.objectContaining({ id: monthNow(), month: monthNow(), status: "activo", subplans: 2, topics: 3, completed: 0 })]);
  });

  it("re-aceptar el mismo subplan lo sustituye sin duplicar", async () => {
    const { api, turnId } = await draft(vi.fn().mockResolvedValue(planJson()));
    api.mentor_plan_draft_accept({ turnId });
    const d2: any = await api.mentor_chat({ message: "otra vez", mode: "plan" });
    api.mentor_plan_draft_accept({ turnId: d2.pending });
    const got: any = api.mentor_plan_get({ month: monthNow() });
    expect(got.plan.subplans).toHaveLength(2);
  });

  it("descartar no escribe ningún plan", async () => {
    const { api, turnId } = await draft();
    const after = api.mentor_plan_draft_discard(turnId);
    expect(after.pending).toBeNull();
    expect(fs.existsSync(plansDir())).toBe(false);
    expect(() => api.mentor_plan_draft_discard("nope")).toThrow(ApiError);
    expect(() => api.mentor_plan_draft_accept({ turnId })).not.toThrow(); // el borrador sigue en el historial, pero no hay nada aceptado antes
  });

  it("valida la entrada", async () => {
    const api = mentorApi(app, vi.fn());
    expect(() => api.mentor_plan_draft_accept({})).toThrow(ApiError);
    expect(() => api.mentor_plan_draft_accept({ draft: { hoursPerWeek: 0, subplans: [{ area: "A", topics: [] }] } })).toThrow(ApiError);
    expect(() => api.mentor_plan_draft_accept({ draft: { hoursPerWeek: 4, subplans: [{ area: "A", topics: [{ folder: "No/existe" }] }] } })).toThrow(/ya en tu sistema/);
    expect(fs.existsSync(plansDir())).toBe(false);
  });
});

describe("mentor_plan_get / update_deliverable", () => {
  async function accepted() {
    const { api, turnId } = await draft();
    api.mentor_plan_draft_accept({ turnId });
    return api;
  }

  it("sin plan devuelve el estado vacío", () => {
    const got: any = mentorApi(app, vi.fn()).mentor_plan_get({ month: "2027-01" });
    expect(got).toMatchObject({ loading: false, plan: null, derived: null, months: [] });
    expect(() => mentorApi(app, vi.fn()).mentor_plan_get({ month: "enero" })).toThrow(ApiError);
  });

  it("devuelve el plan con el estado derivado en vivo, las metas requeridas con su %, y lo que toca hoy", async () => {
    const api = await accepted();
    const got: any = api.mentor_plan_get({ month: monthNow() });
    expect(got.derived.summary).toMatchObject({ subplans: 2, topics: 3, done: 0 });
    const topics = got.derived.subplans[0].topics;
    expect(topics.map((t: any) => t.state)).toEqual(["sin_tratar", "sin_tratar", "sin_tratar"]);
    expect(topics.every((t: any) => t.found && t.pct === 0)).toBe(true);
    expect(got.goals[goalId]).toMatchObject({ name: "Desarrollo Backend" });
    expect(got.goals[goalId].items[itemId].name).toBe("Practicar APIs a diario");
    expect(got.projects[projectId]).toMatchObject({ name: "API de inventario" });
    expect(got.items.length).toBeGreaterThan(0);
    expect(got.items[0]).toMatchObject({ kind: "topic", label: "Programación: Desarrollo Backend" });
    expect(got.months).toEqual([monthNow()]);
  });

  it("si el tema ya no existe, queda 'no encontrado' en vez de romper", async () => {
    const api = await accepted();
    const plan: any = (api.mentor_plan_get({ month: monthNow() }) as any).plan;
    plan.subplans[0].topics[2].folder = "Programación/Borrado/Tema";
    new PlanStore(dir).save(plan);
    const got: any = api.mentor_plan_get({ month: monthNow() });
    expect(got.derived.subplans[0].topics.map((t: any) => [t.state, t.found])).toEqual([["sin_tratar", true], ["sin_tratar", true], ["no_encontrado", false]]);
  });

  it("solo el entregable es editable: estado y proyecto, validados", async () => {
    const api = await accepted();
    const month = monthNow();
    const sub: any = (api.mentor_plan_get({ month }) as any).plan.subplans[1];
    const out = api.mentor_plan_update_deliverable({ month, subplanId: sub.id, status: "en_curso", projectId });
    expect(out.subplans[1]!.deliverable).toMatchObject({ status: "en_curso", projectId });
    expect(api.mentor_plan_update_deliverable({ month, subplanId: sub.id, status: "hecho" }).subplans[1]!.deliverable).toMatchObject({ status: "hecho", projectId });
    expect(api.mentor_plan_update_deliverable({ month, subplanId: sub.id, status: "hecho", projectId: null }).subplans[1]!.deliverable!.projectId).toBeUndefined();
    expect(() => api.mentor_plan_update_deliverable({ month, subplanId: sub.id, status: "raro" })).toThrow(ApiError);
    expect(() => api.mentor_plan_update_deliverable({ month, subplanId: sub.id, status: "idea", projectId: "p-no" })).toThrow(/no existe/);
    expect(() => api.mentor_plan_update_deliverable({ month, subplanId: "zzz", status: "idea" })).toThrow(ApiError);
    // lo demás del plan no cambia
    const after: any = api.mentor_plan_get({ month }).plan;
    expect(after.subplans[0].topics.map((t: any) => t.folder)).toEqual([FUND, APIS, DB]);
  });
});

describe("Hoy: plan_item y objetivo de la sesión", () => {
  it("con plan del mes, los candidatos de hoy empiezan por lo que toca, con su subplan", async () => {
    const { api, turnId } = await draft();
    api.mentor_plan_draft_accept({ turnId });
    const res = api.mentor_candidates({ availableMinutes: 480 });
    expect(res.candidates[0]).toMatchObject({ kind: "plan_item", links: { subplan: "Programación: Desarrollo Backend" } });
    expect(res.candidates.filter((c) => c.topicFolder === FUND)).toHaveLength(1);
  });

  it("mentor_plan_propose manda el objetivo a la IA y lo aplica de forma determinista", async () => {
    app.mgrs().tasks.create("Entrega pronto", { due: new Date(Date.now() + 86400000), subject: "Historia", priority: 3 });
    vaultScan(app);
    const send = vi.fn(async (_cfg: any, messages: any[]) => {
      const text = messages[1].content as string;
      const first = /- id=(\S+)/.exec(text)![1]!;
      return JSON.stringify({ summary: "ok", blocks: [{ candidateId: first, minutes: 20, reason: "x" }] });
    });
    const api = mentorApi(app, send);
    const res: any = await api.mentor_plan_propose({ availableMinutes: 120, objectiveSpec: { type: "subject", subject: "programming" } });
    const prompt = (send.mock.calls[0]![1] as any[])[1].content as string;
    expect(prompt).toContain("OBJETIVO DE LA SESIÓN: Estudiar Programación");
    expect(res.objective).toBe("Estudiar Programación");
    expect(res.candidates[0].subject).toBe("programming");
    expect(res.plan.blocks[0].candidateId).toBe(res.candidates[0].id);

    const tasks: any = await api.mentor_plan_propose({ availableMinutes: 120, objectiveSpec: { type: "tasks" } });
    expect(tasks.candidates[0].kind).toBe("task_deadline");
    // texto libre: se envía tal cual y se intenta casar con una meta por palabras clave
    const custom: any = await api.mentor_plan_propose({ availableMinutes: 120, objectiveSpec: { type: "custom", text: "mi meta de desarrollo backend" } });
    expect(custom.objective).toBe("Meta: Desarrollo Backend");
  });

  it("mentor_overview ofrece como objetivos tus metas con repetición, tus materias y el plan", async () => {
    const api = mentorApi(app, vi.fn());
    const ov: any = api.mentor_overview();
    expect(ov.objectives.goals).toEqual([
      expect.objectContaining({ goalId, name: "Desarrollo Backend", kind: "daily", itemIds: [itemId] }),
    ]);
    expect(ov.objectives.subjects).toEqual([{ subject: "programming", label: "Programación", topics: 3, open: 3 }]);
    expect(ov.objectives.plan).toBeNull();
    const d = await draft();
    d.api.mentor_plan_draft_accept({ turnId: d.turnId });
    expect((api.mentor_overview() as any).objectives.plan).toMatchObject({ month: monthNow() });
  });
});
