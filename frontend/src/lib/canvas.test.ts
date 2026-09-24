import { describe, expect, it } from "vitest";
import { cloneNodes, drawingNode, edgePath, nearestSide, pruneEdges, shapePath, SHAPES, type CanvasDoc } from "./canvas";

const doc: CanvasDoc = {
  nodes: [
    { id: "a", type: "text", x: 0, y: 0, width: 100, height: 50, text: "A" },
    { id: "b", type: "text", x: 300, y: 0, width: 100, height: 50, text: "B" },
  ],
  edges: [{ id: "e", fromNode: "a", toNode: "b", fromSide: "right", toSide: "left" }],
};

describe("canvas geometry", () => {
  it("draws edges from port to port", () => {
    const { d, mid } = edgePath(doc.nodes[0]!, "right", doc.nodes[1]!, "left");
    expect(d.startsWith("M100,25 ")).toBe(true);
    expect(d.endsWith(" 300,25")).toBe(true);
    expect(mid).toEqual([200, 25]);
  });

  it("finds the side facing a point", () => {
    const n = doc.nodes[0]!;
    expect(nearestSide(n, 500, 25)).toBe("right");
    expect(nearestSide(n, 50, -300)).toBe("top");
  });

  it("clones nodes with their inner edges and prunes dangling ones", () => {
    const copy = cloneNodes(doc, new Set(["a", "b"]), 10, 20);
    expect(copy.nodes.map((n) => [n.x, n.y])).toEqual([[10, 20], [310, 20]]);
    expect(copy.edges).toHaveLength(1);
    expect(copy.edges[0]!.fromNode).toBe(copy.nodes[0]!.id);
    expect(pruneEdges({ nodes: [doc.nodes[0]!], edges: doc.edges }).edges).toEqual([]);
  });

  it("turns freehand points into a local drawing", () => {
    const n = drawingNode([[100, 100], [150, 120]], "2", 3)!;
    expect(n.type).toBe("nv-drawing");
    const pts = n.nv!.strokes![0]!.points;
    expect(pts[0]).toEqual([100 - n.x, 100 - n.y]);
    expect(drawingNode([[1, 1]], "1", 3)).toBeNull();
  });

  it("has a path for every shape", () => {
    for (const s of SHAPES) expect(shapePath(s.id, s.w, s.h)).toMatch(/^M/);
  });
});
