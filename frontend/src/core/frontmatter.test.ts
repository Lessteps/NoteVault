// Reference test — ported from the frontmatter cases in the Python suite.
// Shows the pytest → vitest pattern for the migration.

import { describe, expect, it } from "vitest";
import {
  dumpFrontmatter, parseFrontmatter, sanitizeProperties, updateFrontmatter,
} from "./frontmatter";

describe("parseFrontmatter", () => {
  it("splits frontmatter from the body and parses types", () => {
    const [fm, body] = parseFrontmatter(
      '---\ntitle: "Hola mundo"\ndifficulty: 3\nmastery: 0.5\ndone: true\nskip: no\n' +
      'tags: [math, "física"]\nname: plain\n---\n# Cuerpo\n\ntexto',
    );
    expect(fm.title).toBe("Hola mundo");
    expect(fm.difficulty).toBe(3);
    expect(fm.mastery).toBe(0.5);
    expect(fm.done).toBe(true);
    expect(fm.skip).toBe(false);
    expect(fm.tags).toEqual(["math", "física"]);
    expect(fm.name).toBe("plain");
    expect(body).toBe("# Cuerpo\n\ntexto");
  });

  it("returns empty + original text when there is no frontmatter", () => {
    expect(parseFrontmatter("# solo cuerpo")).toEqual([{}, "# solo cuerpo"]);
    expect(parseFrontmatter("")).toEqual([{}, ""]);
  });

  it("handles CRLF frontmatter", () => {
    const [fm] = parseFrontmatter("---\r\nkey: value\r\n---\r\nbody");
    expect(fm.key).toBe("value");
  });
});

describe("dumpFrontmatter", () => {
  it("is empty for empty data", () => {
    expect(dumpFrontmatter({})).toBe("");
  });

  it("formats each type and quotes values with special chars", () => {
    const out = dumpFrontmatter({
      title: "plain", note: "has: colon", done: true, n: 3, tags: ["a", "b"],
    });
    expect(out).toBe(
      '---\ntitle: plain\nnote: "has: colon"\ndone: true\nn: 3\ntags: ["a", "b"]\n---\n',
    );
  });

  it("round-trips a simple document", () => {
    const src = "---\ntitle: X\ndone: false\n---\nbody";
    const [fm, body] = parseFrontmatter(src);
    expect(dumpFrontmatter(fm) + body).toBe(src);
  });
});

describe("updateFrontmatter", () => {
  it("injects and overwrites keys, dropping null", () => {
    const out = updateFrontmatter("---\na: 1\nb: 2\n---\nbody", { b: 3, c: 4, a: null });
    const [fm, body] = parseFrontmatter(out);
    expect(fm).toEqual({ b: 3, c: 4 });
    expect(body).toBe("body");
  });

  it("adds frontmatter to a note that had none", () => {
    const out = updateFrontmatter("# title\n", { subject: "mathematics" });
    expect(out.startsWith("---\nsubject: mathematics\n---\n")).toBe(true);
  });
});

describe("sanitizeProperties", () => {
  it("clamps mastery, difficulty and goal_level and wraps a string tag", () => {
    expect(sanitizeProperties({ mastery: 2 }).mastery).toBe(1);
    expect(sanitizeProperties({ mastery: "oops" }).mastery).toBe(0);
    expect(sanitizeProperties({ mastery: 0.126 }).mastery).toBe(0.13);
    expect(sanitizeProperties({ difficulty: 9 }).difficulty).toBe(5);
    expect(sanitizeProperties({ difficulty: 0 }).difficulty).toBe(1);
    expect(sanitizeProperties({ goal_level: 7 }).goal_level).toBe(4);
    expect(sanitizeProperties({ tags: "solo" }).tags).toEqual(["solo"]);
  });
});
