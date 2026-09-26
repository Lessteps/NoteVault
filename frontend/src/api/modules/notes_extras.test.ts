import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../core/errors.js";
import { todayIso } from "../../core/dates.js";
import { AppConfig } from "../appConfig.js";
import { AppState } from "../appState.js";
import { notesExtrasApi } from "./notes_extras.js";

describe("notesExtrasApi", () => {
  let tmpDir: string;
  let outsideDir: string;
  let app: AppState;
  let api: ReturnType<typeof notesExtrasApi>;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "nv_extras_test_"));
    outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), "nv_out_test_"));

    const plantillasDir = path.join(tmpDir, "Plantillas");
    fs.mkdirSync(plantillasDir, { recursive: true });
    fs.writeFileSync(
      path.join(plantillasDir, "Clase.md"),
      "# {{title}}\nFecha: {{date}}\n",
      "utf-8"
    );

    vi.spyOn(AppConfig, "get_templates_dir").mockImplementation((root) =>
      path.join(root, "Plantillas")
    );
    vi.spyOn(AppConfig, "get_daily_notes_dir").mockImplementation((root) =>
      path.join(root, "Diario")
    );
    vi.spyOn(AppConfig, "get_daily_notes_template").mockReturnValue(null);

    app = new AppState(tmpDir);
    api = notesExtrasApi(app);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
    try {
      fs.rmSync(outsideDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it("lists templates and expands template text", () => {
    const list = api.templates_list();
    const names = list.templates.map((t) => t.name);
    expect(names).toEqual(["Clase.md"]);

    const textRes = api.template_text("Clase.md", "Álgebra");
    expect(textRes.text).toContain("# Álgebra");
    expect(textRes.text).toContain(todayIso());

    expect(() => api.template_text("../secret.md")).toThrow(ApiError);
  });

  it("creates note from template", () => {
    const res = api.note_from_template("Clase.md", "Cálculo\nnext: x", "");
    const raw = fs.readFileSync(path.join(tmpDir, res.path), "utf-8");
    expect(raw.startsWith("# Cálculo next: x")).toBe(true);

    expect(() => api.note_from_template("Clase.md", "X", "../")).toThrow(ApiError);
    expect(() => api.note_from_template("Clase.md", "", "")).toThrow(ApiError);
  });

  it("daily_note is idempotent and confined to vault", () => {
    const a = api.daily_note().path;
    expect(a).toBe(`Diario/${todayIso()}.md`);

    fs.writeFileSync(path.join(tmpDir, a), "hola", "utf-8");
    expect(api.daily_note().path).toBe(a);
    expect(fs.readFileSync(path.join(tmpDir, a), "utf-8")).toBe("hola");

    vi.spyOn(AppConfig, "get_daily_notes_dir").mockReturnValue(outsideDir);
    expect(api.daily_note().path).toBe(a);
    expect(fs.readdirSync(outsideDir)).toHaveLength(0);
  });

  it("indexes tags and lists notes for a tag", () => {
    fs.writeFileSync(
      path.join(tmpDir, "a.md"),
      "---\ntags: [mate]\n---\nTexto #fisica\n",
      "utf-8"
    );
    fs.writeFileSync(
      path.join(tmpDir, "b.md"),
      "Nada #mate\n",
      "utf-8"
    );

    const tags = Object.fromEntries(
      api.tags_list().map((t) => [t.tag, t.count])
    );
    expect(tags["mate"]).toBe(2);
    expect(tags["fisica"]).toBe(1);

    const mateNotes = api.tag_notes("#mate").map((n) => n.title);
    expect(mateNotes).toEqual(["a", "b"]);

    expect(() => api.tag_notes("a b")).toThrow(ApiError);
  });
});
