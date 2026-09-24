// Force-directed layout for the knowledge graph (the classic app's algorithm).

export interface GraphNode { id: string; title: string; subject: string; topic: string; type: string; difficulty: number; mastery: number }
export interface GraphEdge { source: string; target: string; relation_type: string }

const REPULSION = 8000;
const ATTRACTION = 0.06;
const DAMPING = 0.85;
export const MAX_LAYOUT_NODES = 400;

const GRAVITY = 0.02;

function iterationsFor(n: number): number {
  if (n <= 60) return 300;
  if (n <= 150) return 120;
  return 40;
}

/** Deterministic pseudo-random numbers, so the same vault draws the same map. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

export function layout(nodes: GraphNode[], edges: GraphEdge[]): Map<string, [number, number]> {
  const ids = nodes.map((n) => n.id);
  const out = new Map<string, [number, number]>();
  if (!ids.length) return out;
  if (ids.length > MAX_LAYOUT_NODES) {
    const cols = Math.ceil(Math.sqrt(ids.length));
    ids.forEach((id, i) => out.set(id, [(i % cols) * 60, Math.floor(i / cols) * 60]));
    return out;
  }
  const r = rng(42);
  const px = ids.map(() => r() * 600 - 300);
  const py = ids.map(() => r() * 600 - 300);
  const vx = ids.map(() => 0);
  const vy = ids.map(() => 0);
  const index = new Map(ids.map((id, i) => [id, i]));
  const links = edges.map((e) => [index.get(e.source), index.get(e.target)]).filter((p): p is [number, number] => p[0] !== undefined && p[1] !== undefined);
  const n = ids.length;
  for (let it = 0; it < iterationsFor(n); it++) {
    const fx = new Float64Array(n);
    const fy = new Float64Array(n);
    for (let a = 0; a < n; a++) {
      for (let b = a + 1; b < n; b++) {
        const dx = px[a]! - px[b]!;
        const dy = py[a]! - py[b]!;
        const d2 = dx * dx + dy * dy || 1;
        const d = Math.sqrt(d2);
        const f = REPULSION / d2;
        const ox = (f * dx) / d;
        const oy = (f * dy) / d;
        fx[a]! += ox; fy[a]! += oy;
        fx[b]! -= ox; fy[b]! -= oy;
      }
    }
    for (const [s, t] of links) {
      const dx = px[t]! - px[s]!;
      const dy = py[t]! - py[s]!;
      fx[s]! += dx * ATTRACTION; fy[s]! += dy * ATTRACTION;
      fx[t]! -= dx * ATTRACTION; fy[t]! -= dy * ATTRACTION;
    }
    for (let i = 0; i < n; i++) {
      // A mild pull to the centre keeps unlinked notes from drifting away.
      fx[i]! -= px[i]! * GRAVITY;
      fy[i]! -= py[i]! * GRAVITY;
      vx[i] = (vx[i]! + fx[i]!) * DAMPING;
      vy[i] = (vy[i]! + fy[i]!) * DAMPING;
      px[i]! += vx[i]!;
      py[i]! += vy[i]!;
    }
  }
  ids.forEach((id, i) => out.set(id, [px[i]!, py[i]!]));
  return out;
}
