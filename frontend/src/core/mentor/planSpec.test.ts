import { describe, expect, it } from "vitest";
import type { CatalogTopic } from "./goalDraft.js";
import {
  autoSeeds,
  composeFromPreconditions,
  markDiagnostics,
  parsePreconditionReply,
  planCatalog,
  preconditionsPrompt,
  resolveScope,
  seedsFromReply,
  topicsByText,
  type GoalScope,
  type PlanPreconditions,
} from "./planSpec.js";

const cat = (folder: string, over: Partial<CatalogTopic> = {}): CatalogTopic => ({
  folder,
  title: folder.split("/").pop()!,
  subject: "x",
  skills: ["a", "b"],
  completenessPct: 0,
  estMinutes: 60,
  ...over,
});

const ALL = [cat("Prog/10 Final"), cat("Prog/2 Medio"), cat("Prog/1 Base"), cat("Prog/0 Hecho", { completenessPct: 100 }), cat("Mat/1 Álgebra"), cat("Ing/1 Reading")];
const GOALS: GoalScope[] = [
  { id: "g1", name: "Backend", area: "", end: null, items: [{ id: "i1", name: "x", links: [{ folder: "Prog/2 Medio", skills: ["a"] }, { folder: "Prog/Inventado", skills: [] }, { folder: "Prog/0 Hecho", skills: [] }] }] },
  { id: "g2", name: "Sin temas", area: "", end: null, items: [] },
];
const pre = (over: Partial<PlanPreconditions> = {}): PlanPreconditions => ({
  start: "2026-10-05", end: "2026-11-01", minutesPerDay: 120, studyDays: [1, 2, 3, 4, 5, 6], pace: "normal", goalIds: ["g1"], subjects: ["Prog"], levels: {}, deliverables: false, ...over,
});

describe("alcance", () => {
  it("las metas mandan sobre las materias, sin temas completos ni inventados, en orden natural", () => {
    const s = resolveScope(pre(), ALL, GOALS);
    expect(s.goalGroups[0]!.topics.map((x) => x.topic.folder)).toEqual(["Prog/2 Medio"]);
    expect(s.goalGroups[0]!.topics[0]!.skills).toEqual(["a"]);
    expect(s.areaGroups[0]!.topics.map((t) => t.folder)).toEqual(["Prog/1 Base", "Prog/10 Final"]); // "2 Medio" ya está en la meta
    expect(planCatalog(s).map((t) => t.folder)).toEqual(["Prog/2 Medio", "Prog/1 Base", "Prog/10 Final"]);
  });

  it("una meta sin temas pendientes se anota aparte", () => {
    expect(resolveScope(pre({ goalIds: ["g2"], subjects: [] }), ALL, GOALS).goalsWithoutTopics.map((g) => g.id)).toEqual(["g2"]);
  });

  it("texto libre: solo temas reales por palabras", () => {
    expect(topicsByText(ALL, "álgebra").map((t) => t.folder)).toEqual(["Mat/1 Álgebra"]);
    expect(topicsByText(ALL, "zzz")).toEqual([]);
  });
});

describe("plan automático", () => {
  it("semillas: una meta y una materia, sin repetir, con diagnóstico para «no sé»", () => {
    const p = pre({ deliverables: true, levels: { Prog: "no_se" } });
    const seeds = autoSeeds(p, resolveScope(p, ALL, GOALS));
    expect(seeds.map((s) => s.objective)).toEqual(["Backend", "Avanzar en Prog"]);
    expect(seeds[0]!.deliverable).toBeTruthy();
    const diag = seeds.flatMap((s) => s.topics.filter((t) => t.diagnostic).map((t) => t.folder));
    expect(diag).toEqual(["Prog/2 Medio"]); // solo el primero de la materia
    expect(seeds[0]!.notes).toContain("diagnóstico");
    expect(markDiagnostics([{ area: "Mat", objective: "o", topics: [{ folder: "Mat/1", title: "1", estMinutes: 30 }] }], pre({ levels: {} }))[0]!.topics[0]!.diagnostic).toBeUndefined();
  });

  it("el borrador usa la capacidad real y marca el plan como automático", () => {
    const p = pre();
    const d = composeFromPreconditions(autoSeeds(p, resolveScope(p, ALL, GOALS)), p, { today: "2026-10-05", auto: true, rationale: "r" });
    expect(d).toMatchObject({ id: "2026-10-05_2026-11-01", start: "2026-10-05", end: "2026-11-01", auto: true, fits: true });
    expect(d.coverage).toContain("sobran");
    expect(d.subplans[0]!.weeks).toHaveLength(4);
    // empezar en el pasado reparte desde hoy
    const late = composeFromPreconditions(autoSeeds(p, resolveScope(p, ALL, GOALS)), p, { today: "2026-10-20", auto: true, rationale: "r" });
    expect(late.from).toBe("2026-10-20");
    expect(late.subplans[0]!.weeks[0]!.capacityMinutes).toBe(0);
  });
});

describe("respuesta de la IA", () => {
  const ctx = { month: "2026-10", today: "2026-10-05", goals: [{ id: "g1", name: "Backend", items: [] }], projects: [] };
  const reply = JSON.stringify({ type: "plan_draft", hoursPerWeek: 50, rationale: "r", subplans: [{ area: "Prog", objective: "o", topics: [{ folder: "Prog/1 Base" }, { folder: "Prog/Falso" }], deliverable: { title: "P", description: "d", criteria: ["c"] } }] });

  it("descarta lo inventado, respeta el catálogo y las precondiciones", () => {
    const catalog = planCatalog(resolveScope(pre(), ALL, GOALS));
    const parsed = parsePreconditionReply(reply, catalog, ctx);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.reply.discarded).toContain("Prog/Falso");
    const noDeliv = seedsFromReply(parsed.reply, catalog, pre({ deliverables: false }), new Map());
    expect(noDeliv.seeds[0]!.topics.map((t) => t.folder)).toEqual(["Prog/1 Base"]);
    expect(noDeliv.seeds[0]!.deliverable).toBeUndefined();
    expect(seedsFromReply(parsed.reply, catalog, pre({ deliverables: true }), new Map()).seeds[0]!.deliverable).toBeTruthy();
    // un tema fuera del catálogo (aunque exista en la vault) no se acepta
    const out = seedsFromReply({ ...parsed.reply, subplans: [{ ...parsed.reply.subplans[0]!, topics: [{ folder: "Mat/1 Álgebra", skills: [], why: "" }] }] }, catalog, pre(), new Map());
    expect(out.seeds[0]?.topics ?? []).toEqual([]);
  });

  it("una pregunta o basura no es un plan", () => {
    expect(parsePreconditionReply(JSON.stringify({ type: "question", text: "¿?" }), ALL, ctx).ok).toBe(false);
    expect(parsePreconditionReply("hola", ALL, ctx).ok).toBe(false);
  });

  it("el prompt marca las precondiciones como hechos fijos con la capacidad calculada", () => {
    const p = pre({ levels: { Prog: "avanzado" }, deliverables: true });
    const text = preconditionsPrompt(p, resolveScope(p, ALL, GOALS), "2026-10-05");
    expect(text).toContain("HECHOS FIJOS");
    expect(text).toContain("Capacidad real");
    expect(text).toContain("Prog = avanzado");
    expect(text).toContain("Entregables: SÍ");
  });
});
