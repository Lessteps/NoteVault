// The pages open in the browser rail.
//
// Brave-style: the browser pages are *not* top-bar tabs, they live in the
// right-hand rail, one row each, and the rail only ever picks which one the
// browser surface shows. State is small and worth keeping, so it is persisted.

import { create } from "zustand";
import { useApp } from "./app";

const STORAGE_KEY = "nv.webPages";

export interface WebPage {
  id: string;
  url: string;
  title: string;
  /** the site's icon as a data URL (the renderer's CSP forbids remote images) */
  favicon?: string;
}

interface Persisted {
  pages: WebPage[];
  activeId: string | null;
  open: boolean;
  compact: boolean;
}

const EMPTY: Persisted = { pages: [], activeId: null, open: true, compact: false };

function stored(): Persisted {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<Persisted>) : null;
    if (!parsed || !Array.isArray(parsed.pages)) return EMPTY;
    return {
      pages: parsed.pages.filter((p): p is WebPage => Boolean(p && typeof p.id === "string")),
      activeId: typeof parsed.activeId === "string" ? parsed.activeId : null,
      open: parsed.open !== false,
      compact: Boolean(parsed.compact),
    };
  } catch {
    return EMPTY;
  }
}

function persist(state: Pick<Persisted, "pages" | "activeId" | "open" | "compact">): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Best effort.
  }
}

interface WebPagesState extends Persisted {
  /** Opens a page (and brings the browser surface to the front). Returns its id. */
  add: (url?: string) => string;
  close: (id: string) => void;
  activate: (id: string) => void;
  patch: (id: string, patch: Partial<WebPage>) => void;
  setOpen: (open: boolean) => void;
  setCompact: (compact: boolean) => void;
}

let counter = 0;
const nextId = () => `page-${Date.now().toString(36)}-${(counter++).toString(36)}`;

const snapshot = (s: WebPagesState) => ({ pages: s.pages, activeId: s.activeId, open: s.open, compact: s.compact });

export const useWebPages = create<WebPagesState>((set, get) => ({
  ...(typeof localStorage === "undefined" ? EMPTY : stored()),

  add: (url) => {
    const id = nextId();
    const page: WebPage = { id, url: (url ?? "").trim(), title: "" };
    // The browser surface is the page's home: opening one brings it forward.
    void useApp.getState().openTab({ kind: "module", id: "web" });
    set((s) => {
      const pages = [...s.pages, page];
      persist({ pages, activeId: id, open: s.open, compact: s.compact });
      return { pages, activeId: id, open: true };
    });
    return id;
  },

  close: (id) => {
    set((s) => {
      const index = s.pages.findIndex((p) => p.id === id);
      if (index < 0) return {};
      const pages = s.pages.filter((p) => p.id !== id);
      // Closing the active page falls back to its neighbour; closing the last one
      // leaves the rail empty but usable (never a broken panel).
      const activeId =
        s.activeId === id ? (pages[index] ?? pages[index - 1] ?? null)?.id ?? null : s.activeId;
      persist({ pages, activeId, open: s.open, compact: s.compact });
      return { pages, activeId };
    });
  },

  activate: (id) => {
    if (!get().pages.some((p) => p.id === id)) return;
    void useApp.getState().openTab({ kind: "module", id: "web" });
    set((s) => {
      persist({ pages: s.pages, activeId: id, open: s.open, compact: s.compact });
      return { activeId: id };
    });
  },

  patch: (id, patch) =>
    set((s) => {
      let touched = false;
      const pages = s.pages.map((p) => {
        if (p.id !== id) return p;
        const next = { ...p, ...patch };
        if (next.url === p.url && next.title === p.title && next.favicon === p.favicon) return p;
        touched = true;
        return next;
      });
      if (!touched) return {};
      persist({ pages, activeId: s.activeId, open: s.open, compact: s.compact });
      return { pages };
    }),

  setOpen: (open) =>
    set((s) => {
      persist({ ...snapshot(s), open });
      return { open };
    }),

  setCompact: (compact) =>
    set((s) => {
      persist({ ...snapshot(s), compact });
      return { compact };
    }),
}));

/** The page the browser surface shows, if any. */
export function activeWebPage(state: Pick<WebPagesState, "pages" | "activeId">): WebPage | null {
  return state.pages.find((p) => p.id === state.activeId) ?? null;
}

/** A page's label: its title, else its host, else a neutral placeholder. */
export function pageLabel(page: WebPage): string {
  if (page.title.trim()) return page.title.trim();
  const host = page.url.replace(/^[a-z]+:\/\//i, "").split("/")[0] ?? "";
  return host || "Página nueva";
}
