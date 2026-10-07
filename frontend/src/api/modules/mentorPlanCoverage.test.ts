// API de la cobertura del plan: parte determinista (teoría y ejercicios por tema, temas fuera del plan) y «Revisar cobertura con el Mentor»
// con una IA simulada (valida, descarta lo que ya existe, guarda `coverageReview`; sin IA o con fallo no guarda nada).

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

import { buildPlan, PlanStore } from "../../core/mentor/plan.js";
import { addDays } from "../../lib/planTime.js";
import { AppState } from "../appState.js";
import { clearVaultScanCache, vaultScan } from "../vaultScan.js";
import { mentorApi } from "./mentor.js";

const MANIFEST = (title: string) => `---\ntype: topic\nsubject: programming\ntitle: "${title}"\nskills: [implement, debug]\nmastery:\n  min_per_skill: 6\n  target_difficulty: 3\n  exam: none\n---\n`;
let dir: string;
let app: AppState;
const two = (n: number) => String(n).padStart(2, "0");
const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
};
function topic(rel: string, theory: boolean) {
  const abs = path.join(dir, ...rel.split("/"));
  fs.mkdirSync(abs, { recursive: true });
  const title = rel.split("/").pop()!;
  fs.writeFileSync(path.join(abs, "_tema.md"), MANIFEST(title), "utf-8");
  if (theory) fs.writeFileSync(path.join(abs, `${title}.md`), "---\ntype: concept\n---\n# T\n", "utf-8");
}
const START = todayIso();
const END = addDays(START, 60);
const seed = (name: string, n: number) => ({ area: "Programación", objective: name, topics: Array.from({ length: n }, (_, i) => ({ folder: `Programación/${name}/${two(i + 1)} Tema`, title: `${name} ${i + 1}`, estMinutes: 60 })) });
let id = "";

beforeEach(() => {
  for (const k of Object.keys(hoisted.store)) delete hoisted.store[k];
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "nv_cov_"));
  // 4 Backend: 3 temas en el plan (el 3.º sin teoría) + 1 fuera del plan; ninguno tiene ejercicios
  topic("Programación/4 Backend/01 Tema", true);
  topic("Programación/4 Backend/02 Tema", true);
  topic("Programación/4 Backend/03 Tema", false);
  topic("Programación/4 Backend/04 Tema", true);
  clearVaultScanCache();
  app = new AppState(dir);
  vaultScan(app);
  const built = buildPlan([seed("4 Backend", 3)], { id: `${START}_${END}`, start: START, end: END, minutesPerDay: 240, studyDays: [1, 2, 3, 4, 5, 6, 7], pace: "intenso", from: START, preconditions: { start: START, end: END, minutesPerDay: 240, studyDays: [1, 2, 3, 4, 5, 6, 7], pace: "intenso", goalIds: [], subjects: ["Programación"], levels: {}, deliverables: "no", freeObjective: "full stack especializado en automatización" } as never, name: "Plan" }).plan;
  new PlanStore(dir).save({ ...built, subplans: built.subplans.map((s) => ({ ...s, areaId: "backend", area: "Backend", topics: s.topics.map((t) => ({ ...t, group: "core" })), groups: [{ id: "core", title: "Conocimientos de backend", kind: "knowledge", order: 100 }] })), structure: "areas" });
  id = built.id;
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

const reply = JSON.stringify({ summary: "Backend se queda corto para automatización.", areas: [{ key: "backend", assessment: "Faltan colas y jobs.", missing: [{ title: "Job scheduling", why: "tareas programadas" }, { title: "Tema" }, { title: "Web scraping", why: "extraer datos" }] }] });

describe("cobertura del plan (API)", () => {
  it("calcula teoría, práctica y los temas de la rama que no están en el plan, sin escribir nada", () => {
    const file = path.join(dir, ".notevault", "mentor", "plans", `${id}.json`);
    const before = fs.readFileSync(file, "utf-8");
    const r: any = mentorApi(app, vi.fn()).mentor_plan_coverage({ id });
    expect(r.loading).toBe(false);
    const a = r.coverage.areas[0];
    expect(a).toMatchObject({ total: 3, theory: 2, practice: 0 });
    expect(a.groups[0].noTheory).toHaveLength(1);
    expect(a.outOfPlan.map((t: any) => t.title)).toEqual(["04 Tema"]);
    expect(r.review).toBeNull();
    expect(fs.readFileSync(file, "utf-8")).toBe(before);
    expect(() => mentorApi(app, vi.fn()).mentor_plan_coverage({ id: "../x" })).toThrow(/Plan inválido/);
  });

  it("con IA simulada valida, descarta lo que ya existe y guarda coverageReview; el prompt no lleva notas", async () => {
    Object.assign(hoisted.store, { provider: "openai", api_key: "k", model: "m", base_url: "http://x" });
    const send = vi.fn().mockResolvedValue(reply);
    const api = mentorApi(app, send);
    const r: any = await api.mentor_plan_coverage_review({ id, profile: "full stack especializado en automatización" });
    expect(r.source).toBe("ai");
    expect(r.review.areas[0].missing.map((m: any) => m.title)).toEqual(["Job scheduling", "Web scraping"]);
    expect(r.review.discarded).toBe(1);
    expect(r.review.profile).toContain("automatización");
    const prompt = JSON.stringify(send.mock.calls[0]![1]);
    expect(prompt).toContain("full stack especializado en automatización");
    expect(prompt).not.toContain("# T");
    const saved = new PlanStore(dir).load(id)!;
    expect(saved.coverageReview?.areas[0]!.key).toBe("backend");
    expect((api.mentor_plan_coverage({ id }) as any).review.summary).toContain("corto");
    // la revisión no toca los temas
    expect(saved.subplans[0]!.topics).toHaveLength(3);
  });

  it("sin IA, con fallo o con respuesta inválida: no guarda nada y devuelve la cobertura calculada", async () => {
    const none: any = await mentorApi(app, vi.fn()).mentor_plan_coverage_review({ id });
    expect(none.source).toBe("none");
    expect(none.reason).toMatch(/sin IA|IA no está configurada/i);
    expect(none.coverage.areas).toHaveLength(1);
    Object.assign(hoisted.store, { provider: "openai", api_key: "k", model: "m", base_url: "http://x" });
    const boom: any = await mentorApi(app, vi.fn().mockRejectedValue(new Error("sin red"))).mentor_plan_coverage_review({ id });
    expect(boom.source).toBe("none");
    expect(boom.reason).toContain("sin red");
    const bad: any = await mentorApi(app, vi.fn().mockResolvedValue("no es json")).mentor_plan_coverage_review({ id });
    expect(bad.source).toBe("none");
    expect(new PlanStore(dir).load(id)!.coverageReview).toBeUndefined();
  });
});
