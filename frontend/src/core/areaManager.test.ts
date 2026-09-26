import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AreaManager, sanitizeArea, SUGGESTED_AREAS } from "./areaManager";

describe("AreaManager", () => {
  let tempDir: string;
  let mgr: AreaManager;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "nv-area-test-"));
    mgr = new AreaManager(tempDir);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("sanitizes area data with sensible defaults", () => {
    const empty = sanitizeArea({}, "default-id");
    expect(empty).toEqual({
      id: "default-id",
      name: "Área",
      icon: "",
      colour: "#7986cb",
      order: 0,
      archived: false,
    });

    const populated = sanitizeArea({
      id: "work",
      name: "Trabajo",
      icon: "💼",
      colour: "#ff0000",
      order: 3,
      archived: true,
    });
    expect(populated).toEqual({
      id: "work",
      name: "Trabajo",
      icon: "💼",
      colour: "#ff0000",
      order: 3,
      archived: true,
    });
  });

  it("creates, retrieves, and archives areas", () => {
    const area = mgr.create("Programación", "💻", "#3f51b5");
    expect(area.id).toBe("programacion");
    expect(area.name).toBe("Programación");
    expect(area.order).toBe(1);
    expect(area.archived).toBe(false);

    expect(mgr.nameOf(area.id)).toBe("Programación");
    expect(mgr.nameOf("nonexistent")).toBe("Sin área");

    const retrieved = mgr.get("programacion");
    expect(retrieved).not.toBeNull();
    expect(retrieved?.name).toBe("Programación");

    // Duplicate name creates unique id
    const area2 = mgr.create("Programación", "💻", "#3f51b5");
    expect(area2.id).toBe("programacion-2");
    expect(area2.order).toBe(2);

    expect(mgr.areas()).toHaveLength(2);

    // Archive
    mgr.archive("programacion", true);
    expect(mgr.areas(false)).toHaveLength(1);
    expect(mgr.areas(true)).toHaveLength(2);
    expect(mgr.nameOf("programacion")).toBe("Sin área");
  });

  it("updates and reorders areas", () => {
    const a1 = mgr.create("Salud", "💪");
    const a2 = mgr.create("Estudio", "📚");

    mgr.update(a1.id, { colour: "#123456", icon: "🏥" });
    const updated = mgr.get(a1.id);
    expect(updated?.colour).toBe("#123456");
    expect(updated?.icon).toBe("🏥");

    mgr.reorder([a2.id, a1.id]);
    const areas = mgr.areas();
    expect(areas[0]?.id).toBe(a2.id);
    expect(areas[0]?.order).toBe(0);
    expect(areas[1]?.id).toBe(a1.id);
    expect(areas[1]?.order).toBe(1);
  });

  it("creates suggested areas idempotently", () => {
    mgr.createSuggested();
    const areas = mgr.areas();
    expect(areas).toHaveLength(SUGGESTED_AREAS.length);

    // Running again does not duplicate
    mgr.createSuggested();
    expect(mgr.areas()).toHaveLength(SUGGESTED_AREAS.length);
  });

  it("matches golden file programacion.json byte-for-byte", () => {
    const area = mgr.create("Programación", "💻", "#3f51b5");
    expect(area.id).toBe("programacion");

    const writtenPath = path.join(tempDir, ".notevault", "areas", "programacion.json");
    const goldenPath = path.resolve(
      __dirname,
      "__golden__",
      ".notevault",
      "areas",
      "programacion.json",
    );

    const got = fs.readFileSync(writtenPath);
    const want = fs.readFileSync(goldenPath);

    expect(got.equals(want)).toBe(true);
  });
});
