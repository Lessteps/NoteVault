// Coach Financiero: store reactivo dedicado al asistente de finanzas.
//
// Mantiene conversaciones, historial, streaming y estado de IA 100% aislados
// del Asistente de Notas (`useAssistant`), del Mentor (`useMentor`) y del Coach de Ejercicio (`useExerciseCoach`).

import { create } from "zustand";
import { api, type AiStreamEvent } from "../lib/bridge";
import type { Conversation, ConversationMeta } from "../lib/types";
import type { FinanceContextData } from "../lib/financeCoachTypes";

export interface FinanceCoachMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  thinking?: string;
  at: number;
  ms?: number;
  stopped?: boolean;
  error?: boolean;
  vote?: 1 | -1;
}

export interface FinanceCoachState {
  open: boolean;
  messages: FinanceCoachMessage[];
  busy: boolean;
  streamingId: string | null;
  conversationId: string | null;
  title: string;
  historyOpen: boolean;
  history: ConversationMeta[];
  historyQuery: string;
  contextData: FinanceContextData | null;
  model: string;
  models: string[];
  providerLabel: string;
  awaitingPaste: boolean;

  setOpen: (open: boolean) => void;
  ask: (question: string) => Promise<void>;
  stop: () => Promise<void>;
  pasteReply: (text: string) => void;
  vote: (id: string, value: 1 | -1) => void;
  loadContext: () => Promise<void>;
  loadModels: (probe?: boolean) => Promise<void>;
  setModel: (model: string) => Promise<void>;

  setHistory: (open: boolean) => void;
  setHistoryQuery: (q: string) => void;
  refreshHistory: () => Promise<void>;
  newConversation: () => void;
  openConversation: (id: string) => Promise<void>;
  renameConversation: (id: string, title: string) => Promise<void>;
  deleteConversation: (id: string) => Promise<void>;
}

let seq = 0;
const uid = (): string => `fm${Date.now().toString(36)}${(seq++).toString(36)}`;

let streamListener: (() => void) | null = null;

function ensureStreamListener(
  set: (fn: (s: FinanceCoachState) => Partial<FinanceCoachState>) => void,
  get: () => FinanceCoachState,
) {
  if (streamListener) return;
  streamListener = api.onAiStream((ev: AiStreamEvent) => {
    const cur = get();
    if (!cur.streamingId || cur.streamingId !== ev.id) return;

    if (ev.type === "delta" && ev.text) {
      set((s) => ({
        messages: s.messages.map((m) =>
          m.id === ev.id ? { ...m, content: m.content + ev.text } : m,
        ),
      }));
    } else if (ev.type === "thinking" && ev.text) {
      set((s) => ({
        messages: s.messages.map((m) =>
          m.id === ev.id ? { ...m, thinking: (m.thinking || "") + ev.text } : m,
        ),
      }));
    }
  });
}

async function persist(
  set: (fn: (s: FinanceCoachState) => Partial<FinanceCoachState>) => void,
  get: () => FinanceCoachState,
): Promise<void> {
  const { conversationId, messages, model, title } = get();
  if (!messages.length) return;
  try {
    const saved = await api.finCoachConversationSave(conversationId, messages, model, title);
    if (!conversationId && saved?.id) {
      set(() => ({ conversationId: saved.id, title: saved.title || title }));
    }
  } catch {
    /* persistencia en background */
  }
}

async function nameConversation(
  set: (fn: (s: FinanceCoachState) => Partial<FinanceCoachState>) => void,
  get: () => FinanceCoachState,
  question: string,
): Promise<void> {
  const id = get().conversationId;
  if (!id) return;
  const msgs = get().messages;
  let lastAns = "";
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i];
    if (m && m.role === "assistant") {
      lastAns = m.content;
      break;
    }
  }
  try {
    const res = await api.finCoachAiTitle(id, question, lastAns);
    if (res?.title) {
      set(() => ({ title: res.title }));
    }
  } catch {
    /* fallback cosmético */
  }
}

export const useFinanceCoach = create<FinanceCoachState>((set, get) => ({
  open: false,
  messages: [],
  busy: false,
  streamingId: null,
  conversationId: null,
  title: "",
  historyOpen: false,
  history: [],
  historyQuery: "",
  contextData: null,
  model: "",
  models: [],
  providerLabel: "",
  awaitingPaste: false,

  setOpen: (open) => set({ open }),

  loadContext: async () => {
    try {
      const data = await api.finCoachContext();
      set({ contextData: data });
    } catch {
      /* best effort */
    }
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
      /* best effort */
    }
  },

  setModel: async (model) => {
    set({ model });
    try {
      await api.aiSettingsSave({ model });
    } catch {
      /* best effort */
    }
  },

  ask: async (question) => {
    const q = question.trim();
    if (!q || get().busy) return;
    ensureStreamListener(set, get);

    const firstTurn = !get().conversationId && get().messages.length === 0;
    const history = get()
      .messages.filter((m) => m.role !== "system" && !m.error && m.content.trim())
      .map(({ role, content }) => ({ role, content }));

    const userMsg: FinanceCoachMessage = {
      id: uid(),
      role: "user",
      content: q,
      at: Date.now(),
    };

    const answerId = uid();
    const answerMsg: FinanceCoachMessage = {
      id: answerId,
      role: "assistant",
      content: "",
      at: Date.now(),
    };

    set((s) => ({
      busy: true,
      streamingId: answerId,
      messages: [...s.messages, userMsg, answerMsg],
    }));

    const started = Date.now();

    try {
      const r = await api.finCoachChatStream(answerId, history, q);
      if (r?.bridge) {
        set((s) => ({
          awaitingPaste: true,
          messages: s.messages
            .filter((m) => m.id !== answerId)
            .concat({
              id: uid(),
              role: "system",
              content: `Consulta preparada para el puente (${r.label || "Navegador"}). Pegá la respuesta de vuelta cuando la tengas.`,
              at: Date.now(),
            }),
        }));
      } else {
        const reply = r.reply ?? "";
        set((s) => ({
          messages: s.messages.map((m) =>
            m.id === answerId
              ? { ...m, content: m.content || reply, stopped: r.stopped === true, ms: Date.now() - started }
              : m,
          ),
        }));
      }
    } catch (e) {
      set((s) => ({
        messages: s.messages.map((m) =>
          m.id === answerId
            ? { ...m, error: true, content: `Error: ${(e as Error).message}`, ms: Date.now() - started }
            : m,
        ),
      }));
    } finally {
      set({ busy: false, streamingId: null });
      await persist(set, get);
      if (firstTurn && !get().awaitingPaste) {
        await nameConversation(set, get, q);
      }
    }
  },

  stop: async () => {
    const id = get().streamingId;
    if (!id) return;
    await api.finCoachChatCancel(id).catch(() => undefined);
  },

  pasteReply: (text) => {
    const t = text.trim();
    if (!t) return;
    set((s) => ({
      awaitingPaste: false,
      messages: [...s.messages, { id: uid(), role: "assistant", content: t, at: Date.now() }],
    }));
    void persist(set, get);
  },

  vote: (id, value) => {
    set((s) => ({
      messages: s.messages.map((m) => (m.id === id ? { ...m, vote: m.vote === value ? undefined : value } : m)),
    }));
    void persist(set, get);
  },

  setHistory: (historyOpen) => {
    set({ historyOpen });
    if (historyOpen) void get().refreshHistory();
  },

  setHistoryQuery: (historyQuery) => set({ historyQuery }),

  refreshHistory: async () => {
    try {
      const items = await api.finCoachConversations();
      set({ history: items || [] });
    } catch {
      /* best effort */
    }
  },

  newConversation: () => {
    set({
      conversationId: null,
      title: "",
      messages: [],
      awaitingPaste: false,
      historyOpen: false,
    });
  },

  openConversation: async (id) => {
    try {
      const conv: Conversation | null = await api.finCoachConversationGet(id);
      if (!conv) return;
      const msgs: FinanceCoachMessage[] = (conv.messages || []).map((m) => ({
        id: uid(),
        role: m.role,
        content: m.content,
        thinking: m.thinking,
        at: m.at,
        ms: m.ms,
        stopped: m.stopped,
        error: m.error,
        vote: m.vote === 1 || m.vote === -1 ? m.vote : undefined,
      }));
      set({
        conversationId: conv.id,
        title: conv.title,
        messages: msgs,
        historyOpen: false,
        awaitingPaste: false,
      });
    } catch {
      /* best effort */
    }
  },

  renameConversation: async (id, title) => {
    try {
      const res = await api.finCoachConversationRename(id, title);
      set((s) => ({
        title: s.conversationId === id ? res.title : s.title,
        history: s.history.map((h) => (h.id === id ? { ...h, title: res.title } : h)),
      }));
    } catch {
      /* best effort */
    }
  },

  deleteConversation: async (id) => {
    try {
      await api.finCoachConversationDelete(id);
      set((s) => ({
        history: s.history.filter((h) => h.id !== id),
        ...(s.conversationId === id
          ? { conversationId: null, title: "", messages: [] }
          : {}),
      }));
    } catch {
      /* best effort */
    }
  },
}));
