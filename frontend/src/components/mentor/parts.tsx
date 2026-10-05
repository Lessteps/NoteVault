// Piezas comunes de los paneles del Mentor (todos de solo previsualización).

import { ChevronLeft, ChevronRight, CircleAlert, Loader2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useMentor } from "../../store/mentor";
import { BlockProgress as BlockBar } from "../common/charts";

/** Cabecera + avisos de carga/errores + contenido; los paneles de datos la comparten. */
export function PanelPage({ title, subtitle, children, wide, action }: { title: string; subtitle?: string; children: ReactNode; wide?: boolean; action?: ReactNode }) {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overflow-x-hidden bg-surface text-text">
      <div className={`mx-auto w-full min-w-0 space-y-4 p-5 ${wide ? "max-w-[1800px]" : "max-w-[900px]"}`}>
        <header className="flex flex-wrap items-start gap-x-4 gap-y-2">
          <div className="min-w-0 flex-1 basis-60">
            <h1 className="text-[18px] font-semibold">{title}</h1>
            {subtitle && <p className="mt-0.5 text-[12.5px] text-faint">{subtitle}</p>}
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
        <div role="status" className="flex items-center gap-2 text-[12.5px] text-faint">
          <Loader2 size={14} className="animate-spin" /> Leyendo tu vault por primera vez, un momento…
        </div>
      )}
      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-xl border border-danger/40 bg-danger-soft px-3 py-2 text-[12.5px] text-danger">
          <CircleAlert size={14} className="mt-0.5 flex-none" />
          <span className="flex-1">{error}</span>
          <button type="button" onClick={onRetry} className="underline">Reintentar</button>
        </div>
      )}
      {empty && !warming && !error && <p className="text-[12.5px] text-faint">Cargando…</p>}
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

export function ProgressBar({ pct, colour }: { pct: number; colour?: string }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-hover" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: colour ?? "var(--nv-accent)" }} />
    </div>
  );
}

/** Cabecera plegable de una tarjeta de previsualización: un botón que abre/cierra su detalle. */
export function Disclosure({ open, onToggle, label, children }: { open: boolean; onToggle: () => void; label: string; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-label={label}
      className="flex w-full min-w-0 items-start gap-2 text-left"
    >
      <ChevronRight size={15} className={`mt-0.5 flex-none text-faint transition-transform ${open ? "rotate-90" : ""}`} />
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
  const arrow = "absolute top-14 z-10 flex h-7 w-7 items-center justify-center rounded-full border border-line bg-card text-dim shadow hover:text-text";
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
