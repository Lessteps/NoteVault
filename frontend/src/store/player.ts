// The media open in the English player (kept out of the lazy player chunk:
// note links open it from anywhere).

import { create } from "zustand";
import { api } from "../lib/bridge";
import type { PlayerMedia } from "../lib/types";
import { useApp } from "./app";

export const usePlayer = create<{
  media: PlayerMedia | null;
  open: (file: string, seconds?: number) => Promise<void>;
  pick: () => Promise<void>;
  /** Opens a library source (its media with ITS transcript) in the player. */
  openSource: (id: string, seconds?: number) => Promise<void>;
}>((set) => ({
  media: null,
  open: async (file, seconds = 0) => {
    try {
      const m = await api.enPlayerOpen(file, seconds);
      set({ media: m });
      useApp.getState().setModule("player");
    } catch (e) {
      useApp.getState().toast("error", (e as Error).message);
    }
  },
  openSource: async (id, seconds = 0) => {
    try {
      const m = await api.enSourceOpen(id, seconds);
      set({ media: m });
      useApp.getState().setModule("player");
    } catch (e) {
      useApp.getState().toast("error", (e as Error).message);
    }
  },
  pick: async () => {
    try {
      const m = await api.enPlayerPick();
      if (m.ok) set({ media: m });
    } catch (e) {
      useApp.getState().toast("error", (e as Error).message);
    }
  },
}));
