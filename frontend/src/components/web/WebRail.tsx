// The browser rail: every open page, one row each, down the right-hand side.
//
// It is Brave's side panel: the pages are *not* top-bar tabs. Clicking a row
// makes it the page the browser surface shows, the rail can shrink to icons or
// be hidden altogether, and closing the last page leaves an empty rail with its
// "+" still there instead of a broken panel.

import { Globe, PanelRightClose, Plus, Rows3, X } from "lucide-react";
import { askText, cn } from "../ui";
import { activeWebPage, pageLabel, useWebPages, type WebPage } from "../../store/webPages";

/** A stable colour per site, so a monogram is recognisable at a glance. */
function hueOf(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) % 360;
  return h;
}

function Monogram({ page, size = 16 }: { page: WebPage; size?: number }) {
  const host = page.url.replace(/^[a-z]+:\/\//i, "").split("/")[0] ?? "";
  const letter = (host.replace(/^www\./, "")[0] ?? "·").toUpperCase();
  const hue = hueOf(host || page.id);
  return (
    <span
      aria-hidden
      className="grid flex-none place-items-center rounded font-bold text-white"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.62,
        background: `hsl(${hue} 45% 38%)`,
      }}
    >
      {letter}
    </span>
  );
}

function PageIcon({ page, size = 16 }: { page: WebPage; size?: number }) {
  if (page.favicon) {
    return <img src={page.favicon} alt="" width={size} height={size} className="flex-none rounded" />;
  }
  return <Monogram page={page} size={size} />;
}

export function WebRail() {
  const pages = useWebPages((s) => s.pages);
  const open = useWebPages((s) => s.open);
  const compact = useWebPages((s) => s.compact);
  const activeId = useWebPages((s) => s.activeId);
  const { add, close, activate, setOpen, setCompact } = useWebPages.getState();
  const active = activeWebPage({ pages, activeId });

  if (!open) return null;

  const newPage = async () => {
    const url = await askText("Nueva página del navegador", "https://", "Abrir");
    if (url === null) return;
    add(url.trim());
  };

  return (
    <aside
      aria-label="Páginas del navegador"
      className={cn("flex flex-none flex-col border-l border-line bg-panel", compact ? "w-12" : "w-[236px]")}
    >
      <header className="flex h-9 flex-none items-center gap-1 border-b border-line px-2">
        <Globe size={13} className="flex-none text-accent-text" />
        {!compact && (
          <span className="flex-1 truncate font-mono text-[9.5px] font-semibold uppercase tracking-wider text-faint">
            Navegador
          </span>
        )}
        <button
          type="button"
          title="Nueva página"
          aria-label="Nueva página"
          onClick={() => void newPage()}
          className="grid h-6 w-6 flex-none place-items-center rounded text-faint hover:bg-hover hover:text-text"
        >
          <Plus size={13} />
        </button>
        <button
          type="button"
          title={compact ? "Mostrar títulos" : "Solo iconos"}
          aria-label={compact ? "Mostrar títulos" : "Solo iconos"}
          onClick={() => setCompact(!compact)}
          className="grid h-6 w-6 flex-none place-items-center rounded text-faint hover:bg-hover hover:text-text"
        >
          <Rows3 size={13} />
        </button>
        <button
          type="button"
          title="Ocultar el panel"
          aria-label="Ocultar el panel"
          onClick={() => setOpen(false)}
          className="grid h-6 w-6 flex-none place-items-center rounded text-faint hover:bg-hover hover:text-text"
        >
          <PanelRightClose size={13} />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {pages.length === 0 ? (
          !compact && (
            <p className="px-2 py-3 text-[11px] leading-snug text-faint">
              No hay páginas abiertas. Usa <span className="text-dim">+</span> para abrir una.
            </p>
          )
        ) : (
          <ul className="flex flex-col gap-0.5">
            {pages.map((page) => {
              const isActive = page.id === activeId;
              const label = pageLabel(page);
              return (
                <li key={page.id}>
                  <button
                    type="button"
                    onClick={() => activate(page.id)}
                    title={page.url || label}
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      "group flex w-full items-center gap-2 rounded-md px-1.5 py-1.5 text-left transition-colors",
                      isActive ? "bg-accent-soft text-text shadow-[inset_2px_0_0_var(--nv-accent)]" : "text-dim hover:bg-hover",
                    )}
                  >
                    <PageIcon page={page} />
                    {!compact && <span className="min-w-0 flex-1 truncate text-[12px]">{label}</span>}
                    <span
                      role="button"
                      tabIndex={-1}
                      title="Cerrar página"
                      aria-label={`Cerrar ${label}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        close(page.id);
                      }}
                      className={cn(
                        "grid h-4 w-4 flex-none place-items-center rounded hover:bg-hover hover:text-text",
                        isActive ? "text-dim" : "text-faint opacity-0 group-hover:opacity-100",
                      )}
                    >
                      <X size={11} />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {!compact && active && (
        <footer className="flex-none border-t border-line px-2 py-1.5">
          <div className="truncate font-mono text-[9.5px] text-faint" title={active.url}>
            {active.url || "sin dirección"}
          </div>
        </footer>
      )}
    </aside>
  );
}
