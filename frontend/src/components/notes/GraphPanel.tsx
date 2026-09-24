// Grafo: the knowledge map of the vault. Drag to pan, wheel to zoom,
// click a node to open the note.

import { Maximize2, Minimize2, RefreshCw, ScanSearch } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../lib/bridge";
import { layout, type GraphEdge, type GraphNode } from "../../lib/graph";
import { useApp } from "../../store/app";
import { cn, IconButton } from "../ui";

const SUBJECT_COLOURS: Record<string, string> = { mathematics: "#38bdf8", programming: "#4ade80", english: "#f59e0b", general: "#a78bfa" };
const EDGE_COLOURS: Record<string, string> = {
  prerequisite: "#f2555a", part_of: "#facc15", uses: "#38bdf8", applied_by: "#4ade80",
  practiced_by: "#a78bfa", common_error: "#f87171", related: "#888895",
};
const SUBJECTS: Array<[string, string]> = [["", "Todos"], ["mathematics", "Matemáticas"], ["programming", "Programación"], ["english", "Inglés"], ["general", "General"]];
const R = 12;

function GraphCanvas({ nodes, edges, onOpen }: { nodes: GraphNode[]; edges: GraphEdge[]; onOpen: (id: string) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const pos = useMemo(() => layout(nodes, edges), [nodes, edges]);
  const view = useRef({ x: 0, y: 0, k: 1 });
  const hover = useRef<string | null>(null);
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const [, force] = useState(0);

  const fit = useCallback(() => {
    const el = wrap.current;
    if (!el || !pos.size) return;
    const xs = [...pos.values()].map((p) => p[0]);
    const ys = [...pos.values()].map((p) => p[1]);
    const w = Math.max(1, Math.max(...xs) - Math.min(...xs) + 80);
    const h = Math.max(1, Math.max(...ys) - Math.min(...ys) + 80);
    const k = Math.min(2, el.clientWidth / w, el.clientHeight / h);
    view.current = { k, x: el.clientWidth / 2 - ((Math.max(...xs) + Math.min(...xs)) / 2) * k, y: el.clientHeight / 2 - ((Math.max(...ys) + Math.min(...ys)) / 2) * k };
    force((n) => n + 1);
  }, [pos]);
  useEffect(fit, [fit]);

  const draw = useCallback(() => {
    const c = canvas.current;
    const el = wrap.current;
    if (!c || !el) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = el.clientWidth * dpr;
    c.height = el.clientHeight * dpr;
    c.style.width = `${el.clientWidth}px`;
    c.style.height = `${el.clientHeight}px`;
    const g = c.getContext("2d")!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, el.clientWidth, el.clientHeight);
    const { x, y, k } = view.current;
    // Nodes and labels keep a readable size whatever the zoom.
    const rr = R * Math.max(0.6, Math.min(1.4, k));
    const labels = k > 0.45 || nodes.length <= 80;
    const sx = (p: [number, number]) => [p[0] * k + x, p[1] * k + y] as const;
    for (const e of edges) {
      const a = pos.get(e.source);
      const b = pos.get(e.target);
      if (!a || !b) continue;
      const [ax, ay] = sx(a);
      const [bx, by] = sx(b);
      g.strokeStyle = EDGE_COLOURS[e.relation_type] ?? "#555566";
      g.globalAlpha = hover.current && hover.current !== e.source && hover.current !== e.target ? 0.2 : 0.7;
      g.lineWidth = 1.4;
      g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke();
      if (e.relation_type !== "related") {
        const ang = Math.atan2(by - ay, bx - ax);
        const tx = bx - Math.cos(ang) * rr;
        const ty = by - Math.sin(ang) * rr;
        g.fillStyle = g.strokeStyle;
        g.beginPath(); g.moveTo(tx, ty);
        g.lineTo(tx - 8 * Math.cos(ang - 0.4), ty - 8 * Math.sin(ang - 0.4));
        g.lineTo(tx - 8 * Math.cos(ang + 0.4), ty - 8 * Math.sin(ang + 0.4));
        g.fill();
      }
    }
    g.globalAlpha = 1;
    const text = getComputedStyle(document.documentElement).getPropertyValue("--nv-dim").trim() || "#9696ab";
    for (const n of nodes) {
      const p = pos.get(n.id);
      if (!p) continue;
      const [cx, cy] = sx(p);
      const col = SUBJECT_COLOURS[n.subject] ?? "#a78bfa";
      const hot = hover.current === n.id;
      g.globalAlpha = 0.7 + 0.3 * Math.min(1, n.mastery);
      g.fillStyle = col;
      g.beginPath(); g.arc(cx, cy, rr * (hot ? 1.15 : 1), 0, Math.PI * 2); g.fill();
      g.globalAlpha = 1;
      if (n.mastery > 0) {
        g.strokeStyle = "#ffffff"; g.lineWidth = 2;
        g.beginPath(); g.arc(cx, cy, rr + 3, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, n.mastery)); g.stroke();
      }
      if (labels || hot) {
        g.fillStyle = hot ? "#ffffff" : text;
        g.font = `${hot ? 600 : 400} ${Math.max(10, 11 * Math.min(1.3, k))}px Inter Variable, sans-serif`;
        g.textAlign = "center";
        g.fillText(n.title, cx, cy + rr + 13);
      }
    }
  }, [nodes, edges, pos]);

  useEffect(() => {
    draw();
    const ro = new ResizeObserver(draw);
    if (wrap.current) ro.observe(wrap.current);
    return () => ro.disconnect();
  });

  const nodeAt = (mx: number, my: number): string | null => {
    const { x, y, k } = view.current;
    for (const n of [...nodes].reverse()) {
      const p = pos.get(n.id);
      if (p && Math.hypot(p[0] * k + x - mx, p[1] * k + y - my) <= R * Math.max(0.6, Math.min(1.4, k)) + 4) return n.id;
    }
    return null;
  };

  return (
    <div ref={wrap} className="relative h-full w-full cursor-grab overflow-hidden bg-bg"
      onPointerDown={(e) => { drag.current = { x: e.clientX, y: e.clientY, moved: false }; (e.target as Element).setPointerCapture(e.pointerId); }}
      onPointerMove={(e) => {
        const r = wrap.current!.getBoundingClientRect();
        if (drag.current) {
          const dx = e.clientX - drag.current.x;
          const dy = e.clientY - drag.current.y;
          if (Math.abs(dx) + Math.abs(dy) > 2) drag.current.moved = true;
          view.current.x += dx; view.current.y += dy;
          drag.current.x = e.clientX; drag.current.y = e.clientY;
          draw();
          return;
        }
        const h = nodeAt(e.clientX - r.left, e.clientY - r.top);
        if (h !== hover.current) { hover.current = h; draw(); }
        wrap.current!.style.cursor = h ? "pointer" : "grab";
      }}
      onPointerUp={(e) => {
        const d = drag.current;
        drag.current = null;
        if (d && !d.moved) {
          const r = wrap.current!.getBoundingClientRect();
          const id = nodeAt(e.clientX - r.left, e.clientY - r.top);
          if (id) onOpen(id);
        }
      }}
      onWheel={(e) => {
        const r = wrap.current!.getBoundingClientRect();
        const mx = e.clientX - r.left;
        const my = e.clientY - r.top;
        const v = view.current;
        const k2 = Math.max(0.15, Math.min(4, v.k * (e.deltaY < 0 ? 1.12 : 1 / 1.12)));
        v.x = mx - ((mx - v.x) / v.k) * k2;
        v.y = my - ((my - v.y) / v.k) * k2;
        v.k = k2;
        draw();
      }}
      onDoubleClick={fit}
    >
      <canvas ref={canvas} aria-label="Grafo de conocimiento" role="img" />
    </div>
  );
}

export function GraphPanel() {
  const openNote = useApp((s) => s.openNote);
  const toast = useApp((s) => s.toast);
  const [data, setData] = useState<{ nodes: GraphNode[]; edges: GraphEdge[] } | null>(null);
  const [subject, setSubject] = useState("");
  const [big, setBig] = useState(false);
  const [key, setKey] = useState(0);
  const load = useCallback(() => {
    setData(null);
    api.knowledgeGraph().then(setData).catch((e) => toast("error", (e as Error).message));
  }, [toast]);
  useEffect(load, [load]);

  const visible = useMemo(() => {
    if (!data) return null;
    const nodes = subject ? data.nodes.filter((n) => n.subject === subject) : data.nodes;
    const ids = new Set(nodes.map((n) => n.id));
    return { nodes, edges: data.edges.filter((e) => ids.has(e.source) && ids.has(e.target)) };
  }, [data, subject]);

  const body = (
    <div className="flex h-full flex-col">
      <div className="flex flex-none items-center gap-1 px-2 py-1.5">
        <select aria-label="Materia" value={subject} onChange={(e) => setSubject(e.target.value)}
          className="rounded-md border border-line bg-surface px-1.5 py-0.5 text-[11.5px] text-text outline-none">
          {SUBJECTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <span className="ml-1 font-mono text-[10.5px] text-faint">{visible ? `${visible.nodes.length} notas · ${visible.edges.length} enlaces` : ""}</span>
        <span className="flex-1" />
        <IconButton title="Recargar grafo" onClick={load}><RefreshCw size={13} /></IconButton>
        <IconButton title="Centrar vista" onClick={() => setKey((k) => k + 1)}><ScanSearch size={13} /></IconButton>
        <IconButton title={big ? "Reducir" : "Ampliar"} onClick={() => setBig(!big)}>{big ? <Minimize2 size={13} /> : <Maximize2 size={13} />}</IconButton>
      </div>
      <div className="min-h-0 flex-1 border-y border-line">
        {!visible ? <div className="grid h-full place-items-center text-[12px] text-faint">Cargando grafo…</div>
          : !visible.nodes.length ? <div className="grid h-full place-items-center px-4 text-center text-[12px] text-faint">Sin notas para esta materia.</div>
            : <GraphCanvas key={key} nodes={visible.nodes} edges={visible.edges} onOpen={(id) => { setBig(false); void openNote(id); }} />}
      </div>
      <div className="flex flex-none flex-wrap gap-x-2 px-2 py-1.5 text-[10.5px]">
        {Object.entries(SUBJECT_COLOURS).map(([s, c]) => <span key={s} style={{ color: c }}>● {s.slice(0, 3)}</span>)}
        <span className="ml-auto text-faint">— prerreq. <span style={{ color: EDGE_COLOURS.prerequisite }}>■</span> usa <span style={{ color: EDGE_COLOURS.uses }}>■</span> enlace <span style={{ color: EDGE_COLOURS.related }}>■</span></span>
      </div>
    </div>
  );
  return big ? (
    <>
      <div className="grid h-full place-items-center text-[12px] text-faint">Grafo ampliado</div>
      <div className="fixed inset-0 z-40 bg-black/50 p-8" onMouseDown={() => setBig(false)}>
        <div className={cn("h-full rounded-2xl border border-line-strong bg-panel shadow-2xl")} onMouseDown={(e) => e.stopPropagation()}>{body}</div>
      </div>
    </>
  ) : body;
}
