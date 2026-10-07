import { describe, expect, it } from "vitest";
import { anchorExtras, borderHit, edgePath, edgeT, portPoint, resizeHandleAt, RESIZE_CURSOR } from "./canvas";

const card = { x: 100, y: 100, width: 200, height: 100 };

describe("connecting from anywhere on a card's outline", () => {
  it("finds the outline within the tolerance, on both sides of the stroke", () => {
    expect(borderHit(card, 140, 100, 8)).toMatchObject({ side: "top", y: 100 }); // on the stroke
    expect(borderHit(card, 140, 95, 8)).toMatchObject({ side: "top" }); // just outside
    expect(borderHit(card, 140, 105, 8)).toMatchObject({ side: "top" }); // just inside
    expect(borderHit(card, 140, 120, 8)).toBeNull(); // deeper inside: that is the body, it moves the card
    expect(borderHit(card, 140, 80, 8)).toBeNull(); // too far outside
  });

  it("returns the exact point and how far along the side it is, not the middle of the side", () => {
    const hit = borderHit(card, 130, 101, 8)!;
    expect(hit).toMatchObject({ side: "top", x: 130, y: 100 });
    expect(hit.t).toBeCloseTo(0.15, 5);
    const right = borderHit(card, 301, 120, 8)!;
    expect(right).toMatchObject({ side: "right", x: 300, y: 120 });
    expect(right.t).toBeCloseTo(0.2, 5);
  });

  it("works on all four sides, not only the top", () => {
    expect(borderHit(card, 150, 200, 8)).toMatchObject({ side: "bottom", y: 200 });
    expect(borderHit(card, 100, 150, 8)).toMatchObject({ side: "left", x: 100 });
    expect(borderHit(card, 300, 130, 8)).toMatchObject({ side: "right", x: 300 });
  });

  it("sticks to the middle of a side so aligned lines are easy", () => {
    expect(borderHit(card, 203, 100, 8)).toMatchObject({ side: "top", t: 0.5, x: 200 });
    expect(borderHit(card, 215, 100, 8)!.t).not.toBe(0.5);
  });

  it("a corner belongs to the nearest side and never produces a point off the outline", () => {
    const hit = borderHit(card, 103, 102, 8)!;
    expect(hit.t).toBeGreaterThanOrEqual(0);
    expect(hit.t).toBeLessThanOrEqual(1);
    // just beyond the end of a side is farther from it than from the corner
    expect(borderHit(card, 320, 100, 8)).toBeNull();
    expect(borderHit(card, 305, 95, 8)).not.toBeNull();
  });

  it("a small card keeps a body to grab: the inner band never exceeds a quarter of its smaller side", () => {
    const small = { x: 0, y: 0, width: 24, height: 24 };
    expect(borderHit(small, 12, 12, 8)).toBeNull(); // the centre is the body
    expect(borderHit(small, 12, 2, 8)).toMatchObject({ side: "top" });
    expect(borderHit(small, 12, 7, 8)).toBeNull(); // 7 px inside is more than a quarter of 24
  });

  it("a wider tolerance (zoomed out) still finds the outline", () => {
    expect(borderHit(card, 140, 90, 8 / 0.25)).toMatchObject({ side: "top" });
  });
});

describe("edge anchors", () => {
  it("an anchor travels along its side and stays on the outline", () => {
    expect(portPoint(card, "top", 0)).toEqual([100, 100]);
    expect(portPoint(card, "top", 0.25)).toEqual([150, 100]);
    expect(portPoint(card, "bottom", 1)).toEqual([300, 200]);
    expect(portPoint(card, "left", 0.5)).toEqual([100, 150]);
    expect(portPoint(card, "right", 0.2)).toEqual([300, 120]);
    expect(portPoint(card, "top", -4)).toEqual([100, 100]); // clamped
    expect(portPoint(card, "top", 9)).toEqual([300, 100]);
    expect(portPoint(card, "top")).toEqual([200, 100]); // the middle is still the default
  });

  it("is stored in the edge's nv extras and absent for the middle, so the file stays a plain Obsidian canvas", () => {
    expect(anchorExtras(0.5, 0.5)).toBeUndefined();
    expect(anchorExtras(0.3, 0.5)).toEqual({ fromT: 0.3 });
    expect(anchorExtras(0.5, 0.82)).toEqual({ toT: 0.82 });
    expect(anchorExtras(0.123456, 0.9)).toEqual({ fromT: 0.123, toT: 0.9 });
    expect(edgeT({}, "from")).toBe(0.5);
    expect(edgeT({ nv: { fromT: 0.3, toT: 2 } }, "from")).toBe(0.3);
    expect(edgeT({ nv: { fromT: 0.3, toT: 2 } }, "to")).toBe(1);
    expect(edgeT({ nv: { toT: "x" } }, "to")).toBe(0.5);
  });

  it("the curve starts exactly where the connection was grabbed", () => {
    const other = { x: 500, y: 100, width: 200, height: 100 };
    const middle = edgePath(card, "right", other, "left");
    const grabbed = edgePath(card, "right", other, "left", 0.2, 0.8);
    expect(middle.d.startsWith("M300,150 ")).toBe(true);
    expect(grabbed.d.startsWith("M300,120 ")).toBe(true);
    expect(grabbed.d.endsWith(" 500,180")).toBe(true);
  });
});

describe("which handle a point of the outline stands for", () => {
  const at = (x: number, y: number, tol = 8, corner = 14) => resizeHandleAt(card, borderHit(card, x, y, tol)!, corner);

  it("the middle of a side is that side, wherever along it", () => {
    expect(at(150, 100)).toBe("n");
    expect(at(280, 100 + 1)).toBe("n");
    expect(at(190, 200)).toBe("s");
    expect(at(100, 130)).toBe("w");
    expect(at(300, 170)).toBe("e");
  });

  it("within the corner zone it is the corner, on both of its sides", () => {
    expect(at(102, 100)).toBe("nw");
    expect(at(100, 102)).toBe("nw");
    expect(at(298, 100)).toBe("ne");
    expect(at(300, 103)).toBe("ne");
    expect(at(299, 200)).toBe("se");
    expect(at(101, 199)).toBe("sw");
  });

  it("the corner zone is limited to a third of the side, so a small card still has a middle", () => {
    const small = { x: 0, y: 0, width: 30, height: 30 };
    const hit = borderHit(small, 15, 0, 8)!;
    expect(resizeHandleAt(small, hit, 14)).toBe("n");
    expect(resizeHandleAt(small, { side: "top", t: 0.05 }, 14)).toBe("nw");
  });

  it("every handle has a pointer that shows how it stretches", () => {
    expect(RESIZE_CURSOR).toEqual({
      n: "cursor-ns-resize", s: "cursor-ns-resize", e: "cursor-ew-resize", w: "cursor-ew-resize",
      ne: "cursor-nesw-resize", sw: "cursor-nesw-resize", nw: "cursor-nwse-resize", se: "cursor-nwse-resize",
    });
    for (const c of Object.values(RESIZE_CURSOR)) expect(c).not.toMatch(/crosshair/);
  });
});
