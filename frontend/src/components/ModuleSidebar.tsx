// The left column every module uses: a title and a list of views.

import type { ReactNode } from "react";
import { cn } from "./ui";

export interface SidebarItem {
  id: string;
  label: string;
  hint?: string;
  icon: ReactNode;
  badge?: string | number;
  badgeTone?: "accent" | "danger";
}

export function ModuleSidebar({
  title, items, active, onSelect, children, footer,
}: {
  title: string;
  items: SidebarItem[];
  active: string;
  onSelect: (id: string) => void;
  children?: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <aside className="flex w-[260px] flex-none flex-col border-r border-line bg-panel">
      <div className="flex h-10 flex-none items-center border-b border-line px-4">
        <span className="font-mono text-[10.5px] font-semibold uppercase tracking-wider text-faint">{title}</span>
      </div>
      <nav className="flex flex-col gap-0.5 p-2">
        {items.map((it) => (
          <button
            key={it.id}
            type="button"
            onClick={() => onSelect(it.id)}
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors",
              active === it.id ? "bg-accent-soft text-text" : "text-dim hover:bg-hover hover:text-text",
            )}
          >
            <span className={cn("flex-none [&>svg]:h-4 [&>svg]:w-4", active === it.id && "text-accent-text")}>
              {it.icon}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px]">{it.label}</span>
              {it.hint && <span className="block truncate text-[11px] text-faint">{it.hint}</span>}
            </span>
            {it.badge !== undefined && it.badge !== "" && it.badge !== 0 && (
              <span
                className={cn(
                  "rounded-md px-1.5 font-mono text-[10.5px]",
                  it.badgeTone === "danger" ? "bg-danger-soft text-danger" : "bg-accent-soft text-accent-text",
                )}
              >
                {it.badge}
              </span>
            )}
          </button>
        ))}
      </nav>
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      {footer}
    </aside>
  );
}
