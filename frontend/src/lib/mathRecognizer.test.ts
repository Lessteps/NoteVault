import { describe, expect, it } from "vitest";
import {
  isEqualsSign,
  isHorizontalBar,
  isPlusSign,
  isRadicalStroke,
  isVerticalBar,
  recognizeStrokesToLatex,
  type Stroke,
} from "./mathRecognizer";

describe("Math Heuristic Stroke Recognizer", () => {
  it("identifies horizontal and vertical bars", () => {
    // Horizontal bar (width 100, height 2)
    const horiz: Stroke = [
      { x: 10, y: 50 },
      { x: 50, y: 51 },
      { x: 110, y: 50 },
    ];
    expect(isHorizontalBar(horiz)).toBe(true);
    expect(isVerticalBar(horiz)).toBe(false);

    // Vertical bar (width 2, height 100)
    const vert: Stroke = [
      { x: 50, y: 10 },
      { x: 51, y: 60 },
      { x: 50, y: 110 },
    ];
    expect(isVerticalBar(vert)).toBe(true);
    expect(isHorizontalBar(vert)).toBe(false);
  });

  it("identifies equals sign from two parallel horizontal strokes", () => {
    const bar1: Stroke = [
      { x: 20, y: 40 },
      { x: 60, y: 41 },
    ];
    const bar2: Stroke = [
      { x: 21, y: 55 },
      { x: 59, y: 54 },
    ];

    expect(isEqualsSign(bar1, bar2)).toBe(true);

    const res = recognizeStrokesToLatex([bar1, bar2]);
    expect(res.latex).toBe("=");
    expect(res.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it("identifies plus sign from intersecting horizontal and vertical strokes", () => {
    const horiz: Stroke = [
      { x: 20, y: 50 },
      { x: 60, y: 50 },
    ];
    const vert: Stroke = [
      { x: 40, y: 30 },
      { x: 40, y: 70 },
    ];

    expect(isPlusSign(horiz, vert)).toBe(true);

    const res = recognizeStrokesToLatex([horiz, vert]);
    expect(res.latex).toBe("+");
  });

  it("recognizes fraction structure when strokes exist above and below a horizontal bar", () => {
    // Numerator stroke (above at y=20)
    const numStroke: Stroke = [
      { x: 45, y: 15 },
      { x: 55, y: 25 },
    ];

    // Fraction bar at y=50 (width 80)
    const fracBar: Stroke = [
      { x: 20, y: 50 },
      { x: 100, y: 50 },
    ];

    // Denominator stroke (below at y=80)
    const denStroke: Stroke = [
      { x: 45, y: 75 },
      { x: 55, y: 85 },
    ];

    const res = recognizeStrokesToLatex([fracBar, numStroke, denStroke]);
    expect(res.detectedStructures).toContain("fraction");
    expect(res.latex).toMatch(/^\\frac\{.+\}\{.+\}$/);
  });

  it("recognizes square root radical stroke", () => {
    // Radical stroke: small hook down, sharp ascent up, then roof to right
    const radical: Stroke = [
      { x: 10, y: 50 },
      { x: 20, y: 80 }, // vertex at bottom
      { x: 35, y: 20 }, // ascent
      { x: 80, y: 20 }, // horizontal roof
    ];

    expect(isRadicalStroke(radical)).toBe(true);

    // Inner stroke under the roof (x=45, y=50)
    const innerStroke: Stroke = [
      { x: 45, y: 40 },
      { x: 55, y: 60 },
    ];

    const res = recognizeStrokesToLatex([radical, innerStroke]);
    expect(res.detectedStructures).toContain("sqrt");
    expect(res.latex).toMatch(/^\\sqrt\{.+\}$/);
  });

  it("recognizes superscript exponents placed at upper right", () => {
    // Base stroke (x from 10 to 40, y from 40 to 80)
    const baseStroke: Stroke = [
      { x: 10, y: 40 },
      { x: 40, y: 80 },
    ];

    // Exponent stroke (x from 50 to 65, y from 15 to 30: upper right, smaller)
    const expStroke: Stroke = [
      { x: 50, y: 15 },
      { x: 65, y: 25 },
    ];

    const res = recognizeStrokesToLatex([baseStroke, expStroke]);
    expect(res.detectedStructures).toContain("superscript");
    expect(res.latex).toMatch(/\^\{.+\}/);
  });
});

describe("whole expressions from handwriting-like ink", () => {
  const line = (...pts: Array<[number, number]>): Stroke => pts.map(([x, y]) => ({ x, y }));
  /** Places a glyph's strokes (drawn in a 100-box) at (x, y) with the given height. */
  const put = (strokes: Stroke[], x: number, y: number, h: number): Stroke[] =>
    strokes.map((s) => s.map((p) => ({ x: x + (p.x * h) / 100, y: y + (p.y * h) / 100 })));

  const FIVE = [line([70, 8], [26, 8]), line([26, 8], [22, 46], [58, 42], [76, 62], [66, 88], [38, 94], [18, 82])];
  const TWO = [line([24, 28], [40, 8], [68, 10], [78, 34], [22, 92], [84, 92])];
  const ONE = [line([54, 6], [54, 94])];
  const THREE = [line([22, 14], [50, 6], [74, 24], [48, 46], [78, 66], [56, 94], [20, 84])];
  const X = [line([15, 15], [85, 85]), line([85, 15], [15, 85])];
  const PLUS = [line([15, 50], [85, 50]), line([50, 15], [50, 85])];

  it("reads a lone 5 as 5", () => {
    expect(recognizeStrokesToLatex(put(FIVE, 0, 0, 80)).latex).toBe("5");
  });

  it("reads digits side by side as one number", () => {
    const ink = [...put(ONE, 0, 0, 80), ...put(TWO, 60, 0, 80), ...put(THREE, 130, 0, 80)];
    expect(recognizeStrokesToLatex(ink).latex).toBe("123");
  });

  it("reads 2 + 3", () => {
    const ink = [...put(TWO, 0, 0, 80), ...put(PLUS, 90, 20, 45), ...put(THREE, 170, 0, 80)];
    expect(recognizeStrokesToLatex(ink).latex.replace(/\s+/g, "")).toBe("2+3");
  });

  it("reads x with a raised 2 as x^{2}", () => {
    const ink = [...put(X, 0, 30, 60), ...put(TWO, 70, 0, 30)];
    const res = recognizeStrokesToLatex(ink);
    expect(res.latex.replace(/\s+/g, "")).toBe("x^{2}");
    expect(res.detectedStructures).toContain("superscript");
  });

  it("reads a fraction with digits above and below the bar", () => {
    const ink = [line([0, 100], [90, 100]), ...put(ONE, 35, 10, 70), ...put(TWO, 30, 115, 70)];
    const BS = String.fromCharCode(92);
    expect(recognizeStrokesToLatex(ink).latex.replace(/\s+/g, "")).toBe(`${BS}frac{1}{2}`);
  });
});
