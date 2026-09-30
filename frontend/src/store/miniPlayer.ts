// The micro player: a small floating player (bottom-right) for podcasts and other audio, so listening does not need a
// whole tab. It keeps playing while the learner reads notes or does exercises.

import { create } from "zustand";
import { api } from "../lib/bridge";
import type { EnglishSource, PlayerMedia } from "../lib/types";
import { useApp } from "./app";

export const useMini = create<{
  media: PlayerMedia | null;
  source: EnglishSource | null;
  /** the transcript as plain text when it has no times */
  plain: string;
  expanded: boolean;
  openSource: (id: string, seconds?: number) => Promise<void>;
  setExpanded: (v: boolean) => void;
  close: () => void;
}>((set) => ({
  media: null,
  source: null,
  plain: "",
  expanded: true,
  openSource: async (id, seconds = 0) => {
    try {
      const m = await api.enSourceOpen(id, seconds);
      set({ media: m, source: m.source, plain: m.plain ?? "", expanded: true });
    } catch (e) {
      useApp.getState().toast("error", (e as Error).message);
    }
  },
  setExpanded: (expanded) => set({ expanded }),
  close: () => set({ media: null, source: null, plain: "" }),
}));
