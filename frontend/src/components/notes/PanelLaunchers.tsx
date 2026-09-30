// La tira de lanzadores del borde derecho de Notas: aparece cuando el panel no
// esta mostrando nada y sus tres botones son las tres caras que puede tener.
//
// El globo no es el modulo del navegador: muestra y oculta la lista de paginas
// *dentro* del panel, sin moverte de donde estas.

import { CalendarClock, Globe, Headphones, ListTree, Mic, Map as MapIcon, PenTool, Sparkles } from "lucide-react";
import { useEffect } from "react";
import { toggleFace } from "../../lib/panelFaces";
import { subjectUsesLatex, useActiveSubject } from "../../lib/useActiveSubject";
import { useReviewPanel } from "../study/ReviewPanel";
import { useSourcesPanel } from "../english/SourcesPanel";
import { useRecordingsPanel } from "../english/RecordingsPanel";
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
  const inkOpen = useApp((s) => s.inkDraft !== null);
  const sourcesOpen = useSourcesPanel((s) => s.open);
  const recordingsOpen = useRecordingsPanel((s) => s.open);
  const subject = useActiveSubject();
  const latexTool = subjectUsesLatex(subject);
  // Moving to an English area closes a drawing pad that was left open in a maths one.
  useEffect(() => {
    if (!latexTool && inkOpen) useApp.getState().setInkDraft(null);
  }, [latexTool, inkOpen]);
  // The English tools (library of sources) belong to English spaces only.
  const englishTools = subject.toLowerCase() === "english";
  useEffect(() => {
    if (!englishTools && sourcesOpen) useSourcesPanel.getState().setOpen(false);
    if (!englishTools && recordingsOpen) useRecordingsPanel.getState().setOpen(false);
  }, [englishTools, sourcesOpen, recordingsOpen]);

  const cell = (on: boolean, enabled = true) =>
    cn(
      "relative grid h-8 w-8 place-items-center rounded-lg transition-colors",
      !enabled ? "cursor-not-allowed text-faint/50" : on ? "bg-hover text-text" : "text-dim hover:bg-hover hover:text-text",
    );

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
          onClick={() => toggleFace("muscle")}
          className={cell(muscleOpen)}
        >
          <MapIcon size={16} />
        </button>
      )}

      <button
        type="button"
        title={assistantOpen ? "Cerrar el Asistente IA" : "Abrir Asistente IA"}
        aria-label="Asistente IA"
        aria-pressed={assistantOpen}
        onClick={() => toggleFace("assistant")}
        className={cell(assistantOpen)}
      >
        <Sparkles size={16} />
      </button>

      <button
        type="button"
        title={pagesOpen ? "Ocultar las páginas del navegador" : "Mostrar las páginas del navegador"}
        aria-label="Páginas del navegador"
        aria-pressed={pagesOpen}
        onClick={() => toggleFace("pages")}
        className={cell(pagesOpen)}
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
        aria-pressed={inspectorOpen}
        disabled={!active}
        onClick={() => toggleFace("inspector")}
        className={cell(inspectorOpen, !!active)}
      >
        <ListTree size={16} />
      </button>

      {/* English tools, right under the note outline: the library of podcasts, films and TED talks. */}
      {module === "notas" && englishTools && (
        <button
          type="button"
          title={sourcesOpen ? "Cerrar el reproductor" : "Reproductor: tus podcasts, películas y TED con su transcripción"}
          aria-label="Reproductor"
          aria-pressed={sourcesOpen}
          onClick={() => toggleFace("sources")}
          className={cell(sourcesOpen)}
        >
          <Headphones size={16} />
        </button>
      )}
      {module === "notas" && englishTools && (
        <button
          type="button"
          title={recordingsOpen ? "Cerrar las grabaciones" : "Grabaciones de tu voz: grabar y escuchar a distintas velocidades"}
          aria-label="Grabaciones"
          aria-pressed={recordingsOpen}
          onClick={() => toggleFace("recordings")}
          className={cell(recordingsOpen)}
        >
          <Mic size={16} />
        </button>
      )}

      {/* Repaso (spaced repetition): only inside Notas, where the study areas live. */}
      {module === "notas" && (
        <button
          type="button"
          title="Repaso espaciado"
          aria-label="Repaso"
          aria-pressed={reviewOpen}
          onClick={() => toggleFace("review")}
          className={cell(reviewOpen)}
        >
          <CalendarClock size={16} />
        </button>
      )}

      {/* A drawing pad in a split view; pressing it again closes it. */}
      {module === "notas" && latexTool && (
        <button
          type="button"
          title={inkOpen ? "Cerrar el dibujo LaTeX" : "Dibujar LaTeX (lienzo infinito en vista dividida)"}
          aria-label="Dibujar LaTeX"
          aria-pressed={inkOpen}
          onClick={() => toggleFace("ink")}
          className={cell(inkOpen)}
        >
          <PenTool size={16} />
        </button>
      )}
    </aside>
  );
}
