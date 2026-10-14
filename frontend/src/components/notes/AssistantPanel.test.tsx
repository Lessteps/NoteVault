// @vitest-environment jsdom
//
// El Mentor vive en el riel de iconos del lado derecho, no dentro del asistente: el panel del
// asistente ya no trae ningún acceso a él (ni en la cabecera ni en el mensaje de bienvenida).

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
(window as unknown as { nv: unknown }).nv = { invoke: async () => ({}) };

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useAssistant } from "../../store/assistant";
import { useApp } from "../../store/app";
import { AssistantPanel } from "./AssistantPanel";

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  useAssistant.setState({ open: true });
  useApp.setState({ module: "notas" });
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("AssistantPanel", () => {
  it("no contiene accesos al Mentor", async () => {
    await act(async () => {
      root.render(<AssistantPanel />);
    });
    expect(host.textContent).toContain("Pregunta sobre la nota abierta");
    expect(host.textContent).not.toMatch(/Mentor/);
    expect(host.querySelector('[title*="Mentor"]')).toBeNull();
  });

  it("despacha a ExerciseCoachAssistant cuando el módulo activo es 'ejercicio'", async () => {
    useApp.setState({ module: "ejercicio" });
    await act(async () => {
      root.render(<AssistantPanel />);
    });
    expect(host.textContent).toContain("Coach de Entrenamiento");
    expect(host.textContent).not.toContain("Pregunta sobre la nota abierta");
  });

  it("despacha a FinanceCoachAssistant cuando el módulo activo es 'finanzas'", async () => {
    useApp.setState({ module: "finanzas" });
    await act(async () => {
      root.render(<AssistantPanel />);
    });
    expect(host.textContent).toContain("Asesor Financiero");
    expect(host.textContent).not.toContain("Pregunta sobre la nota abierta");
  });
});
