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
  /** sub-vistas anidadas bajo este ítem (p. ej. una por plan del Mentor): crecen o decrecen con los datos */
  subItems?: SidebarItem[];
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
      <nav className="flex min-h-0 flex-col gap-0.5 overflow-y-auto p-2">
        {items.map((it) => (
          <div key={it.id} className="flex flex-col gap-0.5">
            <SidebarButton it={it} active={active === it.id} onSelect={onSelect} />
            {it.subItems && it.subItems.length > 0 && (
              <div className="ml-4 flex flex-col gap-0.5 border-l border-line pl-1.5" role="group" aria-label={`${it.label}: sub-vistas`}>
                {it.subItems.map((sub) => (
                  <SidebarButton key={sub.id} it={sub} active={active === sub.id} onSelect={onSelect} sub />
                ))}
              </div>
            )}
          </div>
        ))}
      </nav>
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      {footer}
    </aside>
  );
}

function SidebarButton({ it, active, onSelect, sub }: { it: SidebarItem; active: boolean; onSelect: (id: string) => void; sub?: boolean }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(it.id)}
      aria-current={active ? "page" : undefined}
      title={sub ? it.hint : undefined}
      className={cn(
        "flex items-center gap-2.5 rounded-lg text-left transition-colors",
        sub ? "px-2 py-1.5" : "px-2.5 py-2",
        active ? "bg-accent-soft text-text" : "text-dim hover:bg-hover hover:text-text",
      )}
    >
      <span className={cn("flex-none [&>svg]:h-4 [&>svg]:w-4", sub && "[&>svg]:h-3.5 [&>svg]:w-3.5", active && "text-accent-text")}>{it.icon}</span>
      <span className="min-w-0 flex-1">
        <span className={cn("block truncate", sub ? "text-[12.5px]" : "text-[13px]")}>{it.label}</span>
        {it.hint && <span className="block truncate text-[11px] text-faint">{it.hint}</span>}
      </span>
      {it.badge !== undefined && it.badge !== "" && it.badge !== 0 && (
        <span className={cn("rounded-md px-1.5 font-mono text-[10.5px]", it.badgeTone === "danger" ? "bg-danger-soft text-danger" : "bg-accent-soft text-accent-text")}>{it.badge}</span>
      )}
    </button>
  );
}
