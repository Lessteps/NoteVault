// «Preguntas, correcciones y ajustes» y la revisión REALISTA de cobertura (API): preguntar NO modifica el plan (con IA simulada y sin IA),
// la clasificación de lo escrito, el criterio de la revisión (prompt con reglas de realismo y honestidad, salida validada con veredicto,
// faltantes y prescindibles), «Añadir faltante al plan» (propuesta, sin notas) y «Pasar prescindibles a fuera de ruta» (deshacible).

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
function topic(rel: string) {
  const abs = path.join(dir, ...rel.split("/"));
  fs.mkdirSync(abs, { recursive: true });
  fs.writeFileSync(path.join(abs, "_tema.md"), MANIFEST(rel.split("/").pop()!), "utf-8");
}
const START = todayIso();
const END = addDays(START, 60);
const F = (n: number) => `Programación/4 Backend/0${n} Tema${n}`;
let id = "";
const AI = { provider: "openai", api_key: "k", model: "m", base_url: "http://x" };

beforeEach(() => {
  for (const k of Object.keys(hoisted.store)) delete hoisted.store[k];
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "nv_ask_"));
  for (const n of [1, 2, 3, 4]) topic(F(n));
  clearVaultScanCache();
  app = new AppState(dir);
  vaultScan(app);
  const seed = { area: "Programación", objective: "4 Backend", topics: [1, 2, 3, 4].map((n) => ({ folder: F(n), title: `Tema${n}`, estMinutes: 60 })) };
  const built = buildPlan([seed], { id: `${START}_${END}`, start: START, end: END, minutesPerDay: 240, studyDays: [1, 2, 3, 4, 5, 6, 7], pace: "intenso", from: START, preconditions: { start: START, end: END, minutesPerDay: 240, studyDays: [1, 2, 3, 4, 5, 6, 7], pace: "intenso", goalIds: [], subjects: ["Programación"], levels: {}, deliverables: "no", freeObjective: "full stack" } as never, name: "Plan" }).plan;
  new PlanStore(dir).save({ ...built, subplans: built.subplans.map((s) => ({ ...s, areaId: "backend", area: "Backend", topics: s.topics.map((t) => ({ ...t, group: "core" })), groups: [{ id: "core", title: "Conocimientos de backend", kind: "knowledge", order: 100 }] })), structure: "areas" });
  id = built.id;
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

const planFile = () => path.join(dir, ".notevault", "mentor", "plans", `${id}.json`);

describe("mentor_plan_ask: preguntar no modifica el plan", () => {
  it("con IA simulada responde con texto, usa el plan compacto como contexto y deja la pregunta en el historial", async () => {
    Object.assign(hoisted.store, AI);
    const before = fs.readFileSync(planFile(), "utf-8");
    const send = vi.fn().mockResolvedValue("Backend va primero porque lo demás se apoya en él.");
    const api = mentorApi(app, send);
    const r: any = await api.mentor_plan_ask({ id, question: "¿Por qué Backend va primero?" });
    expect(r.loading).toBe(false);
    expect(r.source).toBe("ai");
    expect(r.answer).toContain("Backend va primero");
    expect(r.entry).toMatchObject({ status: "answered", kind: "question", comment: "¿Por qué Backend va primero?", answer: r.answer });
    const prompt = JSON.stringify(send.mock.calls[0]![1]);
    expect(prompt).toContain("ÁREA Backend");
    expect(prompt).toContain("NO modifiques nada");
    // el plan no cambió ni un byte
    expect(fs.readFileSync(planFile(), "utf-8")).toBe(before);
    // y la pregunta no es un cambio: «Deshacer» no tiene nada que deshacer
    expect(() => api.mentor_plan_change_undo({ id })).toThrow(/ningún cambio que deshacer/);
    const hist: any[] = api.mentor_plan_changes({ id }) as any;
    expect(hist).toHaveLength(1);
    expect(hist[0].answer).toContain("Backend va primero");
  });

  it("sin IA responde de forma determinista con el modelo del plan (semanas, avance) y dice con claridad lo que no sabe", async () => {
    const api = mentorApi(app, vi.fn());
    const before = fs.readFileSync(planFile(), "utf-8");
    const a: any = await api.mentor_plan_ask({ id, question: "¿Cuántas semanas ocupa Backend?" });
    expect(a.source).toBe("rules");
    expect(a.answer).toMatch(/Backend ocupa .*semana/);
    const b: any = await api.mentor_plan_ask({ id, question: "¿Cuánto falta para terminar?" });
    expect(b.answer).toMatch(/Llevas 0 de 4 temas/);
    const c: any = await api.mentor_plan_ask({ id, question: "háblame del tiempo en Marte" });
    expect(c.understood).toBe(false);
    expect(c.answer).toContain("Sin IA");
    expect(fs.readFileSync(planFile(), "utf-8")).toBe(before);
    await expect(api.mentor_plan_ask({ id, question: "  " })).rejects.toThrow(/Escribe tu pregunta/);
    await expect(api.mentor_plan_ask({ id: "../x", question: "hola" })).rejects.toThrow(/Plan inválido/);
  });

  it("si la IA falla, cae a las respuestas deterministas y lo avisa", async () => {
    Object.assign(hoisted.store, AI);
    const r: any = await mentorApi(app, vi.fn().mockRejectedValue(new Error("sin red"))).mentor_plan_ask({ id, question: "¿Qué cubre el plan?" });
    expect(r.source).toBe("rules");
    expect(r.answer).toContain("La IA falló");
    expect(r.answer).toContain("1 áreas");
  });
});

describe("mentor_plan_intent: clasificar lo escrito", () => {
  it("lo claro se resuelve por reglas sin gastar una llamada a la IA", async () => {
    Object.assign(hoisted.store, AI);
    const send = vi.fn();
    const api = mentorApi(app, send);
    expect(await api.mentor_plan_intent({ id, text: "¿Por qué este orden?" })).toMatchObject({ intent: "question", confident: true, source: "rules" });
    expect(await api.mentor_plan_intent({ id, text: "Quita lo de desktop" })).toMatchObject({ intent: "adjust", confident: true });
    expect(await api.mentor_plan_intent({ id, text: "Hay temas repetidos en Backend" })).toMatchObject({ intent: "fix", confident: true });
    expect(send).not.toHaveBeenCalled();
  });

  it("en la duda pregunta a la IA; si sigue sin estar claro devuelve la pregunta de aclaración", async () => {
    Object.assign(hoisted.store, AI);
    const ai = mentorApi(app, vi.fn().mockResolvedValue('{"intent":"question","confidence":0.9}'));
    expect(await ai.mentor_plan_intent({ id, text: "¿Puedes quitar Docker?" })).toMatchObject({ intent: "question", confident: true, source: "ai" });
    const unsure = mentorApi(app, vi.fn().mockResolvedValue('{"intent":"unclear"}'));
    const r: any = await unsure.mentor_plan_intent({ id, text: "¿Puedes quitar Docker?" });
    expect(r.confident).toBe(false);
    expect(r.ask).toContain("¿Solo quieres saber");
    // respuesta basura: se queda la clasificación por reglas
    const junk: any = await mentorApi(app, vi.fn().mockResolvedValue("no sé")).mentor_plan_intent({ id, text: "¿Puedes quitar Docker?" });
    expect(junk.source).toBe("rules");
    expect(junk.confident).toBe(false);
  });

  it("una corrección o un ajuste aplicados quedan en el historial con su intención", async () => {
    const api = mentorApi(app, vi.fn());
    const r: any = await api.mentor_plan_change({ id, comment: "hazlo más ligero", intent: "fix" });
    expect(r.entry.kind).toBe("fix");
    const r2: any = await api.mentor_plan_change({ id, comment: "hazlo más ligero" });
    expect(r2.entry.kind).toBe("adjust");
  });
});

const REVIEW = JSON.stringify({
  summary: "Backend se queda corto frente a un junior de hoy.",
  overall: { verdict: "corto", coveragePct: 68, text: "Cubres ~70 % de lo esperado de un junior hoy (estimación)." },
  areas: [
    {
      key: "backend",
      verdict: "Corto",
      verdictWhy: "Faltan tests, contenedores y CI/CD.",
      coveragePct: "62%",
      assessment: "Falta lo que antes era mid-level.",
      missing: [
        { title: "Testing de APIs", why: "hoy se espera en un junior", priority: "alta", level: "junior" },
        { title: "Docker básico", why: "contenedores", priority: "media", level: "mid" },
        { title: "Tema1", why: "ya existe" },
      ],
      dispensable: [{ title: "Tema4", reason: "demasiado básico para un junior hoy" }, { title: "Inventado", reason: "x" }],
    },
  ],
});

describe("revisión REALISTA de cobertura con criterio", () => {
  it("el prompt lleva el criterio, las reglas de realismo (mercado HOY, junior = antiguo mid) y la honestidad; la salida se valida y se guarda", async () => {
    Object.assign(hoisted.store, AI);
    const send = vi.fn().mockResolvedValue(REVIEW);
    const api = mentorApi(app, send);
    const criteria = { presets: ["market", "interviews"], targetLevel: "junior", currentLevel: "none", conditions: "prioriza testing" };
    const r: any = await api.mentor_plan_coverage_review({ id, profile: "full stack", criteria });
    expect(r.source).toBe("ai");
    const messages = send.mock.calls[0]![1] as Array<{ content: string }>;
    const system = messages[0]!.content;
    expect(system).toContain("HOY (2026)");
    expect(system).toContain("hace unos años era mid-level");
    expect(system).toContain("se queda CORTO");
    expect(system).toContain("no tienes datos del mercado en vivo");
    expect(system).toContain("fecha de corte");
    expect(system).toContain("QUÉ FALTA");
    const user = messages[1]!.content;
    expect(user).toContain("prioriza testing");
    expect(user).toContain('"market"');
    expect(user).toContain("interviews");
    // salida validada
    const rev = r.review;
    expect(rev.criteria).toMatchObject({ presets: ["market", "interviews", "custom"], targetLevel: "junior", currentLevel: "none" });
    expect(rev.overall).toMatchObject({ verdict: "short", coveragePct: 70 });
    expect(rev.disclaimer).toMatch(/Estimación basada en el conocimiento/);
    const a = rev.areas[0];
    expect(a).toMatchObject({ verdict: "short", coveragePct: 60 });
    expect(a.missing.map((m: any) => [m.title, m.priority, m.level])).toEqual([["Testing de APIs", "high", "junior"], ["Docker básico", "medium", "mid"]]);
    expect(a.dispensable.map((d: any) => d.title)).toEqual(["Tema4"]);
    expect(rev.discarded).toBeGreaterThanOrEqual(2);
    expect(new PlanStore(dir).load(id)!.coverageReview?.overall?.verdict).toBe("short");
  });

  it("«Añadir faltante al plan» es una propuesta: marca el faltante y NO crea notas ni cambia los temas", async () => {
    Object.assign(hoisted.store, AI);
    const api = mentorApi(app, vi.fn().mockResolvedValue(REVIEW));
    await api.mentor_plan_coverage_review({ id });
    const filesBefore = fs.readdirSync(path.join(dir, "Programación", "4 Backend")).length;
    const r: any = await api.mentor_plan_coverage_accept({ id, areaKey: "backend", title: "Testing de APIs" });
    expect(r.review.areas[0].missing.find((m: any) => m.title === "Testing de APIs").accepted).toBe(true);
    expect(new PlanStore(dir).load(id)!.subplans[0]!.topics).toHaveLength(4);
    expect(fs.readdirSync(path.join(dir, "Programación", "4 Backend")).length).toBe(filesBefore);
    const off: any = await api.mentor_plan_coverage_accept({ id, areaKey: "backend", title: "Testing de APIs", accepted: false });
    expect(off.review.areas[0].missing.find((m: any) => m.title === "Testing de APIs").accepted).toBeUndefined();
    expect(() => api.mentor_plan_coverage_accept({ id, areaKey: "backend", title: "No existe" })).toThrow(/ya no está/);
  });

  it("«Pasar prescindibles a fuera de ruta» usa la ruta del plan: los temas se conservan, la nota no se toca y se puede deshacer", async () => {
    Object.assign(hoisted.store, AI);
    const api = mentorApi(app, vi.fn().mockResolvedValue(REVIEW));
    await api.mentor_plan_coverage_review({ id });
    const note = path.join(dir, F(4), "_tema.md");
    const noteBefore = fs.readFileSync(note, "utf-8");
    const r: any = await api.mentor_plan_route_set({ id, folders: [F(4)], route: "skipped", reason: "demasiado básico para un junior hoy" });
    expect(r.changed).toBe(1);
    const t4 = new PlanStore(dir).load(id)!.subplans[0]!.topics.find((t) => t.folder === F(4))!;
    expect(t4.route).toBe("skipped");
    expect(t4.skippedReason).toContain("básico");
    expect(fs.readFileSync(note, "utf-8")).toBe(noteBefore);
    expect(fs.existsSync(path.join(dir, F(4)))).toBe(true);
    // deshacer devuelve el tema a la ruta
    api.mentor_plan_change_undo({ id });
    expect(new PlanStore(dir).load(id)!.subplans[0]!.topics.find((t) => t.folder === F(4))!.route).toBeUndefined();
  });
});
