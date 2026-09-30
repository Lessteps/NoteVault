import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { listReviews, recordTopicPractice } from "./reviewFiles";

let root: string;
let exercise: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "nv_review_"));
  const topic = path.join(root, "Matemáticas", "1 Aritmética", "1.1 Números");
  fs.mkdirSync(path.join(topic, "Ejercicios", "solve"), { recursive: true });
  fs.writeFileSync(path.join(topic, "_tema.md"), '---\ntype: topic\nsubject: mathematics\ntitle: "1.1 Números"\nskills: [solve, prove]\n---\n', "utf-8");
  exercise = path.join(topic, "Ejercicios", "solve", "ej1.md");
  fs.writeFileSync(exercise, "---\ntype: exercise\n---\n", "utf-8");
});

describe("review notes", () => {
  it("creates one note per topic and merges every skill into the same practice day", () => {
    const day = new Date(2026, 8, 29, 10);
    const rel = recordTopicPractice(root, exercise, { skill: "solve", passed: true, now: day });
    expect(rel).toBe("Matemáticas/Repaso/1.1 Números.md");
    recordTopicPractice(root, exercise, { skill: "prove", passed: false, now: day });

    const text = fs.readFileSync(path.join(root, ...rel!.split("/")), "utf-8");
    expect(text).toContain("next_review: 2026-10-02");
    expect(text).toContain("| 2026-09-29 | solve, prove | 2 | 1 |");

    const list = listReviews(root, "2026-10-02");
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ topic: "1.1 Números", next: "2026-10-02", inDays: 0, skills: ["solve", "prove"], subjectFolder: "Matemáticas" });
  });

  it("ignores an exercise that is not inside a topic", () => {
    const loose = path.join(root, "Suelta", "ej.md");
    fs.mkdirSync(path.dirname(loose), { recursive: true });
    fs.writeFileSync(loose, "x", "utf-8");
    expect(recordTopicPractice(root, loose, { skill: "solve", passed: true })).toBeNull();
    expect(listReviews(root)).toEqual([]);
  });
});
