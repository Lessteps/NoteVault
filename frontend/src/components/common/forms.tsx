// Form pieces shared by the module dialogs and side panels.

import { X } from "lucide-react";
import type { ReactNode } from "react";
import { cn, IconButton } from "../ui";

export const inputBase = "rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[13px] text-text outline-none placeholder:text-faint focus:border-accent";
export const input = `${inputBase} w-full`;

export function Label({ children }: { children: ReactNode }) {
  return <span className="mb-1 block font-mono text-[10.5px] uppercase tracking-wider text-faint">{children}</span>;
}

export function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={cn("block", className)}>
      <Label>{label}</Label>
      {children}
    </label>
  );
}

export function Chip({ children, colour, className }: { children: ReactNode; colour?: string; className?: string }) {
  return (
    <span
      className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11px] font-medium", className)}
      style={{ color: colour ?? "var(--nv-dim)", background: `color-mix(in srgb, ${colour ?? "var(--nv-dim)"} 16%, transparent)` }}
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

export function PrimaryButton({ children, onClick, disabled, className, type = "button" }: {
  children: ReactNode; onClick?: () => void; disabled?: boolean; className?: string; type?: "button" | "submit";
}) {
  return (
    <button type={type} disabled={disabled} onClick={onClick}
      className={cn("flex flex-none items-center gap-1.5 whitespace-nowrap rounded-lg bg-accent px-3 py-1.5 text-[12.5px] font-medium text-white hover:bg-accent-strong disabled:opacity-50", className)}>
      {children}
    </button>
  );
}

export function GhostButton({ children, onClick, danger, className, title, ...rest }: {
  children: ReactNode; onClick?: () => void; danger?: boolean; className?: string; title?: string;
  /** Para los `data-*` que usan los tests y el e2e. */
  [key: `data-${string}`]: unknown;
}) {
  return (
    <button type="button" title={title} onClick={onClick} {...rest}
      className={cn("flex flex-none items-center gap-1.5 whitespace-nowrap rounded-lg border border-line px-2.5 py-1.5 text-[12.5px]",
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
