// Small shared building blocks.

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { create } from "zustand";

export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

export function IconButton({
  title, onClick, active, children, className, disabled,
}: {
  title: string;
  /** The click event is passed through so a caller can anchor a menu on it. */
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  active?: boolean;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "grid h-7 w-7 place-items-center rounded-md text-dim transition-colors",
        "hover:bg-hover hover:text-text disabled:opacity-40 disabled:hover:bg-transparent",
        active && "bg-accent-soft text-accent-text",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded border border-line bg-elevated px-1.5 py-px font-mono text-[10px] text-faint">
      {children}
    </kbd>
  );
}

// ── Prompt / confirm dialogs (promise based) ──────────────────────────────

interface DialogReq {
  kind: "prompt" | "confirm";
  title: string;
  message?: string;
  value?: string;
  confirmLabel?: string;
  danger?: boolean;
  resolve: (v: string | boolean | null) => void;
}

/**
 * El store del diálogo. Se exporta para que los tests puedan responder a una
 * confirmación: `confirmAction` pinta en `DialogHost`, que vive en la raíz de la
 * app y no dentro del contenedor que monta un test de componente.
 */
export const useDialog = create<{ req: DialogReq | null; set: (r: DialogReq | null) => void }>((set) => ({
  req: null,
  set: (req) => set({ req }),
}));

export function askText(title: string, value = "", confirmLabel = "Aceptar"): Promise<string | null> {
  return new Promise((resolve) =>
    useDialog.getState().set({
      kind: "prompt", title, value, confirmLabel,
      resolve: (v) => resolve(typeof v === "string" ? v : null),
    }),
  );
}

export function confirmAction(title: string, message: string, confirmLabel: string, danger = false): Promise<boolean> {
  return new Promise((resolve) =>
    useDialog.getState().set({
      kind: "confirm", title, message, confirmLabel, danger,
      resolve: (v) => resolve(v === true),
    }),
  );
}

export function DialogHost() {
  const { req, set } = useDialog();
  const [value, setValue] = useState("");
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (req) {
      setValue(req.value ?? "");
      setTimeout(() => {
        input.current?.focus();
        input.current?.select();
      }, 0);
    }
  }, [req]);

  if (!req) return null;
  const close = (v: string | boolean | null) => {
    req.resolve(v);
    set(null);
  };
  const submit = () => close(req.kind === "prompt" ? value.trim() || null : true);

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-start justify-center bg-black/50 pt-[18vh]"
      onMouseDown={() => close(null)}
    >
      <div
        role="dialog"
        aria-label={req.title}
        className="w-[420px] rounded-xl border border-line-strong bg-card p-4 shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="text-sm font-semibold text-text">{req.title}</div>
        {req.message && <p className="mt-2 text-[13px] text-dim">{req.message}</p>}
        {req.kind === "prompt" && (
          <input
            ref={input}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
              if (e.key === "Escape") close(null);
            }}
            className="mt-3 w-full rounded-lg border border-line bg-surface px-3 py-2 text-[13px] text-text outline-none focus:border-accent"
          />
        )}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => close(null)}
            className="rounded-lg px-3 py-1.5 text-[12px] text-dim hover:bg-hover hover:text-text"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={submit}
            onKeyDown={(e) => e.key === "Escape" && close(null)}
            autoFocus={req.kind === "confirm"}
            className={cn(
              "rounded-lg px-3 py-1.5 text-[12px] font-semibold text-white",
              req.danger ? "bg-danger hover:opacity-90" : "bg-accent hover:bg-accent-strong",
            )}
          >
            {req.confirmLabel ?? "Aceptar"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Context menu ──────────────────────────────────────────────────────────

export interface MenuItem {
  /** A rule between groups; `label`, `icon` and `onSelect` are ignored. */
  separator?: boolean;
  label?: string;
  icon?: ReactNode;
  danger?: boolean;
  disabled?: boolean;
  /** Nested items: a submenu, opened on hover. */
  items?: MenuItem[];
  /** Right-edge hint (a shortcut, a date…). */
  hint?: string;
  /** A second, wrapping line under the label: what the entry does. */
  description?: string;
  onSelect?: () => void;
}

export const useMenu = create<{
  menu: { x: number; y: number; items: MenuItem[] } | null;
  set: (m: { x: number; y: number; items: MenuItem[] } | null) => void;
}>((set) => ({ menu: null, set: (menu) => set({ menu }) }));

export function openMenu(e: { clientX: number; clientY: number; preventDefault: () => void }, items: MenuItem[]) {
  e.preventDefault();
  useMenu.getState().set({ x: e.clientX, y: e.clientY, items });
}

export function MenuHost() {
  const { menu, set } = useMenu();
  useEffect(() => {
    if (!menu) return;
    const close = () => set(null);
    // Only a click outside or Escape closes it. Any key used to: the Windows key (which also
    // blurs the window) or a modifier pressed alone made the options vanish.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [menu, set]);
  // Measured after layout: the menu is moved back inside the window whatever its size.
  const place = (el: HTMLDivElement | null) => {
    if (!el || !menu) return;
    const r = el.getBoundingClientRect();
    el.style.left = `${Math.max(8, Math.min(menu.x, window.innerWidth - r.width - 8))}px`;
    el.style.top = `${Math.max(8, Math.min(menu.y, window.innerHeight - r.height - 8))}px`;
  };
  if (!menu) return null;
  return (
    <div
      role="menu"
      ref={place}
      className="fixed z-50 max-h-[calc(100vh-16px)] min-w-[220px] max-w-[340px] overflow-y-auto rounded-lg border border-line-strong bg-card p-1 shadow-2xl"
      style={{ left: menu.x, top: menu.y }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <MenuItems items={menu.items} onDone={() => set(null)} />
    </div>
  );
}

/** The rows of a menu; recursive so an item can hold a submenu. */
function MenuItems({ items, onDone }: { items: MenuItem[]; onDone: () => void }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <>
      {items.map((it, i) => {
        if (it.separator) {
          return <div key={`sep-${i}`} className="my-1 h-px bg-line" role="separator" />;
        }
        const nested = Boolean(it.items?.length);
        return (
          <div
            key={it.label ?? i}
            className="relative"
            onMouseEnter={() => setOpen(nested ? (it.label ?? String(i)) : null)}
          >
            <button
              type="button"
              role="menuitem"
              disabled={it.disabled}
              onClick={() => {
                if (it.disabled || nested) return;
                onDone();
                it.onSelect?.();
              }}
              className={cn(
                "flex w-full items-start gap-2.5 rounded-md px-2.5 py-1.5 text-left text-[12.5px]",
                it.disabled
                  ? "cursor-default text-faint"
                  : it.danger
                    ? "text-danger hover:bg-danger-soft"
                    : "text-text hover:bg-hover",
              )}
            >
              <span className="mt-0.5 text-dim [&>svg]:h-3.5 [&>svg]:w-3.5">{it.icon}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate">{it.label}</span>
                {it.description && <span className="mt-0.5 block whitespace-normal text-[11px] leading-snug text-faint">{it.description}</span>}
              </span>
              {it.hint && <span className="text-[11px] text-faint">{it.hint}</span>}
              {nested && <ChevronRight size={13} className="text-faint" />}
            </button>
            {nested && open === (it.label ?? String(i)) && (
              <div
                role="menu"
                // Fixed, not absolute: the parent menu scrolls (overflow-y-auto), which clips any
                // absolutely positioned child. Placed beside its row, flipped left if it won't fit.
                ref={(el) => {
                  const row = el?.parentElement;
                  if (!el || !row) return;
                  const p = row.getBoundingClientRect();
                  const r = el.getBoundingClientRect();
                  const fitsRight = p.right - 4 + r.width <= window.innerWidth - 8;
                  const left = fitsRight ? p.right - 4 : Math.max(8, p.left - r.width + 4);
                  el.style.left = `${left}px`;
                  el.style.top = `${Math.max(8, Math.min(p.top - 4, window.innerHeight - r.height - 8))}px`;
                }}
                className="fixed z-[60] min-w-[210px] rounded-lg border border-line-strong bg-card p-1 shadow-2xl"
                onMouseDown={(e) => e.stopPropagation()}
              >
                <MenuItems items={it.items ?? []} onDone={onDone} />
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
