// Proyectos state: the board of projects, the open project and its issue panel.

import { create } from "zustand";
import { api } from "../lib/bridge";
import type { Area, Issue, ProjectCard, ProjectDetail, ProjectsMeta } from "../lib/types";
import { useApp } from "./app";

export type ProjectTab = "resumen" | "hoy" | "submetas" | "tablero" | "lista" | "calendario" | "notas";

interface ProjectsState {
  cards: ProjectCard[];
  meta: ProjectsMeta | null;
  areas: Area[];
  loaded: boolean;
  openId: string | null;
  detail: ProjectDetail | null;
  tab: ProjectTab;
  issueId: string | null;
  /** The submeta whose own statistics page is open (Submetas tab). */
  submetaId: string | null;
  /** Dialogs: project editor ("" = new) and the create-issue form. */
  editing: string | null;
  creating: { status?: string; parent?: string; type?: string } | null;
  goalFilter: string;

  loadAll: () => Promise<void>;
  open: (pid: string | null) => Promise<void>;
  reload: () => Promise<void>;
  setTab: (t: ProjectTab) => void;
  openIssue: (xid: string | null) => void;
  openSubmeta: (xid: string | null) => void;
  setEditing: (pid: string | null) => void;
  setCreating: (c: ProjectsState["creating"]) => void;
  setGoalFilter: (id: string) => void;
  updateIssue: (xid: string, fields: Partial<Issue>) => Promise<boolean>;
  moveIssue: (xid: string, status: string, index: number) => Promise<void>;
}

function fail(e: unknown) {
  useApp.getState().toast("error", (e as Error).message);
}

export const useProjects = create<ProjectsState>((set, get) => ({
  cards: [],
  meta: null,
  areas: [],
  loaded: false,
  openId: null,
  detail: null,
  tab: "resumen",
  issueId: null,
  submetaId: null,
  editing: null,
  creating: null,
  goalFilter: "",

  loadAll: async () => {
    try {
      const [cards, meta, areas] = await Promise.all([
        api.projectsList(), get().meta ? Promise.resolve(get().meta!) : api.projectsMeta(), api.areasList()]);
      set({ cards, meta, areas, loaded: true });
    } catch (e) {
      fail(e);
    }
  },

  open: async (pid) => {
    if (!pid) {
      set({ openId: null, detail: null, issueId: null, submetaId: null });
      void get().loadAll();
      return;
    }
    if (pid !== get().openId) set({ tab: "resumen", issueId: null, submetaId: null, goalFilter: "", detail: null });
    set({ openId: pid });
    await get().reload();
  },

  reload: async () => {
    const pid = get().openId;
    if (!pid) return;
    try {
      const detail = await api.projectsGet(pid);
      if (get().openId === pid) {
        const issueId = get().issueId;
        set({ detail, issueId: issueId && detail.issues.some((i) => i.id === issueId) ? issueId : null });
      }
      void api.projectsList().then((cards) => set({ cards })).catch(() => undefined);
    } catch (e) {
      set({ openId: null, detail: null });
      fail(e);
    }
  },

  setTab: (tab) => set({ tab, submetaId: null }),
  openIssue: (issueId) => set({ issueId }),
  openSubmeta: (submetaId) => set({ submetaId, tab: "submetas" }),
  setEditing: (editing) => set({ editing }),
  setCreating: (creating) => set({ creating }),
  setGoalFilter: (goalFilter) => set({ goalFilter }),

  updateIssue: async (xid, fields) => {
    const pid = get().openId;
    const d = get().detail;
    if (!pid || !d) return false;
    set({ detail: { ...d, issues: d.issues.map((i) => (i.id === xid ? { ...i, ...fields } : i)) } });
    try {
      await api.issueUpdate(pid, xid, fields);
      await get().reload();
      return true;
    } catch (e) {
      set({ detail: d });
      fail(e);
      return false;
    }
  },

  moveIssue: async (xid, status, index) => {
    const pid = get().openId;
    const d = get().detail;
    if (!pid || !d) return;
    const done = d.project.done_column === status;
    set({ detail: { ...d, issues: d.issues.map((i) => (i.id === xid ? { ...i, status, done } : i)) } });
    try {
      await api.issueMove(pid, xid, status, index);
      await get().reload();
    } catch (e) {
      set({ detail: d });
      fail(e);
    }
  },
}));

export function issueById(d: ProjectDetail | null, id: string): Issue | undefined {
  return d?.issues.find((i) => i.id === id);
}

export function descendants(d: ProjectDetail, id: string): Set<string> {
  const out = new Set<string>();
  const stack = [...(issueById(d, id)?.children ?? [])];
  while (stack.length) {
    const cur = stack.pop()!;
    if (out.has(cur)) continue;
    out.add(cur);
    stack.push(...(issueById(d, cur)?.children ?? []));
  }
  return out;
}
