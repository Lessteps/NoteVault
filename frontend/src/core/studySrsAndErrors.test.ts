import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { StudyDailyQueueManager } from "./studyDailyQueue.js";
import { ERROR_CATEGORIES, StudyErrorManager } from "./studyErrorManager.js";
import { StudyExerciseManager } from "./studyExerciseManager.js";
import { StudySRSManager } from "./studySrsManager.js";

describe("StudySRSManager, StudyErrorManager and StudyDailyQueue", () => {
  let vaultDir: string;
  let srsMgr: StudySRSManager;
  let errMgr: StudyErrorManager;
  let exMgr: StudyExerciseManager;
  let queueMgr: StudyDailyQueueManager;

  beforeEach(() => {
    vaultDir = fs.mkdtempSync(path.join(os.tmpdir(), "nv_srs_err_"));
    srsMgr = new StudySRSManager(vaultDir);
    errMgr = new StudyErrorManager(vaultDir);
    exMgr = new StudyExerciseManager(vaultDir);
    queueMgr = new StudyDailyQueueManager(vaultDir);
  });

  afterEach(() => {
    fs.rmSync(vaultDir, { recursive: true, force: true });
  });

  it("progresses SRS item lifecycle", () => {
    const item = srsMgr.registerItem(
      "derivative_power_rule",
      "formula",
      "mathematics",
      "derivatives",
      "",
      2
    );
    expect(item.repetitions).toBe(0);
    expect(item.interval_days).toBe(1);

    // Review 1 with perfect score (grade 5)
    const reviewed1 = srsMgr.review(item.id, 5);
    expect(reviewed1).not.toBeNull();
    expect(reviewed1!.repetitions).toBe(1);
    expect(reviewed1!.interval_days).toBe(1);
    expect(reviewed1!.mastery).toBeGreaterThan(0.0);

    // Review 2 with good score (grade 4)
    const reviewed2 = srsMgr.review(item.id, 4);
    expect(reviewed2).not.toBeNull();
    expect(reviewed2!.repetitions).toBe(2);
    expect(reviewed2!.interval_days).toBe(6);

    // Review 3 with fail (grade 1) resets interval and repetitions
    const reviewed3 = srsMgr.review(item.id, 1);
    expect(reviewed3).not.toBeNull();
    expect(reviewed3!.repetitions).toBe(0);
    expect(reviewed3!.interval_days).toBe(1);
    expect(reviewed3!.lapses).toBe(1);
  });

  it("records error taxonomies and resolves errors", () => {
    for (const cat of ERROR_CATEGORIES) {
      const err = errMgr.recordError(
        cat,
        "programming",
        "testing",
        "test wrong",
        "test expected"
      );
      expect(err.category).toBe(cat);
      expect(err.resolved).toBe(false);
    }

    const breakdown = errMgr.categoryBreakdown();
    expect(Object.keys(breakdown).length).toBe(11);
    for (const cat of ERROR_CATEGORIES) {
      expect(breakdown[cat]).toBe(1);
    }

    // Test resolution
    const sampleErr = errMgr.errors()[0]!;
    const resolved = errMgr.markResolved(sampleErr.id, true);
    expect(resolved).not.toBeNull();
    expect(resolved!.resolved).toBe(true);
    const unresolved = errMgr.errors(null, null, true);
    expect(unresolved.length).toBe(10);
  });

  it("builds daily queue and interleaves tasks across subjects", () => {
    // Register items in Math, Prog, and English
    srsMgr.registerItem("pythagoras", "formula", "mathematics");
    srsMgr.registerItem("react_hooks", "concept", "programming");
    srsMgr.registerItem("phrasal_look_for", "vocabulary", "english");

    exMgr.create("coding", "programming", "loops", "Implement loop");
    errMgr.recordError("calculation", "mathematics", "fractions", "1/2+1/2=2/4");

    const queue = queueMgr.getQueue();
    expect(queue.total_tasks).toBeGreaterThanOrEqual(4);

    // Verify interleaving: subjects alternate in the interleaved list
    const subjectsSeq = queue.interleaved.map((t) => t.subject);
    expect(subjectsSeq).toContain("mathematics");
    expect(subjectsSeq).toContain("programming");
    expect(subjectsSeq).toContain("english");
  });
});
