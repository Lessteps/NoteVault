// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn(async (method: string): Promise<unknown> => {
  if (method === "ex_list") return [];
  if (method === "ex_save") return { ok: true };
  return { ok: true };
});
(window as unknown as { nv: unknown }).nv = { invoke };

import { useExercise } from "../../store/exercise";
import { weekdayKeyOf } from "../../lib/exercise";
import { todayIso } from "../../lib/tasks";
import { Library } from "./Library";

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
  useExercise.setState({
    days: [{ key: "lunes", name: "Lunes", subtitle: "Pecho", glyph: "💪" }],
    list: [],
    stats: null,
    loaded: true,
    error: null,
  });
});

describe("Biblioteca de Ejercicio", () => {
  it("busca en el catálogo y añade a la rutina con músculos mapeados", async () => {
    const { host, cleanup } = mount(<Library />);
    try {
      const input = host.querySelector('input[placeholder*="Buscar"]') as HTMLInputElement;
      expect(input).not.toBeNull();
      await act(async () => {
        input.focus();
        // Simula escritura controlada por React
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
        setter?.call(input, "bench press");
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
        await Promise.resolve();
      });
      expect(host.textContent).toContain("Bench Press");
      const add = [...host.querySelectorAll("button")].find((b) =>
        b.textContent?.includes("Añadir"),
      );
      expect(add).not.toBeUndefined();
      await act(async () => {
        add!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        await Promise.resolve();
      });
      expect(invoke).toHaveBeenCalledWith(
        "ex_save",
        [
          "",
          expect.objectContaining({
            name: "Bench Press",
            muscles: expect.objectContaining({ primary: expect.arrayContaining(["pectoral"]) }),
          }),
        ],
      );
    } finally {
      cleanup();
    }
  });

  it("no ofrece elegir día: añade al día de hoy", async () => {
    const { host, cleanup } = mount(<Library />);
    try {
      // Sin desplegable de días en la Biblioteca.
      expect(host.querySelector("select")).toBeNull();

      const add = [...host.querySelectorAll("button")].find((b) =>
        b.textContent?.includes("Añadir"),
      );
      await act(async () => {
        add!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        await Promise.resolve();
      });

      const save = invoke.mock.calls.find((c) => c[0] === "ex_save");
      expect(save).toBeDefined();
      // El día enviado es el de hoy, no un "lunes" fijo.
      const args = (save as unknown as unknown[])[1] as Array<{ day: string }>;
      expect(args[1]!.day).toBe(weekdayKeyOf(todayIso()));
    } finally {
      cleanup();
    }
  });

  it("muestra las ilustraciones locales sobre fondo oscuro (arte blanco)", async () => {
    const { host, cleanup } = mount(<Library />);
    try {
      const imgs = [...host.querySelectorAll("img")] as HTMLImageElement[];
      expect(imgs.length).toBeGreaterThan(0);
      for (const img of imgs) {
        // Local offline, nunca CDN (CSP img-src 'self').
        expect(img.getAttribute("src")).toContain("workout-guide-assets/");
        expect(img.getAttribute("src")).not.toContain("http");
        // El arte es blanco monocromo: fondo claro lo vuelve invisible.
        expect(img.className).not.toMatch(/bg-white/);
      }
    } finally {
      cleanup();
    }
  });
});
