import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { formatDate, todayIso } from "./dates";
import { openOrCreateToday, todayPath } from "./dailyNotes";
import { expandTemplate, listTemplates, readAndExpand } from "./templates";

describe("templates & daily notes", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nv_tmpl_"));
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  describe("expandTemplate", () => {
    it("substitutes title", () => {
      const res = expandTemplate("# {{title}}", { title: "Mi nota" });
      expect(res).toBe("# Mi nota");
    });

    it("substitutes default date", () => {
      const today = todayIso();
      expect(expandTemplate("{{date}}")).toBe(today);
    });

    it("substitutes custom date format", () => {
      const expected = formatDate(new Date(), "%d/%m/%Y");
      expect(expandTemplate("{{date:%d/%m/%Y}}")).toBe(expected);
    });

    it("keeps unknown variables untouched", () => {
      expect(expandTemplate("{{unknown}}")).toBe("{{unknown}}");
    });

    it("handles multiple variables", () => {
      const today = todayIso();
      expect(expandTemplate("{{title}} — {{date}}", { title: "T" })).toBe(`T — ${today}`);
    });
  });

  describe("listTemplates", () => {
    it("returns empty for empty dir", () => {
      const dir = path.join(tmp, "Plantillas");
      fs.mkdirSync(dir);
      expect(listTemplates(dir)).toEqual([]);
    });

    it("lists only .md files sorted", () => {
      const dir = path.join(tmp, "Plantillas");
      fs.mkdirSync(dir);
      fs.writeFileSync(path.join(dir, "b.md"), "B");
      fs.writeFileSync(path.join(dir, "a.md"), "A");
      fs.writeFileSync(path.join(dir, "readme.txt"), "TXT");

      const names = listTemplates(dir).map((p) => path.basename(p));
      expect(names).toEqual(["a.md", "b.md"]);
    });
  });

  describe("readAndExpand", () => {
    it("reads and expands file content", () => {
      const p = path.join(tmp, "t.md");
      fs.writeFileSync(p, "# {{title}}", "utf-8");
      expect(readAndExpand(p, { title: "Hola" })).toBe("# Hola");
    });
  });

  describe("dailyNotes", () => {
    it("computes todayPath", () => {
      const d = path.join(tmp, "Diario");
      expect(path.basename(todayPath(d))).toBe(`${todayIso()}.md`);
    });

    it("creates today note if not existing", () => {
      const dailyDir = path.join(tmp, "Diario");
      const p = openOrCreateToday(tmp, dailyDir);
      expect(fs.existsSync(p)).toBe(true);

      const content = fs.readFileSync(p, "utf-8");
      expect(content).toContain(`title: ${todayIso()}`);

      // Second call is idempotent
      const p2 = openOrCreateToday(tmp, dailyDir);
      expect(p2).toBe(p);
    });
  });
});
