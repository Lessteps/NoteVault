import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ApiError } from "../../core/errors.js";
import { AppState } from "../appState.js";
import { projectFoldersApi } from "./projectFolders.js";
import { projectsApi } from "./projects.js";

describe("projectFoldersApi", () => {
  let tmpDir: string;
  let workDir: string;
  let app: AppState;
  let api: ReturnType<typeof projectFoldersApi>;
  let p: Record<string, any>;

  const write = (rel: string, text = "hola") => {
    const abs = path.join(workDir, ...rel.split("/"));
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, text, "utf-8");
    return abs;
  };

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "nv_folders_vault_"));
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), "nv_folders_work_"));
    app = new AppState(tmpDir);
    api = projectFoldersApi(app);
    p = projectsApi(app).projects_create({ name: "Portafolio web" });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    fs.rmSync(workDir, { recursive: true, force: true });
  });

  it("test_link_marks_the_first_folder_as_destination", () => {
    const r = api.projects_folder_link(p.id, workDir);
    expect(r.folder.path).toBe(path.resolve(workDir));
    expect(r.folder.target).toBe(true);
    expect(api.projects_folders(p.id)).toHaveLength(1);
    // The link lives in the project record, so it survives a reload.
    const again = new AppState(tmpDir);
    expect(projectFoldersApi(again).projects_folders(p.id)[0]!.path).toBe(path.resolve(workDir));
  });

  it("test_changing_and_removing_the_destination_never_touches_the_disk", () => {
    const a = api.projects_folder_link(p.id, workDir).folder;
    const other = fs.mkdtempSync(path.join(os.tmpdir(), "nv_folders_other_"));
    const b = api.projects_folder_link(p.id, other).folder;
    expect(api.projects_folders(p.id).filter((f) => f.target).map((f) => f.id)).toEqual([a.id]);
    api.projects_folder_target(p.id, b.id);
    expect(api.projects_folders(p.id).filter((f) => f.target).map((f) => f.id)).toEqual([b.id]);
    api.projects_folder_unlink(p.id, b.id);
    const left = api.projects_folders(p.id);
    expect(left.map((f) => f.id)).toEqual([a.id]);
    expect(fs.existsSync(other)).toBe(true);
    fs.rmSync(other, { recursive: true, force: true });
  });

  it("test_tree_ignores_heavy_and_internal_folders", () => {
    write("nota.md", "# Título");
    write("sub/otra.md", "x");
    write(".git/config", "x");
    write("node_modules/pkg/index.js", "x");
    write(".notevault/project.json", "{}");
    const folder = api.projects_folder_link(p.id, workDir).folder;
    const tree = api.projects_folder_tree(p.id, folder.id);
    const rels = tree.entries.map((e) => e.rel);
    expect(rels).toContain("nota.md");
    expect(rels).toContain("sub/otra.md");
    expect(rels).toContain("sub");
    expect(rels.some((r) => r.startsWith(".git") || r.startsWith("node_modules") || r.startsWith(".notevault"))).toBe(false);
  });

  it("test_paths_outside_the_linked_folder_are_refused", () => {
    const folder = api.projects_folder_link(p.id, workDir).folder;
    write("dentro.md");
    expect(() => api.projects_file_read(p.id, folder.id, "../fuera.md")).toThrow(ApiError);
    expect(() => api.projects_file_read(p.id, folder.id, "C:/Windows/system.ini")).toThrow(ApiError);
    expect(() => api.projects_file_read(p.id, folder.id, path.join(workDir, "dentro.md"))).toThrow(ApiError);
    expect(() => api.projects_file_write(p.id, folder.id, "../fuera.md", "x")).toThrow(ApiError);
  });

  it("test_create_rename_move_and_trash_keep_the_folder_sane", () => {
    const folder = api.projects_folder_link(p.id, workDir).folder;
    const made = api.projects_file_create(p.id, folder.id, "", "Idea", false).entry;
    expect(made.rel).toBe("Idea.md");
    expect(fs.readFileSync(path.join(workDir, "Idea.md"), "utf-8")).toBe("");
    // A second one with the same name does not overwrite the first.
    const twins = api.projects_file_create(p.id, folder.id, "", "Idea", false).entry;
    expect(twins.rel).toBe("Idea (2).md");
    const dir = api.projects_file_create(p.id, folder.id, "", "capitulos", true).entry;
    expect(dir.dir).toBe(true);
    const moved = api.projects_file_move(p.id, folder.id, made.rel, dir.rel).entry;
    expect(moved.rel).toBe("capitulos/Idea.md");
    const renamed = api.projects_file_rename(p.id, folder.id, moved.rel, "Introducción").entry;
    expect(renamed.rel).toBe("capitulos/Introducción.md");
    expect(fs.existsSync(path.join(workDir, "capitulos", "Introducción.md"))).toBe(true);
    api.projects_file_delete(p.id, folder.id, renamed.rel);
    expect(fs.existsSync(path.join(workDir, "capitulos", "Introducción.md"))).toBe(false);
    // Outside Electron the delete is a move inside the vault: nothing is destroyed.
    const bin = path.join(tmpDir, ".notevault", ".papelera", "vinculadas");
    expect(fs.readdirSync(bin).some((n) => n.includes("Introducción.md"))).toBe(true);
  });

  it("test_write_is_atomic_and_reports_a_conflict", () => {
    const folder = api.projects_folder_link(p.id, workDir).folder;
    const abs = write("diario.md", "uno");
    const read = api.projects_file_read(p.id, folder.id, "diario.md");
    const first = api.projects_file_write(p.id, folder.id, "diario.md", "dos", read.modified);
    expect(first.ok).toBe(true);
    expect(fs.readFileSync(abs, "utf-8")).toBe("dos");
    // Someone else wrote in the meantime: we refuse instead of overwriting.
    const stale = api.projects_file_write(p.id, folder.id, "diario.md", "tres", read.modified);
    expect(stale.conflict).toBe(true);
    expect(fs.readFileSync(abs, "utf-8")).toBe("dos");
    // No leftover temp files after a save.
    expect(fs.readdirSync(workDir).filter((n) => n.includes(".tmp"))).toEqual([]);
  });

  it("test_big_text_files_open_read_only", () => {
    const folder = api.projects_folder_link(p.id, workDir).folder;
    write("grande.md", "x".repeat(3 * 1024 * 1024));
    const read = api.projects_file_read(p.id, folder.id, "grande.md");
    expect(read.readonly).toBe(true);
    expect(read.kind).toBe("markdown");
  });

  it("test_legacy_notes_are_copied_into_the_destination", () => {
    const legacy = path.join(tmpDir, ".notevault", "proyectos", p.id, "notas", "General.md");
    fs.mkdirSync(path.dirname(legacy), { recursive: true });
    fs.writeFileSync(legacy, "# General\n\ncontenido", "utf-8");
    const folder = api.projects_folder_link(p.id, workDir).folder;
    const r = api.projects_notes_migrate(p.id, folder.id);
    expect(r.moved).toEqual(["General.md"]);
    expect(fs.readFileSync(path.join(workDir, "General.md"), "utf-8")).toBe("# General\n\ncontenido");
    // The original stays where it was, and a second pass never overwrites.
    expect(fs.existsSync(legacy)).toBe(true);
    const again = api.projects_notes_migrate(p.id, folder.id);
    expect(again.moved).toEqual([]);
    expect(again.skipped).toEqual(["General.md"]);
  });
});
