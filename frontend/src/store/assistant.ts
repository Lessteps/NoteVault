// Asistente: the conversation about the open note.

import { create } from "zustand";
import { api } from "../lib/bridge";
import { copyText } from "../lib/clipboard";
import { bodyOf, useApp } from "./app";

export interface ChatMessage { role: "user" | "assistant" | "system"; content: string }

const OPEN_KEY = "nv.assistant.open";

interface AssistantState {
  open: boolean;
  messages: ChatMessage[];
  busy: boolean;
  settingsOpen: boolean;
  /** A web-chat prompt copied and waiting for the pasted answer. */
  awaitingPaste: boolean;
  setOpen: (open: boolean) => void;
  setSettings: (open: boolean) => void;
  clear: () => void;
  ask: (question: string, selection?: string) => Promise<void>;
  pasteReply: (text: string) => void;
}

function initialOpen(): boolean {
  try {
    return localStorage.getItem(OPEN_KEY) === "1";
  } catch {
    return false;
  }
}

export const useAssistant = create<AssistantState>((set, get) => ({
  open: initialOpen(),
  messages: [],
  busy: false,
  settingsOpen: false,
  awaitingPaste: false,
  setOpen: (open) => {
    set({ open });
    try {
      localStorage.setItem(OPEN_KEY, open ? "1" : "0");
    } catch {
      /* per-viewer convenience only */
    }
  },
  setSettings: (settingsOpen) => set({ settingsOpen }),
  clear: () => set({ messages: [], awaitingPaste: false }),

  ask: async (question, selection = "") => {
    const q = question.trim();
    if (!q || get().busy) return;
    if (!get().open) get().setOpen(true);
    const app = useApp.getState();
    const note = app.active ? app.notes[app.active] : undefined;
    const history = get().messages.filter((m) => m.role !== "system").map(({ role, content }) => ({ role, content }));
    set((s) => ({ messages: [...s.messages, { role: "user", content: q }], busy: true }));
    try {
      const r = await api.aiChat(history, q, note && note.kind === "note" ? note.path : "", selection);
      if (r.bridge) {
        await copyText(r.prompt ?? "");
        if (r.url) await api.openExternal(r.url).catch(() => undefined);
        set((s) => ({
          awaitingPaste: true,
          messages: [...s.messages, { role: "system", content: `Pregunta copiada con el contexto de la nota. Pégala en ${r.label ?? "el chat web"} y luego usa «Pegar respuesta».` }],
        }));
      } else {
        set((s) => ({ messages: [...s.messages, { role: "assistant", content: r.reply ?? "" }] }));
      }
    } catch (e) {
      set((s) => ({ messages: [...s.messages, { role: "system", content: `⚠ ${(e as Error).message}` }] }));
    } finally {
      set({ busy: false });
    }
  },

  pasteReply: (text) => {
    const t = text.trim();
    if (!t) return;
    set((s) => ({ awaitingPaste: false, messages: [...s.messages, { role: "assistant", content: t }] }));
  },
}));

/** The text study actions work on: the selection, or the start of the note. */
export function actionContext(selection: string): string {
  if (selection.trim()) return selection.trim();
  const app = useApp.getState();
  const note = app.active ? app.notes[app.active] : undefined;
  return note ? bodyOf(note.raw).slice(0, 1000) : "";
}
