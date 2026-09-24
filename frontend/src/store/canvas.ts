import { create } from "zustand";
import { api } from "../lib/bridge";
import type { CanvasDoc } from "../lib/canvas";
import { clearPending, markPending, pathEvents, useApp } from "./app";

const SAVE_MS = 700;
const HISTORY = 100;

interface CanvasState {
  path: string | null;
  title: string;
  doc: CanvasDoc;
  modified: number | null;
  dirty: boolean;
  conflict: boolean;
  past: CanvasDoc[];
  future: CanvasDoc[];

  open: (path: string) => Promise<void>;
  close: () => Promise<void>;
  /** Replace the document; `record` false for the live frames of a drag
   * (call snapshot() once before it starts). */
  commit: (doc: CanvasDoc, record?: boolean) => void;
  snapshot: () => void;
  undo: () => void;
  redo: () => void;
  save: (force?: boolean) => Promise<void>;
  renamed: (from: string, to: string) => void;
}

let timer: ReturnType<typeof setTimeout> | null = null;

export const useCanvas = create<CanvasState>((set, get) => {
  const schedule = () => {
    if (timer) clearTimeout(timer);
    const path = get().path;
    if (path) markPending(`canvas:${path}`, () => get().save());
    timer = setTimeout(() => void get().save(), SAVE_MS);
  };

  return {
    path: null,
    title: "",
    doc: { nodes: [], edges: [] },
    modified: null,
    dirty: false,
    conflict: false,
    past: [],
    future: [],

    open: async (path) => {
      await get().save();
      try {
        const r = await api.canvasRead(path);
        set({
          path: r.path, title: r.title, doc: r.doc, modified: r.modified,
          dirty: false, conflict: false, past: [], future: [],
        });
      } catch (e) {
        useApp.getState().toast("error", (e as Error).message);
      }
    },

    close: async () => {
      await get().save();
      set({ path: null, doc: { nodes: [], edges: [] }, past: [], future: [] });
    },

    snapshot: () => set((s) => ({ past: [...s.past, s.doc].slice(-HISTORY), future: [] })),

    commit: (doc, record = true) => {
      set((s) => (record
        ? { doc, dirty: true, past: [...s.past, s.doc].slice(-HISTORY), future: [] }
        : { doc, dirty: true }));
      schedule();
    },

    undo: () => {
      const { past, doc, future } = get();
      const prev = past[past.length - 1];
      if (!prev) return;
      set({ doc: prev, past: past.slice(0, -1), future: [doc, ...future], dirty: true });
      schedule();
    },

    redo: () => {
      const { past, doc, future } = get();
      const next = future[0];
      if (!next) return;
      set({ doc: next, past: [...past, doc], future: future.slice(1), dirty: true });
      schedule();
    },

    save: async (force = false) => {
      const { path, dirty, doc, modified } = get();
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      if (!path || !dirty) return;
      try {
        const r = await api.canvasWrite(path, doc, force ? null : modified);
        if (r.conflict) {
          set({ conflict: true });
          return;
        }
        // Edits made while the write was in flight stay dirty.
        set((s) => ({ modified: r.modified, conflict: false, dirty: s.doc !== doc }));
        if (get().doc === doc) clearPending(`canvas:${path}`);
      } catch (e) {
        useApp.getState().toast("error", (e as Error).message);
      }
    },

    renamed: (from, to) => {
      const p = get().path;
      if (!p || (p !== from && !p.startsWith(from + "/"))) return;
      const np = p === from ? to : to + p.slice(from.length);
      clearPending(`canvas:${p}`);
      set({ path: np, title: np.split("/").pop()!.replace(/\.canvas$/i, "") });
      if (get().dirty) markPending(`canvas:${np}`, () => get().save());
    },
  };
});

// Opening a note leaves the canvas; renames and deletes follow the file.
pathEvents.opened.add(() => {
  if (useCanvas.getState().path) void useCanvas.getState().close();
});
pathEvents.renamed.add((from, to) => useCanvas.getState().renamed(from, to));
pathEvents.deleted.add((path) => {
  const p = useCanvas.getState().path;
  if (p && (p === path || p.startsWith(path + "/"))) {
    clearPending(`canvas:${p}`);
    useCanvas.setState({ path: null, dirty: false, doc: { nodes: [], edges: [] }, past: [], future: [] });
  }
});
