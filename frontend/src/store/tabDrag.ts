// La pestaña que se está arrastrando, para que el resto de la interfaz pueda
// enseñar dónde va a caer (y activar el modo dividido al soltarla).

import { create } from "zustand";

interface TabDragState {
  draggingTabId: string | null;
  drag: (tabId: string | null) => void;
}

export const useTabDrag = create<TabDragState>((set) => ({
  draggingTabId: null,
  drag: (draggingTabId) => set({ draggingTabId }),
}));
