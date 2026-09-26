import { describe, expect, it } from "vitest";
import { extractFmTags, extractInlineTags, TagIndex } from "./tagIndex";

describe("tagIndex", () => {
  describe("extractInlineTags", () => {
    it("extracts basic tag", () => {
      expect(extractInlineTags("Hello #python world")).toContain("python");
    });

    it("extracts multiple tags", () => {
      const tags = extractInlineTags("#math #algebra and #calculus");
      expect(new Set(tags)).toEqual(new Set(["math", "algebra", "calculus"]));
    });

    it("ignores tag inside code fences", () => {
      const text = "```\n#not-a-tag\n```\nreal #tag";
      const tags = extractInlineTags(text);
      expect(tags).toContain("tag");
      expect(tags).not.toContain("not-a-tag");
    });

    it("ignores tag inside word", () => {
      const tags = extractInlineTags("color#red");
      expect(tags).not.toContain("red");
    });

    it("handles empty body", () => {
      expect(extractInlineTags("")).toEqual([]);
    });
  });

  describe("extractFmTags", () => {
    it("extracts inline list", () => {
      const fm = "title: T\ntags: [math, science]";
      expect(new Set(extractFmTags(fm))).toEqual(new Set(["math", "science"]));
    });

    it("extracts yaml list", () => {
      const fm = "title: T\ntags:\n  - python\n  - code";
      expect(new Set(extractFmTags(fm))).toEqual(new Set(["python", "code"]));
    });

    it("extracts single tag", () => {
      const fm = "tags: soltag";
      expect(extractFmTags(fm)).toContain("soltag");
    });

    it("handles no tags field", () => {
      const fm = "title: T\ndate: 2024-01-01";
      expect(extractFmTags(fm)).toEqual([]);
    });
  });

  describe("TagIndex build", () => {
    it("indexes body and frontmatter tags", () => {
      const idx = new TagIndex();
      const notes = [
        { path: "/vault/note1.md", text: "---\ntitle: T\n---\n\nHello #python" },
        { path: "/vault/note2.md", text: "---\ntitle: T\ntags: [math]\n---\n\nBody" },
        { path: "/vault/note3.md", text: "---\ntags: [python]\n---\n\n#python #python" },
      ];
      idx.build(notes);

      expect(idx.pathsForTag("python").some((p) => p.endsWith("note1.md"))).toBe(true);
      expect(idx.pathsForTag("math").some((p) => p.endsWith("note2.md"))).toBe(true);
      // Repeated tag counts once per note
      expect(idx.pathsForTag("python").filter((p) => p.endsWith("note3.md")).length).toBe(1);

      const sorted = idx.allTagsSorted();
      expect(sorted[0]![0]).toBe("python");
      expect(sorted[0]![1]).toBe(2);
    });

    it("returns tags for a given path", () => {
      const idx = new TagIndex();
      idx.build([{ path: "/vault/n.md", text: "---\ntags: [a, b]\n---\n\n#c" }]);
      const tags = idx.tagsForPath("/vault/n.md");
      expect(new Set(tags)).toEqual(new Set(["a", "b", "c"]));
    });
  });
});
