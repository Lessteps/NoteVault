/**
 * Local heuristic stroke and shape recognition for math drawings.
 * Maps drawn structures to LaTeX (fractions, radicals, superscripts, subscripts, basic operators).
 * Offline, fast, and deterministic — no vision model required.
 */

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
 * Simple classification of a single glyph stroke into elementary characters.
 */
function classifySingleStroke(stroke: Stroke): string {
  if (isHorizontalBar(stroke)) return "-";
  if (isVerticalBar(stroke)) return "|";
  if (isRadicalStroke(stroke)) return "\\sqrt{}";

  const bb = getBoundingBox(stroke);
  // Small circle or dot
  if (bb.width < 12 && bb.height < 12) return "\\cdot";

  // Circle or 0
  const ratio = bb.width / bb.height;
  if (ratio > 0.6 && ratio < 1.4 && stroke.length >= 8) {
    const start = stroke[0]!;
    const end = stroke[stroke.length - 1]!;
    const dist = Math.hypot(start.x - end.x, start.y - end.y);
    if (dist < bb.width * 0.4) return "0";
  }

  // Fallback: placeholder character x
  return "x";
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

  // 4. Superscript / Exponent check
  // Sort strokes horizontally left to right
  const sorted = [...validStrokes].sort((a, b) => {
    return getBoundingBox(a).minX - getBoundingBox(b).minX;
  });

  if (sorted.length >= 2) {
    const firstBB = getBoundingBox(sorted[0]!);
    const secondBB = getBoundingBox(sorted[1]!);

    // If second stroke is noticeably higher and smaller to the right
    const isHigher = secondBB.centerY < firstBB.minY + firstBB.height * 0.45;
    const isSmaller = secondBB.height <= firstBB.height * 0.8;
    const isRight = secondBB.minX >= firstBB.centerX;

    if (isHigher && isSmaller && isRight) {
      detected.push("superscript");
      const baseLatex = classifySingleStroke(sorted[0]!);
      const expLatex = classifySingleStroke(sorted[1]!);
      const rest = sorted.slice(2);
      const restLatex = rest.length > 0 ? " " + recognizeStrokesToLatex(rest).latex : "";
      return {
        latex: `${baseLatex}^{${expLatex}}${restLatex}`.trim(),
        confidence: 0.85,
        detectedStructures: detected,
      };
    }
  }

  // 5. Sequential glyph recognition
  const pieces: string[] = [];
  for (let i = 0; i < sorted.length; i++) {
    // Check if current and next form an equals or plus
    if (i < sorted.length - 1 && isEqualsSign(sorted[i]!, sorted[i + 1]!)) {
      pieces.push("=");
      detected.push("equals");
      i++;
      continue;
    }
    if (i < sorted.length - 1 && isPlusSign(sorted[i]!, sorted[i + 1]!)) {
      pieces.push("+");
      detected.push("plus");
      i++;
      continue;
    }
    const glyph = classifySingleStroke(sorted[i]!);
    pieces.push(glyph);
  }

  return {
    latex: pieces.join(" "),
    confidence: 0.75,
    detectedStructures: detected,
  };
}
