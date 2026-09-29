// @vitest-environment jsdom
// El panel derecho es uno solo y está en todas partes.
//
// Esta es la regla que pidió el usuario: la tira de lanzadores (y la cara que
// abra) no pertenece a Notas, así que se ve igual en cualquier funcionalidad —
// por ejemplo en Ejercicio. La única excepción es el lienzo de Notas, que se
// queda con todo el ancho.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { RightPanel } from "./RightPanel";
import { useApp } from "../../store/app";
import { useAssistant } from "../../store/assistant";
import { useWebPages } from "../../store/webPages";

let container: HTMLDivElement;
let root: Root;

function mount(module: string, canvas = false) {
  act(() => {
    root.render(<RightPanel module={module} canvas={canvas} />);
  });
}

const labels = () =>
  [...container.querySelectorAll("aside")].map((a) => a.getAttribute("aria-label"));

beforeEach(() => {
  useApp.setState({ inspectorOpen: true, active: null });
  useAssistant.setState({ open: false });
  useWebPages.setState({ pages: [], activeId: null, open: true });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("RightPanel", () => {
  it("está en Ejercicio igual que en Notas: la tira de lanzadores", () => {
    useWebPages.setState({ open: false });
    mount("exercise");
    expect(labels()).toContain("Acceso panel lateral");
    // Y con sus tres puertas.
    const strip = container.querySelector('aside[aria-label="Acceso panel lateral"]')!;
    expect(strip.querySelectorAll("button")).toHaveLength(3);
  });

  it("el globo trae las páginas también fuera de Notas", () => {
    mount("exercise");
    expect(labels()).toContain("Páginas del navegador");
  });

  it("el asistente y el esquema de la nota ocupan el mismo panel en cualquier módulo", () => {
    useWebPages.setState({ open: false });
    useAssistant.setState({ open: true });
    mount("finance");
    expect(labels()).toContain("Asistente");

    useAssistant.setState({ open: false });
    useApp.setState({ active: "Matemáticas/nota.md" });
    mount("finance");
    expect(labels()).toContain("Panel lateral");
  });

  it("sin nota no hay esquema: queda la tira", () => {
    useWebPages.setState({ open: false });
    useApp.setState({ active: null, inspectorOpen: true });
    mount("exercise");
    expect(labels()).toContain("Acceso panel lateral");
    expect(labels()).not.toContain("Panel lateral");
  });

  it("el lienzo de Notas se queda con todo el ancho", () => {
    useWebPages.setState({ open: false });
    mount("notas", true);
    expect(container.innerHTML).toBe("");
  });

  it("pero un lienzo abierto no se lleva el panel de los demás módulos", () => {
    useWebPages.setState({ open: false });
    mount("exercise", true);
    expect(labels()).toContain("Acceso panel lateral");
  });
});
