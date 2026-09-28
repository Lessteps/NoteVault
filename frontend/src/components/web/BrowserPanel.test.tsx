// @vitest-environment jsdom
//
// The native browser view lives outside the DOM, so hiding its pane with CSS is
// not enough: when the pane loses its size (another functionality took the
// screen) the panel must detach it, and attach it again when it comes back.

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { api } from "../../lib/bridge";
import { ModuleVisible } from "../ModuleHost";
import { BrowserPanel } from "./BrowserPanel";

// jsdom has neither observer; the panel only needs to not crash on them.
class StubObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = StubObserver;

let rect = { left: 100, top: 60, width: 800, height: 600 };
Element.prototype.getBoundingClientRect = function () {
  return { ...rect, right: rect.left + rect.width, bottom: rect.top + rect.height, x: rect.left, y: rect.top, toJSON: () => ({}) } as DOMRect;
};

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

function mount(visible = true) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(
      <ModuleVisible.Provider value={visible}>
        <BrowserPanel url="https://example.com" />
      </ModuleVisible.Provider>,
    );
  });
}

/** The host tells the panel when its functionality leaves the screen. */
async function setVisible(next: boolean) {
  await act(async () => {
    root.render(
      <ModuleVisible.Provider value={next}>
        <BrowserPanel url="https://example.com" />
      </ModuleVisible.Provider>,
    );
    await Promise.resolve();
  });
}

/** The panel hears about layout changes on window resize. */
async function relayout() {
  await act(async () => {
    window.dispatchEvent(new Event("resize"));
    await Promise.resolve();
  });
}

beforeEach(() => {
  rect = { left: 100, top: 60, width: 800, height: 600 };
  vi.restoreAllMocks();
  vi.spyOn(api, "browserState").mockResolvedValue({
    url: "https://example.com",
    title: "Example",
    canGoBack: false,
    canGoForward: false,
    isLoading: false,
  });
  vi.spyOn(api, "browserAttach").mockResolvedValue({
    url: "https://example.com",
    title: "Example",
    canGoBack: false,
    canGoForward: false,
    isLoading: false,
  });
  vi.spyOn(api, "browserSetBounds").mockResolvedValue({ ok: true });
  vi.spyOn(api, "browserDetach").mockResolvedValue({ ok: true });
  vi.spyOn(api, "webOverview").mockResolvedValue({} as never);
  vi.spyOn(api, "onBrowserState").mockReturnValue(() => undefined);
});

afterEach(() => {
  // Unmount for real: a leftover panel would keep listening to window resize.
  act(() => {
    root?.unmount();
  });
  container?.remove();
});

describe("BrowserPanel", () => {
  it("attaches the native view to the pane it owns", async () => {
    mount();
    await relayout();

    expect(api.browserAttach).toHaveBeenCalledTimes(1);
    const [bounds, url] = (api.browserAttach as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]!;
    expect(bounds).toMatchObject({ width: 800, height: 600 });
    expect(url).toBe("https://example.com");
    expect(api.browserDetach).not.toHaveBeenCalled();
  });

  it("detaches as soon as its functionality leaves the screen", async () => {
    mount();
    await relayout();
    expect(api.browserAttach).toHaveBeenCalledTimes(1);

    // Notas took the screen: the native view must not stay painted over it.
    await setVisible(false);
    expect(api.browserDetach).toHaveBeenCalledTimes(1);

    // Coming back attaches it again, on the same page.
    await setVisible(true);
    expect(api.browserAttach).toHaveBeenCalledTimes(2);
    const call = (api.browserAttach as unknown as { mock: { calls: unknown[][] } }).mock.calls[1]!;
    expect(call[1]).toBe("https://example.com");
  });

  it("detaches when its pane loses all size, and comes back when it is shown", async () => {
    mount();
    await relayout();
    expect(api.browserAttach).toHaveBeenCalledTimes(1);

    // The functionality was switched away: the pane collapses to nothing.
    rect = { left: 0, top: 0, width: 0, height: 0 };
    await relayout();

    expect(api.browserDetach).toHaveBeenCalledTimes(1);

    // Back on screen: the view is attached again, on the same page.
    rect = { left: 100, top: 60, width: 800, height: 600 };
    await relayout();
    expect(api.browserAttach).toHaveBeenCalledTimes(2);
    expect((api.browserAttach as unknown as { mock: { calls: unknown[][] } }).mock.calls[1]![1]).toBe("https://example.com");
  });
});
