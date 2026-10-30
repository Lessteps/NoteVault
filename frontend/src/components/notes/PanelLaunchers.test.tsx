// @vitest-environment jsdom
//
// La tira de lanzadores del borde derecho. Sus botones son las caras del mismo
// panel: el asistente, las paginas del navegador (dentro del panel, nunca en una
// columna aparte) y el esquema de la nota, que solo tiene sentido con una nota
// abierta. Y una puerta que solo existe en Ejercicio: el esquema muscular.

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { beforeEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { useApp } from "../../store/app";
import { useAssistant } from "../../store/assistant";
import { useWebPages } from "../../store/webPages";
import { PanelLaunchers } from "./PanelLaunchers";

let container: HTMLDivElement;

function mount(module = "notas") {
  container = document.createElement("div");
  document.body.appendChild(container);
  act(() => {
    createRoot(container).render(<PanelLaunchers module={module} />);
  });
}

const byLabel = (label: string) => container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;

beforeEach(() => {
  localStorage.clear();
  useWebPages.setState({ pages: [{ id: "a", url: "https://a.test", title: "A" }], activeId: "a", open: false });
  useApp.setState({ module: "notas", inspectorOpen: false, active: null });
  useAssistant.setState({ open: false });
});

describe("PanelLaunchers", () => {
  it("las tres caras del panel son excluyentes", () => {
    mount();
    // El asistente abierto: el globo lo cierra y trae las páginas al panel.
    act(() => {
      useAssistant.setState({ open: true });
    });
    act(() => {
      byLabel("Páginas del navegador").click();
    });
    expect(useAssistant.getState().open).toBe(false);
    expect(useWebPages.getState().open).toBe(true);

    // El esquema de la nota cierra las páginas.
    act(() => {
      useApp.setState({ active: "Matemáticas/nota.md" });
    });
    act(() => {
      byLabel("Esquema de la nota").click();
    });
    expect(useWebPages.getState().open).toBe(false);
    expect(useApp.getState().inspectorOpen).toBe(true);
  });

  it("shows and hides the pages inside the panel, staying where you are", () => {
    mount();
    expect(useWebPages.getState().open).toBe(false);

    act(() => {
      byLabel("Páginas del navegador").click();
    });
    expect(useWebPages.getState().open).toBe(true);
    // Nunca cambia de funcionalidad: la lista vive dentro del panel.
    expect(useApp.getState().module).toBe("notas");

    act(() => {
      byLabel("Páginas del navegador").click();
    });
    expect(useWebPages.getState().open).toBe(false);
    expect(useApp.getState().module).toBe("notas");
  });

  it("says how many pages the panel holds", () => {
    mount();
    expect(byLabel("Páginas del navegador").textContent).toContain("1");
  });

  it("keeps the outline button for notes that exist", () => {
    mount();
    const outline = byLabel("Esquema de la nota");
    expect(outline.disabled).toBe(true);
    expect(outline.title).toContain("abre una nota primero");

    act(() => {
      useApp.setState({ active: "Matemáticas/1 Aritmética/1.1 Números.md" });
    });
    const enabled = byLabel("Esquema de la nota");
    expect(enabled.disabled).toBe(false);

    act(() => {
      enabled.click();
    });
    expect(useApp.getState().inspectorOpen).toBe(true);
  });

  it("opens the assistant on its own button", () => {
    mount();
    act(() => {
      byLabel("Asistente IA").click();
    });
    expect(useAssistant.getState().open).toBe(true);
  });

  it("el esquema muscular es de Ejercicio, y cierra las otras caras", () => {
    mount("finanzas");
    expect(container.querySelector('button[aria-label="Esquema muscular"]')).toBeNull();

    mount("ejercicio");
    act(() => {
      useAssistant.setState({ open: true });
    });
    act(() => {
      byLabel("Esquema muscular").click();
    });
    expect(useApp.getState().muscleOpen).toBe(true);
    expect(useAssistant.getState().open).toBe(false);

    // Y al revés: otra cara se lleva el panel.
    act(() => {
      byLabel("Asistente IA").click();
    });
    expect(useApp.getState().muscleOpen).toBe(false);
  });
});

describe("PanelLaunchers: Mentor", () => {
  it("muestra 'Mentor' justo debajo de 'Asistente IA' y abre la pestaña completa del Mentor", () => {
    mount();
    const labels = [...container.querySelectorAll("aside button")].map((b) => b.getAttribute("aria-label"));
    expect(labels.indexOf("Mentor")).toBe(labels.indexOf("Asistente IA") + 1);
    // «Skills» va justo debajo del Mentor y antes de las páginas del navegador
    expect(labels.indexOf("Skills")).toBe(labels.indexOf("Mentor") + 1);
    expect(labels.indexOf("Páginas del navegador")).toBe(labels.indexOf("Skills") + 1);

    act(() => {
      byLabel("Mentor").click();
    });
    expect(useApp.getState().module).toBe("mentor");
    // no es una cara del panel: no abre ni cierra el asistente
    expect(useAssistant.getState().open).toBe(false);
  });
});
