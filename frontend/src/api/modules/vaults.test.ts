import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../core/errors.js";
import { AppConfig } from "../appConfig.js";
import { AppState } from "../appState.js";
import { appApi } from "./app.js";
import { tasksApi } from "./tasks.js";
import { vaultsApi } from "./vaults.js";

describe("vaultsApi", () => {
  let dirA: string;
  let dirB: string;
  let app: AppState;
  let api: ReturnType<typeof vaultsApi>;
  let tasks: ReturnType<typeof tasksApi>;
  let appModule: ReturnType<typeof appApi>;

  beforeEach(() => {
    dirA = fs.mkdtempSync(path.join(os.tmpdir(), "nv_va_test_"));
    dirB = fs.mkdtempSync(path.join(os.tmpdir(), "nv_vb_test_"));

    fs.writeFileSync(path.join(dirB, "Otra.md"), "# Otra\n", "utf-8");

    vi.spyOn(AppConfig, "get_recent_vaults").mockReturnValue([]);
    vi.spyOn(AppConfig, "set_active_vault").mockImplementation(() => {});

    app = new AppState(dirA);
    api = vaultsApi(app);
    tasks = tasksApi(app);
    appModule = appApi(app);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    try {
      fs.rmSync(dirA, { recursive: true, force: true });
    } catch {
      // ignore
    }
    try {
      fs.rmSync(dirB, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it("desktop window refuses unknown folders until recent or picked", () => {
    app.window = {}; // simulates desktop window present
    expect(() => api.vault_open(dirB)).toThrow(ApiError);

    vi.spyOn(AppConfig, "get_recent_vaults").mockReturnValue([dirB]);
    const res = api.vault_open(dirB);
    expect(res.ok).toBe(true);
    expect(AppConfig.set_active_vault).toHaveBeenCalledWith(dirB);
  });

  it("switch reloads every module", () => {
    tasks.tasks_create({ name: "En A" });
    expect(tasks.tasks_list().length).toBeGreaterThan(0);

    // No window: dev / tests
    api.vault_open(dirB);
    expect(tasks.tasks_list()).toEqual([]);
    expect(app.service.index.notes(true).map((n) => n.title)).toEqual(["Otra"]);
    expect(appModule.app_info().vault_name).toBe(path.basename(dirB));
  });

  it("list marks current and scans markdown files", () => {
    vi.spyOn(AppConfig, "get_recent_vaults").mockReturnValue([dirB]);
    const rows = api.vault_list();
    expect(rows[0]!.current).toBe(true);
    expect(rows[1]!.markdown).toBe(1);
  });
});
