// @vitest-environment jsdom
//
// El panel de la nota es permanente: ni se cierra ni desaparece. Es la regla que
// sustituye a la antigua tira lateral de iconos.

import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn(async (): Promise<unknown> => ({ ok: true }));
(window as unknown as { nv: unknown }).nv = { invoke };

import { useApp } from "../../store/app";
import { Inspector } from "./Inspector";

function note(path: string, raw: string) {
  return {
    path,
    name: path.split("/").pop() ?? path,
    title: "Nota",
    kind: "note" as const,
    raw,
    frontmatter: { type: "concept", subject: "mathematics" },
    modified: 1,
    bookmarked: false,
    eol: "\n" as const,
  };
}

function mount(node: React.ReactElement) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(node);
  });
  return { host, cleanup: () => act(() => root.unmount()) };
}

beforeEach(() => {
  invoke.mockClear();
  useApp.setState({
    notes: {
      "a.md": note("a.md", "# Título\n\n## Sección\n\ntexto\n") as never,
    },
    active: "a.md",
  });
});

describe("panel de la nota", () => {
  it("enseña el esquema y las propiedades de la nota activa", () => {
    const { host, cleanup } = mount(<Inspector />);
    try {
      const text = host.textContent ?? "";
      expect(text).toContain("Esquema");
      expect(text).toContain("Título");
      expect(text).toContain("Sección");
      expect(text).toContain("Propiedades");
      expect(text).toContain("Editar propiedades");
    } finally {
      cleanup();
    }
  });

  it("no se puede cerrar: no hay botón de cerrar el panel", () => {
    const { host, cleanup } = mount(<Inspector />);
    try {
      const labels = [...host.querySelectorAll("button[aria-label]")].map((b) => b.getAttribute("aria-label"));
      expect(labels).not.toContain("Cerrar panel lateral");
      expect(labels).not.toContain("Cerrar panel derecho");
      // Sigue en pie, con su tirador para cambiarle el ancho.
      expect(host.querySelector('[aria-label="Panel lateral"]')).not.toBeNull();
    } finally {
      cleanup();
    }
  });

  it("sin nota abierta sigue en su sitio, solo que sin esquema", () => {
    useApp.setState({ active: null, notes: {} });
    const { host, cleanup } = mount(<Inspector />);
    try {
      expect(host.textContent).toContain("Abre una nota para ver su esquema");
    } finally {
      cleanup();
    }
  });
});
