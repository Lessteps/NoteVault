import { describe, expect, it } from "vitest";
import { buildDossier, parseOpsReply } from "./planDossier";

describe("buildDossier", () => {
  const plan = {
    id: "2026-10-06_2027-04-05", name: "Full Stack", start: "2026-10-06", end: "2027-04-05", minutesPerDay: 420, studyDays: [1, 2, 3, 4, 5], areaMode: "together",
    areas: [{ id: "frontend", area: "Frontend", objective: "UI", phase: { fromWeek: 1, toWeek: 22 }, groups: [{ id: "html", title: "HTML" }], topics: [{ folder: "P/5/5.18.4 S", title: "5.18.4 S", targetWeek: 3, estMinutes: 45, group: "html", completedAt: "2026-10-10" }, { folder: "P/5/5.18.5 M", title: "5.18.5 M", targetWeek: 4, estMinutes: 45, group: "html", route: "optional" }] }],
  };
  const md = buildDossier({ plan, question: "¿Por qué HTML va primero?", answerAbs: "/v/P/_handoff/preguntas/x_respuesta.md", chain: [], changes: [{ n: 1, at: "2026-10-29T10:00:00Z", comment: "Organizar", summary: "345 movidos", status: "applied" }], today: "2026-10-29" });
  it("trae todo lo necesario para responder sin la app", () => {
    for (const s of ["Everything you need is in this file", "¿Por qué HTML va primero?", "/v/P/_handoff/preguntas/x_respuesta.md", "420 min/day", "| Frontend | 1–22 | 2 | 1 | HTML |", "- ✓ [w3] 5.18.4 S (45 min)", "- ○ (opcional) [w4] 5.18.5 M (45 min)", "#1 2026-10-29 [applied] Organizar → 345 movidos"]) expect(md, s).toContain(s);
  });
  it("sin pregunta pide una evaluación honesta", () => {
    expect(buildDossier({ plan, question: "", answerAbs: "/x", chain: [], changes: [], today: "2026-10-29" })).toContain("honest evaluation");
  });
});

describe("parseOpsReply", () => {
  it("lee y valida el bloque json de la respuesta de la IA", () => {
    const r = parseOpsReply('Mi análisis…\n```json\n{ "ops": [ {"op":"organize"}, {"op":"extend_to","date":"2027-04-12"}, {"op":"raise_minutes","minutes":435}, {"op":"borrar_todo"}, {"op":"extend_to","date":"mañana"}, {"op":"set_area_mode","mode":"phased"} ] }\n```');
    expect(r!.ops).toEqual([{ op: "organize" }, { op: "extend_to", date: "2027-04-12" }, { op: "raise_minutes", minutes: 435 }, { op: "set_area_mode", mode: "phased" }]);
    expect(r!.discarded).toEqual(["borrar_todo", "extend_to"]);
  });
  it("sin bloque o sin ops devuelve null", () => {
    expect(parseOpsReply("sin bloque")).toBeNull();
    expect(parseOpsReply('```json\n{ "order": [] }\n```')).toBeNull();
  });
});
