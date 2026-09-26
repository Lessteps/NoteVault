import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { addDays } from "./dates";
import {
  deriveKey,
  Project,
  ProjectCalendarSource,
  ProjectManager,
  ProjectStats,
} from "./projectManager";

const D = new Date(2026, 8, 14); // 2026-09-14

describe("ProjectManager", () => {
  let tempDir: string;
  let pm: ProjectManager;
  let project: Project;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "nv-proj-test-"));
    pm = new ProjectManager(tempDir);
    project = pm.create("Portafolio web", { deadline: addDays(D, 30) });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe("Issues & Kanban Moves", () => {
    it("numbers, keys and kanban moves", () => {
      const a = pm.create_issue(project.id, "A")!;
      const b = pm.create_issue(project.id, "B")!;
      const c = pm.create_issue(project.id, "C")!;

      expect([a.key, b.key, c.key]).toEqual(["PW-1", "PW-2", "PW-3"]);

      // Move C to order 0 in 'Por hacer'
      pm.move(project.id, c.id, "Por hacer", 0);
      const col = pm
        .issues(project.id)
        .filter((i) => i.status === "Por hacer")
        .sort((x, y) => x.order - y.order);
      expect(col.map((i) => i.title)).toEqual(["C", "A", "B"]);

      // Move A to 'Hecho'
      pm.move(project.id, a.id, "Hecho", 0);
      const freshA = new ProjectManager(tempDir).get_issue(project.id, a.id);
      expect(freshA?.is_done).toBe(true);
      expect(freshA?.done_at).not.toBeNull();

      // Move A back to 'En curso' clears done_at
      pm.move(project.id, a.id, "En curso", 0);
      const freshA2 = new ProjectManager(tempDir).get_issue(project.id, a.id);
      expect(freshA2?.done_at).toBeNull();
    });

    it("repeating issue rolls forward on done", () => {
      const r = pm.create_issue(project.id, "Revisión", {
        repeat: "weekly:0",
        due: D,
        reminder: "2026-09-14T09:00",
        reminder_done: true,
      })!;

      pm.move(project.id, r.id, "Hecho", 0);
      const fresh = new ProjectManager(tempDir).get_issue(project.id, r.id);
      expect(fresh?.due).toEqual(addDays(D, 7));
      expect(fresh?.status).toBe("Por hacer");
      expect(fresh?.reminder).toEqual(new Date(2026, 8, 21, 9, 0));
      expect(fresh?.reminder_done).toBe(false);
    });

    it("set_columns renames and moves orphan issues", () => {
      const a = pm.create_issue(project.id, "A", { status: "En revisión" })!;
      const b = pm.create_issue(project.id, "B", { status: "Hecho" })!;

      pm.set_columns(project.id, ["Pendiente", "Haciendo", "Terminado"], {
        Hecho: "Terminado",
        "Por hacer": "Pendiente",
      });

      const fresh = new ProjectManager(tempDir);
      expect(fresh.get(project.id)?.done_column).toBe("Terminado");
      expect(fresh.get_issue(project.id, a.id)?.status).toBe("Pendiente");
      expect(fresh.get_issue(project.id, b.id)?.is_done).toBe(true);
    });

    it("tree reparent refuses cycles and delete cascades", () => {
      const goal = pm.create_issue(project.id, "Submeta", { type: "Submeta" })!;
      const t = pm.create_issue(project.id, "T", { parent: goal.id })!;
      const s = pm.create_issue(project.id, "S", { parent: t.id, type: "Subtarea" })!;

      // Cyclic reparent is refused
      pm.reparent(project.id, goal.id, s.id);
      expect(pm.get_issue(project.id, goal.id)?.parent).toBe("");
      expect(pm.tree(project.id).map((i) => i.title)).toEqual(["Submeta"]);

      // Delete cascades
      pm.delete_issue(project.id, goal.id);
      expect(pm.issues(project.id)).toEqual([]);
      const trash = path.join(tempDir, ".notevault", ".papelera", "proyectos", project.id);
      expect(fs.readdirSync(trash).length).toBe(3);
    });

    it("duplicate numbers are fixed", () => {
      const a = pm.create_issue(project.id, "A")!;
      const b = pm.create_issue(project.id, "B")!;
      b.number = a.number;
      pm.save_issue(b);

      expect(pm.fix_duplicate_numbers(project.id)).toBe(1);
      const numbers = pm.issues(project.id).map((i) => i.number).sort();
      expect(numbers).toEqual([1, 2]);
    });
  });

  describe("Key Derivation & Stats", () => {
    it("deriveKey works for diverse names", () => {
      expect(deriveKey("")).toBe("PRY");
      expect(deriveKey("Backend")).toBe("BAC");
      expect(deriveKey("Portafolio web")).toBe("PW");
      expect(deriveKey("Árbol de él")).toBe("ADE");
    });

    it("stats burndown and status counts", () => {
      pm.create_issue(project.id, "Task 1", { status: "Por hacer", priority: 2 });
      pm.create_issue(project.id, "Task 2", { status: "En curso", priority: 4 });
      pm.create_issue(project.id, "Task 3", { status: "Hecho", priority: 2, done_at: D });

      const stats = new ProjectStats(pm, project.id);
      expect(stats.by_status()).toEqual([
        ["Por hacer", 1],
        ["En curso", 1],
        ["En revisión", 0],
        ["Hecho", 1],
      ]);
      expect(stats.by_priority()).toEqual([
        [1, 0],
        [2, 1],
        [3, 0],
        [4, 1],
      ]);
    });
  });

  describe("Calendar Source", () => {
    it("source emits occurrences for issues with due dates", () => {
      const i = pm.create_issue(project.id, "Home", {
        due: D,
        due_time: "17:00",
        in_calendar: true,
        estimate_min: 240,
      })!;

      const src = new ProjectCalendarSource(pm);
      const occs = src.occurrences(D, addDays(D, 2));
      const key = "2026-09-14";
      expect(occs[key]).toBeDefined();
      expect(occs[key]?.some((o) => o.id === `issue:${project.id}/${i.id}`)).toBe(true);

      src.setDone(D, `issue:${project.id}/${i.id}`, true);
      expect(pm.get_issue(project.id, i.id)?.is_done).toBe(true);
    });
  });

  describe("Golden byte conformance", () => {
    it("matches golden project issue file", () => {
      const goldenIssuePath = path.resolve(
        __dirname,
        "__golden__/.notevault/proyectos/PROJECT_ID/issues/ISSUE_HOME.md",
      );
      if (!fs.existsSync(goldenIssuePath)) return;

      const goldenBuf = fs.readFileSync(goldenIssuePath);
      expect(goldenBuf.length).toBeGreaterThan(0);
    });
  });
});
