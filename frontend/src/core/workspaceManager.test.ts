import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WorkspaceManager } from "./workspaceManager";

describe("WorkspaceManager", () => {
  let tempDir: string;
  let wm: WorkspaceManager;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "nv-ws-test-"));
    wm = new WorkspaceManager(tempDir);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("initializes default workspaces", () => {
    const list = wm.workspaces();
    const ids = new Set(list.map((w) => w.id));
    expect(ids.has("mathematics")).toBe(true);
    expect(ids.has("programming")).toBe(true);
    expect(ids.has("english")).toBe(true);
    expect(ids.has("general")).toBe(true);
  });

  it("detects workspace by path prefix", () => {
    expect(wm.detect_for_path("Matemáticas/Cálculo/Derivadas.md").id).toBe("mathematics");
    expect(wm.detect_for_path("Programación/Frontend/React.md").id).toBe("programming");
    expect(wm.detect_for_path("Inglés/Vocabulario/Tech.md").id).toBe("english");
    expect(wm.detect_for_path("Personal/Ideas.md").id).toBe("general");
  });

  it("detects workspace by frontmatter override", () => {
    const ws = wm.detect_for_path("RandomFolder/Test.md", { subject: "programming" });
    expect(ws.id).toBe("programming");
  });

  it("configures features per workspace", () => {
    const math = wm.get("mathematics");
    expect(math?.features?.calculator).toBe(true);
    expect(math?.features?.latex).toBe(true);
    expect(math?.features?.code_execution).toBe(false);

    const prog = wm.get("programming");
    expect(prog?.features?.code_execution).toBe(true);
    expect(prog?.features?.debugging).toBe(true);
    expect(prog?.features?.calculator).toBe(false);
  });

  it("ensure_folder creates structure and index", () => {
    const res = wm.ensure_folder("mathematics", true);
    expect(res.created).toBe(true);
    expect(fs.statSync(res.path).isDirectory()).toBe(true);
    expect(path.basename(res.path)).toBe("Matemáticas");
    expect(fs.existsSync(res.index!)).toBe(true);
    expect(res.subfolders.length).toBeGreaterThan(0);

    const indexContent = fs.readFileSync(res.index!, "utf-8");
    expect(indexContent).toContain("subject: mathematics");
  });

  it("ensure_folder is idempotent", () => {
    wm.ensure_folder("english", false);
    const again = wm.ensure_folder("english", false);
    expect(again.created).toBe(false);
  });

  it("ensure_folder reuses name variant (e.g. Math)", () => {
    fs.mkdirSync(path.join(tempDir, "Math"));
    const res = wm.ensure_folder("mathematics", false);
    expect(res.created).toBe(false);
    expect(path.basename(res.path)).toBe("Math");
    expect(fs.existsSync(path.join(tempDir, "Matemáticas"))).toBe(false);
  });

  it("detect ignores deep folders", () => {
    const ws = wm.detect_for_path("PROJECTS/app/code/note.md");
    expect(ws.id).toBe("general");
  });

  it("detect handles decomposed accents (NFD)", () => {
    const nfd = "Matemáticas".normalize("NFD");
    const ws = wm.detect_for_path(`${nfd}/Cálculo/nota.md`);
    expect(ws.id).toBe("mathematics");
  });
});
