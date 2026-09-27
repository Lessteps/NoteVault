// Canvas box sizing: text cards must be tall enough for their text, and growing
// them must not make cards overlap.

import { describe, expect, it } from "vitest";
import { CanvasDoc, CanvasNode } from "./canvasFormat";
import { fixCanvasBoxes, requiredTextHeight, shortBoxes } from "./boxSizing";

const text = (id: string, x: number, y: number, w: number, h: number, body: string) =>
  new CanvasNode({ id, type: "text", x, y, width: w, height: h, text: body });

const group = (id: string, x: number, y: number, w: number, h: number, label = "Bloque") =>
  new CanvasNode({ id, type: "group", x, y, width: w, height: h, label });

/** 40 lines of text do not fit in a 200 px card. */
const LONG = Array.from({ length: 40 }, (_, i) => `linea ${i} del contenido`).join("\n");

describe("requiredTextHeight", () => {
  it("grows with the text and never goes below the minimum", () => {
    expect(requiredTextHeight("hola", 320)).toBe(70);
    expect(requiredTextHeight(LONG, 320)).toBeGreaterThan(300);
    // Narrower cards need more lines for the same text.
    expect(requiredTextHeight(LONG, 200)).toBeGreaterThan(requiredTextHeight(LONG, 400));
  });
});

describe("fixCanvasBoxes", () => {
  it("grows a card to fit its text", () => {
    const doc = new CanvasDoc([text("a", 0, 0, 320, 120, LONG)], []);
    expect(shortBoxes(doc)).toHaveLength(1);

    const { doc: fixed, fix } = fixCanvasBoxes(doc);
    expect(shortBoxes(fixed)).toEqual([]);
    expect(fix.grown).toBe(1);
    expect(fixed.nodes[0]!.height).toBeGreaterThanOrEqual(requiredTextHeight(LONG, 320));
    // The original document is not touched.
    expect(doc.nodes[0]!.height).toBe(120);
  });

  it("pushes the card below instead of overlapping it", () => {
    const doc = new CanvasDoc(
      [
        text("top", 0, 0, 320, 100, LONG),
        text("below", 0, 140, 320, 100, "corto"),
      ],
      [],
    );
    const { doc: fixed } = fixCanvasBoxes(doc, 20);
    const [top, below] = ["top", "below"].map((id) => fixed.nodes.find((n) => n.id === id)!);
    expect(shortBoxes(fixed)).toEqual([]);
    expect(below!.y).toBeGreaterThanOrEqual(top!.y + top!.height + 20);
  });

  it("leaves side-by-side cards alone", () => {
    const doc = new CanvasDoc(
      [
        text("left", 0, 0, 300, 100, LONG),
        text("right", 400, 0, 300, 100, "corto"),
      ],
      [],
    );
    const { doc: fixed } = fixCanvasBoxes(doc);
    expect(fixed.nodes.find((n) => n.id === "right")!.y).toBe(0);
  });

  it("grows the group that wraps the cards it pushed down", () => {
    const doc = new CanvasDoc(
      [
        group("g", -20, -20, 400, 300),
        text("a", 0, 0, 320, 100, LONG),
        text("b", 0, 140, 320, 100, "otra linea"),
      ],
      [],
    );
    const { doc: fixed, fix } = fixCanvasBoxes(doc);
    const g = fixed.nodes.find((n) => n.id === "g")!;
    const b = fixed.nodes.find((n) => n.id === "b")!;
    expect(fix.groups).toBe(1);
    expect(g.height).toBeGreaterThan(300);
    expect(b.y + b.height).toBeLessThanOrEqual(g.y + g.height);
  });

  it("does nothing the second time", () => {
    const doc = new CanvasDoc([text("a", 0, 0, 320, 100, LONG), text("b", 0, 140, 320, 100, "x")], []);
    const once = fixCanvasBoxes(doc).doc;
    const twice = fixCanvasBoxes(once);
    expect(twice.fix.grown).toBe(0);
    expect(twice.fix.moved).toBe(0);
    expect(twice.fix.groups).toBe(0);
    expect(twice.doc.nodes.map((n) => [n.id, n.y, n.height])).toEqual(once.nodes.map((n) => [n.id, n.y, n.height]));
  });
});
