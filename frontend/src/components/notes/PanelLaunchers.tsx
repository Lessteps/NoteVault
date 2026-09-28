// The launcher strip that sits at the right edge of Notas when no panel is open.
//
// The right panel has no content of its own: these buttons are the entry points
// for the functionalities that fill it. The globe is *not* the browser module —
// the browser's pages live in the rail, so it shows and hides that rail and
// leaves you where you are.

import { Globe, ListTree, Sparkles } from "lucide-react";
import { useApp } from "../../store/app";
import { useAssistant } from "../../store/assistant";
import { useWebPages } from "../../store/webPages";
import { cn } from "../ui";

export function PanelLaunchers() {
  const active = useApp((s) => s.active);
  const inspectorOpen = useApp((s) => s.inspectorOpen);
  const assistantOpen = useAssistant((s) => s.open);
  const pages = useWebPages((s) => s.pages.length);
  const pagesOpen = useWebPages((s) => s.open);

  return (
    <aside
      aria-label="Acceso panel lateral"
      className="flex w-10 flex-none flex-col items-center gap-2 border-l border-line bg-panel py-3"
    >
      <button
        type="button"
        title="Abrir Asistente IA"
        aria-label="Asistente IA"
        onClick={() => {
          if (inspectorOpen) useApp.getState().toggleInspector();
          useAssistant.getState().setOpen(true);
        }}
        className="grid h-8 w-8 place-items-center rounded-lg text-dim transition-colors hover:bg-hover hover:text-text"
      >
        <Sparkles size={16} />
      </button>

      <button
        type="button"
        title={pagesOpen ? "Ocultar las páginas del navegador" : "Mostrar las páginas del navegador"}
        aria-label="Páginas del navegador"
        aria-pressed={pagesOpen}
        onClick={() => useWebPages.getState().setOpen(!pagesOpen)}
        className={cn(
          "relative grid h-8 w-8 place-items-center rounded-lg transition-colors",
          pagesOpen ? "bg-hover text-text" : "text-dim hover:bg-hover hover:text-text",
        )}
      >
        <Globe size={16} />
        {pages > 0 && (
          <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-accent px-1 font-mono text-[9.5px] font-bold text-white">
            {pages}
          </span>
        )}
      </button>

      {/* Not "a panel": the note's outline, which needs a note. */}
      <button
        type="button"
        title={active ? "Esquema de la nota" : "Esquema de la nota (abre una nota primero)"}
        aria-label="Esquema de la nota"
        disabled={!active}
        onClick={() => {
          if (assistantOpen) useAssistant.getState().setOpen(false);
          useApp.getState().toggleInspector();
        }}
        className={cn(
          "grid h-8 w-8 place-items-center rounded-lg transition-colors",
          active ? "text-dim hover:bg-hover hover:text-text" : "cursor-not-allowed text-faint/50",
        )}
      >
        <ListTree size={16} />
      </button>
    </aside>
  );
}
