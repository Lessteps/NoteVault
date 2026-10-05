// Metas state: sidebar selection, the board, the open goal and its sub-goal views.

import { create } from "zustand";
import { api } from "../lib/bridge";
import type { Area, GoalCard, GoalDetail, GoalsMeta, GoalsSidebar } from "../lib/types";
import { useApp } from "./app";

export type GoalsView = "tablero" | "hoy";
export type GoalTab = "resumen" | "submetas" | "hoy" | "historial" | "notas";
export type SubView = "tarjetas" | "lista" | "arbol";

interface GoalsState {
  view: GoalsView;
  area: string; // "*" all, "" sin área, or an area id
  filter: string;
  meta: GoalsMeta | null;
  sidebar: GoalsSidebar | null;
  areas: Area[];
  cards: GoalCard[];
  loaded: boolean;
  openId: string | null;
  detail: GoalDetail | null;
  tab: GoalTab;
  subView: SubView;
  itemId: string | null;     // the sub-goal peek (all its properties)
  submetaId: string | null;  // full sub-goal view
  editing: string | null;    // goal dialog ("" = new)
  areaEditing: string | null;
  checklistFor: string | null; // parent id for the "submeta con checklist" dialog ("" = root)
  version: number;

  setView: (v: GoalsView) => void;
  setArea: (a: string) => void;
  setFilter: (f: string) => void;
  loadAll: () => Promise<void>;
  open: (gid: string | null) => Promise<void>;
  reload: () => Promise<void>;
  setTab: (t: GoalTab) => void;
  setSubView: (v: SubView) => void;
  openItem: (id: string | null) => void;
  openSubmeta: (id: string | null) => void;
  setEditing: (id: string | null) => void;
  setAreaEditing: (id: string | null) => void;
  setChecklistFor: (id: string | null) => void;
  refreshAfterWrite: () => Promise<void>;
}

function fail(e: unknown) {
  useApp.getState().toast("error", (e as Error).message);
}

export const useGoals = create<GoalsState>((set, get) => ({
  view: "tablero",
  area: "*",
  filter: "todas",
  meta: null,
  sidebar: null,
  areas: [],
  cards: [],
  loaded: false,
  openId: null,
  detail: null,
  tab: "resumen",
  subView: "lista",
  itemId: null,
  submetaId: null,
  editing: null,
  areaEditing: null,
  checklistFor: null,
  version: 0,

  setView: (view) => set({ view, openId: null, detail: null }),
  setArea: (area) => {
    set({ area, view: "tablero", openId: null, detail: null });
    void get().loadAll();
  },
  setFilter: (filter) => {
    set({ filter, view: "tablero", openId: null, detail: null });
    void get().loadAll();
  },

  loadAll: async () => {
    try {
      const [cards, sidebar, areas, meta] = await Promise.all([
        api.goalsList(get().filter, get().area), api.goalsSidebar(), api.areasList(),
        get().meta ? Promise.resolve(get().meta!) : api.goalsMeta()]);
      set((s) => ({ cards, sidebar, areas, meta, loaded: true, version: s.version + 1 }));
    } catch (e) {
      fail(e);
    }
  },

  open: async (gid) => {
    if (!gid) {
      set({ openId: null, detail: null, itemId: null, submetaId: null });
      void get().loadAll();
      return;
    }
    if (gid !== get().openId) set({ tab: "resumen", itemId: null, submetaId: null, detail: null });
    set({ openId: gid, view: "tablero" });
    await get().reload();
  },

  reload: async () => {
    const gid = get().openId;
    if (!gid) return;
    try {
      const detail = await api.goalsGet(gid);
      if (get().openId === gid) {
        const has = (id: string | null) => (id && detail.items.some((i) => i.id === id) ? id : null);
        set((s) => ({ detail, itemId: has(s.itemId), submetaId: has(s.submetaId), version: s.version + 1 }));
      }
    } catch (e) {
      set({ openId: null, detail: null });
      fail(e);
    }
  },

  refreshAfterWrite: async () => {
    await Promise.all([get().reload(), api.goalsSidebar().then((sidebar) => set({ sidebar })).catch(() => undefined)]);
    set((s) => ({ version: s.version + 1 }));
  },

  setTab: (tab) => set({ tab, submetaId: null }),
  setSubView: (subView) => set({ subView, submetaId: null }),
  openItem: (itemId) => set({ itemId }),
  openSubmeta: (submetaId) => set({ submetaId, tab: "submetas" }),
  setEditing: (editing) => set({ editing }),
  setAreaEditing: (areaEditing) => set({ areaEditing }),
  setChecklistFor: (checklistFor) => set({ checklistFor }),
}));

export function pct(v: number | null | undefined): string {
  return v === null || v === undefined ? "—" : `${Math.round(v * 100)} %`;
}
