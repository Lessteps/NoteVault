// @vitest-environment jsdom
//
// Area A (Interfaces V3), verified by rendering: the top bar is a single
// Obsidian-style tab strip. The redundant search box is gone, every open
// module/note/canvas is a tab, and a pinned tab has no ×.

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { beforeEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MenuHost } from "./ui";
import { TopBar } from "./Shell";
import { useApp } from "../store/app";

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

function mount() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(
      <>
        <TopBar />
        <MenuHost />
      </>,
    );
  });
}

function tabs(): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>('[role="tab"]')];
}

function tab(label: string): HTMLElement {
  const el = tabs().find((t) => t.textContent?.includes(label));
  if (!el) throw new Error(`no tab “${label}” — got ${tabs().map((t) => t.textContent).join(" | ")}`);
  return el;
}

const closeButton = (el: HTMLElement) =>
  [...el.querySelectorAll("button")].find((b) => b.title === "Cerrar pestaña");

beforeEach(() => {
  localStorage.clear();
  useApp.setState({
    vault: "C:/vault-a",
    info: { api_version: 1, vault_name: "vault-a", vault_path: "C:/vault-a", theme: "dark" },
    openTabs: [
      { kind: "module", id: "calendario", tabId: "module:calendario" },
      { kind: "note", path: "Matemáticas/1.1/nota.md", tabId: "note:Matemáticas/1.1/nota.md" },
      { kind: "canvas", path: "Matemáticas/mapa.canvas", tabId: "canvas:Matemáticas/mapa.canvas" },
    ],
    activeTabId: "note:Matemáticas/1.1/nota.md",
    active: "Matemáticas/1.1/nota.md",
    tabs: ["Matemáticas/1.1/nota.md", "Matemáticas/mapa.canvas"],
    pinnedTabIds: new Set<string>(),
    notes: {},
  });
  mount();
});

describe("TopBar", () => {
  it("is one tab strip: every open target is a tab and the search box is gone", () => {
    expect(container.querySelector('[role="tablist"]')).not.toBeNull();
    expect(container.querySelector("input")).toBeNull();

    expect(tabs().map((t) => t.textContent)).toEqual(["Calendario", "nota", "mapa"]);
    expect(tab("nota").getAttribute("aria-selected")).toBe("true");
    expect(tab("Calendario").getAttribute("aria-selected")).toBe("false");
  });

  it("activates a tab on click", () => {
    act(() => tab("Calendario").click());
    expect(useApp.getState().activeTabId).toBe("module:calendario");
    expect(tab("Calendario").getAttribute("aria-selected")).toBe("true");
  });

  it("closes a tab with its ×", () => {
    const btn = closeButton(tab("mapa"))!;
    expect(btn).toBeDefined();
    act(() => btn.click());
    expect(useApp.getState().openTabs.map((t) => t.tabId)).toEqual([
      "module:calendario",
      "note:Matemáticas/1.1/nota.md",
    ]);
    expect(tabs().map((t) => t.textContent)).toEqual(["Calendario", "nota"]);
  });

  it("shows a pin instead of the × on a pinned tab, and pins from the context menu", () => {
    const el = tab("nota");
    act(() => {
      el.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, clientX: 10, clientY: 10 }));
    });
    const pin = [...container.querySelectorAll("button")].find((b) => b.textContent?.includes("Fijar"));
    expect(pin).toBeDefined();
    act(() => pin!.click());

    expect([...useApp.getState().pinnedTabIds]).toEqual(["note:Matemáticas/1.1/nota.md"]);
    expect(tab("nota").querySelector("svg.lucide-pin")).not.toBeNull();
    expect(closeButton(tab("nota"))).toBeUndefined();
    expect(closeButton(tab("mapa"))).toBeDefined();
  });
});
