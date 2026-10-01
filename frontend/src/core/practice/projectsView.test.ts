import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { AppState } from "../../api/appState";
import { studyApi } from "../../api/modules/study";
import { ensureProjectsViewFile, projectsFolderOf, viewFileKind } from "./viewFiles";
import { parseFrontmatter } from "../frontmatter";

function vault(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "nv_projview_"));
  fs.mkdirSync(path.join(root, "Programación", "programming_practice", "projects", "_specs"), { recursive: true });
  fs.mkdirSync(path.join(root, "Programación", "programming_practice", "projects", "Link shortener"), { recursive: true });
  fs.mkdirSync(path.join(root, "Programación", "programming_practice", "kata"), { recursive: true });
  fs.writeFileSync(path.join(root, "Programación", "Programación.resumen.md"), "---\ntype: resumen\nsubject: programming\n---\n", "utf-8");
  return root;
}

describe("projects folder view", () => {
  it("recognises the projects folder and its _specs folder, and nothing else", () => {
    const root = vault();
    const projects = path.join(root, "Programación", "programming_practice", "projects");
    expect(projectsFolderOf(projects)).toBe(projects);
    expect(projectsFolderOf(path.join(projects, "_specs"))).toBe(projects);
    expect(projectsFolderOf(path.join(projects, "Link shortener"))).toBeNull();
    expect(projectsFolderOf(path.join(root, "Programación", "programming_practice", "kata"))).toBeNull();
    // a folder merely named "projects" elsewhere is a plain folder
    expect(projectsFolderOf(path.join(root, "Programación", "projects"))).toBeNull();
  });

  it("creates projects.proyectos.md once, typed as a view file", () => {
    const root = vault();
    const projects = path.join(root, "Programación", "programming_practice", "projects");
    const first = ensureProjectsViewFile(projects);
    expect(first.created).toBe(true);
    expect(path.basename(first.file)).toBe("projects.proyectos.md");
    const [fm] = parseFrontmatter(fs.readFileSync(first.file, "utf-8"));
    expect(viewFileKind(fm as Record<string, unknown>)).toBe("proyectos");
    expect(ensureProjectsViewFile(projects).created).toBe(false);
  });

  it("study_view_ensure opens the workspace for projects and for _specs, like the kata opens its practice view", () => {
    const root = vault();
    const api = studyApi(new AppState(root));
    const a = api.study_view_ensure("Programación/programming_practice/projects") as { ok: boolean; kind: string; path: string; created: string[] };
    expect(a).toMatchObject({ ok: true, kind: "proyectos", path: "Programación/programming_practice/projects/projects.proyectos.md" });
    expect(a.created).toHaveLength(1);
    const b = api.study_view_ensure("Programación/programming_practice/projects/_specs") as { kind: string; path: string; created: string[] };
    expect(b).toMatchObject({ kind: "proyectos", path: a.path });
    expect(b.created).toEqual([]);
  });

  it("a project folder stays a plain folder (it expands, it does not open the workspace)", () => {
    const root = vault();
    const api = studyApi(new AppState(root));
    const out = api.study_view_ensure("Programación/programming_practice/projects/Link shortener") as { ok: boolean; kind: string };
    expect(out.kind).not.toBe("proyectos");
  });
});
