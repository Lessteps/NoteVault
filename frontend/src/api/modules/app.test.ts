import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ApiError } from "../../core/errors.js";
import { _setSettingsFileForTest } from "../appConfig.js";
import { AppState } from "../appState.js";
import { appApi } from "./app.js";

let dir: string;
let api: ReturnType<typeof appApi>;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "nv_app_"));
  _setSettingsFileForTest(path.join(dir, "settings.json"));
  api = appApi(new AppState(dir));
});
afterEach(() => {
  _setSettingsFileForTest(null);
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("app-level api", () => {
  it("open_external refuses non http/https/mailto links", () => {
    for (const bad of ["file:///etc/passwd", "javascript:alert(1)", "ftp://x", "http://", ""]) {
      expect(() => api.open_external(bad)).toThrow(ApiError);
    }
  });

  it("open_external accepts http(s) and mailto (shell missing -> still ok)", () => {
    expect(api.open_external("https://example.com/x").ok).toBe(true);
    expect(api.open_external("mailto:a@b.com").ok).toBe(true);
  });

  it("set_unsaved clamps to zero", () => {
    api.set_unsaved(-5);
    expect(api.close_window().ok).toBe(true);
  });

  it("app_info reports the vault path and api version", () => {
    const info = api.app_info();
    expect(info.vault_path).toBe(path.resolve(dir));
    expect(info.api_version).toBe(1);
    expect(info.rendering).toBeDefined();
  });

  it("get_rendering and set_rendering handle updates and clamp invalid enums", () => {
    const initial = api.get_rendering();
    expect(initial.mode).toBe("auto");
    expect(initial.angle).toBe("default");

    const updated = api.set_rendering({ mode: "hardware", liteEffects: true });
    expect(updated.mode).toBe("hardware");
    expect(updated.liteEffects).toBe(true);

    // @ts-expect-error invalid mode and angle
    const clamped = api.set_rendering({ mode: "invalid", angle: "not_an_angle" });
    expect(clamped.mode).toBe("hardware");
    expect(clamped.angle).toBe("default");
  });

  it("gpu_status returns fallback info in non-electron test env", async () => {
    const status = await api.gpu_status();
    expect(status).toHaveProperty("features");
    expect(status).toHaveProperty("active");
    expect(status).toHaveProperty("angle");
    expect(Array.isArray(status.active)).toBe(true);
  });

  it("relaunch_app returns ok in non-electron test env", () => {
    expect(api.relaunch_app().ok).toBe(true);
  });
});
