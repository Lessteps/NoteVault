// Piezas comunes de los paneles del Mentor (todos de solo previsualización).

import { CircleAlert, Loader2 } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { useMentor } from "../../store/mentor";

/** Cabecera + avisos de carga/errores + contenido; los paneles de datos la comparten. */
export function PanelPage({ title, subtitle, children, wide }: { title: string; subtitle?: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto bg-surface text-text">
      <div className={`mx-auto w-full space-y-4 p-5 ${wide ? "max-w-[1100px]" : "max-w-[900px]"}`}>
        <header>
          <h1 className="text-[18px] font-semibold">{title}</h1>
          {subtitle && <p className="mt-0.5 text-[12.5px] text-faint">{subtitle}</p>}
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
