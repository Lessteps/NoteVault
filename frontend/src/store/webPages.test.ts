// @vitest-environment jsdom
//
// CAMBIO 3, the data behind the browser rail: pages open, close, activate and
// survive a restart, and closing them down to zero leaves a usable rail.

import { beforeEach, describe, expect, it } from "vitest";
import { useNavState } from "./navState";
import { activeWebPage, pageLabel, useWebPages } from "./webPages";

beforeEach(() => {
  localStorage.clear();
  useWebPages.setState({ pages: [], activeId: null, open: true, compact: false });
});

describe("web pages", () => {
  it("opens a page, makes it active and remembers it", () => {
    const id = useWebPages.getState().add("https://example.com/a");

    const s = useWebPages.getState();
    expect(s.pages).toHaveLength(1);
    expect(s.activeId).toBe(id);
    expect(activeWebPage(s)!.url).toBe("https://example.com/a");
    expect(JSON.parse(localStorage.getItem("nv.webPages")!).pages).toHaveLength(1);
  });

  it("keeps the title, the address and the icon the browser reports", () => {
    const id = useWebPages.getState().add("https://example.com");
    useWebPages.getState().patch(id, { title: "Example", url: "https://example.com/x", favicon: "data:image/png;base64,AA" });

    expect(useWebPages.getState().pages[0]).toMatchObject({
      title: "Example",
      url: "https://example.com/x",
      favicon: "data:image/png;base64,AA",
    });
  });

  it("activates a page that exists and ignores one that does not", () => {
    const first = useWebPages.getState().add("https://a.test");
    const second = useWebPages.getState().add("https://b.test");

    useWebPages.getState().activate(first);
    expect(useWebPages.getState().activeId).toBe(first);
    useWebPages.getState().activate("no-existe");
    expect(useWebPages.getState().activeId).toBe(first);
    expect(useWebPages.getState().pages).toHaveLength(2);
    expect(useWebPages.getState().pages.some((p) => p.id === second)).toBe(true);
  });

  it("falls back to a neighbour when the active page is closed", () => {
    const first = useWebPages.getState().add("https://a.test");
    const second = useWebPages.getState().add("https://b.test");
    useWebPages.getState().add("https://c.test");

    useWebPages.getState().activate(second);
    useWebPages.getState().close(second);

    expect(useWebPages.getState().pages).toHaveLength(2);
    expect(useWebPages.getState().activeId).not.toBe(second);
    expect(useWebPages.getState().pages.some((p) => p.id === first)).toBe(true);
  });

  it("closing the last page leaves an empty, usable rail", () => {
    const id = useWebPages.getState().add("https://only.test");
    useWebPages.getState().close(id);

    const s = useWebPages.getState();
    expect(s.pages).toEqual([]);
    expect(s.activeId).toBeNull();
    expect(activeWebPage(s)).toBeNull();
    expect(s.open).toBe(true); // the rail is still there, with its "+"
  });

  it("remembers the rail's own state", () => {
    useWebPages.getState().setCompact(true);
    useWebPages.getState().setOpen(false);

    const saved = JSON.parse(localStorage.getItem("nv.webPages")!);
    expect(saved).toMatchObject({ compact: true, open: false });
  });

  it("labels a page by title, else by host, else neutrally", () => {
    expect(pageLabel({ id: "1", url: "https://a.test/x", title: "  Mi página  " })).toBe("Mi página");
    expect(pageLabel({ id: "2", url: "https://sub.a.test/x", title: "" })).toBe("sub.a.test");
    expect(pageLabel({ id: "3", url: "", title: "" })).toBe("Página nueva");
  });
});

describe("persisting a module store's view", () => {
  it("mirrors the field into the nav state and restores it", async () => {
    localStorage.clear();
    useNavState.setState({ values: {} });
    const { createStore } = await import("zustand/vanilla");
    const { persistField } = await import("./navState");

    type S = { view: string; other: number };
    const store = createStore<S>(() => ({ view: "semana", other: 1 }));
    persistField(store, "view", "prueba.view");

    store.setState({ view: "mes" });
    const saved = JSON.parse(localStorage.getItem("nv.navState")!) as Record<string, string>;
    expect(saved["prueba.view"]).toBe("mes");

    // A fresh store (a new session) starts where the user left it.
    const fresh = createStore<S>(() => ({ view: "semana", other: 1 }));
    persistField(fresh, "view", "prueba.view");
    expect(fresh.getState().view).toBe("mes");
    expect(fresh.getState().other).toBe(1);
  });
});
