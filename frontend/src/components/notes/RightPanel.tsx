// El panel derecho, uno solo para toda la app.
//
// No es una columna aparte ni algo exclusivo de Notas: es la misma columna en
// cualquier funcionalidad (Ejercicio, Finanzas, el navegador…), y siempre tiene
// una cara. Sus tres caras —el asistente, las páginas del navegador y el esquema
// de la nota— las abre la tira de lanzadores, que es lo que se ve cuando no hay
// ninguna abierta.
//
// Única excepción: el lienzo dentro de Notas ocupa la pantalla entera.

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

  if (assistantOpen) return <AssistantPanel />;
  if (pagesOpen) return <WebRail />;
  if (reviewOpen && module === "notas") return <ReviewPanel />;
  // El esquema muscular solo tiene sentido dentro de Ejercicio.
  if (muscleOpen && module === "ejercicio") return <MuscleSchemaPanel />;
  if (inspectorOpen && active) return <Inspector />;
  return <PanelLaunchers module={module} />;
}
