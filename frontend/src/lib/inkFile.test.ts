import { describe, expect, it } from "vitest";
import { inkNoteText, latexForNote, readInk, writeInk, type InkStroke } from "./inkFile";
import { viewFileKind } from "./viewFiles";

describe("ink files", () => {
  it("is a dibujo view file", () => {
    expect(viewFileKind({ type: "dibujo" })).toBe("dibujo");
  });

  it("starts empty and round-trips strokes and latex without touching the rest", () => {
    const raw = inkNoteText("Dibujo LaTeX 1") + "\nMis apuntes.\n";
    expect(readInk(raw)).toEqual([]);
    const strokes: InkStroke[] = [
      { done: false, points: [[1.234, 2], [3, 4.56]] },
      { done: true, points: [[10, 10], [20, 20]] },
    ];
    const next = writeInk(raw, strokes, "x^{2}");
    expect(next).toContain("Mis apuntes.");
    expect(next).toContain("x^{2}");
    expect(readInk(next)).toEqual([
      { done: false, points: [[1.2, 2], [3, 4.6]] },
      { done: true, points: [[10, 10], [20, 20]] },
    ]);
    // Writing again replaces, it does not pile up.
    expect(writeInk(next, strokes, "y").match(/nv:ink/g)?.length).toBe(1);
    expect(writeInk(next, strokes, "y")).not.toContain("x^{2}");
  });

  it("survives a corrupt stroke comment", () => {
    expect(readInk("<!-- nv:ink {no json -->")).toEqual([]);
  });

  it("wraps latex for a note", () => {
    expect(latexForNote(" x^2 ", false)).toBe("$x^2$");
    expect(latexForNote("x^2", true)).toBe("\n$$\nx^2\n$$\n");
  });
});
