// Aggregating an area's overview: totals, per-skill and per-difficulty progress,
// per-topic progression. Pure maths over the dashboard data.

import { describe, expect, it } from "vitest";
import type { TopicDashboardItem } from "./types";
import { aggregateArea, folderInScope } from "./areaOverview";

function cell(difficulty: 1 | 2 | 3, attempts: number, passes: number) {
  return { skill: "solve", difficulty, attempts, passes, bestScore: passes ? 80 : null };
}

function topic(folder: string, opts: {
  title?: string; pct?: number; complete?: boolean;
  skills?: Record<string, { passes: number; attempts: number; mastered?: boolean; cells?: Record<number, [number, number]> }>;
}): TopicDashboardItem {
  const skills: Record<string, unknown> = {};
  for (const [id, s] of Object.entries(opts.skills ?? {})) {
    skills[id] = {
      skill: id, label: id, status: "practicing",
      totalAttempts: s.attempts, totalPasses: s.passes, bestScore: 80,
      highestPassedDifficulty: 2, consolidated: false, mastered: Boolean(s.mastered),
      cells: Object.fromEntries(
        [1, 2, 3].map((d) => [d, cell(d as 1 | 2 | 3, s.cells?.[d]?.[0] ?? 0, s.cells?.[d]?.[1] ?? 0)]),
      ),
    };
  }
  return {
    folder,
    area: folder.split("/")[1] ?? "",
    subject: "mathematics",
    manifest: { type: "topic", subject: "mathematics", title: opts.title ?? folder, skills: Object.keys(skills), mastery: { min_per_skill: 6, target_difficulty: 3, exam: "required" } },
    progress: {
      topic: null, skills, examPassed: false, examScore: null,
      isComplete: Boolean(opts.complete), completenessPct: opts.pct ?? 0,
      theoryNotesCount: 0, exerciseNotesCount: 0,
    },
  } as unknown as TopicDashboardItem;
}

describe("folderInScope", () => {
  it("matches the folder itself and its descendants only", () => {
    expect(folderInScope("Matemáticas/1 Aritmética/1.1 X", "Matemáticas/1 Aritmética")).toBe(true);
    expect(folderInScope("Matemáticas/1 Aritmética", "Matemáticas/1 Aritmética")).toBe(true);
    expect(folderInScope("Matemáticas/2 Álgebra/2.1 Y", "Matemáticas/1 Aritmética")).toBe(false);
    expect(folderInScope("Matemáticas/1 Aritmética II", "Matemáticas/1 Aritmética")).toBe(false);
    // An empty scope is the whole subject.
    expect(folderInScope("anything/here", "")).toBe(true);
  });
});

describe("aggregateArea", () => {
  const topics = [
    topic("Matemáticas/1 Aritmética/1.1 X", {
      title: "1.1 X", pct: 100, complete: true,
      skills: { solve: { passes: 6, attempts: 7, mastered: true, cells: { 1: [2, 2], 3: [3, 3] } }, prove: { passes: 6, attempts: 8, mastered: true } },
    }),
    topic("Matemáticas/1 Aritmética/1.2 Y", {
      title: "1.2 Y", pct: 40,
      skills: { solve: { passes: 2, attempts: 5, cells: { 2: [5, 2] } }, drill: { passes: 0, attempts: 0 } },
    }),
    topic("Matemáticas/1 Aritmética/1.3 Z", { title: "1.3 Z", pct: 0, skills: { solve: { passes: 0, attempts: 0 } } }),
  ];

  it("counts topics, completion and the student's activity", () => {
    const a = aggregateArea(topics);
    expect(a.topics).toBe(3);
    expect(a.completed).toBe(1);
    expect(a.started).toBe(2);
    expect(a.pct).toBe(33);
    expect(a.attempts).toBe(20);
    expect(a.passes).toBe(14);
  });

  it("folds skills and difficulties across the area", () => {
    const a = aggregateArea(topics);
    const solve = a.skills.find((s) => s.skill === "solve")!;
    expect(solve.attempts).toBe(12);
    expect(solve.passes).toBe(8);
    expect(solve.topics).toBe(3);
    expect(solve.mastered).toBe(1);
    // drill was never practised but still counts as a topic that trains it.
    expect(a.skills.find((s) => s.skill === "drill")?.attempts).toBe(0);

    const d1 = a.difficulties.find((d) => d.difficulty === 1)!;
    const d2 = a.difficulties.find((d) => d.difficulty === 2)!;
    const d3 = a.difficulties.find((d) => d.difficulty === 3)!;
    expect([d1.attempts, d1.passes]).toEqual([2, 2]);
    expect([d2.attempts, d2.passes]).toEqual([5, 2]);
    expect([d3.attempts, d3.passes]).toEqual([3, 3]);
  });

  it("orders the per-topic rows by progression", () => {
    const a = aggregateArea(topics);
    expect(a.topicRows.map((r) => r.title)).toEqual(["1.1 X", "1.2 Y", "1.3 Z"]);
    expect(a.topicRows[0]!.completed).toBe(true);
  });

  it("survives an empty area", () => {
    const a = aggregateArea([]);
    expect(a).toMatchObject({ topics: 0, completed: 0, pct: 0, attempts: 0, passes: 0 });
    expect(a.skills).toEqual([]);
  });
});
