// «Crear el plan con otra IA»: el archivo para la otra IA y la creación del plan con su respuesta, SIN clave de API ni modelo local.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({ store: {} as Record<string, unknown> }));
vi.mock("../appConfig.js", () => ({
  AppConfig: { get_ai_config: () => ({ ...hoisted.store }), set_ai_config: (d: Record<string, unknown>) => Object.assign(hoisted.store, d) },
}));

import { addDays } from "../../lib/planTime.js";
import { AppState } from "../appState.js";
import { vaultScan } from "../vaultScan.js";
import { mentorApi } from "./mentor.js";

const MANIFEST = (title: string) => `---\ntype: topic\nsubject: programming\ntitle: "${title}"\nskills: [implement, debug]\nmastery:\n  min_per_skill: 6\n  target_difficulty: 3\n  exam: none\n---\n`;
const FUND = "Programación/Python/1 Fundamentos";
const APIS = "Programación/Python/2 APIs web";

let dir: string;
let app: AppState;
let goalId: string;

function topic(rel: string, title: string) {
  const abs = path.join(dir, ...rel.split("/"));
  fs.mkdirSync(abs, { recursive: true });
  fs.writeFileSync(path.join(abs, "_tema.md"), MANIFEST(title), "utf-8");
  fs.writeFileSync(path.join(abs, `${title}.md`), "---\ntype: concept\n---\n# T\n", "utf-8");
}
const two = (n: number) => String(n).padStart(2, "0");
const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
};
const pre = () => ({ start: todayIso(), end: addDays(todayIso(), 29), minutesPerDay: 120, studyDays: [1, 2, 3, 4, 5, 6], pace: "normal", goalIds: [goalId], subjects: [], levels: {}, deliverables: "no" });

beforeEach(() => {
  for (const k of Object.keys(hoisted.store)) delete hoisted.store[k]; // SIN IA configurada
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "nv_plan_external_"));
  topic(FUND, "1 Fundamentos");
  topic(APIS, "2 APIs web");
  app = new AppState(dir);
  const goal = app.mgrs().goals.create_goal("Desarrollo Backend", { priority: 2 });
  goalId = goal.id;
  app.mgrs().goals.create_item(goal.id, "Aprender Python", "", { topic_links: [FUND, APIS] });
  vaultScan(app);
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

const reply = (folders: string[]) =>
  "Aquí tienes el plan:\n```json\n" +
  JSON.stringify({ type: "plan_draft", rationale: "Bases y luego APIs.", hoursPerWeek: 99, subplans: [{ area: "Programación", objective: "Desarrollo Backend", goalId, topics: folders.map((f) => ({ folder: f, why: "orden" })) }] }) +
  "\n```";

describe("mentor_plan_external_prompt", () => {
  it("escribe en la vault el pedido completo, con precondiciones y catálogo real, sin usar la IA de la app", () => {
    const send = vi.fn();
    const r: any = mentorApi(app, send).mentor_plan_external_prompt({ preconditions: pre() });
    expect(r.loading).toBe(false);
    expect(send).not.toHaveBeenCalled();
    expect(r.rel).toMatch(/^Programación\/_handoff\/planes\/.+_plan\.md$/);
    expect(r.answerRel).toMatch(/_plan_respuesta\.json$/);
    const doc = fs.readFileSync(r.abs, "utf-8");
    expect(doc).toContain("HECHOS FIJOS");
    expect(doc).toContain(`folder=${FUND}`);
    expect(doc).toContain(r.answerAbs);
    expect(r.shortPrompt).toContain(r.abs);
    expect(r.chatPrompt).toContain("HECHOS FIJOS");
    expect(r.topics).toBe(2);
  });

  it("rechaza precondiciones inválidas y vaults sin temas pendientes", () => {
    const api: any = mentorApi(app, vi.fn());
    expect(() => api.mentor_plan_external_prompt({ preconditions: { ...pre(), end: addDays(todayIso(), -3) } })).toThrow();
    expect(() => api.mentor_plan_external_prompt({ preconditions: { ...pre(), goalIds: [], subjects: [] } })).toThrow();
  });
});

describe("mentor_plan_external_accept", () => {
  it("crea el plan propuesto con la respuesta pegada, ignorando lo inventado y las precondiciones de la IA", async () => {
    const api: any = mentorApi(app, vi.fn());
    const r = await api.mentor_plan_external_accept({ preconditions: pre(), reply: reply([FUND, "Programación/Django/Inventado", APIS]) });
    expect(r).toMatchObject({ loading: false, kind: "plan_created", source: "ai" });
    const folders = r.planDraft.subplans.flatMap((s: any) => s.topics.map((t: any) => t.folder));
    expect(folders).toEqual(expect.arrayContaining([FUND, APIS]));
    expect(folders).not.toContain("Programación/Django/Inventado");
    expect(r.planDraft.hoursPerWeek).not.toBe(99);
    expect(fs.readdirSync(path.join(dir, ".notevault", "mentor", "plans")).some((f) => f.endsWith(".json"))).toBe(true);
  });

  it("lee la respuesta del archivo que escribió la otra IA", async () => {
    const api: any = mentorApi(app, vi.fn());
    const made = api.mentor_plan_external_prompt({ preconditions: pre() });
    await expect(api.mentor_plan_external_accept({ preconditions: pre(), answerRel: made.answerRel })).rejects.toThrow(/todavía no escribió/);
    fs.writeFileSync(made.answerAbs, reply([FUND, APIS]), "utf-8");
    const r = await api.mentor_plan_external_accept({ preconditions: pre(), answerRel: made.answerRel });
    expect(r.kind).toBe("plan_created");
  });

  it("no crea nada si la respuesta no sirve, y dice por qué", async () => {
    const api: any = mentorApi(app, vi.fn());
    await expect(api.mentor_plan_external_accept({ preconditions: pre(), reply: "no sé qué hacer" })).rejects.toThrow(/No pude usar esa respuesta/);
    await expect(api.mentor_plan_external_accept({ preconditions: pre(), reply: reply(["Programación/Django/Inventado"]) })).rejects.toThrow(/ningún tema válido|No pude usar/);
    await expect(api.mentor_plan_external_accept({ preconditions: pre(), reply: "  " })).rejects.toThrow(/Pega la respuesta/);
    expect(fs.existsSync(path.join(dir, ".notevault", "mentor", "plans"))).toBe(false);
  });

  it("no lee archivos fuera de _handoff/planes", async () => {
    fs.writeFileSync(path.join(dir, "secreto.txt"), "x", "utf-8");
    const api: any = mentorApi(app, vi.fn());
    await expect(api.mentor_plan_external_accept({ preconditions: pre(), answerRel: "secreto.txt" })).rejects.toThrow(/no es una respuesta de plan/);
    await expect(api.mentor_plan_external_accept({ preconditions: pre(), answerRel: "../etc/passwd" })).rejects.toThrow(/no es una respuesta de plan/);
  });
});
