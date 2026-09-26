import { describe, expect, it } from "vitest";
import {
  computeTopicProgress,
  createDefaultTopicManifest,
  isTheoreticalTopic,
  parseTopicManifest,
  serializeTopicManifest,
  type TopicManifest,
} from "./topic";
import type { ExerciseRef } from "./exerciseIndex";

describe("Topic Model", () => {
  it("parses topic manifest from frontmatter text", () => {
    const raw = `---
type: topic
subject: mathematics
title: "1.1 Números enteros y racionales"
skills: [solve, process, true_false, counterexample, find_error, drill]
mastery:
  min_per_skill: 6
  target_difficulty: 3
  exam: required
exam_group: "aritmetica-basica"
---

# 1.1 Números enteros y racionales
`;
    const manifest = parseTopicManifest(raw);
    expect(manifest).not.toBeNull();
    expect(manifest?.subject).toBe("mathematics");
    expect(manifest?.title).toBe("1.1 Números enteros y racionales");
    expect(manifest?.skills).toEqual([
      "solve",
      "process",
      "true_false",
      "counterexample",
      "find_error",
      "drill",
    ]);
    expect(manifest?.mastery.min_per_skill).toBe(6);
    expect(manifest?.mastery.target_difficulty).toBe(3);
    expect(manifest?.mastery.exam).toBe("required");
    expect(manifest?.exam_group).toBe("aritmetica-basica");
  });

  it("recognizes tag: tema as a topic manifest", () => {
    const raw = `---
tag: tema
subject: programming
title: "Manejo de memoria en C"
skills: [implement, debug, refactor]
---
`;
    const manifest = parseTopicManifest(raw);
    expect(manifest).not.toBeNull();
    expect(manifest?.subject).toBe("programming");
    expect(manifest?.title).toBe("Manejo de memoria en C");
    expect(manifest?.skills).toEqual(["implement", "debug", "refactor"]);
    expect(manifest?.mastery.min_per_skill).toBe(6);
    expect(manifest?.mastery.target_difficulty).toBe(3);
  });

  it("returns null for non-topic notes", () => {
    const note = `---
title: "Nota normal"
tags: [apuntes]
---
Contenido`;
    expect(parseTopicManifest(note)).toBeNull();
  });

  it("serializes and round-trips topic manifest", () => {
    const original: TopicManifest = {
      type: "topic",
      subject: "mathematics",
      title: "Espacios vectoriales",
      skills: ["prove", "solve", "counterexample"],
      mastery: {
        min_per_skill: 5,
        target_difficulty: 3,
        exam: "required",
      },
      exam_group: "algebra-lineal",
    };

    const text = serializeTopicManifest(original);
    expect(text).toContain("type: topic");
    expect(text).toContain("Espacios vectoriales");

    const parsed = parseTopicManifest(text);
    expect(parsed).toEqual(original);
  });

  it("identifies theoretical vs practical topics", () => {
    const theo: TopicManifest = {
      type: "topic",
      subject: "mathematics",
      title: "Topología básica",
      skills: ["prove", "explain", "counterexample", "true_false"],
      mastery: { min_per_skill: 4, target_difficulty: 3, exam: "required" },
    };
    expect(isTheoreticalTopic(theo)).toBe(true);

    const pract: TopicManifest = {
      type: "topic",
      subject: "mathematics",
      title: "Integrales inmediatas",
      skills: ["solve", "process", "drill"],
      mastery: { min_per_skill: 6, target_difficulty: 3, exam: "required" },
    };
    expect(isTheoreticalTopic(pract)).toBe(false);
  });

  it("creates default topic manifest for a folder", () => {
    const manifest = createDefaultTopicManifest("Calculo/01 Limites", "01 Límites", "mathematics");
    expect(manifest.type).toBe("topic");
    expect(manifest.subject).toBe("mathematics");
    expect(manifest.title).toBe("01 Límites");
    expect(manifest.skills.length).toBeGreaterThan(0);
    expect(manifest.skills).toContain("solve");
    expect(manifest.mastery.target_difficulty).toBe(3);
  });

  it("computes skill x difficulty progress matrix and completeness", () => {
    const topic: TopicManifest = {
      type: "topic",
      subject: "mathematics",
      title: "Derivadas",
      skills: ["solve", "process"],
      mastery: {
        min_per_skill: 2,
        target_difficulty: 3,
        exam: "required",
      },
    };

    const exercises: ExerciseRef[] = [
      {
        path: "/vault/ex1.md",
        rel: "Derivadas/ex1.md",
        note_id: "ex_solve_diff1",
        title: "Derivada básica",
        subject: "mathematics",
        discipline: "math_calculus",
        skill: "",
        mode: "solve",
        difficulty: 1,
        concept: "",
        chapter: "",
        chapter_title: "",
        integration: false,
      },
      {
        path: "/vault/ex2.md",
        rel: "Derivadas/ex2.md",
        note_id: "ex_solve_diff3",
        title: "Regla de la cadena",
        subject: "mathematics",
        discipline: "math_calculus",
        skill: "",
        mode: "solve",
        difficulty: 3,
        concept: "",
        chapter: "",
        chapter_title: "",
        integration: false,
      },
      {
        path: "/vault/ex3.md",
        rel: "Derivadas/ex3.md",
        note_id: "ex_process_diff3",
        title: "Procedimiento de optimización",
        subject: "mathematics",
        discipline: "math_calculus",
        skill: "",
        mode: "process",
        difficulty: 3,
        concept: "",
        chapter: "",
        chapter_title: "",
        integration: false,
      },
    ];

    // Scenario A: No attempts
    const p0 = computeTopicProgress(topic, exercises, {});
    expect(p0.isComplete).toBe(false);
    expect(p0.completenessPct).toBe(0);
    expect(p0.skills["solve"]?.status).toBe("not_started");
    expect(p0.skills["process"]?.status).toBe("not_started");

    // Scenario B: Passed solve at diff 1 and diff 3 (2 passes, highest diff 3 -> solve mastered!)
    // But process not attempted, exam not passed.
    const attempts = {
      ex_solve_diff1: {
        attempts: [{ verdict: "correct", score: 100, at: "2026-09-01" }],
      },
      ex_solve_diff3: {
        attempts: [{ verdict: "correct", score: 90, at: "2026-09-02" }],
      },
    };

    const p1 = computeTopicProgress(topic, exercises, attempts);
    expect(p1.skills["solve"]?.consolidated).toBe(true);
    expect(p1.skills["solve"]?.mastered).toBe(true);
    expect(p1.skills["solve"]?.highestPassedDifficulty).toBe(3);
    expect(p1.skills["solve"]?.cells[1]?.passes).toBe(1);
    expect(p1.skills["solve"]?.cells[3]?.passes).toBe(1);
    expect(p1.skills["process"]?.mastered).toBe(false);
    expect(p1.isComplete).toBe(false);
    // 1 of 3 units complete (2 skills + 1 exam = 3 units) -> 33%
    expect(p1.completenessPct).toBe(33);

    // Scenario C: Both skills mastered, but exam not passed -> 67%
    const attemptsBoth = {
      ...attempts,
      ex_process_diff3: {
        attempts: [
          { verdict: "correct", score: 85, at: "2026-09-03" },
          { verdict: "correct", score: 95, at: "2026-09-04" },
        ],
      },
    };
    const p2 = computeTopicProgress(topic, exercises, attemptsBoth, { passed: false });
    expect(p2.skills["process"]?.mastered).toBe(true);
    expect(p2.isComplete).toBe(false);
    expect(p2.completenessPct).toBe(67);

    // Scenario D: Both skills mastered AND exam passed -> Complete 100%!
    const p3 = computeTopicProgress(topic, exercises, attemptsBoth, { passed: true, score: 92 });
    expect(p3.isComplete).toBe(true);
    expect(p3.completenessPct).toBe(100);
    expect(p3.examPassed).toBe(true);
    expect(p3.examScore).toBe(92);
  });
});
