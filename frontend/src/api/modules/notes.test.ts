import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ApiError } from "../../core/errors.js";
import { AppState } from "../appState.js";
import { notesApi } from "./notes.js";

const PNG_1PX = Buffer.from(
  "89504e470d0a1a0a0000000d4948445200000001000000010806000000" +
    "1f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082",
  "hex",
);

describe("notesApi", () => {
  let base: string;
  let dir: string;
  let api: ReturnType<typeof notesApi>;

  beforeEach(() => {
    base = fs.mkdtempSync(path.join(os.tmpdir(), "nv_notes_test_"));
    dir = path.join(base, "vault");
    fs.mkdirSync(dir, { recursive: true });

    const progDir = path.join(dir, "Programación");
    fs.mkdirSync(progDir, { recursive: true });
    fs.writeFileSync(
      path.join(progDir, "Spec.md"),
      "---\nstatus: in-progress\ndue: 2025-03-30\ntags: [python, api]\n---\n# Spec\n\nVer [[Target]].\n",
      "utf-8",
    );
    fs.writeFileSync(path.join(dir, "Target.md"), "# Target\n\ncuerpo\n", "utf-8");
    fs.writeFileSync(path.join(progDir, "script.py"), "print(1)\n", "utf-8");

    const attachDir = path.join(dir, "attachments");
    fs.mkdirSync(attachDir, { recursive: true });
    fs.writeFileSync(path.join(attachDir, "pic.png"), PNG_1PX);
    fs.writeFileSync(path.join(attachDir, "notes.txt"), "x", "utf-8");

    const trashDir = path.join(dir, ".trash");
    fs.mkdirSync(trashDir, { recursive: true });
    fs.writeFileSync(path.join(trashDir, "old.md"), "secret", "utf-8");

    fs.writeFileSync(path.join(base, "outside.md"), "outside", "utf-8");
    fs.writeFileSync(path.join(base, "outside.png"), PNG_1PX);

    api = notesApi(new AppState(dir));
  });

  afterEach(() => {
    fs.rmSync(base, { recursive: true, force: true });
  });

  it("lists root folders first and hides internal folders", () => {
    const list = api.list_dir("");
    const names = list.map((e) => e.name);
    expect(names[0]).toBe("Programación");
    expect(names).toContain("Target");
    expect(names).not.toContain(".trash");
    expect(names).not.toContain("attachments");

    const folder = list[0]!;
    expect(folder.type).toBe("folder");
    expect(folder.has_children).toBe(true);
  });

  it("list_subfolder paths are vault relative", () => {
    const entries = api.list_dir("Programación");
    const paths = new Set(entries.map((e) => e.path));
    expect(paths.has("Programación/Spec.md")).toBe(true);
    expect(paths.has("Programación/script.py")).toBe(true);
  });

  it("read_note splits frontmatter and is json safe", () => {
    const note = api.read_note("Programación/Spec.md");
    expect(note.title).toBe("Spec");
    expect((note.frontmatter as any).status).toBe("in-progress");
    expect((note.frontmatter as any).tags).toEqual(["python", "api"]);
    expect((note.body as string).startsWith("# Spec")).toBe(true);
    expect(() => JSON.stringify(note)).not.toThrow();
  });

  it("write_note round trip is byte identical", () => {
    const raw = "---\na: 1\n---\n# T\r\n\r\nline with CRLF\r\n- [x] done\n";
    const res = api.write_note("Target.md", raw);
    expect(res.ok).toBe(true);
    expect(fs.readFileSync(path.join(dir, "Target.md"), "utf-8")).toBe(raw);
    expect(api.read_note("Target.md").raw).toBe(raw);
  });

  it("write_note detects external change", () => {
    const note = api.read_note("Target.md");
    fs.utimesSync(path.join(dir, "Target.md"), 1, 1);
    const res = api.write_note("Target.md", "new", note.modified as number);
    expect(res.ok).toBe(false);
    expect(res.conflict).toBe(true);
    expect(fs.readFileSync(path.join(dir, "Target.md"), "utf-8")).toBe("# Target\n\ncuerpo\n");
  });

  it("create, rename, move, delete to trash", () => {
    const created = api.create_note("Nueva", "Programación").path;
    expect(created).toBe("Programación/Nueva.md");

    const renamed = api.rename(created, "Renombrada").path;
    expect(renamed).toBe("Programación/Renombrada.md");

    const moved = api.move(renamed, "").path;
    expect(moved).toBe("Renombrada.md");

    api.delete(moved);
    expect(fs.existsSync(path.join(dir, "Renombrada.md"))).toBe(false);
  });

  it("resolve_link resolves wikilink target", () => {
    expect(api.resolve_link("Target").path).toBe("Target.md");
    expect(api.resolve_link("Nonexistent").path).toBeNull();
  });

  it("search finds matching notes", () => {
    const hits = api.search("Spec");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]!.path).toBe("Programación/Spec.md");
  });

  it("bookmarks toggles and lists bookmarked notes", () => {
    expect(api.bookmarks()).toEqual([]);
    const res = api.toggle_bookmark("Target.md");
    expect(res.bookmarked).toBe(true);
    expect(api.bookmarks().map((b) => b.path)).toContain("Target.md");
  });

  it("read_attachment returns base64 data url for images and blocks outside", () => {
    const res = api.read_attachment("Programación/Spec.md", "pic.png");
    expect(res.data_url.startsWith("data:image/png;base64,")).toBe(true);

    expect(() => api.read_attachment("Programación/Spec.md", "notes.txt")).toThrow(ApiError);
    expect(() => api.read_attachment("Programación/Spec.md", "../outside.png")).toThrow(ApiError);
  });

  it("note_properties_meta and note_set_properties work", () => {
    const meta = api.note_properties_meta();
    expect(meta.subjects).toContain("mathematics");

    const res = api.note_set_properties("Target.md", { subject: "mathematics", difficulty: 3 });
    expect(res.ok).toBe(true);
    const updated = api.read_note("Target.md");
    expect((updated.frontmatter as any).subject).toBe("mathematics");
    expect((updated.frontmatter as any).difficulty).toBe(3);
  });
});
