import { describe, expect, it } from "vitest";
import { GRID, gridBackgroundOffset, MIN_HEIGHT, MIN_WIDTH, resizeRect, snappedDelta, snapRect, snapTo } from "./canvas";

describe("snapping to the grid", () => {
  it("snaps to the nearest multiple of the grid, and does nothing when it is off", () => {
    expect(GRID).toBe(20);
    expect(snapTo(9, true)).toBe(0);
    expect(snapTo(11, true)).toBe(20);
    expect(snapTo(-24, true)).toBe(-20);
    expect(snapTo(37, false)).toBe(37);
  });

  it("the grid's dots fall on the multiples of the grid, where cards snap to", () => {
    // The background draws its dot at the CENTRE of each tile, so the tile starts half a cell before the origin.
    const cell = 20 * 0.525714;
    const dot = (viewPos: number) => gridBackgroundOffset(viewPos, cell) + cell / 2;
    expect(dot(60)).toBeCloseTo(60, 9); // world 0 is at screen 60: a dot is there
    expect(dot(317.143)).toBeCloseTo(317.143, 9);
    // and the dots that follow are one cell apart, i.e. world 20, 40, 60 …
    expect(dot(60) + cell).toBeCloseTo(60 + 20 * 0.525714, 9);
    // the old offset put every dot half a cell off the cards
    expect(60 + cell / 2 - 60).toBeCloseTo(cell / 2, 9);
  });
});

describe("moving a group of cards keeps its shape", () => {
  it("the dragged card lands on the grid and the others move by the same amount", () => {
    const anchor: [number, number] = [-24, 33]; // a card that was not on the grid
    const [dx, dy] = snappedDelta(anchor, 51, 12, true);
    expect(anchor[0] + dx).toBe(20); // -24 + 51 = 27 → 20
    expect(anchor[1] + dy).toBe(40); // 33 + 12 = 45 → 40
    // a neighbour 7 px to the right of the anchor keeps being 7 px to the right of it
    expect(-17 + dx - (anchor[0] + dx)).toBe(7);
  });

  it("moves by exactly the pointer's distance when snapping is off", () => {
    expect(snappedDelta([5, 5], 13.5, -4, false)).toEqual([13.5, -4]);
  });
});

describe("resizing keeps the opposite edge where it is and snaps the edge being dragged", () => {
  const r = { x: 100, y: 100, width: 200, height: 100 };

  it("right and bottom edges", () => {
    expect(resizeRect(r, "e", 41, 0, true)).toEqual({ x: 100, y: 100, width: 240, height: 100 });
    expect(resizeRect(r, "s", 0, 41, true)).toEqual({ x: 100, y: 100, width: 200, height: 140 });
  });

  it("left and top edges: the right and bottom edges stay exactly where they were", () => {
    const left = resizeRect(r, "w", -41, 0, true);
    expect(left.x).toBe(60);
    expect(left.x + left.width).toBe(300);
    const top = resizeRect(r, "n", 0, -41, true);
    expect(top.y).toBe(60);
    expect(top.y + top.height).toBe(200);
  });

  it("a card that starts off the grid keeps its far edge and puts the dragged one on the grid", () => {
    const off = { x: 107, y: 93, width: 203, height: 97 }; // right edge 310, bottom edge 190
    const w = resizeRect(off, "w", -30, 0, true);
    expect(w.x % GRID).toBe(0);
    expect(w.x + w.width).toBe(310);
    const e = resizeRect(off, "e", 23, 0, true);
    expect((e.x + e.width) % GRID).toBe(0);
    expect(e.x).toBe(107);
    const s = resizeRect(off, "s", 0, 19, true);
    expect((s.y + s.height) % GRID).toBe(0);
    expect(s.y).toBe(93);
  });

  it("corners move two edges", () => {
    expect(resizeRect(r, "se", 41, 41, true)).toEqual({ x: 100, y: 100, width: 240, height: 140 });
    expect(resizeRect(r, "nw", -41, -41, true)).toEqual({ x: 60, y: 60, width: 240, height: 140 });
    expect(resizeRect(r, "ne", 41, -41, true)).toEqual({ x: 100, y: 60, width: 240, height: 140 });
    expect(resizeRect(r, "sw", -41, 41, true)).toEqual({ x: 60, y: 100, width: 240, height: 140 });
  });

  it("never gets smaller than the minimum, and the far edge still does not move", () => {
    const e = resizeRect(r, "e", -500, 0, true);
    expect(e.width).toBe(MIN_WIDTH);
    expect(e.x).toBe(100);
    const w = resizeRect(r, "w", 500, 0, true);
    expect(w.width).toBe(MIN_WIDTH);
    expect(w.x + w.width).toBe(300);
    expect(resizeRect(r, "s", 0, -500, true).height).toBe(MIN_HEIGHT);
    const n = resizeRect(r, "n", 0, 500, true);
    expect(n.height).toBe(MIN_HEIGHT);
    expect(n.y + n.height).toBe(200);
  });

  it("with snapping off it follows the pointer exactly", () => {
    expect(resizeRect(r, "e", 13, 0, false)).toEqual({ x: 100, y: 100, width: 213, height: 100 });
    expect(resizeRect(r, "nw", -7, -9, false)).toEqual({ x: 93, y: 91, width: 207, height: 109 });
  });
});

describe("aligning what is already off the grid", () => {
  it("puts the four edges on the grid", () => {
    const a = snapRect({ x: -24, y: -48, width: 368, height: 412 });
    for (const v of [a.x, a.y, a.x + a.width, a.y + a.height]) expect(Math.abs(v % GRID)).toBe(0);
    expect(a.x).toBe(-20);
    expect(a.y).toBe(-40);
    expect(a.x + a.width).toBe(340);
  });

  it("is idempotent and keeps the minimum size", () => {
    const once = snapRect({ x: 13, y: 7, width: 205, height: 99 });
    expect(snapRect(once)).toEqual(once);
    const tiny = snapRect({ x: 1, y: 1, width: 3, height: 3 });
    expect(tiny.width).toBeGreaterThanOrEqual(MIN_WIDTH);
    expect(tiny.height).toBeGreaterThanOrEqual(MIN_HEIGHT);
  });
});
