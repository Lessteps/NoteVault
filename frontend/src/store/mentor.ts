// Mentor: estado compartido entre sus paneles (Metas muestra el borrador que se conversa en el Chat).
//
// Los paneles son de SOLO previsualización; lo único que escribe es `createGoal`, que llama a
// `mentor_goal_create` (código determinista). El índice de la vault puede estar frío: la API responde
// `loading` y aquí se reintenta, igual que el resto de pestañas.

import { create } from "zustand";
import { api } from "../lib/bridge";
import type { MentorChatTurn, MentorGoalCreated, MentorPanels } from "../lib/types";
import { useApp } from "./app";

const COLD_RETRY_MS = 1500;
const COLD_RETRY_MAX = 40;

export type PanelsData = Extract<MentorPanels, { loading: false }>;

interface MentorState {
  panels: PanelsData | null;
  warming: boolean;
  panelsError: string;
  turns: MentorChatTurn[];
  pending: string | null;
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
}

const sleep = (ms: number) => new Promise((ok) => setTimeout(ok, ms));
const fail = (e: unknown) => useApp.getState().toast("error", (e as Error).message);

export const useMentor = create<MentorState>((set, get) => ({
  panels: null,
  warming: false,
  panelsError: "",
  turns: [],
  pending: null,
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
      set({ turns: s.turns, pending: s.pending, chatLoaded: true });
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
      let r = await api.mentorChat(text);
      for (let i = 0; r.loading && i < COLD_RETRY_MAX; i++) {
        await sleep(COLD_RETRY_MS);
        r = await api.mentorChat(text);
      }
      if (r.loading) throw new Error("El índice de la vault tarda demasiado en estar listo. Inténtalo de nuevo en un momento.");
      set({
        turns: r.turns,
        pending: r.pending,
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
      const s = await api.mentorChatClear();
      set({ turns: s.turns, pending: s.pending, notice: null });
    } catch (e) {
      fail(e);
    }
  },
}));
