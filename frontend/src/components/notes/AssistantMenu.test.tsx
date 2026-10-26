// @vitest-environment jsdom
//
// El menú «Modos del asistente»: las acciones de CONTENIDO (no tocan la ruta del plan) y las ESTRUCTURALES (pueden cambiarla) se
// distinguen de un vistazo, y las de generar se desactivan mientras corre una generación del Mentor.

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
(window as unknown as { nv: unknown }).nv = { invoke: async () => ({}) };

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { api } from "../../lib/bridge";
import { useApp } from "../../store/app";
import { useAssistant } from "../../store/assistant";
import { useMenu } from "../ui";
import { AssistantPanel } from "./AssistantPanel";

let host: HTMLDivElement;
let root: Root;

const plan = { id: "p1", name: "Full stack", status: "activo", archived: false, subplans: [{ id: "s1", area: "Backend", topics: [{ folder: "Programación/1 Fundamentals/1.1 A" }] }] };

async function openMenu(busy: boolean) {
  vi.spyOn(api, "assistantGenerationBusy").mockResolvedValue(busy);
  vi.spyOn(api, "mentorPlanList").mockResolvedValue([{ id: "p1", name: "Full stack", status: "activo", archived: false }] as never);
  vi.spyOn(api, "mentorPlanGet").mockResolvedValue({ loading: false, plan } as never);
  await act(async () => {
    root.render(<AssistantPanel />);
  });
  const button = host.querySelector<HTMLButtonElement>('button[aria-label="Modos del asistente"]')!;
  await act(async () => {
    button.click();
  });
  return useMenu.getState().menu!.items;
}

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  useAssistant.setState({ open: true });
  useApp.setState({ module: "notas", active: "Programación/1 Fundamentals/1.1 A/1.1 A.md" });
  useMenu.getState().set(null);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});

describe("menú de modos del chat", () => {
  it("etiqueta el contenido del tema y lo que cambia la ruta, con aviso del plan afectado", async () => {
    const items = await openMenu(false);
    const by = (label: string) => items.find((i) => i.label === label)!;
    expect(by("Generar tema completo").hint).toBe("Contenido del tema");
    expect(by("Re-evaluar práctica del tema").hint).toBe("Contenido del tema");
    expect(by("Generar canvas").hint).toBe("Contenido del tema");
    expect(by("Ajustar matriz de competencias").hint).toBe("Contenido del tema");
    expect(by("Generar temario").hint).toBe("Cambia la ruta · Afecta al plan «Full stack»");
    expect(by("Nuevo tema en un área").hint).toBe("Cambia la ruta · Afecta al plan «Full stack»");
    expect(by("Crear área nueva").hint).toBe("Cambia la ruta · Afecta al plan «Full stack»");
    expect(by("Generar espacio de estudio").hint).toBe("Cambia la ruta");
    expect(by("Generar tema completo").disabled).toBe(false);
  });

  it("desactiva las acciones de generar con un mensaje claro mientras corre una generación del Mentor", async () => {
    const items = await openMenu(true);
    for (const label of ["Generar tema completo", "Re-evaluar práctica del tema"]) {
      const it = items.find((i) => i.label === label)!;
      expect(it.disabled).toBe(true);
      expect(it.description).toContain("generación del Mentor en curso");
    }
  });
});
