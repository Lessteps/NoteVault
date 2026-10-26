// Estado del chat para «Generar tema completo»: el diálogo de confirmación pendiente (con el selector de motor) y las tareas para agentes
// externos creadas desde el chat, que se enseñan bajo los mensajes. Vive aquí (no en el componente) para que `lib/chatTopicActions` lo use sin React.

import { create } from "zustand";

export interface ChatTopicAsk {
  title: string;
  message: string;
  label: string;
  resolve: (ok: boolean) => void;
}

interface ChatTopicState {
  asking: ChatTopicAsk | null;
  /** ids de tareas (`useRegenEngine.handoffs`) que se enseñan en el chat */
  handoffIds: string[];
  ask: (title: string, message: string, label: string) => Promise<boolean>;
  answer: (ok: boolean) => void;
  showHandoff: (id: string) => void;
  hideHandoff: (id: string) => void;
}

export const useChatTopic = create<ChatTopicState>((set, get) => ({
  asking: null,
  handoffIds: [],
  ask: (title, message, label) =>
    new Promise<boolean>((resolve) => {
      get().asking?.resolve(false);
      set({ asking: { title, message, label, resolve } });
    }),
  answer: (ok) => {
    const a = get().asking;
    set({ asking: null });
    a?.resolve(ok);
  },
  showHandoff: (id) => set((s) => (s.handoffIds.includes(id) ? s : { handoffIds: [...s.handoffIds, id] })),
  hideHandoff: (id) => set((s) => ({ handoffIds: s.handoffIds.filter((x) => x !== id) })),
}));
