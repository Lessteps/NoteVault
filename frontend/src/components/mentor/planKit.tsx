// Mentor — Plan: piezas de interfaz accesibles de la sub-interfaz de un plan (pestañas WAI-ARIA, «volver arriba»,
// títulos de sección). Sin lógica de datos.

import { ArrowUp } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import { cn } from "../ui";

export interface TabDef {
  id: string;
  label: string;
  /** nombre corto para contenedores estrechos (el nombre accesible sigue siendo `label`) */
  short?: string;
  /** contador visible junto al nombre (p. ej. decisiones pendientes) */
  badge?: number;
  /** cómo se lee ese contador («10 pendientes») */
  badgeLabel?: string;
}

export const tabId = (prefix: string, id: string): string => `${prefix}-tab-${id}`;
export const panelId = (prefix: string, id: string): string => `${prefix}-panel-${id}`;

/**
 * Pestañas del patrón WAI-ARIA «tabs» con activación automática: ←/→ (y Inicio/Fin) mueven el foco y la selección, solo la
 * pestaña activa entra en el orden de Tab y de ahí se pasa al panel. Si no caben, se pliegan en varias líneas (nunca scroll horizontal).
 */
export function Tabs({ tabs, active, onChange, prefix, label }: { tabs: TabDef[]; active: string; onChange: (id: string) => void; prefix: string; label: string }) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = tabs.findIndex((t) => t.id === active);
    let next = -1;
    if (e.key === "ArrowRight") next = (i + 1) % tabs.length;
    else if (e.key === "ArrowLeft") next = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = tabs.length - 1;
    if (next < 0) return;
    e.preventDefault();
    const t = tabs[next]!;
    onChange(t.id);
    refs.current[t.id]?.focus();
  };
  return (
    <div role="tablist" aria-label={label} onKeyDown={onKeyDown} className="flex flex-wrap gap-0.5 py-1.5 @3xl:gap-1">
      {tabs.map((t) => {
        const on = t.id === active;
        return (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[t.id] = el;
            }}
            id={tabId(prefix, t.id)}
            type="button"
            role="tab"
            aria-selected={on}
            aria-controls={panelId(prefix, t.id)}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(t.id)}
            className={cn(
              "inline-flex min-h-11 items-center gap-1.5 rounded-lg border px-2 py-2 text-[14px] font-medium @3xl:gap-2 @3xl:px-3.5",
              on ? "border-accent bg-accent-soft text-accent-text" : "border-transparent text-dim hover:bg-hover hover:text-text",
            )}
          >
            {t.short ? (
              <>
                <span className="@3xl:hidden" aria-hidden>{t.short}</span>
                <span className="hidden @3xl:inline" aria-hidden>{t.label}</span>
                <span className="sr-only">{t.label}</span>
              </>
            ) : (
              t.label
            )}
            {t.badge ? (
              <span className={cn("min-w-6 rounded-full px-1.5 text-center text-[13px] font-semibold", on ? "bg-[var(--nv-btn,var(--nv-accent))] text-white" : "bg-hover text-text")}>
                <span aria-hidden>{t.badge}</span>
                <span className="sr-only">, {t.badgeLabel ?? String(t.badge)}</span>
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/** Cuerpo de una pestaña: siempre en el DOM (para que `aria-controls` apunte a algo) pero oculto si no es la activa. */
export function TabPanel({ prefix, id, active, children, className, bare }: { prefix: string; id: string; active: boolean; children: ReactNode; className?: string; /** sin pestañas en la página (las elige la barra lateral): un panel simple, sin rol de pestaña */ bare?: boolean }) {
  return (
    <div {...(bare ? {} : { role: "tabpanel", "aria-labelledby": tabId(prefix, id) })} id={panelId(prefix, id)} hidden={!active} className={cn("min-w-0 space-y-6 pt-4", className)}>
      {children}
    </div>
  );
}

/** Botón flotante «Volver arriba»: aparece al bajar y devuelve el foco al principio de la vista. */
export function BackToTop({ scroller, onTop }: { scroller: RefObject<HTMLElement | null>; onTop: () => void }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const on = () => setShow(el.scrollTop > 480);
    el.addEventListener("scroll", on, { passive: true });
    return () => el.removeEventListener("scroll", on);
  }, [scroller]);
  if (!show) return null;
  return (
    <button
      type="button"
      onClick={onTop}
      className="nv-ghost fixed bottom-14 right-16 z-30 inline-flex min-h-11 items-center gap-2 rounded-full border border-line bg-card px-4 py-2 text-[14px] font-medium text-text shadow-lg hover:bg-hover"
    >
      <ArrowUp size={16} aria-hidden /> Volver arriba
    </button>
  );
}

/** Enlace «Saltar al contenido»: invisible hasta que recibe el foco con el teclado. */
export function SkipLink({ targetId, children }: { targetId: string; children: ReactNode }) {
  const go = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const el = document.getElementById(targetId);
      el?.focus();
      el?.scrollIntoView?.({ block: "start" });
    },
    [targetId],
  );
  return (
    <a
      href={`#${targetId}`}
      onClick={go}
      className="sr-only rounded-lg bg-card px-4 py-2.5 text-[14px] font-semibold text-accent-text shadow-lg focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50"
    >
      {children}
    </a>
  );
}

/** Título de sección (h2) con su descripción opcional. */
export function SectionHeading({ id, children, hint, right }: { id: string; children: ReactNode; hint?: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-start gap-x-3 gap-y-1">
      <div className="min-w-0 flex-1 basis-60">
        <h2 id={id} className="text-[18px] font-semibold leading-snug text-text">{children}</h2>
        {hint ? <p className="mt-0.5 text-[14px] text-dim">{hint}</p> : null}
      </div>
      {right}
    </div>
  );
}

/** Tarjeta de sección: región con nombre propio (el de su título). */
export function SectionCard({ labelledBy, children, className, testid }: { labelledBy: string; children: ReactNode; className?: string; testid?: string }) {
  return (
    <section aria-labelledby={labelledBy} data-testid={testid} className={cn("rounded-2xl border border-line bg-card p-4 @3xl:p-5", className)}>
      {children}
    </section>
  );
}

const NOTES_FOLD = 160;

/** Los comentarios que el estudiante dio para armar el plan: compactos, plegables si son largos. */
export function PlanNotes({ notes, auto, testid, title = "Tus comentarios" }: { notes: string; auto: boolean; testid: string; title?: string }) {
  const [open, setOpen] = useState(false);
  const long = notes.length > NOTES_FOLD || notes.includes("\n");
  const shown = long && !open ? `${notes.split("\n")[0]!.slice(0, NOTES_FOLD).trim()}…` : notes;
  return (
    <div className="rounded-xl border border-line px-3.5 py-3 text-[14px]" data-testid={testid}>
      <div className="flex items-center gap-2">
        <h3 className="text-[13px] font-semibold uppercase tracking-wider text-faint">{title}</h3>
        <span className="flex-1" />
        {long && (
          <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="inline-flex min-h-8 items-center px-1 text-[14px] text-accent-text underline-offset-2 hover:underline">
            {open ? "Ver menos" : "Ver todo"}
          </button>
        )}
      </div>
      <p className="mt-0.5 whitespace-pre-wrap text-dim">{shown}</p>
      {auto && <p className="mt-0.5 text-[13.5px] text-faint">Los comentarios solo los usa la IA; este plan se generó automáticamente.</p>}
    </div>
  );
}
