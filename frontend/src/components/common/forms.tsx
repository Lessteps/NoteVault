// Form pieces shared by the module dialogs and side panels.

import { X } from "lucide-react";
import type { ReactNode } from "react";
import { cn, IconButton } from "../ui";

export const inputBase = "rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[13px] text-text outline-none placeholder:text-faint focus:border-accent";
export const input = `${inputBase} w-full`;

export function Label({ children }: { children: ReactNode }) {
  return <span className="nv-label mb-1 block font-mono text-[10.5px] uppercase tracking-wider text-faint">{children}</span>;
}

export function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={cn("block", className)}>
      <Label>{label}</Label>
      {children}
    </label>
  );
}

/** `large`: la versión legible (13 px, con el texto acercado al color del tema para llegar a ≥4,5:1) de las vistas accesibles. */
export function Chip({ children, colour, className, large }: { children: ReactNode; colour?: string; className?: string; large?: boolean }) {
  const c = colour ?? "var(--nv-dim)";
  return (
    <span
      className={cn("inline-flex max-w-full items-center gap-1 rounded-md font-medium break-words", large ? "px-2 py-0.5 text-[13px]" : "px-1.5 py-0.5 text-[11px]", className)}
      style={{ color: large ? `color-mix(in srgb, ${c} 75%, var(--nv-text))` : c, background: `color-mix(in srgb, ${c} 16%, transparent)` }}
    >
      {children}
    </span>
  );
}

export function Modal({ title, onClose, children, footer, width = 520 }: {
  title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; width?: number;
}) {
  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-black/45 p-4" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-label={title}
        className="flex max-h-[88vh] w-full flex-col overflow-hidden rounded-2xl border border-line-strong bg-card shadow-2xl"
        style={{ maxWidth: width }}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === "Escape" && onClose()}
      >
        <div className="flex h-12 flex-none items-center border-b border-line px-5">
          <span className="text-[14px] font-semibold text-text">{title}</span>
          <IconButton title="Cerrar" onClick={onClose} className="ml-auto"><X size={15} /></IconButton>
        </div>
        <div className="min-h-0 flex-1 space-y-3.5 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-none items-center gap-2 border-t border-line px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

/** `large`: acción principal de las vistas accesibles (objetivo de ≥44 px y texto de 14 px). */
export function PrimaryButton({ children, onClick, disabled, className, type = "button", large, ...rest }: {
  children: ReactNode; onClick?: () => void; disabled?: boolean; className?: string; type?: "button" | "submit"; large?: boolean;
  [key: `data-${string}`]: unknown;
}) {
  return (
    <button type={type} disabled={disabled} onClick={onClick} {...rest}
      className={cn("flex max-w-full flex-none items-center justify-center gap-1.5 whitespace-normal rounded-lg bg-[var(--nv-btn,var(--nv-accent))] break-words font-medium text-white hover:bg-[var(--nv-btn-hover,var(--nv-accent-strong))] disabled:opacity-50",
        large ? "min-h-11 px-4 py-2 text-[14px]" : "min-h-8 px-3 py-1.5 text-[13px]", className)}>
      {children}
    </button>
  );
}

/** `large`: objetivo de ≥44 px y texto de 14 px (acciones de las vistas accesibles); sin él, ≥32 px. */
export function GhostButton({ children, onClick, danger, className, title, large, disabled, wrap, ...rest }: {
  children: ReactNode; onClick?: () => void; danger?: boolean; className?: string; title?: string; large?: boolean | "md"; disabled?: boolean;
  /** el texto parte línea y el botón nunca es más ancho que su contenedor (avisos y acciones con frases largas) */
  wrap?: boolean;
  "aria-label"?: string; "aria-expanded"?: boolean; "aria-pressed"?: boolean;
  /** Para los `data-*` que usan los tests y el e2e. */
  [key: `data-${string}`]: unknown;
}) {
  return (
    <button type="button" title={title} onClick={onClick} disabled={disabled} {...rest}
      className={cn("nv-ghost flex items-center justify-center gap-1.5 rounded-lg border border-line disabled:opacity-50",
        // un botón mide lo que su texto y, si el contenedor es más estrecho, parte línea (nunca sobresale)
        "max-w-full whitespace-normal break-words",
        wrap ? "h-auto flex-initial text-left" : "flex-none",
        large === "md" ? "min-h-10 px-3 py-1.5 text-[14px]" : large ? "min-h-11 px-3.5 py-2 text-[14px]" : "min-h-8 px-2.5 py-1.5 text-[13px]",
        danger ? "text-danger hover:bg-danger-soft" : "text-dim hover:bg-hover hover:text-text", className)}>
      {children}
    </button>
  );
}

export function ColourRow({ colours, value, onChange }: { colours: string[]; value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {colours.map((c) => (
        <button key={c} type="button" aria-label={c} onClick={() => onChange(c)}
          className={cn("h-6 w-6 rounded-full", value.toLowerCase() === c.toLowerCase() && "ring-2 ring-text ring-offset-2 ring-offset-card")}
          style={{ background: c }} />
      ))}
      <input type="color" aria-label="Otro color" value={value} onChange={(e) => onChange(e.target.value)}
        className="h-6 w-8 cursor-pointer rounded border border-line bg-transparent" />
    </div>
  );
}

export function readFileBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const s = String(r.result);
      resolve(s.slice(s.indexOf(",") + 1));
    };
    r.onerror = () => reject(r.error ?? new Error("No se pudo leer el archivo."));
    r.readAsDataURL(file);
  });
}

export const PRIORITY_NAMES: Record<number, string> = { 1: "Baja", 2: "Media", 3: "Alta", 4: "Urgente" };
export const PRIORITY_COLOURS: Record<number, string> = { 1: "#8b8b96", 2: "#2383e2", 3: "#ff9632", 4: "#f2555a" };
export const PRIORITY_GLYPHS: Record<number, string> = { 1: "▽", 2: "=", 3: "△", 4: "▲" };
