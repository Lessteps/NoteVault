import katex from "katex";
import {
  CornerDownLeft,
  Eraser,
  PenTool,
  Sparkles,
  Undo2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  type Point,
  type RecognitionResult,
  recognizeStrokesToLatex,
  type Stroke,
} from "../../lib/mathRecognizer";
import { cn } from "../ui";

interface MathDrawingInputProps {
  onInsertLatex: (latexString: string) => void;
  onClose: () => void;
}

const PALETTE_GROUPS = [
  {
    category: "Estructuras",
    symbols: [
      { label: "a/b", latex: "\\frac{a}{b}" },
      { label: "√x", latex: "\\sqrt{x}" },
      { label: "ⁿ√x", latex: "\\sqrt[n]{x}" },
      { label: "xⁿ", latex: "x^{n}" },
      { label: "xᵢ", latex: "x_{i}" },
    ],
  },
  {
    category: "Operadores",
    symbols: [
      { label: "+", latex: "+" },
      { label: "-", latex: "-" },
      { label: "×", latex: "\\times" },
      { label: "÷", latex: "\\div" },
      { label: "±", latex: "\\pm" },
      { label: "=", latex: "=" },
      { label: "≠", latex: "\\neq" },
      { label: "≈", latex: "\\approx" },
      { label: "≤", latex: "\\le" },
      { label: "≥", latex: "\\ge" },
    ],
  },
  {
    category: "Conjuntos y Lógica",
    symbols: [
      { label: "∈", latex: "\\in" },
      { label: "∉", latex: "\\notin" },
      { label: "⊆", latex: "\\subseteq" },
      { label: "ℝ", latex: "\\mathbb{R}" },
      { label: "ℤ", latex: "\\mathbb{Z}" },
      { label: "ℕ", latex: "\\mathbb{N}" },
      { label: "∀", latex: "\\forall" },
      { label: "∃", latex: "\\exists" },
      { label: "⇒", latex: "\\implies" },
      { label: "⇔", latex: "\\iff" },
    ],
  },
  {
    category: "Cálculo y Símbolos",
    symbols: [
      { label: "∫", latex: "\\int" },
      { label: "∑", latex: "\\sum" },
      { label: "lim", latex: "\\lim_{x \\to 0}" },
      { label: "∞", latex: "\\infty" },
      { label: "π", latex: "\\pi" },
      { label: "θ", latex: "\\theta" },
      { label: "α", latex: "\\alpha" },
      { label: "β", latex: "\\beta" },
    ],
  },
];

export function MathDrawingInput({ onInsertLatex, onClose }: MathDrawingInputProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentStroke, setCurrentStroke] = useState<Point[]>([]);
  const [latexDraft, setLatexDraft] = useState<string>("");
  const [displayMode, setDisplayMode] = useState<boolean>(true);
  const [activeCategory, setActiveCategory] = useState<string>("Estructuras");

  // Re-run recognition whenever strokes change
  useEffect(() => {
    if (strokes.length === 0) {
      return;
    }
    const res: RecognitionResult = recognizeStrokesToLatex(strokes);
    if (res.latex.trim()) {
      setLatexDraft(res.latex);
    }
  }, [strokes]);

  // Redraw canvas
  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw background grid lines for math handwriting guidance
    ctx.strokeStyle = "rgba(128, 128, 128, 0.12)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);

    const step = 30;
    for (let y = step; y < canvas.height; y += step) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // Draw all completed strokes
    ctx.strokeStyle = "#8b5cf6"; // vibrant purple ink
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    const all = [...strokes, currentStroke];
    for (const stroke of all) {
      if (stroke.length < 2) continue;
      ctx.beginPath();
      ctx.moveTo(stroke[0]!.x, stroke[0]!.y);
      for (let i = 1; i < stroke.length; i++) {
        ctx.lineTo(stroke[i]!.x, stroke[i]!.y);
      }
      ctx.stroke();
    }
  }, [strokes, currentStroke]);

  useEffect(() => {
    redraw();
  }, [redraw]);

  // Handle pointer down
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.setPointerCapture(e.pointerId);

    const rect = canvas.getBoundingClientRect();
    const pt: Point = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };

    setIsDrawing(true);
    setCurrentStroke([pt]);
  };

  // Handle pointer move
  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const pt: Point = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };

    setCurrentStroke((prev) => [...prev, pt]);
  };

  // Handle pointer up
  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (canvas) {
      try {
        canvas.releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    }

    setIsDrawing(false);
    if (currentStroke.length >= 2) {
      setStrokes((prev) => [...prev, currentStroke]);
    }
    setCurrentStroke([]);
  };

  const handleClear = () => {
    setStrokes([]);
    setCurrentStroke([]);
    setLatexDraft("");
  };

  const handleUndo = () => {
    setStrokes((prev) => prev.slice(0, -1));
  };

  const handlePaletteClick = (latexSymbol: string) => {
    setLatexDraft((prev) => {
      const trimmed = prev.trim();
      return trimmed ? `${trimmed} ${latexSymbol}` : latexSymbol;
    });
  };

  const handleInsert = () => {
    if (!latexDraft.trim()) return;
    const wrapped = displayMode ? `\n$$\n${latexDraft.trim()}\n$$\n` : `$${latexDraft.trim()}$ `;
    onInsertLatex(wrapped);
    handleClear();
  };

  // Safe KaTeX rendered HTML
  const renderedKatex = (() => {
    if (!latexDraft.trim()) return "<span class='text-faint'>Escribe o dibuja para previsualizar aquí...</span>";
    try {
      return katex.renderToString(latexDraft, {
        throwOnError: false,
        displayMode: true,
      });
    } catch {
      return `<span class='text-danger'>Error en sintaxis LaTeX: ${latexDraft}</span>`;
    }
  })();

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-accent/40 bg-card p-4 shadow-lg transition-all">
      {/* Surface Header */}
      <div className="flex items-center justify-between border-b border-line pb-2.5">
        <div className="flex items-center gap-2">
          <PenTool size={16} className="text-accent-text" />
          <span className="font-bold text-[13.5px] text-ink">
            Superficie de Dibujo Matemático (Lienzo → LaTeX)
          </span>
          <span className="rounded-full bg-accent-soft px-2 py-0.5 font-mono text-[10px] font-semibold text-accent-text">
            Reconocimiento Heurístico
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleUndo}
            disabled={strokes.length === 0}
            title="Deshacer trazo"
            className="flex items-center gap-1 rounded-lg border border-line bg-panel px-2.5 py-1 text-[11.5px] text-dim hover:text-ink disabled:opacity-40"
          >
            <Undo2 size={12} /> Deshacer
          </button>
          <button
            type="button"
            onClick={handleClear}
            disabled={strokes.length === 0 && !latexDraft}
            title="Borrar lienzo"
            className="flex items-center gap-1 rounded-lg border border-line bg-panel px-2.5 py-1 text-[11.5px] text-danger hover:bg-danger-soft disabled:opacity-40"
          >
            <Eraser size={12} /> Limpiar
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-faint hover:bg-panel hover:text-ink ml-1"
          >
            <X size={15} />
          </button>
        </div>
      </div>

      {/* Main Drawing + Preview Area */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {/* Drawing Canvas */}
        <div className="flex flex-col">
          <div className="relative overflow-hidden rounded-xl border border-line bg-panel/70">
            <canvas
              ref={canvasRef}
              width={420}
              height={190}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              className="w-full touch-none cursor-crosshair"
            />
            {strokes.length === 0 && !isDrawing && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-[12px] text-faint">
                Dibuja trazos matemáticos (ej: \sqrt{}, fracciones, signos...)
              </div>
            )}
          </div>
        </div>

        {/* Live KaTeX Preview & LaTeX Code */}
        <div className="flex flex-col justify-between rounded-xl border border-line bg-panel p-3">
          <div>
            <div className="flex items-center justify-between text-[11px] text-faint mb-1.5">
              <span className="font-mono uppercase tracking-wider font-semibold">
                Vista previa (KaTeX)
              </span>
              <button
                type="button"
                onClick={() => setDisplayMode(!displayMode)}
                className="hover:underline text-accent-text"
              >
                {displayMode ? "Modo bloque ($$)" : "Modo inline ($)"}
              </button>
            </div>

            <div
              className="min-h-[90px] flex items-center justify-center rounded-lg bg-card p-2 text-center overflow-x-auto"
              dangerouslySetInnerHTML={{ __html: renderedKatex }}
            />
          </div>

          {/* Editable LaTeX Text Bar */}
          <div className="mt-3">
            <div className="mb-1 text-[10.5px] font-mono text-faint uppercase font-semibold">
              Código LaTeX generado (editable):
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={latexDraft}
                onChange={(e) => setLatexDraft(e.target.value)}
                placeholder="\\frac{a}{b} + \\sqrt{x}"
                className="flex-1 rounded-lg border border-line bg-card px-2.5 py-1.5 font-mono text-[12px] text-ink focus:border-accent focus:outline-none"
              />
              <button
                type="button"
                disabled={!latexDraft.trim()}
                onClick={handleInsert}
                className="flex items-center gap-1 rounded-lg bg-mint px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-mint-strong disabled:opacity-40"
              >
                <CornerDownLeft size={13} /> Insertar
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Symbol & Template Palette */}
      <div className="rounded-xl border border-line bg-panel/50 p-2.5">
        <div className="flex flex-wrap items-center justify-between gap-1 border-b border-line pb-1.5 mb-2">
          <div className="flex items-center gap-1 text-[11px] font-mono font-semibold uppercase text-faint">
            <Sparkles size={11} className="text-accent-text" /> Paleta de Símbolos:
          </div>
          <div className="flex gap-1">
            {PALETTE_GROUPS.map((g) => (
              <button
                key={g.category}
                type="button"
                onClick={() => setActiveCategory(g.category)}
                className={cn(
                  "rounded-md px-2 py-0.5 text-[10.5px] font-medium transition-colors",
                  activeCategory === g.category
                    ? "bg-accent text-white"
                    : "text-dim hover:bg-card hover:text-ink",
                )}
              >
                {g.category}
              </button>
            ))}
          </div>
        </div>

        {/* Buttons for active group */}
        <div className="flex flex-wrap gap-1.5">
          {PALETTE_GROUPS.find((g) => g.category === activeCategory)?.symbols.map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={() => handlePaletteClick(item.latex)}
              className="flex h-7 min-w-[28px] items-center justify-center rounded-lg border border-line bg-card px-2 font-mono text-[12px] font-semibold text-ink shadow-xs hover:border-accent hover:bg-accent-soft hover:text-accent-text"
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
