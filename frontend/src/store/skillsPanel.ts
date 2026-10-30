// Estado del panel «Skills» de la tira derecha: solo si está abierto (el resto vive en el propio panel).

import { create } from "zustand";

interface SkillsPanelState {
  open: boolean;
  setOpen: (v: boolean) => void;
}

export const useSkillsPanel = create<SkillsPanelState>((set) => ({ open: false, setOpen: (open) => set({ open }) }));
