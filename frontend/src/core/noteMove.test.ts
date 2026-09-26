import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { VaultManager } from "./vaultManager";

describe("note move", () => {
  let tmp: string;
  let vault: VaultManager;
  let root: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nv_move_"));
    vault = new VaultManager(tmp);
    root = vault.vaultRoot;
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  function makeNote(rel: string, body: string = "# hi"): string {
    const p = path.join(root, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, `---\ntitle: ${path.parse(p).name}\n---\n\n${body}\n`, "utf-8");
    return p;
  }

  function makeFolder(rel: string): string {
    const p = path.join(root, rel);
    fs.mkdirSync(p, { recursive: true });
    return p;
  }

  it("moves note to folder", () => {
    const note = makeNote("note.md");
    const dest = makeFolder("sub");
    const newPath = vault.movePath(note, dest);
    expect(newPath).toBe(path.join(dest, "note.md"));
    expect(fs.existsSync(newPath)).toBe(true);
    expect(fs.existsSync(note)).toBe(false);
  });

  it("adds suffix on collision", () => {
    makeNote("sub/note.md", "original");
    const src = makeNote("note.md", "copy");
    const dest = makeFolder("sub");
    const newPath = vault.movePath(src, dest);

    expect(newPath).not.toBe(path.join(dest, "note.md"));
    expect(path.basename(newPath).startsWith("note")).toBe(true);
    expect(fs.existsSync(newPath)).toBe(true);
    expect(fs.existsSync(path.join(dest, "note.md"))).toBe(true);
  });

  it("moves folder", () => {
    const inner = makeFolder("inner");
    makeNote("inner/a.md");
    const outer = makeFolder("outer");
    const newPath = vault.movePath(inner, outer);
    expect(newPath).toBe(path.join(outer, "inner"));
    expect(fs.existsSync(path.join(newPath, "a.md"))).toBe(true);
    expect(fs.existsSync(inner)).toBe(false);
  });

  it("is no-op when moving folder into itself", () => {
    const folder = makeFolder("myfolder");
    const result = vault.movePath(folder, folder);
    expect(result).toBe(folder);
    expect(fs.existsSync(folder)).toBe(true);
  });

  it("rejects move into .notevault", () => {
    const note = makeNote("note.md");
    const reserved = path.join(root, ".notevault");
    fs.mkdirSync(reserved, { recursive: true });
    expect(() => vault.movePath(note, reserved)).toThrow();
  });

  it("is no-op when note is already in destination", () => {
    const note = makeNote("note.md");
    const result = vault.movePath(note, root);
    expect(result).toBe(note);
    expect(fs.existsSync(note)).toBe(true);
  });
});
