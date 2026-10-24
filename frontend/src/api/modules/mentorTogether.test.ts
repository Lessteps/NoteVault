// «Poner todas las áreas desde el día 1»: la operación determinista `set_area_mode` por la API de cambios (con historial y «Deshacer»), sobre un
// plan con la forma del real (por fases, estructura de áreas, entregables «a discutir» pendientes), y la compatibilidad de lectura: un plan
// guardado sin modo NO cambia de modo al recalcularse por otro motivo.

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

import { PlanStore, type Plan } from "../../core/mentor/plan.js";
import { addDays } from "../../lib/planTime.js";
import { areaWeeksOf, deliverablesDefined, previewTogether } from "../../lib/planTopicsByArea.js";
import { buildSchedule, effectiveAreaMode } from "../../lib/planSchedule.js";
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
function topic(rel: string, title: string) {
  const abs = path.join(dir, ...rel.split("/"));
  fs.mkdirSync(abs, { recursive: true });
  fs.writeFileSync(path.join(abs, "_tema.md"), MANIFEST(title), "utf-8");
  fs.writeFileSync(path.join(abs, `${title}.md`), "---\ntype: concept\n---\n# T\n", "utf-8");
}
const NAMES = ["Alfa", "Beta", "Gamma", "Delta", "Epsilon", "Zeta", "Eta", "Theta", "Iota", "Kappa", "Lambda", "Mu", "Nu", "Xi", "Omicron", "Pi"];
const branch = (name: string, n: number) => NAMES.slice(0, n).forEach((nm, i) => topic(`Programación/${name}/${two(i + 1)} ${nm}`, `${nm} ${name.replace(/^[\d.\s]+/, "").slice(0, 3)}`));
const START = todayIso();
const END = addDays(START, 125); // ~18 semanas
const pre = (over: Record<string, unknown> = {}) => ({ start: START, end: END, minutesPerDay: 240, studyDays: [1, 2, 3, 4, 5, 6, 7], pace: "intenso", goalIds: [], subjects: ["Programación"], levels: { Programación: "basico" }, deliverables: "ask", ...over });
const strip = (p: Plan): unknown => JSON.parse(JSON.stringify({ ...p, updatedAt: "" }));

beforeEach(() => {
  for (const k of Object.keys(hoisted.store)) delete hoisted.store[k];
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "nv_mentor_together_"));
  branch("1 Fundamentals", 8);
  branch("2.1 Python", 4);
  branch("4 Backend", 16);
  branch("5 Frontend", 12);
  branch("6 Databases", 8);
  branch("7 Automation", 5);
  branch("9 Tooling and Quality", 6);
  clearVaultScanCache();
  app = new AppState(dir);
  vaultScan(app);
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

async function createPhased(over: Record<string, unknown> = {}) {
  const a = mentorApi(app, vi.fn());
  const r: any = await a.mentor_plan_generate({ preconditions: pre({ areaMode: "phased", ...over }), noAi: true });
  const id = r.planId as string;
  return { a, id, plan: () => new PlanStore(dir).load(id)! };
}
const OP = { id: "", ops: [{ op: "set_area_mode", mode: "together" }], label: "Poner todas las áreas desde el día 1 (Automation al final)" };

describe("Poner todas las áreas desde el día 1 (set_area_mode por la API de cambios)", () => {
  it("un plan por fases pasa a todas desde la semana 1 (Tooling incluida) y Automation al final; el historial lo recuerda", async () => {
    const { a, id, plan } = await createPhased();
    const before = plan();
    const weeksBefore = areaWeeksOf(before);
    // por fases: no todas empiezan en la semana 1
    expect(weeksBefore.some((r) => r.fromWeek > 1)).toBe(true);
    expect(effectiveAreaMode(before)).toBe("phased");
    const preview = previewTogether(before);

    const res: any = await a.mentor_plan_change({ ...OP, id });
    expect(res.applied).toBe(true);
    const after = plan();
    expect(after.areaMode).toBe("together");
    expect(after.preconditions!.areaMode).toBe("together");
    const weeks = Math.ceil((Date.parse(END) - Date.parse(START) + 86400000) / 86400000 / 7);
    for (const s of after.subplans.filter((s) => s.areaId !== "automation")) expect(s.phase!.fromWeek, s.areaId).toBe(1);
    expect(after.subplans.some((s) => s.areaId === "tooling")).toBe(true);
    const auto = after.subplans.find((s) => s.areaId === "automation")!;
    expect(auto.phase!.fromWeek).toBeGreaterThan(1);
    expect(auto.phase!.toWeek).toBe(weeks);
    expect((weeks - auto.phase!.fromWeek + 1) / weeks).toBeGreaterThanOrEqual(0.12);
    // la vista previa de la confirmación coincide con lo que de verdad pasó (mismas semanas de inicio por área)
    for (const r of preview) expect(after.subplans.find((s) => s.areaId === r.areaId)!.phase!.fromWeek, r.areaId).toBe(r.fromWeek);
    // la agenda trabaja las áreas juntas desde el primer día de estudio
    const day = buildSchedule(after).days.find((d) => d.study)!;
    expect(day.focus!.together).toBe(true);
    expect((day.blocks ?? []).some((b) => b.areaId === "tooling" && b.status !== "omitted")).toBe(true);
    // todos los temas siguen en el plan
    expect(after.subplans.flatMap((s) => s.topics).length).toBe(before.subplans.flatMap((s) => s.topics).length);
    // historial con la etiqueta y la instantánea previa
    const hist: any[] = (await a.mentor_plan_changes({ id })) as never;
    expect(hist.at(-1).comment).toContain("Poner todas las áreas desde el día 1");
    expect(hist.at(-1).status).toBe("applied");
    // lo pendiente de entregables se conserva (no se borra nada)
    expect(after.openQuestions).toEqual(before.openQuestions);
    // un plan por áreas siempre tiene su cadena de entregables (diario → semanal → mensual) definida desde el propio plan
    expect(deliverablesDefined(after)).toBe(true);
  });

  it("no cambia el original hasta aplicarla; aplicarla de nuevo no hace nada y «Deshacer» deja el plan como estaba", async () => {
    const { a, id, plan } = await createPhased();
    const original = strip(plan());
    // consultar la vista previa no escribe nada
    previewTogether(plan());
    expect(strip(plan())).toEqual(original);
    const one: any = await a.mentor_plan_change({ ...OP, id });
    expect(one.applied).toBe(true);
    expect(strip(plan())).not.toEqual(original);
    const again: any = await a.mentor_plan_change({ ...OP, id });
    expect(again.applied).toBe(false);
    a.mentor_plan_change_undo({ id });
    const restored = plan();
    expect(restored.areaMode).toBe("phased");
    expect(strip(restored)).toEqual(original);
    // y el historial marca el cambio como deshecho
    const hist: any[] = (await a.mentor_plan_changes({ id })) as never;
    expect(hist.find((h) => h.comment.includes("Poner todas las áreas"))!.status).toBe("undone");
  });

  it("un plan guardado SIN modo (como el real) se lee por fases y NO cambia a «juntas» cuando se recalcula por otro motivo", async () => {
    const { a, id, plan } = await createPhased();
    const file = path.join(dir, ".notevault", "mentor", "plans", `${id}.json`);
    const raw = JSON.parse(fs.readFileSync(file, "utf-8"));
    delete raw.areaMode;
    delete raw.areaModeWhy;
    delete raw.areaModeBy;
    delete raw.preconditions.areaMode;
    fs.writeFileSync(file, JSON.stringify(raw, null, 2));
    expect(plan().areaMode).toBeUndefined();
    expect(effectiveAreaMode(plan())).toBe("phased");
    const phasesBefore = plan().subplans.map((s) => `${s.areaId}:${s.phase!.fromWeek}-${s.phase!.toWeek}`);
    const r: any = await a.mentor_plan_change({ id, ops: [{ op: "raise_minutes", minutes: 300 }], label: "Más tiempo" });
    expect(r.applied).toBe(true);
    expect(plan().areaMode).toBe("phased");
    expect(effectiveAreaMode(plan())).toBe("phased");
    // las fases siguen siendo por fases: Automation y Tooling no pasaron a la semana 1
    expect(plan().subplans.find((s) => s.areaId === "automation")!.phase!.fromWeek).toBeGreaterThan(1);
    expect(phasesBefore.length).toBe(plan().subplans.length);
    // y la acción sigue disponible sobre él
    const t: any = await a.mentor_plan_change({ ...OP, id });
    expect(t.applied).toBe(true);
    expect(plan().areaMode).toBe("together");
  });

  it("los planes NUEVOS con 2 o más áreas y sin elección estudian todas las áreas desde el día 1 (Automation al final)", async () => {
    const a = mentorApi(app, vi.fn());
    const r: any = await a.mentor_plan_generate({ preconditions: pre({ deliverables: "no" }), noAi: true });
    const p = new PlanStore(dir).load(r.planId)!;
    expect(p.areaMode).toBe("together");
    expect(p.areaModeBy).toBe("rules");
    expect(p.areaModeWhy).toContain("desde el día 1");
    expect(p.subplans.filter((s) => s.areaId !== "automation").every((s) => s.phase!.fromWeek === 1)).toBe(true);
    expect(p.subplans.find((s) => s.areaId === "automation")!.phase!.fromWeek).toBeGreaterThan(1);
    // sin pregunta de entregables: la cadena diario → semanal → mensual sale del plan
    expect(p.openQuestions).toBeUndefined();
    expect(deliverablesDefined(p)).toBe(true);
    expect(p.preconditions!.deliverables).toBe("no");
  });
});

describe("Frontend desde el principio de la ruta", () => {
  it("tras la acción, Frontend arranca en la semana 1 y el día 1 de la agenda tiene su teoría y su práctica", async () => {
    const { a, id, plan } = await createPhased();
    const fe0 = plan().subplans.find((s) => s.areaId === "frontend")!.phase!;
    expect(fe0.fromWeek).toBeGreaterThan(1); // por fases, Frontend empieza tarde
    await a.mentor_plan_change({ ...OP, id });
    const p = plan();
    expect(p.subplans.find((s) => s.areaId === "frontend")!.phase!.fromWeek).toBe(1);
    const first = buildSchedule(p).days.find((d) => d.study)!;
    const fe = (first.blocks ?? []).filter((b) => b.areaId === "frontend" && b.status === "topic");
    expect(fe.map((b) => b.kind).sort()).toEqual(["practice", "theory"].concat(fe.length > 2 ? ["practice"] : []).sort());
    expect(first.focus!.areaIds).toEqual(expect.arrayContaining(["backend", "frontend", "databases", "tooling"]));
  });
});
