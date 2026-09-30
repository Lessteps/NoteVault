/**
 * Handwritten glyph recognition (digits and the usual math marks) with the $P
 * point-cloud recogniser: stroke order, direction and count do not matter, which
 * is what handwriting is like (a 5 drawn as one stroke or two is the same 5).
 *
 * Templates are idealised skeletons drawn in a 100x100 box (y grows downwards),
 * several variants per glyph, each also slanted and squeezed a little, so the
 * matcher tolerates the way people actually write. Offline and deterministic.
 */

export interface GlyphPoint {
  x: number;
  y: number;
}
export type GlyphStroke = GlyphPoint[];

type Pt = [number, number];

/** An arc of an ellipse, angles in degrees (0 = right, 90 = down, as on screen). */
function arc(cx: number, cy: number, rx: number, ry: number, from: number, to: number, n = 24): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= n; i += 1) {
    const t = ((from + ((to - from) * i) / n) * Math.PI) / 180;
    out.push([cx + rx * Math.cos(t), cy + ry * Math.sin(t)]);
  }
  return out;
}

const line = (...pts: Pt[]): Pt[] => pts;

interface Skeleton {
  char: string;
  latex: string;
  strokes: Pt[][];
}

const S = (char: string, strokes: Pt[][], latex = char): Skeleton => ({ char, latex, strokes });

/** Every glyph the recogniser knows, in as many hand-written shapes as are common. */
const SKELETONS: Skeleton[] = [
  S("0", [arc(50, 50, 32, 46, 270, 630, 32)]),
  S("0", [arc(50, 50, 26, 46, 270, 630, 32)]),
  S("1", [line([50, 4], [50, 96]), line([50, 4], [28, 24])]),
  S("1", [line([44, 4], [44, 96])]),
  S("1", [line([50, 4], [50, 96]), line([50, 4], [28, 24]), line([28, 96], [72, 96])]),
  S("2", [[...arc(50, 32, 30, 28, 190, 380, 20), [20, 92], [82, 92]]]),
  S("2", [[...arc(50, 30, 28, 26, 200, 400, 20), [78, 60], [22, 92]], line([20, 92], [82, 92])]),
  S("3", [[...arc(46, 28, 26, 22, 215, 450, 18), ...arc(46, 72, 30, 24, 270, 510, 20)]]),
  S("3", [line([20, 8], [78, 8], [44, 46]), arc(46, 72, 30, 26, 260, 520, 22)]),
  S("4", [line([66, 4], [12, 68], [90, 68]), line([66, 4], [66, 96])]),
  S("4", [line([30, 4], [30, 58], [86, 58]), line([70, 4], [70, 96])]),
  S("5", [[[76, 6], [30, 6], [26, 44], ...arc(46, 66, 30, 26, 235, 510, 26)]]),
  S("5", [line([76, 6], [32, 6]), [[32, 6], [28, 44], ...arc(46, 66, 30, 26, 235, 510, 26)]]),
  S("6", [[[68, 6], [40, 24], [24, 54], ...arc(48, 70, 26, 24, 180, 540, 26)]]),
  S("6", [[[64, 6], [30, 46], [24, 70]], arc(48, 70, 26, 24, 0, 360, 24)]),
  S("7", [line([18, 8], [86, 8], [42, 96])]),
  S("7", [line([18, 8], [86, 8], [42, 96]), line([38, 54], [68, 54])]),
  S("8", [arc(50, 28, 24, 22, 90, 450, 22), arc(50, 72, 28, 24, 270, 630, 24)]),
  S("8", [Array.from({ length: 41 }, (_, i): Pt => {
    const t = (i / 40) * 2 * Math.PI;
    return [50 + 28 * Math.sin(2 * t), 50 - 46 * Math.cos(t)];
  })]),
  S("9", [[...arc(50, 30, 26, 24, 0, 360, 24), [76, 32], [72, 68], [40, 96]]]),
  S("9", [arc(50, 30, 26, 24, 0, 360, 24), line([76, 30], [72, 68], [40, 96])]),
  S("+", [line([15, 50], [85, 50]), line([50, 15], [50, 85])]),
  S("-", [line([10, 50], [90, 50])]),
  S("=", [line([15, 38], [85, 38]), line([15, 62], [85, 62])]),
  S("x", [line([15, 15], [85, 85]), line([85, 15], [15, 85])]),
  S("/", [line([75, 4], [25, 96])]),
  S("(", [arc(78, 50, 40, 46, 118, 242, 16)], "("),
  S(")", [arc(22, 50, 40, 46, -62, 62, 16)], ")"),
  S("<", [line([82, 14], [18, 50], [82, 86])]),
  S(">", [line([18, 14], [82, 50], [18, 86])]),
];

// ── $P point-cloud matching ─────────────────────────────────────────────────

const N = 24;

interface CloudPoint {
  x: number;
  y: number;
  id: number;
}

function pathLength(points: CloudPoint[]): number {
  let d = 0;
  for (let i = 1; i < points.length; i += 1) {
    if (points[i]!.id === points[i - 1]!.id) d += Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.y - points[i - 1]!.y);
  }
  return d;
}

/** N points spread evenly along the ink (jumps between strokes cost nothing). */
function resample(points: CloudPoint[], n: number): CloudPoint[] {
  const interval = pathLength(points) / (n - 1) || 1;
  const pts = points.map((p) => ({ ...p }));
  const out: CloudPoint[] = [{ ...pts[0]! }];
  let acc = 0;
  for (let i = 1; i < pts.length; i += 1) {
    const prev = pts[i - 1]!;
    const cur = pts[i]!;
    if (cur.id === prev.id) {
      const d = Math.hypot(cur.x - prev.x, cur.y - prev.y);
      if (d > 0 && acc + d >= interval) {
        const q = { x: prev.x + ((interval - acc) / d) * (cur.x - prev.x), y: prev.y + ((interval - acc) / d) * (cur.y - prev.y), id: cur.id };
        out.push(q);
        pts.splice(i, 0, q);
        acc = 0;
      } else {
        acc += d;
      }
    }
  }
  while (out.length < n) out.push({ ...pts[pts.length - 1]! });
  return out.slice(0, n);
}

/** Uniform scale to a unit box (the aspect ratio survives) and centre on the centroid. */
function normalise(points: CloudPoint[]): CloudPoint[] {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  const size = Math.max(maxX - minX, maxY - minY) || 1;
  const scaled = points.map((p) => ({ x: (p.x - minX) / size, y: (p.y - minY) / size, id: p.id }));
  const cx = scaled.reduce((a, p) => a + p.x, 0) / scaled.length;
  const cy = scaled.reduce((a, p) => a + p.y, 0) / scaled.length;
  return scaled.map((p) => ({ x: p.x - cx, y: p.y - cy, id: p.id }));
}

function toCloud(strokes: ReadonlyArray<ReadonlyArray<GlyphPoint>>): CloudPoint[] {
  const pts: CloudPoint[] = [];
  strokes.forEach((s, id) => s.forEach((p) => pts.push({ x: p.x, y: p.y, id })));
  return normalise(resample(pts, N));
}

function cloudDistance(a: CloudPoint[], b: CloudPoint[], start: number): number {
  const matched = new Array<boolean>(b.length).fill(false);
  let sum = 0;
  let i = start;
  do {
    let best = -1;
    let min = Infinity;
    for (let j = 0; j < b.length; j += 1) {
      if (matched[j]) continue;
      const d = Math.hypot(a[i]!.x - b[j]!.x, a[i]!.y - b[j]!.y);
      if (d < min) {
        min = d;
        best = j;
      }
    }
    matched[best] = true;
    const weight = 1 - ((i - start + a.length) % a.length) / a.length;
    sum += weight * min;
    i = (i + 1) % a.length;
  } while (i !== start);
  return sum;
}

function greedyCloudMatch(a: CloudPoint[], b: CloudPoint[]): number {
  const step = Math.floor(a.length ** 0.5);
  let min = Infinity;
  for (let i = 0; i < a.length; i += step) {
    min = Math.min(min, cloudDistance(a, b, i), cloudDistance(b, a, i));
  }
  return min;
}

// ── Template library (each skeleton also slanted and squeezed) ──────────────

interface Template {
  char: string;
  latex: string;
  cloud: CloudPoint[];
}

const SHEARS = [-0.22, 0, 0.22];
const WIDTHS = [0.75, 1];

function buildTemplates(): Template[] {
  const out: Template[] = [];
  for (const sk of SKELETONS) {
    for (const shear of SHEARS) {
      for (const w of WIDTHS) {
        const strokes = sk.strokes.map((s) => s.map(([x, y]) => ({ x: (x + shear * (50 - y)) * w, y })));
        out.push({ char: sk.char, latex: sk.latex, cloud: toCloud(strokes) });
      }
    }
  }
  return out;
}

let library: Template[] | null = null;

export interface GlyphGuess {
  char: string;
  latex: string;
  /** 0..1, how close the ink is to the best template */
  score: number;
}

/** The best guesses for the ink of one glyph (several strokes of one character), best first. */
export function classifyGlyph(strokes: ReadonlyArray<ReadonlyArray<GlyphPoint>>, top = 3): GlyphGuess[] {
  const usable = strokes.filter((s) => s.length >= 2);
  if (!usable.length) return [];
  library ??= buildTemplates();
  const cloud = toCloud(usable);
  const best = new Map<string, GlyphGuess>();
  for (const t of library) {
    const score = Math.max((2 - greedyCloudMatch(cloud, t.cloud)) / 2, 0);
    const prev = best.get(t.char);
    if (!prev || score > prev.score) best.set(t.char, { char: t.char, latex: t.latex, score });
  }
  return [...best.values()].sort((a, b) => b.score - a.score).slice(0, top);
}

/** The skeletons, for tests that need ink to recognise. */
export function sampleSkeletons(): Array<{ char: string; strokes: GlyphStroke[] }> {
  return SKELETONS.map((s) => ({ char: s.char, strokes: s.strokes.map((st) => st.map(([x, y]) => ({ x, y }))) }));
}
