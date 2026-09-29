// La tira de lanzadores del borde derecho de Notas: aparece cuando el panel no
// esta mostrando nada y sus tres botones son las tres caras que puede tener.
//
// El globo no es el modulo del navegador: muestra y oculta la lista de paginas
// *dentro* del panel, sin moverte de donde estas.

import { CalendarClock, Globe, ListTree, Map as MapIcon, PenTool, Sparkles } from "lucide-react";
import { openInkPad } from "../practice/inkBridge";
import { useReviewPanel } from "../study/ReviewPanel";
import { useApp } from "../../store/app";
import { useAssistant } from "../../store/assistant";
import { useWebPages } from "../../store/webPages";
import { cn } from "../ui";

export function PanelLaunchers({ module }: { module: string }) {
  const active = useApp((s) => s.active);
  const inspectorOpen = useApp((s) => s.inspectorOpen);
  const muscleOpen = useApp((s) => s.muscleOpen);
  const assistantOpen = useAssistant((s) => s.open);
  const pages = useWebPages((s) => s.pages.length);
  const pagesOpen = useWebPages((s) => s.open);
  const reviewOpen = useReviewPanel((s) => s.open);

  /** Una cara a la vez: la que se abre se lleva el panel. */
  const soloMuscle = () => {
    if (assistantOpen) useAssistant.getState().setOpen(false);
    if (pagesOpen) useWebPages.getState().setOpen(false);
    if (inspectorOpen) useApp.getState().toggleInspector();
    if (reviewOpen) useReviewPanel.getState().setOpen(false);
    useApp.getState().setMuscleOpen(true);
  };
  /** Y el ✕ de cada cara devuelve el hueco a la tira. */
  const cierraMuscle = () => {
    if (muscleOpen) useApp.getState().setMuscleOpen(false);
    if (reviewOpen) useReviewPanel.getState().setOpen(false);
  };

  return (
    <aside
      aria-label="Acceso panel lateral"
      className="flex w-10 flex-none flex-col items-center gap-2 border-l border-line bg-panel py-3"
    >
      {/* El esquema muscular es de Ejercicio: fuera de ahí no pinta nada. */}
      {module === "ejercicio" && (
        <button
          type="button"
          title={muscleOpen ? "Ocultar el esquema muscular" : "Esquema muscular del día"}
          aria-label="Esquema muscular"
          aria-pressed={muscleOpen}
          onClick={() => {
            if (muscleOpen) {
              useApp.getState().setMuscleOpen(false);
              return;
            }
            soloMuscle();
          }}
          className={cn(
            "grid h-8 w-8 place-items-center rounded-lg transition-colors",
            muscleOpen ? "bg-hover text-text" : "text-dim hover:bg-hover hover:text-text",
          )}
        >
          <MapIcon size={16} />
        </button>
      )}

      <button
        type="button"
        title="Abrir Asistente IA"
        aria-label="Asistente IA"
        onClick={() => {
          cierraMuscle();
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
        onClick={() => {
          cierraMuscle();
          if (assistantOpen) useAssistant.getState().setOpen(false);
          if (inspectorOpen) useApp.getState().toggleInspector();
          useWebPages.getState().setOpen(!pagesOpen);
        }}
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
          cierraMuscle();
          if (assistantOpen) useAssistant.getState().setOpen(false);
          if (pagesOpen) useWebPages.getState().setOpen(false);
          useApp.getState().toggleInspector();
        }}
        className={cn(
          "grid h-8 w-8 place-items-center rounded-lg transition-colors",
          active ? "text-dim hover:bg-hover hover:text-text" : "cursor-not-allowed text-faint/50",
        )}
      >
        <ListTree size={16} />
      </button>

      {/* Repaso (spaced repetition): only inside Notas, where the study areas live. */}
      {module === "notas" && (
        <button
          type="button"
          title="Repaso espaciado"
          aria-label="Repaso"
          aria-pressed={reviewOpen}
          onClick={() => {
            if (reviewOpen) {
              useReviewPanel.getState().setOpen(false);
              return;
            }
            cierraMuscle();
            if (assistantOpen) useAssistant.getState().setOpen(false);
            if (pagesOpen) useWebPages.getState().setOpen(false);
            if (inspectorOpen) useApp.getState().toggleInspector();
            useReviewPanel.getState().setOpen(true);
          }}
          className={cn(
            "grid h-8 w-8 place-items-center rounded-lg transition-colors",
            reviewOpen ? "bg-hover text-text" : "text-dim hover:bg-hover hover:text-text",
          )}
        >
          <CalendarClock size={16} />
        </button>
      )}

      {/* A drawing pad in a split view, saved beside the open note. */}
      {module === "notas" && (
        <button
          type="button"
          title="Dibujar LaTeX (lienzo infinito en vista dividida)"
          aria-label="Dibujar LaTeX"
          onClick={() => void openInkPad()}
          className="grid h-8 w-8 place-items-center rounded-lg text-dim transition-colors hover:bg-hover hover:text-text"
        >
          <PenTool size={16} />
        </button>
      )}
    </aside>
  );
}
