// App state. One store, plain actions; components read slices of it.

import { create } from "zustand";
import { api } from "../lib/bridge";
import type { AppInfo, Frontmatter, NoteData, RenderingSettings } from "../lib/types";

export type ModuleId =
  | "home" | "calendario" | "habits" | "ejercicio" | "proyectos"
  | "metas" | "finanzas" | "notas" | "tareas" | "web" | "player";

export type ViewMode = "read" | "edit" | "split";
export type ExplorerTab = "files" | "search" | "bookmarks" | "tags" | "graph";

// ── Unified tab model ───────────────────────────────────────────────────────

export type AppTab =
  | { kind: "module"; id: ModuleId; tabId: string }
  | { kind: "note"; path: string; tabId: string }
  | { kind: "canvas"; path: string; tabId: string }
  | { kind: "web"; tabId: string };

/** A tab as callers open it: `openTab` derives the id from the target. */
export type TabSpec =
  | { kind: "module"; id: ModuleId }
  | { kind: "note"; path: string }
  | { kind: "canvas"; path: string }
  | { kind: "web" };


/** Stable id for a module tab (one per module). */
function moduleTabId(id: ModuleId): string { return `module:${id}`; }

const PINNED_KEY = "nv.pinnedTabs";

/** Pinned tabs are remembered **per vault**: the same tab id (`note:1.1 …`)
 *  points at a different file in another vault, so a single global list would
 *  pin unrelated tabs when the vault changes. */
export function pinnedStorageKey(vault: string | null | undefined): string {
  return vault ? `${PINNED_KEY}:${vault}` : PINNED_KEY;
}

/** Pinned tab ids remembered for `vault` (empty set when nothing was pinned). */
export function loadPinnedIds(vault: string | null | undefined): Set<string> {
  try {
    const raw = localStorage.getItem(pinnedStorageKey(vault));
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch { return new Set(); }
}

function savePinned(vault: string | null | undefined, ids: Set<string>) {
  try { localStorage.setItem(pinnedStorageKey(vault), JSON.stringify([...ids])); } catch {}
}

// ── Note / open‑note model ──────────────────────────────────────────────────

export interface OpenNote {
  path: string;
  title: string;
  kind: "note" | "code";
  raw: string;
  frontmatter: Frontmatter;
  /** The YAML text `frontmatter` was parsed from. */
  fmText: string;
  modified: number;
  bookmarked: boolean;
  dirty: boolean;
  saving: boolean;
  conflict: boolean;
  /** "\r\n" or "\n": the editor writes back the file's own line endings. */
  eol: "\r\n" | "\n";
  /** Line to reveal once the note is shown (search hits, backlinks). */
  revealLine?: number;
}

export interface Toast {
  id: number;
  kind: "error" | "info";
  text: string;
}

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

/** The markdown after the YAML block (same split as the Python side). */
export function bodyOf(raw: string): string {
  const m = FRONTMATTER.exec(raw);
  return m ? raw.slice(m[0].length) : raw;
}

function frontmatterText(raw: string): string {
  return FRONTMATTER.exec(raw)?.[1] ?? "";
}

function fromData(d: NoteData, revealLine?: number): OpenNote {
  return {
    path: d.path,
    title: d.title,
    kind: d.kind,
    raw: d.raw,
    frontmatter: d.frontmatter,
    fmText: frontmatterText(d.raw),
    modified: d.modified,
    bookmarked: d.bookmarked,
    dirty: false,
    saving: false,
    conflict: false,
    eol: d.raw.includes("\r\n") ? "\r\n" : "\n",
    revealLine,
  };
}

interface State {
  info: AppInfo | null;
  theme: "dark" | "light";
  /** Identity of the open vault (`vault_path`): pinned tabs are stored per vault. */
  vault: string;
  /** Legacy: the module currently shown — kept for backward compat but driven by active tab. */
  module: ModuleId;
  mode: ViewMode;
  explorerTab: ExplorerTab;
  explorerOpen: boolean;
  inspectorOpen: boolean;

  // ── Unified tab strip ──────────────────────────────────────────────
  openTabs: AppTab[];
  activeTabId: string | null;
  pinnedTabIds: Set<string>;

  // ── Note state (notes open in note/canvas tabs) ────────────────────
  /** Note data keyed by vault-relative path. */
  notes: Record<string, OpenNote>;
  /** Bumped whenever the file tree must be re-read. */
  treeVersion: number;
  /** Bumped when bookmarks change. */
  bookmarkVersion: number;
  switcherOpen: boolean;
  paletteOpen: boolean;
  /** A second note shown to the right of the active one (split view). */
  side: string | null;
  cursor: { line: number; col: number } | null;
  toasts: Toast[];

  init: () => Promise<void>;
  // Module-level launcher: focuses or creates a module tab.
  setModule: (m: ModuleId) => void;
  setMode: (m: ViewMode) => void;
  setExplorerTab: (t: ExplorerTab) => void;
  toggleExplorer: () => void;
  toggleInspector: () => void;
  toggleTheme: () => void;
  setTheme: (theme: "dark" | "light") => void;
  setSwitcher: (open: boolean) => void;
  setPalette: (open: boolean) => void;
  openSide: (path: string | null) => Promise<void>;
  setCursor: (c: { line: number; col: number } | null) => void;

  // ── Tab actions ────────────────────────────────────────────────────
  openTab: (tab: TabSpec) => void;
  closeTab: (tabId: string) => Promise<void>;
  setActiveTab: (tabId: string) => void;
  pinTab: (tabId: string) => void;
  unpinTab: (tabId: string) => void;

  // ── Note actions ───────────────────────────────────────────────────
  openNote: (path: string, opts?: { line?: number }) => Promise<void>;
  /** Close a note tab by note path (legacy alias used by EditorArea). */
  closeNoteTab: (path: string) => Promise<void>;
  setActive: (path: string) => void;
  editRaw: (path: string, raw: string) => void;
  save: (path: string, opts?: { force?: boolean }) => Promise<void>;
  reload: (path: string) => Promise<void>;
  toggleBookmark: (path: string) => Promise<void>;
  pathRenamed: (from: string, to: string) => void;
  pathDeleted: (path: string) => void;
  refreshTree: () => void;
  clearReveal: (path: string) => void;

  toast: (kind: Toast["kind"], text: string) => void;
  dismiss: (id: number) => void;

  // ── Derived from the tab list (refreshed on every update) ──────────
  /** Active note path (from the active note/canvas tab). */
  active: string | null;
  /** Back-compat: note path → tab list. */
  tabs: string[];
}

/** Views that show files outside the note tabs (the canvas) follow these. */
export const pathEvents = {
  opened: new Set<(path: string) => void>(),
  renamed: new Set<(from: string, to: string) => void>(),
  deleted: new Set<(path: string) => void>(),
};

const saveTimers = new Map<string, ReturnType<typeof setTimeout>>();
const AUTOSAVE_MS = 1200;
let toastSeq = 0;

function applyTheme(theme: "dark" | "light") {
  document.documentElement.dataset.theme = theme;
}

export function applyRenderingSettings(r: Partial<RenderingSettings>) {
  if (typeof document === "undefined") return;
  if (r.liteEffects) {
    document.documentElement.dataset.perf = "lite";
  } else {
    delete document.documentElement.dataset.perf;
  }
  if (r.reduceMotion) {
    document.documentElement.dataset.motion = "reduced";
  } else {
    delete document.documentElement.dataset.motion;
  }
}

export const applyRendering = applyRenderingSettings;

// ── Helpers ─────────────────────────────────────────────────────────────────


/** Returns the module id that drives the active view for a given tab. */
function tabModuleId(tab: AppTab): ModuleId {
  if (tab.kind === "module") return tab.id;
  if (tab.kind === "note" || tab.kind === "canvas") return "notas";
  return "web";
}

/** Pick the tab to activate after closing `closedId`. */
function pickNext(tabs: AppTab[], closedId: string, currentId: string | null): string | null {
  if (currentId !== closedId) return currentId;
  const idx = tabs.findIndex((t) => t.tabId === closedId);
  const remaining = tabs.filter((t) => t.tabId !== closedId);
  if (!remaining.length) return null;
  return remaining[Math.min(idx, remaining.length - 1)]!.tabId;
}

/** A state update: a partial state, or a function of the current state. */
type Patch = Partial<State> | ((state: State) => State | Partial<State>);

/** The note/canvas shown by the active tab (null for module/web tabs). */
function activePathOf(s: Pick<State, "openTabs" | "activeTabId">): string | null {
  if (!s.activeTabId) return null;
  const t = s.openTabs.find((x) => x.tabId === s.activeTabId);
  if (!t || (t.kind !== "note" && t.kind !== "canvas")) return null;
  return t.path;
}

/** Back-compat: every open note/canvas path, in tab order. */
function noteTabPaths(s: Pick<State, "openTabs">): string[] {
  return s.openTabs
    .filter((t) => t.kind === "note" || t.kind === "canvas")
    .map((t) => (t as { path: string }).path);
}

export const useApp = create<State>((setState, get) => {
  // `active`, `tabs` and `module` are derived from the tab list. They are real
  // fields and not getters because zustand copies the state on every update
  // (Object.assign), which turns an accessor into a frozen value — a getter would
  // keep reporting whatever it returned during the first update. So every update
  // re-derives them here, which also keeps `module` (the view App renders) from
  // ever disagreeing with the active tab: a note/canvas tab always shows Notes.
  const set = (patch: Patch): void => {
    setState(patch);
    const st = get();
    const tab = st.openTabs.find((t) => t.tabId === st.activeTabId);
    setState({
      active: activePathOf(st),
      tabs: noteTabPaths(st),
      module: tab ? tabModuleId(tab) : st.module,
    });
  };

  return {
  info: null,
  theme: "dark",
  vault: "",
  module: "home",
  mode: "read",
  explorerTab: "files",
  explorerOpen: true,
  inspectorOpen: true,
  openTabs: [],
  activeTabId: null,
  pinnedTabIds: new Set<string>(),
  notes: {},
  treeVersion: 0,
  bookmarkVersion: 0,
  switcherOpen: false,
  paletteOpen: false,
  side: null,
  cursor: null,
  toasts: [],

  // Derived from openTabs / activeTabId by `set` above.
  active: null,
  tabs: [],

  init: async () => {
    try {
      const info = await api.appInfo();
      applyTheme(info.theme);
      if (info.rendering) {
        applyRenderingSettings(info.rendering);
      } else {
        const r = await api.getRendering().catch(() => null);
        if (r) applyRenderingSettings(r);
      }
      const pinned = loadPinnedIds(info.vault_path || info.vault_name);
      set({ info, theme: info.theme, vault: info.vault_path || info.vault_name, pinnedTabIds: pinned });
      // Open the "home" module tab by default if no tabs
      if (get().openTabs.length === 0) {
        get().setModule("home");
      }
    } catch (e) {
      get().toast("error", (e as Error).message);
    }
  },

  // ── Module launcher: focuses or creates a module tab ────────────────
  setModule: (m) => {
    const id = moduleTabId(m);
    const { openTabs } = get();
    const existing = openTabs.find((t) => t.tabId === id);
    if (existing) {
      set({ activeTabId: id, module: m });
      return;
    }
    const tab: AppTab = { kind: "module", id: m, tabId: id };
    set({ openTabs: [...openTabs, tab], activeTabId: id, module: m });
  },

  setMode: (mode) => set({ mode }),
  setExplorerTab: (explorerTab) => set({ explorerTab, explorerOpen: true }),
  toggleExplorer: () => set((s) => ({ explorerOpen: !s.explorerOpen })),
  toggleInspector: () => set((s) => ({ inspectorOpen: !s.inspectorOpen })),
  toggleTheme: () => {
    const theme = get().theme === "dark" ? "light" : "dark";
    applyTheme(theme);
    set({ theme });
    api.setTheme(theme).catch(() => undefined);
  },
  setTheme: (theme) => {
    if (get().theme === theme) return;
    applyTheme(theme);
    set({ theme });
    api.setTheme(theme).catch(() => undefined);
  },
  setSwitcher: (switcherOpen) => set({ switcherOpen, paletteOpen: false }),
  setPalette: (paletteOpen) => set({ paletteOpen, switcherOpen: false }),

  openSide: async (path) => {
    if (!path) {
      set({ side: null });
      return;
    }
    const st = get();
    if (!st.notes[path]) {
      try {
        const data = await api.readNote(path);
        const newTab: AppTab = { kind: "note", path, tabId: `note:${path}` };
        set((s2) => ({
          notes: { ...s2.notes, [path]: fromData(data) },
          openTabs: s2.openTabs.some((t) => t.tabId === newTab.tabId)
            ? s2.openTabs
            : [...s2.openTabs, newTab],
        }));
      } catch (e) {
        get().toast("error", (e as Error).message);
        return;
      }
    }
    const active = get().active;
    set({ side: path, module: "notas" });
    if (!active || active === path) {
      // Activate a different note tab if possible
      const other = get().openTabs.find((t) => (t.kind === "note" || t.kind === "canvas") && t.tabId !== `note:${path}`);
      if (other) set({ activeTabId: other.tabId });
    }
  },

  setCursor: (cursor) => set({ cursor }),

  // ── Generic tab ops ──────────────────────────────────────────────────
  openTab: (tabSpec) => {
    let newTab: AppTab;
    let id: string;
    const kind = tabSpec.kind;
    if (kind === "module") {
      const spec = tabSpec as { kind: "module"; id: ModuleId };
      id = moduleTabId(spec.id);
      newTab = { kind: "module", id: spec.id, tabId: id };
    } else if (kind === "note") {
      const spec = tabSpec as { kind: "note"; path: string };
      id = `note:${spec.path}`;
      newTab = { kind: "note", path: spec.path, tabId: id };
    } else if (kind === "canvas") {
      const spec = tabSpec as { kind: "canvas"; path: string };
      id = `canvas:${spec.path}`;
      newTab = { kind: "canvas", path: spec.path, tabId: id };
    } else {
      id = "web";
      newTab = { kind: "web", tabId: id };
    }
    const { openTabs } = get();
    const exists = openTabs.find((t) => t.tabId === id);
    if (exists) {
      set({ activeTabId: id, module: tabModuleId(exists) });
      return;
    }
    set({ openTabs: [...openTabs, newTab], activeTabId: id, module: tabModuleId(newTab) });
  },

  closeTab: async (tabIdToClose) => {
    const s = get();
    if (s.pinnedTabIds.has(tabIdToClose)) return; // pinned → cannot close
    const tab = s.openTabs.find((t) => t.tabId === tabIdToClose);
    if (!tab) return;
    // Save dirty note before closing
    if (tab.kind === "note" && s.notes[tab.path]?.dirty) {
      await s.save(tab.path);
    }
    const isWeb = tab.kind === "web" || (tab.kind === "module" && tab.id === "web");
    if (isWeb) {
      const remainingWeb = s.openTabs.some(
        (t) => t.tabId !== tabIdToClose && (t.kind === "web" || (t.kind === "module" && t.id === "web")),
      );
      if (!remainingWeb) {
        void api.browserDestroy().catch(() => undefined);
      }
    }
    const nextId = pickNext(s.openTabs, tabIdToClose, s.activeTabId);
    const nextTab = nextId ? get().openTabs.find((t) => t.tabId === nextId) : null;
    set((st) => {
      const newTabs = st.openTabs.filter((t) => t.tabId !== tabIdToClose);
      const newNotes = { ...st.notes };
      if (tab.kind === "note") delete newNotes[tab.path];
      return {
        openTabs: newTabs,
        notes: newNotes,
        activeTabId: nextId,
        module: nextTab ? tabModuleId(nextTab) : st.module,
        side: tab.kind === "note" && st.side === tab.path ? null : st.side,
      };
    });
  },

  setActiveTab: (id) => {
    const tab = get().openTabs.find((t) => t.tabId === id);
    if (!tab) return;
    set({ activeTabId: id, module: tabModuleId(tab) });
  },

  pinTab: (id) => {
    const pinned = new Set(get().pinnedTabIds);
    pinned.add(id);
    savePinned(get().vault, pinned);
    set({ pinnedTabIds: pinned });
  },

  unpinTab: (id) => {
    const pinned = new Set(get().pinnedTabIds);
    pinned.delete(id);
    savePinned(get().vault, pinned);
    set({ pinnedTabIds: pinned });
  },

  // ── Note actions ─────────────────────────────────────────────────────
  openNote: async (path, opts) => {
    pathEvents.opened.forEach((f) => f(path));
    const s = get();
    const noteTabId = `note:${path}`;
    if (s.notes[path]) {
      const existing = s.openTabs.find((t) => t.tabId === noteTabId);
      set((st) => ({
        activeTabId: noteTabId,
        module: "notas",
        side: st.side === path ? st.active : st.side,
        openTabs: existing ? st.openTabs : [...st.openTabs, { kind: "note", path, tabId: noteTabId }],
        notes: opts?.line !== undefined
          ? { ...st.notes, [path]: { ...st.notes[path]!, revealLine: opts.line } }
          : st.notes,
      }));
      return;
    }
    try {
      const data = await api.readNote(path);
      set((st) => ({
        module: "notas",
        notes: { ...st.notes, [path]: fromData(data, opts?.line) },
        openTabs: st.openTabs.some((t) => t.tabId === noteTabId)
          ? st.openTabs
          : [...st.openTabs, { kind: "note", path, tabId: noteTabId }],
        activeTabId: noteTabId,
      }));
    } catch (e) {
      get().toast("error", (e as Error).message);
    }
  },

  /** Close note tab by path (legacy api used by Ctrl-W and old references). */
  closeNoteTab: async (path) => {
    return get().closeTab(`note:${path}`);
  },

  /** Legacy `setActive`: activates a note by path. */
  setActive: (path) => {
    const noteTabId = `note:${path}`;
    const st = get();
    const tab = st.openTabs.find((t) => t.tabId === noteTabId);
    if (tab) {
      set({ activeTabId: noteTabId, module: "notas", side: st.side === path ? st.active : st.side });
    }
  },

  editRaw: (path, raw) => {
    set((st) => {
      const n = st.notes[path];
      if (!n || n.raw === raw) return st;
      return { notes: { ...st.notes, [path]: { ...n, raw, dirty: true } } };
    });
    const prev = saveTimers.get(path);
    if (prev) clearTimeout(prev);
    saveTimers.set(path, setTimeout(() => void get().save(path), AUTOSAVE_MS));
  },

  save: async (path, opts) => {
    const t = saveTimers.get(path);
    if (t) {
      clearTimeout(t);
      saveTimers.delete(path);
    }
    const n = get().notes[path];
    if (!n || (!n.dirty && !opts?.force) || n.saving) return;
    const raw = n.raw;
    set((st) => ({ notes: { ...st.notes, [path]: { ...st.notes[path]!, saving: true } } }));
    try {
      const res = await api.writeNote(path, raw, opts?.force ? null : n.modified);
      set((st) => {
        const cur = st.notes[path];
        if (!cur) return st;
        if (res.conflict) {
          return { notes: { ...st.notes, [path]: { ...cur, saving: false, conflict: true } } };
        }
        return {
          notes: {
            ...st.notes,
            [path]: {
              ...cur,
              saving: false,
              conflict: false,
              modified: res.modified,
              // Still dirty if the user kept typing while we were saving.
              dirty: cur.raw !== raw,
            },
          },
        };
      });
      // The YAML block changed: re-read it (Python parses it) so the
      // metadata card shows what was just saved.
      const savedFm = frontmatterText(raw);
      if (!res.conflict && savedFm !== n.fmText) {
        const fresh = await api.readNote(path).catch(() => null);
        if (fresh) {
          set((st) => {
            const cur = st.notes[path];
            return cur
              ? { notes: { ...st.notes, [path]: { ...cur, frontmatter: fresh.frontmatter, fmText: savedFm } } }
              : st;
          });
        }
      }
    } catch (e) {
      set((st) => {
        const cur = st.notes[path];
        return cur ? { notes: { ...st.notes, [path]: { ...cur, saving: false } } } : st;
      });
      get().toast("error", `No se pudo guardar: ${(e as Error).message}`);
    }
  },

  reload: async (path) => {
    try {
      const data = await api.readNote(path);
      const cur = get().notes[path];
      if (cur?.dirty) {
        set((st) => ({ notes: { ...st.notes, [path]: { ...st.notes[path]!, conflict: true } } }));
        return;
      }
      set((st) => ({ notes: { ...st.notes, [path]: fromData(data) } }));
    } catch (e) {
      get().toast("error", (e as Error).message);
    }
  },

  toggleBookmark: async (path) => {
    try {
      const { bookmarked } = await api.toggleBookmark(path);
      set((st) => {
        const n = st.notes[path];
        return {
          bookmarkVersion: st.bookmarkVersion + 1,
          notes: n ? { ...st.notes, [path]: { ...n, bookmarked } } : st.notes,
        };
      });
    } catch (e) {
      get().toast("error", (e as Error).message);
    }
  },

  /** A file or folder moved: re-key any open tab under it. */
  pathRenamed: (from, to) => {
    pathEvents.renamed.forEach((f) => f(from, to));
    set((st) => {
      const remap = (p: string) =>
        p === from ? to : p.startsWith(from + "/") ? to + p.slice(from.length) : p;
      const notes: Record<string, OpenNote> = {};
      for (const [p, n] of Object.entries(st.notes)) {
        const np = remap(p);
        notes[np] = np === p ? n : { ...n, path: np, title: np.split("/").pop()!.replace(/\.md$/, "") };
      }
      const openTabs = st.openTabs.map((t) => {
        if (t.kind === "note") {
          const np = remap(t.path);
          return np === t.path ? t : { ...t, path: np, tabId: `note:${np}` };
        }
        if (t.kind === "canvas") {
          const np = remap(t.path);
          return np === t.path ? t : { ...t, path: np, tabId: `canvas:${np}` };
        }
        return t;
      });
      // Remap the activeTabId if it pointed to a renamed note/canvas tab
      let activeTabId = st.activeTabId;
      if (activeTabId) {
        const newActive = openTabs.find((t) => {
          const old = st.openTabs.find((o) => o.tabId === activeTabId);
          if (!old) return false;
          if (old.kind === "note" || old.kind === "canvas") return t.kind === old.kind;
          return t.tabId === activeTabId;
        });
        activeTabId = newActive?.tabId ?? activeTabId;
      }
      return {
        notes,
        openTabs,
        activeTabId,
        side: st.side ? remap(st.side) : null,
        treeVersion: st.treeVersion + 1,
      };
    });
  },

  pathDeleted: (path) => {
    pathEvents.deleted.forEach((f) => f(path));
    set((st) => {
      const gone = (p: string) => p === path || p.startsWith(path + "/");
      const openTabs = st.openTabs.filter((t) => {
        if (t.kind === "note" || t.kind === "canvas") return !gone(t.path);
        return true;
      });
      const notes = Object.fromEntries(Object.entries(st.notes).filter(([p]) => !gone(p)));
      const activeTabId = st.activeTabId
        ? openTabs.find((t) => t.tabId === st.activeTabId)
          ? st.activeTabId
          : (openTabs[0]?.tabId ?? null)
        : null;
      const activeTab = activeTabId ? openTabs.find((t) => t.tabId === activeTabId) : null;
      return {
        openTabs,
        notes,
        activeTabId,
        module: activeTab ? tabModuleId(activeTab) : st.module,
        side: st.side && gone(st.side) ? null : st.side,
        treeVersion: st.treeVersion + 1,
      };
    });
  },

  refreshTree: () => set((st) => ({ treeVersion: st.treeVersion + 1 })),

  clearReveal: (path) =>
    set((st) => {
      const n = st.notes[path];
      return n && n.revealLine !== undefined
        ? { notes: { ...st.notes, [path]: { ...n, revealLine: undefined } } }
        : st;
    }),

  toast: (kind, text) => {
    const id = ++toastSeq;
    set((st) => ({ toasts: [...st.toasts, { id, kind, text }] }));
    setTimeout(() => get().dismiss(id), kind === "error" ? 7000 : 3500);
  },
  dismiss: (id) => set((st) => ({ toasts: st.toasts.filter((t) => t.id !== id) })),
  };
});

// Tell Python how many notes (and other pending edits) are unsaved, so
// closing the window can wait for them (run_web.py). Only sent when the
// number changes.
let reportedUnsaved = 0;
const pendingEdits = new Map<string, () => Promise<void>>();

function reportUnsaved() {
  const st = useApp.getState();
  const n = Object.values(st.notes).filter((x) => x.dirty || x.saving).length + pendingEdits.size;
  if (n !== reportedUnsaved) {
    reportedUnsaved = n;
    api.setUnsaved(n).catch(() => undefined);
  }
}
useApp.subscribe(reportUnsaved);

/** A module with a debounced write registers it here until it is flushed. */
export function markPending(key: string, flush: () => Promise<void>) {
  pendingEdits.set(key, flush);
  reportUnsaved();
}

export function clearPending(key: string) {
  if (pendingEdits.delete(key)) reportUnsaved();
}

/** Save everything before the window closes. */
export async function flushAll(): Promise<void> {
  const { notes, save } = useApp.getState();
  const others = [...pendingEdits.values()];
  await Promise.all([
    ...Object.values(notes).filter((n) => n.dirty).map((n) => save(n.path)),
    ...others.map((f) => f().catch(() => undefined)),
  ]);
}
