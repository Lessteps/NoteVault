import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { P_ACTIVE } from "../../core/projectManager.js";
import { AppState } from "../appState.js";
import { DAY_KEYS, homeApi } from "./home.js";

let dir: string;
let api: ReturnType<typeof homeApi>;
let app: AppState;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "nv_home_"));
  app = new AppState(dir);
  api = homeApi(app);
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("home api", () => {
  it("home_overview returns expected structure", () => {
    const res = api.home_overview() as Record<string, any>;
    expect(typeof res.today).toBe("string");
    expect(Array.isArray(res.habits)).toBe(true);

    expect(res.exercise).toBeDefined();
    expect(DAY_KEYS).toContain(res.exercise.day);
    expect(Array.isArray(res.exercise.rows)).toBe(true);

    expect(res.tasks).toBeDefined();
    expect(Array.isArray(res.tasks.today)).toBe(true);
    expect(Array.isArray(res.tasks.overdue)).toBe(true);

    expect(res.projects).toBeDefined();
    expect(Array.isArray(res.projects.issues)).toBe(true);
    expect(Array.isArray(res.projects.active)).toBe(true);

    expect(res.finance).toBeDefined();
    expect(res.finance.day).toBeDefined();
    expect(res.finance.month).toBeDefined();
    expect(res.finance.prev).toBeDefined();
    expect(Array.isArray(res.finance.checks)).toBe(true);

    expect(res.goals).toBeDefined();
    expect(Array.isArray(res.goals.list)).toBe(true);
    expect(Array.isArray(res.goals.items)).toBe(true);
    expect(typeof res.goals.any).toBe("boolean");
  });

  it("populates tasks, habits, and projects in overview", () => {
    const mgrs = app.mgrs();
    const today = new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());

    // Create a task due today
    mgrs.tasks.create("Tarea de hoy", { due: todayStart });

    // Create an active project
    const proj = mgrs.projects.create("Proyecto Alfa", { status: P_ACTIVE, colour: "#2383e2" });

    const res = api.home_overview() as Record<string, any>;
    expect(res.tasks.today.length).toBe(1);
    expect(res.tasks.today[0].name).toBe("Tarea de hoy");

    expect(res.projects.active.some((p: any) => p.id === proj.id)).toBe(true);
  });
});
