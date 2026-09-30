// El panel derecho, uno solo para toda la app.
//
// La tira de lanzadores está SIEMPRE en el borde derecho; junto a ella (a su izquierda)
// se abre la cara que elijas: el asistente, las páginas del navegador, el esquema de la
// nota, el repaso o el esquema muscular. Solo hay una cara a la vez (ver lib/panelFaces).

import { useApp } from "../../store/app";
import { useAssistant } from "../../store/assistant";
import { useWebPages } from "../../store/webPages";
import { MuscleSchemaPanel } from "../exercise/MuscleSchemaPanel";
import { PanelLaunchers } from "./PanelLaunchers";
import { Inspector } from "./Inspector";
import { AssistantPanel } from "./AssistantPanel";
import { WebRail } from "../web/WebRail";
import { ReviewPanel, useReviewPanel } from "../study/ReviewPanel";

export function RightPanel({ module }: { module: string }) {
  const assistantOpen = useAssistant((s) => s.open);
  const pagesOpen = useWebPages((s) => s.open);
  const reviewOpen = useReviewPanel((s) => s.open);
  const muscleOpen = useApp((s) => s.muscleOpen);
  const inspectorOpen = useApp((s) => s.inspectorOpen);
  const active = useApp((s) => s.active);

  const face = assistantOpen
    ? <AssistantPanel />
    : pagesOpen
      ? <WebRail />
      : reviewOpen && module === "notas"
        ? <ReviewPanel />
        : muscleOpen && module === "ejercicio"
          ? <MuscleSchemaPanel />
          : inspectorOpen && active
            ? <Inspector />
            : null;

  return (
    <div className="flex min-h-0 flex-none">
      {face}
      <PanelLaunchers module={module} />
    </div>
  );
}
