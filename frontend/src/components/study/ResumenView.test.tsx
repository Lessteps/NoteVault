// @vitest-environment jsdom
//
// Area B: a `type: resumen` file shows the area's aggregated dashboard — counts,
// donut charts, per-topic progression — and offers to practise the whole area.

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { api } from "../../lib/bridge";
import type { TopicDashboardData } from "../../lib/types";
import { toOpenNote, useApp } from "../../store/app";
import { ResumenView } from "./ResumenView";

const note = toOpenNote({
  path: "Matemáticas/1 Aritmética elemental y operativa/1 Aritmética elemental y operativa.resumen.md",
  title: "1 Aritmética elemental y operativa",
  kind: "note",
  raw: "---\ntype: resumen\nscope: Matemáticas/1 Aritmética elemental y operativa\n---\n",
  frontmatter: { type: "resumen", subject: "mathematics", scope: "Matemáticas/1 Aritmética elemental y operativa" },
  modified: 1,
  bookmarked: false,
} as never);

const skill = (passes: number, attempts: number, mastered = false, cells: Record<number, [number, number]> = {}) => ({
  skill: "solve", label: "solve", status: "practicing", totalAttempts: attempts, totalPasses: passes,
  bestScore: 80, highestPassedDifficulty: 2, consolidated: false, mastered,
  cells: Object.fromEntries([1, 2, 3].map((d) => [d, { skill: "solve", difficulty: d, attempts: cells[d]?.[0] ?? 0, passes: cells[d]?.[1] ?? 0, bestScore: null }])),
});

const topic = (folder: string, title: string, pct: number, complete: boolean, skills: Record<string, unknown>) => ({
  folder, area: "1 Aritmética elemental y operativa", subject: "mathematics",
  manifest: { type: "topic", subject: "mathematics", title, skills: Object.keys(skills), mastery: { min_per_skill: 6, target_difficulty: 3, exam: "required" } },
  progress: { topic: null, skills, examPassed: false, examScore: null, isComplete: complete, completenessPct: pct, theoryNotesCount: 0, exerciseNotesCount: 0 },
});

const dashboard = {
  subjects: ["mathematics"],
  areas: ["1 Aritmética elemental y operativa"],
  topics: [
    topic("Matemáticas/1 Aritmética elemental y operativa/1.1 X", "1.1 X", 100, true, { solve: skill(6, 7, true, { 1: [2, 2], 3: [3, 3] }) }),
    topic("Matemáticas/1 Aritmética elemental y operativa/1.2 Y", "1.2 Y", 40, false, { solve: skill(2, 5, false, { 2: [5, 2] }) }),
    // Another area: it must be filtered out of this file's scope.
    topic("Matemáticas/2 Álgebra elemental e intermedia/2.1 Z", "2.1 Z", 90, false, { solve: skill(9, 9, true) }),
  ],
} as unknown as TopicDashboardData;

let container: HTMLDivElement;

function mount() {
  container = document.createElement("div");
  document.body.appendChild(container);
  act(() => {
    createRoot(container).render(<ResumenView note={note} />);
  });
}

async function settle() {
  await act(async () => {
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(api, "studyTopicDashboard").mockResolvedValue(dashboard);
  vi.spyOn(api, "studyErrorDigest").mockResolvedValue({ text: "solve: 3 fallos por signo" });
});

describe("ResumenView", () => {
  it("shows the area's aggregated numbers, not the whole vault's", async () => {
    mount();
    await settle();

    const text = container.textContent ?? "";
    expect(text).toContain("Resumen del área");
    expect(text).toContain("1 Aritmética elemental y operativa");
    // 1 of 2 topics in this area is complete; 2.1 Z (another area) is ignored.
    expect(text).toContain("1/2");
    expect(text).toContain("50%");
    expect(text).toContain("8/12"); // 6+2 passes of 7+5 attempts
    expect(text).not.toContain("2.1 Z");
  });

  it("draws donut charts and the per-topic progression", async () => {
    mount();
    await settle();

    expect(container.querySelectorAll('svg[role="img"]').length).toBeGreaterThanOrEqual(2);
    expect(container.textContent).toContain("Competencias del área");
    expect(container.textContent).toContain("Por dificultad");
    expect(container.textContent).toContain("Progresión por tema");

    const rows = [...container.querySelectorAll("li")].map((li) => li.textContent ?? "");
    expect(rows.some((r) => r.includes("1.1 X") && r.includes("100%"))).toBe(true);
    expect(rows.some((r) => r.includes("1.2 Y") && r.includes("40%"))).toBe(true);
    expect(container.textContent).toContain("Errores comunes");
  });

  it("practises the whole area: skill + difficulty → first exercise of the area", async () => {
    const sessionBuild = vi.spyOn(api, "studyAreaSessionBuild").mockResolvedValue({
      ok: true, skill: "solve", difficulty: 2, assistance: "no_help",
      target_count: 10, existing_count: 3, generated_count: 0,
      exercises: [{ id: "e1", title: "1.1-E01", path: "Matemáticas/1 Aritmética elemental y operativa/1.1 X/Ejercicios/1.1-E01.md", is_new: false }],
      first_exercise: "Matemáticas/1 Aritmética elemental y operativa/1.1 X/Ejercicios/1.1-E01.md",
    });
    const openNote = vi.spyOn(useApp.getState(), "openNote").mockResolvedValue(undefined);

    mount();
    await settle();

    const button = [...container.querySelectorAll("button")].find((b) => b.textContent?.includes("Empezar"))!;
    await act(async () => {
      button.click();
      await Promise.resolve();
    });

    expect(sessionBuild).toHaveBeenCalledWith("Matemáticas/1 Aritmética elemental y operativa", "solve", 2, "6-10", "no_help");
    expect(openNote).toHaveBeenCalledWith("Matemáticas/1 Aritmética elemental y operativa/1.1 X/Ejercicios/1.1-E01.md");
  });
});
