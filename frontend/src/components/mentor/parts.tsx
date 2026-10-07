// Piezas comunes de los paneles del Mentor (todos de solo previsualización).

import { ChevronLeft, ChevronRight, CircleAlert, Loader2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { api } from "../../lib/bridge";
import { useMentor } from "../../store/mentor";
import { BlockProgress as BlockBar } from "../common/charts";
import { cn } from "../ui";

/** Cabecera + avisos de carga/errores + contenido; los paneles de datos la comparten. */
export function PanelPage({ title, subtitle, children, wide, action, a11y }: { title: string; subtitle?: string; children: ReactNode; wide?: boolean; action?: ReactNode; /** tipografía y contraste reforzados (vistas accesibles del Mentor) */ a11y?: boolean }) {
  return (
    <div className={cn("flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overflow-x-hidden bg-surface text-text", a11y && "nv-a11y")}>
      <div className={`mx-auto w-full min-w-0 space-y-4 p-5 ${wide ? "max-w-[1800px]" : "max-w-[900px]"}`}>
        <header className="flex flex-wrap items-start gap-x-4 gap-y-2">
          <div className="min-w-0 flex-1 basis-60">
            <h1 className={a11y ? "text-[22px] font-semibold leading-tight" : "text-[18px] font-semibold"}>{title}</h1>
            {subtitle && <p className={cn("mt-0.5 text-faint", a11y ? "text-[14px]" : "text-[12.5px]")}>{subtitle}</p>}
          </div>
          {action}
        </header>
        {children}
      </div>
    </div>
  );
}

/** Carga perezosa de las previsualizaciones, con el aviso de vault fría y el reintento. */
export function useMentorPanels() {
  const panels = useMentor((s) => s.panels);
  const warming = useMentor((s) => s.warming);
  const error = useMentor((s) => s.panelsError);
  const loadPanels = useMentor((s) => s.loadPanels);
  useEffect(() => {
    void loadPanels();
  }, [loadPanels]);
  return { panels, warming, error, reload: loadPanels };
}

export function LoadState({ warming, error, empty, onRetry }: { warming: boolean; error: string; empty: boolean; onRetry: () => void }) {
  return (
    <>
      {warming && (
        <div role="status" className="flex items-center gap-2 text-[14px] text-faint">
          <Loader2 size={14} aria-hidden className="animate-spin" /> Leyendo tu vault por primera vez, un momento…
        </div>
      )}
      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-xl border border-danger/40 bg-danger-soft px-3 py-2 text-[14px] text-danger">
          <CircleAlert size={15} aria-hidden className="mt-0.5 flex-none" />
          <span className="flex-1">{error}</span>
          <button type="button" onClick={onRetry} className="min-h-8 px-2 underline">Reintentar</button>
        </div>
      )}
      {empty && !warming && !error && <p role="status" className="text-[14px] text-faint">Cargando…</p>}
    </>
  );
}

export const dayText = (iso: string | null): string => {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y!, m! - 1, d!).toLocaleDateString("es", { day: "numeric", month: "short", year: "numeric" });
};

export function daysLeftText(days: number | null | undefined): string {
  if (days === null || days === undefined) return "";
  if (days < 0) return `vencida hace ${-days} d`;
  if (days === 0) return "vence hoy";
  return `${days} d restantes`;
}

export const hm = (min: number): string => (min >= 60 ? `${Math.round((min / 60) * 10) / 10} h` : `${min} min`);

export function ProgressBar({ pct, colour, label, thick }: { pct: number; colour?: string; /** nombre accesible de la barra */ label?: string; thick?: boolean }) {
  return (
    <div className={cn("w-full overflow-hidden rounded-full bg-hover", thick ? "h-2.5" : "h-1.5")} role="progressbar" aria-label={label ?? "Progreso"} aria-valuetext={`${Math.round(pct)} %`} aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: colour ?? "var(--nv-accent)" }} />
    </div>
  );
}

/** Cabecera plegable de una tarjeta de previsualización: un botón que abre/cierra su detalle. */
export function Disclosure({ open, onToggle, label, children, controls }: { open: boolean; onToggle: () => void; label: string; children: ReactNode; /** id del contenido que abre/cierra */ controls?: string }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-controls={controls}
      aria-label={label}
      className="flex w-full min-w-0 items-start gap-2 text-left"
    >
      <ChevronRight size={16} aria-hidden className={`mt-0.5 flex-none text-faint transition-transform ${open ? "rotate-90" : ""}`} />
      <div className="min-w-0 flex-1">{children}</div>
    </button>
  );
}

/** Clases comunes de las tarjetas compactas de las filas: ancho fijo, alineadas arriba, con snap. */
export const CARD_CLASS = "w-[300px] max-w-[88%] flex-none snap-start self-start rounded-xl border border-line bg-card p-3.5";

/**
 * Una fila horizontal de tarjetas compactas: solo ella hace scroll horizontal (rueda con Mayús, gesto
 * táctil, barra discreta o las flechas), con degradados en los bordes que avisan de que hay más.
 */
export function CardRow({ children, label }: { children: ReactNode; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState({ left: false, right: false });
  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setEdge({ left: el.scrollLeft > 4, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 });
  }, []);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    update();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    for (const c of Array.from(el.children)) ro.observe(c);
    return () => ro.disconnect();
  }, [update, children]);
  const go = (dir: 1 | -1) => ref.current?.scrollBy({ left: dir * Math.max(240, (ref.current?.clientWidth ?? 0) * 0.8), behavior: "smooth" });
  const arrow = "absolute top-14 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-line bg-card text-dim shadow hover:text-text";
  return (
    <div className="relative" data-testid="card-row">
      <div
        ref={ref}
        onScroll={update}
        role="group"
        aria-label={label}
        className="flex items-start gap-3 overflow-x-auto overflow-y-hidden pb-2 snap-x snap-proximity [scrollbar-width:thin]"
      >
        {children}
      </div>
      {edge.left && (
        <>
          <div aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-surface to-transparent" />
          <button type="button" aria-label="Ver anteriores" onClick={() => go(-1)} className={`${arrow} left-1`}><ChevronLeft size={15} /></button>
        </>
      )}
      {edge.right && (
        <>
          <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-surface to-transparent" />
          <button type="button" aria-label="Ver más" onClick={() => go(1)} className={`${arrow} right-1`}><ChevronRight size={15} /></button>
        </>
      )}
    </div>
  );
}

/** Un grupo por área: cabecera (icono + nombre, nº de elementos, progreso medio) y su fila de tarjetas. */
export function AreaRow({ title, colour, count, noun, avg, children }: { title: string; colour: string; count: number; noun: [string, string]; avg?: number; children: ReactNode }) {
  return (
    <section aria-label={title}>
      <h2 className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13.5px] font-semibold" style={{ color: colour }}>
        {title}
        {avg !== undefined && <BlockBar value={avg} colour={colour} blocks={10} />}
        <span className="text-[11.5px] font-normal text-faint">{count} {count === 1 ? noun[0] : noun[1]}</span>
      </h2>
      <CardRow label={title}>{children}</CardRow>
    </section>
  );
}

/** Chip seleccionable (con `aria-pressed`) de los formularios del Mentor: el mismo aspecto que los de «Hoy». */
export function ChipToggle({ active, onClick, children, title, label }: { active: boolean; onClick: () => void; children: ReactNode; title?: string; label?: string }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={label}
      title={title}
      onClick={onClick}
      className={cn("min-h-8 min-w-8 rounded-md border px-2.5 py-1 text-left text-[13px]", active ? "border-accent bg-accent-soft text-accent-text" : "border-line text-dim hover:bg-hover hover:text-text")}
    >
      {children}
    </button>
  );
}

/** A partir de cuántos segundos de espera se sugiere seguir sin IA. */
export const SLOW_AI_SECONDS = 90;

/**
 * El estado de una llamada larga de la IA del Mentor (`generate`, `chat`, `build:<id>`, `change:<id>`): mientras `active`, consulta cada
 * ~1,5 s qué está haciendo («Eligiendo temas de Programación…») y cuánto lleva; el contador sigue corriendo cada segundo.
 */
export function useAiStatus(key: string, active: boolean): { label: string; elapsed: number } {
  const [snap, setSnap] = useState({ label: "", base: 0, at: Date.now() });
  const [, tick] = useState(0);
  useEffect(() => {
    if (!active) return;
    let alive = true;
    setSnap({ label: "", base: 0, at: Date.now() });
    const poll = async () => {
      try {
        const s = await api.mentorAiStatus(key);
        if (alive && s.busy) setSnap({ label: s.label, base: s.elapsed, at: Date.now() });
      } catch {
        /* sin estado: se queda el contador local */
      }
    };
    void poll();
    const p = setInterval(() => void poll(), 1500);
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => {
      alive = false;
      clearInterval(p);
      clearInterval(t);
    };
  }, [key, active]);
  return { label: snap.label, elapsed: Math.max(0, snap.base + Math.floor((Date.now() - snap.at) / 1000)) };
}

/** «Pensando…» claro y persistente: qué hace, segundos transcurridos, «Cancelar» y, tras ~90 s, la salida «plan automático (sin IA)». */
export function ThinkingStatus({ label, elapsed, onCancel, onAuto, autoLabel = "Seguir con el plan automático (sin IA)" }: { label: string; elapsed: number; onCancel?: () => void; onAuto?: () => void; autoLabel?: string }) {
  return (
    <div data-testid="ai-thinking" className="nv-a11y rounded-xl border border-line bg-surface px-3 py-2.5 text-[14px]">
      <div className="flex flex-wrap items-center gap-2">
        {/* solo esto se anuncia (una vez): el contador de segundos va aparte, sin aria-live, para no repetirse cada segundo */}
        <span role="status" aria-live="polite" className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <Loader2 size={15} aria-hidden className="animate-spin text-accent-text" />
          <span className="font-medium text-text">Pensando…</span>
          <span className="min-w-0 text-dim">{label || "El Mentor está trabajando en ello"}</span>
        </span>
        <span className="font-mono text-[13px] text-faint" data-testid="ai-elapsed">{elapsed} s</span>
        {onCancel && (
          <button type="button" onClick={onCancel} className="nv-ghost inline-flex min-h-8 items-center gap-1 rounded-md border border-line px-3 py-1 text-[13px] text-dim hover:bg-hover hover:text-text">
            <X size={13} aria-hidden /> Cancelar
          </button>
        )}
      </div>
      {elapsed >= SLOW_AI_SECONDS && onAuto && (
        <p className="mt-1.5 text-[13px] text-faint" data-testid="ai-slow">
          Está tardando más de lo normal.{" "}
          <button type="button" onClick={onAuto} className="inline-flex min-h-8 items-center text-accent-text underline-offset-2 hover:underline">{autoLabel}</button>
        </p>
      )}
    </div>
  );
}
