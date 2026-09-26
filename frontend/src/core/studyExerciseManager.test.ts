import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EXERCISE_TYPES, StudyExerciseManager } from "./studyExerciseManager.js";

describe("StudyExerciseManager", () => {
  let vaultDir: string;
  let mgr: StudyExerciseManager;

  beforeEach(() => {
    vaultDir = fs.mkdtempSync(path.join(os.tmpdir(), "nv_study_ex_"));
    mgr = new StudyExerciseManager(vaultDir);
  });

  afterEach(() => {
    fs.rmSync(vaultDir, { recursive: true, force: true });
  });

  it("creates and retrieves an exercise", () => {
    const ex = mgr.create(
      "coding",
      "programming",
      "arrays",
      "Implementa una función para invertir un array in-place.",
      "def reverse(arr): arr.reverse()",
      3,
      2,
      "problem_decomposition",
      "Programación/Arrays.md"
    );
    expect(ex.id.startsWith("ex_")).toBe(true);
    expect(ex.type).toBe("coding");
    expect(ex.subject).toBe("programming");
    expect(ex.difficulty).toBe(3);
    expect(ex.status).toBe("pending");

    const retrieved = mgr.get(ex.id);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.prompt).toBe(ex.prompt);
  });

  it("allows all 11 exercise types", () => {
    for (const t of EXERCISE_TYPES) {
      const ex = mgr.create(t, "general", "test", `Test for ${t}`);
      expect(ex.type).toBe(t);
    }
  });

  it("filters exercises by subject and topic", () => {
    mgr.create("recall", "mathematics", "calculus", "P1");
    mgr.create("problem_solving", "mathematics", "algebra", "P2");
    mgr.create("coding", "programming", "python", "P3");

    const mathAll = mgr.exercises("mathematics");
    expect(mathAll.length).toBe(2);

    const progAll = mgr.exercises("programming");
    expect(progAll.length).toBe(1);

    const calc = mgr.exercises(null, "calculus");
    expect(calc.length).toBe(1);
  });

  it("records attempt lifecycle and updates stats", () => {
    const ex = mgr.create("recall", "english", "verbs", "What is the past of go?");
    // First attempt: failed
    mgr.recordAttempt(ex.id, "goed", false, 0.0, "grammar");
    const updated1 = mgr.get(ex.id);
    expect(updated1).not.toBeNull();
    expect(updated1!.attempts_count).toBe(1);
    expect(updated1!.success_rate).toBe(0.0);
    expect(updated1!.status).toBe("failed");

    // Second attempt: correct
    mgr.recordAttempt(ex.id, "went", true, 1.0);
    const updated2 = mgr.get(ex.id);
    expect(updated2).not.toBeNull();
    expect(updated2!.attempts_count).toBe(2);
    expect(updated2!.success_rate).toBe(0.5);
    expect(updated2!.status).toBe("completed");
    expect(updated2!.history.length).toBe(2);
  });
});
