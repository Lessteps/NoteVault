import { describe, expect, it } from "vitest";
import { computeTopicProgress, type TopicManifest, type TopicProgress } from "./topic";

export interface TestDashboardItem {
  folder: string;
  area: string;
  subject: string;
  manifest: TopicManifest;
  progress: TopicProgress;
}

describe("Aggregated Topic Progress Dashboard", () => {
  const mathTopic1: TopicManifest = {
    type: "topic",
    subject: "mathematics",
    title: "1.1 Enteros y recta numérica",
    skills: ["solve", "true_false"],
    mastery: { min_per_skill: 4, target_difficulty: 3, exam: "required" },
    exam_group: "aritmetica-elemental",
  };

  const mathTopic2: TopicManifest = {
    type: "topic",
    subject: "mathematics",
    title: "1.2 Suma y resta de enteros",
    skills: ["solve", "drill"],
    mastery: { min_per_skill: 4, target_difficulty: 3, exam: "optional" },
    exam_group: "aritmetica-elemental",
  };

  const progTopic: TopicManifest = {
    type: "topic",
    subject: "programming",
    title: "Manejo de memoria en Rust",
    skills: ["implement", "debug"],
    mastery: { min_per_skill: 4, target_difficulty: 3, exam: "required" },
    exam_group: "sistemas",
  };

  it("computes area groupings and aggregated stats across multiple subjects", () => {
    const p1 = computeTopicProgress(mathTopic1, [], {}, { passed: true, score: 90 });
    const p2 = computeTopicProgress(mathTopic2, [], {}, null);
    const p3 = computeTopicProgress(progTopic, [], {}, null);

    const items: TestDashboardItem[] = [
      {
        folder: "Matemáticas/1 Aritmética/1.1 Enteros",
        area: "1 Aritmética elemental",
        subject: "mathematics",
        manifest: mathTopic1,
        progress: p1,
      },
      {
        folder: "Matemáticas/1 Aritmética/1.2 Suma",
        area: "1 Aritmética elemental",
        subject: "mathematics",
        manifest: mathTopic2,
        progress: p2,
      },
      {
        folder: "Programación/Rust/Memoria",
        area: "Rust Avanzado",
        subject: "programming",
        manifest: progTopic,
        progress: p3,
      },
    ];

    expect(items.length).toBe(3);

    const mathTopics = items.filter((i) => i.subject === "mathematics");
    expect(mathTopics.length).toBe(2);

    const progTopics = items.filter((i) => i.subject === "programming");
    expect(progTopics.length).toBe(1);

    const aritmeticaTopics = items.filter((i) => i.area === "1 Aritmética elemental");
    expect(aritmeticaTopics.length).toBe(2);

    const drillTopics = items.filter((i) => i.manifest.skills.includes("drill"));
    expect(drillTopics.length).toBe(1);
    expect(drillTopics[0]?.manifest.title).toBe("1.2 Suma y resta de enteros");

    const examsPassed = items.filter((i) => i.progress.examPassed).length;
    expect(examsPassed).toBe(1);
    expect(items[0]?.progress.examScore).toBe(90);
  });
});
