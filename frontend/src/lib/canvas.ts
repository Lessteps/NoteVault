// .canvas documents (Obsidian's format + NoteVault's "nv" extras) and the
// geometry the canvas view needs: ports, edge curves, shapes, bounds.

export type Side = "top" | "right" | "bottom" | "left";
export type NodeType = "text" | "file" | "link" | "group" | "nv-shape" | "nv-drawing";

export interface Stroke {
  points: Array<[number, number]>;
  color: string;
  width: number;
}

export interface CNode {
  id: string;
  type: NodeType;
  x: number;
  y: number;
  width: number;
  height: number;
  color?: string;
  text?: string;
  file?: string;
  url?: string;
  label?: string;
  nv?: { shape?: string; strokes?: Stroke[]; [k: string]: unknown };
}

export interface CEdge {
  id: string;
  fromNode: string;
  toNode: string;
  fromSide: Side;
  toSide: Side;
  fromEnd?: "none" | "arrow";
  toEnd?: "none" | "arrow";
  color?: string;
  label?: string;
  nv?: { style?: "solid" | "dashed" | "dotted"; [k: string]: unknown };
}

export interface CanvasDoc {
  nodes: CNode[];
  edges: CEdge[];
}

export interface Rect { x: number; y: number; width: number; height: number }

/** Obsidian's six preset colours. */
export const PRESET_COLORS: Record<string, string> = {
  "1": "#e5484d", "2": "#f76b15", "3": "#e2a336", "4": "#30a46c", "5": "#05a2c2", "6": "#8e4ec6",
};

export function colorOf(c: string | undefined, fallback = "var(--nv-line-strong)"): string {
  if (!c) return fallback;
  return PRESET_COLORS[c] ?? (/^#[0-9a-f]{6}$/i.test(c) ? c : fallback);
}

export const SHAPES: Array<{ id: string; name: string; w: number; h: number }> = [
  { id: "start_end", name: "Inicio / Fin", w: 140, h: 50 },
  { id: "process", name: "Proceso", w: 160, h: 60 },
  { id: "decision", name: "Decisión", w: 150, h: 80 },
  { id: "io", name: "Entrada / Salida", w: 160, h: 60 },
  { id: "connector", name: "Conector", w: 60, h: 60 },
  { id: "predefined", name: "Subrutina", w: 160, h: 60 },
  { id: "database", name: "Base de datos", w: 140, h: 80 },
  { id: "manual_input", name: "Entrada manual", w: 160, h: 60 },
  { id: "display", name: "Documento / Pantalla", w: 160, h: 70 },
  { id: "comment", name: "Comentario", w: 150, h: 60 },
];

/** SVG path of a flowchart shape filling a w×h box. */
export function shapePath(kind: string, w: number, h: number): string {
  const s = Math.min(w, h);
  switch (kind) {
    case "start_end": {
      const r = h / 2;
      return `M${r},0 H${w - r} A${r},${r} 0 0 1 ${w - r},${h} H${r} A${r},${r} 0 0 1 ${r},0 Z`;
    }
    case "decision":
      return `M${w / 2},0 L${w},${h / 2} L${w / 2},${h} L0,${h / 2} Z`;
    case "io": {
      const k = Math.min(w * 0.18, 24);
      return `M${k},0 H${w} L${w - k},${h} H0 Z`;
    }
    case "connector": {
      const r = s / 2;
      return `M${w / 2 - r},${h / 2} a${r},${r} 0 1 0 ${2 * r},0 a${r},${r} 0 1 0 ${-2 * r},0 Z`;
    }
    case "predefined":
      return `M0,0 H${w} V${h} H0 Z M${Math.min(12, w / 8)},0 V${h} M${w - Math.min(12, w / 8)},0 V${h}`;
    case "database": {
      const e = Math.min(h * 0.18, 14);
      return `M0,${e} A${w / 2},${e} 0 0 1 ${w},${e} V${h - e} A${w / 2},${e} 0 0 1 0,${h - e} Z M0,${e} A${w / 2},${e} 0 0 0 ${w},${e}`;
    }
    case "manual_input":
      return `M0,${h * 0.3} L${w},0 V${h} H0 Z`;
    case "display": {
      const d = h * 0.15;
      return `M0,0 H${w} V${h - d} Q${w * 0.75},${h - 3 * d} ${w / 2},${h - d} T0,${h - d} Z`;
    }
    case "comment":
      return `M${Math.min(14, w / 6)},0 H0 V${h} H${Math.min(14, w / 6)}`;
    default:
      return `M6,0 H${w - 6} Q${w},0 ${w},6 V${h - 6} Q${w},${h} ${w - 6},${h} H6 Q0,${h} 0,${h - 6} V6 Q0,0 6,0 Z`;
  }
}

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

/**
 * Where an edge touches a side: `t` is the position along that side (0 = the start, 1 = the end, 0.5 = the middle, the
 * default and the only place JSON Canvas itself knows). Always on the outline, never off it.
 */
export function portPoint(n: Rect, side: Side, t = 0.5): [number, number] {
  const k = clamp01(t);
  switch (side) {
    case "top": return [n.x + n.width * k, n.y];
    case "bottom": return [n.x + n.width * k, n.y + n.height];
    case "left": return [n.x, n.y + n.height * k];
    default: return [n.x + n.width, n.y + n.height * k];
  }
}

/**
 * The position along its side where an edge starts or ends. It lives in the edge's `nv` extras (`fromT` / `toT`), so the
 * file stays a valid Obsidian canvas: another app simply draws the edge from the middle of the side.
 */
export function edgeT(edge: { nv?: Record<string, unknown> }, end: "from" | "to"): number {
  const v = edge.nv?.[end === "from" ? "fromT" : "toT"];
  return typeof v === "number" && Number.isFinite(v) ? clamp01(v) : 0.5;
}

/** The `nv` extras for a new edge, or undefined when both ends are in the middle (nothing to store). */
export function anchorExtras(fromT: number, toT: number): { fromT?: number; toT?: number } | undefined {
  const out: { fromT?: number; toT?: number } = {};
  if (Math.abs(fromT - 0.5) > 1e-6) out.fromT = Math.round(clamp01(fromT) * 1000) / 1000;
  if (Math.abs(toT - 0.5) > 1e-6) out.toT = Math.round(clamp01(toT) * 1000) / 1000;
  return Object.keys(out).length ? out : undefined;
}

export interface BorderHit {
  side: Side;
  /** Position along that side, 0..1. */
  t: number;
  /** The point on the outline that was hit (what the connection starts from). */
  x: number;
  y: number;
  /** How far the pointer is from the outline. */
  distance: number;
}

/**
 * Whether (x, y) is on the outline of `n`: within `tol` outside it, or inside it by at most `tol` (never more than a
 * quarter of the smaller side, so a small card keeps a body to grab). Returns the nearest point of the outline, on which
 * side and how far along it. Near the middle of a side the point sticks to the middle, so aligned lines are easy.
 */
export function borderHit(n: Rect, x: number, y: number, tol: number): BorderHit | null {
  const inside = x >= n.x && x <= n.x + n.width && y >= n.y && y <= n.y + n.height;
  const limit = inside ? Math.min(tol, Math.min(n.width, n.height) / 4) : tol;
  const sides: Array<[Side, number]> = [
    ["top", Math.abs(y - n.y)],
    ["bottom", Math.abs(y - (n.y + n.height))],
    ["left", Math.abs(x - n.x)],
    ["right", Math.abs(x - (n.x + n.width))],
  ];
  let best: { side: Side; d: number } | null = null;
  for (const [side, perpendicular] of sides) {
    const horizontal = side === "top" || side === "bottom";
    // Distance to the SEGMENT of that side: beyond its ends the distance grows with the overshoot.
    const along = horizontal ? x : y;
    const from = horizontal ? n.x : n.y;
    const to = from + (horizontal ? n.width : n.height);
    const overshoot = along < from ? from - along : along > to ? along - to : 0;
    const d = Math.hypot(perpendicular, overshoot);
    if (d <= limit && (!best || d < best.d)) best = { side, d };
  }
  if (!best) return null;
  const horizontal = best.side === "top" || best.side === "bottom";
  const length = horizontal ? n.width : n.height;
  let t = clamp01(((horizontal ? x - n.x : y - n.y)) / Math.max(1, length));
  if (Math.abs(t - 0.5) * length <= tol) t = 0.5;
  const [px, py] = portPoint(n, best.side, t);
  return { side: best.side, t, x: px, y: py, distance: best.d };
}

const NORMAL: Record<Side, [number, number]> = {
  top: [0, -1], bottom: [0, 1], left: [-1, 0], right: [1, 0],
};

export type ResizeHandle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

/**
 * Which resize handle a point of the outline stands for: the corner when it is within `corner` of one, otherwise the side.
 * The whole outline resizes the card, so the handles a card draws are only a hint of where.
 */
export function resizeHandleAt(n: Rect, hit: Pick<BorderHit, "side" | "t">, corner: number): ResizeHandle {
  const horizontal = hit.side === "top" || hit.side === "bottom";
  const length = horizontal ? n.width : n.height;
  const along = hit.t * length;
  const c = Math.min(corner, length / 3);
  const first = along <= c;
  const last = along >= length - c;
  if (horizontal) {
    const v = hit.side === "top" ? "n" : "s";
    return (first ? v + "w" : last ? v + "e" : v) as ResizeHandle;
  }
  const h = hit.side === "left" ? "w" : "e";
  return (first ? "n" + h : last ? "s" + h : h) as ResizeHandle;
}

/** The pointer that shows what dragging each handle does (Tailwind classes). */
export const RESIZE_CURSOR: Record<ResizeHandle, string> = {
  n: "cursor-ns-resize", s: "cursor-ns-resize", e: "cursor-ew-resize", w: "cursor-ew-resize",
  ne: "cursor-nesw-resize", sw: "cursor-nesw-resize", nw: "cursor-nwse-resize", se: "cursor-nwse-resize",
};

/** A cubic curve leaving each node straight out of its side. */
export function edgePath(a: Rect, as: Side, b: Rect, bs: Side, at = 0.5, bt = 0.5): { d: string; mid: [number, number] } {
  const [x1, y1] = portPoint(a, as, at);
  const [x2, y2] = portPoint(b, bs, bt);
  const k = Math.max(40, Math.min(200, Math.hypot(x2 - x1, y2 - y1) / 2));
  const c1: [number, number] = [x1 + NORMAL[as][0] * k, y1 + NORMAL[as][1] * k];
  const c2: [number, number] = [x2 + NORMAL[bs][0] * k, y2 + NORMAL[bs][1] * k];
  // Point at t = 0.5 of the cubic.
  const mid: [number, number] = [
    (x1 + 3 * c1[0] + 3 * c2[0] + x2) / 8,
    (y1 + 3 * c1[1] + 3 * c2[1] + y2) / 8,
  ];
  return { d: `M${x1},${y1} C${c1[0]},${c1[1]} ${c2[0]},${c2[1]} ${x2},${y2}`, mid };
}

/** The side of `n` facing the point (x, y). */
export function nearestSide(n: Rect, x: number, y: number): Side {
  const dx = (x - (n.x + n.width / 2)) / Math.max(1, n.width);
  const dy = (y - (n.y + n.height / 2)) / Math.max(1, n.height);
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? "right" : "left";
  return dy > 0 ? "bottom" : "top";
}

export function bounds(rects: Rect[]): Rect | null {
  if (!rects.length) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const r of rects) {
    x0 = Math.min(x0, r.x);
    y0 = Math.min(y0, r.y);
    x1 = Math.max(x1, r.x + r.width);
    y1 = Math.max(y1, r.y + r.height);
  }
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

export function contains(outer: Rect, inner: Rect): boolean {
  return inner.x >= outer.x && inner.y >= outer.y
    && inner.x + inner.width <= outer.x + outer.width && inner.y + inner.height <= outer.y + outer.height;
}

export function intersects(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

export function newId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Freehand points (canvas coordinates) → a drawing node with local points. */
export function drawingNode(points: Array<[number, number]>, color: string, width: number): CNode | null {
  if (points.length < 2) return null;
  const pad = width + 4;
  const b = bounds(points.map(([x, y]) => ({ x, y, width: 0, height: 0 })))!;
  const x = b.x - pad;
  const y = b.y - pad;
  return {
    id: newId(), type: "nv-drawing", x, y,
    width: Math.max(20, b.width + 2 * pad), height: Math.max(20, b.height + 2 * pad),
    nv: { strokes: [{ points: points.map(([px, py]) => [Math.round((px - x) * 10) / 10, Math.round((py - y) * 10) / 10]), color, width }] },
  };
}

/** Drop edges whose ends are gone (after deleting nodes). */
export function pruneEdges(doc: CanvasDoc): CanvasDoc {
  const ids = new Set(doc.nodes.map((n) => n.id));
  return { nodes: doc.nodes, edges: doc.edges.filter((e) => ids.has(e.fromNode) && ids.has(e.toNode)) };
}

/** Copy nodes (and the edges between them) with new ids, shifted by (dx, dy). */
export function cloneNodes(doc: CanvasDoc, ids: Set<string>, dx: number, dy: number): CanvasDoc {
  const map = new Map<string, string>();
  const nodes = doc.nodes.filter((n) => ids.has(n.id)).map((n) => {
    const id = newId();
    map.set(n.id, id);
    return { ...structuredClone(n), id, x: n.x + dx, y: n.y + dy };
  });
  const edges = doc.edges
    .filter((e) => map.has(e.fromNode) && map.has(e.toNode))
    .map((e) => ({ ...e, id: newId(), fromNode: map.get(e.fromNode)!, toNode: map.get(e.toNode)! }));
  return { nodes, edges };
}
