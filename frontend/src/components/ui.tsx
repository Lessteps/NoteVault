// Small shared building blocks.

import { useEffect, useRef, useState, type ReactNode } from "react";
import { create } from "zustand";

export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

export function IconButton({
  title, onClick, active, children, className, disabled,
}: {
  title: string;
  onClick?: () => void;
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

const useDialog = create<{ req: DialogReq | null; set: (r: DialogReq | null) => void }>((set) => ({
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
  label: string;
  icon?: ReactNode;
  danger?: boolean;
  onSelect: () => void;
}

const useMenu = create<{
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
    window.addEventListener("mousedown", close);
    window.addEventListener("blur", close);
    window.addEventListener("keydown", close);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("blur", close);
      window.removeEventListener("keydown", close);
    };
  }, [menu, set]);
  if (!menu) return null;
  const x = Math.min(menu.x, window.innerWidth - 220);
  const y = Math.min(menu.y, window.innerHeight - menu.items.length * 32 - 16);
  return (
    <div
      className="fixed z-50 min-w-[200px] rounded-lg border border-line-strong bg-card p-1 shadow-2xl"
      style={{ left: x, top: y }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {menu.items.map((it) => (
        <button
          key={it.label}
          type="button"
          onClick={() => {
            set(null);
            it.onSelect();
          }}
          className={cn(
            "flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-[12.5px]",
            it.danger ? "text-danger hover:bg-danger-soft" : "text-text hover:bg-hover",
          )}
        >
          <span className="text-dim [&>svg]:h-3.5 [&>svg]:w-3.5">{it.icon}</span>
          {it.label}
        </button>
      ))}
    </div>
  );
}
