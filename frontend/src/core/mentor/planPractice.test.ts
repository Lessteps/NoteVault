// Plan del Mentor: entregables «a discutir» (tres estados + openQuestions) y la pista Programming practice
// (reparto de minutos, modelo en disco, borrador, candidatos de Hoy, objetivo y estado derivado del módulo pp).

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { BriefSection, StudentBrief } from "./brief.js";
import { buildCandidates } from "./candidates.js";
import type { CatalogTopic } from "./goalDraft.js";
import { applyObjective, objectiveText, sanitizeObjective } from "./objective.js";
import { buildPlan, deliverableQuestion, mergePlans, PlanStore, sanitizeOpenQuestions, sanitizePlan } from "./plan.js";
import { composePlanDraft, parseChatResponse, planDraftSummary } from "./planDraft.js";
import { autoSeeds, composeFromPreconditions, defaultDeliverable, parsePreconditionReply, planCatalog, preconditionsPrompt, resolveScope, seedsFromReply, type GoalScope, type PlanPreconditions } from "./planSpec.js";
import { derivePracticeStatus, kataDates, manualPracticeOf, phasesDone, phasesOfProject, readPpProjects } from "./practiceState.js";
import { buildPracticeTrack, kataBlockId, practiceItemsFor, projectBlockId } from "../../lib/practiceTrack.js";
import type { SessionRecord } from "./sessionLog.js";

const cat = (folder: string, over: Partial<CatalogTopic> = {}): CatalogTopic => ({ folder, title: folder.split("/").pop()!, subject: "x", skills: ["a", "b"], completenessPct: 0, estMinutes: 60, ...over });
const ALL = [cat("Prog/1 Base"), cat("Prog/2 Medio"), cat("Mat/1 Álgebra")];
const GOALS: GoalScope[] = [{ id: "g1", name: "Backend", area: "", end: null, items: [{ id: "i1", name: "x", links: [{ folder: "Prog/2 Medio", skills: ["a"] }] }] }];
const pre = (over: Partial<PlanPreconditions> = {}): PlanPreconditions => ({
  start: "2026-10-05", end: "2026-11-01", minutesPerDay: 240, studyDays: [1, 2, 3, 4, 5, 6], pace: "normal", goalIds: ["g1"], subjects: ["Prog"], levels: {}, deliverables: "ask", ...over,
});
const PRACTICE = { kataMinutes: 30, sessionsPerWeek: 3, minutesPerSession: 90, monthly: false, focus: "rotate" } as const;

describe("entregables: ask / yes / no", () => {
  const scope = () => resolveScope(pre(), ALL, GOALS);

  it("plan automático: solo «yes» genera la propuesta de entregable", () => {
    for (const mode of ["ask", "no"] as const) {
      const seeds = autoSeeds(pre({ deliverables: mode }), scope());
      expect(seeds.every((s) => !s.deliverable)).toBe(true);
    }
    expect(autoSeeds(pre({ deliverables: "yes" }), scope()).every((s) => !!s.deliverable)).toBe(true);
  });

  it("con «ask» el borrador no trae entregables pero deja UNA sola pregunta global pendiente", () => {
    const p = pre();
    const d = composeFromPreconditions(autoSeeds(p, scope()), p, { today: "2026-10-05", auto: true, rationale: "r" });
    expect(d.subplans.every((s) => !s.deliverable)).toBe(true);
    // una sola pregunta para todo el plan (no una por subplan), sin subplanId
    expect(d.openQuestions).toHaveLength(1);
    expect(d.openQuestions![0]).toEqual({
      id: "deliverables",
      text: "¿Quieres un entregable (proyecto de demostración) por cada área del plan?",
      options: ["Sí", "No", "Después"],
    });
    // «no» y «yes»: nada pendiente
    for (const mode of ["no", "yes"] as const) {
      const q = pre({ deliverables: mode });
      expect(composeFromPreconditions(autoSeeds(q, scope()), q, { today: "2026-10-05", auto: true, rationale: "r" }).openQuestions).toBeUndefined();
    }
  });

  it("IA: «ask» y «no» ignoran el entregable que la IA proponga; «yes» lo respeta", () => {
    const reply = JSON.stringify({ type: "plan_draft", hoursPerWeek: 10, rationale: "r", subplans: [{ area: "Prog", objective: "o", topics: [{ folder: "Prog/1 Base" }], deliverable: { title: "P", description: "d", criteria: ["c"] } }] });
    const catalog = planCatalog(scope());
    const parsed = parsePreconditionReply(reply, catalog, { month: "2026-10", today: "2026-10-05", goals: [], projects: [] });
    if (!parsed.ok) throw new Error(parsed.reason);
    const deliverable = (m: "ask" | "yes" | "no") => seedsFromReply(parsed.reply, catalog, pre({ deliverables: m }), new Map()).seeds[0]!.deliverable;
    expect(deliverable("ask")).toBeUndefined();
    expect(deliverable("no")).toBeUndefined();
    expect(deliverable("yes")).toBeTruthy();
  });

  it("el prompt dice cada estado: a discutir, sí, no", () => {
    const text = (m: "ask" | "yes" | "no") => preconditionsPrompt(pre({ deliverables: m }), scope(), "2026-10-05");
    expect(text("ask")).toContain("Entregables: A DISCUTIR");
    expect(text("ask")).toContain("No incluyas `deliverable` todavía");
    expect(text("yes")).toContain("Entregables: SÍ");
    expect(text("no")).toContain("Entregables: NO");
  });

  it("la pregunta se valida: solo de subplanes que existen y sin entregable; la propuesta determinista la cierra", () => {
    const built = buildPlan([{ area: "A", objective: "o", topics: [{ folder: "A/1", title: "1", estMinutes: 30 }] }], { start: "2026-10-05", end: "2026-10-18", hoursPerWeek: 5 });
    const sub = built.plan.subplans[0]!;
    const q = deliverableQuestion(sub);
    expect(sanitizeOpenQuestions([q, { ...q, subplanId: "zzz" }, { ...q }], built.plan.subplans)).toHaveLength(1);
    const withD = { ...sub, deliverable: { ...defaultDeliverable("o"), description: "", criteria: [], status: "idea" as const } };
    expect(sanitizeOpenQuestions([q], [withD])).toEqual([]);
    expect(sanitizeOpenQuestions("nada", [sub])).toEqual([]);
  });

  it("se guarda en el plan, se lee de disco y las preguntas sin subplan se descartan; planes antiguos se leen igual", () => {
    const built = buildPlan([{ area: "A", objective: "o", topics: [{ folder: "A/1", title: "1", estMinutes: 30 }] }], { start: "2026-10-05", end: "2026-10-18", hoursPerWeek: 5 });
    const plan = { ...built.plan, openQuestions: [deliverableQuestion(built.plan.subplans[0]!), { id: "deliverables", subplanId: "nope", text: "x", options: [] }] };
    const clean = sanitizePlan(JSON.parse(JSON.stringify(plan)))!;
    expect(clean.openQuestions).toHaveLength(1);
    // un plan guardado antes de esta tanda (preconditions.deliverables booleano, sin práctica ni preguntas)
    const old = sanitizePlan({ ...JSON.parse(JSON.stringify(built.plan)), preconditions: { start: "2026-10-05", end: "2026-10-18", minutesPerDay: 120, studyDays: [1], pace: "normal", goalIds: [], subjects: ["A"], levels: {}, deliverables: true } })!;
    expect(old.preconditions!.deliverables).toBe("yes");
    expect(old.programmingPractice).toBeUndefined();
    expect(old.openQuestions).toBeUndefined();
  });

  it("el resumen para la IA anota que quedan entregables por decidir", () => {
    const p = pre();
    const d = composeFromPreconditions(autoSeeds(p, scope()), p, { today: "2026-10-05", auto: true, rationale: "r" });
    const sum = JSON.parse(planDraftSummary(d));
    expect(sum.deliverables).toBe("ask");
    expect(sum.openQuestionsPending).toHaveLength(d.subplans.length);
  });
});

describe("Programming practice en el borrador", () => {
  const scope = () => resolveScope(pre(), ALL, GOALS);

  it("reserva los minutos y el reparto de temas usa solo el resto; el borrador lleva la pista", () => {
    const base = pre();
    const sin = composeFromPreconditions(autoSeeds(base, scope()), base, { today: "2026-10-05", auto: true, rationale: "r" });
    const p = pre({ practice: PRACTICE });
    const con = composeFromPreconditions(autoSeeds(p, scope()), p, { today: "2026-10-05", auto: true, rationale: "r" });
    expect(con.programmingPractice!.kata!.minutesPerDay).toBe(30);
    expect(con.programmingPractice!.weeklyProject!.weeks).toHaveLength(4);
    expect(con.availableMinutes).toBeLessThan(sin.availableMinutes);
    expect(con.hoursPerWeek).toBeLessThan(sin.hoursPerWeek);
    expect(con.coverage).toContain("Programming practice");
    expect(con.coverage).toContain("reservadas");
    expect(sin.programmingPractice).toBeUndefined();
    expect(sin.coverage).not.toContain("Programming practice");
    // la capacidad semanal de cada subplan ya no incluye lo reservado (6 días × (204 − 30) − 3 sesiones × 90)
    const cap1 = con.subplans.reduce((n, s) => n + s.weeks[0]!.capacityMinutes, 0);
    const cap1Sin = sin.subplans.reduce((n, s) => n + s.weeks[0]!.capacityMinutes, 0);
    expect(cap1Sin - cap1).toBeGreaterThanOrEqual(6 * 30 + 3 * 90 - 2); // redondeos por subplan
  });

  it("el plan automático rota los focos y usa títulos genéricos; la IA sugiere temas validados", () => {
    const p = pre({ practice: PRACTICE });
    const auto = composeFromPreconditions(autoSeeds(p, scope()), p, { today: "2026-10-05", auto: true, rationale: "r" });
    expect(auto.programmingPractice!.weeklyProject!.weeks.map((w) => w.focus)).toEqual(["backend", "databases", "frontend", "desktop"]);
    expect(auto.programmingPractice!.weeklyProject!.weeks.every((w) => !w.theme)).toBe(true);
    const ai = composeFromPreconditions(autoSeeds(p, scope()), p, {
      today: "2026-10-05", auto: false, rationale: "r", startFocus: "frontend",
      practiceSuggestions: { weeks: [{ week: 2, theme: "Agenda de turnos", focus: "mobile" }] },
    });
    const w = ai.programmingPractice!.weeklyProject!.weeks;
    expect(w[0]!.focus).toBe("frontend");
    expect(w[1]).toMatchObject({ theme: "Agenda de turnos", focus: "mobile" });
  });

  it("la respuesta de la IA solo aporta temas y focos del esquema fijo", () => {
    const reply = JSON.stringify({
      type: "plan_draft", hoursPerWeek: 5, rationale: "r", subplans: [{ area: "Prog", objective: "o", topics: [{ folder: "Prog/1 Base" }] }],
      programmingPractice: { weeks: [{ week: 1, theme: "Gestor de gastos", focus: "databases", minutes: 999, phases: ["x"] }, { week: 1, theme: "dup" }, { week: "x" }, { week: 2, focus: "inventado" }], monthlyTheme: "Portafolio" },
    });
    const parsed = parsePreconditionReply(reply, planCatalog(resolveScope(pre(), ALL, GOALS)), { month: "2026-10", today: "2026-10-05", goals: [], projects: [] });
    if (!parsed.ok) throw new Error(parsed.reason);
    expect(parsed.reply.practice).toEqual({ weeks: [{ week: 1, theme: "Gestor de gastos", focus: "databases" }, { week: 2 }], monthlyTheme: "Portafolio" });
    // en el chat del plan mensual (sin precondiciones) la respuesta también se interpreta sin romperse
    expect(parseChatResponse(reply, planCatalog(resolveScope(pre(), ALL, GOALS)), { month: "2026-10", today: "2026-10-05", goals: [], projects: [] }).ok).toBe(true);
    expect(composePlanDraft).toBeTypeOf("function");
  });

  it("el prompt incluye la práctica como hecho fijo con la capacidad para temas", () => {
    const p = pre({ practice: PRACTICE });
    const text = preconditionsPrompt(p, scope(), "2026-10-05");
    expect(text).toContain("Programming practice: SÍ (HECHO FIJO)");
    expect(text).toContain("full stack");
    expect(text).toContain("RESERVADAS");
    expect(text).toContain("Foco de cada semana: rota por");
    expect(preconditionsPrompt(pre(), scope(), "2026-10-05")).not.toContain("Programming practice");
  });
});

describe("modelo en disco", () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "nv-pp-"));
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  const planWith = () => {
    const p = pre({ practice: PRACTICE });
    const draft = composeFromPreconditions(autoSeeds(p, resolveScope(p, ALL, GOALS)), p, { today: "2026-10-05", auto: true, rationale: "r" });
    return buildPlan(draft.subplans.map((s) => ({ id: s.id, area: s.area, objective: s.objective, topics: s.topics })), {
      id: draft.id, start: p.start, end: p.end, minutesPerDay: 240, studyDays: p.studyDays, pace: "normal", preconditions: p, programmingPractice: draft.programmingPractice, openQuestions: draft.openQuestions,
    }).plan;
  };

  it("PlanStore guarda y lee la pista y las preguntas; un plan sin práctica no tiene el campo", () => {
    const st = new PlanStore(dir);
    const saved = st.save(planWith());
    expect(saved.programmingPractice!.weeklyProject!.weeks).toHaveLength(4);
    const back = st.load(saved.id)!;
    expect(back.programmingPractice).toEqual(saved.programmingPractice);
    expect(JSON.parse(fs.readFileSync(path.join(dir, ".notevault/mentor/plans", `${saved.id}.json`), "utf-8")).programmingPractice.kata.minutesPerDay).toBe(30);
    const plain = st.save({ ...saved, id: "x1", programmingPractice: undefined, openQuestions: undefined });
    expect(plain.programmingPractice).toBeUndefined();
    expect(JSON.parse(fs.readFileSync(path.join(dir, ".notevault/mentor/plans", "x1.json"), "utf-8"))).not.toHaveProperty("programmingPractice");
  });

  it("fusionar un plan del mismo periodo conserva la pista si la nueva no trae y la sustituye si trae", () => {
    const old = planWith();
    const incoming = { ...old, programmingPractice: undefined, openQuestions: undefined };
    expect(mergePlans(old, incoming).programmingPractice).toEqual(old.programmingPractice);
    const other = buildPracticeTrack(pre({ practice: { ...PRACTICE, kataMinutes: 60 } }))!;
    expect(mergePlans(old, { ...old, programmingPractice: other }).programmingPractice!.kata!.minutesPerDay).toBe(60);
  });
});

describe("candidatos de Hoy", () => {
  const brief: StudentBrief = { version: 1, date: "2026-10-05", weekday: "lunes", sections: [] as BriefSection[], skipped: [] };
  const track = buildPracticeTrack(pre({ practice: PRACTICE }))!;
  const plan = { id: "p1", start: "2026-10-05", end: "2026-11-01", name: "Backend", programmingPractice: track };
  const sessionDay = track.weeklyProject!.weeks[0]!.sessions[1]!;
  const items = () => practiceItemsFor(sessionDay.date, [plan]);

  it("kata y proyecto con boost, razones claras y el id estable del bloque", () => {
    const c = buildCandidates(brief, { availableMinutes: 240, practiceItems: items() });
    expect(c.map((x) => x.kind)).toEqual(["programming_practice_project", "programming_practice_kata"]);
    const [proj, kata] = c;
    expect(kata).toMatchObject({ id: kataBlockId("p1"), subject: "programming_practice", estMinutes: 30, score: 88 });
    expect(kata!.reasons[0]).toContain("Reto diario del plan");
    expect(proj).toMatchObject({ id: projectBlockId("p1", 1, sessionDay.phases), estMinutes: 90, score: 92 });
    expect(proj!.reasons[0]).toContain("Proyecto semanal: fase ");
    expect(proj!.reasons[0]).toContain("foco Backend");
    expect(proj!.links.subplan).toBe("Backend");
  });

  it("respeta el presupuesto de Hoy: se acorta el bloque divisible y no cabe si es menos de 10 min", () => {
    const c = buildCandidates(brief, { availableMinutes: 45, practiceItems: items() });
    expect(c.find((x) => x.kind === "programming_practice_project")!.estMinutes).toBe(45);
    expect(c.find((x) => x.kind === "programming_practice_kata")!.estMinutes).toBe(30);
    expect(buildCandidates(brief, { availableMinutes: 8, practiceItems: items() })).toEqual([]);
    expect(buildCandidates(brief, { availableMinutes: 120 })).toEqual([]);
  });

  it("los objetivos «lo que toca de mis planes» y «Programming practice» los incluyen", () => {
    const base = buildCandidates(brief, { availableMinutes: 240, practiceItems: items() });
    expect(sanitizeObjective({ type: "programming_practice" })).toEqual({ type: "programming_practice" });
    expect(objectiveText({ type: "programming_practice" })).toBe("Programming practice (kata + proyecto)");
    const extra = [{ id: "srs:x", kind: "srs_review" as const, subject: "x", estMinutes: 15, score: 95, reasons: ["r"], links: {} }];
    const withPractice = applyObjective([...base, ...extra], { type: "programming_practice" }, brief);
    expect(withPractice.find((c) => c.id === "srs:x")!.score).toBeLessThan(60);
    expect(withPractice.filter((c) => c.reasons[0]!.startsWith("cumple el objetivo"))).toHaveLength(2);
    const plans = applyObjective([...base, ...extra], { type: "plan" }, brief);
    expect(plans.filter((c) => c.reasons[0]!.startsWith("cumple el objetivo"))).toHaveLength(2);
  });
});

describe("estado derivado del módulo pp y registro manual", () => {
  const track = buildPracticeTrack(pre({ practice: PRACTICE }))!;
  const plan = { id: "p1", start: "2026-10-05", end: "2026-11-01", programmingPractice: track, preconditions: {} };
  const status = (over: Partial<Parameters<typeof derivePracticeStatus>[0]> = {}) =>
    derivePracticeStatus({ plan, today: "2026-10-08", projects: [], kataDates: new Set(), manual: manualPracticeOf("p1", []), ppReady: true, ...over })!;

  it("las fases de un proyecto salen de su estado", () => {
    expect(phasesOfProject({ state: "spec", graded: false })).toEqual({ build: "hecho", construct: "pendiente", defend: "pendiente", postmortem: "pendiente" });
    expect(phasesOfProject({ state: "building", graded: false }).construct).toBe("en_curso");
    expect(phasesOfProject({ state: "defended", graded: false })).toMatchObject({ construct: "hecho", defend: "en_curso" });
    expect(phasesOfProject({ state: "defended", graded: true }).defend).toBe("hecho");
    expect(Object.values(phasesOfProject({ state: "done", graded: true })).every((s) => s === "hecho")).toBe(true);
  });

  it("kata: racha, días hechos y hoy; sin datos todo pendiente", () => {
    expect(status().kata).toMatchObject({ plannedDays: 4, doneDays: 0, streak: 0, todayPlanned: true, todayDone: false });
    const s = status({ kataDates: new Set(["2026-10-05", "2026-10-06", "2026-10-07"]) });
    expect(s.kata).toMatchObject({ doneDays: 3, streak: 3, todayDone: false });
    expect(status({ kataDates: new Set(["2026-10-06", "2026-10-07", "2026-10-08"]) }).kata).toMatchObject({ doneDays: 3, streak: 3, todayDone: true });
  });

  it("proyecto: el atribuido a la semana por su fecha manda; lo manual completa lo que no se deriva", () => {
    const projects = [{ folder: "Gastos", title: "Gastos", state: "defended" as const, date: "2026-10-06", graded: false }, { folder: "Otro", title: "Otro", state: "done" as const, date: "2026-10-14", graded: true }];
    const s = status({ projects });
    expect(s.weeks[0]).toMatchObject({ week: 1, project: { folder: "Gastos" }, phases: { build: "hecho", construct: "hecho", defend: "en_curso", postmortem: "pendiente" }, current: true, source: "pp" });
    expect(s.weeks[1]!.phases.postmortem).toBe("hecho");
    const session: SessionRecord = { date: "2026-10-08", availableMinutes: 60, createdAt: "", blocks: [{ candidateId: projectBlockId("p1", 3, ["build"]), kind: "programming_practice_project", subject: "x", minutes: 30, status: "done" }, { candidateId: projectBlockId("p1", 1, ["defend"]), kind: "programming_practice_project", subject: "x", minutes: 30, status: "skipped" }, { candidateId: kataBlockId("p1"), kind: "programming_practice_kata", subject: "x", minutes: 30, status: "done" }] };
    const m = status({ manual: manualPracticeOf("p1", [session]) });
    expect(m.weeks[2]!.phases.build).toBe("hecho");
    expect(m.weeks[2]!.source).toBe("manual");
    expect(m.weeks[0]!.phases.defend).toBe("saltado");
    expect(m.kata!.todayDone).toBe(true);
    // lo manual y lo derivado se combinan
    const both = status({ projects, manual: manualPracticeOf("p1", [session]) });
    expect(both.weeks[0]!.phases.defend).toBe("en_curso"); // saltar a mano no pisa lo que el módulo ya muestra en curso
  });

  it("phasesDone sirve a «Hoy» para no repetir una sesión ya hecha; plan sin práctica = null", () => {
    const s = status({ projects: [{ folder: "G", title: "G", state: "done", date: "2026-10-06", graded: true }] });
    expect(phasesDone(s, 1, ["defend", "postmortem"])).toBe(true);
    expect(phasesDone(status(), 1, ["build"])).toBe(false);
    expect(derivePracticeStatus({ plan: { ...plan, programmingPractice: undefined }, today: "2026-10-08", projects: [], kataDates: new Set(), manual: manualPracticeOf("p1", []), ppReady: false })).toBeNull();
  });

  it("kataDates sale de los intentos con la skill pp_kata", () => {
    const attempts = { a: { attempts: [{ skill: "pp_kata", at: "2026-10-06T08:00:00" }, { skill: "implement", at: "2026-10-07T08:00:00" }, { mode: "pp_kata", at: "2026-10-08T09:00:00" }] } };
    expect([...kataDates(attempts)].sort()).toEqual(["2026-10-06", "2026-10-08"]);
  });

  it("lee los proyectos del módulo programming_practice de la vault", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nv-ppv-"));
    try {
      const area = path.join(root, "Programación", "programming_practice", "projects");
      fs.mkdirSync(path.join(area, "Gastos"), { recursive: true });
      fs.mkdirSync(path.join(area, "_specs"), { recursive: true });
      fs.writeFileSync(path.join(root, "Programación", "Programación.resumen.md"), "---\nsubject: programming\n---\n");
      fs.writeFileSync(path.join(area, "Gastos", ".pp.json"), JSON.stringify({ version: 1, state: "defended", createdAt: "2026-10-06T12:00:00", spec: { title: "Gastos", focus: "backend", client: "web" }, defense: { final: { score: 70 }, grade: { score: 80 } } }));
      fs.writeFileSync(path.join(area, "_specs", "Agenda.spec.json"), JSON.stringify({ title: "Agenda", focus: "frontend", client: "web" }));
      const list = readPpProjects(root);
      expect(list.find((p) => p.folder === "Gastos")).toMatchObject({ state: "defended", graded: true, score: 80, date: "2026-10-06" });
      expect(list.find((p) => p.folder === "Agenda")).toMatchObject({ state: "spec" });
      expect(readPpProjects(path.join(root, "no-existe"))).toEqual([]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
