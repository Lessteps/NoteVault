// Pieces shared by Práctica and the proof ladder.

import { Pause, Play, RotateCcw, Timer } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { renderMarkdown } from "../../lib/markdown";
import { display, tick, type TimerSpec, type TimerState } from "../../lib/practiceTimer";
import type { PracticeResult } from "../../lib/types";
import { cn } from "../ui";

export const VERDICTS: Record<string, string> = { correct: "Correcto", partial: "Parcialmente correcto", incorrect: "Incorrecto" };

const _mdCache = new Map<string, { __html: string }>();
const MAX_MD_CACHE = 300;

export const md = (text: string): { __html: string } => {
  let cached = _mdCache.get(text);
  if (!cached) {
    if (_mdCache.size >= MAX_MD_CACHE) {
      const firstKey = _mdCache.keys().next().value;
      if (firstKey !== undefined) _mdCache.delete(firstKey);
    }
    cached = { __html: renderMarkdown(text) };
    _mdCache.set(text, cached);
  }
  return cached;
};

export const scoreColour = (s: number) => (s >= 75 ? "text-mint" : s >= 40 ? "text-warn" : "text-danger");

export function beep() {
  try {
    const ctx = new AudioContext();
    const o = ctx.createOscillator();
    o.frequency.value = 880;
    o.connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.18);
  } catch {
    /* no audio: the status line still says it */
  }
}

export function ResultCard({ result, quality, rubric, onRetry, banner }: {
  result: PracticeResult; quality: number | null; rubric: string[]; onRetry: () => void; banner?: ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    ref.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [result]);
  return (
    <section ref={ref} aria-label="Corrección" className="flex flex-col gap-3 rounded-2xl border border-line-strong bg-card px-6 py-5">
      <div className="flex items-baseline gap-3">
        <span className={cn("text-[34px] font-bold", scoreColour(result.score))}>
          {result.score}<span className="text-[16px] text-dim">/100</span>
        </span>
        <span className={cn("text-[15px] font-semibold", scoreColour(result.score))}>{VERDICTS[result.verdict] ?? result.verdict}</span>
        {quality !== null && <span className="ml-auto text-[11.5px] text-faint">Calidad para el repaso espaciado: {quality}/5</span>}
      </div>
      {banner}
      {rubric.length > 0 && (
        <Block title="Rúbrica">
          <ul className="flex flex-col gap-1">
            {rubric.map((item, i) => (
              <li key={i} className="flex gap-2 text-[13.5px]">
                <span className={result.rubric[i] ? "text-mint" : "text-danger"}>{result.rubric[i] ? "✓" : "✗"}</span>
                <span className="nv-prose nv-inline text-[13.5px]" dangerouslySetInnerHTML={md(item)} />
              </li>
            ))}
          </ul>
        </Block>
      )}
      {result.errors.length > 0 && (
        <Block title="Errores">
          <div className="flex flex-col gap-2.5">
            {result.errors.map((e, i) => (
              <div key={i} className="text-[13.5px]">
                <b className="text-text">{e.category}</b>{e.anchor && <i className="text-dim"> · {e.anchor}</i>}
                <div className="nv-prose nv-inline text-[13.5px]" dangerouslySetInnerHTML={md(e.description)} />
                {e.evidence && <div className="text-[12.5px] text-dim">En tu respuesta: «{e.evidence}»</div>}
                {e.fix && <div className="nv-prose nv-inline text-[13px]" dangerouslySetInnerHTML={md(`Cómo corregirlo: ${e.fix}`)} />}
              </div>
            ))}
          </div>
        </Block>
      )}
      {result.feedback && <Block title="Comentario"><div className="nv-prose nv-inline text-[14px]" dangerouslySetInnerHTML={md(result.feedback)} /></Block>}
      {result.next_step && <Block title="Siguiente paso"><div className="nv-prose nv-inline text-[13.5px]" dangerouslySetInnerHTML={md(result.next_step)} /></Block>}
      {result.example && (
        <Block title="Ejemplo corregido">
          <pre className="whitespace-pre-wrap rounded-lg bg-panel px-3 py-2 font-mono text-[12.5px] text-text">{result.example}</pre>
        </Block>
      )}
      <div>
        <button type="button" onClick={onRetry}
          className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-[12.5px] text-dim hover:bg-hover hover:text-text">
          <RotateCcw size={13} /> Nuevo intento
        </button>
      </div>
    </section>
  );
}

export function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h3 className="mb-1 font-mono text-[10.5px] uppercase tracking-wider text-faint">{title}</h3>
      {children}
    </div>
  );
}

/** The practice clock; the parent owns the state (it records the seconds). */
export function TimerBox({ spec, state, running, onToggle, onReset }: {
  spec: TimerSpec; state: TimerState; running: boolean; onToggle: () => void; onReset: () => void;
}) {
  if (spec.kind === "off") return null;
  const clock = display(spec, state);
  return (
    <div className="flex flex-none items-center gap-2 rounded-xl border border-line bg-card px-3 py-2">
      <Timer size={15} className="text-faint" />
      <div className="text-right">
        <div className={cn("font-mono text-[19px] font-semibold", clock.over ? "text-danger" : state.phase === "break" ? "text-mint" : "text-text")}>
          {clock.text}
        </div>
        <div className="text-[10.5px] text-faint">{clock.label}{!running && state.workElapsed > 0 ? " · en pausa" : ""}</div>
      </div>
      <button type="button" title={running ? "Pausar" : "Iniciar"} onClick={onToggle}
        className="grid h-7 w-7 place-items-center rounded-md text-dim hover:bg-hover hover:text-text">
        {running ? <Pause size={14} /> : <Play size={14} />}
      </button>
      <button type="button" title="Reiniciar" onClick={onReset}
        className="grid h-7 w-7 place-items-center rounded-md text-dim hover:bg-hover hover:text-text">
        <RotateCcw size={13} />
      </button>
    </div>
  );
}

/** Tick the clock every second while running; `onAlarm` when time is up. */
export function useClock(spec: TimerSpec | undefined, running: boolean, set: (f: (s: TimerState) => TimerState) => void, onAlarm: () => void) {
  const alarm = useRef(onAlarm);
  alarm.current = onAlarm;
  useEffect(() => {
    if (!running || !spec) return;
    const id = setInterval(() => {
      set((s) => {
        const r = tick(spec, s);
        if (r.alarm) {
          beep();
          alarm.current();
        }
        return r.state;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [running, spec, set]);
}
