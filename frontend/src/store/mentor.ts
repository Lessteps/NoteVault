// Mentor: estado compartido entre sus paneles (Metas muestra el borrador que se conversa en el Chat).
//
// Los paneles son de SOLO previsualización; lo único que escribe es `createGoal`, que llama a
// `mentor_goal_create` (código determinista). El índice de la vault puede estar frío: la API responde
// `loading` y aquí se reintenta, igual que el resto de pestañas.

import { create } from "zustand";
import { api } from "../lib/bridge";
import type { PlanPreconditions } from "../lib/planTime";
import type { MentorChatMeta, MentorChatState, MentorChatTurn, MentorGoalCreated, MentorPanels, MentorPlanAccepted, MentorPlanGenerateResult, MentorPlanRow, MentorSessionObjective } from "../lib/types";
import { useApp } from "./app";
import { useAssistant } from "./assistant";
import { useNavState } from "./navState";

/** Vista del módulo Mentor de un plan concreto: `plan:<id>` (`plan` = resumen de planes). */
export const planViewId = (id: string): string => `plan:${id}`;

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
  /** la conversación activa se abrió desde "Generar plan del mes": el Mentor responde con un plan_draft */
  planMode: boolean;
  /** texto que el campo de mensaje del Mentor toma al abrirse una conversación de plan */
  composerSeed: string;
  acceptingPlan: boolean;
  /** los planes (para las sub-interfaces del Mentor) */
  plans: MentorPlanRow[];
  plansLoaded: boolean;
  generatingPlan: boolean;
  /** sube cada vez que se acepta un plan: el panel Plan se recarga */
  planVersion: number;
  /** objetivo que "Planear mi día con esto" deja para el panel Hoy */
  pendingObjective: MentorSessionObjective | null;

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
  /** "Generar plan del mes con el Mentor": como la meta nueva, pero el Mentor responde con un plan del mes. */
  startPlanChat: () => Promise<void>;
  acceptPlan: () => Promise<MentorPlanAccepted | null>;
  loadPlans: () => Promise<void>;
  /** "Generar plan" del formulario de precondiciones: deja un borrador pendiente (no escribe nada). */
  generatePlan: (pre: PlanPreconditions) => Promise<Extract<MentorPlanGenerateResult, { loading: false }> | null>;
  renamePlan: (id: string, name: string) => Promise<void>;
  archivePlan: (id: string, archived: boolean) => Promise<void>;
  deletePlan: (id: string) => Promise<boolean>;
  setPendingObjective: (o: MentorSessionObjective | null) => void;
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
  planMode: false,
  composerSeed: "",
  acceptingPlan: false,
  plans: [],
  plansLoaded: false,
  generatingPlan: false,
  planVersion: 0,
  pendingObjective: null,

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
      let r = await (get().planMode ? api.mentorChat(text, get().chatId ?? undefined, "plan") : api.mentorChat(text, get().chatId ?? undefined));
      for (let i = 0; r.loading && i < COLD_RETRY_MAX; i++) {
        await sleep(COLD_RETRY_MS);
        r = await (get().planMode ? api.mentorChat(text, get().chatId ?? undefined, "plan") : api.mentorChat(text, get().chatId ?? undefined));
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
      const isPlan = !!get().turns.find((t) => t.id === id)?.planDraft;
      const s = isPlan ? await api.mentorPlanDraftDiscard(id) : await api.mentorDraftDiscard(id);
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
      set({ ...chatPatch(s), notice: null, historyOpen: false, chatLoaded: true, planMode: false, composerSeed: "" });
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
    set((s) => ({ focusSeq: s.focusSeq + 1, planMode: false, composerSeed: "" }));
  },

  startPlanChat: async () => {
    useAssistant.getState().setOpen(true);
    if (get().turns.length) await get().newConversation();
    else set({ historyOpen: false });
    set((s) => ({ focusSeq: s.focusSeq + 1, planMode: true, composerSeed: "Quiero un plan para este mes: " }));
  },

  acceptPlan: async () => {
    const { pending, turns, chatId } = get();
    const turn = turns.find((t) => t.id === pending);
    if (!turn?.planDraft || get().acceptingPlan) return null;
    set({ acceptingPlan: true });
    try {
      const out = await api.mentorPlanDraftAccept(turn.id, chatId ?? undefined);
      useApp.getState().toast("info", `Plan aceptado: ${out.subplans} subplanes, ${out.topics} temas.`);
      await get().loadChat();
      set((s) => ({ planVersion: s.planVersion + 1 }));
      useNavState.getState().set("mentor.view", planViewId(out.id));
      return out;
    } catch (e) {
      fail(e);
      return null;
    } finally {
      set({ acceptingPlan: false });
    }
  },

  loadPlans: async () => {
    try {
      set({ plans: await api.mentorPlanList(), plansLoaded: true });
    } catch {
      set({ plansLoaded: true });
    }
  },

  generatePlan: async (pre) => {
    if (get().generatingPlan) return null;
    set({ generatingPlan: true });
    try {
      let r = await api.mentorPlanGenerate(pre);
      for (let i = 0; r.loading && i < COLD_RETRY_MAX; i++) {
        await sleep(COLD_RETRY_MS);
        r = await api.mentorPlanGenerate(pre);
      }
      if (r.loading) throw new Error("El índice de la vault tarda demasiado en estar listo. Inténtalo de nuevo en un momento.");
      set({ ...chatPatch({ id: r.chatId, title: "", turns: r.turns, pending: r.pending }), chatLoaded: true, notice: null, planMode: true, composerSeed: "" });
      void get().loadChat();
      return r;
    } catch (e) {
      fail(e);
      return null;
    } finally {
      set({ generatingPlan: false });
    }
  },

  renamePlan: async (id, name) => {
    try {
      await api.mentorPlanRename(id, name);
      set((s) => ({ planVersion: s.planVersion + 1 }));
    } catch (e) {
      fail(e);
    }
  },

  archivePlan: async (id, archived) => {
    try {
      await api.mentorPlanArchive(id, archived);
      set((s) => ({ planVersion: s.planVersion + 1 }));
    } catch (e) {
      fail(e);
    }
  },

  deletePlan: async (id) => {
    try {
      await api.mentorPlanDelete(id);
      set((s) => ({ planVersion: s.planVersion + 1 }));
      useNavState.getState().set("mentor.view", "plan");
      return true;
    } catch (e) {
      fail(e);
      return false;
    }
  },

  setPendingObjective: (pendingObjective) => set({ pendingObjective }),
}));
