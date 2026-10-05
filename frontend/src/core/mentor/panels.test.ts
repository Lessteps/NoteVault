import { describe, expect, it } from "vitest";
import { studyAreas, type StudyAreasInput } from "./panels.js";
import type { TopicSnap } from "./topics.js";

const NOW = new Date(2026, 9, 5, 12);

function snap(folder: string, over: { pct?: number; attempts?: number; last?: string | null; skills?: Record<string, { mastered: boolean; totalAttempts: number }>; exam?: string; examPassed?: boolean; subject?: string } = {}): TopicSnap {
  const skills = Object.fromEntries(
    Object.entries(over.skills ?? { a: { mastered: false, totalAttempts: 0 } }).map(([k, v]) => [k, { mastered: v.mastered, status: "x", totalAttempts: v.totalAttempts, bestScore: null }]),
  );
  return {
    folder,
    subject: over.subject ?? "mathematics",
    title: folder.split("/").pop()!,
    progress: { topic: { title: "t", subject: "mathematics", mastery: { exam: over.exam ?? "required" } }, skills, examPassed: over.examPassed ?? false, examScore: null, completenessPct: over.pct ?? 0 },
    exerciseCount: 1,
    theoryNotes: 1,
    attemptCount: over.attempts ?? 0,
    lastAttemptAt: over.last ?? null,
  };
}

const input = (over: Partial<StudyAreasInput> = {}): StudyAreasInput => ({
  lifeAreas: [{ id: "matematicas", name: "Matemáticas", icon: "∑", colour: "#123456" }],
  srsBySubject: [{ subject: "mathematics", count: 3 }],
  errorsBySubject: { mathematics: 2 },
  queue: [],
  ...over,
});

describe("studyAreas", () => {
  const snaps = [
    snap("Matemáticas/1 Aritmética/1.2 Fracciones", { pct: 50, attempts: 4, last: "2026-10-01T10:00:00", skills: { solve: { mastered: false, totalAttempts: 3 }, explain: { mastered: true, totalAttempts: 2 } } }),
    snap("Matemáticas/1 Aritmética/1.10 Potencias", { pct: 0 }),
    snap("Matemáticas/2 Álgebra/2.1 Ecuaciones", { pct: 100, attempts: 9, last: "2026-10-05T09:00:00", skills: { solve: { mastered: true, totalAttempts: 9 } }, examPassed: true }),
    snap("Matemáticas/2 Álgebra/2.2 Sistemas", { pct: 80, attempts: 6, last: "2026-10-04T09:00:00", skills: { solve: { mastered: true, totalAttempts: 6 } } }),
    snap("Inglés/Gramática/Tiempos", { pct: 20, attempts: 1, last: "2026-09-20T10:00:00", subject: "english" }),
    snap("Suelto", { subject: "general" }),
  ];

  it("agrupa por materia y por área interna, con totales y media", () => {
    const areas = studyAreas(snaps, input(), NOW);
    expect(areas.map((a) => a.id)).toEqual(["general", "Inglés", "Matemáticas"]);
    const m = areas.find((a) => a.id === "Matemáticas")!;
    expect([m.total, m.inProgress, m.untreated, m.complete]).toEqual([4, 2, 1, 1]);
    expect(m.avgPct).toBe(58);
    expect(m.groups.map((g) => g.title)).toEqual(["1 Aritmética", "2 Álgebra"]);
    // orden natural: 1.2 antes que 1.10
    expect(m.groups[0]!.topics.map((t) => t.title)).toEqual(["1.2 Fracciones", "1.10 Potencias"]);
  });

  it("estado, skills débiles, último intento y examen pendiente por tema", () => {
    const m = studyAreas(snaps, input(), NOW).find((a) => a.id === "Matemáticas")!;
    const [fr, pot] = m.groups[0]!.topics;
    expect(fr).toMatchObject({ status: "in_progress", weakSkills: ["solve"], lastAttemptDays: 4, examPending: false });
    expect(pot).toMatchObject({ status: "untreated", lastAttemptDays: null, weakSkills: [] });
    const [eq, sis] = m.groups[1]!.topics;
    expect(eq).toMatchObject({ status: "complete", lastAttemptDays: 0, examPending: false });
    expect(sis).toMatchObject({ status: "in_progress", examPending: true });
    expect(m.examPending).toBe(1);
  });

  it("hereda color e icono del área de vida por nombre y atribuye repasos, errores y siguiente paso", () => {
    const areas = studyAreas(snaps, input({ queue: [{ kind: "next_topic", subject: "mathematics", title: "Sigue con Sistemas", reason: "" }] }), NOW);
    const m = areas.find((a) => a.id === "Matemáticas")!;
    expect(m).toMatchObject({ icon: "∑", colour: "#123456", lifeArea: "matematicas", srsDue: 3, errors: 2 });
    // hay un tema a medias parado: gana al recomendador
    expect(m.next).toEqual({ kind: "continue", title: "1.2 Fracciones", folder: "Matemáticas/1 Aritmética/1.2 Fracciones" });
    const hinted = studyAreas([snap("X/Y/Z")], input({ queue: [{ kind: "next_topic", subject: "mathematics", title: "Sigue con Z", reason: "" }] }), NOW);
    expect(hinted[0]!.next).toEqual({ kind: "next_topic", title: "Sigue con Z" });
    const en = areas.find((a) => a.id === "Inglés")!;
    expect(en.lifeArea).toBe("");
    expect(en.srsDue).toBe(0);
    expect(en.colour).toMatch(/^#/);
    expect(en.next).toEqual({ kind: "continue", title: "Tiempos", folder: "Inglés/Gramática/Tiempos" });
  });

  it("un tema suelto cuelga de su materia sin grupo y sin datos devuelve lista vacía", () => {
    const g = studyAreas(snaps, input(), NOW).find((a) => a.id === "general")!;
    expect(g.groups).toEqual([expect.objectContaining({ key: "", title: "General" })]);
    expect(studyAreas([], input(), NOW)).toEqual([]);
  });
});
