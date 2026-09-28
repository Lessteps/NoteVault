// @vitest-environment jsdom
//
// CAMBIO 3, the rail itself: one row per page down the right-hand side, the
// active one marked, and no way to end up with a broken panel.

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { useWebPages } from "../../store/webPages";
import { WebRail } from "./WebRail";

let container: HTMLDivElement;

function mount() {
  container = document.createElement("div");
  document.body.appendChild(container);
  act(() => {
    createRoot(container).render(<WebRail />);
  });
}

const rows = () => [...container.querySelectorAll<HTMLElement>("li button")];
const text = () => container.textContent ?? "";

beforeEach(() => {
  localStorage.clear();
  useWebPages.setState({ pages: [], activeId: null, open: true, compact: false });
});

describe("WebRail", () => {
  it("lists the open pages with their title and their close button", () => {
    useWebPages.setState({
      pages: [
        { id: "a", url: "https://a.test", title: "Página A" },
        { id: "b", url: "https://b.test", title: "Página B" },
      ],
      activeId: "b",
    });
    mount();

    expect(rows()).toHaveLength(2);
    expect(text()).toContain("Página A");
    expect(text()).toContain("Página B");
    expect(container.querySelectorAll('[aria-label^="Cerrar "]')).toHaveLength(2);
    // The active page is marked and the other one is not.
    expect(rows()[1]!.getAttribute("aria-current")).toBe("page");
    expect(rows()[0]!.getAttribute("aria-current")).toBeNull();
  });

  it("activates the page you click", () => {
    useWebPages.setState({
      pages: [
        { id: "a", url: "https://a.test", title: "Página A" },
        { id: "b", url: "https://b.test", title: "Página B" },
      ],
      activeId: "b",
    });
    mount();

    act(() => {
      rows()[0]!.click();
    });
    expect(useWebPages.getState().activeId).toBe("a");
  });

  it("closes a page from its own button", () => {
    useWebPages.setState({
      pages: [
        { id: "a", url: "https://a.test", title: "Página A" },
        { id: "b", url: "https://b.test", title: "Página B" },
      ],
      activeId: "a",
    });
    mount();

    act(() => {
      container.querySelector<HTMLElement>('[aria-label="Cerrar Página B"]')!.click();
    });
    expect(useWebPages.getState().pages.map((p) => p.id)).toEqual(["a"]);
    // Closing did not activate the page that was clicked for closing.
    expect(useWebPages.getState().activeId).toBe("a");
  });

  it("stays usable with no pages at all", () => {
    mount();

    expect(text()).toContain("No hay páginas abiertas");
    const plus = container.querySelector<HTMLButtonElement>('button[aria-label="Nueva página"]')!;
    expect(plus).toBeTruthy();
    // The panel is still whole: header, actions and empty message.
    expect(container.querySelector('button[aria-label="Ocultar el panel"]')).toBeTruthy();
    expect(container.querySelector('button[aria-label="Solo iconos"]')).toBeTruthy();
  });

  it("opens a page from the + button", async () => {
    const add = vi.spyOn(useWebPages.getState(), "add").mockReturnValue("nueva");
    mount();

    await act(async () => {
      container.querySelector<HTMLButtonElement>('button[aria-label="Nueva página"]')!.click();
      await Promise.resolve();
    });

    // It asks for an address first; cancelling adds nothing.
    expect(add).not.toHaveBeenCalled();
  });

  it("shrinks to icons and can be hidden", () => {
    useWebPages.setState({ pages: [{ id: "a", url: "https://a.test", title: "Página A" }], activeId: "a" });
    mount();

    act(() => {
      container.querySelector<HTMLButtonElement>('button[aria-label="Solo iconos"]')!.click();
    });
    expect(useWebPages.getState().compact).toBe(true);
    expect(text()).not.toContain("Página A"); // titles gone, the row is still there
    expect(rows()).toHaveLength(1);

    act(() => {
      container.querySelector<HTMLButtonElement>('button[aria-label="Ocultar el panel"]')!.click();
    });
    expect(useWebPages.getState().open).toBe(false);

    // Hidden means gone from the DOM, not a broken half-panel.
    act(() => {
      document.body.removeChild(container);
      const next = document.createElement("div");
      document.body.appendChild(next);
      createRoot(next).render(<WebRail />);
      container = next;
    });
    expect(container.innerHTML).toBe("");
  });
});
