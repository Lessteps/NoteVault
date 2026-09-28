// Asistente: the conversation about the open note.
//
// The answer streams in token by token (main process → `nv-ai-stream` →
// api.onAiStream), so the panel paints it as it is written and the user can
// stop it. The conversation itself is still in memory only; persistence
// (history, per-conversation files) is the next phase.

import { create } from "zustand";
import { api } from "../lib/bridge";
import { copyText } from "../lib/clipboard";
import { bodyOf, useApp } from "./app";

/** A piece of context attached to a user turn (Fase 3 fills these in). */
export interface ChatContext {
  /** Vault-relative path of the file the fragment came from. */
  path: string;
  start_line?: number;
  end_line?: number;
  /** The exact text, sent as the priority context of the turn. */
  text: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  /** Model reasoning (DeepSeek's reasoning_content), shown collapsed. */
  thinking?: string;
  at: number;
  /** Milliseconds the answer took; the working label reads it. */
  ms?: number;
  streaming?: boolean;
  /** The user stopped it: what is there is the partial answer. */
  stopped?: boolean;
  error?: boolean;
  /** Context chips of a user turn. */
  contexts?: ChatContext[];
  /** Local thumbs; where the vote is stored is a later phase. */
  vote?: 0 | 1 | -1;
}

const OPEN_KEY = "nv.assistant.open";

interface AssistantState {
  open: boolean;
  messages: ChatMessage[];
  busy: boolean;
  /** The assistant message being streamed, if any. */
  streamingId: string | null;
  settingsOpen: boolean;
  /** A web-chat prompt copied and waiting for the pasted answer. */
  awaitingPaste: boolean;
  /** Model shown by the composer's selector. */
  model: string;
  /** Models of the active provider (live list, or the curated one). */
  models: string[];
  providerLabel: string;
  setOpen: (open: boolean) => void;
  setSettings: (open: boolean) => void;
  clear: () => void;
  ask: (question: string, selection?: string) => Promise<void>;
  stop: () => Promise<void>;
  vote: (id: string, value: 1 | -1) => void;
  pasteReply: (text: string) => void;
  /** Re-read provider/model, and ask the provider for its model list. */
  loadModels: (probe?: boolean) => Promise<void>;
  setModel: (model: string) => Promise<void>;
}

let seq = 0;
const uid = (): string => `m${Date.now().toString(36)}${(seq++).toString(36)}`;

function initialOpen(): boolean {
  try {
    return localStorage.getItem(OPEN_KEY) === "1";
  } catch {
    return false;
  }
}

/** The stream listener is registered once, on the first turn. */
let listener: (() => void) | null = null;

export const useAssistant = create<AssistantState>((set, get) => ({
  open: initialOpen(),
  messages: [],
  busy: false,
  streamingId: null,
  settingsOpen: false,
  awaitingPaste: false,
  model: "",
  models: [],
  providerLabel: "",

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
    const noteRel = note && note.kind === "note" ? note.path : "";
    const sel = selection.trim();
    const history = get()
      .messages.filter((m) => m.role !== "system" && !m.error && m.content.trim())
      .map(({ role, content }) => ({ role, content }));

    const userMsg: ChatMessage = {
      id: uid(),
      role: "user",
      content: q,
      at: Date.now(),
      contexts: sel ? [{ path: noteRel, text: sel }] : [],
    };
    const answerId = uid();
    const answer: ChatMessage = {
      id: answerId,
      role: "assistant",
      content: "",
      at: Date.now(),
      streaming: true,
    };
    set((s) => ({ messages: [...s.messages, userMsg, answer], busy: true, streamingId: answerId }));

    if (!listener) listener = api.onAiStream((ev) => applyStreamEvent(set, get, ev));

    const started = Date.now();
    try {
      const r = await api.aiChatStream(answerId, history, q, noteRel, sel);
      if (r.bridge) {
        await copyText(r.prompt ?? "");
        if (r.url) await api.openExternal(r.url).catch(() => undefined);
        // The prompt went to a web chat by hand: there is no answer to stream.
        set((s) => ({
          awaitingPaste: true,
          messages: s.messages
            .filter((m) => m.id !== answerId)
            .concat({
              id: uid(),
              role: "system",
              content:
                `Pregunta copiada con el contexto de la nota. Pégala en ${r.label ?? "el chat web"} ` +
                "y luego usa «Pegar respuesta».",
              at: Date.now(),
            }),
        }));
      } else {
        finishAnswer(set, answerId, r.reply ?? "", r.stopped === true, Date.now() - started);
      }
    } catch (e) {
      finishAnswer(set, answerId, "", false, Date.now() - started, (e as Error).message);
    } finally {
      set({ busy: false, streamingId: null });
    }
  },

  stop: async () => {
    const id = get().streamingId;
    if (!id) return;
    await api.aiChatCancel(id).catch(() => undefined);
  },

  vote: (id, value) =>
    set((s) => ({
      messages: s.messages.map((m) => (m.id === id ? { ...m, vote: m.vote === value ? 0 : value } : m)),
    })),

  pasteReply: (text) => {
    const t = text.trim();
    if (!t) return;
    set((s) => ({ awaitingPaste: false, messages: [...s.messages, { id: uid(), role: "assistant", content: t, at: Date.now() }] }));
  },

  loadModels: async (probe = false) => {
    try {
      const s = await api.aiSettings();
      const label = s.providers.find((p) => p.key === s.config.provider)?.label ?? "";
      set({ model: s.config.model, models: s.models ?? [], providerLabel: label });
      if (probe && !s.config.is_bridge) {
        const live = await api.aiModels().catch(() => [] as string[]);
        if (live.length) {
          set(({ models }) => ({ models: [...new Set([...live, ...models])] }));
        }
      }
    } catch {
      /* the panel still works with what it has */
    }
  },

  setModel: async (model) => {
    set({ model });
    try {
      await api.aiSettingsSave({ model });
    } catch {
      /* the selection stays visible; saving it is best-effort */
    }
  },
}));

type Setter = (partial: Partial<AssistantState> | ((s: AssistantState) => Partial<AssistantState>)) => void;
type Getter = () => AssistantState;

/** A token (or the end of the stream) lands on the message it belongs to. */
function applyStreamEvent(set: Setter, get: Getter, ev: { id: string; type: string; text?: string; message?: string }): void {
  const patch = (fn: (m: ChatMessage) => ChatMessage): void =>
    set((s) => ({ messages: s.messages.map((m) => (m.id === ev.id ? fn(m) : m)) }));
  if (ev.type === "delta" && ev.text) {
    patch((m) => ({ ...m, content: m.content + ev.text }));
  } else if (ev.type === "thinking" && ev.text) {
    patch((m) => ({ ...m, thinking: (m.thinking ?? "") + ev.text }));
  } else if (ev.type === "error" && ev.message) {
    patch((m) => ({ ...m, error: true, streaming: false, content: m.content || `⚠ ${ev.message}` }));
  }
  void get;
}

function finishAnswer(set: Setter, id: string, reply: string, stopped: boolean, ms: number, error?: string): void {
  set((s) => ({
    messages: s.messages.map((m) =>
      m.id === id
        ? error
          ? { ...m, streaming: false, error: true, ms, content: m.content || `⚠ ${error}` }
          : { ...m, streaming: false, stopped, ms, content: m.content || reply }
        : m,
    ),
  }));
}

/** The text study actions work on: the selection, or the start of the note. */
export function actionContext(selection: string): string {
  if (selection.trim()) return selection.trim();
  const app = useApp.getState();
  const note = app.active ? app.notes[app.active] : undefined;
  return note ? bodyOf(note.raw).slice(0, 1000) : "";
}
