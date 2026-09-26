import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  AppConfig,
  DEFAULT_RENDERING,
  _setSettingsFileForTest,
} from "./appConfig";

describe("AppConfig rendering settings", () => {
  let tmpDir: string;
  let tmpFile: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "nv_config_test_"));
    tmpFile = path.join(tmpDir, "settings.json");
    _setSettingsFileForTest(tmpFile);
  });

  afterEach(() => {
    _setSettingsFileForTest(null);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns default rendering settings when empty", () => {
    const r = AppConfig.get_rendering();
    expect(r).toEqual(DEFAULT_RENDERING);
    expect(r.mode).toBe("auto");
    expect(r.angle).toBe("default");
    expect(r.liteEffects).toBe(false);
    expect(r.reduceMotion).toBe(false);
  });

  it("persists and reads back partial updates", () => {
    const updated = AppConfig.set_rendering({ mode: "software", liteEffects: true });
    expect(updated.mode).toBe("software");
    expect(updated.liteEffects).toBe(true);
    expect(updated.angle).toBe("default");
    expect(updated.reduceMotion).toBe(false);

    const reloaded = AppConfig.get_rendering();
    expect(reloaded).toEqual(updated);
  });

  it("clamps invalid enum values to previous or default", () => {
    // @ts-expect-error test invalid mode
    AppConfig.set_rendering({ mode: "invalid_mode", angle: "invalid_angle" });
    const r = AppConfig.get_rendering();
    expect(r.mode).toBe("auto");
    expect(r.angle).toBe("default");
  });
});
