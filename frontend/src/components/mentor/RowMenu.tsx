// Mentor — la flecha de una fila (tema, kata…): abre un menú con sus acciones. Compartido por el tablero «Cómo voy» y la práctica de cada área.

import { ChevronRight } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "../ui";

export interface MenuAction {
  id: string;
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  testid?: string;
}

/**
 * `trigger`: en vez de la flecha, el propio contenido (el título del tema) abre el menú al pulsarlo; `className` es el de ese botón.
 */
export function RowMenu({ title, items, disabled, trigger, className }: { title: string; items: MenuAction[]; disabled?: boolean; trigger?: ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent): void => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent): void => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  const item = "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[14px] hover:bg-hover";
  return (
    <span ref={box} className={cn("relative", trigger ? "min-w-0 flex-1" : "flex-none")}>
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Abrir ${title}`}
        onClick={() => setOpen((v) => !v)}
        className={trigger ? cn("block max-w-full text-left", className) : "grid h-9 w-9 place-items-center rounded-lg text-faint transition-colors hover:bg-hover hover:text-text disabled:cursor-not-allowed disabled:opacity-40"}
        data-testid={trigger ? "board-topic-trigger" : "board-arrow"}
      >
        {trigger ?? <ChevronRight size={18} aria-hidden className={cn("transition-transform", open && "rotate-90")} />}
      </button>
      {open && (
        <div role="menu" aria-label={`Abrir ${title}`} className={cn("absolute top-full z-30 mt-1 w-64 rounded-xl border border-line bg-card p-1.5 shadow-xl", trigger ? "left-0" : "right-0")} data-testid="board-menu">
          {items.map((it) => (
            <button key={it.id} role="menuitem" type="button" className={item} data-testid={it.testid} onClick={() => { setOpen(false); it.onClick(); }}>
              {it.icon} {it.label}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}
