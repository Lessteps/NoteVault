// Preguntas, correcciones y ajustes: clasificador por reglas, validación de la clasificación y de la respuesta de la IA, y respuestas
// deterministas sobre el modelo del plan (sin IA). Todo puro.

import { describe, expect, it } from "vitest";
import { answerByRules, askMessages, classifyByRules, compactPlanForAsk, parseAskReply, parseIntentReply, type AskPlanLike } from "./planAsk";
import { COVERAGE_DISCLAIMER, criteriaText, DEFAULT_CRITERIA, parseCoverageReply, sanitizeCoverageReview, sanitizeCriteria } from "./planCoverage";

const topic = (n: number, week: number, group: string, extra: Record<string, unknown> = {}) => ({ folder: `P/B/T${n}`, title: `Tema ${n}`, targetWeek: week, estMinutes: 60, group, ...extra });
const plan: AskPlanLike = {
  id: "2026-10-05_2026-12-27", start: "2026-10-05", end: "2026-12-27", rationale: "Lo básico antes.",
  preconditions: { minutesPerDay: 120, studyDays: [1, 2, 3, 4, 5], pace: "normal" },
  subplans: [
    { id: "s1", area: "Backend", areaId: "backend", phase: { fromWeek: 1, toWeek: 6 }, groups: [{ id: "bases", title: "Bases", kind: "bases", order: 0 }, { id: "core", title: "Conocimientos", kind: "knowledge", order: 100 }], topics: [topic(1, 1, "bases", { completedAt: "2026-10-06" }), topic(2, 2, "bases"), topic(3, 3, "core"), topic(4, 3, "core", { route: "skipped" })] },
    { id: "s2", area: "Databases", areaId: "databases", phase: { fromWeek: 7, toWeek: 10 }, topics: [topic(5, 7, "")] },
  ],
};

describe("classifyByRules", () => {
  it.each([
    ["¿Por qué este orden?", "question", true],
    ["cuánto falta", "question", true],
    ["Quita lo de desktop", "adjust", true],
    ["Hazlo más ligero", "adjust", true],
    ["Hay temas repetidos en Backend", "fix", true],
    ["La semana 4 está mal", "fix", true],
  ] as const)("«%s» → %s", (text, intent, confident) => {
    expect(classifyByRules(text)).toMatchObject({ intent, confident });
  });

  it("en la duda no decide y trae la pregunta de aclaración", () => {
    const g = classifyByRules("¿Puedes quitar Docker?");
    expect(g.confident).toBe(false);
    expect(g.ask).toBe("¿Solo quieres saber «Puedes quitar Docker» o quieres que lo cambie en el plan?");
    expect(classifyByRules("hmm Docker").confident).toBe(false);
    expect(classifyByRules("   ").confident).toBe(false);
  });
});

describe("parseIntentReply / parseAskReply", () => {
  it("valida la clasificación de la IA: solo tres intenciones; poca confianza o «unclear» piden aclarar", () => {
    expect(parseIntentReply('```json\n{"intent":"fix","confidence":0.9}\n```', "x")).toEqual({ intent: "fix", confident: true });
    expect(parseIntentReply('{"intent":"adjust","confidence":0.3}', "mueve X")).toMatchObject({ confident: false });
    expect(parseIntentReply('{"intent":"unclear"}', "x")).toMatchObject({ confident: false });
    expect(parseIntentReply('{"intent":"delete_everything"}', "x")).toBeNull();
    expect(parseIntentReply("no sé", "x")).toBeNull();
  });

  it("la respuesta de la IA se limpia a texto plano y se acota; vacío = null", () => {
    expect(parseAskReply("```\nHola\n```")).toBe("Hola");
    expect(parseAskReply('{"answer":"Por orden de dependencia."}')).toBe("Por orden de dependencia.");
    expect(parseAskReply("")).toBeNull();
    expect(parseAskReply("x".repeat(5000))!.length).toBeLessThanOrEqual(2400);
  });
});

describe("contexto y respuestas deterministas", () => {
  it("el plan compacto lleva áreas, fases, grupos y los temas fuera de ruta no cuentan", () => {
    const t = compactPlanForAsk(plan, "2026-10-14");
    expect(t).toContain("semana 2 del plan");
    expect(t).toContain("ÁREA Backend · semanas 1-6 · 3 temas (1 completados, 1 fuera de ruta)");
    expect(t).not.toContain("Tema 4 (");
    const m = askMessages(plan, "¿Por qué?", "2026-10-14", [{ q: "a", a: "b" }]);
    expect(m[0]!.content).toContain("NO modifiques nada");
    expect(m[1]!.content).toContain("PREGUNTAS ANTERIORES");
  });

  it("responde «esta semana toca…», «Backend ocupa las semanas…» y «cuánto falta» solo con el modelo", () => {
    expect(answerByRules(plan, "¿Qué toca esta semana?", "2026-10-14").answer).toContain("Backend: Tema 2");
    expect(answerByRules(plan, "¿Cuántas semanas ocupa Backend?", "2026-10-14").answer).toBe("Backend ocupa las semanas 1–6: 3 temas (3 h).");
    expect(answerByRules(plan, "¿Cuánto falta?", "2026-10-14").answer).toMatch(/Llevas 1 de 4 temas completados \(25 %\)/);
    const unknown = answerByRules(plan, "háblame de Marte", "2026-10-14");
    expect(unknown.understood).toBe(false);
    expect(unknown.answer).toContain("Sin IA");
  });
});

describe("criterio de la revisión de cobertura", () => {
  it("sanitizeCriteria: valores desconocidos vuelven al defecto, siempre hay un preset y las condiciones activan «Lo que yo pida»", () => {
    expect(sanitizeCriteria(undefined)).toEqual(DEFAULT_CRITERIA);
    expect(sanitizeCriteria({ presets: ["x"], targetLevel: "dios", currentLevel: "??" })).toEqual(DEFAULT_CRITERIA);
    const c = sanitizeCriteria({ presets: ["mid"], targetLevel: "mid", currentLevel: "junior", conditions: "  prioriza   testing " });
    expect(c).toEqual({ presets: ["mid", "custom"], targetLevel: "mid", currentLevel: "junior", conditions: "prioriza testing" });
    expect(criteriaText(c)).toContain("Nivel mid-level");
    expect(criteriaText(c)).toContain("condiciones: prioriza testing");
  });

  it("parseCoverageReply normaliza veredicto, prioridad, nivel y %, y solo admite prescindibles que son temas del plan sin completar", () => {
    const raw = JSON.stringify({
      summary: "Corto.", overall: { verdict: "insuficiente", coveragePct: "68%" },
      areas: [{ key: "backend", verdict: "se queda corto", coveragePct: 63, missing: [{ title: "Testing de APIs", priority: "alta", level: "Jr" }], dispensable: [{ title: "Tema 2", reason: "básico" }, { title: "Tema 1", reason: "hecho" }, { title: "Fantasma", reason: "x" }] }],
    });
    const r = parseCoverageReply(raw, {
      areas: [{ key: "backend", area: "Backend" }],
      planTopics: [{ folder: "P/B/T1", title: "Tema 1", key: "backend", done: true }, { folder: "P/B/T2", title: "Tema 2", key: "backend" }],
      vaultTitles: [],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.review.overall).toEqual({ verdict: "short", coveragePct: 70, text: "" });
    const a = r.review.areas[0]!;
    expect(a).toMatchObject({ verdict: "short", coveragePct: 65 });
    expect(a.missing[0]).toMatchObject({ priority: "high", level: "junior" });
    expect(a.dispensable).toEqual([{ folder: "P/B/T2", title: "Tema 2", reason: "básico" }]);
    expect(r.review.discarded).toBe(2);
  });

  it("sanitizeCoverageReview conserva los campos nuevos y lee las revisiones antiguas sin ellos", () => {
    const at = "2026-10-07T10:00:00Z";
    const full = sanitizeCoverageReview({ at, summary: "x", criteria: { presets: ["mid"] }, overall: { verdict: "adequate", coveragePct: 82, text: "ok" }, disclaimer: COVERAGE_DISCLAIMER, areas: [{ key: "a", area: "A", verdict: "excessive", coveragePct: 120, missing: [{ title: "T", accepted: true, priority: "low" }], dispensable: [{ folder: "f", title: "t", reason: "r" }] }] })!;
    expect(full.criteria!.presets).toEqual(["mid"]);
    expect(full.overall).toMatchObject({ verdict: "adequate", coveragePct: 80 });
    expect(full.areas[0]).toMatchObject({ verdict: "excessive", coveragePct: 100 });
    expect(full.areas[0]!.missing[0]).toMatchObject({ accepted: true, priority: "low" });
    const old = sanitizeCoverageReview({ at, summary: "x", areas: [{ key: "a", area: "A", assessment: "y", missing: [], misplaced: [] }] })!;
    expect(old.areas[0]!.verdict).toBeUndefined();
    expect(old.criteria).toBeUndefined();
  });
});
