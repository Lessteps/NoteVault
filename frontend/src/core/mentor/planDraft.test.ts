import { describe, expect, it } from "vitest";
import type { StudentBrief } from "./brief.js";
import type { CatalogTopic } from "./goalDraft.js";
import { buildChatMessages, composePlanDraft, parseChatResponse, planWindow, type PlanContext } from "./planDraft.js";

const cat = (n: number, skills = ["implement", "debug"]): CatalogTopic => ({ folder: `P/T${n}`, title: `Tema ${n}`, subject: "programming", skills, completenessPct: 0, estMinutes: 60 });
const catalog = [cat(1), cat(2), cat(3)];
const ctx: PlanContext = {
  month: "2026-10",
  today: "2026-10-05",
  goals: [{ id: "g1", name: "Backend", items: [{ id: "i1", name: "APIs" }] }],
  projects: [{ id: "p1", name: "API de inventario" }],
};
const brief: StudentBrief = { version: 1, date: "2026-10-05", weekday: "lunes", sections: [], skipped: [] };

const reply = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    type: "plan_draft",
    rationale: "r",
    hoursPerWeek: 5,
    subplans: [
      {
        area: "Programación",
        objective: "Backend",
        goalId: "g1",
        topics: [{ folder: "P/T1" }, { folder: "P/Nope" }, { folder: "P/T2", skills: ["debug", "x"] }, { folder: "P/T1" }],
        requiredGoals: [{ goalId: "g1", itemId: "i1", note: "n" }, { goalId: "gX" }, { goalId: "g1", itemId: "iX" }],
        deliverable: { title: "API", description: "d", criteria: ["a", "b"], projectId: "p9" },
      },
    ],
    ...over,
  });

describe("parseChatResponse", () => {
  it("valida contra el catálogo, las metas y los proyectos reales", () => {
    const r = parseChatResponse("```json\n" + reply() + "\n```", catalog, ctx);
    expect(r.ok).toBe(true);
    if (!r.ok || r.reply.type !== "plan_draft") throw new Error("esperaba plan_draft");
    const s = r.reply.subplans[0]!;
    expect(s.topics.map((t) => t.folder)).toEqual(["P/T1", "P/T2"]);
    expect(s.topics[1]!.skills).toEqual(["debug"]);
    expect(s.requiredGoals).toEqual([
      { goalId: "g1", itemId: "i1", note: "n" },
      { goalId: "g1", note: "" },
    ]);
    expect(s.deliverable).toEqual({ title: "API", description: "d", criteria: ["a", "b"] }); // projectId inventado fuera
    expect(r.reply.discarded).toEqual(expect.arrayContaining(["P/Nope", "meta gX", "submeta iX", "proyecto p9"]));
  });

  it("acepta un proyecto existente y sigue entendiendo preguntas y goal_draft", () => {
    const withProject = parseChatResponse(reply({ subplans: [{ area: "A", topics: [{ folder: "P/T1" }], deliverable: { title: "X", projectId: "p1" } }] }), catalog, ctx);
    expect(withProject.ok && withProject.reply.type === "plan_draft" && withProject.reply.subplans[0]!.deliverable!.projectId).toBe("p1");
    const q = parseChatResponse(JSON.stringify({ type: "question", text: "¿Horas?" }), catalog, ctx);
    expect(q).toMatchObject({ ok: true, reply: { type: "question" } });
    const g = parseChatResponse(JSON.stringify({ type: "goal_draft", name: "G", rationale: "", hoursPerWeek: 4, durationWeeks: 8, topics: [{ folder: "P/T1" }] }), catalog, ctx);
    expect(g).toMatchObject({ ok: true, reply: { type: "goal_draft" } });
  });

  it("falla si ningún subplan tiene temas reales ni entregable", () => {
    const r = parseChatResponse(reply({ subplans: [{ area: "A", topics: [{ folder: "P/Nope" }] }] }), catalog, ctx);
    expect(r).toMatchObject({ ok: false });
    expect((r as { error: string }).error).toContain("P/Nope");
  });
});

describe("composePlanDraft", () => {
  const parsed = () => {
    const r = parseChatResponse(reply(), catalog, ctx);
    if (!r.ok || r.reply.type !== "plan_draft") throw new Error("x");
    return r.reply;
  };

  it("calcula el reparto semanal desde hoy, con avisos si no cabe", () => {
    const d = composePlanDraft(parsed(), catalog, ctx);
    if ("missing" in d) throw new Error("x");
    expect(d.month).toBe("2026-10");
    expect(d.from).toBe("2026-10-05");
    expect(d.subplans[0]!.topics.map((t) => t.estMinutes)).toEqual([60, 60]);
    expect(d.subplans[0]!.topics.every((t) => t.targetWeek >= 1)).toBe(true);
    expect(d.fits).toBe(true);
    const tight = composePlanDraft({ ...parsed(), hoursPerWeek: 0.2 }, catalog, ctx);
    if ("missing" in tight) throw new Error("x");
    expect(tight.fits).toBe(false);
    expect(tight.warnings[0]).toContain("No cabe");
  });

  it("sin horas por semana pide el dato", () => {
    expect(composePlanDraft({ ...parsed(), hoursPerWeek: null }, catalog, ctx)).toEqual({ missing: "las horas por semana que puedes dedicar este mes" });
  });

  it("planWindow: el mes en curso empieza hoy; uno pasado se ignora; uno futuro empieza el día 1", () => {
    expect(planWindow(undefined, "2026-10-05")).toEqual({ month: "2026-10", from: "2026-10-05" });
    expect(planWindow("2026-08", "2026-10-05")).toEqual({ month: "2026-10", from: "2026-10-05" });
    expect(planWindow("2026-11", "2026-10-05")).toEqual({ month: "2026-11", from: "2026-11-01" });
  });
});

describe("buildChatMessages", () => {
  it("añade el esquema plan_draft y las metas y proyectos existentes al system", () => {
    const m = buildChatMessages("plan del mes", brief, catalog, [], { today: "2026-10-05", plan: ctx, planMode: true });
    const sys = m[0]!.content;
    expect(sys).toContain("plan_draft");
    expect(sys).toContain("goalId=g1");
    expect(sys).toContain("projectId=p1");
    expect(sys).toContain("folder=P/T1");
    expect(sys).toContain("responde con plan_draft");
    expect(m[m.length - 1]).toEqual({ role: "user", content: "plan del mes" });
  });
});
