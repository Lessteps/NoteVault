import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseTopicManifest } from "./topic";
import {
  discoverTopicExerciseSkills,
  inferExamGroup,
  processMathTree,
  processSingleTopic,
} from "../../../tools/generate_math_topic_manifests";

describe("generate_math_topic_manifests", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "nv-test-math-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("infers clean exam_group slugs from area names", () => {
    expect(inferExamGroup("1 Aritmética elemental y operativa")).toBe("aritmetica-elemental-y-operativa");
    expect(inferExamGroup("2 Álgebra elemental e intermedia")).toBe("algebra-elemental-e-intermedia");
    expect(inferExamGroup("3 Geometría plana y del espacio")).toBe("geometria-plana-y-del-espacio");
    expect(inferExamGroup("_piloto_logica")).toBe("piloto-logica");
  });

  it("discovers present exercise skills from exercise notes", () => {
    const topicDir = path.join(tmpDir, "1.1 Enteros");
    const ejDir = path.join(topicDir, "Ejercicios");
    fs.mkdirSync(ejDir, { recursive: true });

    fs.writeFileSync(
      path.join(ejDir, "1.1-E01.md"),
      `---\ntype: exercise\npractice: verdadero_falso\ndifficulty: 1\n---\n# E01\n`,
    );
    fs.writeFileSync(
      path.join(ejDir, "1.1-E02.md"),
      `---\ntype: exercise\npractice: encontrar_error\ndifficulty: 2\n---\n# E02\n`,
    );

    const { skills, exerciseCount } = discoverTopicExerciseSkills(topicDir);
    expect(exerciseCount).toBe(2);
    expect(skills).toContain("true_false");
    expect(skills).toContain("find_error");
  });

  it("creates a valid _tema.md manifest and does not overwrite on second run", () => {
    const topicDir = path.join(tmpDir, "1.1 Enteros");
    const ejDir = path.join(topicDir, "Ejercicios");
    fs.mkdirSync(ejDir, { recursive: true });

    fs.writeFileSync(
      path.join(ejDir, "1.1-E01.md"),
      `---\ntype: exercise\npractice: demostracion\ndifficulty: 2\n---\n# E01\n`,
    );

    const res1 = processSingleTopic(topicDir, "1 Aritmética");
    expect(res1.status).toBe("created");
    expect(fs.existsSync(res1.manifestPath)).toBe(true);

    const raw = fs.readFileSync(res1.manifestPath, "utf-8");
    const parsed = parseTopicManifest(raw);
    expect(parsed).not.toBeNull();
    expect(parsed?.subject).toBe("mathematics");
    expect(parsed?.title).toBe("1.1 Enteros");
    expect(parsed?.skills[0]).toBe("prove");

    // Second run: must skip
    const res2 = processSingleTopic(topicDir, "1 Aritmética");
    expect(res2.status).toBe("skipped");
    expect(res2.reason).toContain("already exists");
  });

  it("processes a full math tree", () => {
    const areaDir = path.join(tmpDir, "1 Aritmética");
    const topic1 = path.join(areaDir, "1.1 Suma");
    const topic2 = path.join(areaDir, "1.2 Resta");
    fs.mkdirSync(topic1, { recursive: true });
    fs.mkdirSync(topic2, { recursive: true });

    const report = processMathTree(tmpDir);
    expect(report.totalTopicsScanned).toBe(2);
    expect(report.createdCount).toBe(2);
    expect(report.errorCount).toBe(0);
    expect(fs.existsSync(path.join(topic1, "_tema.md"))).toBe(true);
    expect(fs.existsSync(path.join(topic2, "_tema.md"))).toBe(true);
  });
});
