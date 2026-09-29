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
import { PanelLaunchers } from "./PanelLaunchers";
import { Inspector } from "./Inspector";
import { AssistantPanel } from "./AssistantPanel";
import { WebRail } from "../web/WebRail";

export function RightPanel({ module, canvas = false }: { module: string; canvas?: boolean }) {
  const assistantOpen = useAssistant((s) => s.open);
  const pagesOpen = useWebPages((s) => s.open);
  const inspectorOpen = useApp((s) => s.inspectorOpen);
  const active = useApp((s) => s.active);

  // El lienzo de Notas se queda con todo el ancho.
  if (module === "notas" && canvas) return null;

  if (assistantOpen) return <AssistantPanel />;
  if (pagesOpen) return <WebRail />;
  if (inspectorOpen && active) return <Inspector />;
  return <PanelLaunchers />;
}
