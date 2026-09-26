import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  captureLayout,
  deleteLayout,
  listLayouts,
  loadLayout,
  saveLayout,
} from "./layouts";
import { DATA_DIR } from "./vaultFormat";

describe("layouts", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nv_layouts_"));
    fs.mkdirSync(path.join(tmp, DATA_DIR), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("lists empty initially", () => {
    expect(listLayouts(tmp)).toEqual([]);
  });

  it("saves and lists layout", () => {
    const data = captureLayout([220, 800, 340], true, true, ["Notas/a.md"], "Notas/a.md");
    saveLayout(tmp, "Mi layout", data);
    expect(listLayouts(tmp)).toContain("Mi layout");
  });

  it("loads saved layout", () => {
    const data = captureLayout([220, 800, 340], true, false, ["b.md"]);
    saveLayout(tmp, "test", data);
    const loaded = loadLayout(tmp, "test");
    expect(loaded).not.toBeNull();
    expect(loaded?.splitter_sizes).toEqual([220, 800, 340]);
    expect(loaded?.left_visible).toBe(true);
    expect(loaded?.right_visible).toBe(false);
    expect(loaded?.open_notes).toEqual(["b.md"]);
  });

  it("returns null when loading missing layout", () => {
    expect(loadLayout(tmp, "ghost")).toBeNull();
  });

  it("overwrites existing layout", () => {
    saveLayout(tmp, "x", captureLayout([100, 800, 100], true, true, []));
    saveLayout(tmp, "x", captureLayout([200, 700, 100], true, false, []));
    const loaded = loadLayout(tmp, "x");
    expect(loaded?.splitter_sizes[0]).toBe(200);
  });

  it("deletes layout", () => {
    saveLayout(tmp, "del_me", captureLayout([0, 900, 0], false, false, []));
    expect(listLayouts(tmp)).toContain("del_me");
    expect(deleteLayout(tmp, "del_me")).toBe(true);
    expect(listLayouts(tmp)).not.toContain("del_me");
    expect(deleteLayout(tmp, "del_me")).toBe(false);
  });

  it("lists layouts sorted alphabetically", () => {
    for (const name of ["beta", "alpha", "gamma"]) {
      saveLayout(tmp, name, captureLayout([0, 0, 0], false, false, []));
    }
    expect(listLayouts(tmp)).toEqual(["alpha", "beta", "gamma"]);
  });

  it("sanitizes names with slashes", () => {
    saveLayout(tmp, "a/b", captureLayout([0, 0, 0], false, false, []));
    const names = listLayouts(tmp);
    expect(names).toContain("a_b");
    expect(names).not.toContain("a/b");
  });

  it("stores active_note", () => {
    const data = captureLayout([220, 800, 0], true, false, ["x.md", "y.md"], "y.md");
    saveLayout(tmp, "with_active", data);
    const loaded = loadLayout(tmp, "with_active");
    expect(loaded?.active_note).toBe("y.md");
  });
});
