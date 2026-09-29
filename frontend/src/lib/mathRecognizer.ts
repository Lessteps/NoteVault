/**
 * Local heuristic stroke and shape recognition for math drawings.
 * Maps drawn structures to LaTeX (fractions, radicals, superscripts, subscripts, basic operators).
 * Offline, fast, and deterministic — no vision model required.
 */

import { classifyGlyph } from "./glyphRecognizer";

export interface Point {
  x: number;
  y: number;
}

export type Stroke = Point[];

export interface BoundingBox {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
}

export interface RecognitionResult {
  latex: string;
  confidence: number; // 0..1
  detectedStructures: string[];
}

export function getBoundingBox(stroke: Stroke): BoundingBox {
  if (stroke.length === 0) {
    return { minX: 0, maxX: 0, minY: 0, maxY: 0, width: 0, height: 0, centerX: 0, centerY: 0 };
  }
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const pt of stroke) {
    if (pt.x < minX) minX = pt.x;
    if (pt.x > maxX) maxX = pt.x;
    if (pt.y < minY) minY = pt.y;
    if (pt.y > maxY) maxY = pt.y;
  }

  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, maxY - minY);
  return {
    minX,
    maxX,
    minY,
    maxY,
    width,
    height,
    centerX: minX + width / 2,
    centerY: minY + height / 2,
  };
}

export function getCombinedBoundingBox(strokes: Stroke[]): BoundingBox {
  if (strokes.length === 0) {
    return { minX: 0, maxX: 0, minY: 0, maxY: 0, width: 0, height: 0, centerX: 0, centerY: 0 };
  }
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const stroke of strokes) {
    const bb = getBoundingBox(stroke);
    if (bb.minX < minX) minX = bb.minX;
    if (bb.maxX > maxX) maxX = bb.maxX;
    if (bb.minY < minY) minY = bb.minY;
    if (bb.maxY > maxY) maxY = bb.maxY;
  }

  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, maxY - minY);
  return {
    minX,
    maxX,
    minY,
    maxY,
    width,
    height,
    centerX: minX + width / 2,
    centerY: minY + height / 2,
  };
}

/**
 * Checks if a stroke is predominantly a straight horizontal line.
 */
export function isHorizontalBar(stroke: Stroke): boolean {
  if (stroke.length < 2) return false;
  const bb = getBoundingBox(stroke);
  if (bb.width < 15) return false;
  const ratio = bb.width / bb.height;
  if (ratio < 2.8) return false;

  const startPt = stroke[0]!;
  const endPt = stroke[stroke.length - 1]!;
  const xSpan = Math.abs(endPt.x - startPt.x);
  const ySpan = Math.abs(endPt.y - startPt.y);

  return xSpan >= bb.width * 0.75 && ySpan <= Math.max(8, bb.height * 0.85);
}

/**
 * Checks if a stroke is predominantly a straight vertical line.
 */
export function isVerticalBar(stroke: Stroke): boolean {
  if (stroke.length < 2) return false;
  const bb = getBoundingBox(stroke);
  if (bb.height < 15) return false;
  const ratio = bb.height / bb.width;
  if (ratio < 2.8) return false;

  const startPt = stroke[0]!;
  const endPt = stroke[stroke.length - 1]!;
  const xSpan = Math.abs(endPt.x - startPt.x);
  const ySpan = Math.abs(endPt.y - startPt.y);

  return ySpan >= bb.height * 0.75 && xSpan <= Math.max(8, bb.width * 0.85);
}

/**
 * Detects whether a stroke looks like a square root / radical symbol:
 * typically has a downward hook/vertex followed by an upward ascent and horizontal roof.
 */
export function isRadicalStroke(stroke: Stroke): boolean {
  if (stroke.length < 4) return false;
  const bb = getBoundingBox(stroke);
  if (bb.width < 20 || bb.height < 20) return false;

  // Find lowest point (vertex of V)
  let lowestIdx = 0;
  let maxY = -Infinity;
  for (let i = 0; i < stroke.length; i++) {
    const pt = stroke[i]!;
    if (pt.y > maxY) {
      maxY = pt.y;
      lowestIdx = i;
    }
  }

  // The vertex must be in the first 65% of the stroke points
  if (lowestIdx < 1 || lowestIdx > stroke.length * 0.65) {
    return false;
  }

  // Points after vertex must ascend
  const afterVertex = stroke.slice(lowestIdx);
  const highestAfterIdx = afterVertex.reduce(
    (minI, pt, idx, arr) => (pt.y < arr[minI]!.y ? idx : minI),
    0,
  );

  const highestAfter = afterVertex[highestAfterIdx]!;
  const vertex = stroke[lowestIdx]!;

  const ascent = vertex.y - highestAfter.y;
  return ascent >= bb.height * 0.5;
}

/**
 * Checks if two strokes form an equals sign (=).
 */
export function isEqualsSign(stroke1: Stroke, stroke2: Stroke): boolean {
  if (!isHorizontalBar(stroke1) || !isHorizontalBar(stroke2)) return false;
  const bb1 = getBoundingBox(stroke1);
  const bb2 = getBoundingBox(stroke2);

  const xOverlap = Math.min(bb1.maxX, bb2.maxX) - Math.max(bb1.minX, bb2.minX);
  const minWidth = Math.min(bb1.width, bb2.width);
  if (xOverlap < minWidth * 0.5) return false;

  const yGap = Math.abs(bb1.centerY - bb2.centerY);
  return yGap > 4 && yGap < Math.max(bb1.width, bb2.width) * 0.8;
}

/**
 * Checks if two strokes form a plus sign (+).
 */
export function isPlusSign(stroke1: Stroke, stroke2: Stroke): boolean {
  const h = isHorizontalBar(stroke1) ? stroke1 : isHorizontalBar(stroke2) ? stroke2 : null;
  const v = isVerticalBar(stroke1) ? stroke1 : isVerticalBar(stroke2) ? stroke2 : null;
  if (!h || !v || h === v) return false;

  const bbh = getBoundingBox(h);
  const bbv = getBoundingBox(v);

  const xDist = Math.abs(bbh.centerX - bbv.centerX);
  const yDist = Math.abs(bbh.centerY - bbv.centerY);

  return xDist < bbh.width * 0.35 && yDist < bbv.height * 0.35;
}

/**
 * Recursively parses and recognizes a collection of drawn strokes into LaTeX.
 */
export function recognizeStrokesToLatex(strokes: Stroke[]): RecognitionResult {
  if (!strokes || strokes.length === 0) {
    return { latex: "", confidence: 1, detectedStructures: [] };
  }

  const detected: string[] = [];

  // Filter out tiny accidental taps/noise
  const validStrokes = strokes.filter((s) => s.length >= 2);
  if (validStrokes.length === 0) {
    return { latex: "", confidence: 0, detectedStructures: [] };
  }

  // 1. Check for Fraction (Horizontal bar with strokes strictly above and below)
  for (let i = 0; i < validStrokes.length; i++) {
    const candidateBar = validStrokes[i]!;
    if (isHorizontalBar(candidateBar)) {
      const barBB = getBoundingBox(candidateBar);
      const otherStrokes = validStrokes.filter((_, idx) => idx !== i);

      const aboveStrokes: Stroke[] = [];
      const belowStrokes: Stroke[] = [];
      const leftStrokes: Stroke[] = [];
      const rightStrokes: Stroke[] = [];

      for (const other of otherStrokes) {
        const obb = getBoundingBox(other);
        // Does it lie horizontally within the bar's x-span (with slight margin)?
        const xEnclosed = obb.centerX >= barBB.minX - 10 && obb.centerX <= barBB.maxX + 10;

        if (xEnclosed) {
          if (obb.centerY < barBB.minY) {
            aboveStrokes.push(other);
          } else if (obb.centerY > barBB.maxY) {
            belowStrokes.push(other);
          }
        } else if (obb.maxX < barBB.minX) {
          leftStrokes.push(other);
        } else if (obb.minX > barBB.maxX) {
          rightStrokes.push(other);
        }
      }

      // If there are both elements above and below, this is definitely a fraction!
      if (aboveStrokes.length > 0 && belowStrokes.length > 0) {
        detected.push("fraction");
        const leftPart = leftStrokes.length > 0 ? recognizeStrokesToLatex(leftStrokes).latex + " " : "";
        const rightPart = rightStrokes.length > 0 ? " " + recognizeStrokesToLatex(rightStrokes).latex : "";
        const numPart = recognizeStrokesToLatex(aboveStrokes).latex || "1";
        const denPart = recognizeStrokesToLatex(belowStrokes).latex || "2";

        return {
          latex: `${leftPart}\\frac{${numPart}}{${denPart}}${rightPart}`.trim(),
          confidence: 0.92,
          detectedStructures: detected,
        };
      }
    }
  }

  // 2. Check for Radical / Square Root (\sqrt{...})
  for (let i = 0; i < validStrokes.length; i++) {
    const candidateRad = validStrokes[i]!;
    if (isRadicalStroke(candidateRad)) {
      const radBB = getBoundingBox(candidateRad);
      const otherStrokes = validStrokes.filter((_, idx) => idx !== i);

      const insideStrokes: Stroke[] = [];
      const leftStrokes: Stroke[] = [];
      const rightStrokes: Stroke[] = [];

      for (const other of otherStrokes) {
        const obb = getBoundingBox(other);
        if (obb.minX >= radBB.centerX - 10 && obb.maxX <= radBB.maxX + 30 && obb.centerY > radBB.minY) {
          insideStrokes.push(other);
        } else if (obb.maxX < radBB.centerX) {
          leftStrokes.push(other);
        } else {
          rightStrokes.push(other);
        }
      }

      detected.push("sqrt");
      const leftPart = leftStrokes.length > 0 ? recognizeStrokesToLatex(leftStrokes).latex + " " : "";
      const rightPart = rightStrokes.length > 0 ? " " + recognizeStrokesToLatex(rightStrokes).latex : "";
      const insidePart = insideStrokes.length > 0 ? recognizeStrokesToLatex(insideStrokes).latex : "x";

      return {
        latex: `${leftPart}\\sqrt{${insidePart}}${rightPart}`.trim(),
        confidence: 0.9,
        detectedStructures: detected,
      };
    }
  }

  // 3. Two-stroke operators: = or +
  if (validStrokes.length === 2) {
    if (isEqualsSign(validStrokes[0]!, validStrokes[1]!)) {
      return { latex: "=", confidence: 0.95, detectedStructures: ["equals"] };
    }
    if (isPlusSign(validStrokes[0]!, validStrokes[1]!)) {
      return { latex: "+", confidence: 0.95, detectedStructures: ["plus"] };
    }
  }

  // 4. Glyphs left to right, then super/subscripts by geometry.
  const glyphs = groupIntoGlyphs(validStrokes).map(readGlyph);
  const latex = layoutGlyphs(glyphs, detected);
  const score = glyphs.length ? glyphs.reduce((a, g) => a + g.score, 0) / glyphs.length : 0;
  return {
    latex,
    confidence: Math.min(0.95, Math.max(0.2, score)),
    detectedStructures: detected,
  };
}

interface Glyph {
  latex: string;
  bb: BoundingBox;
  /** 0..1, how sure the recogniser is */
  score: number;
}

/**
 * Strokes that belong to one character: they overlap horizontally AND sit close
 * vertically (a 5's bar and body, the two bars of =, the cross of + or x). An
 * exponent written above-right of its base is far enough away to stay separate.
 */
export function groupIntoGlyphs(strokes: Stroke[]): Stroke[][] {
  const sorted = [...strokes].sort((a, b) => getBoundingBox(a).minX - getBoundingBox(b).minX);
  const groups: Stroke[][] = [];
  for (const stroke of sorted) {
    const last = groups[groups.length - 1];
    if (last) {
      const gb = getCombinedBoundingBox(last);
      const sb = getBoundingBox(stroke);
      // Intervals are inflated a little: a vertical stroke has no width at all.
      const tol = 2;
      const overlap = Math.min(gb.maxX, sb.maxX) + tol - (Math.max(gb.minX, sb.minX) - tol);
      const narrow = Math.max(4, Math.min(gb.width, sb.width));
      const gap = Math.max(0, Math.max(gb.minY, sb.minY) - Math.min(gb.maxY, sb.maxY));
      const scale = Math.max(gb.height, sb.height, narrow * 0.6);
      if (overlap >= 0.3 * narrow && gap <= 0.35 * scale) {
        last.push(stroke);
        continue;
      }
    }
    groups.push([stroke]);
  }
  return groups;
}

/** The character a group of strokes stands for. */
function readGlyph(strokes: Stroke[]): Glyph {
  const bb = getCombinedBoundingBox(strokes);
  if (strokes.length === 1) {
    const only = strokes[0]!;
    if (isHorizontalBar(only)) return { latex: "-", bb, score: 0.9 };
    if (bb.width < 12 && bb.height < 12) return { latex: "\\cdot", bb, score: 0.7 };
  }
  if (strokes.length === 2) {
    if (isEqualsSign(strokes[0]!, strokes[1]!)) return { latex: "=", bb, score: 0.95 };
    if (isPlusSign(strokes[0]!, strokes[1]!)) return { latex: "+", bb, score: 0.95 };
  }
  const best = classifyGlyph(strokes, 1)[0];
  if (!best || best.score < 0.45) return { latex: "?", bb, score: best?.score ?? 0 };
  return { latex: best.latex, bb, score: best.score };
}

/** Lays glyphs out left to right; smaller, raised (or lowered) ones after a base become its script. */
function layoutGlyphs(glyphs: Glyph[], detected: string[]): string {
  let out = "";
  let base: Glyph | null = null;
  let scriptKind: "sup" | "sub" | null = null;
  let script = "";
  const flush = () => {
    if (scriptKind && script) {
      out += `${scriptKind === "sup" ? "^" : "_"}{${script}}`;
      detected.push(scriptKind === "sup" ? "superscript" : "subscript");
    }
    scriptKind = null;
    script = "";
  };

  for (const g of glyphs) {
    if (base) {
      const small = g.bb.height <= base.bb.height * 0.75;
      const right = g.bb.minX >= base.bb.centerX;
      const raised = g.bb.centerY < base.bb.minY + base.bb.height * 0.45;
      const lowered = g.bb.centerY > base.bb.maxY - base.bb.height * 0.2;
      const kind = small && right ? (raised ? "sup" : lowered ? "sub" : null) : null;
      if (kind) {
        if (scriptKind && scriptKind !== kind) flush();
        scriptKind = kind;
        script += g.latex;
        continue;
      }
    }
    flush();
    // Digits written one after another are one number, not "1 7".
    const joins = /\d$/.test(out) && /^\d$/.test(g.latex);
    out += (out && !joins ? " " : "") + g.latex;
    base = g;
  }
  flush();
  return out.trim();
}
