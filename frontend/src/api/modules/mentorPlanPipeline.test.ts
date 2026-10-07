// API: generación completa por partes (esqueleto + bloques de temas en paralelo; lo que falla cae a reglas SOLO en ese bloque; progreso; cancelar mata
// las llamadas) e inferencia de ramas en el servidor (API directa sin ramas + «full stack», metas Backend/Frontend, mención explícita de mobile, cambios).

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

import { addDays } from "../../lib/planTime.js";
import { AppState } from "../appState.js";
import { clearVaultScanCache, vaultScan } from "../vaultScan.js";
import { mentorApi } from "./mentor.js";

const MANIFEST = (title: string) => `---\ntype: topic\nsubject: programming\ntitle: "${title}"\nskills: [implement, debug]\nmastery:\n  min_per_skill: 6\n  target_difficulty: 3\n  exam: none\n---\n`;
let dir: string;
let app: AppState;

function topic(rel: string) {
  const abs = path.join(dir, ...rel.split("/"));
  fs.mkdirSync(abs, { recursive: true });
  const title = rel.split("/").pop()!;
  fs.writeFileSync(path.join(abs, "_tema.md"), MANIFEST(title), "utf-8");
  fs.writeFileSync(path.join(abs, `${title}.md`), "---\ntype: concept\n---\n# T\n", "utf-8");
}
const branch = (name: string, n: number) => Array.from({ length: n }, (_, i) => `Programación/${name}/${String(i + 1).padStart(2, "0")} Tema`).forEach(topic);
const two = (n: number) => String(n).padStart(2, "0");
const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
};
const pre = (over: Record<string, unknown> = {}) => ({
  start: todayIso(), end: addDays(todayIso(), 60), minutesPerDay: 240, studyDays: [1, 2, 3, 4, 5, 6, 7], pace: "intenso", goalIds: [], subjects: ["Programación"], levels: {}, deliverables: "no", ...over,
});
const withAi = () => Object.assign(hoisted.store, { provider: "deepseek", api_key: "sk-test", model: "m" });
const planOf = (a: ReturnType<typeof mentorApi>, id: string): any => (a.mentor_plan_get({ id }) as any).plan;
const folders = (p: any): string[] => p.subplans.flatMap((s: any) => s.topics.map((t: any) => t.folder));

beforeEach(() => {
  for (const k of Object.keys(hoisted.store)) delete hoisted.store[k];
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "nv_mentor_pipe_"));
  branch("1 Fundamentals", 4);
  branch("4 Backend", 5);
  branch("5 Frontend", 4);
  branch("6 Databases", 3);
  branch("8 Mobile", 3);
  branch("3 Desktop Apps", 3);
  clearVaultScanCache();
  app = new AppState(dir);
  vaultScan(app);
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe("ramas inferidas en el servidor (API directa, sin el campo de ramas)", () => {
  it("«full stack» en el objetivo libre: excluye Desktop y Mobile, y lo deja anotado en el plan", async () => {
    const a = mentorApi(app);
    const r: any = await a.mentor_plan_generate({ preconditions: pre({ freeObjective: "Full stack web: backend, frontend y bases de datos" }) });
    const plan = planOf(a, r.planId);
    expect(folders(plan).join()).not.toMatch(/Mobile|Desktop/);
    expect(plan.preconditions).toMatchObject({ branchPreset: "fullstack", branchExcluded: ["3 Desktop Apps", "8 Mobile"] });
    expect(plan.subplans.map((s: any) => s.area)).toEqual(["Backend", "Databases", "Frontend"]); // un subplan por ÁREA (Fundamentals es el grupo «Bases» de Backend)
    expect(plan.structure).toBe("areas");
  });

  it("mención explícita de mobile o desktop: se incluyen; sin mención no se acota nada", async () => {
    const a = mentorApi(app);
    const m: any = await a.mentor_plan_generate({ preconditions: pre({ freeObjective: "full stack con apps móviles" }) });
    expect(folders(planOf(a, m.planId)).join()).toMatch(/8 Mobile/);
    expect(folders(planOf(a, m.planId)).join()).not.toMatch(/Desktop/);
    const none: any = await a.mentor_plan_generate({ preconditions: pre({ end: addDays(todayIso(), 70) }) });
    expect(planOf(a, none.planId).preconditions.branches).toBeUndefined();
    expect(folders(planOf(a, none.planId)).length).toBe(22);
  });

  it("el estudiante puede reañadirlas: una elección explícita (preset «Todo») nunca se pisa aunque diga full stack", async () => {
    const a = mentorApi(app);
    const r: any = await a.mentor_plan_generate({ preconditions: pre({ freeObjective: "full stack", branchPreset: "all" }) });
    expect(folders(planOf(a, r.planId)).length).toBe(22);
  });

  it("metas Backend + Frontend sin mencionar full stack acotan las ramas por defecto", async () => {
    const g = app.mgrs().goals;
    const be = g.create_goal("Desarrollo Backend", { priority: 2 });
    g.create_item(be.id, "APIs", "", { topic_links: ["Programación/4 Backend/01 Tema", "Programación/4 Backend/02 Tema"] });
    const fe = g.create_goal("Desarrollo Frontend", { priority: 2 });
    g.create_item(fe.id, "UI", "", { topic_links: ["Programación/5 Frontend/01 Tema"] });
    clearVaultScanCache();
    app = new AppState(dir);
    vaultScan(app);
    const a = mentorApi(app);
    const r: any = await a.mentor_plan_generate({ preconditions: pre({ goalIds: [be.id, fe.id], subjects: ["Programación"] }) });
    const plan = planOf(a, r.planId);
    expect(plan.preconditions.branchPreset).toBe("fullstack");
    expect(plan.preconditions.branchExcluded).toEqual(["3 Desktop Apps", "8 Mobile"]);
    expect(folders(plan).join()).not.toMatch(/Mobile|Desktop/);
    // la meta «Desarrollo Backend» queda enlazada al área Backend (y la de Frontend al área Frontend) por nombre
    expect(plan.subplans.find((s: any) => s.areaId === "backend").requiredGoals.some((g: any) => g.goalId === be.id && !g.itemId)).toBe(true);
    expect(plan.subplans.find((s: any) => s.areaId === "frontend").requiredGoals.some((g: any) => g.goalId === fe.id && !g.itemId)).toBe(true);
  });

  it("también en el constructor guiado", async () => {
    const a = mentorApi(app);
    const r: any = await a.mentor_plan_build_start({ preconditions: pre({ freeObjective: "full stack" }) });
    expect(r.build.pre.branchPreset).toBe("fullstack");
    const fin: any = await a.mentor_plan_build_finish_now({ id: r.build.id });
    expect(JSON.stringify(fin.build.draft.subplans)).not.toMatch(/Mobile|Desktop/);
  });

  it("un cambio con «full stack» sobre un plan sin ramas aplica el preset y quita los temas de Desktop y Mobile; se puede deshacer", async () => {
    const a = mentorApi(app);
    const r: any = await a.mentor_plan_generate({ preconditions: pre() });
    expect(folders(planOf(a, r.planId)).join()).toMatch(/Mobile/);
    const c: any = await a.mentor_plan_change({ id: r.planId, comment: "Quiero que sea full stack" });
    expect(c.applied).toBe(true);
    const plan = planOf(a, r.planId);
    expect(folders(plan).join()).not.toMatch(/Mobile|Desktop/);
    expect(plan.preconditions).toMatchObject({ branchPreset: "fullstack", branchExcluded: ["3 Desktop Apps", "8 Mobile"] });
    expect(c.entry.delta.removed).toBe(6);
    a.mentor_plan_change_undo({ id: r.planId });
    expect(folders(planOf(a, r.planId)).join()).toMatch(/Mobile/);
  });
});

describe("generación completa por partes (API)", () => {
  const skeleton = (keys: string[]) => JSON.stringify({ type: "skeleton", rationale: "Primero lo básico.", subplans: keys.map((key) => ({ key, weight: 3 })) });
  const KEYS = ["backend|construir servicios y apis solidos y seguros", "frontend|crear interfaces web accesibles y mantenibles"];
  const order = (m: any[], reverse = true) => {
    const key = /SUBPLAN key=(.+?) \|/.exec(m[1].content)![1]!;
    const fs_ = [...m[1].content.matchAll(/folder=(\S[^|]*?) \|/g)].map((x) => x[1] as string);
    return JSON.stringify({ type: "topic_order", subplans: [{ key, reason: `Razón de ${key.split("|")[0]}.`, topics: reverse ? [...fs_].reverse() : fs_ }] });
  };
  const fullstack = { freeObjective: "full stack", branches: { Programación: ["1 Fundamentals", "4 Backend", "5 Frontend"] }, branchPreset: "fullstack" };

  it("una llamada de esqueleto y una por ÁREA, sin una sola llamada gigante; se conserva la razón de cada área", async () => {
    withAi();
    const calls: string[] = [];
    const send = vi.fn().mockImplementation(async (_c: unknown, m: any[]) => {
      calls.push(m[0].content.includes("ESQUELETO") ? "esqueleto" : "temas");
      return m[0].content.includes("ESQUELETO") ? skeleton(KEYS) : order(m);
    });
    const a = mentorApi(app, send as never);
    const r: any = await a.mentor_plan_generate({ preconditions: pre(fullstack) });
    expect(calls).toEqual(["esqueleto", "temas", "temas"]);
    expect(r.source).toBe("ai");
    const plan = planOf(a, r.planId);
    // la IA ordena DENTRO de cada grupo (al revés aquí) y la app mantiene el orden de los grupos: Bases (Fundamentals) → Conocimientos de backend
    expect(plan.subplans[0].groups.map((g: any) => g.id)).toEqual(["bases", "core"]);
    expect(plan.subplans[0].topics[0].folder).toBe("Programación/1 Fundamentals/04 Tema");
    expect(plan.subplans[0].topics.find((t: any) => t.group === "core").folder).toBe("Programación/4 Backend/05 Tema");
    expect(plan.subplans[0].notes).toContain("Razón de backend.");
    expect(plan.rationale).toContain("Primero lo básico.");
    expect(r.planDraft.warnings.filter((w: string) => w.includes("reglas"))).toEqual([]);
  });

  it("si un bloque falla solo esa área cae a reglas; el resto conserva la IA y el aviso es concreto y queda en el plan (sin notas internas)", async () => {
    withAi();
    const send = vi.fn().mockImplementation(async (_c: unknown, m: any[]) => {
      if (m[0].content.includes("ESQUELETO")) return skeleton(KEYS);
      if (m[1].content.includes("key=frontend")) throw new Error("HTTP 529");
      return order(m);
    });
    const a = mentorApi(app, send as never);
    const r: any = await a.mentor_plan_generate({ preconditions: pre(fullstack) });
    expect(r.source).toBe("ai"); // la IA aportó
    const plan = planOf(a, r.planId);
    const fe = plan.subplans.find((s: any) => s.areaId === "frontend");
    expect(fe.topics.map((t: any) => t.folder)).toEqual([1, 2, 3, 4].map((n) => `Programación/5 Frontend/0${n} Tema`)); // natural
    // el aviso es estructurado y con su motivo; ya no hay notas internas tipo «sin la selección de la IA»
    expect(fe.fallback).toEqual({ kind: "rules", reason: "la IA falló (HTTP 529)" });
    expect(fe.notes ?? "").not.toContain("selección de la IA");
    const be = plan.subplans.find((s: any) => s.areaId === "backend");
    expect(be.fallback).toBeUndefined();
    expect(be.topics[0].folder).toBe("Programación/1 Fundamentals/04 Tema");
    expect(r.planDraft.warnings).toContain("El área «Frontend» se completó con reglas porque la IA falló (HTTP 529).");
  });

  it("si todo falla se completa todo con reglas (la red de seguridad sigue funcionando)", async () => {
    withAi();
    const a = mentorApi(app, vi.fn().mockRejectedValue(new Error("sin red")) as never);
    const r: any = await a.mentor_plan_generate({ preconditions: pre(fullstack) });
    expect(r.source).toBe("auto");
    expect(planOf(a, r.planId).subplans).toHaveLength(2);
    expect(planOf(a, r.planId).auto).toBe(true);
  });

  it("el progreso real se ve en el estado: «Esqueleto ✓ · … · n/m áreas»", async () => {
    withAi();
    let release: (v: string) => void = () => undefined;
    const send = vi.fn().mockImplementation((_c: unknown, m: any[]) => {
      if (m[0].content.includes("ESQUELETO")) return Promise.resolve(skeleton(KEYS));
      if (m[1].content.includes("key=frontend")) return new Promise<string>((ok) => (release = ok));
      return Promise.resolve(order(m));
    });
    const a = mentorApi(app, send as never);
    const p: Promise<any> = a.mentor_plan_generate({ preconditions: pre(fullstack) });
    await vi.waitFor(() => expect((a.mentor_ai_status({ key: "generate" }) as any).label).toMatch(/Esqueleto ✓ · .*Frontend … .*1\/2 áreas/));
    const st = a.mentor_ai_status({ key: "generate" }) as any;
    expect(st.label).toContain("Backend ✓");
    release(order([{}, { content: `SUBPLAN key=${KEYS[1]} | x\n  - folder=Programación/5 Frontend/01 Tema | ~40m` }] as any, false));
    const r = await p;
    expect(r.kind).toBe("plan_created");
  });

  it("cancelar MATA las llamadas en vuelo (señal abortada) y no se crea nada; «auto» sigue con reglas", async () => {
    withAi();
    const signals: AbortSignal[] = [];
    const send = vi.fn().mockImplementation((_c: unknown, m: any[], o: { signal?: AbortSignal }) => {
      if (m[0].content.includes("ESQUELETO")) return Promise.resolve(skeleton(KEYS));
      signals.push(o.signal!);
      return new Promise<string>((_ok, no) => o.signal!.addEventListener("abort", () => no(new Error("Cancelado."))));
    });
    const a = mentorApi(app, send as never);
    const p: Promise<any> = a.mentor_plan_generate({ preconditions: pre(fullstack) });
    const done = p.then(() => "ok", (e) => String(e.message));
    await vi.waitFor(() => expect(signals.length).toBe(2)); // las dos tareas arrancan en paralelo
    a.mentor_ai_cancel({ key: "generate", mode: "abort" });
    expect(await done).toMatch(/cancelada/i);
    expect(signals.every((s) => s.aborted)).toBe(true);
    expect(fs.existsSync(path.join(dir, ".notevault", "mentor", "plans")) ? fs.readdirSync(path.join(dir, ".notevault", "mentor", "plans")).filter((f) => f.endsWith(".json")) : []).toEqual([]);

    signals.length = 0;
    const p2: Promise<any> = a.mentor_plan_generate({ preconditions: pre({ ...fullstack, end: addDays(todayIso(), 70) }) });
    await vi.waitFor(() => expect(signals.length).toBe(2));
    a.mentor_ai_cancel({ key: "generate", mode: "auto" });
    const r = await p2;
    expect(signals.every((s) => s.aborted)).toBe(true);
    expect(r).toMatchObject({ kind: "plan_created", source: "auto" });
    expect(r.planDraft.warnings.join()).toContain("pediste seguir sin IA");
  });

  it("una llamada colgada vence en el tiempo por llamada y solo esa área va por reglas", async () => {
    withAi();
    const send = vi.fn().mockImplementation((_c: unknown, m: any[]) => {
      if (m[0].content.includes("ESQUELETO")) return Promise.resolve(skeleton(KEYS));
      if (m[1].content.includes("key=backend")) return new Promise<string>(() => undefined);
      return Promise.resolve(order(m));
    });
    const a = mentorApi(app, send as never);
    const r: any = await a.mentor_plan_generate({ preconditions: pre(fullstack), callTimeoutMs: 80 });
    expect(r.planDraft.warnings).toContain("El área «Backend» se completó con reglas porque la IA tardó demasiado.");
    expect(planOf(a, r.planId).subplans.find((s: any) => s.areaId === "backend").topics[0].folder).toBe("Programación/1 Fundamentals/01 Tema"); // orden natural
    expect(planOf(a, r.planId).subplans.find((s: any) => s.areaId === "frontend").topics[0].folder).toBe("Programación/5 Frontend/04 Tema"); // la IA
  });
});
