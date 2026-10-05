import { describe, expect, it, vi } from "vitest";
import { AIConfig } from "../aiClient.js";
import type { StudentBrief } from "./brief.js";
import type { Candidate } from "./candidates.js";
import {
  aiUnavailableReason,
  applyExclusions,
  buildPlanMessages,
  parsePlanResponse,
  planToBlocks,
  proposePlan,
} from "./planner.js";

const brief: StudentBrief = { version: 1, date: "2026-10-05", weekday: "lunes", sections: [], skipped: [] };

const cand = (id: string, subject: string, est: number, over: Partial<Candidate> = {}): Candidate => ({
  id,
  kind: "continue_topic",
  subject,
  estMinutes: est,
  score: 60,
  reasons: [`razón ${id}`],
  links: {},
  ...over,
});

const CANDS = [cand("srs:mathematics", "mathematics", 20, { kind: "srs_review" }), cand("topic:eng/1", "english", 30), cand("task:1", "historia", 30, { kind: "task_deadline" })];
const goodCfg = new AIConfig({ provider: "deepseek", api_key: "sk-test", model: "m" });

const json = (blocks: unknown[], extra: Record<string, unknown> = {}) => JSON.stringify({ summary: "Hoy: repasos", blocks, ...extra });

describe("buildPlanMessages", () => {
  it("fija el rol, el esquema y lista solo los candidatos con el ajuste del usuario", () => {
    const [sys, user] = buildPlanMessages(brief, CANDS, { availableMinutes: 90, objective: "cerrar álgebra", userNote: "hoy no quiero mates" });
    expect(sys!.role).toBe("system");
    expect(sys!.content).toContain("ÚNICAMENTE entre los candidatos");
    expect(sys!.content).toContain("candidateId");
    expect(user!.content).toContain("90 minutos");
    expect(user!.content).toContain("cerrar álgebra");
    expect(user!.content).toContain("hoy no quiero mates");
    expect(user!.content).toContain("id=srs:mathematics");
  });
});

describe("parsePlanResponse", () => {
  it("acepta JSON válido y copia los datos del candidato", () => {
    const r = parsePlanResponse(json([{ candidateId: "srs:mathematics", minutes: 20, reason: "repasos vencidos" }, { candidateId: "topic:eng/1", minutes: 30, reason: "a medias" }], { notes: "ojo" }), CANDS, 90);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.blocks.map((b) => [b.candidateId, b.minutes, b.kind])).toEqual([["srs:mathematics", 20, "srs_review"], ["topic:eng/1", 30, "continue_topic"]]);
    expect(r.plan.blocks[0]!.reason).toBe("repasos vencidos");
    expect(r.plan.notes).toBe("ojo");
  });

  it("extrae el JSON de un bloque de código o con texto alrededor", () => {
    const body = json([{ candidateId: "task:1", minutes: 30, reason: "entrega" }]);
    for (const text of ["```json\n" + body + "\n```", `Claro, aquí va:\n${body}\nSuerte.`, "```\n" + body + "\n```"]) {
      const r = parsePlanResponse(text, CANDS, 60);
      expect(r.ok && r.plan.blocks[0]!.candidateId).toBe("task:1");
    }
  });

  it("descarta ids inventados, duplicados y minutos no numéricos; recorta a [5, est*1.5]", () => {
    const r = parsePlanResponse(
      json([
        { candidateId: "inventado", minutes: 30, reason: "x" },
        { candidateId: "srs:mathematics", minutes: "mucho", reason: "x" },
        { candidateId: "topic:eng/1", minutes: 200, reason: "x" },
        { candidateId: "topic:eng/1", minutes: 10, reason: "dup" },
        { candidateId: "task:1", minutes: 1, reason: "x" },
      ]),
      CANDS,
      240,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.blocks.map((b) => [b.candidateId, b.minutes])).toEqual([["topic:eng/1", 45], ["task:1", 5]]);
  });

  it("si la suma excede el tiempo recorta por orden", () => {
    const r = parsePlanResponse(
      json([
        { candidateId: "srs:mathematics", minutes: 30, reason: "a" },
        { candidateId: "topic:eng/1", minutes: 45, reason: "b" },
        { candidateId: "task:1", minutes: 30, reason: "c" },
      ]),
      CANDS,
      60,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.blocks.map((b) => b.minutes)).toEqual([30, 30]);
    expect(r.plan.blocks.reduce((n, b) => n + b.minutes, 0)).toBeLessThanOrEqual(60);
  });

  it("JSON roto, sin bloques válidos o sin JSON -> ok:false", () => {
    expect(parsePlanResponse('{"summary": "x", "blocks": [', CANDS, 60).ok).toBe(false);
    expect(parsePlanResponse("no hay json", CANDS, 60).ok).toBe(false);
    expect(parsePlanResponse(json([{ candidateId: "nope", minutes: 10, reason: "" }]), CANDS, 60).ok).toBe(false);
  });
});

describe("proposePlan", () => {
  it("usa la IA cuando responde bien", async () => {
    const send = vi.fn().mockResolvedValue(json([{ candidateId: "topic:eng/1", minutes: 30, reason: "inglés" }]));
    const r = await proposePlan(goodCfg, { brief, candidates: CANDS, availableMinutes: 60 }, send);
    expect(r.source).toBe("ai");
    expect(r.plan.blocks.map((b) => b.candidateId)).toEqual(["topic:eng/1"]);
  });

  it("IA no configurada -> plan automático sin llamar a la IA", async () => {
    const send = vi.fn();
    const r = await proposePlan(new AIConfig({ provider: "deepseek", api_key: "" }), { brief, candidates: CANDS, availableMinutes: 60 }, send);
    expect(send).not.toHaveBeenCalled();
    expect(r.source).toBe("fallback");
    expect(r.error).toMatch(/no está configurada/);
    expect(r.plan.blocks.length).toBeGreaterThan(0);
    expect(aiUnavailableReason(new AIConfig({ provider: "bridge_claude" }))).toMatch(/puente/);
  });

  it("JSON roto o error de red -> plan automático con el motivo", async () => {
    const broken = await proposePlan(goodCfg, { brief, candidates: CANDS, availableMinutes: 60 }, async () => "{ roto");
    expect(broken.source).toBe("fallback");
    expect(broken.raw).toBe("{ roto");
    const down = await proposePlan(goodCfg, { brief, candidates: CANDS, availableMinutes: 60 }, async () => {
      throw new Error("sin red");
    });
    expect(down.source).toBe("fallback");
    expect(down.error).toContain("sin red");
  });

  it("la IA nunca introduce bloques fuera de los candidatos", async () => {
    const r = await proposePlan(goodCfg, { brief, candidates: CANDS, availableMinutes: 60 }, async () => json([{ candidateId: "otra:cosa", minutes: 30, reason: "x" }]));
    expect(r.source).toBe("fallback");
    expect(r.plan.blocks.every((b) => CANDS.some((c) => c.id === b.candidateId))).toBe(true);
  });

  it("excludeSubjects se aplica antes de la IA, también a una respuesta que los incluya", async () => {
    const send = vi.fn().mockResolvedValue(json([{ candidateId: "srs:mathematics", minutes: 20, reason: "mates" }, { candidateId: "task:1", minutes: 30, reason: "entrega" }]));
    const r = await proposePlan(goodCfg, { brief, candidates: CANDS, availableMinutes: 90, excludeSubjects: ["Mathematics"], userNote: "hoy no quiero mates" }, send);
    const prompt = send.mock.calls[0]![1][1].content as string;
    expect(prompt).not.toContain("id=srs:mathematics");
    expect(prompt).toContain("hoy no quiero mates");
    expect(r.candidates.map((c) => c.id)).toEqual(["topic:eng/1", "task:1"]);
    expect(r.plan.blocks.map((b) => b.candidateId)).toEqual(["task:1"]);

    const auto = await proposePlan(new AIConfig({ api_key: "" }), { brief, candidates: CANDS, availableMinutes: 90, excludeSubjects: ["mathematics"], excludeCandidateIds: ["task:1"] });
    expect(auto.plan.blocks.map((b) => b.candidateId)).toEqual(["topic:eng/1"]);
  });

  it("sin candidatos devuelve un plan vacío explicado", async () => {
    const r = await proposePlan(goodCfg, { brief, candidates: [], availableMinutes: 60 }, vi.fn());
    expect(r.source).toBe("fallback");
    expect(r.plan.blocks).toEqual([]);
  });
});

describe("helpers", () => {
  it("applyExclusions y planToBlocks", () => {
    expect(applyExclusions(CANDS, { excludeSubjects: ["HISTORIA"] }).map((c) => c.id)).toEqual(["srs:mathematics", "topic:eng/1"]);
    const r = parsePlanResponse(json([{ candidateId: "task:1", minutes: 30, reason: "entrega" }]), CANDS, 60);
    if (!r.ok) throw new Error("x");
    expect(planToBlocks(r.plan)).toEqual([{ candidateId: "task:1", kind: "task_deadline", subject: "historia", minutes: 30, status: "planned", reason: "entrega" }]);
  });
});
