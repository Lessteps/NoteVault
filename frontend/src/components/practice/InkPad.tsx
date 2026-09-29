// The drawing pad: an infinite surface to write maths by hand, with the LaTeX it
// reads shown as a live preview. It opens in a split view beside the note; the
// drawing is saved in its own note (`type: dibujo`) in the folder it was opened from.
//
// Draw with the mouse or a pen. Move around with the hand tool, the middle button,
// Space + drag or the wheel; zoom with Ctrl + wheel.

import { Check, Copy, Eraser, FilePlus2, Hand, PenLine, Undo2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../lib/bridge";
import { inkNoteText, readInk, writeInk, type InkStroke } from "../../lib/inkFile";
import { recognizeStrokesToLatex } from "../../lib/mathRecognizer";
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

const INK = "#8b5cf6";
const DRAFT_KEY = "nv.ink.draft";

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

/**
 * With a `note` the pad edits that drawing file. Without one it is a draft: nothing
 * exists on disk (so a stray click leaves no file behind) until "Crear archivo".
 */
export function InkPad({ note, folder = "" }: { note?: OpenNote; folder?: string }) {
  const editRaw = useApp((s) => s.editRaw);
  const toast = useApp((s) => s.toast);

  const [strokes, setStrokes] = useState<InkStroke[]>(() => (note ? readInk(note.raw) : loadDraft().strokes));
  const [view, setView] = useState<View>({ x: 40, y: 40, k: 1 });
  const [latex, setLatex] = useState(() => (note ? "" : loadDraft().latex));
  const [display, setDisplay] = useState(true);
  const [tool, setTool] = useState<"pen" | "hand">("pen");

  const host = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const current = useRef<Array<[number, number]> | null>(null);
  const pan = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);
  const space = useRef(false);
  const manual = useRef(false);
  const viewRef = useRef(view);
  viewRef.current = view;
  const strokesRef = useRef(strokes);
  strokesRef.current = strokes;

  // A different drawing note: load its ink.
  useEffect(() => {
    if (!note) return;
    setStrokes(readInk(note.raw));
    setLatex("");
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
    const draw = (pts: Array<[number, number]>, alpha: number) => {
      if (pts.length < 2) return;
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = INK;
      ctx.beginPath();
      ctx.moveTo(pts[0]![0], pts[0]![1]);
      for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i]![0], pts[i]![1]);
      ctx.stroke();
    };
    for (const s of strokesRef.current) draw(s.points, s.done ? 0.3 : 1);
    if (current.current) draw(current.current, 1);
    ctx.globalAlpha = 1;
  }, []);

  useEffect(() => {
    paint();
  }, [paint, strokes, view]);

  useEffect(() => {
    const box = host.current;
    if (!box) return;
    const ro = new ResizeObserver(() => paint());
    ro.observe(box);
    return () => ro.disconnect();
  }, [paint]);

  // ── Pointer, wheel and keys ───────────────────────────────────────────────
  const world = (e: { clientX: number; clientY: number }): [number, number] => {
    const r = canvas.current!.getBoundingClientRect();
    const { x, y, k } = viewRef.current;
    return [(e.clientX - r.left - x) / k, (e.clientY - r.top - y) / k];
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    canvas.current?.setPointerCapture(e.pointerId);
    if (e.button === 1 || space.current || tool === "hand") {
      pan.current = { x: e.clientX, y: e.clientY, vx: viewRef.current.x, vy: viewRef.current.y };
      return;
    }
    if (e.button !== 0) return;
    current.current = [world(e)];
    paint();
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (pan.current) {
      const p = pan.current;
      setView((v) => ({ ...v, x: p.vx + e.clientX - p.x, y: p.vy + e.clientY - p.y }));
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
    const pts = current.current;
    current.current = null;
    if (pts && pts.length >= 2) {
      manual.current = false;
      setStrokes((s) => [...s, { done: false, points: pts }]);
    } else {
      paint();
    }
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

  useEffect(() => {
    const isTyping = (t: EventTarget | null) => {
      const el = t as HTMLElement | null;
      return !!el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));
    };
    const down = (e: KeyboardEvent) => {
      if (e.code === "Space" && !isTyping(e.target) && host.current?.matches(":hover")) {
        space.current = true;
        e.preventDefault();
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

  // ── Recognition and saving ────────────────────────────────────────────────
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const active = strokes.filter((s) => !s.done).map((s) => s.points.map(([x, y]) => ({ x, y })));
      if (!active.length) {
        if (!manual.current) setLatex("");
        return;
      }
      if (manual.current) return;
      setLatex(recognizeStrokesToLatex(active).latex);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [strokes]);

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

  const activeCount = useMemo(() => strokes.filter((s) => !s.done).length, [strokes]);
  const preview = useMemo(() => (latex.trim() ? renderTex(latex, true) : ""), [latex]);

  const undo = () => {
    manual.current = false;
    setStrokes((s) => {
      const i = s.map((x) => x.done).lastIndexOf(false);
      return i < 0 ? s : s.filter((_, j) => j !== i);
    });
  };
  const clearActive = () => {
    manual.current = false;
    setStrokes((s) => s.filter((x) => x.done));
    setLatex("");
  };
  const insert = () => {
    const where = insertLatex(latex, display);
    if (where === "none") {
      toast("error", "Abre una nota o un ejercicio donde insertar la fórmula.");
      return;
    }
    toast("info", where === "answer" ? "Fórmula añadida a tu respuesta." : "Fórmula insertada en la nota.");
    manual.current = false;
    setStrokes((s) => s.map((x) => ({ ...x, done: true })));
    setLatex("");
  };

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

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface">
      <div className="flex flex-none items-center gap-1.5 border-b border-line px-3 py-1.5">
        <PenLine size={14} className="text-accent-text" />
        <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-text" title={note?.path ?? "Sin guardar"}>
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
        <button type="button" title="Lápiz" onClick={() => setTool("pen")}
          className={cn("grid h-7 w-7 place-items-center rounded-md", tool === "pen" ? "bg-accent text-white" : "text-dim hover:bg-hover")}>
          <PenLine size={14} />
        </button>
        <button type="button" title="Mover (o rueda / Espacio + arrastrar). Zoom: Ctrl + rueda" onClick={() => setTool(tool === "hand" ? "pen" : "hand")}
          className={cn("grid h-7 w-7 place-items-center rounded-md", tool === "hand" ? "bg-accent text-white" : "text-dim hover:bg-hover")}>
          <Hand size={14} />
        </button>
        <button type="button" title="Deshacer el último trazo" disabled={!activeCount} onClick={undo}
          className="grid h-7 w-7 place-items-center rounded-md text-dim hover:bg-hover disabled:opacity-40">
          <Undo2 size={14} />
        </button>
        <button type="button" title="Borrar lo dibujado sin insertar" disabled={!activeCount} onClick={clearActive}
          className="grid h-7 w-7 place-items-center rounded-md text-dim hover:bg-hover disabled:opacity-40">
          <Eraser size={14} />
        </button>
        <button type="button" title="Volver al centro" onClick={() => setView({ x: 40, y: 40, k: 1 })}
          className="rounded-md px-1.5 font-mono text-[10.5px] text-faint hover:bg-hover">
          {Math.round(view.k * 100)}%
        </button>
      </div>

      <div ref={host} className="relative min-h-0 flex-1 overflow-hidden">
        <canvas
          ref={canvas}
          className={cn("absolute inset-0 touch-none", tool === "hand" ? "cursor-grab" : "cursor-crosshair")}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />
        {!strokes.length && (
          <p className="pointer-events-none absolute inset-x-0 top-1/3 text-center text-[12.5px] text-faint">
            Escribe aquí a mano: números, +, −, =, fracciones, raíces, exponentes…
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
          <button type="button" title="Copiar el LaTeX" disabled={!latex.trim()} onClick={() => void copyText(latex)}
            className="grid h-7 w-7 place-items-center rounded-md text-dim hover:bg-hover disabled:opacity-40">
            <Copy size={13} />
          </button>
          <button type="button" disabled={!latex.trim()} onClick={insert}
            className="inline-flex items-center gap-1.5 rounded-lg bg-mint px-3 py-1 text-[12px] font-semibold text-white disabled:opacity-40">
            <Check size={13} /> Insertar
          </button>
        </div>
      </div>
    </div>
  );
}
