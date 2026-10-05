// Mentor: estado compartido entre sus paneles (Metas muestra el borrador que se conversa en el Chat).
//
// Los paneles son de SOLO previsualización; lo único que escribe es `createGoal`, que llama a
// `mentor_goal_create` (código determinista). El índice de la vault puede estar frío: la API responde
// `loading` y aquí se reintenta, igual que el resto de pestañas.

import { create } from "zustand";
import { api } from "../lib/bridge";
import type { MentorChatMeta, MentorChatState, MentorChatTurn, MentorGoalCreated, MentorPanels } from "../lib/types";
import { useApp } from "./app";
import { useAssistant } from "./assistant";

const COLD_RETRY_MS = 1500;
const COLD_RETRY_MAX = 40;

export type PanelsData = Extract<MentorPanels, { loading: false }>;

interface MentorState {
  panels: PanelsData | null;
  warming: boolean;
  panelsError: string;
  turns: MentorChatTurn[];
  pending: string | null;
  /** conversación activa del Mentor y su título */
  chatId: string | null;
  chatTitle: string;
  /** el historial del Mentor (aparte del del asistente) */
  chats: MentorChatMeta[];
  historyOpen: boolean;
  /** sube cada vez que algo pide el foco del campo de mensaje del Mentor */
  focusSeq: number;
  chatLoaded: boolean;
  sending: boolean;
  /** aviso del último turno que no produjo respuesta (sin IA, error de la IA, ...) */
  notice: { kind: "no_ai" | "error"; text: string } | null;
  creating: boolean;
  /** meta recién creada, para resaltarla en Metas */
  createdGoalId: string | null;

  loadPanels: () => Promise<void>;
  loadChat: () => Promise<void>;
  send: (message: string) => Promise<void>;
  discard: () => Promise<void>;
  createGoal: () => Promise<MentorGoalCreated | null>;
  newConversation: () => Promise<void>;
  setHistory: (open: boolean) => void;
  loadChats: () => Promise<void>;
  openChat: (id: string) => Promise<void>;
  renameChat: (id: string, title: string) => Promise<void>;
  deleteChat: (id: string) => Promise<void>;
  /** "Nueva meta con el Mentor": abre el asistente en el contexto del Mentor, con una conversación en limpio. */
  startGoalChat: () => Promise<void>;
}

/** Igual que el título automático del servidor: el primer mensaje en una línea. */
function titleOf(turns: readonly MentorChatTurn[]): string {
  const first = turns.find((t) => t.role === "user");
  const line = (first?.content ?? "").replace(/\s+/g, " ").trim();
  if (!line) return "Nueva conversación";
  return line.length > 60 ? `${line.slice(0, 59).trim()}…` : line;
}

const chatPatch = (s: MentorChatState) => ({
  turns: s.turns,
  pending: s.pending,
  chatId: s.id ?? null,
  chatTitle: s.title || titleOf(s.turns),
});

const sleep = (ms: number) => new Promise((ok) => setTimeout(ok, ms));
const fail = (e: unknown) => useApp.getState().toast("error", (e as Error).message);

export const useMentor = create<MentorState>((set, get) => ({
  panels: null,
  warming: false,
  panelsError: "",
  turns: [],
  pending: null,
  chatId: null,
  chatTitle: "Nueva conversación",
  chats: [],
  historyOpen: false,
  focusSeq: 0,
  chatLoaded: false,
  sending: false,
  notice: null,
  creating: false,
  createdGoalId: null,

  loadPanels: async () => {
    set({ panelsError: "" });
    try {
      for (let i = 0; i < COLD_RETRY_MAX; i++) {
        const r = await api.mentorPanels();
        if (!r.loading) {
          set({ panels: r, warming: false });
          return;
        }
        set({ warming: true });
        await sleep(COLD_RETRY_MS);
      }
      throw new Error("El índice de la vault tarda demasiado en estar listo. Inténtalo de nuevo en un momento.");
    } catch (e) {
      set({ warming: false, panelsError: (e as Error).message });
    }
  },

  loadChat: async () => {
    try {
      const s = await api.mentorChatLoad();
      set({ ...chatPatch(s), chatLoaded: true });
    } catch (e) {
      set({ chatLoaded: true });
      fail(e);
    }
  },

  send: async (message) => {
    const text = message.trim();
    if (!text || get().sending) return;
    // el mensaje se ve al instante; la respuesta del servidor trae la conversación completa
    const optimistic: MentorChatTurn = { id: `tmp${Date.now()}`, role: "user", content: text, at: new Date().toISOString() };
    set((s) => ({ sending: true, notice: null, turns: [...s.turns, optimistic] }));
    try {
      let r = await api.mentorChat(text, get().chatId ?? undefined);
      for (let i = 0; r.loading && i < COLD_RETRY_MAX; i++) {
        await sleep(COLD_RETRY_MS);
        r = await api.mentorChat(text, get().chatId ?? undefined);
      }
      if (r.loading) throw new Error("El índice de la vault tarda demasiado en estar listo. Inténtalo de nuevo en un momento.");
      set({
        turns: r.turns,
        pending: r.pending,
        chatTitle: get().chatTitle && get().chatTitle !== "Nueva conversación" ? get().chatTitle : titleOf(r.turns),
        notice: r.kind === "no_ai" || r.kind === "error" ? { kind: r.kind, text: r.text } : null,
      });
    } catch (e) {
      set((s) => ({ turns: s.turns.filter((t) => t.id !== optimistic.id), notice: { kind: "error", text: (e as Error).message } }));
    } finally {
      set({ sending: false });
    }
  },

  discard: async () => {
    const id = get().pending;
    if (!id) return;
    try {
      const s = await api.mentorDraftDiscard(id);
      set({ turns: s.turns, pending: s.pending });
    } catch (e) {
      fail(e);
    }
  },

  createGoal: async () => {
    const { pending, turns } = get();
    const turn = turns.find((t) => t.id === pending);
    if (!turn?.draft || get().creating) return null;
    set({ creating: true });
    try {
      const out = await api.mentorGoalCreate(turn.draft, turn.id);
      set({ createdGoalId: out.goalId });
      useApp.getState().toast("info", `Meta «${out.name}» creada con ${out.items} submetas.`);
      await Promise.all([get().loadChat(), get().loadPanels()]);
      return out;
    } catch (e) {
      fail(e);
      return null;
    } finally {
      set({ creating: false });
    }
  },

  newConversation: async () => {
    try {
      const s = await api.mentorChatNew();
      set({ ...chatPatch(s), notice: null, historyOpen: false, chatLoaded: true });
    } catch (e) {
      fail(e);
    }
  },

  setHistory: (historyOpen) => {
    set({ historyOpen });
    if (historyOpen) void get().loadChats();
  },

  loadChats: async () => {
    try {
      set({ chats: await api.mentorChatsList() });
    } catch {
      set({ chats: [] });
    }
  },

  openChat: async (id) => {
    try {
      const s = await api.mentorChatOpen(id);
      set({ ...chatPatch(s), notice: null, historyOpen: false, chatLoaded: true });
    } catch (e) {
      fail(e);
    }
  },

  renameChat: async (id, title) => {
    try {
      const r = await api.mentorChatRename(id, title);
      set((s) => ({ chatTitle: s.chatId === id ? r.title : s.chatTitle }));
      await get().loadChats();
    } catch (e) {
      fail(e);
    }
  },

  deleteChat: async (id) => {
    try {
      const s = await api.mentorChatDelete(id);
      set({ ...chatPatch(s), notice: null });
      await get().loadChats();
    } catch (e) {
      fail(e);
    }
  },

  startGoalChat: async () => {
    useAssistant.getState().setOpen(true);
    // una meta nueva se conversa en limpio, salvo que la conversación activa aún esté vacía
    if (get().turns.length) await get().newConversation();
    else set({ historyOpen: false });
    set((s) => ({ focusSeq: s.focusSeq + 1 }));
  },
}));
