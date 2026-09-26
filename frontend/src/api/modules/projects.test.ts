import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ApiError } from "../../core/errors.js";
import { ProjectManager } from "../../core/projectManager.js";
import { AppState } from "../appState.js";
import { filesApi } from "./files.js";
import { projectsApi } from "./projects.js";

const PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

describe("projectsApi", () => {
  let tmpDir: string;
  let app: AppState;
  let api: ReturnType<typeof projectsApi>;
  let fApi: ReturnType<typeof filesApi>;
  let p: Record<string, any>;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "nv_proj_"));
    app = new AppState(tmpDir);
    api = projectsApi(app);
    fApi = filesApi(app);
    p = api.projects_create({ name: "Portafolio web", status: "En curso" });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("test_create_and_board_numbers", () => {
    expect(p.key).toBe("PW");
    const x = api.projects_issue_create(p.id, { title: "Hero", priority: 3 }) as Record<string, any>;
    expect(x.key).toBe("PW-1");
    const card = api.projects_list()[0] as Record<string, any>;
    expect(card.summary.total).toBe(1);
    expect(new ProjectManager(tmpDir).issues(p.id)[0]!.title).toBe("Hero");
  });

  it("test_kanban_move_to_done_stamps_done_at", () => {
    const x = api.projects_issue_create(p.id, { title: "Hero" }) as Record<string, any>;
    api.projects_issue_move(p.id, x.id, "Hecho", 0);
    const data = api.projects_get(p.id) as Record<string, any>;
    const issue = data.issues[0];
    expect(issue.done).toBe(true);
    expect(issue.done_at).not.toBeNull();
    expect(() => api.projects_issue_move(p.id, x.id, "Inventada", 0)).toThrow(ApiError);
  });

  it("test_children_and_reparent", () => {
    const goal = api.projects_issue_create(p.id, { title: "MVP", type: "Submeta" }) as Record<string, any>;
    const task = api.projects_issue_create(p.id, { title: "Login" }) as Record<string, any>;
    api.projects_issue_update(p.id, task.id, { parent: goal.id });
    const data = api.projects_get(p.id) as Record<string, any>;
    const by = new Map(data.issues.map((i: any) => [i.id, i]));
    expect((by.get(goal.id) as any).children).toEqual([task.id]);
    expect(data.stats.submetas[0].total).toBe(1);
  });

  it("test_columns_rename_keeps_issues", () => {
    const x = api.projects_issue_create(p.id, { title: "Hero", status: "En curso" }) as Record<string, any>;
    api.projects_update(p.id, {
      columns: ["Backlog", "Haciendo", "Listo"],
      done_column: "Listo",
      renames: { "En curso": "Haciendo" },
    });
    const data = api.projects_get(p.id) as Record<string, any>;
    const issue = data.issues[0];
    expect(issue.status).toBe("Haciendo");
    expect(issue.id).toBe(x.id);
  });

  it("test_fields_cannot_inject_frontmatter", () => {
    const x = api.projects_issue_create(p.id, { title: "a\nstatus: Hecho" }) as Record<string, any>;
    api.projects_issue_update(p.id, x.id, {
      labels: ["ui,ux", "x\ny"],
      linked_notes: ["Notas/A.md"],
      linked_folder: "Docs",
    });
    const issueFile = path.join(tmpDir, ".notevault", "proyectos", p.id, "issues", `${x.id}.md`);
    const text = fs.readFileSync(issueFile, "utf-8");
    const frontmatter = text.split("---")[1]!.replace('title: "a status: Hecho"', "");
    expect(frontmatter).not.toContain("\nstatus: Hecho");

    const data = api.projects_get(p.id) as Record<string, any>;
    const issue = data.issues[0];
    expect(issue.labels).toEqual(["ui ux", "x y"]);
    expect(issue.linked_notes).toEqual(["Notas/A.md"]);

    const badList = [
      { status: "Nope" },
      { type: "Épica" },
      { due_time: "7pm" },
      { attachments: ["../../x.png"] },
    ];
    for (const bad of badList) {
      expect(() => api.projects_issue_update(p.id, x.id, bad)).toThrow(ApiError);
    }
  });

  it("test_project_notes_are_confined", () => {
    const made = api.projects_note_create(p.id, "", "Idea") as Record<string, any>;
    api.projects_note_write(p.id, made.path, "# Idea\n\ntexto\n");
    const note = api.projects_note_read(p.id, "Idea.md") as Record<string, any>;
    expect(note.raw).toContain("texto");

    const badPaths = ["../Otro.md", "/etc/passwd", ".oculto.md", "x/../../y.md"];
    for (const bad of badPaths) {
      expect(() => api.projects_note_write(p.id, bad, "x")).toThrow(ApiError);
    }
  });

  it("test_attachments", () => {
    const x = api.projects_issue_create(p.id, { title: "Captura" }) as Record<string, any>;
    const ref = (fApi.attach_add("proyectos", x.id, "shot.png", PNG) as Record<string, any>).ref;
    api.projects_issue_update(p.id, x.id, { attachments: [ref] });
    expect(fApi.attach_read(ref).data_url).toMatch(/^data:image\/png;base64,/);

    expect(() => fApi.attach_add("notas", "x", "a.png", PNG)).toThrow(ApiError);
    expect(() => fApi.attach_add("proyectos", "../x", "a.png", PNG)).toThrow(ApiError);
    expect(() => fApi.attach_add("proyectos", "x", "a.exe", PNG)).toThrow(ApiError);
    expect(() => fApi.attach_read("../secret.png")).toThrow(ApiError);

    fApi.attach_remove(ref);
    expect(() => fApi.attach_read(ref)).toThrow(ApiError);
  });

  it("test_delete_goes_to_trash", () => {
    api.projects_delete(p.id);
    expect(api.projects_list()).toEqual([]);
    const trash = path.join(tmpDir, ".notevault", ".papelera");
    expect(fs.existsSync(trash)).toBe(true);
  });

  it("test_meta_and_notes_list", () => {
    const meta = api.projects_meta();
    expect(meta.statuses).toBeDefined();
    expect(meta.types).toBeDefined();
    expect(meta.default_columns).toBeDefined();

    const createdNote = api.projects_note_create(p.id, "", "Documento") as Record<string, any>;
    const list = api.projects_notes_list(p.id) as Array<Record<string, any>>;
    expect(list.some((n) => n.path === createdNote.path)).toBe(true);

    api.projects_note_delete(p.id, createdNote.path);
    const listAfter = api.projects_notes_list(p.id) as Array<Record<string, any>>;
    expect(listAfter.some((n) => n.path === createdNote.path)).toBe(false);
  });
});
