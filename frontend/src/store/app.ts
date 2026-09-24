// App state. One store, plain actions; components read slices of it.

import { create } from "zustand";
import { api } from "../lib/bridge";
import type { AppInfo, Frontmatter, NoteData } from "../lib/types";

export type ModuleId =
  | "home" | "calendario" | "habits" | "ejercicio" | "proyectos"
  | "metas" | "finanzas" | "notas" | "tareas";

export type ViewMode = "read" | "edit" | "split";
export type ExplorerTab = "files" | "search" | "bookmarks";

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
  module: ModuleId;
  mode: ViewMode;
  explorerTab: ExplorerTab;
  explorerOpen: boolean;
  inspectorOpen: boolean;
  tabs: string[];
  active: string | null;
  notes: Record<string, OpenNote>;
  /** Bumped whenever the file tree must be re-read. */
  treeVersion: number;
  /** Bumped when bookmarks change. */
  bookmarkVersion: number;
  switcherOpen: boolean;
  cursor: { line: number; col: number } | null;
  toasts: Toast[];

  init: () => Promise<void>;
  setModule: (m: ModuleId) => void;
  setMode: (m: ViewMode) => void;
  setExplorerTab: (t: ExplorerTab) => void;
  toggleExplorer: () => void;
  toggleInspector: () => void;
  toggleTheme: () => void;
  setSwitcher: (open: boolean) => void;
  setCursor: (c: { line: number; col: number } | null) => void;

  openNote: (path: string, opts?: { line?: number }) => Promise<void>;
  closeTab: (path: string) => Promise<void>;
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
}

const saveTimers = new Map<string, ReturnType<typeof setTimeout>>();
const AUTOSAVE_MS = 1200;
let toastSeq = 0;

function applyTheme(theme: "dark" | "light") {
  document.documentElement.dataset.theme = theme;
}

export const useApp = create<State>((set, get) => ({
  info: null,
  theme: "dark",
  module: "notas",
  mode: "read",
  explorerTab: "files",
  explorerOpen: true,
  inspectorOpen: true,
  tabs: [],
  active: null,
  notes: {},
  treeVersion: 0,
  bookmarkVersion: 0,
  switcherOpen: false,
  cursor: null,
  toasts: [],

  init: async () => {
    try {
      const info = await api.appInfo();
      applyTheme(info.theme);
      set({ info, theme: info.theme });
    } catch (e) {
      get().toast("error", (e as Error).message);
    }
  },

  setModule: (module) => set({ module }),
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
  setSwitcher: (switcherOpen) => set({ switcherOpen }),
  setCursor: (cursor) => set({ cursor }),

  openNote: async (path, opts) => {
    const s = get();
    if (s.notes[path]) {
      set((st) => ({
        active: path,
        module: "notas",
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
        tabs: st.tabs.includes(path) ? st.tabs : [...st.tabs, path],
        active: path,
      }));
    } catch (e) {
      get().toast("error", (e as Error).message);
    }
  },

  closeTab: async (path) => {
    const note = get().notes[path];
    if (note?.dirty) await get().save(path);
    set((st) => {
      const idx = st.tabs.indexOf(path);
      const tabs = st.tabs.filter((t) => t !== path);
      const notes = { ...st.notes };
      delete notes[path];
      const active = st.active === path
        ? (tabs[Math.min(idx, tabs.length - 1)] ?? null)
        : st.active;
      return { tabs, notes, active };
    });
  },

  setActive: (active) => set({ active }),

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
    set((st) => {
      const remap = (p: string) =>
        p === from ? to : p.startsWith(from + "/") ? to + p.slice(from.length) : p;
      const notes: Record<string, OpenNote> = {};
      for (const [p, n] of Object.entries(st.notes)) {
        const np = remap(p);
        notes[np] = np === p ? n : { ...n, path: np, title: np.split("/").pop()!.replace(/\.md$/, "") };
      }
      return {
        notes,
        tabs: st.tabs.map(remap),
        active: st.active ? remap(st.active) : null,
        treeVersion: st.treeVersion + 1,
      };
    });
  },

  pathDeleted: (path) => {
    set((st) => {
      const gone = (p: string) => p === path || p.startsWith(path + "/");
      const tabs = st.tabs.filter((t) => !gone(t));
      const notes = Object.fromEntries(Object.entries(st.notes).filter(([p]) => !gone(p)));
      return {
        tabs,
        notes,
        active: st.active && gone(st.active) ? (tabs[0] ?? null) : st.active,
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
}));

// Tell Python how many notes are unsaved, so closing the window can wait
// for them (run_web.py). Only sent when the number changes.
let reportedUnsaved = 0;
useApp.subscribe((st) => {
  const n = Object.values(st.notes).filter((x) => x.dirty || x.saving).length;
  if (n !== reportedUnsaved) {
    reportedUnsaved = n;
    api.setUnsaved(n).catch(() => undefined);
  }
});

/** Save everything before the window closes. */
export async function flushAll(): Promise<void> {
  const { notes, save } = useApp.getState();
  await Promise.all(Object.values(notes).filter((n) => n.dirty).map((n) => save(n.path)));
}
