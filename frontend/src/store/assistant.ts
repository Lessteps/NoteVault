// Asistente: the conversation about the open note.
//
// The answer streams in token by token (main process → `nv-ai-stream` →
// api.onAiStream), so the panel paints it as it is written and the user can
// stop it. Conversations are saved as they happen — one private file per
// conversation in the app's data folder, never in the vault — and the history
// panel reads them back.

import { create } from "zustand";
import { api } from "../lib/bridge";
import { copyText } from "../lib/clipboard";
import type { ConversationMeta } from "../lib/types";
import { vaultMode } from "../lib/assistantModes";
import { bodyOf, useApp } from "./app";

/** A piece of context attached to a user turn (Fase 3 fills these in). */
export interface ChatContext {
  /** Vault-relative path of the file the fragment came from. */
  path: string;
  start_line?: number;
  end_line?: number;
  /** The exact text, sent as the priority context of the turn. */
  text: string;
  /** A whole folder pointed at (path is the folder; text is empty). */
  folder?: boolean;
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
  /** Local thumbs; persisted with the conversation, not sent anywhere. */
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
  /** The vault mode in force ("" = a plain conversation). */
  mode: string;
  /** Vault folders the user pointed the chat at; the model is told about them on every turn. */
  folders: string[];
  toggleFolder: (path: string) => void;
  clearFolders: () => void;

  // ── The conversation being held, and the ones kept ────────────────────
  /** Id of the saved conversation; null until the first turn is stored. */
  conversationId: string | null;
  title: string;
  historyOpen: boolean;
  history: ConversationMeta[];
  historyQuery: string;

  setOpen: (open: boolean) => void;
  setSettings: (open: boolean) => void;
  clear: () => void;
  /** Switch a vault mode on or off; switching on greets the user in the chat. */
  setMode: (mode: string) => void;
  ask: (question: string, selection?: string) => Promise<void>;
  stop: () => Promise<void>;
  vote: (id: string, value: 1 | -1) => void;
  pasteReply: (text: string) => void;
  /** Re-read provider/model, and ask the provider for its model list. */
  loadModels: (probe?: boolean) => Promise<void>;
  setModel: (model: string) => Promise<void>;

  setHistory: (open: boolean) => void;
  setHistoryQuery: (q: string) => void;
  refreshHistory: () => Promise<void>;
  /** Start a fresh conversation; the current one is already in the history. */
  newConversation: () => void;
  openConversation: (id: string) => Promise<void>;
  renameConversation: (id: string, title: string) => Promise<void>;
  deleteConversation: (id: string) => Promise<void>;
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
  mode: "",
  folders: [],
  toggleFolder: (p) => set((s) => ({ folders: s.folders.includes(p) ? s.folders.filter((f) => f !== p) : [...s.folders, p] })),
  clearFolders: () => set({ folders: [] }),
  conversationId: null,
  title: "",
  historyOpen: false,
  history: [],
  historyQuery: "",

  setOpen: (open) => {
    set({ open });
    try {
      localStorage.setItem(OPEN_KEY, open ? "1" : "0");
    } catch {
      /* per-viewer convenience only */
    }
  },
  setSettings: (settingsOpen) => set({ settingsOpen }),
  clear: () => set({ messages: [], awaitingPaste: false, mode: "" }),
  setMode: (mode) => {
    const info = vaultMode(mode);
    set((s) => ({
      mode: info ? info.id : "",
      messages: info
        ? [...s.messages, { id: uid(), role: "system" as const, content: info.opener, at: Date.now() }]
        : s.messages,
    }));
  },

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
      contexts: [
        ...get().folders.map((f) => ({ path: f, text: "", folder: true })),
        ...(sel ? [{ path: noteRel, text: sel }] : []),
      ],
    };
    // The folders travel as real context (see ai_chat_stream), not inside the question.
    const folders = get().folders;
    const asked = q;
    const answerId = uid();
    const answer: ChatMessage = {
      id: answerId,
      role: "assistant",
      content: "",
      at: Date.now(),
      streaming: true,
    };
    const firstTurn = !get().messages.some((m) => m.role === "user");
    set((s) => ({ messages: [...s.messages, userMsg, answer], busy: true, streamingId: answerId }));

    // Store the turn as soon as it is asked, so closing the app mid-answer does
    // not lose the question.
    await persist(set, get);

    if (!listener) listener = api.onAiStream((ev) => applyStreamEvent(set, get, ev));

    const started = Date.now();
    try {
      const r = await api.aiChatStream(answerId, history, asked, noteRel, sel, get().mode, folders);
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
      await persist(set, get);
      // The name is written by the model; failures fall back to the question.
      // A bridge turn has no answer yet, so it keeps the question as its name.
      if (firstTurn && !get().awaitingPaste) await nameConversation(set, get, q);
    }
  },

  stop: async () => {
    const id = get().streamingId;
    if (!id) return;
    await api.aiChatCancel(id).catch(() => undefined);
  },

  vote: (id, value) => {
    set((s) => ({
      messages: s.messages.map((m) => (m.id === id ? { ...m, vote: m.vote === value ? 0 : value } : m)),
    }));
    void persist(set, get);
  },

  pasteReply: (text) => {
    const t = text.trim();
    if (!t) return;
    set((s) => ({ awaitingPaste: false, messages: [...s.messages, { id: uid(), role: "assistant", content: t, at: Date.now() }] }));
    void persist(set, get);
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

  setHistory: (historyOpen) => {
    set({ historyOpen });
    if (historyOpen) void get().refreshHistory();
  },
  setHistoryQuery: (historyQuery) => set({ historyQuery }),

  refreshHistory: async () => {
    try {
      set({ history: await api.conversationList() });
    } catch {
      set({ history: [] });
    }
  },

  newConversation: () => {
    set({ messages: [], awaitingPaste: false, conversationId: null, title: "", historyOpen: false, mode: "" });
  },

  openConversation: async (id) => {
    const conv = await api.conversationGet(id);
    set({
      conversationId: conv.id,
      title: conv.title,
      messages: conv.messages.map((m) => ({ ...m, id: uid(), streaming: false })),
      awaitingPaste: false,
      historyOpen: false,
      mode: "",
      busy: false,
      streamingId: null,
    });
  },

  renameConversation: async (id, title) => {
    const conv = await api.conversationRename(id, title);
    if (get().conversationId === id) set({ title: conv.title });
    await get().refreshHistory();
  },

  deleteConversation: async (id) => {
    await api.conversationDelete(id);
    if (get().conversationId === id) {
      set({ conversationId: null, title: "", messages: [] });
    }
    await get().refreshHistory();
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

/** Write the current messages to disk; returns the stored conversation. */
async function persist(
  set: Setter,
  get: Getter,
  id?: string | null,
): Promise<{ id: string } | null> {
  const state = get();
  if (!state.messages.length) return null;
  try {
    const conv = await api.conversationSave(
      id ?? state.conversationId,
      state.messages.filter((m) => !m.streaming || m.content),
      state.model,
      state.title,
    );
    set({ conversationId: conv.id, title: conv.title });
    return { id: conv.id };
  } catch {
    return null; // a failed save never breaks the conversation on screen
  }
}

/** Ask the model to name the conversation (falls back to the question). */
async function nameConversation(set: Setter, get: Getter, question: string): Promise<void> {
  const id = get().conversationId;
  if (!id) return;
  const answer = [...get().messages].reverse().find((m) => m.role === "assistant")?.content ?? "";
  try {
    const r = await api.aiTitle(id, question, answer);
    if (r.fallback) console.warn("[ai_title] el modelo no dio título:", r.error ?? "respuesta vacía");
    if (r.title) set({ title: r.title });
    await get().refreshHistory();
  } catch (e) {
    console.warn("[ai_title] falló:", (e as Error).message);
  }
}

/** The text study actions work on: the selection, or the start of the note. */
export function actionContext(selection: string): string {
  if (selection.trim()) return selection.trim();
  const app = useApp.getState();
  const note = app.active ? app.notes[app.active] : undefined;
  return note ? bodyOf(note.raw).slice(0, 1000) : "";
}
