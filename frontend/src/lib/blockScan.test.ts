import { describe, expect, it } from "vitest";
import { scanBlocks } from "./blockScan";
import { parseTable, serializeTable, splitRow, cleanCell } from "./tableMd";

describe("scanBlocks", () => {
  it("finds frontmatter, tables, math and rules, and skips fenced code", () => {
    const lines = [
      "---", "title: x", "---", "",
      "Texto", "",
      "| a | b |", "| - | - |", "| 1 | 2 |", "",
      "$$", "x^2", "$$", "",
      "$$y=1$$", "",
      "```", "| no | tabla |", "| - | - |", "$$", "```", "",
      "***", "",
      "Título", "---",
    ];
    expect(scanBlocks(lines)).toEqual([
      { kind: "frontmatter", from: 0, to: 2 },
      { kind: "table", from: 6, to: 8 },
      { kind: "math", from: 10, to: 12 },
      { kind: "math", from: 14, to: 14 },
      { kind: "hr", from: 22, to: 22 },
    ]);
  });

  it("does not treat an unclosed --- on line 1 as frontmatter", () => {
    expect(scanBlocks(["---", "sin cierre"]).map((b) => b.kind)).toEqual(["hr"]);
  });
});

describe("tableMd", () => {
  it("splits on unescaped pipes only", () => {
    expect(splitRow("| a \\| b | c |")).toEqual(["a \\| b", "c"]);
  });

  it("round-trips a table and keeps alignment", () => {
    const model = parseTable(["| Nombre | N |", "|:--|--:|", "| Ana | 1 |", "| Luis | 22 |"])!;
    expect(model.align).toEqual(["l", "r"]);
    const text = serializeTable(model);
    expect(parseTable(text.split("\n"))).toEqual(model);
    expect(text.split("\n")[1]).toMatch(/^\| :-+ \| -+: \|$/);
  });

  it("pads short rows and cleans typed cells", () => {
    const model = parseTable(["| a | b |", "| - | - |", "| 1 |"])!;
    expect(model.rows).toEqual([["1", ""]]);
    expect(cleanCell("a | b\nc")).toBe("a \\| b c");
  });

  it("is not a table without a delimiter row", () => {
    expect(parseTable(["| a | b |", "| 1 | 2 |"])).toBeNull();
  });
});
