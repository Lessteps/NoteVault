import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ExerciseRef } from "./exerciseIndex";
import {
  assembleGroupedExam,
  assembleTopicExam,
  type ExamExerciseItem,
  type ExamGrader,
  gradeAndAggregateExam,
  isExamPassed,
  isTopicExamPassed,
  loadExamRecord,
  loadExamRecordForTopic,
  saveExamRecord,
} from "./exams";
import { computeTopicProgress, type TopicManifest } from "./topic";

function makeExRef(partial: Partial<ExerciseRef> & { note_id: string; title: string; mode: string; difficulty: number }): ExerciseRef {
  return {
    subject: "mathematics",
    discipline: "math",
    skill: partial.mode,
    concept: "mat.test",
    chapter: "01",
    chapter_title: "Test",
    integration: false,
    path: `${partial.note_id}.md`,
    rel: `${partial.note_id}.md`,
    ...partial,
  };
}

describe("Exam System", () => {
  let tmpVault: string;

  beforeEach(() => {
    tmpVault = fs.mkdtempSync(path.join(os.tmpdir(), "nv-test-exams-"));
  });

  afterEach(() => {
    fs.rmSync(tmpVault, { recursive: true, force: true });
  });

  const sampleTopic: TopicManifest = {
    type: "topic",
    subject: "mathematics",
    title: "1.1 Números enteros y racionales",
    skills: ["solve", "true_false", "find_error"],
    mastery: {
      min_per_skill: 4,
      target_difficulty: 3,
      exam: "required",
    },
    exam_group: "aritmetica-basica",
  };

  const sampleExercises: ExerciseRef[] = [
    makeExRef({
      note_id: "ex-solve-3",
      title: "Problema avanzado de enteros",
      mode: "solve",
      difficulty: 3,
    }),
    makeExRef({
      note_id: "ex-tf-2",
      title: "Verdadero o falso intermedio",
      mode: "true_false",
      difficulty: 2, // lower difficulty fallback
    }),
  ];

  it("assembles a topic exam covering all declared skills at target difficulty", async () => {
    const session = await assembleTopicExam(sampleTopic, sampleExercises, {
      targetDifficulty: 3,
      timeLimitMinutesPerItem: 10,
    });

    expect(session.isGrouped).toBe(false);
    expect(session.topicOrGroup).toBe(sampleTopic.title);
    expect(session.items.length).toBe(3); // solve, true_false, find_error

    // solve should pick the exact difficulty 3 exercise
    const solveItem = session.items.find((i) => i.skill === "solve");
    expect(solveItem?.id).toBe("ex-solve-3");
    expect(solveItem?.difficulty).toBe(3);

    // true_false should pick difficulty 2 as best available fallback
    const tfItem = session.items.find((i) => i.skill === "true_false");
    expect(tfItem?.id).toBe("ex-tf-2");

    // find_error had no existing exercise, so a synthetic fallback was created
    const feItem = session.items.find((i) => i.skill === "find_error");
    expect(feItem).toBeDefined();
    expect(feItem?.isNew).toBe(true);

    expect(session.timeLimitMinutes).toBe(30);
    expect(session.assistance).toBe("no_help");
  });

  it("assembles a grouped exam spanning multiple topics", async () => {
    const topic2: TopicManifest = {
      type: "topic",
      subject: "mathematics",
      title: "1.2 Suma y resta de enteros",
      skills: ["solve", "drill"],
      mastery: {
        min_per_skill: 4,
        target_difficulty: 3,
        exam: "required",
      },
      exam_group: "aritmetica-basica",
    };

    const topicMap = new Map<string, ExerciseRef[]>([
      [sampleTopic.title, sampleExercises],
      [
        topic2.title,
        [
          makeExRef({
            note_id: "ex-drill-3",
            title: "Cálculo rápido de sumas",
            mode: "drill",
            difficulty: 3,
          }),
        ],
      ],
    ]);

    const session = await assembleGroupedExam(
      "aritmetica-basica",
      [sampleTopic, topic2],
      topicMap,
    );

    expect(session.isGrouped).toBe(true);
    expect(session.topicOrGroup).toBe("aritmetica-basica");
    expect(session.topics.length).toBe(2);
    expect(session.items.length).toBe(5);
  });

  it("grades, aggregates verdicts, and records passed exam", async () => {
    const session = await assembleTopicExam(sampleTopic, sampleExercises);

    const stubGrader: ExamGrader = async (item: ExamExerciseItem) => {
      return {
        score: item.skill === "solve" ? 90 : item.skill === "true_false" ? 85 : 80,
        passed: true,
        feedback: "Excelente argumentación y rigor.",
      };
    };

    const submissions = session.items.map((it) => ({
      itemId: it.id,
      answerText: "Respuesta detallada paso a paso",
    }));

    const { record, itemResults } = await gradeAndAggregateExam(
      session,
      submissions,
      stubGrader,
      tmpVault,
    );

    expect(record.passed).toBe(true);
    expect(record.score).toBeGreaterThanOrEqual(80);
    expect(record.skills.solve?.passed).toBe(true);
    expect(record.skills.true_false?.passed).toBe(true);
    expect(record.skills.find_error?.passed).toBe(true);
    expect(itemResults.length).toBe(3);

    // Verify storage
    const loaded = loadExamRecord(tmpVault, sampleTopic.title);
    expect(loaded).not.toBeNull();
    expect(loaded?.passed).toBe(true);
    expect(isExamPassed(tmpVault, sampleTopic.title)).toBe(true);
    expect(isTopicExamPassed(tmpVault, sampleTopic)).toBe(true);
  });

  it("grades failing exam when a skill fails below threshold", async () => {
    const session = await assembleTopicExam(sampleTopic, sampleExercises);

    const failingGrader: ExamGrader = async (item: ExamExerciseItem) => {
      if (item.skill === "find_error") {
        return { score: 30, passed: false, feedback: "No identificó el error" };
      }
      return { score: 85, passed: true, feedback: "Buen trabajo" };
    };

    const submissions = session.items.map((it) => ({
      itemId: it.id,
      answerText: "Respuesta",
    }));

    const { record } = await gradeAndAggregateExam(
      session,
      submissions,
      failingGrader,
      tmpVault,
    );

    expect(record.passed).toBe(false);
    expect(record.skills.find_error?.passed).toBe(false);
    expect(isExamPassed(tmpVault, sampleTopic.title)).toBe(false);
  });

  it("propagates passed grouped exam to constituent topics", async () => {
    const topic2: TopicManifest = {
      type: "topic",
      subject: "mathematics",
      title: "1.2 Suma y resta de enteros",
      skills: ["solve"],
      mastery: {
        min_per_skill: 4,
        target_difficulty: 3,
        exam: "required",
      },
      exam_group: "aritmetica-basica",
    };

    const topicMap = new Map<string, ExerciseRef[]>([
      [sampleTopic.title, sampleExercises],
      [topic2.title, []],
    ]);

    const session = await assembleGroupedExam(
      "aritmetica-basica",
      [sampleTopic, topic2],
      topicMap,
    );

    const perfectGrader: ExamGrader = async () => ({
      score: 95,
      passed: true,
      feedback: "Perfecto",
    });

    const submissions = session.items.map((it) => ({
      itemId: it.id,
      answerText: "Respuesta perfecta",
    }));

    const { record } = await gradeAndAggregateExam(
      session,
      submissions,
      perfectGrader,
      tmpVault,
    );

    expect(record.passed).toBe(true);

    expect(isExamPassed(tmpVault, "aritmetica-basica")).toBe(true);

    expect(loadExamRecordForTopic(tmpVault, sampleTopic)?.passed).toBe(true);
    expect(loadExamRecordForTopic(tmpVault, topic2)?.passed).toBe(true);
    expect(isTopicExamPassed(tmpVault, sampleTopic)).toBe(true);
    expect(isTopicExamPassed(tmpVault, topic2)).toBe(true);
  });

  it("flips topic completeness from false to true upon passing the exam", () => {
    const attempts: Record<string, any> = {
      "ex-solve": {
        attempts: [
          { verdict: "correct", solution_seen: false, score: 90, difficulty: 3 },
          { verdict: "correct", solution_seen: false, score: 95, difficulty: 3 },
          { verdict: "correct", solution_seen: false, score: 85, difficulty: 3 },
          { verdict: "correct", solution_seen: false, score: 92, difficulty: 3 },
        ],
      },
      "ex-tf": {
        attempts: [
          { verdict: "correct", solution_seen: false, score: 90, difficulty: 3 },
          { verdict: "correct", solution_seen: false, score: 95, difficulty: 3 },
          { verdict: "correct", solution_seen: false, score: 85, difficulty: 3 },
          { verdict: "correct", solution_seen: false, score: 92, difficulty: 3 },
        ],
      },
    };

    const simpleTopic: TopicManifest = {
      type: "topic",
      subject: "mathematics",
      title: "Tema prueba",
      skills: ["solve", "true_false"],
      mastery: {
        min_per_skill: 4,
        target_difficulty: 3,
        exam: "required",
      },
    };

    const topicExercises: ExerciseRef[] = [
      makeExRef({ note_id: "ex-solve", title: "Solve", mode: "solve", difficulty: 3 }),
      makeExRef({ note_id: "ex-tf", title: "TF", mode: "true_false", difficulty: 3 }),
    ];

    // 1. Before exam: skills mastered, but exam not passed -> isComplete = false
    const progressBefore = computeTopicProgress(simpleTopic, topicExercises, attempts, null);
    expect(progressBefore.examPassed).toBe(false);
    expect(progressBefore.isComplete).toBe(false);
    expect(progressBefore.completenessPct).toBeLessThan(100);

    // 2. Pass and save exam record
    saveExamRecord(tmpVault, {
      id: "exam-1",
      topic_or_group: simpleTopic.title,
      passed: true,
      score: 95,
      skills: {
        solve: { passed: true, score: 95 },
        true_false: { passed: true, score: 95 },
      },
      created_at: new Date().toISOString(),
      duration_seconds: 1200,
    });

    const examRec = loadExamRecord(tmpVault, simpleTopic.title);
    expect(examRec?.passed).toBe(true);

    // 3. After exam: isComplete flips to true, completenessPct reaches 100%!
    const progressAfter = computeTopicProgress(simpleTopic, topicExercises, attempts, examRec);
    expect(progressAfter.examPassed).toBe(true);
    expect(progressAfter.isComplete).toBe(true);
    expect(progressAfter.completenessPct).toBe(100);
  });
});
