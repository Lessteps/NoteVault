// Depurar: the right-panel face of the programming spaces. Run the code of an exercise (Python, JavaScript,
// TypeScript, SQL) and walk through it line by line, seeing the variables and the output at every step.

import { Bug, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ClipboardCheck, Play, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../lib/bridge";
import type { CodeRun, CodeRuntime, CodeTrace } from "../../lib/types";
import { useApp } from "../../store/app";
import { useCodePanel } from "../../store/codePanel";
import { cn, IconButton } from "../ui";

const LINE = 20;
const PAD = 8;

const LANGUAGES = [
  { id: "python", label: "Python" },
  { id: "javascript", label: "JavaScript" },
  { id: "typescript", label: "TypeScript" },
  { id: "sql", label: "SQL (SQLite)" },
];

type Outcome = { kind: "run"; data: CodeRun } | { kind: "trace"; data: CodeTrace } | null;

export function CodePanel() {
  const { language, code, stdin, label, sink, setOpen, setCode, setLanguage, setStdin } = useCodePanel();
  const toast = useApp((s) => s.toast);
  const [busy, setBusy] = useState<"run" | "trace" | null>(null);
  const [outcome, setOutcome] = useState<Outcome>(null);
  const [step, setStep] = useState(0);
  const [runtimes, setRuntimes] = useState<CodeRuntime[]>([]);
  const [scroll, setScroll] = useState(0);
  const area = useRef<HTMLTextAreaElement>(null);
  const gutter = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.codeRuntimes().then((r) => setRuntimes(r.items)).catch(() => undefined);
  }, []);

  const tracing = outcome?.kind === "trace" && outcome.data.steps.length > 0;
  const trace = outcome?.kind === "trace" ? outcome.data : null;
  const current = tracing ? trace!.steps[Math.min(step, trace!.steps.length - 1)]! : null;
  const lines = useMemo(() => code.split("\n").length, [code]);

  // Editing the code invalidates a trace: it described the old lines.
  const edit = (text: string) => {
    setCode(text);
    if (outcome?.kind === "trace") setOutcome(null);
  };

  const run = useCallback(async (mode: "run" | "trace") => {
    if (busy) return;
    setBusy(mode);
    setOutcome(null);
    setStep(0);
    try {
      if (mode === "run") setOutcome({ kind: "run", data: await api.codeRun(language, code, stdin) });
      else setOutcome({ kind: "trace", data: await api.codeTrace(language, code, stdin) });
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      setBusy(null);
    }
  }, [busy, code, language, stdin, toast]);

  // Keep the line being executed in view.
  useEffect(() => {
    const el = area.current;
    if (!el || !current) return;
    const top = PAD + (current.line - 1) * LINE;
    if (top < el.scrollTop || top + LINE > el.scrollTop + el.clientHeight) el.scrollTop = Math.max(0, top - el.clientHeight / 2);
  }, [current]);

  const unavailable = runtimes.find((r) => r.id === language && !r.available);
  const shown = outcome?.data;
  const outputSoFar = current && trace ? trace.stdout.slice(0, current.out) : "";

  return (
    <aside className="flex h-full w-[460px] flex-none flex-col border-l border-line bg-panel" aria-label="Depurar">
      <div className="flex h-9 flex-none items-center gap-2 border-b border-line px-3">
        <Bug size={14} className="text-accent-text" />
        <span className="text-[12px] font-semibold text-text">Depurar</span>
        {label && <span className="min-w-0 truncate text-[11px] text-faint" title={label}>· {label}</span>}
        <div className="flex-1" />
        <IconButton title="Cerrar" onClick={() => setOpen(false)}>
          <X size={14} />
        </IconButton>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3">
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Lenguaje"
            value={language}
            onChange={(e) => { setLanguage(e.target.value); setOutcome(null); }}
            className="rounded-lg border border-line bg-card px-2 py-1 text-[12px] text-text outline-none focus:border-accent"
          >
            {LANGUAGES.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
          </select>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void run("run")}
            title="Ejecutar (Ctrl+Enter)"
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-accent-strong disabled:opacity-50"
          >
            <Play size={12} /> {busy === "run" ? "Ejecutando…" : "Ejecutar"}
          </button>
          <button
            type="button"
            disabled={busy !== null || language === "sql"}
            onClick={() => void run("trace")}
            title={language === "sql" ? "SQL no tiene paso a paso" : "Recorre el código línea a línea viendo las variables"}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-[12px] font-semibold text-text hover:bg-hover disabled:opacity-40"
          >
            <Bug size={12} /> {busy === "trace" ? "Depurando…" : "Paso a paso"}
          </button>
          {sink && (
            <button
              type="button"
              onClick={() => { sink(code); toast("info", "Código copiado a tu respuesta."); }}
              title="Escribe este código en la caja «Tu respuesta» del ejercicio"
              className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-[12px] text-dim hover:bg-hover hover:text-text"
            >
              <ClipboardCheck size={12} /> A mi respuesta
            </button>
          )}
        </div>

        {unavailable && <p className="rounded-lg border border-warn/40 bg-warn-soft px-3 py-2 text-[11.5px] text-text">{unavailable.runtime}. Instálalo desde python.org y reinicia NoteVault.</p>}

        <div className="relative flex h-[300px] flex-none overflow-hidden rounded-lg border border-line bg-card focus-within:border-accent">
          <div
            ref={gutter}
            aria-hidden
            className="w-9 flex-none select-none overflow-hidden border-r border-line bg-panel text-right font-mono text-[11px] text-faint"
            style={{ paddingTop: PAD, lineHeight: `${LINE}px` }}
          >
            {Array.from({ length: lines }, (_, i) => (
              <div key={i} style={{ height: LINE }} className={cn("pr-1.5", current?.line === i + 1 && "bg-accent-soft font-bold text-accent-text")}>{i + 1}</div>
            ))}
          </div>
          <div className="relative min-w-0 flex-1">
            {current && (
              <div
                aria-hidden
                data-testid="current-line"
                className="pointer-events-none absolute inset-x-0 bg-accent/15"
                style={{ top: PAD + (current.line - 1) * LINE - scroll, height: LINE }}
              />
            )}
            <textarea
              ref={area}
              aria-label="Código"
              value={code}
              spellCheck={false}
              readOnly={tracing}
              onChange={(e) => edit(e.target.value)}
              onScroll={(e) => {
                setScroll(e.currentTarget.scrollTop);
                if (gutter.current) gutter.current.scrollTop = e.currentTarget.scrollTop;
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  void run("run");
                } else if (e.key === "Tab") {
                  e.preventDefault();
                  const el = e.currentTarget;
                  const a = el.selectionStart;
                  edit(`${code.slice(0, a)}    ${code.slice(el.selectionEnd)}`);
                  requestAnimationFrame(() => el.setSelectionRange(a + 4, a + 4));
                }
              }}
              className="h-full w-full resize-none bg-transparent px-2 font-mono text-[12.5px] text-text outline-none"
              style={{ lineHeight: `${LINE}px`, paddingTop: PAD, paddingBottom: PAD, whiteSpace: "pre", tabSize: 4, overflow: "auto" }}
            />
          </div>
        </div>

        <details className="text-[11.5px] text-dim">
          <summary className="cursor-pointer select-none">Entrada del programa (stdin)</summary>
          <textarea
            aria-label="Entrada"
            value={stdin}
            onChange={(e) => setStdin(e.target.value)}
            placeholder="Lo que el programa lee con input(), readline…"
            className="mt-1.5 h-16 w-full resize-y rounded-lg border border-line bg-card p-2 font-mono text-[12px] text-text outline-none focus:border-accent"
          />
        </details>

        {tracing && trace && current && (
          <div className="rounded-xl border border-line bg-card p-3" data-testid="stepper">
            <div className="flex items-center gap-1">
              <IconButton title="Primer paso" onClick={() => setStep(0)}><ChevronsLeft size={14} /></IconButton>
              <IconButton title="Paso anterior" onClick={() => setStep((s) => Math.max(0, s - 1))}><ChevronLeft size={14} /></IconButton>
              <IconButton title="Paso siguiente" onClick={() => setStep((s) => Math.min(trace.steps.length - 1, s + 1))}><ChevronRight size={14} /></IconButton>
              <IconButton title="Último paso" onClick={() => setStep(trace.steps.length - 1)}><ChevronsRight size={14} /></IconButton>
              <span className="ml-2 font-mono text-[11px] text-dim">paso {step + 1} de {trace.steps.length}</span>
              <button type="button" onClick={() => setOutcome(null)} className="ml-auto text-[11px] text-faint hover:text-text">Salir del paso a paso</button>
            </div>
            <input
              type="range"
              aria-label="Paso"
              min={0}
              max={trace.steps.length - 1}
              value={step}
              onChange={(e) => setStep(Number(e.target.value))}
              className="mt-1 w-full accent-[var(--nv-accent)]"
            />
            <div className="mt-1 text-[11.5px] text-dim">
              línea <b className="text-text">{current.line}</b> · en <code className="font-mono text-text">{current.fn === "<module>" ? "el programa" : `${current.fn}()`}</code>
              {current.depth > 1 && <> · nivel de llamada {current.depth}</>}
            </div>
            {current.ret !== undefined && <div className="mt-1 text-[11.5px] text-mint">devuelve <code className="font-mono">{current.ret}</code></div>}
            {current.exc !== undefined && <div className="mt-1 text-[11.5px] text-danger">excepción <code className="font-mono">{current.exc}</code></div>}
            <div className="mt-2 font-mono text-[10px] uppercase tracking-wider text-faint">Variables</div>
            {current.vars.length === 0 ? (
              <p className="text-[11.5px] text-faint">Todavía no hay variables.</p>
            ) : (
              <table className="mt-1 w-full border-collapse font-mono text-[12px]">
                <tbody>
                  {current.vars.map(([name, value]) => (
                    <tr key={name} className="border-t border-line first:border-t-0">
                      <td className="w-1/3 py-0.5 pr-2 align-top text-accent-text">{name}</td>
                      <td className="break-all py-0.5 text-text">{value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {outputSoFar && (
              <>
                <div className="mt-2 font-mono text-[10px] uppercase tracking-wider text-faint">Salida hasta aquí</div>
                <pre className="mt-1 max-h-24 overflow-auto whitespace-pre-wrap rounded-lg bg-panel px-2 py-1 font-mono text-[12px] text-text">{outputSoFar}</pre>
              </>
            )}
            {trace.steps_truncated && <p className="mt-2 text-[11px] text-warn">El programa tiene más de {trace.steps.length} pasos: se muestran los primeros. La ejecución terminó completa.</p>}
          </div>
        )}

        {shown && (
          <div className="rounded-xl border border-line bg-card p-3" data-testid="output">
            <div className="flex items-center gap-2 text-[11.5px]">
              <span className={cn("rounded px-1.5 py-0.5 font-mono text-[10.5px] font-semibold", shown.ok ? "bg-mint/15 text-mint" : "bg-danger/15 text-danger")}>
                {shown.ok ? "Terminó bien" : shown.timed_out ? "Tiempo excedido" : `Error${shown.exit_code !== null ? ` (código ${shown.exit_code})` : ""}`}
              </span>
              <span className="text-faint">{shown.ms} ms · {shown.runtime}</span>
            </div>
            {shown.stdout && (
              <>
                <div className="mt-2 font-mono text-[10px] uppercase tracking-wider text-faint">Salida</div>
                <pre className="mt-1 max-h-56 overflow-auto whitespace-pre-wrap font-mono text-[12.5px] text-text">{shown.stdout}</pre>
              </>
            )}
            {shown.stderr && (
              <>
                <div className="mt-2 font-mono text-[10px] uppercase tracking-wider text-faint">Errores</div>
                <pre className="mt-1 max-h-56 overflow-auto whitespace-pre-wrap font-mono text-[12.5px] text-danger">{shown.stderr}</pre>
              </>
            )}
            {!shown.stdout && !shown.stderr && <p className="mt-2 text-[12px] text-faint">El programa no imprimió nada. Usa print() / console.log() para ver valores.</p>}
          </div>
        )}

        <p className="text-[10.5px] leading-snug text-faint">El código se ejecuta en tu equipo, sin aislamiento, con un límite de 10 s. Para un ejercicio, «A mi respuesta» lo copia a la caja de respuesta.</p>
      </div>
    </aside>
  );
}
