// The drawing pad: an infinite surface to write maths by hand, with the LaTeX it
// reads shown live ABOVE the drawing. It opens in a split view beside the note; the
// drawing is saved in its own note (`type: dibujo`) in the folder it was opened from.
//
// Tools (keys): Pen P · Select S · Text T · Eraser E · Hand H (or wheel, middle button,
// Space + drag). Ctrl+Z / Ctrl+Y undo and redo, Delete removes the selection,
// Ctrl+A selects all, Esc clears, Ctrl+Enter inserts. Zoom with Ctrl + wheel.
//
// With something selected, ONLY the selection is translated to LaTeX: no stray ink
// gets into the formula. Typed text (`5/5`) is typeset as LaTeX right on the page.

import {
  Check, Copy, Eraser, FilePlus2, Hand, MousePointer2, PenLine, Redo2, Trash2, Type, Undo2, X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../lib/bridge";
import { inkNoteText, readInk, writeInk, type InkStroke } from "../../lib/inkFile";
import { recognizeStrokesToLatex } from "../../lib/mathRecognizer";
import { textToLatex } from "../../lib/textToLatex";
import { copyText } from "../../lib/clipboard";
import { renderTex } from "../../lib/tex";
import { useApp, type OpenNote } from "../../store/app";
import { cn } from "../ui";
import { insertLatex } from "./inkBridge";

interface View {
  x: number;
  y: number;
  k: number;
}
type Tool = "pen" | "select" | "text" | "erase" | "hand";
type Pt = [number, number];
interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

const INK = "#8b5cf6";
const SELECTED = "#22d3ee";
const DRAFT_KEY = "nv.ink.draft";
const HISTORY_MAX = 120;
const TEXT_H = 30;

/** The unsaved session: it lives in the browser storage until "Crear archivo" turns it into a file. */
function loadDraft(): { strokes: InkStroke[]; latex: string } {
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (raw) {
      const d = JSON.parse(raw) as { raw: string; latex: string };
      return { strokes: readInk(d.raw), latex: d.latex ?? "" };
    }
  } catch {
    /* a corrupt draft is just an empty page */
  }
  return { strokes: [], latex: "" };
}

function saveDraft(strokes: InkStroke[], latex: string): void {
  try {
    if (!strokes.length) window.localStorage.removeItem(DRAFT_KEY);
    else window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ raw: writeInk(inkNoteText("draft"), strokes, latex), latex }));
  } catch {
    /* storage may be unavailable: the draft is a convenience */
  }
}
const MIN_K = 0.25;
const MAX_K = 4;
const QUICK: Array<[string, string]> = [
  ["a/b", "\\frac{}{}"], ["√", "\\sqrt{}"], ["xⁿ", "^{}"], ["xₙ", "_{}"], ["π", "\\pi"],
  ["≤", "\\leq"], ["≥", "\\geq"], ["≠", "\\neq"], ["×", "\\times"], ["÷", "\\div"], ["∈", "\\in"], ["ℕ", "\\mathbb{N}"], ["ℤ", "\\mathbb{Z}"],
];

/** Where an item sits on the page (text items are sized by their source, roughly). */
function boxOf(s: InkStroke): Box {
  if (s.text) {
    const [x, y] = s.points[0]!;
    return { minX: x, minY: y, maxX: x + Math.max(30, s.text.length * 12), maxY: y + TEXT_H };
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of s.points) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY };
}

const overlaps = (a: Box, b: Box): boolean => a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
const union = (boxes: Box[]): Box => ({
  minX: Math.min(...boxes.map((b) => b.minX)),
  minY: Math.min(...boxes.map((b) => b.minY)),
  maxX: Math.max(...boxes.map((b) => b.maxX)),
  maxY: Math.max(...boxes.map((b) => b.maxY)),
});

/**
 * With a `note` the pad edits that drawing file. Without one it is a draft: nothing
 * exists on disk (so a stray click leaves no file behind) until "Crear archivo".
 */
export function InkPad({ note, folder = "" }: { note?: OpenNote; folder?: string }) {
  const editRaw = useApp((s) => s.editRaw);
  const toast = useApp((s) => s.toast);

  const [strokes, setStrokes] = useState<InkStroke[]>(() => (note ? readInk(note.raw) : loadDraft().strokes));
  const [view, setView] = useState<View>({ x: 40, y: 60, k: 1 });
  const [latex, setLatex] = useState(() => (note ? "" : loadDraft().latex));
  const [display, setDisplay] = useState(true);
  const [tool, setTool] = useState<Tool>("pen");
  const [selected, setSelected] = useState<ReadonlySet<number>>(new Set());
  const [editing, setEditing] = useState<{ wx: number; wy: number; value: string } | null>(null);
  const [historyTick, setHistoryTick] = useState(0);

  const pad = useRef<HTMLDivElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const current = useRef<Pt[] | null>(null);
  const pan = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);
  const marquee = useRef<{ a: Pt; b: Pt } | null>(null);
  const moving = useRef<{ from: Pt; dx: number; dy: number } | null>(null);
  const erasing = useRef(false);
  const space = useRef(false);
  const manual = useRef(false);
  const past = useRef<InkStroke[][]>([]);
  const future = useRef<InkStroke[][]>([]);
  const viewRef = useRef(view);
  viewRef.current = view;
  const strokesRef = useRef(strokes);
  strokesRef.current = strokes;
  const selectedRef = useRef(selected);
  selectedRef.current = selected;

  // ── History: every change the user makes can be undone (Ctrl+Z) and redone (Ctrl+Y) ──
  const remember = () => {
    past.current.push(strokesRef.current);
    if (past.current.length > HISTORY_MAX) past.current.shift();
    future.current = [];
    setHistoryTick((n) => n + 1);
  };
  const commit = (next: InkStroke[]) => {
    remember();
    manual.current = false;
    setStrokes(next);
  };
  const undo = () => {
    const prev = past.current.pop();
    if (!prev) return;
    future.current.push(strokesRef.current);
    manual.current = false;
    setSelected(new Set());
    setStrokes(prev);
    setHistoryTick((n) => n + 1);
  };
  const redo = () => {
    const next = future.current.pop();
    if (!next) return;
    past.current.push(strokesRef.current);
    manual.current = false;
    setSelected(new Set());
    setStrokes(next);
    setHistoryTick((n) => n + 1);
  };
  const canUndo = past.current.length > 0;
  const canRedo = future.current.length > 0;
  void historyTick;

  // A different drawing note: load its ink.
  useEffect(() => {
    if (!note) return;
    setStrokes(readInk(note.raw));
    setLatex("");
    setSelected(new Set());
    past.current = [];
    future.current = [];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note?.path]);

  // ── Painting ──────────────────────────────────────────────────────────────
  const paint = useCallback(() => {
    const el = canvas.current;
    const box = host.current;
    if (!el || !box) return;
    const dpr = window.devicePixelRatio || 1;
    const w = box.clientWidth;
    const h = box.clientHeight;
    if (el.width !== Math.round(w * dpr) || el.height !== Math.round(h * dpr)) {
      el.width = Math.round(w * dpr);
      el.height = Math.round(h * dpr);
      el.style.width = `${w}px`;
      el.style.height = `${h}px`;
    }
    const ctx = el.getContext("2d");
    if (!ctx) return;
    const { x, y, k } = viewRef.current;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, el.width, el.height);
    ctx.setTransform(dpr * k, 0, 0, dpr * k, dpr * x, dpr * y);

    // Dot grid: it moves with the page, so panning is visible on an empty surface.
    if (k > 0.35) {
      const step = 40;
      ctx.fillStyle = "rgba(128,128,128,0.28)";
      const x0 = Math.floor(-x / k / step) * step;
      const y0 = Math.floor(-y / k / step) * step;
      for (let gx = x0; gx < (w - x) / k; gx += step) {
        for (let gy = y0; gy < (h - y) / k; gy += step) ctx.fillRect(gx - 1, gy - 1, 2 / k + 0.5, 2 / k + 0.5);
      }
    }

    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 3;
    const drag = moving.current;
    const draw = (pts: Pt[], alpha: number, color: string, dx = 0, dy = 0) => {
      if (pts.length < 2) return;
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = color;
      ctx.beginPath();
      ctx.moveTo(pts[0]![0] + dx, pts[0]![1] + dy);
      for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i]![0] + dx, pts[i]![1] + dy);
      ctx.stroke();
    };
    strokesRef.current.forEach((s, i) => {
      if (s.text) return;
      const isSel = selectedRef.current.has(i);
      draw(s.points, isSel ? 1 : s.done ? 0.3 : 1, isSel ? SELECTED : INK, isSel && drag ? drag.dx : 0, isSel && drag ? drag.dy : 0);
    });
    if (current.current) draw(current.current, 1, INK);

    // The selection's frame and the marquee being dragged.
    ctx.globalAlpha = 1;
    ctx.lineWidth = 1.5 / k;
    ctx.setLineDash([6 / k, 4 / k]);
    ctx.strokeStyle = SELECTED;
    if (selectedRef.current.size) {
      const b = union([...selectedRef.current].map((i) => boxOf(strokesRef.current[i]!)));
      const dx = drag?.dx ?? 0;
      const dy = drag?.dy ?? 0;
      ctx.strokeRect(b.minX - 8 + dx, b.minY - 8 + dy, b.maxX - b.minX + 16, b.maxY - b.minY + 16);
    }
    if (marquee.current) {
      const { a, b } = marquee.current;
      ctx.fillStyle = "rgba(34,211,238,0.08)";
      ctx.fillRect(Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]));
      ctx.strokeRect(Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]));
    }
    ctx.setLineDash([]);
  }, []);

  useEffect(() => {
    paint();
  }, [paint, strokes, view, selected]);

  useEffect(() => {
    const box = host.current;
    if (!box) return;
    const ro = new ResizeObserver(() => paint());
    ro.observe(box);
    return () => ro.disconnect();
  }, [paint]);

  // ── Pointer, wheel and keys ───────────────────────────────────────────────
  const world = (e: { clientX: number; clientY: number }): Pt => {
    const r = canvas.current!.getBoundingClientRect();
    const { x, y, k } = viewRef.current;
    return [(e.clientX - r.left - x) / k, (e.clientY - r.top - y) / k];
  };

  /** Strokes whose ink passes within a few pixels of a point (for the eraser). */
  const hit = (p: Pt): number[] => {
    const r = 10 / viewRef.current.k;
    const out: number[] = [];
    strokesRef.current.forEach((s, i) => {
      if (s.text) {
        const b = boxOf(s);
        if (p[0] >= b.minX && p[0] <= b.maxX && p[1] >= b.minY && p[1] <= b.maxY) out.push(i);
        return;
      }
      if (s.points.some(([x, y]) => Math.hypot(x - p[0], y - p[1]) <= r)) out.push(i);
    });
    return out;
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    canvas.current?.setPointerCapture(e.pointerId);
    pad.current?.focus({ preventScroll: true });
    if (e.button === 1 || space.current || tool === "hand") {
      pan.current = { x: e.clientX, y: e.clientY, vx: viewRef.current.x, vy: viewRef.current.y };
      return;
    }
    if (e.button !== 0) return;
    const p = world(e);
    if (tool === "text") {
      setEditing({ wx: p[0], wy: p[1], value: "" });
      return;
    }
    if (tool === "erase") {
      const ids = hit(p);
      erasing.current = true;
      remember();
      if (ids.length) setStrokes((s) => s.filter((_, i) => !ids.includes(i)));
      return;
    }
    if (tool === "select") {
      const inside = [...selectedRef.current].some((i) => {
        const b = boxOf(strokesRef.current[i]!);
        return p[0] >= b.minX - 8 && p[0] <= b.maxX + 8 && p[1] >= b.minY - 8 && p[1] <= b.maxY + 8;
      });
      if (inside) moving.current = { from: p, dx: 0, dy: 0 };
      else {
        marquee.current = { a: p, b: p };
        if (!e.shiftKey) setSelected(new Set());
      }
      return;
    }
    current.current = [p];
    paint();
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (pan.current) {
      const p = pan.current;
      setView((v) => ({ ...v, x: p.vx + e.clientX - p.x, y: p.vy + e.clientY - p.y }));
      return;
    }
    if (erasing.current) {
      const ids = hit(world(e));
      if (ids.length) setStrokes((s) => s.filter((_, i) => !ids.includes(i)));
      return;
    }
    if (moving.current) {
      const p = world(e);
      moving.current.dx = p[0] - moving.current.from[0];
      moving.current.dy = p[1] - moving.current.from[1];
      paint();
      return;
    }
    if (marquee.current) {
      marquee.current.b = world(e);
      paint();
      return;
    }
    const pts = current.current;
    if (!pts) return;
    const coalesced = e.nativeEvent.getCoalescedEvents?.() ?? [];
    const events = coalesced.length ? coalesced : [e.nativeEvent];
    for (const ev of events) {
      const [wx, wy] = world(ev);
      const last = pts[pts.length - 1]!;
      if (Math.hypot(wx - last[0], wy - last[1]) > 1.2 / viewRef.current.k) pts.push([wx, wy]);
    }
    paint();
  };

  const onPointerUp = () => {
    pan.current = null;
    erasing.current = false;
    const drag = moving.current;
    if (drag) {
      moving.current = null;
      if (Math.abs(drag.dx) + Math.abs(drag.dy) > 0.5) {
        commit(
          strokesRef.current.map((s, i) =>
            selectedRef.current.has(i) ? { ...s, points: s.points.map(([x, y]) => [x + drag.dx, y + drag.dy] as Pt) } : s,
          ),
        );
      } else paint();
      return;
    }
    const m = marquee.current;
    if (m) {
      marquee.current = null;
      const box: Box = { minX: Math.min(m.a[0], m.b[0]), minY: Math.min(m.a[1], m.b[1]), maxX: Math.max(m.a[0], m.b[0]), maxY: Math.max(m.a[1], m.b[1]) };
      const tiny = box.maxX - box.minX < 3 && box.maxY - box.minY < 3;
      const next = new Set(selectedRef.current);
      if (!tiny) strokesRef.current.forEach((s, i) => overlaps(boxOf(s), box) && next.add(i));
      setSelected(next);
      paint();
      return;
    }
    const pts = current.current;
    current.current = null;
    if (pts && pts.length >= 2) commit([...strokesRef.current, { done: false, points: pts }]);
    else paint();
  };

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey) {
        const r = el.getBoundingClientRect();
        const px = e.clientX - r.left;
        const py = e.clientY - r.top;
        setView((v) => {
          const k = Math.min(MAX_K, Math.max(MIN_K, v.k * Math.exp(-e.deltaY * 0.0015)));
          return { k, x: px - ((px - v.x) / v.k) * k, y: py - ((py - v.y) / v.k) * k };
        });
      } else {
        setView((v) => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }));
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // ── What is being translated: the selection, or else the ink not yet inserted ──
  const targetIndexes = useMemo(() => {
    if (selected.size) return [...selected].filter((i) => strokes[i]);
    return strokes.map((s, i) => (!s.done ? i : -1)).filter((i) => i >= 0);
  }, [strokes, selected]);

  // Recognition runs right after each stroke (a short pause only so a two-stroke sign such as = is read whole).
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const ink = targetIndexes.map((i) => strokes[i]!).filter((s) => !s.text).map((s) => s.points.map(([x, y]) => ({ x, y })));
      if (!ink.length) {
        if (!manual.current) setLatex("");
        return;
      }
      if (manual.current) return;
      setLatex(recognizeStrokesToLatex(ink).latex);
    }, 90);
    return () => window.clearTimeout(timer);
  }, [strokes, targetIndexes]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!note) {
        saveDraft(strokes, latex);
        return;
      }
      const next = writeInk(note.raw, strokes, latex);
      if (next !== note.raw) editRaw(note.path, next);
    }, 700);
    return () => window.clearTimeout(timer);
    // `note.raw` is deliberately not a dependency: our own save must not re-trigger a save.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strokes, latex]);

  /** The typed formulas that go with the formula read from the ink. */
  const typed = useMemo(
    () => targetIndexes.map((i) => strokes[i]!).filter((s) => s.text).map((s) => textToLatex(s.text!)),
    [strokes, targetIndexes],
  );
  const fullLatex = useMemo(() => [latex.trim(), ...typed].filter(Boolean).join(" "), [latex, typed]);
  const preview = useMemo(() => (fullLatex ? renderTex(fullLatex, true) : ""), [fullLatex]);
  const overlay = useMemo(() => (fullLatex ? renderTex(fullLatex, false) : ""), [fullLatex]);
  const overlayBox = useMemo(
    () => (targetIndexes.length ? union(targetIndexes.map((i) => boxOf(strokes[i]!))) : null),
    [strokes, targetIndexes],
  );

  const deleteSelection = () => {
    if (!selected.size) return;
    commit(strokes.filter((_, i) => !selected.has(i)));
    setSelected(new Set());
  };
  const clearActive = () => {
    commit(strokes.filter((x) => x.done));
    setSelected(new Set());
    setLatex("");
  };
  const selectAll = () => setSelected(new Set(strokes.map((_, i) => i)));

  const insert = () => {
    const where = insertLatex(fullLatex, display);
    if (where === "none") {
      toast("error", "Abre una nota o un ejercicio donde insertar la fórmula.");
      return;
    }
    toast("info", where === "answer" ? "Fórmula añadida a tu respuesta." : "Fórmula insertada en la nota.");
    const used = new Set(targetIndexes);
    commit(strokes.map((x, i) => (used.has(i) ? { ...x, done: true } : x)));
    setSelected(new Set());
    setLatex("");
  };

  const finishText = (keep: boolean) => {
    const e = editing;
    setEditing(null);
    if (!keep || !e || !e.value.trim()) return;
    commit([...strokesRef.current, { done: false, points: [[e.wx, e.wy], [e.wx + 1, e.wy]], text: e.value.trim() }]);
  };

  // Keyboard: only while the pointer is over the pad or focus is inside it, and never while typing.
  const act = useRef({ undo, redo, deleteSelection, selectAll, insert });
  act.current = { undo, redo, deleteSelection, selectAll, insert };
  useEffect(() => {
    const isTyping = (t: EventTarget | null) => {
      const el = t as HTMLElement | null;
      return !!el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));
    };
    const here = () => !!pad.current && (pad.current.matches(":hover") || pad.current.contains(document.activeElement));
    const down = (e: KeyboardEvent) => {
      if (isTyping(e.target) || !here()) return;
      const key = e.key.toLowerCase();
      const mod = e.ctrlKey || e.metaKey;
      if (e.code === "Space" && !mod) {
        space.current = true;
        e.preventDefault();
      } else if (mod && key === "z" && !e.shiftKey) {
        e.preventDefault();
        act.current.undo();
      } else if (mod && (key === "y" || (key === "z" && e.shiftKey))) {
        e.preventDefault();
        act.current.redo();
      } else if (mod && key === "a") {
        e.preventDefault();
        act.current.selectAll();
      } else if (mod && key === "enter") {
        e.preventDefault();
        act.current.insert();
      } else if (!mod && (key === "delete" || key === "backspace")) {
        e.preventDefault();
        act.current.deleteSelection();
      } else if (!mod && key === "escape") {
        setSelected(new Set());
        setEditing(null);
      } else if (!mod && !e.altKey) {
        const next: Record<string, Tool> = { p: "pen", s: "select", v: "select", t: "text", e: "erase", h: "hand" };
        if (next[key]) setTool(next[key]!);
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") space.current = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  /** Turns the draft into `Dibujo LaTeX N` in the folder it was opened from. */
  const createFile = async () => {
    const app = useApp.getState();
    try {
      const used = new Set((await api.listDir(folder)).map((e) => e.name.toLowerCase()));
      let n = 1;
      while (used.has(`dibujo latex ${n}`)) n += 1;
      const title = `Dibujo LaTeX ${n}`;
      const { path } = await api.createNote(title, folder);
      await api.writeNote(path, writeInk(inkNoteText(title), strokes, latex), null);
      window.localStorage.removeItem(DRAFT_KEY);
      app.refreshTree();
      await useApp.getState().openSide(path);
      toast("info", `Archivo creado: ${title}`);
    } catch (e) {
      toast("error", (e as Error).message);
    }
  };

  const toolBtn = (id: Tool, title: string, icon: React.ReactNode) => (
    <button
      type="button"
      title={title}
      aria-pressed={tool === id}
      onClick={() => setTool(tool === id && id === "hand" ? "pen" : id)}
      className={cn("grid h-7 w-7 place-items-center rounded-md", tool === id ? "bg-accent text-white" : "text-dim hover:bg-hover")}
    >
      {icon}
    </button>
  );
  const plain = "grid h-7 w-7 place-items-center rounded-md text-dim hover:bg-hover disabled:opacity-40";
  const cursor = tool === "hand" ? "cursor-grab" : tool === "select" ? "cursor-default" : tool === "text" ? "cursor-text" : "cursor-crosshair";

  return (
    <div ref={pad} tabIndex={-1} className="flex h-full min-h-0 flex-col bg-surface outline-none">
      <div className="flex flex-none flex-wrap items-center gap-1 border-b border-line px-3 py-1.5">
        <PenLine size={14} className="text-accent-text" />
        <span className="min-w-0 flex-1 basis-24 truncate text-[12.5px] font-semibold text-text" title={note?.path ?? "Sin guardar"}>
          {note ? note.title : "Dibujo sin guardar"}
        </span>
        {!note && (
          <>
            <button
              type="button"
              disabled={!strokes.length}
              onClick={() => void createFile()}
              title="Crear el archivo de este dibujo en la carpeta de la nota"
              className="inline-flex items-center gap-1 rounded-md bg-accent px-2 py-1 text-[11.5px] font-semibold text-white hover:bg-accent-strong disabled:opacity-40"
            >
              <FilePlus2 size={12} /> Crear archivo
            </button>
            <button
              type="button"
              title="Cerrar (la sesión se conserva hasta que crees el archivo)"
              onClick={() => useApp.getState().setInkDraft(null)}
              className="grid h-7 w-7 place-items-center rounded-md text-dim hover:bg-hover"
            >
              <X size={14} />
            </button>
          </>
        )}
      </div>
      <div className="flex flex-none flex-wrap items-center gap-1 border-b border-line px-3 py-1">
        {toolBtn("pen", "Lápiz (P)", <PenLine size={14} />)}
        {toolBtn("select", "Seleccionar (S): solo lo seleccionado se traduce a LaTeX", <MousePointer2 size={14} />)}
        {toolBtn("text", "Texto (T): escribe 5/5 y se ve como fracción", <Type size={14} />)}
        {toolBtn("erase", "Borrador (E)", <Eraser size={14} />)}
        {toolBtn("hand", "Mover (H, rueda o Espacio + arrastrar). Zoom: Ctrl + rueda", <Hand size={14} />)}
        <span className="mx-1 h-4 w-px bg-line" />
        <button type="button" title="Deshacer (Ctrl+Z)" disabled={!canUndo} onClick={undo} className={plain}><Undo2 size={14} /></button>
        <button type="button" title="Rehacer (Ctrl+Y)" disabled={!canRedo} onClick={redo} className={plain}><Redo2 size={14} /></button>
        <button type="button" title="Borrar la selección (Supr)" disabled={!selected.size} onClick={deleteSelection} className={plain}><Trash2 size={14} /></button>
        <span className="flex-1" />
        {selected.size > 0 && <span className="font-mono text-[10.5px] text-accent-text">{selected.size} seleccionado(s)</span>}
        <button type="button" title="Quitar lo dibujado y no insertado" disabled={!targetIndexes.length} onClick={clearActive}
          className="rounded-md px-1.5 text-[11px] text-dim hover:bg-hover disabled:opacity-40">
          Limpiar
        </button>
        <button type="button" title="Volver al centro" onClick={() => setView({ x: 40, y: 60, k: 1 })}
          className="rounded-md px-1.5 font-mono text-[10.5px] text-faint hover:bg-hover">
          {Math.round(view.k * 100)}%
        </button>
      </div>

      <div ref={host} className="relative min-h-0 flex-1 overflow-hidden">
        <canvas
          ref={canvas}
          className={cn("absolute inset-0 touch-none", cursor)}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />

        {/* Typed formulas, typeset on the page. */}
        {strokes.map((s, i) =>
          s.text ? (
            <div
              key={i}
              className={cn("pointer-events-none absolute origin-top-left whitespace-nowrap text-text", selected.has(i) && "rounded outline outline-1 outline-cyan-400")}
              style={{
                left: (s.points[0]![0] + (selected.has(i) && moving.current ? moving.current.dx : 0)) * view.k + view.x,
                top: s.points[0]![1] * view.k + view.y,
                fontSize: 20 * view.k,
                opacity: s.done ? 0.4 : 1,
              }}
              dangerouslySetInnerHTML={{ __html: renderTex(textToLatex(s.text), false) }}
            />
          ) : null,
        )}

        {/* What the ink reads as, right above it, the moment a stroke ends. */}
        {overlayBox && overlay && (
          <div
            className="pointer-events-none absolute z-10 max-w-full -translate-y-full whitespace-nowrap rounded-md border border-accent/40 bg-panel/95 px-2 py-1 text-[16px] text-text shadow-lg"
            style={{ left: Math.max(4, overlayBox.minX * view.k + view.x), top: Math.max(30, overlayBox.minY * view.k + view.y - 14) }}
            dangerouslySetInnerHTML={{ __html: overlay }}
          />
        )}

        {editing && (
          <input
            autoFocus
            value={editing.value}
            onChange={(e) => setEditing({ ...editing, value: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Enter") finishText(true);
              else if (e.key === "Escape") finishText(false);
              e.stopPropagation();
            }}
            onBlur={() => finishText(true)}
            spellCheck={false}
            placeholder="5/5, sqrt(x), x^2…"
            className="absolute z-20 w-44 rounded-md border border-accent bg-panel px-2 py-1 font-mono text-[12.5px] text-text outline-none"
            style={{ left: editing.wx * view.k + view.x, top: editing.wy * view.k + view.y }}
          />
        )}

        {!strokes.length && !editing && (
          <p className="pointer-events-none absolute inset-x-0 top-1/3 text-center text-[12.5px] text-faint">
            Escribe aquí a mano: números, +, −, =, fracciones, raíces, exponentes… (T para escribir texto: 5/5)
          </p>
        )}
      </div>

      <div className="flex-none border-t border-line bg-panel p-3">
        <div className="mb-2 flex min-h-[64px] items-center justify-center overflow-x-auto rounded-lg border border-line bg-surface px-3 py-2 text-[18px] text-text">
          {preview ? <span dangerouslySetInnerHTML={{ __html: preview }} /> : <span className="text-[12px] text-faint">Vista previa (KaTeX)</span>}
        </div>
        <div className="flex items-center gap-2">
          <input
            value={latex}
            onChange={(e) => {
              manual.current = true;
              setLatex(e.target.value);
            }}
            spellCheck={false}
            aria-label="LaTeX detectado"
            placeholder="LaTeX detectado (editable)"
            className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-2.5 py-1.5 font-mono text-[12.5px] text-text outline-none focus:border-accent"
          />
          <label className="flex flex-none items-center gap-1 text-[11px] text-dim">
            <input type="checkbox" checked={display} onChange={(e) => setDisplay(e.target.checked)} /> Bloque ($$)
          </label>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1">
          {QUICK.map(([label, tex]) => (
            <button key={tex} type="button" title={tex}
              onClick={() => { manual.current = true; setLatex((l) => `${l}${l && !l.endsWith(" ") ? " " : ""}${tex}`); }}
              className="rounded-md border border-line bg-card px-1.5 py-0.5 text-[11.5px] text-dim hover:border-accent hover:text-text">
              {label}
            </button>
          ))}
          <span className="flex-1" />
          <button type="button" title="Copiar el LaTeX" disabled={!fullLatex} onClick={() => void copyText(fullLatex)}
            className="grid h-7 w-7 place-items-center rounded-md text-dim hover:bg-hover disabled:opacity-40">
            <Copy size={13} />
          </button>
          <button type="button" title="Insertar (Ctrl+Enter)" disabled={!fullLatex} onClick={insert}
            className="inline-flex items-center gap-1.5 rounded-lg bg-mint px-3 py-1 text-[12px] font-semibold text-white disabled:opacity-40">
            <Check size={13} /> Insertar
          </button>
        </div>
      </div>
    </div>
  );
}
