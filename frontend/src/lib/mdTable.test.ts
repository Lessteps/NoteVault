import { describe, expect, it } from "vitest";
import { columnAt, editTable, formatTable, newTable, parseTable, splitRow, tableBounds } from "./mdTable";

const SRC = ["texto", "| a | b |", "|---|:-:|", "| 1 | 2 |", "| 3 | x\\|y |", "", "fin"];

describe("mdTable", () => {
  it("finds the table around a line", () => {
    expect(tableBounds(SRC, 3)).toEqual([1, 4]);
    expect(tableBounds(SRC, 0)).toBeNull();
    expect(tableBounds(["| solo |"], 0)).toBeNull();
  });

  it("keeps escaped pipes inside a cell", () => {
    expect(splitRow("| 3 | x\\|y |")).toEqual(["3", "x\\|y"]);
  });

  it("parses alignment and pads on format", () => {
    const t = parseTable(SRC.slice(1, 5));
    expect(t.aligns).toEqual(["none", "center"]);
    const out = formatTable(t);
    expect(out[1]).toBe("| --- | :--: |");
    expect(new Set(out.map((l) => l.length)).size).toBe(1);
  });

  it("adds and removes rows and columns", () => {
    const t = parseTable(SRC.slice(1, 5));
    expect(editTable(t, "row-below", 2, 0)!.rows.length).toBe(3);
    expect(editTable(t, "row-delete", 0, 0)!.rows.length).toBe(2);     // header stays
    const wide = editTable(t, "col-right", 2, 0)!;
    expect(wide.header).toEqual(["a", "", "b"]);
    expect(editTable(t, "col-delete", 2, 1)!.header).toEqual(["a"]);
    expect(editTable(parseTable(["| a |", "|---|"]), "col-delete", 0, 0)).toBeNull();
  });

  it("knows the column under the cursor and builds new tables", () => {
    expect(columnAt("| a | b |", 2)).toBe(0);
    expect(columnAt("| a | b |", 6)).toBe(1);
    const t = newTable(2, 3);
    expect(t.length).toBe(4);
    expect(splitRow(t[0]!)).toHaveLength(3);
  });
});
