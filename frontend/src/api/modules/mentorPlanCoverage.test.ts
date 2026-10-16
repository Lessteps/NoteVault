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

describe("cobertura contra el checklist de diseño de temas", () => {
  it("la cobertura determinista añade el diseño de cada tema: puntuación y faltantes concretos, y no escribe nada", () => {
    const file = path.join(dir, ".notevault", "mentor", "plans", `${id}.json`);
    const before = fs.readFileSync(file, "utf-8");
    const r: any = mentorApi(app, vi.fn()).mentor_plan_coverage({ id });
    const a = r.coverage.areas[0];
    expect(a.design).toMatchObject({ topics: 3, complete: 0, incomplete: 3 });
    expect(r.coverage.totals.design.topics).toBe(3);
    const t = a.groups[0].designTopics;
    expect(t).toHaveLength(3);
    // el tema sin teoría falta teoría; los otros tienen una nota que no cumple el contrato y no tienen canvas
    const sinTeoria = t.find((x: any) => x.title === "03 Tema" || x.folder.endsWith("03 Tema"))!;
    expect(sinTeoria.gaps.map((g: any) => g.text)).toContain("Falta la nota de teoría");
    const conNota = t.find((x: any) => x.folder.endsWith("01 Tema"))!;
    expect(conNota.gaps.map((g: any) => g.text)).toEqual(expect.arrayContaining(["Falta el canvas del tema", "La nota no cumple el contrato: falta la sección Requires"]));
    expect(conNota.score).toBeLessThan(100);
    expect(fs.readFileSync(file, "utf-8")).toBe(before);
  });

  it("la IA recibe el checklist y los resultados por tema (nunca las notas) y su juicio de diseño se valida y se guarda", async () => {
    Object.assign(hoisted.store, { provider: "openai", api_key: "k", model: "m", base_url: "http://x" });
    const reply = JSON.stringify({
      summary: "Backend flojo en diseño.",
      designSummary: "Casi ningún tema tiene canvas.",
      areas: [{
        key: "backend",
        assessment: "ok",
        design: {
          summary: "Faltan canvas y manifiestos",
          topics: [
            { folder: "Programación/4 Backend/01 Tema", title: "x", verdict: "incomplete", create: ["canvas", "manifiesto", "estructura", "inventado"], note: "Falta el mapa" },
            { title: "4 Backend 3", verdict: "pobre", create: ["theory"], note: "Sin nota" },
            { title: "04 Tema", verdict: "good", create: [], note: "fuera del plan: se descarta" },
            { title: "No existe", verdict: "good", create: [] },
          ],
        },
      }],
    });
    const send = vi.fn().mockResolvedValue(reply);
    const r: any = await mentorApi(app, send).mentor_plan_coverage_review({ id });
    expect(r.source).toBe("ai");
    const prompt = JSON.stringify(send.mock.calls[0]![1]);
    expect(prompt).toContain("designChecklist");
    expect(prompt).toContain("Falta la nota de teoría"); // resultados deterministas del tema sin teoría
    expect(prompt).toContain("incompleteTopics");
    expect(prompt).toContain("canvas");
    expect(prompt).not.toContain("# T\n"); // las notas no viajan
    const d = r.review.areas[0].design;
    expect(d.summary).toBe("Faltan canvas y manifiestos");
    expect(d.topics.map((t: any) => [t.title, t.verdict])).toEqual([["4 Backend 1", "incomplete"], ["4 Backend 3", "poor"]]);
    expect(d.topics[0].create).toEqual(["canvas", "manifest", "contract"]); // alias en español y el id inventado descartado
    expect(d.topics[0].folder).toBe("Programación/4 Backend/01 Tema");
    expect(r.review.designSummary).toBe("Casi ningún tema tiene canvas.");
    expect(r.review.discarded).toBeGreaterThanOrEqual(2);
    // se guarda y se lee de nuevo; una revisión antigua (sin diseño) sigue leyéndose
    const saved = new PlanStore(dir).load(id)!;
    expect(saved.coverageReview!.areas[0]!.design!.topics).toHaveLength(2);
    expect(saved.coverageReview!.designSummary).toContain("canvas");
    const plain = JSON.stringify({ summary: "x", areas: [{ key: "backend", assessment: "y", missing: [{ title: "Job queues", why: "z" }] }] });
    const r2: any = await mentorApi(app, vi.fn().mockResolvedValue(plain)).mentor_plan_coverage_review({ id });
    expect(r2.review.areas[0].design).toBeUndefined();
    expect(r2.review.areas[0].missing).toHaveLength(1);
  });
});

describe("catálogo de temas del plan (API)", () => {
  it("lista todos los temas de la vault (también los de fuera del plan) con lo que existe de cada uno, sin escribir nada", () => {
    const file = path.join(dir, ".notevault", "mentor", "plans", `${id}.json`);
    const before = fs.readFileSync(file, "utf-8");
    const r: any = mentorApi(app, vi.fn()).mentor_plan_topic_catalog({ id });
    expect(r.loading).toBe(false);
    expect(r.rows.map((t: any) => t.title)).toEqual(["01 Tema", "02 Tema", "03 Tema", "04 Tema"].map((n) => n));
    const by = (n: string) => r.rows.find((t: any) => t.folder.endsWith(n));
    expect(by("01 Tema")).toMatchObject({ inPlan: true, area: "Backend", theory: true, manifest: true, skills: 2, exercises: 0 });
    expect(by("03 Tema")).toMatchObject({ inPlan: true, theory: false });
    expect(by("04 Tema")).toMatchObject({ inPlan: false, theory: true, branch: "Backend" });
    expect(by("04 Tema").area).toBeUndefined();
    expect(fs.readFileSync(file, "utf-8")).toBe(before);
    expect(() => mentorApi(app, vi.fn()).mentor_plan_topic_catalog({ id: "../x" })).toThrow(/Plan inválido/);
  });
});
