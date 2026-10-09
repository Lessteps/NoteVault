// Plan del Mentor con la pista Programming practice y entregables «a discutir»: generación (IA simulada y plan
// automático), responder las preguntas del borrador, aceptar y leer el plan con el estado derivado del módulo
// `programming_practice`, y la integración con «Hoy» (candidatos y objetivo).

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
import { addDays } from "../../lib/planTime.js";
import { AppState } from "../appState.js";
import { vaultScan } from "../vaultScan.js";
import { mentorApi } from "./mentor.js";

const MANIFEST = (title: string) => `---\ntype: topic\nsubject: programming\ntitle: "${title}"\nskills: [implement, debug]\nmastery:\n  min_per_skill: 6\n  target_difficulty: 3\n  exam: none\n---\n`;
const FUND = "Programación/Python/1 Fundamentos";
const APIS = "Programación/Python/2 APIs web";

let dir: string;
let app: AppState;
const two = (n: number) => String(n).padStart(2, "0");
const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
};
function topic(rel: string, title: string) {
  const abs = path.join(dir, ...rel.split("/"));
  fs.mkdirSync(abs, { recursive: true });
  fs.writeFileSync(path.join(abs, "_tema.md"), MANIFEST(title), "utf-8");
  fs.writeFileSync(path.join(abs, `${title}.md`), "---\ntype: concept\n---\n# T\n", "utf-8");
}
const PRACTICE = { kataMinutes: 30, sessionsPerWeek: 3, minutesPerSession: 60, monthly: true, focus: "rotate" };
const pre = (over: Record<string, unknown> = {}) => ({
  start: todayIso(),
  end: addDays(todayIso(), 20),
  minutesPerDay: 180,
  studyDays: [1, 2, 3, 4, 5, 6, 7],
  pace: "intenso",
  goalIds: [],
  subjects: ["Programación"],
  levels: {},
  practice: PRACTICE,
  ...over,
});

beforeEach(() => {
  for (const k of Object.keys(hoisted.store)) delete hoisted.store[k]; // sin IA: plan automático determinista
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "nv_mentor_pp_"));
  topic(FUND, "1 Fundamentos");
  topic(APIS, "2 APIs web");
  fs.writeFileSync(path.join(dir, "Programación", "Programación.resumen.md"), "---\nsubject: programming\n---\n");
  app = new AppState(dir);
  vaultScan(app);
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

async function generate(over: Record<string, unknown> = {}, send?: any) {
  const api = mentorApi(app, send ?? vi.fn());
  const res: any = await api.mentor_plan_generate_draft({ preconditions: pre(over) });
  return { api, res, draft: res.planDraft };
}

describe("entregables a discutir en el borrador", () => {
  it("por defecto los entregables quedan POR DEFINIR: ni entregable ni pregunta; «ask» de planes antiguos sigue dando UNA pregunta global; booleanos antiguos se leen", async () => {
    const fresh = (await generate()).draft;
    expect(fresh.preconditions.deliverables).toBe("no");
    expect(fresh.subplans.every((s: any) => !s.deliverable)).toBe(true);
    expect(fresh.openQuestions).toBeUndefined();
    const { draft } = await generate({ deliverables: "ask" });
    expect(draft.preconditions.deliverables).toBe("ask");
    expect(draft.subplans.every((s: any) => !s.deliverable)).toBe(true);
    expect(draft.openQuestions).toEqual([{ id: "deliverables", text: expect.stringContaining("por cada área"), options: ["Sí", "No", "Después"] }]);
    expect((await generate({ deliverables: true })).draft.subplans[0].deliverable).toBeTruthy();
    expect((await generate({ deliverables: false })).draft.openQuestions).toBeUndefined();
  });

  it("con IA, «ask» no añade el entregable aunque la IA lo proponga", async () => {
    hoisted.store.provider = "deepseek";
    hoisted.store.api_key = "sk-test";
    hoisted.store.model = "m";
    const reply = JSON.stringify({ type: "plan_draft", rationale: "r", hoursPerWeek: 5, subplans: [{ area: "Programación", objective: "o", topics: [{ folder: FUND }], deliverable: { title: "P", description: "d", criteria: ["c"] } }] });
    const send = vi.fn().mockResolvedValueOnce(reply);
    const { draft } = await generate({ deliverables: "ask" }, send);
    expect((send.mock.calls[0]![1] as any[])[0].content).toContain("Entregables: A DISCUTIR");
    expect(draft.subplans[0].deliverable).toBeUndefined();
    expect(draft.openQuestions).toHaveLength(1);
  });

  it("responder la pregunta global: yes añade el proyecto de cada área, no la descarta, later la deja; todo queda en el borrador", async () => {
    const { api, res } = await generate({ subjects: ["Programación"], goalIds: [], deliverables: "ask" });
    const base = { turnId: res.pending, chatId: res.chatId };
    const later: any = api.mentor_plan_draft_answer({ ...base, answer: "later" });
    expect(later.planDraft.openQuestions).toHaveLength(1);
    expect(later.planDraft.subplans[0].deliverable).toBeUndefined();
    const yes: any = api.mentor_plan_draft_answer({ ...base, answer: "yes" });
    expect(yes.planDraft.subplans[0].deliverable).toMatchObject({ status: "idea", title: "API REST con persistencia y pruebas" });
    expect(yes.planDraft.openQuestions).toBeUndefined();
    // persistido en el turno: el panel lo vuelve a leer igual
    expect((api.mentor_chat_load() as any).turns.find((t: any) => t.id === res.pending).planDraft.subplans[0].deliverable).toBeTruthy();
    expect(() => api.mentor_plan_draft_answer({ ...base, answer: "quizá" })).toThrow(ApiError);
    expect(() => api.mentor_plan_draft_answer({ ...base, subplanId: "zzz", answer: "yes" })).toThrow(ApiError);
    expect(() => api.mentor_plan_draft_answer({ ...base, questionId: "otra", answer: "yes" })).toThrow(ApiError);
    // no escribe ningún plan
    expect(fs.existsSync(path.join(dir, ".notevault", "mentor", "plans"))).toBe(false);

    const second = await generate({ end: addDays(todayIso(), 13), deliverables: "ask" });
    const no: any = second.api.mentor_plan_draft_answer({ turnId: second.res.pending, chatId: second.res.chatId, answer: "no" });
    expect(no.planDraft.openQuestions).toBeUndefined();
    expect(no.planDraft.subplans[0].deliverable).toBeUndefined();
  });

  it("aceptar con una pregunta sin responder la deja anotada en el plan y no inventa el entregable", async () => {
    const { api, res } = await generate({ deliverables: "ask" });
    const out: any = api.mentor_plan_draft_accept({ turnId: res.pending, chatId: res.chatId });
    const plan: any = (api.mentor_plan_get({ id: out.id }) as any).plan;
    expect(plan.subplans[0].deliverable).toBeUndefined();
    expect(plan.openQuestions).toEqual([expect.objectContaining({ id: "deliverables" })]);
    expect(plan.openQuestions[0].subplanId).toBeUndefined();
  });

  it("aceptar tras responder «yes» guarda el entregable y ninguna pregunta", async () => {
    const { api, res } = await generate({ deliverables: "ask" });
    api.mentor_plan_draft_answer({ turnId: res.pending, chatId: res.chatId, answer: "yes" });
    const out: any = api.mentor_plan_draft_accept({ turnId: res.pending, chatId: res.chatId });
    const plan: any = (api.mentor_plan_get({ id: out.id }) as any).plan;
    expect(plan.subplans[0].deliverable.status).toBe("idea");
    expect(plan.openQuestions).toBeUndefined();
  });
});

describe("Programming practice en el plan", () => {
  it("el borrador reserva minutos y trae la pista; sin práctica no hay pista", async () => {
    const { draft } = await generate();
    expect(draft.programmingPractice.kata).toMatchObject({ minutesPerDay: 30 });
    expect(draft.programmingPractice.weeklyProject.weeks.length).toBeGreaterThanOrEqual(3);
    expect(draft.programmingPractice.monthlyProject.blocks.length).toBeGreaterThan(0);
    expect(draft.coverage).toContain("Programming practice");
    const plain = (await generate({ practice: undefined })).draft;
    expect(plain.programmingPractice).toBeUndefined();
    expect(plain.hoursPerWeek).toBeGreaterThan(draft.hoursPerWeek);
  });

  it("aceptar recalcula la pista (determinista) y solo toma temas/focos validados del borrador", async () => {
    const { api, res, draft } = await generate();
    // un cliente malicioso o un borrador viejo no puede colar minutos ni fases
    const forged = JSON.parse(JSON.stringify(draft));
    forged.programmingPractice.kata.minutesPerDay = 999;
    forged.programmingPractice.weeklyProject.weeks[0].theme = "Gestor de gastos";
    forged.programmingPractice.weeklyProject.weeks[0].sessions[0].minutes = 500;
    const out: any = api.mentor_plan_draft_accept({ draft: forged });
    const plan: any = (api.mentor_plan_get({ id: out.id }) as any).plan;
    expect(plan.programmingPractice.kata.minutesPerDay).toBe(30);
    expect(plan.programmingPractice.weeklyProject.weeks[0]).toMatchObject({ theme: "Gestor de gastos" });
    expect(plan.programmingPractice.weeklyProject.weeks[0].sessions[0].minutes).toBe(60);
    expect(res.pending).toBeTruthy();
  });

  it("mentor_plan_get: estado derivado del kata (intentos pp_kata) y del proyecto (carpeta del módulo) + fila del plan", async () => {
    const { api, res } = await generate();
    const out: any = api.mentor_plan_draft_accept({ turnId: res.pending, chatId: res.chatId });
    let got: any = api.mentor_plan_get({ id: out.id });
    expect(got.practice.ppReady).toBe(false); // todavía no existe programming_practice
    expect(got.practice.kata).toMatchObject({ doneDays: 0, todayPlanned: true, todayDone: false });
    expect(got.practiceItems.map((i: any) => i.kind)).toContain("kata");
    expect((api.mentor_plan_list() as any[])[0].programmingPractice).toBe(true);

    // el módulo de práctica ya tiene un intento del kata de hoy y un proyecto defendido creado esta semana
    const pp = path.join(dir, "Programación", "programming_practice", "projects");
    fs.mkdirSync(path.join(pp, "Gastos"), { recursive: true });
    fs.writeFileSync(path.join(pp, "Gastos", ".pp.json"), JSON.stringify({ version: 1, state: "defended", createdAt: new Date().toISOString(), spec: { title: "Gastos", focus: "backend", client: "web" }, defense: { final: { score: 70 } } }));
    fs.mkdirSync(path.join(dir, ".notevault", "estudio", "intentos"), { recursive: true });
    fs.writeFileSync(path.join(dir, ".notevault", "estudio", "intentos", "att_k.json"), JSON.stringify({ note_id: "k1", note_path: "k1.md", draft: "", attempts: [{ skill: "pp_kata", at: `${todayIso()}T08:00:00`, score: 1 }] }));
    got = api.mentor_plan_get({ id: out.id });
    expect(got.practice.ppReady).toBe(true);
    expect(got.practice.kata).toMatchObject({ todayDone: true, streak: 1 });
    expect(got.practice.weeks[0]).toMatchObject({ project: { folder: "Gastos", state: "defended" }, phases: { build: "hecho", construct: "hecho", defend: "en_curso" }, source: "pp" });
    // el kata ya hecho no vuelve a ofrecerse en Hoy
    expect(got.practiceItems.map((i: any) => i.kind)).not.toContain("kata");
  });

  it("Hoy: candidatos practice_kata/practice_project, objetivo propio y registro manual del bloque", async () => {
    const { api, res } = await generate();
    api.mentor_plan_draft_accept({ turnId: res.pending, chatId: res.chatId });
    const c: any = api.mentor_candidates({ availableMinutes: 480 });
    const kata = c.candidates.find((x: any) => x.kind === "programming_practice_kata");
    expect(kata).toMatchObject({ estMinutes: 30, subject: "programming_practice" });
    expect(kata.reasons[0]).toContain("Reto diario del plan");
    const ov: any = api.mentor_overview();
    expect(ov.objectives.programmingPractice.items).toBeGreaterThan(0);
    // el objetivo de práctica sube solo lo suyo
    const only: any = api.mentor_candidates({ availableMinutes: 480, objective: { type: "programming_practice" } });
    expect(only.candidates[0].kind).toMatch(/^programming_practice_/);
    // aceptar el plan de hoy con el kata y marcarlo hecho: el estado manual lo recoge
    api.mentor_plan_accept({ availableMinutes: 60, blocks: [{ candidateId: kata.id, minutes: 30, reason: "r", kind: kata.kind, subject: kata.subject }] });
    api.mentor_block_status(todayIso(), kata.id, "done");
    const after: any = api.mentor_plan_get({});
    expect(after.practice.kata.todayDone).toBe(true);
    expect(after.practiceItems.map((i: any) => i.kind)).not.toContain("kata");
    // sin planes activos con práctica no hay chip
    for (const p of api.mentor_plan_list() as any[]) api.mentor_plan_archive({ id: p.id });
    expect((api.mentor_overview() as any).objectives.programmingPractice).toBeNull();
  });
});
