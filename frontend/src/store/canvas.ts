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
  reload: () => Promise<void>;
  renamed: (from: string, to: string) => void;
}

let timer: ReturnType<typeof setTimeout> | null = null;

/** The file was deleted or moved outside the app: the API answers "No existe: <path>". */
const isGone = (e: unknown): boolean => /No existe/i.test((e as Error)?.message ?? "");

/** Closes the tab of a canvas that no longer exists, once and quietly (instead of one error toast per save or reload). */
function closeGone(path: string): void {
  clearPending(`canvas:${path}`);
  const app = useApp.getState();
  app.pathDeleted(path);
  app.toast("info", "El canvas ya no existe en disco: se cerró su pestaña.");
}

/** When this app last saved the open canvas: the file watcher echoes our own save, and re-reading a big canvas for it re-renders the whole board. */
let wroteAt = 0;
const WRITE_ECHO_MS = 2500;

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
      const closing = get().path;
      await get().save();
      // A save that hit a conflict returns without clearing its pending mark; the canvas is gone
      // now, so nothing is left to save and the "sin guardar" counter must not stay at 1.
      if (closing) clearPending(`canvas:${closing}`);
      set({ path: null, doc: { nodes: [], edges: [] }, past: [], future: [], dirty: false, conflict: false });
    },

    snapshot: () => set((s) => ({ past: [...s.past, s.doc].slice(-HISTORY), future: [] })),

    commit: (doc, record = true) => {
      set((s) => (record
        ? { doc, dirty: true, past: [...s.past, s.doc].slice(-HISTORY), future: [] }
        : { doc, dirty: true }));
      // Editing a canvas makes its preview tab permanent.
      const p = get().path;
      if (p) useApp.getState().keepTab(`canvas:${p}`);
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
        wroteAt = Date.now();
        const r = await api.canvasWrite(path, doc, force ? null : modified);
        if (r.conflict) {
          // Changed on disk by another app: the app's version wins, no banner and no reload.
          await get().save(true);
          return;
        }
        // Edits made while the write was in flight stay dirty.
        set((s) => ({ modified: r.modified, conflict: false, dirty: s.doc !== doc }));
        if (get().doc === doc) clearPending(`canvas:${path}`);
      } catch (e) {
        if (isGone(e)) {
          closeGone(path);
          return;
        }
        useApp.getState().toast("error", (e as Error).message);
      }
    },

    reload: async () => {
      const { path, dirty } = get();
      if (!path) return;
      // Unsaved edits win, as in save(): the disk change (often the echo of our own autosave) is neither reloaded nor announced,
      // because a banner appearing mid-drag shifted the whole board.
      if (dirty) return;
      if (Date.now() - wroteAt < WRITE_ECHO_MS) return;
      try {
        const r = await api.canvasRead(path);
        set({
          path: r.path,
          title: r.title,
          doc: r.doc,
          modified: r.modified,
          dirty: false,
          conflict: false,
        });
      } catch (e) {
        // A file that disappeared closes its tab; any other failure leaves the canvas as it is.
        if (isGone(e)) closeGone(path);
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
