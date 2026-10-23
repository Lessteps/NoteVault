// La lógica pura del enlace Notas ↔ Mentor: de la ruta de una nota al tema del plan (área, semana, día previsto, estado) y a la vista de la Ejecución.

import { describe, expect, it } from "vitest";
import { runTabOfTopic } from "../components/mentor/mentorNav";
import type { MentorPlan } from "../lib/types";
import { buildRouteSnapshot, mentorLinkOf } from "./mentorRoute";

const plan = {
  id: "p1", start: "2026-10-05", end: "2027-03-28", name: "Full stack", structure: "areas",
  preconditions: { start: "2026-10-05", end: "2027-03-28", minutesPerDay: 240, studyDays: [1, 2, 3, 4, 5, 6, 7], pace: "intenso", goalIds: [], subjects: ["Programación"], levels: {}, deliverables: "no" },
  subplans: [
    {
      id: "s1", area: "Backend", areaId: "backend", objective: "APIs", weeks: [], requiredGoals: [], phase: { fromWeek: 1, toWeek: 20 },
      groups: [{ id: "core", title: "Backend", kind: "knowledge", order: 1 }, { id: "bases", title: "Bases", kind: "bases", order: 2 }],
      topics: [
        { folder: "P/A", title: "A", estMinutes: 60, targetWeek: 1, group: "core", completedAt: "2026-10-06" },
        { folder: "P/B", title: "B", estMinutes: 60, targetWeek: 2, group: "core" },
        { folder: "P/C", title: "C", estMinutes: 60, targetWeek: 2, group: "core", route: "skipped", skippedReason: "Ya lo sabes" },
        { folder: "P/L", title: "L", estMinutes: 60, targetWeek: 1, group: "bases" },
      ],
    },
  ],
} as unknown as MentorPlan;

describe("mentorLinkOf", () => {
  const snap = buildRouteSnapshot(plan, 1);

  it("un tema pendiente trae área, semana, día previsto y estado «pendiente»", () => {
    const l = mentorLinkOf(snap, "P/B/B.practica.md")!;
    expect(l).toMatchObject({ planId: "p1", folder: "P/B", title: "B", area: "Backend", week: 2, status: "pendiente" });
    expect(l.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(l.dayInWeek).toBeGreaterThanOrEqual(1);
  });

  it("uno completado sale «hecho»; uno fuera de ruta, «fuera» y sin fecha", () => {
    expect(mentorLinkOf(snap, "P/A/nota.md")!.status).toBe("hecho");
    const out = mentorLinkOf(snap, "P/C/nota.md")!;
    expect(out.status).toBe("fuera");
    expect(out.date).toBeNull();
  });

  it("una nota de otro sitio no tiene enlace", () => {
    expect(mentorLinkOf(snap, "Inglés/x.md")).toBeNull();
  });

  it("la vista de la Ejecución es la de su área, o «bases» para los fundamentos", () => {
    expect(runTabOfTopic(mentorLinkOf(snap, "P/B/x.md")!.info)).toBe("area:s1");
    expect(mentorLinkOf(snap, "P/L/x.md")!.info.bases).toBe(true);
    expect(runTabOfTopic(mentorLinkOf(snap, "P/L/x.md")!.info)).toBe("bases");
  });
});
