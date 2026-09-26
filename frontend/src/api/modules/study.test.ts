import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ApiError } from "../../core/errors.js";
import { StudyErrorManager } from "../../core/studyErrorManager.js";
import { AppState } from "../appState.js";
import { studyApi } from "./study.js";

const ROOT = path.resolve(__dirname, "../../../..");
const MATH = path.join(ROOT, "docs", "knowledge_base", "examples", "Matemáticas");

function findExercise(dir: string): string {
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const ent of fs.readdirSync(cur, { withFileTypes: true })) {
      const full = path.join(cur, ent.name);
      if (ent.isDirectory()) {
        stack.push(full);
      } else if (ent.isFile() && ent.name.startsWith("1.10-E01") && ent.name.endsWith(".md")) {
        return full;
      }
    }
  }
  throw new Error("1.10-E01 exercise note not found");
}

describe("studyApi", () => {
  let tmpDir: string;
  let app: AppState;
  let api: ReturnType<typeof studyApi>;
  let rel: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "nv_study_web_"));
    fs.cpSync(MATH, path.join(tmpDir, "Matemáticas"), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, "Suelta.md"), "# nada\n", "utf-8");

    app = new AppState(tmpDir);
    api = studyApi(app);

    const exPath = findExercise(path.join(tmpDir, "Matemáticas"));
    rel = path.relative(tmpDir, exPath).split(path.sep).join("/");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("test_area", () => {
    const area = api.study_area(rel);
    expect(area).not.toBeNull();
    expect(area!.subject).toBe("mathematics");
    expect(area!.title).toBe("1 Lógica y demostración");

    expect(api.study_area("Suelta.md")).toBeNull();
    expect(() => api.study_snapshot("Suelta.md")).toThrow(ApiError);
  });

  it("test_snapshot_queue_and_ledger", () => {
    const snap = api.study_snapshot(rel) as Record<string, any>;
    JSON.stringify(snap);
    expect(snap.exercises).toBeGreaterThan(0);
    expect(snap.queue.items.length).toBeGreaterThan(0);

    const first = snap.queue.items.find((i: any) => i.exercise);
    expect(first).toBeDefined();
    expect(fs.existsSync(path.join(tmpDir, first.exercise.path))).toBe(true);
    expect(snap.ledgers[0].skills.length).toBeGreaterThan(0);
  });

  it("test_errors_can_be_resolved", () => {
    const errMgr = new StudyErrorManager(tmpDir);
    errMgr.recordError(
      "logical",
      "mathematics",
      "1.10",
      "x",
      "No.",
      "Circular.",
      rel,
      "1.10-E01",
      {
        discipline: "pure_mathematics",
        skill: "1.10",
        mode: "solve",
        description_en: "Circular.",
        fix_en: "No.",
        note_id: "1.10-E01",
      },
    );

    const snapshot = api.study_snapshot(rel) as Record<string, any>;
    const errors = snapshot.errors;
    expect(errors).toHaveLength(1);
    expect(errors[0].source).toBe(rel);

    api.study_error_resolve(errors[0].id);
    const snapshotAfter = api.study_snapshot(rel) as Record<string, any>;
    expect(snapshotAfter.errors).toHaveLength(0);

    const digest = api.study_error_digest();
    expect(digest.text).toContain("No unresolved errors");

    expect(() => api.study_card_grade("nope", 4)).toThrow(ApiError);
    expect(() => api.study_card_grade("nope", 9)).toThrow(ApiError);
  });

  it("test_create_folders_without_overwriting", () => {
    const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), "nv_studyf_"));
    try {
      const emptyApp = new AppState(emptyDir);
      const emptyApi = studyApi(emptyApp);

      const initialFolders = emptyApi.study_folders() as Array<Record<string, any>>;
      expect(initialFolders.some((f) => f.exists)).toBe(false);

      const out = emptyApi.study_folder_create("mathematics") as Record<string, any>;
      expect(out.created).toBe(true);

      const indexPath = path.join(emptyDir, out.index);
      fs.writeFileSync(indexPath, "mío", "utf-8");

      const again = emptyApi.study_folder_create("mathematics") as Record<string, any>;
      expect(again.created).toBe(false);
      expect(fs.readFileSync(indexPath, "utf-8")).toBe("mío");

      const foldersAfter = emptyApi.study_folders() as Array<Record<string, any>>;
      const mathFolder = foldersAfter.find((f) => f.id === "mathematics");
      expect(mathFolder?.exists).toBe(true);

      const area = emptyApi.study_area(out.index);
      expect(area?.subject).toBe("mathematics");

      expect(() => emptyApi.study_folder_create("../x")).toThrow(ApiError);
    } finally {
      fs.rmSync(emptyDir, { recursive: true, force: true });
    }
  });
});
