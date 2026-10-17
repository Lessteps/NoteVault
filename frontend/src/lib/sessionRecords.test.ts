import { describe, expect, it } from "vitest";
import {
  baselineFor, buildSessionRecord, expiredRecords, followUpOf, isoWeekOf, masteryByTopic, parseSessionRecord, patternsOf, proposalId, proposalsFromPatterns,
  renderSessionMarkdown, renderWeakPointsMarkdown, renderWeekMarkdown, sessionNoteRel, weekAggregate, type Proposal, type SessionRecord,
} from "./sessionRecords";

const HTTP = "Programación/4 Backend/4.2 HTTP in depth";
const REST = "Programación/4 Backend/4.3 REST";
const T0 = new Date(2026, 9, 16, 14, 30).getTime();

const rec = (o: Partial<Parameters<typeof buildSessionRecord>[0]> = {}): SessionRecord =>
  buildSessionRecord({
    id: "r1", planId: "p1", areaKey: "backend", areaName: "Backend", date: "2026-10-16", startedAtMs: T0, minutes: 52, mode: "timer",
    assigned: [{ kind: "topic", folder: HTTP, title: "4.2 HTTP in depth", status: "partial" }, { kind: "task", folder: "manual:task:a", title: "Terminar el login", status: "done" }],
    assessment: { understanding: 3, focus: 4, practiced: true, learned: "Cómo se valida un 422", doubt: "Qué pasa si el token expira", errors: "Confundí PUT con PATCH" },
    attempts: [{ exercise: `${HTTP}/Ejercicios/design/ej_1.md`, topic: HTTP, skill: "design", score: 55, verdict: "partial" }],
    errors: [{ category: "conceptual", skill: "design", topic: "4.2 HTTP in depth", folder: HTTP, repeat: 2, description: "PUT vs PATCH" }],
    now: "2026-10-16T15:30:00.000Z", ...o,
  })!;

describe("registro de sesión", () => {
  it("construye el registro limpio: hora local de inicio, listas recortadas y estados válidos", () => {
    const r = rec();
    expect(r).toMatchObject({ version: 1, id: "r1", areaKey: "backend", date: "2026-10-16", start: "14:30", minutes: 52, mode: "timer" });
    expect(r.assigned.map((t) => [t.kind, t.status])).toEqual([["topic", "partial"], ["task", "done"]]);
    expect(r.evidence.attempts).toHaveLength(1);
    expect(r.evidence.errors[0]).toMatchObject({ repeat: 2, category: "conceptual" });
    const big = rec({ attempts: Array.from({ length: 50 }, (_, i) => ({ exercise: `e${i}.md`, score: 150 })), assigned: Array.from({ length: 20 }, (_, i) => ({ title: `t${i}`, status: "raro" as never })) });
    expect(big.evidence.attempts).toHaveLength(30);
    expect(big.evidence.attempts[0]!.score).toBe(100);
    expect(big.assigned).toHaveLength(12);
    expect(big.assigned[0]!.status).toBe("partial");
  });

  it("sin plan, área, día válido o minutos no hay registro", () => {
    expect(buildSessionRecord({ id: "x", planId: "p", areaKey: "", areaName: "", date: "2026-10-16", startedAtMs: T0, minutes: 10, mode: "timer", assigned: [], now: "" })).toBeNull();
    expect(buildSessionRecord({ id: "x", planId: "p", areaKey: "a", areaName: "A", date: "hoy", startedAtMs: T0, minutes: 10, mode: "timer", assigned: [], now: "" })).toBeNull();
    expect(buildSessionRecord({ id: "x", planId: "p", areaKey: "a", areaName: "A", date: "2026-10-16", startedAtMs: T0, minutes: 0, mode: "timer", assigned: [], now: "" })).toBeNull();
  });

  it("lo que se escribe en disco se vuelve a leer igual", () => {
    const r = rec();
    expect(parseSessionRecord(JSON.parse(JSON.stringify(r)))).toEqual(r);
    expect(parseSessionRecord({ version: 2 })).toBeNull();
    expect(parseSessionRecord(null)).toBeNull();
  });

  it("la nota Markdown lleva frontmatter propio (sin chocar con los tipos de la vault), enlaces a los temas y la evidencia", () => {
    const md = renderSessionMarkdown(rec());
    expect(md.startsWith("---\nregistro: sesion\n")).toBe(true);
    expect(md).toContain("comprension: 3");
    expect(md).toContain("- [[4.2 HTTP in depth]] — a medias");
    expect(md).toContain("- Tarea: Terminar el login — completado");
    expect(md).toContain("**Duda pendiente:** Qué pasa si el token expira");
    expect(md).toContain("Intentos: 1 (nota media 55)");
    expect(md).toContain("conceptual (design) · 4.2 HTTP in depth ×2 — PUT vs PATCH");
    expect(md).not.toMatch(/^type:/m);
    expect(sessionNoteRel("Programación", rec())).toBe("Programación/_registro/2026-10-16/1430 Backend.md");
  });
});

describe("dominio por tema", () => {
  it("lo medido pesa más que lo declarado: mucha comprensión declarada con intentos malos sigue siendo un dominio bajo", () => {
    const humo = rec({ assessment: { understanding: 5, focus: 5, practiced: true, learned: "x", doubt: "y" }, attempts: [{ exercise: "a.md", topic: HTTP, skill: "design", score: 20, verdict: "incorrect" }, { exercise: "b.md", topic: HTTP, skill: "design", score: 30, verdict: "incorrect" }], errors: [] });
    const bien = rec({ id: "r2", assessment: { understanding: 2, focus: 3, practiced: true, learned: "x", doubt: "y" }, assigned: [{ kind: "topic", folder: REST, title: "4.3 REST", status: "done" }], attempts: [{ exercise: "c.md", topic: REST, skill: "implement", score: 95, verdict: "correct" }], errors: [] });
    const m = masteryByTopic([humo, bien]);
    const http = m.find((x) => x.folder === HTTP)!;
    const rest = m.find((x) => x.folder === REST)!;
    expect(http.avgScore).toBe(25);
    expect(http.mastery).toBeLessThan(rest.mastery);
    expect(m[0]!.folder).toBe(HTTP); // el más flojo primero
  });

  it("cuenta sesiones, sesiones abiertas y errores; sin intentos usa el resto", () => {
    const r = rec({ attempts: [] });
    const m = masteryByTopic([r])[0]!;
    expect(m).toMatchObject({ folder: HTTP, sessions: 1, openSessions: 1, errors: 2, attempts: 0, avgScore: null });
    expect(m.mastery).toBeGreaterThan(0);
    expect(m.mastery).toBeLessThanOrEqual(100);
  });
});

describe("patrones y propuestas", () => {
  const sessions = (n: number, over: (i: number) => Partial<Parameters<typeof buildSessionRecord>[0]> = () => ({})): SessionRecord[] =>
    Array.from({ length: n }, (_, i) => rec({ id: `r${i + 1}`, date: `2026-10-${String(10 + i).padStart(2, "0")}`, startedAtMs: new Date(2026, 9, 10 + i, 14, 30).getTime(), ...over(i) }));

  it("detecta el error que se repite, el tema que siempre queda a medias y la comprensión baja", () => {
    const rs = sessions(3, () => ({ assessment: { understanding: 2, focus: 4, practiced: true, learned: "a", doubt: "b" } }));
    const ps = patternsOf(rs, { today: "2026-10-16" });
    const kinds = ps.map((p) => p.kind).sort();
    expect(kinds).toEqual(["low_understanding", "repeated_error", "stuck_topic"]);
    expect(ps.find((p) => p.kind === "repeated_error")!.detail).toContain("6 errores");
    expect(ps.find((p) => p.kind === "stuck_topic")!.recordIds).toEqual(["r1", "r2", "r3"]);
  });

  it("fuera de la ventana de 14 días no hay patrones; un tema completado alguna vez no está atascado", () => {
    expect(patternsOf(sessions(3), { today: "2026-11-30" })).toEqual([]);
    const rs = sessions(3, (i) => ({ assigned: [{ kind: "topic" as const, folder: HTTP, title: "4.2", status: i === 2 ? ("done" as const) : ("partial" as const) }], errors: [] }));
    expect(patternsOf(rs, { today: "2026-10-16" }).some((p) => p.kind === "stuck_topic")).toBe(false);
  });

  it("concentración baja, repasos vencidos y horas muy por debajo de lo previsto", () => {
    const rs = sessions(4, () => ({ assessment: { understanding: 4, focus: 2, practiced: false, learned: "a", doubt: "b" }, errors: [], assigned: [] }));
    const ps = patternsOf(rs, { today: "2026-10-16", overdueReviews: [{ folder: "a", title: "a", inDays: -5 }, { folder: "b", title: "b", inDays: -4 }, { folder: "c", title: "c", inDays: -3 }, { folder: "d", title: "d", inDays: 0 }], hours: { done: 100, planned: 400 } });
    expect(ps.map((p) => p.kind).sort()).toEqual(["low_focus", "low_hours", "overdue_reviews"]);
  });

  it("las propuestas por reglas citan la sesión, son siempre «a confirmar» y tienen id estable", () => {
    const rs = sessions(3, () => ({ assessment: { understanding: 2, focus: 4, practiced: true, learned: "a", doubt: "No entiendo el token" } }));
    const ps = proposalsFromPatterns(patternsOf(rs, { today: "2026-10-16" }), rs, "2026-10-16T10:00:00Z");
    const kinds = ps.map((p) => p.kind).sort();
    expect(kinds).toEqual(["bridge_note", "bridge_note", "move_review", "move_review", "reinforce"]);
    const reinforce = ps.find((p) => p.kind === "reinforce")!;
    expect(reinforce).toMatchObject({ folder: HTTP, skill: "design", status: "open", source: "rules", needsConfirmation: true, cost: { aiCalls: 1, files: 1 } });
    expect(reinforce.evidence[0]).toMatchObject({ recordId: "r1", note: "No entiendo el token" });
    expect(reinforce.id).toBe(proposalId("reinforce", HTTP, "design"));
    expect(proposalId("reinforce", HTTP, "design")).not.toBe(proposalId("reinforce", HTTP, "implement"));
    // sin horas ni errores la lista de propuestas puede salir con la de carga
    const low = proposalsFromPatterns([{ kind: "low_hours", folder: "", title: "Horas", detail: "100 de 400 min", recordIds: [] }], [], "x");
    expect(low).toHaveLength(1);
    expect(low[0]!.kind).toBe("lighten");
  });
});

describe("seguimiento de lo aplicado", () => {
  const applied = (over: Partial<Proposal> = {}): Proposal => ({
    id: "pr-1", kind: "reinforce", folder: HTTP, title: "t", why: "w", evidence: [], cost: { aiCalls: 1, files: 1 }, status: "applied", source: "rules", createdAt: "2026-10-01T00:00:00Z",
    appliedAt: "2026-10-02T10:00:00Z", baseline: { mastery: 40, errors: 4, avgScore: 40, avgUnderstanding: 2 }, needsConfirmation: true, ...over,
  });
  const good = (i: number): SessionRecord => rec({ id: `g${i}`, date: `2026-10-${String(16 + i).padStart(2, "0")}`, startedAtMs: new Date(2026, 9, 16 + i, 10, 0).getTime(), assigned: [{ kind: "topic", folder: HTTP, title: "4.2", status: "done" }], assessment: { understanding: 5, focus: 5, practiced: true, learned: "a", doubt: "b" }, attempts: [{ exercise: "x.md", topic: HTTP, skill: "design", score: 90, verdict: "correct" }], errors: [] });

  it("la línea base sale del dominio actual del tema", () => {
    expect(baselineFor(HTTP, [rec()])).toMatchObject({ errors: 2, avgScore: 55 });
    expect(baselineFor("otro", [rec()])).toEqual({ mastery: null, errors: 0, avgScore: null, avgUnderstanding: null });
  });

  it("antes de 14 días o con menos de 2 sesiones es «pendiente»; luego mejoró, igual o peor", () => {
    expect(followUpOf(applied({ status: "open" }), [], "2026-10-30")).toBeNull();
    expect(followUpOf(applied(), [good(1), good(2)], "2026-10-10")!.verdict).toBe("pending");
    expect(followUpOf(applied(), [good(1)], "2026-10-30")!.verdict).toBe("pending");
    const up = followUpOf(applied(), [good(1), good(2)], "2026-10-30")!;
    expect(up.verdict).toBe("improved");
    expect(up.detail).toContain("40 % →");
    const bad = (i: number) => rec({ id: `b${i}`, date: `2026-10-${String(16 + i).padStart(2, "0")}`, assigned: [{ kind: "topic", folder: HTTP, title: "4.2", status: "none" }], assessment: { understanding: 1, focus: 2, practiced: true, learned: "a", doubt: "b" }, attempts: [{ exercise: "x.md", topic: HTTP, skill: "design", score: 5, verdict: "incorrect" }], errors: [{ category: "conceptual", folder: HTTP, topic: "t", skill: "design", repeat: 3 }] });
    expect(followUpOf(applied({ baseline: { mastery: 70, errors: 0, avgScore: 70, avgUnderstanding: 4 } }), [bad(1), bad(2)], "2026-10-30")!.verdict).toBe("worse");
    expect(followUpOf(applied({ baseline: { mastery: null, errors: 0, avgScore: null, avgUnderstanding: null } }), [good(1), good(2)], "2026-10-30")!.verdict).toBe("same");
  });
});

describe("semana y retención de 90 días", () => {
  it("semana ISO", () => {
    expect(isoWeekOf("2026-10-16")).toBe("2026-W42");
    expect(isoWeekOf("2026-01-01")).toBe("2026-W01");
    expect(isoWeekOf("2027-01-03")).toBe("2026-W53");
  });

  it("el agregado semanal resume tiempo, medias, intentos, errores y áreas", () => {
    const a = weekAggregate("2026-W42", [rec(), rec({ id: "r2", areaKey: "frontend", areaName: "Frontend", minutes: 30, assigned: [{ kind: "topic", folder: REST, title: "4.3 REST", status: "done" }] }), rec({ id: "old", date: "2026-08-01" })]);
    expect(a).toMatchObject({ sessions: 2, minutes: 82, attempts: 2 });
    expect(a.byArea.map((x) => x.area)).toEqual(["Backend", "Frontend"]);
    expect(a.avgUnderstanding).toBe(3);
    const md = renderWeekMarkdown(a);
    expect(md).toContain("registro: semana");
    expect(md).toContain("Sesiones: **2**");
  });

  it("caduca el detalle a los 90 días (no antes) y la nota de puntos débiles lista lo flojo con enlaces", () => {
    const old = rec({ id: "old", date: "2026-07-01" });
    const mid = rec({ id: "mid", date: "2026-07-20" });
    expect(expiredRecords([old, mid, rec()], "2026-10-16").map((r) => r.id)).toEqual(["old"]);
    const weak = renderWeakPointsMarkdown(masteryByTopic([rec()]), [{ kind: "repeated_error", folder: HTTP, title: "4.2", detail: "3 errores", recordIds: [] }], "2026-10-16");
    expect(weak).toContain("registro: puntos-debiles");
    expect(weak).toContain("[[4.2 HTTP in depth]]");
    expect(weak).toContain("3 errores");
  });
});
